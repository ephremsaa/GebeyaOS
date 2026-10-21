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

      // 4. Insert purchase_orders header
      const poRes = await client.query<any>(
        `INSERT INTO purchase_orders (
           branch_id, order_number, supplier_id, status, expected_delivery_date,
           subtotal, tax_total, grand_total, notes, created_by
         ) VALUES ($1, $2, $3, 'DRAFT', $4, $5, $6, $7, $8, $9)
         RETURNING *`,
        [
          branchId,
          orderNumber,
          dto.supplierId,
          dto.expectedDeliveryDate || null,
          subtotal,
          taxTotal,
          grandTotal,
          dto.notes || null,
          userId,
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
      const apportionedItems = apportionLandedCost(
        dto.items.map((i) => ({
          productId: i.productId,
          receivedQuantity: i.receivedQuantity,
          purchaseUnitCost: i.purchaseUnitCost,
        })),
        freightCost,
        otherCost,
      );

      const totalPurchase = apportionedItems.reduce((sum, i) => sum + i.purchaseTotal, 0);
      const totalReceivedCost = totalPurchase + freightCost + otherCost;

      // 4. Calculate Ethiopian Withholding Tax (2% if >= 10,000 ETB)
      const withholdingTax = calculateWithholdingTax(
        totalReceivedCost,
        Boolean(supplier.tin_number),
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
          otherCost,
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
}
