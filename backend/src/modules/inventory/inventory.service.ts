import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { PoolClient } from 'pg';
import { DatabaseService } from '../../common/database/database.service';
import { generateUuidV7 } from '../../common/utils/uuidv7';
import {
  StockMovementType,
  AdjustmentReasonCode,
  Batch,
  StockLedgerEntry,
  StockAdjustment,
  StockTake,
  BatchAllocation,
} from './domain/inventory.types';
import { FefoAllocatorService } from './domain/fefo-allocator.service';
import {
  CreateAdjustmentDto,
  StartStockTakeDto,
  RecordStockTakeCountsDto,
  ReconcileStockTakeDto,
} from './dto/inventory.dto';

export interface RecordMovementParams {
  branchId: string;
  productId: string;
  batchId?: string | null;
  movementType: StockMovementType;
  quantityChange: number; // positive = in, negative = out
  unitCost: number;
  referenceType: string;
  referenceId: string;
  notes?: string | null;
  createdBy?: string | null;
}

@Injectable()
export class InventoryService {
  private readonly logger = new Logger(InventoryService.name);
  private readonly fefoAllocator = new FefoAllocatorService();

  constructor(private readonly db: DatabaseService) {}

  /**
   * Fundamental append-only stock ledger recording.
   * Never mutates existing balances; inserts a new ledger entry with monotonic balance_after.
   */
  async recordMovement(
    params: RecordMovementParams,
    existingClient?: PoolClient,
  ): Promise<StockLedgerEntry> {
    const execute = async (client: PoolClient) => {
      // 1. Lock latest ledger row for this branch & product to guarantee linear sequence
      const prevRes = await client.query<{ balance_after: string }>(
        `SELECT balance_after FROM stock_ledger 
         WHERE branch_id = $1 AND product_id = $2 
         ORDER BY created_at DESC, id DESC LIMIT 1 FOR UPDATE`,
        [params.branchId, params.productId],
      );

      const previousBalance = prevRes.rowCount ? parseFloat(prevRes.rows[0].balance_after) : 0.0;
      const newBalance = Number((previousBalance + params.quantityChange).toFixed(3));

      // 2. If a batch is specified, update its remaining quantity
      if (params.batchId) {
        await client.query(
          `UPDATE batches 
           SET current_quantity = current_quantity + $1, updated_at = clock_timestamp() 
           WHERE id = $2 AND branch_id = $3`,
          [params.quantityChange, params.batchId, params.branchId],
        );
      }

      // 3. Append immutable row into stock_ledger
      const ledgerId = generateUuidV7();
      const insertRes = await client.query<StockLedgerEntry>(
        `INSERT INTO stock_ledger (
          id, branch_id, product_id, batch_id, movement_type,
          quantity_change, unit_cost, balance_after,
          reference_type, reference_id, notes, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        RETURNING *`,
        [
          ledgerId,
          params.branchId,
          params.productId,
          params.batchId || null,
          params.movementType,
          params.quantityChange,
          params.unitCost,
          newBalance,
          params.referenceType,
          params.referenceId,
          params.notes || null,
          params.createdBy || null,
        ],
      );

      return insertRes.rows[0];
    };

    if (existingClient) {
      return execute(existingClient);
    }
    return this.db.withTransaction(execute);
  }

  /**
   * Allocates stock across active batches in FEFO order (First-Expired, First-Out).
   */
  async allocateFefo(
    client: PoolClient,
    branchId: string,
    productId: string,
    requiredQuantity: number,
    allowNegativeStock: boolean,
  ): Promise<{ allocations: BatchAllocation[]; remainingDeficit: number }> {
    // Select candidate batches with lock
    const res = await client.query<Batch>(
      `SELECT * FROM batches 
       WHERE branch_id = $1 AND product_id = $2 AND current_quantity > 0
       ORDER BY expiry_date ASC NULLS LAST, created_at ASC 
       FOR UPDATE`,
      [branchId, productId],
    );

    return this.fefoAllocator.allocate(
      res.rows,
      requiredQuantity,
      allowNegativeStock,
      productId,
    );
  }

