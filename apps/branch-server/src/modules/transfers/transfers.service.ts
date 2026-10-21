import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { DatabaseService } from '../../common/database/database.service';
import { InventoryService } from '../inventory/inventory.service';
import {
  calculateAVCO,
  Transfer,
  TransferItem,
  TransferStatus,
} from '@gebeyaos/shared-types';
import {
  CreateTransferDto,
  DispatchTransferDto,
  ReceiveTransferDto,
} from './transfers.dto';

@Injectable()
export class TransfersService {
  private readonly logger = new Logger(TransfersService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly inventoryService: InventoryService,
  ) {}

  /**
   * Requisitions a new inter-branch transfer.
   */
  async createTransfer(
    sourceBranchId: string,
    requestedBy: string,
    dto: CreateTransferDto,
  ): Promise<Transfer> {
    if (sourceBranchId === dto.destinationBranchId) {
      throw new BadRequestException(
        'Source branch and destination branch cannot be identical',
      );
    }

    return this.db.withTransaction(async (client) => {
      // 1. Verify destination branch exists
      const destRes = await client.query<{ id: string }>(
        `SELECT id FROM branches WHERE id = $1 AND is_active = TRUE`,
        [dto.destinationBranchId],
      );
      if (destRes.rows.length === 0) {
        throw new NotFoundException(
          `Destination branch ${dto.destinationBranchId} not found`,
        );
      }

      // 2. Generate transfer number: TRF-YYYYMMDD-XXXX
      const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const countRes = await client.query<{ count: string }>(
        `SELECT COUNT(*) as count FROM transfers WHERE source_branch_id = $1 AND transfer_number LIKE $2`,
        [sourceBranchId, `TRF-${datePart}-%`],
      );
      const seq = (parseInt(countRes.rows[0].count, 10) + 1).toString().padStart(4, '0');
      const transferNumber = `TRF-${datePart}-${seq}`;

      // 3. Insert transfers header
      const trfRes = await client.query<any>(
        `INSERT INTO transfers (
           transfer_number, source_branch_id, destination_branch_id,
           status, notes, requested_by
         ) VALUES ($1, $2, $3, 'REQUESTED', $4, $5)
         RETURNING *`,
        [
          transferNumber,
          sourceBranchId,
          dto.destinationBranchId,
          dto.notes || null,
          requestedBy,
        ],
      );
      const trfRow = trfRes.rows[0];

      // 4. Insert items
      const savedItems: TransferItem[] = [];
      for (const item of dto.items) {
        // Query product cost price
        const prodRes = await client.query<{ cost_price: string }>(
          `SELECT cost_price FROM products WHERE id = $1`,
          [item.productId],
        );
        if (prodRes.rows.length === 0) {
          throw new NotFoundException(`Product ${item.productId} not found`);
        }
        const unitCost = parseFloat(prodRes.rows[0].cost_price);

        const itemRes = await client.query<any>(
          `INSERT INTO transfer_items (
             transfer_id, product_id, batch_id, unit_cost, requested_quantity
           ) VALUES ($1, $2, $3, $4, $5)
           RETURNING *`,
          [
            trfRow.id,
            item.productId,
            item.batchId || null,
            unitCost,
            item.requestedQuantity,
          ],
        );
        const ir = itemRes.rows[0];
        savedItems.push({
          id: ir.id,
          transferId: ir.transfer_id,
          productId: ir.product_id,
          batchId: ir.batch_id,
          batchNumber: ir.batch_number,
          expiryDate: ir.expiry_date ? ir.expiry_date.toISOString().split('T')[0] : null,
          unitCost: parseFloat(ir.unit_cost),
          requestedQuantity: parseFloat(ir.requested_quantity),
          dispatchedQuantity: parseFloat(ir.dispatched_quantity),
          receivedQuantity: parseFloat(ir.received_quantity),
          discrepancyQuantity: parseFloat(ir.discrepancy_quantity),
          discrepancyReason: ir.discrepancy_reason,
        });
      }

      return {
        id: trfRow.id,
        transferNumber: trfRow.transfer_number,
        sourceBranchId: trfRow.source_branch_id,
        destinationBranchId: trfRow.destination_branch_id,
        status: trfRow.status,
        notes: trfRow.notes,
        requestedBy: trfRow.requested_by,
        createdAt: trfRow.created_at.toISOString(),
        updatedAt: trfRow.updated_at.toISOString(),
        items: savedItems,
      };
    });
  }

