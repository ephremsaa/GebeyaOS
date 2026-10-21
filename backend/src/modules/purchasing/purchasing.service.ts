import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { DatabaseService } from '../../common/database/database.service';
import { generateUuidV7 } from '../../common/utils/uuidv7';
import { InventoryService } from '../inventory/inventory.service';
import { CostingCalculator } from './domain/costing.calculator';
import {
  CreateSupplierDto,
  CreatePurchaseOrderDto,
  CreateGrnDto,
} from './dto/purchasing.dto';

@Injectable()
export class PurchasingService {
  private readonly logger = new Logger(PurchasingService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly inventoryService: InventoryService,
  ) {}

  /**
   * Creates a new supplier directory record.
   */
  async createSupplier(dto: CreateSupplierDto) {
    const id = generateUuidV7();
    try {
      const res = await this.db.query(
        `INSERT INTO suppliers (
          id, code, name, tin_number, vat_number, contact_person, phone, email, address, payment_terms_days
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING *`,
        [
          id,
          dto.code,
          dto.name,
          dto.tin_number || null,
          dto.vat_number || null,
          dto.contact_person || null,
          dto.phone,
          dto.email || null,
          dto.address || null,
          dto.payment_terms_days || 0,
        ],
      );
      return res.rows[0];
    } catch (err: any) {
      if (err.code === '23505') {
        throw new ConflictException(`Supplier with code '${dto.code}' already exists.`);
      }
      throw err;
    }
  }

  /**
   * Lists all registered suppliers.
   */
  async listSuppliers() {
    const res = await this.db.query('SELECT * FROM suppliers ORDER BY name ASC');
    return res.rows;
  }

  /**
   * Creates an issued Purchase Order (PO).
   */
  async createPurchaseOrder(userId: string, dto: CreatePurchaseOrderDto) {
    return this.db.withTransaction(async (client) => {
      const poId = generateUuidV7();
      const orderNumber = `PO-${Date.now().toString().slice(-8)}`;

      let subtotal = 0;
      let taxTotal = 0;

      const itemsToInsert: Array<{
        productId: string;
        orderedQty: number;
        unitCost: number;
        taxRate: number;
        totalCost: number;
      }> = [];

      for (const item of dto.items) {
        const taxRate = item.tax_rate ?? 0.15;
        const lineCost = Number((item.ordered_quantity * item.unit_cost).toFixed(4));
        const lineTax = Number((lineCost * taxRate).toFixed(4));

        subtotal += lineCost;
        taxTotal += lineTax;

        itemsToInsert.push({
          productId: item.product_id,
          orderedQty: item.ordered_quantity,
          unitCost: item.unit_cost,
          taxRate,
          totalCost: lineCost,
        });
      }

      const grandTotal = Number((subtotal + taxTotal).toFixed(4));

      const poRes = await client.query(
        `INSERT INTO purchase_orders (
          id, branch_id, order_number, supplier_id, status,
          expected_delivery_date, subtotal, tax_total, grand_total, notes, created_by
        ) VALUES ($1, $2, $3, $4, 'ISSUED', $5, $6, $7, $8, $9, $10)
        RETURNING *`,
        [
          poId,
          dto.branch_id,
          orderNumber,
          dto.supplier_id,
          dto.expected_delivery_date ? new Date(dto.expected_delivery_date) : null,
          subtotal,
          taxTotal,
          grandTotal,
          dto.notes || null,
          userId,
        ],
      );

      for (const item of itemsToInsert) {
        await client.query(
          `INSERT INTO purchase_order_items (
            id, purchase_order_id, product_id, ordered_quantity, received_quantity, unit_cost, tax_rate, total_cost
          ) VALUES ($1, $2, $3, $4, 0, $5, $6, $7)`,
          [
            generateUuidV7(),
            poId,
            item.productId,
            item.orderedQty,
            item.unitCost,
            item.taxRate,
            item.totalCost,
          ],
        );
      }

      return {
        ...poRes.rows[0],
        items: itemsToInsert,
      };
    });
  }