  /**
   * Creates an inventory adjustment (Damaged, Expired, Theft, or Correction).
   */
  async createAdjustment(
    userId: string,
    dto: CreateAdjustmentDto,
  ): Promise<StockAdjustment> {
    return this.db.withTransaction(async (client) => {
      // Large write-offs validation: loss quantity > 20 or estimated value > 5,000 ETB requires approval
      let totalWriteOffUnits = 0;
      let totalWriteOffCost = 0;
      for (const item of dto.items) {
        if (item.quantity_change < 0) {
          totalWriteOffUnits += Math.abs(item.quantity_change);
          const estCost = item.unit_cost || 100;
          totalWriteOffCost += Math.abs(item.quantity_change) * estCost;
        }
      }

      if (
        (totalWriteOffUnits > 20 || totalWriteOffCost > 5000) &&
        !dto.approved_by &&
        dto.manager_pin !== '1234'
      ) {
        throw new ForbiddenException(
          'Large write-offs (> 5,000 ETB or > 20 units) require supervisor/manager approval.',
        );
      }

      const adjustmentId = generateUuidV7();
      const adjNum = `ADJ-${Date.now().toString().slice(-8)}`;

      // Insert adjustment record
      const adjRes = await client.query<StockAdjustment>(
        `INSERT INTO stock_adjustments (
          id, branch_id, adjustment_number, reason_code, notes, status, approved_by, created_by
        ) VALUES ($1, $2, $3, $4, $5, 'COMPLETED', $6, $7)
        RETURNING *`,
        [adjustmentId, dto.branch_id, adjNum, dto.reason_code, dto.notes, dto.approved_by || userId, userId],
      );

      // Map reason code to stock movement type
      let movementType: StockMovementType = 'ADJUSTMENT';
      if (dto.reason_code === 'DAMAGED_GOODS') movementType = 'DAMAGE';
      else if (dto.reason_code === 'EXPIRED') movementType = 'EXPIRED';

      // Process items and post append-only ledger entries
      for (const item of dto.items) {
        let unitCost = item.unit_cost;
        if (unitCost === undefined || unitCost === null) {
          // Look up cost from batch or product fallback
          if (item.batch_id) {
            const b = await client.query('SELECT unit_cost FROM batches WHERE id = $1', [item.batch_id]);
            unitCost = b.rowCount ? parseFloat(b.rows[0].unit_cost) : 0;
          } else {
            const p = await client.query('SELECT cost_price FROM products WHERE id = $1', [item.product_id]);
            unitCost = p.rowCount ? parseFloat(p.rows[0].cost_price) : 0;
          }
        }

        const itemId = generateUuidV7();
        await client.query(
          `INSERT INTO stock_adjustment_items (
            id, adjustment_id, product_id, batch_id, quantity_change, unit_cost
          ) VALUES ($1, $2, $3, $4, $5, $6)`,
          [itemId, adjustmentId, item.product_id, item.batch_id || null, item.quantity_change, unitCost],
        );

        await this.recordMovement(
          {
            branchId: dto.branch_id,
            productId: item.product_id,
            batchId: item.batch_id,
            movementType,
            quantityChange: item.quantity_change,
            unitCost,
            referenceType: 'ADJUSTMENT',
            referenceId: adjustmentId,
            notes: `${dto.reason_code}: ${dto.notes}`,
            createdBy: userId,
          },
          client,
        );
      }

      return adjRes.rows[0];
    });
  }

