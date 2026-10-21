import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { DatabaseService } from '../../common/database/database.service';
import { generateUuidV7 } from '../../common/utils/uuidv7';
import { InventoryService } from '../inventory/inventory.service';
import {
  CreateTransferRequestDto,
  ApproveTransferDto,
  DispatchTransferDto,
  ReceiveTransferDto,
} from './dto/transfers.dto';

@Injectable()
export class TransfersService {
  private readonly logger = new Logger(TransfersService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly inventoryService: InventoryService,
  ) {}

  /**
   * Initiates a new inter-branch stock transfer request.
   */
  async requestTransfer(userId: string, dto: CreateTransferRequestDto) {
    if (dto.source_branch_id === dto.destination_branch_id) {
      throw new BadRequestException('Source and destination branches cannot be the same.');
    }

    return this.db.withTransaction(async (client) => {
      const transferId = generateUuidV7();
      const transferNumber = `TRF-${Date.now().toString().slice(-8)}`;

      const trfRes = await client.query(
        `INSERT INTO transfers (
          id, transfer_number, source_branch_id, destination_branch_id,
          status, notes, requested_by
        ) VALUES ($1, $2, $3, $4, 'REQUESTED', $5, $6)
        RETURNING *`,
        [
          transferId,
          transferNumber,
          dto.source_branch_id,
          dto.destination_branch_id,
          dto.notes || null,
          userId,
        ],
      );

      const itemsInserted: any[] = [];
      for (const item of dto.items) {
        // Fetch current product default cost
        const prod = await client.query('SELECT cost_price FROM products WHERE id = $1', [item.product_id]);
        const costPrice = prod.rowCount ? parseFloat(prod.rows[0].cost_price) : 0;

        const itemId = generateUuidV7();
        const itemRes = await client.query(
          `INSERT INTO transfer_items (
            id, transfer_id, product_id, unit_cost, requested_quantity, dispatched_quantity, received_quantity
          ) VALUES ($1, $2, $3, $4, $5, 0, 0)
          RETURNING *`,
          [itemId, transferId, item.product_id, costPrice, item.requested_quantity],
        );
        itemsInserted.push(itemRes.rows[0]);
      }

      return {
        ...trfRes.rows[0],
        items: itemsInserted,
      };
    });
  }

  /**
   * Approves a requested transfer at the source branch or HQ.
   */
  async approveTransfer(transferId: string, userId: string, dto: ApproveTransferDto) {
    const res = await this.db.query(
      `UPDATE transfers
       SET status = 'APPROVED', approved_by = $1, notes = COALESCE($2, notes), updated_at = clock_timestamp()
       WHERE id = $3 AND status = 'REQUESTED'
       RETURNING *`,
      [userId, dto.notes || null, transferId],
    );

    if (res.rowCount === 0) {
      throw new BadRequestException(`Transfer '${transferId}' not found or not in 'REQUESTED' status.`);
    }

    return res.rows[0];
  }

