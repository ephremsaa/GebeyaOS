import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { DatabaseService } from '../../common/database/database.service';
import { generateUuidV7 } from '../../common/utils/uuidv7';
import { PricingCalculatorService } from '../products/domain/pricing-calculator.service';
import { InventoryService } from '../inventory/inventory.service';
import { ReceiptNumberGenerator } from './domain/receipt-number-generator';
import { PaymentAdapterFactory } from './domain/payment-adapters/payment-adapters';
import { FiscalReceiptAdapter, FiscalReceiptData } from './domain/fiscal/fiscal-receipt-adapter';
import {
  OpenShiftDto,
  CloseShiftDto,
  CashMovementDto,
  CreateSaleDto,
  CreateRefundDto,
  ReprintReceiptDto,
} from './dto/pos.dto';

@Injectable()
export class PosService {
  private readonly logger = new Logger(PosService.name);
  private readonly pricingCalculator = new PricingCalculatorService();
  private readonly fiscalAdapter = new FiscalReceiptAdapter();

  constructor(
    private readonly db: DatabaseService,
    private readonly inventoryService: InventoryService,
  ) {}

  /**
   * Opens a new POS lane register shift with initial float.
   */
  async openShift(cashierId: string, dto: OpenShiftDto) {
    // 1. Check if terminal already has an active open shift
    const existing = await this.db.query(
      `SELECT id FROM shifts WHERE terminal_id = $1 AND status = 'OPEN'`,
      [dto.terminal_id],
    );
    if (existing.rowCount && existing.rowCount > 0) {
      throw new BadRequestException('Terminal already has an active OPEN shift. Close it first.');
    }

    // 2. Fetch terminal branch_id
    const termRes = await this.db.query(
      `SELECT branch_id FROM terminals WHERE id = $1 AND is_active = TRUE`,
      [dto.terminal_id],
    );
    if (termRes.rowCount === 0) {
      throw new NotFoundException(`Terminal '${dto.terminal_id}' not found or inactive.`);
    }
    const branchId = termRes.rows[0].branch_id;

    // 3. Monotonic shift number for this terminal
    const countRes = await this.db.query<{ max_shift: string }>(
      `SELECT COALESCE(MAX(shift_number), 0) as max_shift FROM shifts WHERE terminal_id = $1`,
      [dto.terminal_id],
    );
    const nextShiftNum = parseInt(countRes.rows[0].max_shift, 10) + 1;

    const shiftId = generateUuidV7();
    const result = await this.db.query(
      `INSERT INTO shifts (
        id, branch_id, terminal_id, cashier_id, shift_number, opening_cash_float, status
      ) VALUES ($1, $2, $3, $4, $5, $6, 'OPEN')
      RETURNING *`,
      [shiftId, branchId, dto.terminal_id, cashierId, nextShiftNum, dto.opening_cash_float],
    );

    return result.rows[0];
  }

  /**
   * Records cash movement (Safe Drop, Petty Cash Out, Additional Float).
   */
  async recordCashMovement(shiftId: string, cashierId: string, dto: CashMovementDto) {
    const shift = await this.db.query(
      `SELECT branch_id, status FROM shifts WHERE id = $1`,
      [shiftId],
    );
    if (shift.rowCount === 0) {
      throw new NotFoundException(`Shift '${shiftId}' not found.`);
    }
    if (shift.rows[0].status !== 'OPEN') {
      throw new BadRequestException('Cannot record cash movement on a closed shift.');
    }

    const movementId = generateUuidV7();
    const result = await this.db.query(
      `INSERT INTO cash_movements (
        id, shift_id, branch_id, movement_type, amount, reason, authorized_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *`,
      [
        movementId,
        shiftId,
        shift.rows[0].branch_id,
        dto.movement_type,
        dto.amount,
        dto.reason,
        dto.authorized_by || cashierId,
      ],
    );

    return result.rows[0];
  }