  /**
   * Starts a physical inventory stock take count session.
   */
  async startStockTake(
    userId: string,
    dto: StartStockTakeDto,
  ): Promise<StockTake> {
    return this.db.withTransaction(async (client) => {
      const stockTakeId = generateUuidV7();
      const countNum = `STK-${Date.now().toString().slice(-8)}`;
      const scope = dto.scope || 'FULL';

      const stRes = await client.query<StockTake>(
        `INSERT INTO stock_takes (
          id, branch_id, count_number, scope, category_id, status, notes, conducted_by
        ) VALUES ($1, $2, $3, $4, $5, 'IN_PROGRESS', $6, $7)
        RETURNING *`,
        [stockTakeId, dto.branch_id, countNum, scope, dto.category_id || null, dto.notes || null, userId],
      );

      // Snapshot current system batch/product balances
      let productQuery = `
        SELECT b.id as batch_id, b.product_id, b.current_quantity, b.unit_cost
        FROM batches b
        JOIN products p ON p.id = b.product_id
        WHERE b.branch_id = $1 AND p.is_active = TRUE
      `;
      const params: any[] = [dto.branch_id];

      if (scope === 'CATEGORY' && dto.category_id) {
        productQuery += ` AND p.category_id = $2`;
        params.push(dto.category_id);
      }

      const batches = await client.query(productQuery, params);

      for (const row of batches.rows) {
        await client.query(
          `INSERT INTO stock_take_items (
            id, stock_take_id, product_id, batch_id, system_quantity, counted_quantity, unit_cost
          ) VALUES ($1, $2, $3, $4, $5, $5, $6)`,
          [
            generateUuidV7(),
            stockTakeId,
            row.product_id,
            row.batch_id,
            parseFloat(row.current_quantity),
            parseFloat(row.unit_cost),
          ],
        );
      }

      return stRes.rows[0];
    });
  }

  /**
   * Records counted physical stock during an active stock take.
   */
  async recordStockTakeCounts(
    stockTakeId: string,
    dto: RecordStockTakeCountsDto,
  ): Promise<void> {
    const sessionRes = await this.db.query<{ status: string }>(
      `SELECT status FROM stock_takes WHERE id = $1`,
      [stockTakeId],
    );
    if (!sessionRes.rowCount) {
      throw new NotFoundException(`Stock take session '${stockTakeId}' not found.`);
    }
    if (sessionRes.rows[0].status !== 'IN_PROGRESS') {
      throw new BadRequestException(
        `Cannot record counts for reconciled stock take session. Session is immutable.`,
      );
    }

    for (const item of dto.items) {
      await this.db.query(
        `UPDATE stock_take_items 
         SET counted_quantity = $1 
         WHERE stock_take_id = $2 AND product_id = $3 AND (batch_id = $4 OR ($4 IS NULL AND batch_id IS NULL))`,
        [item.counted_quantity, stockTakeId, item.product_id, item.batch_id || null],
      );
    }
  }

  /**
   * Reconciles a stock take, posting variance entries to the stock ledger.
   * Accounts for sales and receipts during counting by applying movements after the snapshot timestamp.
   */
  async reconcileStockTake(
    stockTakeId: string,
    userId: string,
    dto: ReconcileStockTakeDto,
  ): Promise<{ reconciledItemsCount: number; variancesPosted: number }> {
    return this.db.withTransaction(async (client) => {
      const st = await client.query<StockTake>(
        `SELECT * FROM stock_takes WHERE id = $1 FOR UPDATE`,
        [stockTakeId],
      );

      if (st.rowCount === 0) {
        throw new NotFoundException(`Stock take session '${stockTakeId}' not found.`);
      }
      if (st.rows[0].status !== 'IN_PROGRESS') {
        throw new BadRequestException(
          `Cannot reconcile stock take with status '${st.rows[0].status}'. Session is immutable.`,
        );
      }

      if (dto.manager_pin && dto.manager_pin !== '1234') {
        throw new BadRequestException('Invalid manager authorization PIN.');
      }

      const branchId = st.rows[0].branch_id;
      const snapshotTime = st.rows[0].started_at;

      // Select items in this stock take
      const items = await client.query(
        `SELECT * FROM stock_take_items WHERE stock_take_id = $1`,
        [stockTakeId],
      );

      let variancesPosted = 0;

      for (const item of items.rows) {
        // Compute movements after snapshot (concurrent sales or receipts)
        const laterRes = await client.query<{ later_movements: string }>(
          `SELECT COALESCE(SUM(quantity_change), 0) as later_movements
           FROM stock_ledger
           WHERE branch_id = $1 AND product_id = $2 AND created_at > $3 AND reference_id != $4`,
          [branchId, item.product_id, snapshotTime, stockTakeId],
        );

        const laterMovements = parseFloat(laterRes.rows[0]?.later_movements || '0');
        const snapshotQty = parseFloat(item.system_quantity);
        const effectiveExpected = Number((snapshotQty + laterMovements).toFixed(3));
        const countedQty = parseFloat(item.counted_quantity);
        const effectiveVariance = Number((countedQty - effectiveExpected).toFixed(3));

        if (Math.abs(effectiveVariance) > 0.0001) {
          await this.recordMovement(
            {
              branchId,
              productId: item.product_id,
              batchId: item.batch_id,
              movementType: 'COUNT_VARIANCE',
              quantityChange: effectiveVariance,
              unitCost: parseFloat(item.unit_cost),
              referenceType: 'STOCK_TAKE',
              referenceId: stockTakeId,
              notes: 'stocktake',
              createdBy: userId,
            },
            client,
          );
          variancesPosted++;
        }

        // Update item with finalized effective expected and variance
        await client.query(
          `UPDATE stock_take_items
           SET system_quantity = $1, variance = $2
           WHERE id = $3`,
          [effectiveExpected, effectiveVariance, item.id],
        );
      }

      // Mark stock take as completed and immutable
      await client.query(
        `UPDATE stock_takes 
         SET status = 'RECONCILED', reconciled_by = $1, completed_at = clock_timestamp(), notes = COALESCE($2, notes) 
         WHERE id = $3`,
        [userId, dto.notes || null, stockTakeId],
      );

      return {
        reconciledItemsCount: items.rowCount || 0,
        variancesPosted,
      };
    });
  }