  /**
   * Approves a transfer request.
   */
  async approveTransfer(transferId: string, approvedBy: string): Promise<Transfer> {
    const res = await this.db.query<any>(
      `UPDATE transfers
       SET status = 'APPROVED', approved_by = $1, updated_at = clock_timestamp()
       WHERE id = $2 AND status = 'REQUESTED'
       RETURNING *`,
      [approvedBy, transferId],
    );

    if (res.rows.length === 0) {
      throw new BadRequestException(
        `Transfer ${transferId} cannot be approved (not found or not in REQUESTED status)`,
      );
    }

    return this.getTransfer(transferId);
  }

  /**
   * Dispatches transfer from source branch, reserving batches via FEFO and deducting inventory.
   */
  async dispatchTransfer(
    transferId: string,
    sourceBranchId: string,
    dispatchedBy: string,
    dto: DispatchTransferDto,
  ): Promise<Transfer> {
    return this.db.withTransaction(async (client) => {
      // 1. Fetch transfer FOR UPDATE
      const trfRes = await client.query<any>(
        `SELECT * FROM transfers WHERE id = $1 AND source_branch_id = $2 FOR UPDATE`,
        [transferId, sourceBranchId],
      );

      if (trfRes.rows.length === 0) {
        throw new NotFoundException(`Transfer ${transferId} not found at branch`);
      }
      const transfer = trfRes.rows[0];

      if (!['REQUESTED', 'APPROVED'].includes(transfer.status)) {
        throw new BadRequestException(
          `Cannot dispatch transfer with status ${transfer.status}`,
        );
      }

      // 2. Fetch items
      const itemsRes = await client.query<any>(
        `SELECT * FROM transfer_items WHERE transfer_id = $1`,
        [transferId],
      );

      for (const item of itemsRes.rows) {
        // Resolve quantity to dispatch
        const dispatchOverride = dto.items?.find((d) => d.transferItemId === item.id);
        const qtyToDispatch = dispatchOverride
          ? dispatchOverride.dispatchedQuantity
          : parseFloat(item.requested_quantity);

        if (qtyToDispatch > 0) {
          // Allocate batch via FEFO from source branch if not already fixed
          let batchId = dispatchOverride?.batchId || item.batch_id;
          let batchNumber = item.batch_number;
          let expiryDate = item.expiry_date;

          if (!batchId) {
            const alloc = await this.inventoryService.allocateBatchesForSale(
              sourceBranchId,
              item.product_id,
              qtyToDispatch,
              false,
              client,
            );
            if (alloc.allocations.length > 0) {
              batchId = alloc.allocations[0].batchId;
              batchNumber = alloc.allocations[0].batchNumber;
              expiryDate = alloc.allocations[0].expiryDate;
            }
          }

          // Deduct from source branch stock ledger
          await this.inventoryService.recordMovementInTransaction(
            client,
            sourceBranchId,
            {
              productId: item.product_id,
              batchId,
              movementType: 'TRANSFER_OUT',
              quantityChange: -qtyToDispatch,
              unitCost: parseFloat(item.unit_cost),
              referenceType: 'TRANSFER',
              referenceId: transfer.id,
              notes: `Dispatch transfer ${transfer.transfer_number} to destination`,
              createdBy: dispatchedBy,
              allowNegativeStock: false,
            },
          );

          // Update transfer_item record
          await client.query(
            `UPDATE transfer_items
             SET dispatched_quantity = $1,
                 batch_id = $2,
                 batch_number = $3,
                 expiry_date = $4
             WHERE id = $5`,
            [qtyToDispatch, batchId || null, batchNumber || null, expiryDate || null, item.id],
          );
        }
      }

      // 3. Mark transfer as DISPATCHED / IN_TRANSIT
      await client.query(
        `UPDATE transfers
         SET status = 'DISPATCHED',
             dispatched_by = $1,
             dispatched_at = clock_timestamp(),
             updated_at = clock_timestamp()
         WHERE id = $2`,
        [dispatchedBy, transferId],
      );

      return this.getTransfer(transferId, client);
    });
  }