  /**
   * Closes cashier shift, calculates expected cash, and reconciles cash variance.
   */
  async closeShift(shiftId: string, cashierId: string, dto: CloseShiftDto) {
    return this.db.withTransaction(async (client) => {
      const shiftRes = await client.query(
        `SELECT * FROM shifts WHERE id = $1 FOR UPDATE`,
        [shiftId],
      );
      if (shiftRes.rowCount === 0) {
        throw new NotFoundException(`Shift '${shiftId}' not found.`);
      }
      const shift = shiftRes.rows[0];
      if (shift.status !== 'OPEN') {
        throw new BadRequestException('Shift is already closed.');
      }

      // Calculate cash sales in this shift
      const salesCashRes = await client.query<{ total_cash: string }>(
        `SELECT COALESCE(SUM(p.amount), 0) as total_cash
         FROM sale_payments p
         JOIN sales s ON s.id = p.sale_id
         WHERE s.shift_id = $1 AND p.payment_method = 'CASH'`,
        [shiftId],
      );
      const totalCashSales = parseFloat(salesCashRes.rows[0].total_cash);

      // Calculate cash movements
      const movRes = await client.query<{
        cash_in: string;
        cash_out: string;
      }>(
        `SELECT 
           COALESCE(SUM(CASE WHEN movement_type IN ('FLOAT_IN', 'ADDITIONAL_FLOAT') THEN amount ELSE 0 END), 0) as cash_in,
           COALESCE(SUM(CASE WHEN movement_type IN ('PETTY_CASH_OUT', 'SAFE_DROP') THEN amount ELSE 0 END), 0) as cash_out
         FROM cash_movements
         WHERE shift_id = $1`,
        [shiftId],
      );
      const cashIn = parseFloat(movRes.rows[0].cash_in);
      const cashOut = parseFloat(movRes.rows[0].cash_out);

      // Expected Cash = Opening Float + Cash Sales + Cash In - Cash Out
      const openingFloat = parseFloat(shift.opening_cash_float);
      const expectedCash = Number((openingFloat + totalCashSales + cashIn - cashOut).toFixed(4));
      const countedCash = Number(dto.closing_cash_counted.toFixed(4));
      const cashVariance = Number((countedCash - expectedCash).toFixed(4));

      const updateRes = await client.query(
        `UPDATE shifts
         SET closing_cash_counted = $1,
             expected_cash_system = $2,
             status = 'CLOSED',
             notes = COALESCE($3, notes),
             closed_at = clock_timestamp()
         WHERE id = $4
         RETURNING *`,
        [countedCash, expectedCash, dto.notes || null, shiftId],
      );

      return {
        ...updateRes.rows[0],
        opening_cash_float: openingFloat,
        total_cash_sales: totalCashSales,
        cash_in_adjustments: cashIn,
        cash_out_adjustments: cashOut,
        expected_cash: expectedCash,
        counted_cash: countedCash,
        cash_variance: cashVariance,
      };
    });
  }