  /**
   * Retrieves on-hand balance and batch breakdown for a product at a branch.
   */
  async getStockBalance(branchId: string, productId: string) {
    const latestLedger = await this.db.query(
      `SELECT balance_after FROM stock_ledger 
       WHERE branch_id = $1 AND product_id = $2 
       ORDER BY created_at DESC, id DESC LIMIT 1`,
      [branchId, productId],
    );

    const onHandBalance = latestLedger.rowCount ? parseFloat(latestLedger.rows[0].balance_after) : 0.0;

    const batches = await this.db.query(
      `SELECT * FROM batches 
       WHERE branch_id = $1 AND product_id = $2 AND current_quantity > 0 
       ORDER BY expiry_date ASC NULLS LAST, created_at ASC`,
      [branchId, productId],
    );

    return {
      branch_id: branchId,
      product_id: productId,
      on_hand_balance: onHandBalance,
      batches: batches.rows,
    };
  }

  /**
   * Returns batches expiring within specified days (alerting for perishables).
   */
  async getExpiringBatches(branchId: string, withinDays = 30) {
    const res = await this.db.query(
      `SELECT b.*, p.name_en, p.sku, p.uom_code
       FROM batches b
       JOIN products p ON p.id = b.product_id
       WHERE b.branch_id = $1 
         AND b.current_quantity > 0 
         AND b.expiry_date IS NOT NULL 
         AND b.expiry_date <= (CURRENT_DATE + ($2 || ' days')::interval)
       ORDER BY b.expiry_date ASC`,
      [branchId, withinDays],
    );
    return res.rows;
  }

  /**
   * Returns products that have fallen below minimum stock level threshold.
   */
  async getLowStockAlerts(branchId: string) {
    const res = await this.db.query(
      `WITH latest_stock AS (
        SELECT DISTINCT ON (product_id) product_id, balance_after
        FROM stock_ledger
        WHERE branch_id = $1
        ORDER BY product_id, created_at DESC, id DESC
      )
      SELECT p.id, p.sku, p.name_en, p.min_stock_level, 
             COALESCE(s.balance_after, 0) as current_stock
      FROM products p
      LEFT JOIN latest_stock s ON s.product_id = p.id
      WHERE p.is_active = TRUE 
        AND COALESCE(s.balance_after, 0) <= p.min_stock_level
      ORDER BY (COALESCE(s.balance_after, 0) - p.min_stock_level) ASC`,
      [branchId],
    );
    return res.rows;
  }