  /**
   * Receives transfer at destination branch, logging discrepancies and restocking inventory.
   */
  async receiveTransfer(
    transferId: string,
    destinationBranchId: string,
    receivedBy: string,
    dto: ReceiveTransferDto,
  ): Promise<Transfer> {
    return this.db.withTransaction(async (client) => {
      // 1. Fetch transfer FOR UPDATE
      const trfRes = await client.query<any>(
        `SELECT * FROM transfers WHERE id = $1 AND destination_branch_id = $2 FOR UPDATE`,
        [transferId, destinationBranchId],
      );

      if (trfRes.rows.length === 0) {
        throw new NotFoundException(`Transfer ${transferId} not found for destination branch`);
      }
      const transfer = trfRes.rows[0];

      if (!['DISPATCHED', 'IN_TRANSIT'].includes(transfer.status)) {
        throw new BadRequestException(
          `Cannot receive transfer with status ${transfer.status}`,
        );
      }

      // 2. Fetch transfer items
      const itemsRes = await client.query<any>(
        `SELECT * FROM transfer_items WHERE transfer_id = $1`,
        [transferId],
      );

      let hasDiscrepancy = false;

      for (const item of itemsRes.rows) {
        const receivedItem = dto.items.find((r) => r.transferItemId === item.id);
        const receivedQty = receivedItem ? receivedItem.receivedQuantity : 0;
        const dispatchedQty = parseFloat(item.dispatched_quantity);

        if (Math.abs(dispatchedQty - receivedQty) > 0.0001) {
          hasDiscrepancy = true;
        }

        // Update transfer_items record
        await client.query(
          `UPDATE transfer_items
           SET received_quantity = $1,
               discrepancy_reason = $2
           WHERE id = $3`,
          [receivedQty, receivedItem?.discrepancyReason || null, item.id],
        );

        // If items received, add to destination inventory & batches
        if (receivedQty > 0) {
          let destBatchId: string | null = null;

          if (item.batch_number) {
            const batchRes = await client.query<any>(
              `INSERT INTO batches (
                 branch_id, product_id, batch_number, expiry_date, unit_cost,
                 initial_quantity, current_quantity
               ) VALUES ($1, $2, $3, $4, $5, $6, $6)
               ON CONFLICT (branch_id, product_id, batch_number)
               DO UPDATE SET
                 current_quantity = batches.current_quantity + EXCLUDED.current_quantity,
                 updated_at = clock_timestamp()
               RETURNING id`,
              [
                destinationBranchId,
                item.product_id,
                item.batch_number,
                item.expiry_date || null,
                parseFloat(item.unit_cost),
                receivedQty,
              ],
            );
            destBatchId = batchRes.rows[0].id;
          }

          // Record stock movement into destination branch
          await this.inventoryService.recordMovementInTransaction(
            client,
            destinationBranchId,
            {
              productId: item.product_id,
              batchId: destBatchId,
              movementType: 'TRANSFER_IN',
              quantityChange: receivedQty,
              unitCost: parseFloat(item.unit_cost),
              referenceType: 'TRANSFER',
              referenceId: transfer.id,
              notes: `Received transfer ${transfer.transfer_number} from source`,
              createdBy: receivedBy,
              allowNegativeStock: true,
            },
          );

          // Update destination product AVCO
          const prodRes = await client.query<{ cost_price: string }>(
            `SELECT cost_price FROM products WHERE id = $1`,
            [item.product_id],
          );
          const currentCost = prodRes.rows.length > 0 ? parseFloat(prodRes.rows[0].cost_price) : 0;

          const ledgerRes = await client.query<{ balance_after: string }>(
            `SELECT balance_after FROM stock_ledger
             WHERE branch_id = $1 AND product_id = $2
             ORDER BY created_at DESC, id DESC LIMIT 1`,
            [destinationBranchId, item.product_id],
          );
          const onHand = ledgerRes.rows.length > 0 ? parseFloat(ledgerRes.rows[0].balance_after) : 0;

          const avco = calculateAVCO({
            currentOnHandQty: onHand - receivedQty, // onHand prior to this receipt
            currentCost,
            receivedQty,
            receivedUnitCost: parseFloat(item.unit_cost),
          });

          await client.query(
            `UPDATE products SET cost_price = $1, updated_at = clock_timestamp() WHERE id = $2`,
            [avco.newCost, item.product_id],
          );
        }
      }

      // 3. Update transfer status
      const finalStatus: TransferStatus = hasDiscrepancy ? 'DISCREPANCY' : 'RECEIVED';

      await client.query(
        `UPDATE transfers
         SET status = $1,
             received_by = $2,
             received_at = clock_timestamp(),
             notes = COALESCE($3, notes),
             updated_at = clock_timestamp()
         WHERE id = $4`,
        [finalStatus, receivedBy, dto.notes || null, transferId],
      );

      return this.getTransfer(transferId, client);
    });
  }

