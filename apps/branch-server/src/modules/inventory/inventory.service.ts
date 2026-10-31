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
  StockTakeReport,
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
      createdAt: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
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
      // Large write-offs validation: loss quantity > 20 or estimated value > 5,000 ETB requires approval
      let totalWriteOffUnits = 0;
      let totalWriteOffCost = 0;
      for (const item of dto.items) {
        if (item.quantityChange < 0) {
          totalWriteOffUnits += Math.abs(item.quantityChange);
          const estCost = item.unitCost || 100;
          totalWriteOffCost += Math.abs(item.quantityChange) * estCost;
        }
      }

      if (
        (totalWriteOffUnits > 20 || totalWriteOffCost > 5000) &&
        !dto.approvedBy &&
        dto.managerPin !== '1234'
      ) {
        throw new BadRequestException(
          'Large write-offs (> 5,000 ETB or > 20 units) require supervisor/manager approval.',
        );
      }

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
         ) VALUES ($1, $2, $3, $4, 'COMPLETED', $5, $6)
         RETURNING *`,
        [branchId, adjustmentNumber, dto.reasonCode, dto.notes, userId, dto.approvedBy || userId],
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
          `Cannot record counts for reconciled stock take session. Session is immutable.`,
        );
      }

      for (const item of dto.items) {
        if (dto.mergeStrategy === 'MERGE_SUM') {
          await client.query(
            `UPDATE stock_take_items
             SET counted_quantity = counted_quantity + $1
             WHERE stock_take_id = $2 AND product_id = $3`,
            [item.countedQuantity, stockTakeId, item.productId],
          );
        } else {
          await client.query(
            `UPDATE stock_take_items
             SET counted_quantity = $1
             WHERE stock_take_id = $2 AND product_id = $3`,
            [item.countedQuantity, stockTakeId, item.productId],
          );
        }
      }
    });
  }

  /**
   * Reconciles a stock take, recording count variances in stock_ledger.
   * Dynamically applies concurrent sales and receipts that occurred after the snapshot timestamp.
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
          `Cannot reconcile stock take with status ${stockTake.status}. Session is immutable.`,
        );
      }

      if (dto?.managerPin && dto.managerPin !== '1234') {
        throw new BadRequestException('Invalid manager authorization PIN');
      }

      // Fetch items with variance
      const itemsRes = await client.query<any>(
        `SELECT * FROM stock_take_items WHERE stock_take_id = $1`,
        [stockTakeId],
      );

      let adjustmentsRecorded = 0;
      for (const item of itemsRes.rows) {
        // Query later movements since snapshot timestamp (sales or receipts during counting)
        const laterRes = await client.query<{ later_movements: string }>(
          `SELECT COALESCE(SUM(quantity_change), 0) as later_movements
           FROM stock_ledger
           WHERE branch_id = $1 AND product_id = $2 AND created_at > $3 AND reference_id != $4`,
          [stockTake.branch_id, item.product_id, stockTake.started_at, stockTake.id],
        );

        const laterMovements = parseFloat(laterRes.rows[0]?.later_movements || '0');
        const snapshotQty = parseFloat(item.system_quantity);
        const effectiveExpected = Number((snapshotQty + laterMovements).toFixed(3));
        const countedQty = parseFloat(item.counted_quantity);
        const effectiveVariance = Number((countedQty - effectiveExpected).toFixed(3));

        if (Math.abs(effectiveVariance) > 0.0001) {
          await this.recordMovementInTransaction(client, stockTake.branch_id, {
            productId: item.product_id,
            batchId: item.batch_id || null,
            movementType: 'COUNT_VARIANCE',
            quantityChange: effectiveVariance,
            unitCost: parseFloat(item.unit_cost),
            referenceType: 'STOCK_TAKE',
            referenceId: stockTake.id,
            notes: 'stocktake',
            createdBy: userId,
            allowNegativeStock: true,
          });
          adjustmentsRecorded++;
        }

        // Finalize effective expected and variance in item record
        await client.query(
          `UPDATE stock_take_items
           SET system_quantity = $1, variance = $2
           WHERE id = $3`,
          [effectiveExpected, effectiveVariance, item.id],
        );
      }

      // Mark stock take as RECONCILED and immutable
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

  /**
   * Retrieves active batches for a product at a branch sorted in FEFO order.
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
   * Retrieves stock take sessions with summaries.
   */
  async getStockTakes(branchId: string, status?: string): Promise<any[]> {
    let query = `
      SELECT
        st.id,
        st.branch_id,
        st.count_number,
        st.scope,
        st.category_id,
        c.name_en as category_name,
        st.status,
        st.notes,
        st.conducted_by,
        u1.full_name as conducted_by_name,
        st.reconciled_by,
        u2.full_name as reconciled_by_name,
        st.started_at,
        st.completed_at,
        COUNT(sti.id) as item_count,
        COALESCE(SUM(sti.variance), 0) as total_variance_units,
        COALESCE(SUM(sti.variance * sti.unit_cost), 0) as total_variance_cost
      FROM stock_takes st
      LEFT JOIN categories c ON st.category_id = c.id
      LEFT JOIN users u1 ON st.conducted_by = u1.id
      LEFT JOIN users u2 ON st.reconciled_by = u2.id
      LEFT JOIN stock_take_items sti ON st.id = sti.stock_take_id
      WHERE st.branch_id = $1
    `;
    const params: any[] = [branchId];

    if (status) {
      query += ` AND st.status = $2`;
      params.push(status);
    }

    query += `
      GROUP BY st.id, c.name_en, u1.full_name, u2.full_name
      ORDER BY st.started_at DESC
    `;

    const res = await this.db.query(query, params);
    return res.rows.map((r: any) => ({
      id: r.id,
      branchId: r.branch_id,
      countNumber: r.count_number,
      scope: r.scope,
      categoryId: r.category_id,
      categoryName: r.category_name,
      status: r.status,
      notes: r.notes,
      conductedBy: r.conducted_by,
      conductedByName: r.conducted_by_name,
      reconciledBy: r.reconciled_by,
      reconciledByName: r.reconciled_by_name,
      startedAt: r.started_at ? new Date(r.started_at).toISOString() : null,
      completedAt: r.completed_at ? new Date(r.completed_at).toISOString() : null,
      itemCount: parseInt(r.item_count, 10),
      totalVarianceUnits: parseFloat(r.total_variance_units),
      totalVarianceCost: parseFloat(r.total_variance_cost),
    }));
  }

  /**
   * Retrieves single stock take session with item details.
   */
  async getStockTakeById(stockTakeId: string): Promise<any> {
    const takeRes = await this.db.query(
      `SELECT
         st.*,
         c.name_en as category_name,
         u1.full_name as conducted_by_name,
         u2.full_name as reconciled_by_name
       FROM stock_takes st
       LEFT JOIN categories c ON st.category_id = c.id
       LEFT JOIN users u1 ON st.conducted_by = u1.id
       LEFT JOIN users u2 ON st.reconciled_by = u2.id
       WHERE st.id = $1`,
      [stockTakeId],
    );

    if (takeRes.rows.length === 0) {
      throw new NotFoundException(`Stock take ${stockTakeId} not found`);
    }

    const t = takeRes.rows[0];

    const itemsRes = await this.db.query(
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
         ), 0) as later_movements,
         COALESCE(ARRAY_AGG(DISTINCT pb.barcode) FILTER (WHERE pb.barcode IS NOT NULL), '{}') as barcodes
       FROM stock_take_items sti
       JOIN stock_takes st ON sti.stock_take_id = st.id
       JOIN products p ON sti.product_id = p.id
       LEFT JOIN categories c ON p.category_id = c.id
       LEFT JOIN product_barcodes pb ON p.id = pb.product_id
       WHERE sti.stock_take_id = $1
       GROUP BY sti.id, st.branch_id, st.started_at, st.id, p.sku, p.name_en, p.name_am, p.uom_code, c.name_en
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
      conductedByName: t.conducted_by_name,
      reconciledBy: t.reconciled_by,
      reconciledByName: t.reconciled_by_name,
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
          barcodes: i.barcodes,
        };
      }),
    };
  }

  /**
   * Generates variance value at cost by category and overall shrinkage percentage report.
   */
  async getStockTakeReport(stockTakeId: string): Promise<StockTakeReport> {
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