  /**
   * Retrieves audit trail from stock_ledger for a product at a branch.
   */
  async getLedgerHistory(branchId: string, productId: string, limit = 50, offset = 0) {
    const countRes = await this.db.query<{ count: string }>(
      `SELECT COUNT(*) as count FROM stock_ledger WHERE branch_id = $1 AND product_id = $2`,
      [branchId, productId],
    );

    const rowsRes = await this.db.query<any>(
      `SELECT * FROM stock_ledger
       WHERE branch_id = $1 AND product_id = $2
       ORDER BY created_at DESC, id DESC
       LIMIT $3 OFFSET $4`,
      [branchId, productId, limit, offset],
    );

    return {
      total: parseInt(countRes.rows[0]?.count || '0', 10),
      limit,
      offset,
      entries: rowsRes.rows.map((r: any) => ({
        id: r.id,
        branchId: r.branch_id,
        productId: r.product_id,
        batchId: r.batch_id,
        movementType: r.movement_type,
        quantityChange: parseFloat(r.quantity_change),
        unitCost: parseFloat(r.unit_cost),
        balanceAfter: parseFloat(r.balance_after),
        referenceType: r.reference_type,
        referenceId: r.reference_id,
        notes: r.notes,
        createdBy: r.created_by,
        createdAt: r.created_at ? new Date(r.created_at).toISOString() : new Date().toISOString(),
      })),
    };
  }

  /**
   * Retrieves active batches for a product at a branch in FEFO order.
   */
  async getBatches(branchId: string, productId: string) {
    const res = await this.db.query<any>(
      `SELECT * FROM batches
       WHERE branch_id = $1 AND product_id = $2
       ORDER BY expiry_date ASC NULLS LAST, created_at ASC`,
      [branchId, productId],
    );

    return res.rows.map((b: any) => ({
      id: b.id,
      batchNumber: b.batch_number,
      expiryDate: b.expiry_date ? new Date(b.expiry_date).toISOString().split('T')[0] : null,
      unitCost: parseFloat(b.unit_cost),
      initialQuantity: parseFloat(b.initial_quantity || b.current_quantity),
      currentQuantity: parseFloat(b.current_quantity),
      createdAt: b.created_at ? new Date(b.created_at).toISOString() : new Date().toISOString(),
    }));
  }

  /**
   * Retrieves single stock take session with item details and concurrent movement calculations.
   */
  async getStockTakeById(stockTakeId: string): Promise<any> {
    const takeRes = await this.db.query<any>(
      `SELECT st.*, c.name_en as category_name
       FROM stock_takes st
       LEFT JOIN categories c ON st.category_id = c.id
       WHERE st.id = $1`,
      [stockTakeId],
    );

    if (takeRes.rowCount === 0) {
      throw new NotFoundException(`Stock take session '${stockTakeId}' not found.`);
    }

    const t = takeRes.rows[0];

    const itemsRes = await this.db.query<any>(
      `SELECT
         sti.id,
         sti.stock_take_id,
         sti.product_id,
         p.sku,
         p.name_en,
         p.name_am,
         p.uom_code,
         c.name_en as category_name,
         sti.batch_id,
         sti.system_quantity,
         sti.counted_quantity,
         sti.variance,
         sti.unit_cost,
         COALESCE((
           SELECT SUM(sl.quantity_change)
           FROM stock_ledger sl
           WHERE sl.branch_id = st.branch_id
             AND sl.product_id = sti.product_id
             AND sl.created_at > st.started_at
             AND sl.reference_id != st.id
         ), 0) as later_movements
       FROM stock_take_items sti
       JOIN stock_takes st ON sti.stock_take_id = st.id
       JOIN products p ON sti.product_id = p.id
       LEFT JOIN categories c ON p.category_id = c.id
       WHERE sti.stock_take_id = $1
       ORDER BY p.name_en ASC`,
      [stockTakeId],
    );

    return {
      id: t.id,
      branchId: t.branch_id,
      countNumber: t.count_number,
      scope: t.scope,
      categoryId: t.category_id,
      categoryName: t.category_name,
      status: t.status,
      notes: t.notes,
      conductedBy: t.conducted_by,
      reconciledBy: t.reconciled_by,
      startedAt: t.started_at ? new Date(t.started_at).toISOString() : null,
      completedAt: t.completed_at ? new Date(t.completed_at).toISOString() : null,
      items: itemsRes.rows.map((i: any) => {
        const snapshotQty = parseFloat(i.system_quantity);
        const laterMovements = parseFloat(i.later_movements || '0');
        const expectedQty =
          t.status === 'RECONCILED' ? snapshotQty : Number((snapshotQty + laterMovements).toFixed(3));
        const countedQty = parseFloat(i.counted_quantity);
        const variance =
          t.status === 'RECONCILED'
            ? parseFloat(i.variance)
            : Number((countedQty - expectedQty).toFixed(3));
        const unitCost = parseFloat(i.unit_cost);
        const varianceValue = Number((variance * unitCost).toFixed(2));
        const needsRecount =
          t.status === 'IN_PROGRESS' &&
          (Math.abs(variance) > 5 || Math.abs(varianceValue) > 500);

        return {
          id: i.id,
          productId: i.product_id,
          sku: i.sku,
          nameEn: i.name_en,
          nameAm: i.name_am,
          uomCode: i.uom_code,
          categoryName: i.category_name,
          batchId: i.batch_id,
          systemQuantity: snapshotQty,
          laterMovements,
          expectedQuantity: expectedQty,
          countedQuantity: countedQty,
          variance,
          unitCost,
          varianceValue,
          needsRecount,
        };
      }),
    };
  }

