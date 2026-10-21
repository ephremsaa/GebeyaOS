import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { PoolClient } from 'pg';
import { DatabaseService } from '../../common/database/database.service';
import {
  StockMovementType,
  StockReferenceType,
  StockAdjustmentReasonCode,
  StockTakeScope,
  StockLedgerEntry,
  StockAdjustment,
  StockTake,
  FEFOBatchCandidate,
  FEFOAllocationResult,
  allocateFEFO,
} from '@gebeyaos/shared-types';
import {
  CreateStockAdjustmentDto,
  CreateStockTakeDto,
  RecordStockTakeCountDto,
  ReconcileStockTakeDto,
  CreateBatchDto,
} from './inventory.dto';

export interface RecordMovementParams {
  productId: string;
  batchId?: string | null;
  movementType: StockMovementType;
  quantityChange: number;
  unitCost?: number;
  referenceType: StockReferenceType;
  referenceId: string;
  notes?: string | null;
  createdBy?: string | null;
  allowNegativeStock?: boolean;
}

@Injectable()
export class InventoryService {
  private readonly logger = new Logger(InventoryService.name);

  constructor(private readonly db: DatabaseService) {}

  /**
   * Records an append-only stock movement in the ledger.
   * Acquires a transactional advisory lock for the (branch, product) pair
   * to guarantee zero race conditions and strict balance serialization.
   */
  async recordMovementInTransaction(
    client: PoolClient,
    branchId: string,
    params: RecordMovementParams,
  ): Promise<StockLedgerEntry> {
    const {
      productId,
      batchId = null,
      movementType,
      quantityChange,
      referenceType,
      referenceId,
      notes = null,
      createdBy = null,
      allowNegativeStock = false,
    } = params;

    // 1. Transactional advisory lock on branch + product hash to serialize concurrent ledger entries
    await client.query(
      `SELECT pg_advisory_xact_lock(hashtext($1 || ':' || $2))`,
      [branchId, productId],
    );

    // 2. Fetch latest balance_after
    const balanceRes = await client.query<{ balance_after: string }>(
      `SELECT balance_after
       FROM stock_ledger
       WHERE branch_id = $1 AND product_id = $2
       ORDER BY created_at DESC, id DESC
       LIMIT 1`,
      [branchId, productId],
    );

    const prevBalance = balanceRes.rows.length > 0
      ? parseFloat(balanceRes.rows[0].balance_after)
      : 0;

    const round3 = (val: number) =>
      Math.round((val + Number.EPSILON) * 1000) / 1000;

    const newBalance = round3(prevBalance + quantityChange);

    // 3. Negative stock validation
    if (newBalance < 0 && !allowNegativeStock) {
      throw new BadRequestException(
        `INSUFFICIENT_STOCK: Stock cannot be negative for product ${productId}. Current balance: ${prevBalance}, Requested change: ${quantityChange}`,
      );
    }

    // 4. Resolve unit cost if not provided
    let cost = params.unitCost;
    if (cost === undefined || cost === null || cost < 0) {
      const prodRes = await client.query<{ cost_price: string }>(
        `SELECT cost_price FROM products WHERE id = $1`,
        [productId],
      );
      cost = prodRes.rows.length > 0 ? parseFloat(prodRes.rows[0].cost_price) : 0;
    }

    // 5. Update batch balance if batchId is provided
    if (batchId) {
      const batchRes = await client.query<{ current_quantity: string }>(
        `UPDATE batches
         SET current_quantity = current_quantity + $1, updated_at = clock_timestamp()
         WHERE id = $2 AND branch_id = $3
         RETURNING current_quantity`,
        [quantityChange, batchId, branchId],
      );

      if (batchRes.rows.length === 0) {
        throw new NotFoundException(
          `Batch ${batchId} not found in branch ${branchId}`,
        );
      }
    }

    // 6. Insert append-only row into stock_ledger
    const insertRes = await client.query<any>(
      `INSERT INTO stock_ledger (
         branch_id, product_id, batch_id, movement_type,
         quantity_change, unit_cost, balance_after,
         reference_type, reference_id, notes, created_by
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *`,
      [
        branchId,
        productId,
        batchId,
        movementType,
        quantityChange,
        cost,
        newBalance,
        referenceType,
        referenceId,
        notes,
        createdBy,
      ],
    );

    const row = insertRes.rows[0];
    return {
      id: row.id,
      branchId: row.branch_id,
      productId: row.product_id,
      batchId: row.batch_id,
      movementType: row.movement_type,
      quantityChange: parseFloat(row.quantity_change),
      unitCost: parseFloat(row.unit_cost),
      balanceAfter: parseFloat(row.balance_after),
      referenceType: row.reference_type,
      referenceId: row.reference_id,
      notes: row.notes,
      createdBy: row.created_by,
      createdAt: row.created_at.toISOString(),
    };
  }