  /**
   * Dispatches transfer from source branch:
   * - Deducts inventory from source branch batches and append-only stock ledger (TRANSFER_OUT)
   * - Transitions status to IN_TRANSIT
   */
  async dispatchTransfer(transferId: string, userId: string, dto: DispatchTransferDto) {
    return this.db.withTransaction(async (client) => {
      const trfRes = await client.query(
        `SELECT * FROM transfers WHERE id = $1 FOR UPDATE`,
        [transferId],
      );

      if (trfRes.rowCount === 0) {
        throw new NotFoundException(`Transfer '${transferId}' not found.`);
      }
      const transfer = trfRes.rows[0];

      if (transfer.status !== 'APPROVED') {
        throw new BadRequestException(`Cannot dispatch transfer in status '${transfer.status}'. Must be 'APPROVED'.`);
      }

      for (const itemInput of dto.items) {
        // FEFO allocation on source branch
        const fefo = await this.inventoryService.allocateFefo(
          client,
          transfer.source_branch_id,
          itemInput.product_id,
          itemInput.dispatched_quantity,
          false, // Never allow negative stock on transfer dispatch
        );

        const primaryAlloc = fefo.allocations[0];
        const unitCost = primaryAlloc ? primaryAlloc.unitCost : 0;
        const batchId = primaryAlloc ? primaryAlloc.batchId : null;
        const batchNum = primaryAlloc ? primaryAlloc.batchNumber : null;
        const expiryDate = primaryAlloc ? primaryAlloc.expiryDate : null;

        // Deduct from source branch stock ledger
        for (const alloc of fefo.allocations) {
          await this.inventoryService.recordMovement(
            {
              branchId: transfer.source_branch_id,
              productId: itemInput.product_id,
              batchId: alloc.batchId,
              movementType: 'TRANSFER_OUT',
              quantityChange: -alloc.allocatedQuantity,
              unitCost: alloc.unitCost,
              referenceType: 'TRANSFER',
              referenceId: transferId,
              notes: `Transfer Out to Branch ${transfer.destination_branch_id}`,
              createdBy: userId,
            },
            client,
          );
        }

        // Update transfer item with dispatched batch details
        await client.query(
          `UPDATE transfer_items
           SET batch_id = $1, batch_number = $2, expiry_date = $3, unit_cost = $4, dispatched_quantity = $5
           WHERE id = $6`,
          [
            batchId,
            batchNum,
            expiryDate ? new Date(expiryDate) : null,
            unitCost,
            itemInput.dispatched_quantity,
            itemInput.transfer_item_id,
          ],
        );
      }

      const updateRes = await client.query(
        `UPDATE transfers
         SET status = 'IN_TRANSIT', dispatched_by = $1, dispatched_at = clock_timestamp(), notes = COALESCE($2, notes), updated_at = clock_timestamp()
         WHERE id = $3
         RETURNING *`,
        [userId, dto.notes || null, transferId],
      );

      return updateRes.rows[0];
    });
  }