  /**
   * Main POS Checkout Transaction Engine.
   * Atomic DB transaction covering pricing, inventory FEFO deduction, payments, receipt generation, and fiscal logs.
   */
  async processSale(cashierId: string, dto: CreateSaleDto) {
    return this.db.withTransaction(async (client) => {
      // 1. Verify shift is OPEN
      const shiftRes = await client.query(
        `SELECT * FROM shifts WHERE id = $1 AND status = 'OPEN'`,
        [dto.shift_id],
      );
      if (shiftRes.rowCount === 0) {
        throw new BadRequestException('Cashier shift is not OPEN.');
      }
      const shift = shiftRes.rows[0];

      // 2. Fetch branch & terminal info
      const branchRes = await client.query('SELECT * FROM branches WHERE id = $1', [dto.branch_id]);
      if (branchRes.rowCount === 0) throw new NotFoundException('Branch not found.');
      const branch = branchRes.rows[0];

      const termRes = await client.query('SELECT * FROM terminals WHERE id = $1', [dto.terminal_id]);
      if (termRes.rowCount === 0) throw new NotFoundException('Terminal not found.');
      const terminal = termRes.rows[0];

      const cashierRes = await client.query(
        `SELECT u.full_name, r.max_discount_percentage 
         FROM users u 
         JOIN roles r ON r.id = u.role_id 
         WHERE u.id = $1`,
        [cashierId],
      );
      const cashierName = cashierRes.rowCount ? cashierRes.rows[0].full_name : 'Cashier';
      const maxDiscountPct = cashierRes.rowCount ? parseFloat(cashierRes.rows[0].max_discount_percentage) : 0;

      const allowNegativeStock = Boolean(branch.settings?.allow_negative_stock);

      // 3. Process line items: prices, discounts, tax, and FEFO inventory deduction
      let grossSubtotal = 0;
      let totalDiscount = 0;
      let taxableSubtotal = 0;
      let taxExemptSubtotal = 0;
      let totalVatAmount = 0;

      const processedItems: Array<{
        productId: string;
        name: string;
        quantity: number;
        unitPrice: number;
        unitCost: number;
        discountAmount: number;
        discountReason?: string;
        isVatApplicable: boolean;
        vatRate: number;
        taxAmount: number;
        taxableSubtotal: number;
        lineTotal: number;
        batchId: string | null;
        barcode?: string;
      }> = [];

      for (const itemInput of dto.items) {
        // Fetch product snapshot
        const prodRes = await client.query(
          `SELECT p.*, o.selling_price as override_price, o.is_vat_applicable as override_vat, o.vat_rate as override_vat_rate
           FROM products p
           LEFT JOIN branch_product_overrides o ON o.product_id = p.id AND o.branch_id = $1 AND o.is_active = TRUE
           WHERE p.id = $2`,
          [dto.branch_id, itemInput.product_id],
        );
        if (prodRes.rowCount === 0) {
          throw new NotFoundException(`Product '${itemInput.product_id}' not found.`);
        }
        const prod = prodRes.rows[0];

        // Check discount authorization
        if (itemInput.discount_percentage && itemInput.discount_percentage > maxDiscountPct) {
          throw new ForbiddenException(
            `Discount ${itemInput.discount_percentage}% exceeds role maximum limit of ${maxDiscountPct}%.`,
          );
        }

        const { effectivePrice, isVatApplicable, vatRate } =
          this.pricingCalculator.resolvePriceAndTax(
            parseFloat(prod.base_price),
            prod.is_vat_applicable,
            parseFloat(prod.vat_rate),
            prod.override_price !== null ? {
              selling_price: prod.override_price,
              is_vat_applicable: prod.override_vat,
              vat_rate: prod.override_vat_rate,
            } : null,
          );

        const calc = this.pricingCalculator.calculateLineItem({
          quantity: itemInput.quantity,
          unitPrice: effectivePrice,
          isVatApplicable,
          vatRate,
          discountAmount: itemInput.discount_amount,
          discountPercentage: itemInput.discount_percentage,
        });

        // FEFO Inventory Allocation
        const fefo = await this.inventoryService.allocateFefo(
          client,
          dto.branch_id,
          prod.id,
          calc.quantity,
          allowNegativeStock,
        );

        // Deduct inventory in append-only stock ledger
        const primaryBatchId = fefo.allocations.length > 0 ? fefo.allocations[0].batchId : null;
        const avgUnitCost = fefo.allocations.length > 0 ? fefo.allocations[0].unitCost : parseFloat(prod.cost_price);

        for (const alloc of fefo.allocations) {
          await this.inventoryService.recordMovement(
            {
              branchId: dto.branch_id,
              productId: prod.id,
              batchId: alloc.batchId,
              movementType: 'SALE',
              quantityChange: -alloc.allocatedQuantity,
              unitCost: alloc.unitCost,
              referenceType: 'SALE',
              referenceId: dto.shift_id,
              notes: `POS Checkout Terminal ${terminal.code}`,
              createdBy: cashierId,
            },
            client,
          );
        }

        grossSubtotal += calc.grossAmount;
        totalDiscount += calc.discountAmount;
        totalVatAmount += calc.taxAmount;

        if (calc.taxAmount > 0) {
          taxableSubtotal += calc.taxableSubtotal;
        } else {
          taxExemptSubtotal += calc.lineTotal;
        }

        processedItems.push({
          productId: prod.id,
          name: prod.name_en,
          quantity: calc.quantity,
          unitPrice: calc.unitPrice,
          unitCost: avgUnitCost,
          discountAmount: calc.discountAmount,
          discountReason: itemInput.discount_reason,
          isVatApplicable: calc.taxAmount > 0,
          vatRate,
          taxAmount: calc.taxAmount,
          taxableSubtotal: calc.taxableSubtotal,
          lineTotal: calc.lineTotal,
          batchId: primaryBatchId,
          barcode: itemInput.barcode,
        });
      }

      const grandTotal = Number((grossSubtotal - totalDiscount).toFixed(4));

      // 4. Validate & Process Split Payments
      let totalPaid = 0;
      const processedPayments: Array<{
        id: string;
        method: string;
        amount: number;
        reference: string;
        isOfflineVerified: boolean;
        metadata: any;
      }> = [];

      for (const pInput of dto.payments) {
        const adapter = PaymentAdapterFactory.getAdapter(pInput.payment_method);
        const result = await adapter.process({
          paymentMethod: pInput.payment_method,
          amount: pInput.amount,
          providerReference: pInput.provider_reference,
          isOfflineVerified: pInput.is_offline_verified,
          metadata: pInput.metadata,
        });

        if (!result.success) {
          throw new BadRequestException(`Payment failed: ${result.errorMessage}`);
        }

        totalPaid += result.amount;
        processedPayments.push({
          id: generateUuidV7(),
          method: result.paymentMethod,
          amount: result.amount,
          reference: result.providerReference,
          isOfflineVerified: result.isOfflineVerified,
          metadata: result.metadata,
        });
      }

      totalPaid = Number(totalPaid.toFixed(4));
      if (totalPaid < grandTotal) {
        throw new BadRequestException(
          `Insufficient payment. Total due: ${grandTotal} ETB, Total paid: ${totalPaid} ETB.`,
        );
      }

      const changeGiven = Number((totalPaid - grandTotal).toFixed(4));

      // 5. Generate Offline-Safe Monotonic Receipt Number
      const seqRes = await client.query<{ count: string }>(
        `SELECT COUNT(*) as count FROM sales WHERE terminal_id = $1 AND shift_id = $2`,
        [dto.terminal_id, dto.shift_id],
      );
      const nextReceiptSeq = parseInt(seqRes.rows[0].count, 10) + 1;
      const now = new Date();
      const receiptNumber = ReceiptNumberGenerator.generate(
        branch.code,
        terminal.code,
        shift.shift_number,
        nextReceiptSeq,
        now,
      );

      const saleId = generateUuidV7();

      // 6. Insert Sale Record
      await client.query(
        `INSERT INTO sales (
          id, branch_id, terminal_id, shift_id, receipt_number, cashier_id,
          subtotal, discount_total, taxable_subtotal, tax_exempt_subtotal,
          tax_total, grand_total, total_paid, change_given,
          payment_status, fiscal_status, client_timestamp, server_timestamp
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, 'PAID', 'FISCALIZED', $15, clock_timestamp())`,
        [
          saleId,
          dto.branch_id,
          dto.terminal_id,
          dto.shift_id,
          receiptNumber,
          cashierId,
          grossSubtotal,
          totalDiscount,
          taxableSubtotal,
          taxExemptSubtotal,
          totalVatAmount,
          grandTotal,
          totalPaid,
          changeGiven,
          dto.client_timestamp ? new Date(dto.client_timestamp) : now,
        ],
      );

      // 7. Insert Sale Items
      for (const item of processedItems) {
        await client.query(
          `INSERT INTO sale_items (
            id, sale_id, product_id, batch_id, barcode, item_name_snapshot,
            quantity, unit_price, unit_cost, discount_amount, discount_reason,
            is_vat_applicable, tax_rate, tax_amount, line_total
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
          [
            generateUuidV7(),
            saleId,
            item.productId,
            item.batchId,
            item.barcode || null,
            item.name,
            item.quantity,
            item.unitPrice,
            item.unitCost,
            item.discountAmount,
            item.discountReason || null,
            item.isVatApplicable,
            item.vatRate,
            item.taxAmount,
            item.lineTotal,
          ],
        );
      }

      // 8. Insert Payments
      for (const p of processedPayments) {
        await client.query(
          `INSERT INTO sale_payments (
            id, sale_id, payment_method, amount, provider_reference, is_offline_verified, metadata
          ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [p.id, saleId, p.method, p.amount, p.reference, p.isOfflineVerified, JSON.stringify(p.metadata)],
        );
      }

      // 9. Format Fiscal Data & Log
      const receiptData: FiscalReceiptData = {
        branchName: branch.name,
        branchTradeName: branch.trade_name,
        branchAddress: `${branch.city}, ${branch.subcity || ''}`,
        branchPhone: branch.phone,
        tinNumber: branch.tin_number,
        vatRegistrationNo: branch.vat_registration_no,
        terminalCode: terminal.code,
        cashierName,
        receiptNumber,
        fiscalMrc: terminal.code,
        fiscalReceiptNo: receiptNumber,
        createdAt: now,
        items: processedItems.map((i) => ({
          name: i.name,
          quantity: i.quantity,
          unitPrice: i.unitPrice,
          discountAmount: i.discountAmount,
          isVatApplicable: i.isVatApplicable,
          vatRate: i.vatRate,
          lineTotal: i.lineTotal,
        })),
        subtotal: grossSubtotal,
        discountTotal: totalDiscount,
        taxableSubtotal,
        taxExemptSubtotal,
        taxTotal: totalVatAmount,
        grandTotal,
        payments: processedPayments.map((p) => ({
          method: p.method,
          amount: p.amount,
          reference: p.reference,
        })),
        changeGiven,
        reprintCount: 0,
      };

      const receiptText = this.fiscalAdapter.generateReceiptText(receiptData);
      const fiscalPayload = this.fiscalAdapter.generateFiscalPayload(receiptData);

      await client.query(
        `INSERT INTO fiscal_receipt_logs (
          id, sale_id, branch_id, terminal_id, payload, fiscal_receipt_number, daily_z_counter, status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'SUCCESS')`,
        [
          generateUuidV7(),
          saleId,
          dto.branch_id,
          dto.terminal_id,
          JSON.stringify(fiscalPayload),
          receiptNumber,
          shift.shift_number,
        ],
      );

      return {
        sale_id: saleId,
        receipt_number: receiptNumber,
        grand_total: grandTotal,
        total_paid: totalPaid,
        change_given: changeGiven,
        items_count: processedItems.length,
        receipt_text: receiptText,
      };
    });
  }

  /**
   * Processes returns and customer refunds with manager authorization.
   */
  async processRefund(cashierId: string, dto: CreateRefundDto) {
    return this.db.withTransaction(async (client) => {
      // 1. Verify manager authorization
      const authUser = await client.query(
        `SELECT u.id, r.name FROM users u JOIN roles r ON r.id = u.role_id WHERE u.id = $1`,
        [dto.authorized_by],
      );
      if (authUser.rowCount === 0) {
        throw new ForbiddenException('Invalid manager authorization.');
      }

      // 2. Fetch original sale
      const saleRes = await client.query('SELECT * FROM sales WHERE id = $1', [dto.original_sale_id]);
      if (saleRes.rowCount === 0) {
        throw new NotFoundException(`Original sale '${dto.original_sale_id}' not found.`);
      }
      const sale = saleRes.rows[0];

      let totalRefundAmount = 0;
      let totalTaxRefund = 0;
      const refundId = generateUuidV7();
      const refundNumber = `REF-${Date.now().toString().slice(-8)}`;

      for (const item of dto.items) {
        const originalItemRes = await client.query(
          `SELECT * FROM sale_items WHERE id = $1 AND sale_id = $2`,
          [item.original_sale_item_id, dto.original_sale_id],
        );
        if (originalItemRes.rowCount === 0) {
          throw new NotFoundException(`Sale item '${item.original_sale_item_id}' not found in original sale.`);
        }
        const origItem = originalItemRes.rows[0];

        const itemRefundTotal = Number((item.quantity * item.refund_unit_price).toFixed(4));
        const itemTaxRefund = origItem.is_vat_applicable
          ? Number((itemRefundTotal - itemRefundTotal / (1 + parseFloat(origItem.tax_rate))).toFixed(4))
          : 0;

        totalRefundAmount += itemRefundTotal;
        totalTaxRefund += itemTaxRefund;

        // Return to inventory if enabled
        if (item.return_to_inventory ?? true) {
          await this.inventoryService.recordMovement(
            {
              branchId: sale.branch_id,
              productId: item.product_id,
              batchId: item.batch_id || origItem.batch_id,
              movementType: 'SALE_REFUND',
              quantityChange: item.quantity, // Positive in
              unitCost: parseFloat(origItem.unit_cost),
              referenceType: 'REFUND',
              referenceId: refundId,
              notes: `Refund: ${dto.reason}`,
              createdBy: cashierId,
            },
            client,
          );
        }
      }

      // Insert refund record
      await client.query(
        `INSERT INTO sale_refunds (
          id, branch_id, original_sale_id, refund_number, cashier_id, authorized_by,
          reason, total_refund_amount, tax_refund_amount
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          refundId,
          sale.branch_id,
          dto.original_sale_id,
          refundNumber,
          cashierId,
          dto.authorized_by,
          dto.reason,
          totalRefundAmount,
          totalTaxRefund,
        ],
      );

      // Update original sale status
      await client.query(
        `UPDATE sales SET payment_status = 'FULLY_REFUNDED' WHERE id = $1`,
        [dto.original_sale_id],
      );

      return {
        refund_id: refundId,
        refund_number: refundNumber,
        total_refund_amount: totalRefundAmount,
        tax_refund_amount: totalTaxRefund,
      };
    });
  }

  /**
   * Reprints a customer receipt with reprint count audit increment.
   */
  async reprintReceipt(saleId: string, cashierId: string, dto: ReprintReceiptDto) {
    return this.db.withTransaction(async (client) => {
      const saleRes = await client.query('SELECT * FROM sales WHERE id = $1 FOR UPDATE', [saleId]);
      if (saleRes.rowCount === 0) {
        throw new NotFoundException(`Sale '${saleId}' not found.`);
      }
      const sale = saleRes.rows[0];

      const newReprintCount = sale.reprint_count + 1;
      await client.query('UPDATE sales SET reprint_count = $1 WHERE id = $2', [newReprintCount, saleId]);

      // Audit log reprint
      await client.query(
        `INSERT INTO audit_logs (id, branch_id, user_id, action, entity_name, entity_id, details)
         VALUES ($1, $2, $3, 'RECEIPT_REPRINT', 'sales', $4, $5)`,
        [
          generateUuidV7(),
          sale.branch_id,
          cashierId,
          saleId,
          JSON.stringify({ reason: dto.reason, reprint_count: newReprintCount }),
        ],
      );

      // Fetch items and payments to regenerate receipt
      const items = await client.query('SELECT * FROM sale_items WHERE sale_id = $1', [saleId]);
      const payments = await client.query('SELECT * FROM sale_payments WHERE sale_id = $1', [saleId]);
      const branch = await client.query('SELECT * FROM branches WHERE id = $1', [sale.branch_id]);
      const term = await client.query('SELECT * FROM terminals WHERE id = $1', [sale.terminal_id]);
      const cashier = await client.query('SELECT full_name FROM users WHERE id = $1', [cashierId]);

      const b = branch.rows[0];
      const t = term.rows[0];

      const receiptData: FiscalReceiptData = {
        branchName: b.name,
        branchTradeName: b.trade_name,
        branchAddress: `${b.city}, ${b.subcity || ''}`,
        branchPhone: b.phone,
        tinNumber: b.tin_number,
        vatRegistrationNo: b.vat_registration_no,
        terminalCode: t.code,
        cashierName: cashier.rows[0]?.full_name || 'Cashier',
        receiptNumber: sale.receipt_number,
        fiscalReceiptNo: sale.receipt_number,
        createdAt: new Date(sale.created_at),
        items: items.rows.map((i) => ({
          name: i.item_name_snapshot,
          quantity: parseFloat(i.quantity),
          unitPrice: parseFloat(i.unit_price),
          discountAmount: parseFloat(i.discount_amount),
          isVatApplicable: i.is_vat_applicable,
          vatRate: parseFloat(i.tax_rate),
          lineTotal: parseFloat(i.line_total),
        })),
        subtotal: parseFloat(sale.subtotal),
        discountTotal: parseFloat(sale.discount_total),
        taxableSubtotal: parseFloat(sale.taxable_subtotal),
        taxExemptSubtotal: parseFloat(sale.tax_exempt_subtotal),
        taxTotal: parseFloat(sale.tax_total),
        grandTotal: parseFloat(sale.grand_total),
        payments: payments.rows.map((p) => ({
          method: p.payment_method,
          amount: parseFloat(p.amount),
          reference: p.provider_reference,
        })),
        changeGiven: parseFloat(sale.change_given),
        reprintCount: newReprintCount,
      };

      return {
        receipt_number: sale.receipt_number,
        reprint_count: newReprintCount,
        receipt_text: this.fiscalAdapter.generateReceiptText(receiptData),
      };
    });
  }
}