  /**
   * Cancels a pending transfer before dispatch.
   */
  async cancelTransfer(transferId: string): Promise<Transfer> {
    const res = await this.db.query<any>(
      `UPDATE transfers
       SET status = 'CANCELLED', updated_at = clock_timestamp()
       WHERE id = $1 AND status IN ('REQUESTED', 'APPROVED')
       RETURNING *`,
      [transferId],
    );

    if (res.rows.length === 0) {
      throw new BadRequestException(
        `Transfer ${transferId} cannot be cancelled (not found or already dispatched)`,
      );
    }

    return this.getTransfer(transferId);
  }

  /**
   * Retrieves transfer with items.
   */
  async getTransfer(transferId: string, client?: any): Promise<Transfer> {
    const queryFn = client
      ? (text: string, params: any[]) => client.query(text, params)
      : (text: string, params: any[]) => this.db.query(text, params);

    const trfRes = await queryFn(
      `SELECT * FROM transfers WHERE id = $1`,
      [transferId],
    );

    if (trfRes.rows.length === 0) {
      throw new NotFoundException(`Transfer ${transferId} not found`);
    }
    const trf = trfRes.rows[0];

    const itemsRes = await queryFn(
      `SELECT * FROM transfer_items WHERE transfer_id = $1`,
      [transferId],
    );

    return {
      id: trf.id,
      transferNumber: trf.transfer_number,
      sourceBranchId: trf.source_branch_id,
      destinationBranchId: trf.destination_branch_id,
      status: trf.status,
      notes: trf.notes,
      requestedBy: trf.requested_by,
      approvedBy: trf.approved_by,
      dispatchedBy: trf.dispatched_by,
      receivedBy: trf.received_by,
      dispatchedAt: trf.dispatched_at ? trf.dispatched_at.toISOString() : null,
      receivedAt: trf.received_at ? trf.received_at.toISOString() : null,
      createdAt: trf.created_at.toISOString(),
      updatedAt: trf.updated_at.toISOString(),
      items: itemsRes.rows.map((ir: any) => ({
        id: ir.id,
        transferId: ir.transfer_id,
        productId: ir.product_id,
        batchId: ir.batch_id,
        batchNumber: ir.batch_number,
        expiryDate: ir.expiry_date ? ir.expiry_date.toISOString().split('T')[0] : null,
        unitCost: parseFloat(ir.unit_cost),
        requestedQuantity: parseFloat(ir.requested_quantity),
        dispatchedQuantity: parseFloat(ir.dispatched_quantity),
        receivedQuantity: parseFloat(ir.received_quantity),
        discrepancyQuantity: parseFloat(ir.discrepancy_quantity),
        discrepancyReason: ir.discrepancy_reason,
      })),
    };
  }

  /**
   * Lists transfers for a branch (as source or destination).
   */
  async listTransfers(branchId: string): Promise<Transfer[]> {
    const res = await this.db.query<any>(
      `SELECT * FROM transfers
       WHERE source_branch_id = $1 OR destination_branch_id = $1
       ORDER BY created_at DESC`,
      [branchId],
    );

    return res.rows.map((trf: any) => ({
      id: trf.id,
      transferNumber: trf.transfer_number,
      sourceBranchId: trf.source_branch_id,
      destinationBranchId: trf.destination_branch_id,
      status: trf.status,
      notes: trf.notes,
      requestedBy: trf.requested_by,
      approvedBy: trf.approved_by,
      dispatchedBy: trf.dispatched_by,
      receivedBy: trf.received_by,
      dispatchedAt: trf.dispatched_at ? trf.dispatched_at.toISOString() : null,
      receivedAt: trf.received_at ? trf.received_at.toISOString() : null,
      createdAt: trf.created_at.toISOString(),
      updatedAt: trf.updated_at.toISOString(),
    }));
  }
}