  /**
   * Standalone stock movement recording (wraps recordMovementInTransaction).
   */
  async recordMovement(
    branchId: string,
    params: RecordMovementParams,
  ): Promise<StockLedgerEntry> {
    return this.db.withTransaction(async (client) => {
      return this.recordMovementInTransaction(client, branchId, params);
    });
  }

  /**
   * Allocates batches for a sale using First-Expired, First-Out (FEFO).
   */
  async allocateBatchesForSale(
    branchId: string,
    productId: string,
    requestedQuantity: number,
    allowNegativeStock = false,
    client?: PoolClient,
  ): Promise<FEFOAllocationResult> {
    const queryFn = client
      ? (text: string, params: any[]) => client.query(text, params)
      : (text: string, params: any[]) => this.db.query(text, params);

    const res = await queryFn(
      `SELECT id, batch_number, expiry_date, unit_cost, current_quantity, created_at
       FROM batches
       WHERE branch_id = $1 AND product_id = $2 AND current_quantity > 0
       ORDER BY expiry_date ASC NULLS LAST, created_at ASC`,
      [branchId, productId],
    );

    const candidates: FEFOBatchCandidate[] = res.rows.map((row: any) => ({
      id: row.id,
      batchNumber: row.batch_number,
      expiryDate: row.expiry_date ? row.expiry_date.toISOString().split('T')[0] : null,
      unitCost: parseFloat(row.unit_cost),
      currentQuantity: parseFloat(row.current_quantity),
      createdAt: row.created_at.toISOString(),
    }));

    return allocateFEFO(candidates, requestedQuantity, {
      allowNegativeStock,
      deficitBatchStrategy: 'latest',
    });
  }