  /**
   * Receives transfer at destination branch:
   * - Records received quantities and logs discrepancies
   * - Creates/increments batches at destination branch
   * - Posts append-only ledger entry (TRANSFER_IN)
   * - Sets status to RECEIVED or DISCREPANCY
   */
  async receiveTransfer(transferId: string, userId: string, dto: ReceiveTransferDto) {
    return this.db.withTransaction(async (client) => {
      const trfRes = await client.query(
        `SELECT * FROM transfers WHERE id = $1 FOR UPDATE`,
        [transferId],
      );

      if (trfRes.rowCount === 0) {
        throw new NotFoundException(`Transfer '${transferId}' not found.`);
      }
      const transfer = trfRes.rows[0];

      if (transfer.status !== 'IN_TRANSIT' && transfer.status !== 'DISPATCHED') {
        throw new BadRequestException(`Cannot receive transfer in status '${transfer.status}'. Must be 'IN_TRANSIT'.`);
      }

      let hasDiscrepancy = false;
      let totalDiscrepancyUnits = 0;

      for (const itemInput of dto.items) {
        const itemRes = await client.query(
          `SELECT * FROM transfer_items WHERE id = $1 AND transfer_id = $2`,
          [itemInput.transfer_item_id, transferId],
        );
        if (itemRes.rowCount === 0) {
          throw new NotFoundException(`Transfer item '${itemInput.transfer_item_id}' not found.`);
        }
        const item = itemRes.rows[0];

        const dispatchedQty = parseFloat(item.dispatched_quantity);
        const receivedQty = itemInput.received_quantity;
        const diff = Number((dispatchedQty - receivedQty).toFixed(3));

        if (Math.abs(diff) > 0.0001) {
          hasDiscrepancy = true;
          totalDiscrepancyUnits += Math.abs(diff);
        }

        // Update transfer item record
        await client.query(
          `UPDATE transfer_items
           SET received_quantity = $1, discrepancy_reason = $2
           WHERE id = $3`,
          [receivedQty, itemInput.discrepancy_reason || null, itemInput.transfer_item_id],
        );

        // If items were received, add to destination branch inventory
        if (receivedQty > 0) {
          const destBatchId = generateUuidV7();
          const batchNum = item.batch_number || `TRF-${transfer.transfer_number}`;
          const unitCost = parseFloat(item.unit_cost);

          // Create or increment batch at destination branch
          const destBatch = await client.query(
            `INSERT INTO batches (
              id, branch_id, product_id, batch_number, expiry_date,
              unit_cost, initial_quantity, current_quantity
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $7)
            ON CONFLICT (branch_id, product_id, batch_number) DO UPDATE SET
              current_quantity = batches.current_quantity + EXCLUDED.current_quantity,
              updated_at = clock_timestamp()
            RETURNING id`,
            [
              destBatchId,
              transfer.destination_branch_id,
              item.product_id,
              batchNum,
              item.expiry_date ? new Date(item.expiry_date) : null,
              unitCost,
              receivedQty,
            ],
          );

          // Append-only stock ledger (TRANSFER_IN) at destination branch
          await this.inventoryService.recordMovement(
            {
              branchId: transfer.destination_branch_id,
              productId: item.product_id,
              batchId: destBatch.rows[0].id,
              movementType: 'TRANSFER_IN',
              quantityChange: receivedQty,
              unitCost,
              referenceType: 'TRANSFER',
              referenceId: transferId,
              notes: `Transfer In from Branch ${transfer.source_branch_id}`,
              createdBy: userId,
            },
            client,
          );
        }
      }

      const finalStatus = hasDiscrepancy ? 'DISCREPANCY' : 'RECEIVED';

      const updateRes = await client.query(
        `UPDATE transfers
         SET status = $1, received_by = $2, received_at = clock_timestamp(), notes = COALESCE($3, notes), updated_at = clock_timestamp()
         WHERE id = $4
         RETURNING *`,
        [finalStatus, userId, dto.notes || null, transferId],
      );

      return {
        ...updateRes.rows[0],
        has_discrepancy: hasDiscrepancy,
        discrepancy_units: totalDiscrepancyUnits,
      };
    });
  }

  /**
   * Retrieves transfer details by ID including item lines.
   */
  async getTransferById(transferId: string) {
    const trf = await this.db.query(
      `SELECT t.*, sb.name as source_branch_name, db.name as destination_branch_name
       FROM transfers t
       JOIN branches sb ON sb.id = t.source_branch_id
       JOIN branches db ON db.id = t.destination_branch_id
       WHERE t.id = $1`,
      [transferId],
    );

    if (trf.rowCount === 0) {
      throw new NotFoundException(`Transfer '${transferId}' not found.`);
    }

    const items = await this.db.query(
      `SELECT ti.*, p.name_en, p.sku
       FROM transfer_items ti
       JOIN products p ON p.id = ti.product_id
       WHERE ti.transfer_id = $1`,
      [transferId],
    );

    return {
      ...trf.rows[0],
      items: items.rows,
    };
  }

  /**
   * Lists transfers filtered optionally by branch and status.
   */
  async listTransfers(branchId?: string, status?: string) {
    let query = `
      SELECT t.*, sb.name as source_branch_name, db.name as destination_branch_name
      FROM transfers t
      JOIN branches sb ON sb.id = t.source_branch_id
      JOIN branches db ON db.id = t.destination_branch_id
    `;
    const conditions: string[] = [];
    const params: any[] = [];

    if (branchId) {
      params.push(branchId);
      conditions.push(`(t.source_branch_id = $${params.length} OR t.destination_branch_id = $${params.length})`);
    }
    if (status) {
      params.push(status);
      conditions.push(`t.status = $${params.length}`);
    }

    if (conditions.length > 0) {
      query += ` WHERE ${conditions.join(' AND ')}`;
    }
    query += ' ORDER BY t.created_at DESC';

    const res = await this.db.query(query, params);
    return res.rows;
  }
}