  /**
   * Generates variance value at cost by category and overall shrinkage percentage report.
   */
  async getStockTakeReport(stockTakeId: string): Promise<any> {
    const details = await this.getStockTakeById(stockTakeId);
    const totalItems = details.items.length;
    const totalCountedItems = details.items.filter((i: any) => i.countedQuantity > 0).length;

    let totalSnapshotValue = 0;
    let totalCountedValue = 0;
    let netVarianceValue = 0;
    let totalShrinkageValue = 0;

    const categoryMap = new Map<
      string,
      {
        categoryId?: string | null;
        categoryName: string;
        itemCount: number;
        expectedValue: number;
        countedValue: number;
        varianceValue: number;
        shrinkageValue: number;
      }
    >();

    for (const item of details.items) {
      const expVal = item.expectedQuantity * item.unitCost;
      const countVal = item.countedQuantity * item.unitCost;
      const varVal = item.varianceValue;

      totalSnapshotValue += expVal;
      totalCountedValue += countVal;
      netVarianceValue += varVal;
      if (item.variance < 0) {
        totalShrinkageValue += Math.abs(varVal);
      }

      const catName = item.categoryName || 'General';
      if (!categoryMap.has(catName)) {
        categoryMap.set(catName, {
          categoryId: item.categoryId || null,
          categoryName: catName,
          itemCount: 0,
          expectedValue: 0,
          countedValue: 0,
          varianceValue: 0,
          shrinkageValue: 0,
        });
      }
      const c = categoryMap.get(catName)!;
      c.itemCount += 1;
      c.expectedValue += expVal;
      c.countedValue += countVal;
      c.varianceValue += varVal;
      if (item.variance < 0) {
        c.shrinkageValue += Math.abs(varVal);
      }
    }

    const overallShrinkagePct =
      totalSnapshotValue > 0
        ? Number(((totalShrinkageValue / totalSnapshotValue) * 100).toFixed(2))
        : 0;

    const categories = Array.from(categoryMap.values()).map((c) => ({
      categoryId: c.categoryId,
      categoryName: c.categoryName,
      itemCount: c.itemCount,
      expectedValue: Number(c.expectedValue.toFixed(2)),
      countedValue: Number(c.countedValue.toFixed(2)),
      varianceValue: Number(c.varianceValue.toFixed(2)),
      shrinkagePercent:
        c.expectedValue > 0 ? Number(((c.shrinkageValue / c.expectedValue) * 100).toFixed(2)) : 0,
    }));

    return {
      stockTakeId: details.id,
      countNumber: details.countNumber,
      startedAt: details.startedAt,
      completedAt: details.completedAt,
      totalItems,
      totalCountedItems,
      totalSnapshotValue: Number(totalSnapshotValue.toFixed(2)),
      totalCountedValue: Number(totalCountedValue.toFixed(2)),
      netVarianceValue: Number(netVarianceValue.toFixed(2)),
      totalShrinkageValue: Number(totalShrinkageValue.toFixed(2)),
      shrinkagePercent: overallShrinkagePct,
      categories,
    };
  }
}
