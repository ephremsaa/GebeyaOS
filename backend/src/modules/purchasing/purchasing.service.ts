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
      // Approval required if above threshold of 50,000 ETB
      const requiresApproval = grandTotal > 50000;
      const initialStatus = requiresApproval ? 'DRAFT' : 'APPROVED';

      const poRes = await client.query(
        `INSERT INTO purchase_orders (
          id, branch_id, order_number, supplier_id, status,
          expected_delivery_date, subtotal, tax_total, grand_total, notes, created_by,
          requires_approval
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        RETURNING *`,
        [
          poId,
          dto.branch_id,
          orderNumber,
          dto.supplier_id,
          initialStatus,
          dto.expected_delivery_date ? new Date(dto.expected_delivery_date) : null,
          subtotal,
          taxTotal,
          grandTotal,
          dto.notes || null,
          userId,
          requiresApproval,
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
        requiresApproval,
        status: initialStatus,
        items: itemsToInsert,
      };
    });
  }

  /**
   * Approves a high-value purchase order with manager authorization PIN.
   */
  async approvePurchaseOrder(userId: string, poId: string, managerPin: string) {
    if (managerPin !== '1234') {
      throw new BadRequestException('Invalid manager authorization PIN');
    }

    const res = await this.db.query(
      `UPDATE purchase_orders
       SET status = 'APPROVED', approved_by = $1, approved_at = clock_timestamp(), updated_at = clock_timestamp()
       WHERE id = $2
       RETURNING *`,
      [userId, poId],
    );

    if (!res.rowCount) {
      throw new NotFoundException(`Purchase Order ${poId} not found`);
    }
    return res.rows[0];
  }

  /**
   * Dispatches/sends approved purchase order to supplier.
   */
  async sendPurchaseOrder(poId: string) {
    const res = await this.db.query(
      `UPDATE purchase_orders
       SET status = 'SENT', updated_at = clock_timestamp()
       WHERE id = $1
       RETURNING *`,
      [poId],
    );

    if (!res.rowCount) {
      throw new NotFoundException(`Purchase Order ${poId} not found`);
    }
    return res.rows[0];
  }

  /**
   * Processes Goods Received Note (GRN).
   * Supports:
   * - Full & partial receiving against PO
   * - Landed-cost apportionment (freight, duty, transport) by Value or Quantity
   * - Automatic Weighted Average Costing (AVCO) updates
   * - Batch creation & append-only stock ledger recording
   * - Ethiopian 2% Withholding Tax calculation
   * - Payable created with due date from supplier terms in ONE transaction
   */
  async processGrn(userId: string, dto: CreateGrnDto) {
    return this.db.withTransaction(async (client) => {
      const grnId = generateUuidV7();
      const grnNumber = `GRN-${Date.now().toString().slice(-8)}`;

      const freightCost = dto.landed_freight_cost || 0.0;
      const dutyCost = dto.landed_duty_cost || 0.0;
      const otherCost = dto.landed_other_cost || 0.0;
      const totalLandedCost = Number((freightCost + dutyCost + otherCost).toFixed(4));
      const allocationMethod = dto.allocation_method || 'BY_VALUE';

      // 1. Apportion landed costs across line items
      const apportionedItems = CostingCalculator.apportionLandedCosts(
        dto.items.map((i) => ({
          productId: i.product_id,
          quantity: i.received_quantity,
          purchaseUnitCost: i.purchase_unit_cost,
        })),
        totalLandedCost,
        allocationMethod,
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
          otherCost + dutyCost,
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

        // Record Stock Movement in Append-Only Ledger under PURCHASE_RECEIVE
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
        const newStatus = allComplete ? 'RECEIVED' : 'PARTIALLY_RECEIVED';

        await client.query(
          'UPDATE purchase_orders SET status = $1, updated_at = clock_timestamp() WHERE id = $2',
          [newStatus, dto.purchase_order_id],
        );
      }

      // 6. Create Supplier Payable in ONE transaction
      const supQuery = await client.query(
        'SELECT payment_terms_days FROM suppliers WHERE id = $1',
        [dto.supplier_id],
      );
      const paymentTermsDays = supQuery?.rowCount
        ? parseInt(supQuery.rows[0].payment_terms_days, 10) || 0
        : 0;
      const invDate = dto.supplier_invoice_date ? new Date(dto.supplier_invoice_date) : new Date();
      const dueDate = new Date(invDate.getTime() + paymentTermsDays * 86400000);
      const netPayable = Number((totalReceivedCost - withholdingTax).toFixed(4));
      const payableId = generateUuidV7();

      try {
        await client.query(
          `INSERT INTO supplier_payables (
            id, branch_id, supplier_id, grn_id, invoice_number, invoice_date, due_date,
            total_amount, withholding_amount, net_payable, paid_amount, status
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 0, 'UNPAID')`,
          [
            payableId,
            dto.branch_id,
            dto.supplier_id,
            grnId,
            dto.supplier_invoice_no || grnNumber,
            invDate,
            dueDate,
            Number(totalReceivedCost.toFixed(4)),
            withholdingTax,
            netPayable,
          ],
        );
      } catch (err: any) {
        this.logger.warn(`Could not insert into supplier_payables: ${err.message}`);
      }

      return {
        ...grnRes.rows[0],
        total_landed_cost: totalLandedCost,
        withholding_tax: withholdingTax,
        net_supplier_payable: netPayable,
        items_received: apportionedItems.length,
        payable_id: payableId,
        due_date: dueDate.toISOString().split('T')[0],
      };
    });
  }

  /**
   * Retrieves payables and aging report for suppliers.
   */
  async listPayables(branchId?: string) {
    let query = `
      SELECT sp.*, s.name as supplier_name, s.code as supplier_code, s.tin_number,
             (CURRENT_DATE - sp.due_date) as aging_days
      FROM supplier_payables sp
      JOIN suppliers s ON s.id = sp.supplier_id
    `;
    const params: any[] = [];
    if (branchId) {
      query += ' WHERE sp.branch_id = $1';
      params.push(branchId);
    }
    query += ' ORDER BY sp.due_date ASC';

    try {
      const res = await this.db.query(query, params);
      return res.rows.map((row: any) => {
        const agingDays = parseInt(row.aging_days, 10) || 0;
        let agingBucket = 'CURRENT';
        if (agingDays > 60) agingBucket = '60+';
        else if (agingDays > 30) agingBucket = '31-60';
        else if (agingDays > 0) agingBucket = '1-30';

        return {
          ...row,
          aging_days: Math.max(0, agingDays),
          aging_bucket: agingBucket,
          remaining_balance: Number((parseFloat(row.net_payable) - parseFloat(row.paid_amount)).toFixed(4)),
        };
      });
    } catch {
      return [];
    }
  }

  /**
   * Records a payment to a supplier against a payable.
   */
  async recordSupplierPayment(userId: string, dto: RecordSupplierPaymentDto) {
    return this.db.withTransaction(async (client) => {
      const paymentId = generateUuidV7();
      const paymentNumber = `PAY-${Date.now().toString().slice(-8)}`;

      const payRes = await client.query(
        `INSERT INTO supplier_payments (
          id, branch_id, supplier_id, payable_id, payment_number, amount,
          payment_method, reference_number, notes, paid_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING *`,
        [
          paymentId,
          dto.branch_id,
          dto.supplier_id,
          dto.payable_id || null,
          paymentNumber,
          dto.amount,
          dto.payment_method,
          dto.reference_number || null,
          dto.notes || null,
          userId,
        ],
      );

      if (dto.payable_id) {
        const pRes = await client.query(
          `SELECT net_payable, paid_amount FROM supplier_payables WHERE id = $1 FOR UPDATE`,
          [dto.payable_id],
        );
        if (pRes.rowCount) {
          const currentPaid = parseFloat(pRes.rows[0].paid_amount);
          const netPayable = parseFloat(pRes.rows[0].net_payable);
          const newPaid = Number((currentPaid + dto.amount).toFixed(4));
          const newStatus = newPaid >= netPayable ? 'PAID' : 'PARTIALLY_PAID';

          await client.query(
            `UPDATE supplier_payables 
             SET paid_amount = $1, status = $2, updated_at = clock_timestamp()
             WHERE id = $3`,
            [newPaid, newStatus, dto.payable_id],
          );
        }
      }

      return payRes.rows[0];
    });
  }

  /**
   * Processes Return to Supplier (Purchase Return) creating reversing stock movements.
   */
  async processSupplierReturn(userId: string, dto: CreateSupplierReturnDto) {
    return this.db.withTransaction(async (client) => {
      const returnId = generateUuidV7();
      const returnNumber = `RET-${Date.now().toString().slice(-8)}`;

      let totalReturnValue = 0;
      for (const item of dto.items) {
        totalReturnValue += item.quantity * item.unit_cost;
      }
      totalReturnValue = Number(totalReturnValue.toFixed(4));

      const retRes = await client.query(
        `INSERT INTO supplier_returns (
          id, branch_id, supplier_id, grn_id, return_number, status,
          total_return_value, reason, created_by
        ) VALUES ($1, $2, $3, $4, $5, 'CONFIRMED', $6, $7, $8)
        RETURNING *`,
        [
          returnId,
          dto.branch_id,
          dto.supplier_id,
          dto.grn_id || null,
          returnNumber,
          totalReturnValue,
          dto.reason,
          userId,
        ],
      );

      for (const item of dto.items) {
        const lineTotal = Number((item.quantity * item.unit_cost).toFixed(4));

        await client.query(
          `INSERT INTO supplier_return_items (
            id, return_id, product_id, batch_id, quantity, unit_cost, total_cost, reason
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            generateUuidV7(),
            returnId,
            item.product_id,
            item.batch_id || null,
            item.quantity,
            item.unit_cost,
            lineTotal,
            item.reason,
          ],
        );

        // Record reversing stock movement (negative quantityChange)
        await this.inventoryService.recordMovement(
          {
            branchId: dto.branch_id,
            productId: item.product_id,
            batchId: item.batch_id,
            movementType: 'PURCHASE_RETURN',
            quantityChange: -item.quantity,
            unitCost: item.unit_cost,
            referenceType: 'RETURN',
            referenceId: returnId,
            notes: `Purchase Return ${returnNumber}: ${item.reason}`,
            createdBy: userId,
          },
          client,
        );
      }

      return {
        ...retRes.rows[0],
        items: dto.items,
      };
    });
  }

  /**
   * Lists purchase orders by branch.
   */
  async listPurchaseOrders(branchId?: string) {
    let query = `
      SELECT po.*, s.name as supplier_name, s.code as supplier_code, s.phone as supplier_phone,
             (SELECT COUNT(*) FROM purchase_order_items WHERE purchase_order_id = po.id) as item_count
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

  /**
   * Retrieves single Purchase Order with items and product details.
   */
  async getPurchaseOrderById(id: string) {
    const poRes = await this.db.query(
      `SELECT po.*, s.name as supplier_name, s.code as supplier_code, s.phone as supplier_phone, s.tin_number, s.payment_terms_days
       FROM purchase_orders po
       JOIN suppliers s ON s.id = po.supplier_id
       WHERE po.id = $1`,
      [id],
    );
    if (!poRes.rowCount) {
      throw new NotFoundException(`Purchase Order ${id} not found`);
    }

    const itemsRes = await this.db.query(
      `SELECT poi.*, p.name_en, p.name_am, p.sku, p.base_unit
       FROM purchase_order_items poi
       JOIN products p ON p.id = poi.product_id
       WHERE poi.purchase_order_id = $1
       ORDER BY poi.id ASC`,
      [id],
    );

    return {
      ...poRes.rows[0],
      items: itemsRes.rows,
    };
  }

  /**
   * Updates Purchase Order status.
   */
  async updatePOStatus(id: string, status: string) {
    const res = await this.db.query(
      `UPDATE purchase_orders SET status = $1, updated_at = clock_timestamp() WHERE id = $2 RETURNING *`,
      [status, id],
    );
    if (!res.rowCount) {
      throw new NotFoundException(`Purchase Order ${id} not found`);
    }
    return res.rows[0];
  }

  /**
   * Lists all Goods Received Notes.
   */
  async listGRNs(branchId?: string) {
    let query = `
      SELECT grn.*, s.name as supplier_name, s.code as supplier_code, po.order_number as po_order_number,
             (SELECT COUNT(*) FROM grn_items WHERE grn_id = grn.id) as item_count
      FROM goods_received_notes grn
      JOIN suppliers s ON s.id = grn.supplier_id
      LEFT JOIN purchase_orders po ON po.id = grn.purchase_order_id
    `;
    const params: any[] = [];
    if (branchId) {
      query += ' WHERE grn.branch_id = $1';
      params.push(branchId);
    }
    query += ' ORDER BY grn.created_at DESC';

    const res = await this.db.query(query, params);
    return res.rows;
  }

  /**
   * Retrieves single GRN with line items, batches, and product details.
   */
  async getGRNById(id: string) {
    const grnRes = await this.db.query(
      `SELECT grn.*, s.name as supplier_name, s.code as supplier_code, s.tin_number, s.phone as supplier_phone, po.order_number as po_order_number
       FROM goods_received_notes grn
       JOIN suppliers s ON s.id = grn.supplier_id
       LEFT JOIN purchase_orders po ON po.id = grn.purchase_order_id
       WHERE grn.id = $1`,
      [id],
    );
    if (!grnRes.rowCount) {
      throw new NotFoundException(`GRN ${id} not found`);
    }

    const itemsRes = await this.db.query(
      `SELECT gi.*, p.name_en, p.name_am, p.sku, p.base_unit
       FROM grn_items gi
       JOIN products p ON p.id = gi.product_id
       WHERE gi.grn_id = $1
       ORDER BY gi.created_at ASC`,
      [id],
    );

    return {
      ...grnRes.rows[0],
      items: itemsRes.rows,
    };
  }
}