  /**
   * Processes Goods Received Note (GRN).
   * Supports:
   * - Full & partial receiving against PO
   * - Landed-cost apportionment (freight, transport)
   * - Automatic Weighted Average Costing (AVCO) updates
   * - Batch creation & append-only stock ledger recording
   * - Ethiopian 2% Withholding Tax calculation
   */
  async processGrn(userId: string, dto: CreateGrnDto) {
    return this.db.withTransaction(async (client) => {
      const grnId = generateUuidV7();
      const grnNumber = `GRN-${Date.now().toString().slice(-8)}`;

      const freightCost = dto.landed_freight_cost || 0.0;
      const otherCost = dto.landed_other_cost || 0.0;
      const totalLandedCost = Number((freightCost + otherCost).toFixed(4));

      // 1. Apportion landed costs across line items
      const apportionedItems = CostingCalculator.apportionLandedCosts(
        dto.items.map((i) => ({
          productId: i.product_id,
          quantity: i.received_quantity,
          purchaseUnitCost: i.purchase_unit_cost,
        })),
        totalLandedCost,
      );

      const totalReceivedCost = apportionedItems.reduce(
        (sum, i) => sum + i.quantity * i.finalUnitCost,
        0,
      );

      // 2. Withholding Tax (2% if >= 10,000 ETB)
      const withholdingTax = CostingCalculator.calculateWithholdingTax(
        totalReceivedCost,
        dto.apply_withholding_tax ?? true,
      );

      // 3. Insert GRN record
      const grnRes = await client.query(
        `INSERT INTO goods_received_notes (
          id, branch_id, grn_number, purchase_order_id, supplier_id,
          supplier_invoice_no, supplier_invoice_date, landed_freight_cost, landed_other_cost,
          total_received_cost, withholding_tax_amount, received_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        RETURNING *`,
        [
          grnId,
          dto.branch_id,
          grnNumber,
          dto.purchase_order_id || null,
          dto.supplier_id,
          dto.supplier_invoice_no || null,
          dto.supplier_invoice_date ? new Date(dto.supplier_invoice_date) : null,
          freightCost,
          otherCost,
          Number(totalReceivedCost.toFixed(4)),
          withholdingTax,
          userId,
        ],
      );

      // 4. Process each received line item
      for (let i = 0; i < dto.items.length; i++) {
        const itemInput = dto.items[i];
        const apportioned = apportionedItems[i];

        // Insert grn_item
        await client.query(
          `INSERT INTO grn_items (
            id, grn_id, product_id, batch_number, expiry_date,
            received_quantity, purchase_unit_cost, apportioned_landed_cost, final_unit_cost
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [
            generateUuidV7(),
            grnId,
            itemInput.product_id,
            itemInput.batch_number,
            itemInput.expiry_date ? new Date(itemInput.expiry_date) : null,
            itemInput.received_quantity,
            itemInput.purchase_unit_cost,
            apportioned.apportionedLandedCostPerUnit,
            apportioned.finalUnitCost,
          ],
        );

        // Create or update Batch record
        const batchId = generateUuidV7();
        const batchRes = await client.query(
          `INSERT INTO batches (
            id, branch_id, product_id, batch_number, expiry_date,
            unit_cost, initial_quantity, current_quantity, supplier_id
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $7, $8)
          ON CONFLICT (branch_id, product_id, batch_number) DO UPDATE SET
            current_quantity = batches.current_quantity + EXCLUDED.current_quantity,
            unit_cost = EXCLUDED.unit_cost,
            updated_at = clock_timestamp()
          RETURNING id`,
          [
            batchId,
            dto.branch_id,
            itemInput.product_id,
            itemInput.batch_number,
            itemInput.expiry_date ? new Date(itemInput.expiry_date) : null,
            apportioned.finalUnitCost,
            itemInput.received_quantity,
            dto.supplier_id,
          ],
        );
        const resolvedBatchId = batchRes.rows[0].id;

        // Record Stock Movement in Append-Only Ledger
        await this.inventoryService.recordMovement(
          {
            branchId: dto.branch_id,
            productId: itemInput.product_id,
            batchId: resolvedBatchId,
            movementType: 'PURCHASE_RECEIVE',
            quantityChange: itemInput.received_quantity,
            unitCost: apportioned.finalUnitCost,
            referenceType: 'GRN',
            referenceId: grnId,
            notes: `GRN: ${grnNumber} from Supplier`,
            createdBy: userId,
          },
          client,
        );

        // Recalculate Weighted Average Cost (AVCO) for the product
        const prodRes = await client.query(
          'SELECT cost_price FROM products WHERE id = $1 FOR UPDATE',
          [itemInput.product_id],
        );
        const currentCost = prodRes.rowCount ? parseFloat(prodRes.rows[0].cost_price) : 0;

        // Current on-hand quantity prior to this receiving
        const ledgerPrior = await client.query(
          `SELECT balance_after FROM stock_ledger 
           WHERE branch_id = $1 AND product_id = $2 AND id <> $3
           ORDER BY created_at DESC, id DESC LIMIT 1`,
          [dto.branch_id, itemInput.product_id, grnId],
        );
        const currentOnHand = ledgerPrior.rowCount ? parseFloat(ledgerPrior.rows[0].balance_after) : 0;

        const newAvco = CostingCalculator.calculateWeightedAverageCost(
          currentOnHand,
          currentCost,
          itemInput.received_quantity,
          apportioned.finalUnitCost,
        );

        await client.query(
          'UPDATE products SET cost_price = $1, updated_at = clock_timestamp() WHERE id = $2',
          [newAvco, itemInput.product_id],
        );

        // If linked to PO, update PO line received quantity
        if (dto.purchase_order_id) {
          await client.query(
            `UPDATE purchase_order_items 
             SET received_quantity = received_quantity + $1
             WHERE purchase_order_id = $2 AND product_id = $3`,
            [itemInput.received_quantity, dto.purchase_order_id, itemInput.product_id],
          );
        }
      }

      // 5. Update PO Status if linked
      if (dto.purchase_order_id) {
        const poLines = await client.query(
          `SELECT ordered_quantity, received_quantity 
           FROM purchase_order_items 
           WHERE purchase_order_id = $1`,
          [dto.purchase_order_id],
        );

        const allComplete = poLines.rows.every(
          (line) => parseFloat(line.received_quantity) >= parseFloat(line.ordered_quantity),
        );
        const newStatus = allComplete ? 'COMPLETED' : 'PARTIALLY_RECEIVED';

        await client.query(
          'UPDATE purchase_orders SET status = $1, updated_at = clock_timestamp() WHERE id = $2',
          [newStatus, dto.purchase_order_id],
        );
      }

      return {
        ...grnRes.rows[0],
        total_landed_cost: totalLandedCost,
        withholding_tax: withholdingTax,
        net_supplier_payable: Number((totalReceivedCost - withholdingTax).toFixed(4)),
        items_received: apportionedItems.length,
      };
    });
  }

  /**
   * Lists purchase orders by branch.
   */
  async listPurchaseOrders(branchId?: string) {
    let query = `
      SELECT po.*, s.name as supplier_name, s.code as supplier_code
      FROM purchase_orders po
      JOIN suppliers s ON s.id = po.supplier_id
    `;
    const params: any[] = [];
    if (branchId) {
      query += ' WHERE po.branch_id = $1';
      params.push(branchId);
    }
    query += ' ORDER BY po.created_at DESC';

    const res = await this.db.query(query, params);
    return res.rows;
  }
}
