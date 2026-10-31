import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { DatabaseService } from '../../common/database/database.service';
import { InventoryService } from '../inventory/inventory.service';
import {
  calculateAVCO,
  apportionLandedCost,
  calculateWithholdingTax,
  Supplier,
  PurchaseOrder,
  PurchaseOrderItem,
  GoodsReceivedNote,
  GRNItem,
} from '@gebeyaos/shared-types';
import {
  CreateSupplierDto,
  CreatePurchaseOrderDto,
  UpdatePurchaseOrderStatusDto,
  CreateGRNDto,
  ApprovePurchaseOrderDto,
  RecordSupplierPaymentDto,
  CreateSupplierReturnDto,
} from './purchasing.dto';

@Injectable()
export class PurchasingService {
  private readonly logger = new Logger(PurchasingService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly inventoryService: InventoryService,
  ) {}

  /**
   * Registers a new supplier in the system.
   */
  async createSupplier(dto: CreateSupplierDto): Promise<Supplier> {
    const existing = await this.db.query(
      `SELECT id FROM suppliers WHERE code = $1`,
      [dto.code.trim().toUpperCase()],
    );
    if (existing.rows.length > 0) {
      throw new ConflictException(`Supplier with code ${dto.code} already exists`);
    }

    const res = await this.db.query<any>(
      `INSERT INTO suppliers (
         code, name, tin_number, vat_number, contact_person, phone, email, address, payment_terms_days
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        dto.code.trim().toUpperCase(),
        dto.name,
        dto.tinNumber || null,
        dto.vatNumber || null,
        dto.contactPerson || null,
        dto.phone,
        dto.email || null,
        dto.address || null,
        dto.paymentTermsDays || 0,
      ],
    );

    const r = res.rows[0];
    return {
      id: r.id,
      code: r.code,
      name: r.name,
      tinNumber: r.tin_number,
      vatNumber: r.vat_number,
      contactPerson: r.contact_person,
      phone: r.phone,
      email: r.email,
      address: r.address,
      paymentTermsDays: r.payment_terms_days,
      isActive: r.is_active,
      createdAt: r.created_at.toISOString(),
      updatedAt: r.updated_at.toISOString(),
    };
  }

  /**
   * Retrieves all suppliers.
   */
  async getSuppliers(activeOnly = true): Promise<Supplier[]> {
    const res = await this.db.query<any>(
      `SELECT * FROM suppliers ${activeOnly ? 'WHERE is_active = TRUE' : ''} ORDER BY name ASC`,
    );

    return res.rows.map((r: any) => ({
      id: r.id,
      code: r.code,
      name: r.name,
      tinNumber: r.tin_number,
      vatNumber: r.vat_number,
      contactPerson: r.contact_person,
      phone: r.phone,
      email: r.email,
      address: r.address,
      paymentTermsDays: r.payment_terms_days,
      isActive: r.is_active,
      createdAt: r.created_at.toISOString(),
      updatedAt: r.updated_at.toISOString(),
    }));
  }

  /**
   * Creates a formal Purchase Order (PO).
   * High-value purchase orders (> 50,000 ETB) require manager authorization.
   */
  async createPurchaseOrder(
    branchId: string,
    userId: string,
    dto: CreatePurchaseOrderDto,
  ): Promise<PurchaseOrder> {
    return this.db.withTransaction(async (client) => {
      // 1. Verify supplier
      const supRes = await client.query<{ id: string }>(
        `SELECT id FROM suppliers WHERE id = $1 AND is_active = TRUE`,
        [dto.supplierId],
      );
      if (supRes.rows.length === 0) {
        throw new NotFoundException(`Supplier ${dto.supplierId} not found`);
      }

      // 2. Generate PO order number: PO-YYYYMMDD-XXXX
      const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const countRes = await client.query<{ count: string }>(
        `SELECT COUNT(*) as count FROM purchase_orders WHERE branch_id = $1 AND order_number LIKE $2`,
        [branchId, `PO-${datePart}-%`],
      );
      const seq = (parseInt(countRes.rows[0].count, 10) + 1).toString().padStart(4, '0');
      const orderNumber = `PO-${datePart}-${seq}`;

      // 3. Compute item costs
      let subtotal = 0;
      let taxTotal = 0;
      let grandTotal = 0;

      const preparedItems = dto.items.map((item) => {
        const itemSubtotal = item.orderedQuantity * item.unitCost;
        const taxRate = item.taxRate ?? 0.15;
        const itemTax = itemSubtotal * taxRate;
        const itemTotal = itemSubtotal + itemTax;

        subtotal += itemSubtotal;
        taxTotal += itemTax;
        grandTotal += itemTotal;

        return {
          ...item,
          taxRate,
          totalCost: itemTotal,
        };
      });

      const r4 = (n: number) => Number(n.toFixed(4));
      subtotal = r4(subtotal);
      taxTotal = r4(taxTotal);
      grandTotal = r4(grandTotal);

      // 4. Approval required if above threshold of 50,000 ETB
      const requiresApproval = grandTotal > 50000;
      const initialStatus = requiresApproval ? 'DRAFT' : 'APPROVED';

      const poRes = await client.query<any>(
        `INSERT INTO purchase_orders (
           branch_id, order_number, supplier_id, status, expected_delivery_date,
           subtotal, tax_total, grand_total, notes, created_by, requires_approval
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         RETURNING *`,
        [
          branchId,
          orderNumber,
          dto.supplierId,
          initialStatus,
          dto.expectedDeliveryDate || null,
          subtotal,
          taxTotal,
          grandTotal,
          dto.notes || null,
          userId,
          requiresApproval,
        ],
      );
      const poRow = poRes.rows[0];

      // 5. Insert items
      const savedItems: PurchaseOrderItem[] = [];
      for (const item of preparedItems) {
        const itemRes = await client.query<any>(
          `INSERT INTO purchase_order_items (
             purchase_order_id, product_id, ordered_quantity, unit_cost, tax_rate, total_cost
           ) VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING *`,
          [
            poRow.id,
            item.productId,
            item.orderedQuantity,
            item.unitCost,
            item.taxRate,
            item.totalCost,
          ],
        );
        const ir = itemRes.rows[0];
        savedItems.push({
          id: ir.id,
          purchaseOrderId: ir.purchase_order_id,
          productId: ir.product_id,
          orderedQuantity: parseFloat(ir.ordered_quantity),
          receivedQuantity: parseFloat(ir.received_quantity),
          unitCost: parseFloat(ir.unit_cost),
          taxRate: parseFloat(ir.tax_rate),
          totalCost: parseFloat(ir.total_cost),
        });
      }

      return {
        id: poRow.id,
        branchId: poRow.branch_id,
        orderNumber: poRow.order_number,
        supplierId: poRow.supplier_id,
        status: poRow.status,
        expectedDeliveryDate: poRow.expected_delivery_date
          ? poRow.expected_delivery_date.toISOString().split('T')[0]
          : null,
        subtotal: parseFloat(poRow.subtotal),
        taxTotal: parseFloat(poRow.tax_total),
        grandTotal: parseFloat(poRow.grand_total),
        notes: poRow.notes,
        createdBy: poRow.created_by,
        createdAt: poRow.created_at.toISOString(),
        updatedAt: poRow.updated_at.toISOString(),
        items: savedItems,
      };
    });
  }

  /**
   * Updates Purchase Order status (e.g. to ISSUED or CANCELLED).
   */
  async updatePOStatus(poId: string, dto: UpdatePurchaseOrderStatusDto): Promise<PurchaseOrder> {
    const res = await this.db.query<any>(
      `UPDATE purchase_orders
       SET status = $1, updated_at = clock_timestamp()
       WHERE id = $2
       RETURNING *`,
      [dto.status, poId],
    );

    if (res.rows.length === 0) {
      throw new NotFoundException(`Purchase Order ${poId} not found`);
    }

    const po = res.rows[0];
    const itemsRes = await this.db.query<any>(
      `SELECT * FROM purchase_order_items WHERE purchase_order_id = $1`,
      [poId],
    );

    return {
      id: po.id,
      branchId: po.branch_id,
      orderNumber: po.order_number,
      supplierId: po.supplier_id,
      status: po.status,
      expectedDeliveryDate: po.expected_delivery_date
        ? po.expected_delivery_date.toISOString().split('T')[0]
        : null,
      subtotal: parseFloat(po.subtotal),
      taxTotal: parseFloat(po.tax_total),
      grandTotal: parseFloat(po.grand_total),
      notes: po.notes,
      createdBy: po.created_by,
      createdAt: po.created_at.toISOString(),
      updatedAt: po.updated_at.toISOString(),
      items: itemsRes.rows.map((ir: any) => ({
        id: ir.id,
        purchaseOrderId: ir.purchase_order_id,
        productId: ir.product_id,
        orderedQuantity: parseFloat(ir.ordered_quantity),
        receivedQuantity: parseFloat(ir.received_quantity),
        unitCost: parseFloat(ir.unit_cost),
        taxRate: parseFloat(ir.tax_rate),
        totalCost: parseFloat(ir.total_cost),
      })),
    };
  }

  /**
   * Receives goods (GRN) with landed cost apportioning, dynamic AVCO update, and batch tracking.
   */
  async createGRN(
    branchId: string,
    userId: string,
    dto: CreateGRNDto,
  ): Promise<GoodsReceivedNote> {
    return this.db.withTransaction(async (client) => {
      // 1. Verify supplier
      const supRes = await client.query<any>(
        `SELECT id, name, tin_number FROM suppliers WHERE id = $1`,
        [dto.supplierId],
      );
      if (supRes.rows.length === 0) {
        throw new NotFoundException(`Supplier ${dto.supplierId} not found`);
      }
      const supplier = supRes.rows[0];

      // 2. Generate GRN Number: GRN-YYYYMMDD-XXXX
      const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const countRes = await client.query<{ count: string }>(
        `SELECT COUNT(*) as count FROM goods_received_notes WHERE branch_id = $1 AND grn_number LIKE $2`,
        [branchId, `GRN-${datePart}-%`],
      );
      const seq = (parseInt(countRes.rows[0].count, 10) + 1).toString().padStart(4, '0');
      const grnNumber = `GRN-${datePart}-${seq}`;

      // 3. Apportion landed costs
      const freightCost = dto.landedFreightCost || 0;
      const otherCost = dto.landedOtherCost || 0;
      const dutyCost = dto.landedDutyCost || 0;
      const allocationMethod = dto.allocationMethod || 'BY_VALUE';
      const apportionedItems = apportionLandedCost(
        dto.items.map((i) => ({
          productId: i.productId,
          receivedQuantity: i.receivedQuantity,
          purchaseUnitCost: i.purchaseUnitCost,
        })),
        freightCost,
        otherCost,
        dutyCost,
        allocationMethod,
      );

      const totalPurchase = apportionedItems.reduce((sum, i) => sum + i.purchaseTotal, 0);
      const totalReceivedCost = totalPurchase + freightCost + otherCost + dutyCost;

      // 4. Calculate Ethiopian Withholding Tax (2% if >= 10,000 ETB)
      const withholdingTax = calculateWithholdingTax(
        totalReceivedCost,
        dto.applyWithholdingTax ?? Boolean(supplier.tin_number),
      );

      // 5. Insert goods_received_notes header
      const grnRes = await client.query<any>(
        `INSERT INTO goods_received_notes (
           branch_id, grn_number, purchase_order_id, supplier_id,
           supplier_invoice_no, supplier_invoice_date, landed_freight_cost,
           landed_other_cost, total_received_cost, withholding_tax_amount, received_by
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         RETURNING *`,
        [
          branchId,
          grnNumber,
          dto.purchaseOrderId || null,
          dto.supplierId,
          dto.supplierInvoiceNo || null,
          dto.supplierInvoiceDate || null,
          freightCost,
          otherCost + dutyCost,
          totalReceivedCost,
          withholdingTax,
          userId,
        ],
      );
      const grnRow = grnRes.rows[0];

      // 6. Process items, create batches, update AVCO, and write to stock_ledger
      const savedGRNItems: GRNItem[] = [];

      for (let idx = 0; idx < dto.items.length; idx++) {
        const itemInput = dto.items[idx];
        const apportioned = apportionedItems[idx];

        // Insert grn_items
        const grnItemRes = await client.query<any>(
          `INSERT INTO grn_items (
             grn_id, product_id, batch_number, expiry_date,
             received_quantity, purchase_unit_cost, apportioned_landed_cost, final_unit_cost
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           RETURNING *`,
          [
            grnRow.id,
            itemInput.productId,
            itemInput.batchNumber,
            itemInput.expiryDate || null,
            itemInput.receivedQuantity,
            itemInput.purchaseUnitCost,
            apportioned.apportionedLandedCost,
            apportioned.finalUnitCost,
          ],
        );
        const gir = grnItemRes.rows[0];
        savedGRNItems.push({
          id: gir.id,
          grnId: gir.grn_id,
          productId: gir.product_id,
          batchNumber: gir.batch_number,
          expiryDate: gir.expiry_date ? gir.expiry_date.toISOString().split('T')[0] : null,
          receivedQuantity: parseFloat(gir.received_quantity),
          purchaseUnitCost: parseFloat(gir.purchase_unit_cost),
          apportionedLandedCost: parseFloat(gir.apportioned_landed_cost),
          finalUnitCost: parseFloat(gir.final_unit_cost),
          createdAt: gir.created_at.toISOString(),
        });

        // Insert or update batch
        const batchRes = await client.query<any>(
          `INSERT INTO batches (
             branch_id, product_id, batch_number, expiry_date,
             unit_cost, initial_quantity, current_quantity, supplier_id
           ) VALUES ($1, $2, $3, $4, $5, $6, $6, $7)
           ON CONFLICT (branch_id, product_id, batch_number)
           DO UPDATE SET
             current_quantity = batches.current_quantity + EXCLUDED.current_quantity,
             unit_cost = EXCLUDED.unit_cost,
             updated_at = clock_timestamp()
           RETURNING id`,
          [
            branchId,
            itemInput.productId,
            itemInput.batchNumber,
            itemInput.expiryDate || null,
            apportioned.finalUnitCost,
            itemInput.receivedQuantity,
            dto.supplierId,
          ],
        );
        const batchId = batchRes.rows[0].id;

        // Query product current cost and on-hand stock for AVCO
        const prodRes = await client.query<{ cost_price: string }>(
          `SELECT cost_price FROM products WHERE id = $1`,
          [itemInput.productId],
        );
        const currentCost = prodRes.rows.length > 0 ? parseFloat(prodRes.rows[0].cost_price) : 0;

        const ledgerPrevRes = await client.query<{ balance_after: string }>(
          `SELECT balance_after FROM stock_ledger
           WHERE branch_id = $1 AND product_id = $2
           ORDER BY created_at DESC, id DESC LIMIT 1`,
          [branchId, itemInput.productId],
        );
        const currentOnHand =
          ledgerPrevRes.rows.length > 0 ? parseFloat(ledgerPrevRes.rows[0].balance_after) : 0;

        // Record append-only stock movement
        await this.inventoryService.recordMovementInTransaction(client, branchId, {
          productId: itemInput.productId,
          batchId,
          movementType: 'PURCHASE_RECEIVE',
          quantityChange: itemInput.receivedQuantity,
          unitCost: apportioned.finalUnitCost,
          referenceType: 'GRN',
          referenceId: grnRow.id,
          notes: `GRN ${grnNumber} from ${supplier.name}`,
          createdBy: userId,
          allowNegativeStock: true,
        });

        // Recalculate Weighted Average Cost (AVCO)
        const avco = calculateAVCO({
          currentOnHandQty: currentOnHand,
          currentCost,
          receivedQty: itemInput.receivedQuantity,
          receivedUnitCost: apportioned.finalUnitCost,
        });

        await client.query(
          `UPDATE products
           SET cost_price = $1, updated_at = clock_timestamp()
           WHERE id = $2`,
          [avco.newCost, itemInput.productId],
        );

        // If linked to PO, update PO item received_quantity
        if (dto.purchaseOrderId) {
          await client.query(
            `UPDATE purchase_order_items
             SET received_quantity = received_quantity + $1
             WHERE purchase_order_id = $2 AND product_id = $3`,
            [itemInput.receivedQuantity, dto.purchaseOrderId, itemInput.productId],
          );
        }
      }

      // 7. Check if linked PO is fully received
      if (dto.purchaseOrderId) {
        const poCheckRes = await client.query<any>(
          `SELECT ordered_quantity, received_quantity
           FROM purchase_order_items
           WHERE purchase_order_id = $1`,
          [dto.purchaseOrderId],
        );

        const allReceived = poCheckRes.rows.every(
          (row) => parseFloat(row.received_quantity) >= parseFloat(row.ordered_quantity),
        );

        const newPoStatus = allReceived ? 'COMPLETED' : 'PARTIALLY_RECEIVED';
        await client.query(
          `UPDATE purchase_orders
           SET status = $1, updated_at = clock_timestamp()
           WHERE id = $2`,
          [newPoStatus, dto.purchaseOrderId],
        );
      }

      // 8. Create Supplier Payable in ONE transaction
      const paymentTermsDays = supplier.payment_terms_days
        ? parseInt(supplier.payment_terms_days, 10) || 0
        : 0;
      const invDate = dto.supplierInvoiceDate ? new Date(dto.supplierInvoiceDate) : new Date();
      const dueDate = new Date(invDate.getTime() + paymentTermsDays * 86400000);
      const netPayable = Number((totalReceivedCost - withholdingTax).toFixed(4));
      let payableId: string | null = null;

      try {
        const payRes = await client.query(
          `INSERT INTO supplier_payables (
            branch_id, supplier_id, grn_id, invoice_number, invoice_date, due_date,
            total_amount, withholding_amount, net_payable, paid_amount, status
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 0, 'UNPAID')
          RETURNING id`,
          [
            branchId,
            dto.supplierId,
            grnRow.id,
            dto.supplierInvoiceNo || grnNumber,
            invDate,
            dueDate,
            Number(totalReceivedCost.toFixed(4)),
            withholdingTax,
            netPayable,
          ],
        );
        payableId = payRes?.rows?.[0]?.id || null;
      } catch (err: any) {
        this.logger.warn(`Could not insert into supplier_payables: ${err.message}`);
      }

      return {
        id: grnRow.id,
        branchId: grnRow.branch_id,
        grnNumber: grnRow.grn_number,
        purchaseOrderId: grnRow.purchase_order_id,
        supplierId: grnRow.supplier_id,
        supplierInvoiceNo: grnRow.supplier_invoice_no,
        supplierInvoiceDate: grnRow.supplier_invoice_date
          ? grnRow.supplier_invoice_date.toISOString().split('T')[0]
          : null,
        landedFreightCost: parseFloat(grnRow.landed_freight_cost),
        landedOtherCost: parseFloat(grnRow.landed_other_cost),
        totalReceivedCost: parseFloat(grnRow.total_received_cost),
        withholdingTaxAmount: parseFloat(grnRow.withholding_tax_amount),
        netSupplierPayable: netPayable,
        payableId,
        dueDate: dueDate.toISOString().split('T')[0],
        receivedBy: grnRow.received_by,
        createdAt: grnRow.created_at.toISOString(),
        items: savedGRNItems,
      };
    });
  }

  /**
   * Retrieves a Goods Received Note by ID.
   */
  async getGRN(grnId: string): Promise<GoodsReceivedNote> {
    const res = await this.db.query<any>(
      `SELECT * FROM goods_received_notes WHERE id = $1`,
      [grnId],
    );

    if (res.rows.length === 0) {
      throw new NotFoundException(`GRN ${grnId} not found`);
    }
    const grn = res.rows[0];

    const itemsRes = await this.db.query<any>(
      `SELECT * FROM grn_items WHERE grn_id = $1`,
      [grnId],
    );

    return {
      id: grn.id,
      branchId: grn.branch_id,
      grnNumber: grn.grn_number,
      purchaseOrderId: grn.purchase_order_id,
      supplierId: grn.supplier_id,
      supplierInvoiceNo: grn.supplier_invoice_no,
      supplierInvoiceDate: grn.supplier_invoice_date
        ? grn.supplier_invoice_date.toISOString().split('T')[0]
        : null,
      landedFreightCost: parseFloat(grn.landed_freight_cost),
      landedOtherCost: parseFloat(grn.landed_other_cost),
      totalReceivedCost: parseFloat(grn.total_received_cost),
      withholdingTaxAmount: parseFloat(grn.withholding_tax_amount),
      receivedBy: grn.received_by,
      createdAt: grn.created_at.toISOString(),
      items: itemsRes.rows.map((gir: any) => ({
        id: gir.id,
        grnId: gir.grn_id,
        productId: gir.product_id,
        batchNumber: gir.batch_number,
        expiryDate: gir.expiry_date ? gir.expiry_date.toISOString().split('T')[0] : null,
        receivedQuantity: parseFloat(gir.received_quantity),
        purchaseUnitCost: parseFloat(gir.purchase_unit_cost),
        apportionedLandedCost: parseFloat(gir.apportioned_landed_cost),
        finalUnitCost: parseFloat(gir.final_unit_cost),
        createdAt: gir.created_at.toISOString(),
      })),
    };
  }

  /**
   * Retrieves all Purchase Orders for a branch.
   */
  async getPurchaseOrders(branchId?: string): Promise<any[]> {
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

    const res = await this.db.query<any>(query, params);
    return res.rows.map((r: any) => ({
      id: r.id,
      branchId: r.branch_id,
      orderNumber: r.order_number,
      supplierId: r.supplier_id,
      supplierName: r.supplier_name,
      supplierCode: r.supplier_code,
      supplierPhone: r.supplier_phone,
      itemCount: parseInt(r.item_count || '0', 10),
      status: r.status,
      expectedDeliveryDate: r.expected_delivery_date
        ? r.expected_delivery_date.toISOString().split('T')[0]
        : null,
      subtotal: parseFloat(r.subtotal),
      taxTotal: parseFloat(r.tax_total),
      grandTotal: parseFloat(r.grand_total),
      notes: r.notes,
      createdBy: r.created_by,
      createdAt: r.created_at.toISOString(),
      updatedAt: r.updated_at.toISOString(),
    }));
  }

  /**
   * Retrieves single Purchase Order by ID.
   */
  async getPurchaseOrder(poId: string): Promise<any> {
    const res = await this.db.query<any>(
      `SELECT po.*, s.name as supplier_name, s.code as supplier_code, s.phone as supplier_phone, s.tin_number, s.payment_terms_days
       FROM purchase_orders po
       JOIN suppliers s ON s.id = po.supplier_id
       WHERE po.id = $1`,
      [poId],
    );

    if (res.rows.length === 0) {
      throw new NotFoundException(`Purchase Order ${poId} not found`);
    }

    const r = res.rows[0];
    const itemsRes = await this.db.query<any>(
      `SELECT poi.*, p.name_en, p.name_am, p.sku, p.base_unit
       FROM purchase_order_items poi
       JOIN products p ON p.id = poi.product_id
       WHERE poi.purchase_order_id = $1
       ORDER BY poi.id ASC`,
      [poId],
    );

    return {
      id: r.id,
      branchId: r.branch_id,
      orderNumber: r.order_number,
      supplierId: r.supplier_id,
      supplierName: r.supplier_name,
      supplierCode: r.supplier_code,
      supplierPhone: r.supplier_phone,
      tinNumber: r.tin_number,
      paymentTermsDays: r.payment_terms_days,
      status: r.status,
      expectedDeliveryDate: r.expected_delivery_date
        ? r.expected_delivery_date.toISOString().split('T')[0]
        : null,
      subtotal: parseFloat(r.subtotal),
      taxTotal: parseFloat(r.tax_total),
      grandTotal: parseFloat(r.grand_total),
      notes: r.notes,
      createdBy: r.created_by,
      createdAt: r.created_at.toISOString(),
      updatedAt: r.updated_at.toISOString(),
      items: itemsRes.rows.map((ir: any) => ({
        id: ir.id,
        purchaseOrderId: ir.purchase_order_id,
        productId: ir.product_id,
        nameEn: ir.name_en,
        nameAm: ir.name_am,
        sku: ir.sku,
        baseUnit: ir.base_unit,
        orderedQuantity: parseFloat(ir.ordered_quantity),
        receivedQuantity: parseFloat(ir.received_quantity),
        unitCost: parseFloat(ir.unit_cost),
        taxRate: parseFloat(ir.tax_rate),
        totalCost: parseFloat(ir.total_cost),
      })),
    };
  }

  /**
   * Lists all GRNs for a branch.
   */
  async getGRNList(branchId?: string): Promise<any[]> {
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

    const res = await this.db.query<any>(query, params);
    return res.rows.map((r: any) => ({
      id: r.id,
      branchId: r.branch_id,
      grnNumber: r.grn_number,
      purchaseOrderId: r.purchase_order_id,
      poOrderNumber: r.po_order_number,
      supplierId: r.supplier_id,
      supplierName: r.supplier_name,
      supplierCode: r.supplier_code,
      supplierInvoiceNo: r.supplier_invoice_no,
      supplierInvoiceDate: r.supplier_invoice_date
        ? r.supplier_invoice_date.toISOString().split('T')[0]
        : null,
      landedFreightCost: parseFloat(r.landed_freight_cost),
      landedOtherCost: parseFloat(r.landed_other_cost),
      totalReceivedCost: parseFloat(r.total_received_cost),
      withholdingTaxAmount: parseFloat(r.withholding_tax_amount),
      itemCount: parseInt(r.item_count || '0', 10),
      receivedBy: r.received_by,
      createdAt: r.created_at.toISOString(),
    }));
  }

  /**
   * Approves a high-value purchase order with manager authorization PIN.
   */
  async approvePurchaseOrder(userId: string, poId: string, managerPin: string): Promise<any> {
    if (managerPin !== '1234') {
      throw new BadRequestException('Invalid manager authorization PIN');
    }

    const res = await this.db.query<any>(
      `UPDATE purchase_orders
       SET status = 'APPROVED', approved_by = $1, approved_at = clock_timestamp(), updated_at = clock_timestamp()
       WHERE id = $2
       RETURNING *`,
      [userId, poId],
    );

    if (res.rows.length === 0) {
      throw new NotFoundException(`Purchase Order ${poId} not found`);
    }
    return res.rows[0];
  }

  /**
   * Dispatches/sends approved purchase order to supplier.
   */
  async sendPurchaseOrder(poId: string): Promise<any> {
    const res = await this.db.query<any>(
      `UPDATE purchase_orders
       SET status = 'SENT', updated_at = clock_timestamp()
       WHERE id = $1
       RETURNING *`,
      [poId],
    );

    if (res.rows.length === 0) {
      throw new NotFoundException(`Purchase Order ${poId} not found`);
    }
    return res.rows[0];
  }

  /**
   * Retrieves payables and aging report for suppliers.
   */
  async listPayables(branchId?: string): Promise<any[]> {
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
      const res = await this.db.query<any>(query, params);
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
  async recordSupplierPayment(userId: string, dto: RecordSupplierPaymentDto): Promise<any> {
    return this.db.withTransaction(async (client) => {
      const paymentNumber = `PAY-${Date.now().toString().slice(-8)}`;

      const payRes = await client.query<any>(
        `INSERT INTO supplier_payments (
          branch_id, supplier_id, payable_id, payment_number, amount,
          payment_method, reference_number, notes, paid_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING *`,
        [
          dto.branchId,
          dto.supplierId,
          dto.payableId || null,
          paymentNumber,
          dto.amount,
          dto.paymentMethod,
          dto.referenceNumber || null,
          dto.notes || null,
          userId,
        ],
      );

      if (dto.payableId) {
        const pRes = await client.query<any>(
          `SELECT net_payable, paid_amount FROM supplier_payables WHERE id = $1 FOR UPDATE`,
          [dto.payableId],
        );
        if (pRes.rows.length > 0) {
          const currentPaid = parseFloat(pRes.rows[0].paid_amount);
          const netPayable = parseFloat(pRes.rows[0].net_payable);
          const newPaid = Number((currentPaid + dto.amount).toFixed(4));
          const newStatus = newPaid >= netPayable ? 'PAID' : 'PARTIALLY_PAID';

          await client.query(
            `UPDATE supplier_payables 
             SET paid_amount = $1, status = $2, updated_at = clock_timestamp()
             WHERE id = $3`,
            [newPaid, newStatus, dto.payableId],
          );
        }
      }

      return payRes.rows[0];
    });
  }

  /**
   * Processes Return to Supplier (Purchase Return) creating reversing stock movements.
   */
  async processSupplierReturn(userId: string, dto: CreateSupplierReturnDto): Promise<any> {
    return this.db.withTransaction(async (client) => {
      const returnNumber = `RET-${Date.now().toString().slice(-8)}`;

      let totalReturnValue = 0;
      for (const item of dto.items) {
        totalReturnValue += item.quantity * item.unitCost;
      }
      totalReturnValue = Number(totalReturnValue.toFixed(4));

      const retRes = await client.query<any>(
        `INSERT INTO supplier_returns (
          branch_id, supplier_id, grn_id, return_number, status,
          total_return_value, reason, created_by
        ) VALUES ($1, $2, $3, $4, 'CONFIRMED', $5, $6, $7)
        RETURNING *`,
        [
          dto.branchId,
          dto.supplierId,
          dto.grnId || null,
          returnNumber,
          totalReturnValue,
          dto.reason,
          userId,
        ],
      );
      const retId = retRes.rows[0].id;

      for (const item of dto.items) {
        const lineTotal = Number((item.quantity * item.unitCost).toFixed(4));

        await client.query(
          `INSERT INTO supplier_return_items (
            return_id, product_id, batch_id, quantity, unit_cost, total_cost, reason
          ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            retId,
            item.productId,
            item.batchId || null,
            item.quantity,
            item.unitCost,
            lineTotal,
            item.reason,
          ],
        );

        // Record reversing stock movement (negative quantityChange)
        await this.inventoryService.recordMovementInTransaction(client, dto.branchId, {
          productId: item.productId,
          batchId: item.batchId,
          movementType: 'PURCHASE_RETURN',
          quantityChange: -item.quantity,
          unitCost: item.unitCost,
          referenceType: 'RETURN',
          referenceId: retId,
          notes: `Purchase Return ${returnNumber}: ${item.reason}`,
          createdBy: userId,
          allowNegativeStock: true,
        });
      }

      return {
        ...retRes.rows[0],
        items: dto.items,
      };
    });
  }
}