  /**
   * Creates a batch for an inventory item (e.g. from receiving or initial count).
   */
  async createBatch(branchId: string, dto: CreateBatchDto) {
    const res = await this.db.query(
      `INSERT INTO batches (
         branch_id, product_id, batch_number, expiry_date, unit_cost, initial_quantity, current_quantity, supplier_id
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        branchId,
        dto.productId,
        dto.batchNumber,
        dto.expiryDate || null,
        dto.unitCost,
        dto.initialQuantity,
        dto.initialQuantity,
        dto.supplierId || null,
      ],
    );

    const row = res.rows[0];
    return {
      id: row.id,
      branchId: row.branch_id,
      productId: row.product_id,
      batchNumber: row.batch_number,
      expiryDate: row.expiry_date ? row.expiry_date.toISOString().split('T')[0] : null,
      unitCost: parseFloat(row.unit_cost),
      initialQuantity: parseFloat(row.initial_quantity),
      currentQuantity: parseFloat(row.current_quantity),
      supplierId: row.supplier_id,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  }

  /**
   * Creates a stock adjustment / write-off with mandatory reason code.
   */
  async createAdjustment(
    branchId: string,
    userId: string,
    dto: CreateStockAdjustmentDto,
  ): Promise<StockAdjustment> {
    return this.db.withTransaction(async (client) => {
      // 1. Generate adjustment number ADJ-YYYYMMDD-XXXX
      const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const countRes = await client.query<{ count: string }>(
        `SELECT COUNT(*) as count FROM stock_adjustments WHERE branch_id = $1 AND adjustment_number LIKE $2`,
        [branchId, `ADJ-${datePart}-%`],
      );
      const seq = (parseInt(countRes.rows[0].count, 10) + 1).toString().padStart(4, '0');
      const adjustmentNumber = `ADJ-${datePart}-${seq}`;

      // 2. Insert stock_adjustments record
      const adjRes = await client.query<any>(
        `INSERT INTO stock_adjustments (
           branch_id, adjustment_number, reason_code, notes, status, created_by, approved_by
         ) VALUES ($1, $2, $3, $4, 'COMPLETED', $5, $5)
         RETURNING *`,
        [branchId, adjustmentNumber, dto.reasonCode, dto.notes, userId],
      );
      const adjRow = adjRes.rows[0];

      // 3. Process each item and write to stock_ledger
      const items: any[] = [];
      for (const item of dto.items) {
        // Map reason code to movement type
        let movementType: StockMovementType = 'ADJUSTMENT';
        if (dto.reasonCode === 'DAMAGED_GOODS') movementType = 'DAMAGE';
        else if (dto.reasonCode === 'EXPIRED') movementType = 'EXPIRED';

        const itemRes = await client.query<any>(
          `INSERT INTO stock_adjustment_items (
             adjustment_id, product_id, batch_id, quantity_change, unit_cost
           ) VALUES ($1, $2, $3, $4, COALESCE($5, (SELECT cost_price FROM products WHERE id = $2)))
           RETURNING *`,
          [
            adjRow.id,
            item.productId,
            item.batchId || null,
            item.quantityChange,
            item.unitCost ?? null,
          ],
        );
        const itemRow = itemRes.rows[0];

        // Record ledger movement
        await this.recordMovementInTransaction(client, branchId, {
          productId: item.productId,
          batchId: item.batchId || null,
          movementType,
          quantityChange: item.quantityChange,
          unitCost: parseFloat(itemRow.unit_cost),
          referenceType: 'ADJUSTMENT',
          referenceId: adjRow.id,
          notes: `${dto.reasonCode}: ${dto.notes}`,
          createdBy: userId,
          allowNegativeStock: true, // Adjustments / corrections can adjust as authorized
        });

        items.push({
          id: itemRow.id,
          adjustmentId: itemRow.adjustment_id,
          productId: itemRow.product_id,
          batchId: itemRow.batch_id,
          quantityChange: parseFloat(itemRow.quantity_change),
          unitCost: parseFloat(itemRow.unit_cost),
          createdAt: itemRow.created_at.toISOString(),
        });
      }

      return {
        id: adjRow.id,
        branchId: adjRow.branch_id,
        adjustmentNumber: adjRow.adjustment_number,
        reasonCode: adjRow.reason_code,
        notes: adjRow.notes,
        status: adjRow.status,
        approvedBy: adjRow.approved_by,
        createdBy: adjRow.created_by,
        createdAt: adjRow.created_at.toISOString(),
        items,
      };
    });
  }

  /**
   * Initializes a physical stock take count.
   */
  async createStockTake(
    branchId: string,
    userId: string,
    dto: CreateStockTakeDto,
  ): Promise<StockTake> {
    return this.db.withTransaction(async (client) => {
      // 1. Generate count number ST-YYYYMMDD-XXXX
      const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const countRes = await client.query<{ count: string }>(
        `SELECT COUNT(*) as count FROM stock_takes WHERE branch_id = $1 AND count_number LIKE $2`,
        [branchId, `ST-${datePart}-%`],
      );
      const seq = (parseInt(countRes.rows[0].count, 10) + 1).toString().padStart(4, '0');
      const countNumber = `ST-${datePart}-${seq}`;

      // 2. Insert stock_takes header
      const takeRes = await client.query<any>(
        `INSERT INTO stock_takes (
           branch_id, count_number, scope, category_id, status, notes, conducted_by
         ) VALUES ($1, $2, $3, $4, 'IN_PROGRESS', $5, $6)
         RETURNING *`,
        [
          branchId,
          countNumber,
          dto.scope,
          dto.categoryId || null,
          dto.notes || null,
          userId,
        ],
      );
      const takeRow = takeRes.rows[0];

      // 3. Snapshot active products in scope
      let productFilter = `p.is_active = TRUE`;
      const queryParams: any[] = [branchId];
      if (dto.scope === 'CATEGORY' && dto.categoryId) {
        queryParams.push(dto.categoryId);
        productFilter += ` AND p.category_id = $2`;
      }

      const productsSnapshot = await client.query<any>(
        `WITH latest_ledger AS (
           SELECT DISTINCT ON (product_id) product_id, balance_after
           FROM stock_ledger
           WHERE branch_id = $1
           ORDER BY product_id, created_at DESC, id DESC
         )
         SELECT p.id as product_id, p.cost_price, COALESCE(l.balance_after, 0) as system_quantity
         FROM products p
         LEFT JOIN latest_ledger l ON p.id = l.product_id
         WHERE ${productFilter}`,
        queryParams,
      );

      const items: any[] = [];
      for (const prod of productsSnapshot.rows) {
        const itemRes = await client.query<any>(
          `INSERT INTO stock_take_items (
             stock_take_id, product_id, system_quantity, counted_quantity, unit_cost
           ) VALUES ($1, $2, $3, 0, $4)
           RETURNING *`,
          [
            takeRow.id,
            prod.product_id,
            parseFloat(prod.system_quantity),
            parseFloat(prod.cost_price),
          ],
        );
        const item = itemRes.rows[0];
        items.push({
          id: item.id,
          stockTakeId: item.stock_take_id,
          productId: item.product_id,
          batchId: item.batch_id,
          systemQuantity: parseFloat(item.system_quantity),
          countedQuantity: parseFloat(item.counted_quantity),
          variance: parseFloat(item.variance),
          unitCost: parseFloat(item.unit_cost),
          createdAt: item.created_at.toISOString(),
        });
      }

      return {
        id: takeRow.id,
        branchId: takeRow.branch_id,
        countNumber: takeRow.count_number,
        scope: takeRow.scope,
        categoryId: takeRow.category_id,
        status: takeRow.status,
        notes: takeRow.notes,
        conductedBy: takeRow.conducted_by,
        startedAt: takeRow.started_at.toISOString(),
        items,
      };
    });
  }

  /**
   * Records counted physical quantities for a stock take in progress.
   */
  async recordStockTakeCounts(
    stockTakeId: string,
    dto: RecordStockTakeCountDto,
  ): Promise<void> {
    await this.db.withTransaction(async (client) => {
      const takeRes = await client.query<{ status: string }>(
        `SELECT status FROM stock_takes WHERE id = $1`,
        [stockTakeId],
      );
      if (takeRes.rows.length === 0) {
        throw new NotFoundException(`Stock take ${stockTakeId} not found`);
      }
      if (takeRes.rows[0].status !== 'IN_PROGRESS') {
        throw new BadRequestException(
          `Cannot record counts for stock take with status ${takeRes.rows[0].status}`,
        );
      }

      for (const item of dto.items) {
        await client.query(
          `UPDATE stock_take_items
           SET counted_quantity = $1
           WHERE stock_take_id = $2 AND product_id = $3`,
          [item.countedQuantity, stockTakeId, item.productId],
        );
      }
    });
  }

  /**
   * Reconciles a stock take, recording count variances in stock_ledger.
   */
  async reconcileStockTake(
    stockTakeId: string,
    userId: string,
    dto?: ReconcileStockTakeDto,
  ): Promise<{ stockTakeId: string; status: string; adjustmentsRecorded: number }> {
    return this.db.withTransaction(async (client) => {
      const takeRes = await client.query<any>(
        `SELECT * FROM stock_takes WHERE id = $1 FOR UPDATE`,
        [stockTakeId],
      );
      if (takeRes.rows.length === 0) {
        throw new NotFoundException(`Stock take ${stockTakeId} not found`);
      }
      const stockTake = takeRes.rows[0];
      if (stockTake.status !== 'IN_PROGRESS') {
        throw new BadRequestException(
          `Cannot reconcile stock take with status ${stockTake.status}`,
        );
      }

      // Fetch items with variance
      const itemsRes = await client.query<any>(
        `SELECT * FROM stock_take_items WHERE stock_take_id = $1`,
        [stockTakeId],
      );

      let adjustmentsRecorded = 0;
      for (const item of itemsRes.rows) {
        const variance = parseFloat(item.variance);
        if (Math.abs(variance) > 0.0001) {
          await this.recordMovementInTransaction(client, stockTake.branch_id, {
            productId: item.product_id,
            batchId: item.batch_id || null,
            movementType: 'COUNT_VARIANCE',
            quantityChange: variance,
            unitCost: parseFloat(item.unit_cost),
            referenceType: 'STOCK_TAKE',
            referenceId: stockTake.id,
            notes: `Physical count variance reconciliation: counted ${item.counted_quantity}, system had ${item.system_quantity}`,
            createdBy: userId,
            allowNegativeStock: true,
          });
          adjustmentsRecorded++;
        }
      }

      // Mark stock take as RECONCILED
      await client.query(
        `UPDATE stock_takes
         SET status = 'RECONCILED',
             reconciled_by = $1,
             completed_at = clock_timestamp(),
             notes = COALESCE($2, notes)
         WHERE id = $3`,
        [userId, dto?.notes || null, stockTakeId],
      );

      return {
        stockTakeId,
        status: 'RECONCILED',
        adjustmentsRecorded,
      };
    });
  }

  /**
   * Returns current stock on hand and low stock alert status for a product at a branch.
   */
  async getStockOnHand(branchId: string, productId: string) {
    const prodRes = await this.db.query<any>(
      `SELECT p.id, p.sku, p.name_en, p.name_am, p.min_stock_level,
              COALESCE(bpo.min_stock_level, p.min_stock_level) as effective_min_stock
       FROM products p
       LEFT JOIN branch_product_overrides bpo ON p.id = bpo.product_id AND bpo.branch_id = $1
       WHERE p.id = $2`,
      [branchId, productId],
    );

    if (prodRes.rows.length === 0) {
      throw new NotFoundException(`Product ${productId} not found`);
    }

    const prod = prodRes.rows[0];

    const ledgerRes = await this.db.query<{ balance_after: string }>(
      `SELECT balance_after
       FROM stock_ledger
       WHERE branch_id = $1 AND product_id = $2
       ORDER BY created_at DESC, id DESC
       LIMIT 1`,
      [branchId, productId],
    );

    const onHand = ledgerRes.rows.length > 0 ? parseFloat(ledgerRes.rows[0].balance_after) : 0;
    const minStock = parseFloat(prod.effective_min_stock);

    const batchesRes = await this.db.query<any>(
      `SELECT * FROM batches
       WHERE branch_id = $1 AND product_id = $2
       ORDER BY expiry_date ASC NULLS LAST, created_at ASC`,
      [branchId, productId],
    );

    return {
      productId: prod.id,
      sku: prod.sku,
      nameEn: prod.name_en,
      nameAm: prod.name_am,
      onHandQuantity: onHand,
      minStockLevel: minStock,
      isLowStock: onHand <= minStock,
      batches: batchesRes.rows.map((b: any) => ({
        id: b.id,
        batchNumber: b.batch_number,
        expiryDate: b.expiry_date ? b.expiry_date.toISOString().split('T')[0] : null,
        unitCost: parseFloat(b.unit_cost),
        currentQuantity: parseFloat(b.current_quantity),
        createdAt: b.created_at.toISOString(),
      })),
    };
  }

  /**
   * Returns audit trail from stock_ledger for a product at a branch.
   */
  async getLedgerHistory(
    branchId: string,
    productId: string,
    limit = 50,
    offset = 0,
  ) {
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
      total: parseInt(countRes.rows[0].count, 10),
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
        createdAt: r.created_at.toISOString(),
      })),
    };
  }
}
