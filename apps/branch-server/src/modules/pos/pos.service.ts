import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { DatabaseService } from '../../common/database/database.service';
import { InventoryService } from '../inventory/inventory.service';
import {
  generateReceiptNumber,
  formatEscPosThermalReceipt,
  createElectronicJournalEntry,
  calculatePricing,
  Shift,
  XReportSummary,
  ZReportSummary,
  ThermalReceiptData,
  SaleRecord,
  SaleItemRecord,
  SalePaymentRecord,
} from '@gebeyaos/shared-types';
import {
  OpenShiftDto,
  RecordCashMovementDto,
  CloseShiftDto,
  CreateSaleDto,
  CreateSaleRefundDto,
} from './pos.dto';

@Injectable()
export class PosService {
  private readonly logger = new Logger(PosService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly inventoryService: InventoryService,
  ) {}

  /**
   * Opens a new cashier shift on a terminal.
   */
  async openShift(
    branchId: string,
    cashierId: string,
    dto: OpenShiftDto,
  ): Promise<Shift> {
    return this.db.withTransaction(async (client) => {
      // 1. Check for existing open shift on this terminal
      const activeCheck = await client.query<{ id: string }>(
        `SELECT id FROM shifts
         WHERE branch_id = $1 AND terminal_id = $2 AND status = 'OPEN'`,
        [branchId, dto.terminalId],
      );

      if (activeCheck.rows.length > 0) {
        throw new BadRequestException(
          `Terminal ${dto.terminalId} already has an active open shift (${activeCheck.rows[0].id})`,
        );
      }

      // 2. Next shift number for this terminal
      const shiftNumRes = await client.query<{ next_shift: string }>(
        `SELECT COALESCE(MAX(shift_number), 0) + 1 as next_shift
         FROM shifts
         WHERE branch_id = $1 AND terminal_id = $2`,
        [branchId, dto.terminalId],
      );
      const shiftNumber = parseInt(shiftNumRes.rows[0].next_shift, 10);

      // 3. Insert shift
      const shiftRes = await client.query<any>(
        `INSERT INTO shifts (
           branch_id, terminal_id, cashier_id, shift_number, opening_cash_float, status, notes
         ) VALUES ($1, $2, $3, $4, $5, 'OPEN', $6)
         RETURNING *`,
        [
          branchId,
          dto.terminalId,
          cashierId,
          shiftNumber,
          dto.openingCashFloat,
          dto.notes || null,
        ],
      );
      const shift = shiftRes.rows[0];

      // 4. Record initial float movement
      await client.query(
        `INSERT INTO cash_movements (
           shift_id, branch_id, movement_type, amount, reason, authorized_by
         ) VALUES ($1, $2, 'FLOAT_IN', $3, 'Opening cash float', $4)`,
        [shift.id, branchId, dto.openingCashFloat, cashierId],
      );

      return {
        id: shift.id,
        branchId: shift.branch_id,
        terminalId: shift.terminal_id,
        cashierId: shift.cashier_id,
        shiftNumber: shift.shift_number,
        openingCashFloat: parseFloat(shift.opening_cash_float),
        expectedCashSystem: parseFloat(shift.expected_cash_system),
        status: shift.status,
        notes: shift.notes,
        openedAt: shift.opened_at.toISOString(),
        createdAt: shift.created_at.toISOString(),
      };
    });
  }

  /**
   * Records cash movement (e.g. mid-shift safe drop or petty cash out).
   */
  async recordCashMovement(
    branchId: string,
    shiftId: string,
    dto: RecordCashMovementDto,
  ) {
    const shiftRes = await this.db.query<{ status: string }>(
      `SELECT status FROM shifts WHERE id = $1 AND branch_id = $2`,
      [shiftId, branchId],
    );

    if (shiftRes.rows.length === 0) {
      throw new NotFoundException(`Shift ${shiftId} not found`);
    }
    if (shiftRes.rows[0].status !== 'OPEN') {
      throw new BadRequestException('Cannot record cash movement on a closed shift');
    }

    const res = await this.db.query<any>(
      `INSERT INTO cash_movements (
         shift_id, branch_id, movement_type, amount, reason, authorized_by
       ) VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        shiftId,
        branchId,
        dto.movementType,
        dto.amount,
        dto.reason,
        dto.authorizedBy || null,
      ],
    );

    const row = res.rows[0];
    return {
      id: row.id,
      shiftId: row.shift_id,
      branchId: row.branch_id,
      movementType: row.movement_type,
      amount: parseFloat(row.amount),
      reason: row.reason,
      authorizedBy: row.authorized_by,
      createdAt: row.created_at.toISOString(),
    };
  }

  /**
   * Computes interim X-Report readings for an active shift.
   */
  async getXReport(branchId: string, shiftId: string): Promise<XReportSummary> {
    const shiftRes = await this.db.query<any>(
      `SELECT * FROM shifts WHERE id = $1 AND branch_id = $2`,
      [shiftId, branchId],
    );

    if (shiftRes.rows.length === 0) {
      throw new NotFoundException(`Shift ${shiftId} not found`);
    }
    const shift = shiftRes.rows[0];

    // Sales summary
    const salesRes = await this.db.query<any>(
      `SELECT
         COUNT(s.id) as total_sales_count,
         COALESCE(SUM(s.grand_total), 0) as gross_sales,
         COALESCE(SUM(s.change_given), 0) as total_change_given
       FROM sales s
       WHERE s.shift_id = $1 AND s.payment_status IN ('PAID', 'PARTIALLY_REFUNDED')`,
      [shiftId],
    );
    const totalSalesCount = parseInt(salesRes.rows[0].total_sales_count, 10);
    const grossSalesAmount = parseFloat(salesRes.rows[0].gross_sales);
    const totalChangeGiven = parseFloat(salesRes.rows[0].total_change_given);

    // Payments by method
    const paymentsRes = await this.db.query<any>(
      `SELECT
         sp.payment_method,
         COALESCE(SUM(sp.amount), 0) as method_total
       FROM sale_payments sp
       JOIN sales s ON sp.sale_id = s.id
       WHERE s.shift_id = $1 AND s.payment_status IN ('PAID', 'PARTIALLY_REFUNDED')
       GROUP BY sp.payment_method`,
      [shiftId],
    );

    let tenderedCash = 0;
    let telebirrSales = 0;
    let cbeBirrSales = 0;
    let cardSales = 0;

    for (const row of paymentsRes.rows) {
      const amt = parseFloat(row.method_total);
      if (row.payment_method === 'CASH') tenderedCash = amt;
      else if (row.payment_method === 'TELEBIRR') telebirrSales = amt;
      else if (row.payment_method === 'CBE_BIRR') cbeBirrSales = amt;
      else if (row.payment_method === 'CARD_POS') cardSales = amt;
    }

    const netCashSales = Math.max(0, tenderedCash - totalChangeGiven);

    // Cash movements
    const movementsRes = await this.db.query<any>(
      `SELECT movement_type, COALESCE(SUM(amount), 0) as total_amount
       FROM cash_movements
       WHERE shift_id = $1
       GROUP BY movement_type`,
      [shiftId],
    );

    let additionalFloat = 0;
    let safeDrops = 0;
    let pettyCashOut = 0;

    for (const row of movementsRes.rows) {
      const amt = parseFloat(row.total_amount);
      if (row.movement_type === 'ADDITIONAL_FLOAT') additionalFloat = amt;
      else if (row.movement_type === 'SAFE_DROP') safeDrops = amt;
      else if (row.movement_type === 'PETTY_CASH_OUT') pettyCashOut = amt;
    }

    const openingFloat = parseFloat(shift.opening_cash_float);
    const expectedCashInDrawer =
      openingFloat + additionalFloat + netCashSales - safeDrops - pettyCashOut;

    return {
      shiftId: shift.id,
      terminalId: shift.terminal_id,
      cashierId: shift.cashier_id,
      openedAt: shift.opened_at.toISOString(),
      reportGeneratedAt: new Date().toISOString(),
      openingFloat,
      totalSalesCount,
      grossSalesAmount,
      cashSalesAmount: netCashSales,
      telebirrSalesAmount: telebirrSales,
      cbeBirrSalesAmount: cbeBirrSales,
      cardSalesAmount: cardSales,
      totalCashDrops: safeDrops,
      totalPettyCashOut: pettyCashOut,
      expectedCashInDrawer: Math.round((expectedCashInDrawer + Number.EPSILON) * 100) / 100,
    };
  }

  /**
   * Blind close of a cashier shift, recording variance and generating Z-Report.
   */
  async closeShift(
    branchId: string,
    shiftId: string,
    dto: CloseShiftDto,
  ): Promise<ZReportSummary> {
    return this.db.withTransaction(async (client) => {
      const shiftRes = await client.query<any>(
        `SELECT * FROM shifts WHERE id = $1 AND branch_id = $2 FOR UPDATE`,
        [shiftId, branchId],
      );

      if (shiftRes.rows.length === 0) {
        throw new NotFoundException(`Shift ${shiftId} not found`);
      }
      const shift = shiftRes.rows[0];
      if (shift.status !== 'OPEN') {
        throw new BadRequestException(`Shift is already ${shift.status}`);
      }

      const xReport = await this.getXReport(branchId, shiftId);
      const expectedCash = xReport.expectedCashInDrawer;
      const counted = dto.closingCashCounted;
      const variance = Math.round((counted - expectedCash + Number.EPSILON) * 100) / 100;

      await client.query(
        `UPDATE shifts
         SET status = 'CLOSED',
             closing_cash_counted = $1,
             expected_cash_system = $2,
             closed_at = clock_timestamp(),
             notes = COALESCE($3, notes)
         WHERE id = $4`,
        [counted, expectedCash, dto.notes || null, shiftId],
      );

      return {
        ...xReport,
        closingCashCounted: counted,
        cashVariance: variance,
        closedAt: new Date().toISOString(),
      };
    });
  }

  /**
   * Executes atomic POS checkout sale with multi-payment and FEFO batch depletion.
   */
  async checkoutSale(
    branchId: string,
    cashierId: string,
    dto: CreateSaleDto,
  ): Promise<{
    sale: SaleRecord;
    thermalReceipt: string;
    electronicJournal: any;
  }> {
    return this.db.withTransaction(async (client) => {
      // 1. Verify shift is open
      const shiftRes = await client.query<any>(
        `SELECT * FROM shifts WHERE id = $1 AND branch_id = $2 AND status = 'OPEN'`,
        [dto.shiftId, branchId],
      );
      if (shiftRes.rows.length === 0) {
        throw new BadRequestException('Cashier shift is not open or not found');
      }
      const shift = shiftRes.rows[0];

      // 2. Fetch branch and terminal codes
      const branchRes = await client.query<any>(
        `SELECT code, name_en, tin_number, vat_number, phone, address FROM branches WHERE id = $1`,
        [branchId],
      );
      const branch = branchRes.rows[0];

      const termRes = await client.query<any>(
        `SELECT code FROM terminals WHERE id = $1`,
        [dto.terminalId],
      );
      const terminalCode = termRes.rows.length > 0 ? termRes.rows[0].code : 'POS01';

      // 3. Sequential receipt number for terminal today
      const countRes = await client.query<{ count: string }>(
        `SELECT COUNT(*) as count FROM sales
         WHERE branch_id = $1 AND terminal_id = $2 AND created_at >= CURRENT_DATE`,
        [branchId, dto.terminalId],
      );
      const seq = parseInt(countRes.rows[0].count, 10) + 1;
      const receiptNumber = generateReceiptNumber(
        branch.code,
        terminalCode,
        new Date(),
        shift.shift_number,
        seq,
      );

      // 4. Generate Sale UUID upfront
      const saleIdRes = await client.query<{ id: string }>(
        `SELECT uuid_generate_v7() as id`,
      );
      const saleId = saleIdRes.rows[0].id;

      // 5. Process items, calculate pricing & VAT, allocate batches
      let subtotal = 0;
      let discountTotal = 0;
      let taxableSubtotal = 0;
      let taxExemptSubtotal = 0;
      let taxTotal = 0;
      let grandTotal = 0;

      const preparedItems: any[] = [];
      const receiptItems: Array<{
        name: string;
        quantity: number;
        unitPrice: number;
        discount?: number;
        lineTotal: number;
        isVat: boolean;
      }> = [];

      for (const item of dto.items) {
        // Fetch product & override
        const prodRes = await client.query<any>(
          `SELECT p.id, p.name_en, p.base_price, p.cost_price, p.is_vat_applicable, p.vat_rate,
                  COALESCE(bpo.selling_price, p.base_price) as effective_price
           FROM products p
           LEFT JOIN branch_product_overrides bpo ON p.id = bpo.product_id AND bpo.branch_id = $1
           WHERE p.id = $2`,
          [branchId, item.productId],
        );

        if (prodRes.rows.length === 0) {
          throw new NotFoundException(`Product ${item.productId} not found`);
        }
        const prod = prodRes.rows[0];

        const unitPrice = item.unitPrice ?? parseFloat(prod.effective_price);
        const unitCost = parseFloat(prod.cost_price);
        const discountAmount = item.discountAmount ?? 0;
        const rawLineTotal = item.quantity * unitPrice;
        const netLineTotal = Math.max(0, rawLineTotal - discountAmount);

        const pricing = calculatePricing(
          netLineTotal,
          prod.is_vat_applicable,
          parseFloat(prod.vat_rate),
        );

        subtotal += rawLineTotal;
        discountTotal += discountAmount;
        taxableSubtotal += pricing.taxableSubtotal;
        taxExemptSubtotal += pricing.taxExemptSubtotal;
        taxTotal += pricing.taxAmount;
        grandTotal += pricing.total;

        // FEFO batch allocation & stock ledger deduction
        const alloc = await this.inventoryService.allocateBatchesForSale(
          branchId,
          item.productId,
          item.quantity,
          true, // Allow negative allocation if branch allows
          client,
        );

        const primaryBatchId = alloc.allocations.length > 0 ? alloc.allocations[0].batchId : null;

        // Deduct inventory in append-only stock_ledger
        await this.inventoryService.recordMovementInTransaction(client, branchId, {
          productId: item.productId,
          batchId: primaryBatchId,
          movementType: 'SALE',
          quantityChange: -item.quantity,
          unitCost,
          referenceType: 'SALE',
          referenceId: saleId,
          notes: `POS sale receipt ${receiptNumber}`,
          createdBy: cashierId,
          allowNegativeStock: true,
        });

        preparedItems.push({
          saleId,
          productId: item.productId,
          batchId: primaryBatchId,
          barcode: item.barcode || null,
          itemNameSnapshot: prod.name_en,
          quantity: item.quantity,
          unitPrice,
          unitCost,
          discountAmount,
          discountReason: item.discountReason || null,
          isVatApplicable: prod.is_vat_applicable,
          taxRate: parseFloat(prod.vat_rate),
          taxAmount: pricing.taxAmount,
          lineTotal: pricing.total,
        });

        receiptItems.push({
          name: prod.name_en,
          quantity: item.quantity,
          unitPrice,
          discount: discountAmount,
          lineTotal: pricing.total,
          isVat: prod.is_vat_applicable,
        });
      }

      // Round totals to 2 decimal places
      const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
      subtotal = r2(subtotal);
      discountTotal = r2(discountTotal);
      taxableSubtotal = r2(taxableSubtotal);
      taxExemptSubtotal = r2(taxExemptSubtotal);
      taxTotal = r2(taxTotal);
      grandTotal = r2(grandTotal);

      // 6. Validate payments
      let totalPaid = 0;
      let cashPaid = 0;
      for (const p of dto.payments) {
        totalPaid += p.amount;
        if (p.paymentMethod === 'CASH') {
          cashPaid += p.amount;
        }
      }
      totalPaid = r2(totalPaid);

      if (totalPaid < grandTotal) {
        throw new BadRequestException(
          `INSUFFICIENT_PAYMENT: Total paid (${totalPaid} ETB) is less than grand total (${grandTotal} ETB)`,
        );
      }

      const changeGiven = r2(totalPaid - grandTotal);
      if (changeGiven > 0 && cashPaid < changeGiven) {
        throw new BadRequestException(
          `INVALID_PAYMENT: Change given (${changeGiven} ETB) cannot exceed cash tendered (${cashPaid} ETB)`,
        );
      }

      // 7. Fiscal details
      const fiscalMrc = `MOR-${branch.code}-${terminalCode}`;
      const fiscalReceiptNo = `FRN-${receiptNumber}`;
      const fiscalStatus = dto.bypassFiscal ? 'BYPASSED' : 'FISCALIZED';

      // 8. Insert sales header
      const clientTimestamp = dto.clientTimestamp
        ? new Date(dto.clientTimestamp)
        : new Date();

      const saleRes = await client.query<any>(
        `INSERT INTO sales (
           id, branch_id, terminal_id, shift_id, receipt_number, cashier_id,
           subtotal, discount_total, taxable_subtotal, tax_exempt_subtotal,
           tax_total, grand_total, total_paid, change_given, payment_status,
           fiscal_status, fiscal_receipt_no, fiscal_mrc, client_timestamp
         ) VALUES (
           $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
           'PAID', $15, $16, $17, $18
         ) RETURNING *`,
        [
          saleId,
          branchId,
          dto.terminalId,
          dto.shiftId,
          receiptNumber,
          cashierId,
          subtotal,
          discountTotal,
          taxableSubtotal,
          taxExemptSubtotal,
          taxTotal,
          grandTotal,
          totalPaid,
          changeGiven,
          fiscalStatus,
          fiscalReceiptNo,
          fiscalMrc,
          clientTimestamp,
        ],
      );
      const saleRow = saleRes.rows[0];

      // 9. Insert sale items
      const savedItems: SaleItemRecord[] = [];
      for (const item of preparedItems) {
        const itemRes = await client.query<any>(
          `INSERT INTO sale_items (
             sale_id, product_id, batch_id, barcode, item_name_snapshot,
             quantity, unit_price, unit_cost, discount_amount, discount_reason,
             is_vat_applicable, tax_rate, tax_amount, line_total
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
           RETURNING *`,
          [
            item.saleId,
            item.productId,
            item.batchId,
            item.barcode,
            item.itemNameSnapshot,
            item.quantity,
            item.unitPrice,
            item.unitCost,
            item.discountAmount,
            item.discountReason,
            item.isVatApplicable,
            item.taxRate,
            item.taxAmount,
            item.lineTotal,
          ],
        );
        const r = itemRes.rows[0];
        savedItems.push({
          id: r.id,
          saleId: r.sale_id,
          productId: r.product_id,
          batchId: r.batch_id,
          barcode: r.barcode,
          itemNameSnapshot: r.item_name_snapshot,
          quantity: parseFloat(r.quantity),
          unitPrice: parseFloat(r.unit_price),
          unitCost: parseFloat(r.unit_cost),
          discountAmount: parseFloat(r.discount_amount),
          discountReason: r.discount_reason,
          isVatApplicable: r.is_vat_applicable,
          taxRate: parseFloat(r.tax_rate),
          taxAmount: parseFloat(r.tax_amount),
          lineTotal: parseFloat(r.line_total),
          createdAt: r.created_at.toISOString(),
        });
      }

      // 10. Insert sale payments
      const savedPayments: SalePaymentRecord[] = [];
      for (const p of dto.payments) {
        const payRes = await client.query<any>(
          `INSERT INTO sale_payments (
             sale_id, payment_method, amount, provider_reference, is_offline_verified, metadata
           ) VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING *`,
          [
            saleId,
            p.paymentMethod,
            p.amount,
            p.providerReference || null,
            p.isOfflineVerified ?? false,
            p.metadata ? JSON.stringify(p.metadata) : null,
          ],
        );
        const pr = payRes.rows[0];
        savedPayments.push({
          id: pr.id,
          saleId: pr.sale_id,
          paymentMethod: pr.payment_method,
          amount: parseFloat(pr.amount),
          providerReference: pr.provider_reference,
          isOfflineVerified: pr.is_offline_verified,
          metadata: pr.metadata,
          createdAt: pr.created_at.toISOString(),
        });
      }

      const saleRecord: SaleRecord = {
        id: saleRow.id,
        branchId: saleRow.branch_id,
        terminalId: saleRow.terminal_id,
        shiftId: saleRow.shift_id,
        receiptNumber: saleRow.receipt_number,
        cashierId: saleRow.cashier_id,
        subtotal: parseFloat(saleRow.subtotal),
        discountTotal: parseFloat(saleRow.discount_total),
        taxableSubtotal: parseFloat(saleRow.taxable_subtotal),
        taxExemptSubtotal: parseFloat(saleRow.tax_exempt_subtotal),
        taxTotal: parseFloat(saleRow.tax_total),
        grandTotal: parseFloat(saleRow.grand_total),
        totalPaid: parseFloat(saleRow.total_paid),
        changeGiven: parseFloat(saleRow.change_given),
        paymentStatus: saleRow.payment_status,
        fiscalStatus: saleRow.fiscal_status,
        fiscalReceiptNo: saleRow.fiscal_receipt_no,
        fiscalMrc: saleRow.fiscal_mrc,
        fiscalSignature: saleRow.fiscal_signature,
        reprintCount: saleRow.reprint_count,
        clientTimestamp: saleRow.client_timestamp.toISOString(),
        serverTimestamp: saleRow.server_timestamp.toISOString(),
        createdAt: saleRow.created_at.toISOString(),
        items: savedItems,
        payments: savedPayments,
      };

      // 11. Format Thermal Receipt & MOR Electronic Journal
      const receiptData: ThermalReceiptData = {
        storeName: 'GEBEYA SUPERMARKET',
        storeTin: branch.tin_number || '0012345678',
        storeVatNumber: branch.vat_number || 'ETH-VAT-001',
        branchName: branch.name_en,
        branchAddress: branch.address || undefined,
        branchPhone: branch.phone || undefined,
        terminalCode,
        cashierName: cashierId,
        receiptNumber,
        saleDate: new Date().toISOString().replace('T', ' ').substring(0, 19),
        items: receiptItems,
        subtotal,
        discountTotal,
        taxableSubtotal,
        vatAmount: taxTotal,
        exemptSubtotal: taxExemptSubtotal,
        grandTotal,
        payments: dto.payments.map((p) => ({
          method: p.paymentMethod,
          amount: p.amount,
          reference: p.providerReference,
        })),
        changeGiven,
        fiscalMrc,
        fiscalReceiptNo,
      };

      const thermalReceipt = formatEscPosThermalReceipt(receiptData);
      const electronicJournal = createElectronicJournalEntry(
        saleRecord,
        savedItems,
        savedPayments,
      );

      // 12. Save fiscal log
      await client.query(
        `INSERT INTO fiscal_receipt_logs (
           sale_id, branch_id, terminal_id, payload, fiscal_receipt_number
         ) VALUES ($1, $2, $3, $4, $5)`,
        [
          saleId,
          branchId,
          dto.terminalId,
          JSON.stringify(electronicJournal),
          fiscalReceiptNo,
        ],
      );

      return {
        sale: saleRecord,
        thermalReceipt,
        electronicJournal,
      };
    });
  }

  /**
   * Processes a return/refund against an original sale and restocks inventory.
   */
  async refundSale(
    branchId: string,
    cashierId: string,
    dto: CreateSaleRefundDto,
  ) {
    return this.db.withTransaction(async (client) => {
      // 1. Fetch original sale
      const saleRes = await client.query<any>(
        `SELECT * FROM sales WHERE id = $1 AND branch_id = $2 FOR UPDATE`,
        [dto.originalSaleId, branchId],
      );

      if (saleRes.rows.length === 0) {
        throw new NotFoundException(`Original sale ${dto.originalSaleId} not found`);
      }
      const sale = saleRes.rows[0];

      // 2. Generate refund number REF-YYYYMMDD-XXXX
      const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const countRes = await client.query<{ count: string }>(
        `SELECT COUNT(*) as count FROM sale_refunds WHERE branch_id = $1 AND refund_number LIKE $2`,
        [branchId, `REF-${datePart}-%`],
      );
      const seq = (parseInt(countRes.rows[0].count, 10) + 1).toString().padStart(4, '0');
      const refundNumber = `REF-${datePart}-${seq}`;

      // 3. Process refund line items
      let totalRefund = 0;
      let totalTaxRefund = 0;
      const refundItemsToInsert: any[] = [];

      for (const item of dto.items) {
        const itemRes = await client.query<any>(
          `SELECT * FROM sale_items WHERE id = $1 AND sale_id = $2`,
          [item.originalSaleItemId, dto.originalSaleId],
        );

        if (itemRes.rows.length === 0) {
          throw new NotFoundException(
            `Original sale item ${item.originalSaleItemId} not found on sale`,
          );
        }
        const originalItem = itemRes.rows[0];
        const unitPrice = parseFloat(originalItem.unit_price);
        const lineRefund = item.quantity * unitPrice;
        const taxRefund = item.quantity * parseFloat(originalItem.tax_amount);

        totalRefund += lineRefund;
        totalTaxRefund += taxRefund;

        refundItemsToInsert.push({
          originalSaleItemId: item.originalSaleItemId,
          productId: originalItem.product_id,
          batchId: originalItem.batch_id,
          quantity: item.quantity,
          refundUnitPrice: unitPrice,
          refundTaxAmount: taxRefund,
          refundTotal: lineRefund,
          returnToInventory: item.returnToInventory ?? true,
        });

        // Restock inventory if requested
        if (item.returnToInventory ?? true) {
          await this.inventoryService.recordMovementInTransaction(client, branchId, {
            productId: originalItem.product_id,
            batchId: originalItem.batch_id,
            movementType: 'SALE_REFUND',
            quantityChange: item.quantity,
            unitCost: parseFloat(originalItem.unit_cost),
            referenceType: 'SALE',
            referenceId: dto.originalSaleId,
            notes: `Refund ${refundNumber}`,
            createdBy: cashierId,
            allowNegativeStock: true,
          });
        }
      }

      // 4. Insert sale_refunds
      const refundRes = await client.query<any>(
        `INSERT INTO sale_refunds (
           branch_id, original_sale_id, refund_number, cashier_id, authorized_by,
           reason, total_refund_amount, tax_refund_amount
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING *`,
        [
          branchId,
          dto.originalSaleId,
          refundNumber,
          cashierId,
          dto.authorizedBy,
          dto.reason,
          totalRefund,
          totalTaxRefund,
        ],
      );
      const refundRow = refundRes.rows[0];

      // 5. Insert sale_refund_items
      for (const item of refundItemsToInsert) {
        await client.query(
          `INSERT INTO sale_refund_items (
             refund_id, original_sale_item_id, product_id, batch_id,
             quantity, refund_unit_price, refund_tax_amount, refund_total, return_to_inventory
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [
            refundRow.id,
            item.originalSaleItemId,
            item.productId,
            item.batchId,
            item.quantity,
            item.refundUnitPrice,
            item.refundTaxAmount,
            item.refundTotal,
            item.returnToInventory,
          ],
        );
      }

      // 6. Update original sale status
      await client.query(
        `UPDATE sales SET payment_status = 'PARTIALLY_REFUNDED' WHERE id = $1`,
        [dto.originalSaleId],
      );

      return {
        id: refundRow.id,
        refundNumber: refundRow.refund_number,
        originalSaleId: refundRow.original_sale_id,
        totalRefundAmount: parseFloat(refundRow.total_refund_amount),
        taxRefundAmount: parseFloat(refundRow.tax_refund_amount),
        reason: refundRow.reason,
        createdAt: refundRow.created_at.toISOString(),
      };
    });
  }

  /**
   * Retrieves a sale by ID or receipt number.
   */
  async getSaleByReceiptNumber(branchId: string, receiptNumber: string) {
    const saleRes = await this.db.query<any>(
      `SELECT * FROM sales WHERE branch_id = $1 AND receipt_number = $2`,
      [branchId, receiptNumber],
    );

    if (saleRes.rows.length === 0) {
      throw new NotFoundException(`Receipt ${receiptNumber} not found`);
    }
    const sale = saleRes.rows[0];

    const itemsRes = await this.db.query<any>(
      `SELECT * FROM sale_items WHERE sale_id = $1`,
      [sale.id],
    );

    const paymentsRes = await this.db.query<any>(
      `SELECT * FROM sale_payments WHERE sale_id = $1`,
      [sale.id],
    );

    return {
      id: sale.id,
      receiptNumber: sale.receipt_number,
      terminalId: sale.terminal_id,
      shiftId: sale.shift_id,
      cashierId: sale.cashier_id,
      subtotal: parseFloat(sale.subtotal),
      discountTotal: parseFloat(sale.discount_total),
      taxableSubtotal: parseFloat(sale.taxable_subtotal),
      taxExemptSubtotal: parseFloat(sale.tax_exempt_subtotal),
      taxTotal: parseFloat(sale.tax_total),
      grandTotal: parseFloat(sale.grand_total),
      totalPaid: parseFloat(sale.total_paid),
      changeGiven: parseFloat(sale.change_given),
      paymentStatus: sale.payment_status,
      fiscalStatus: sale.fiscal_status,
      fiscalReceiptNo: sale.fiscal_receipt_no,
      fiscalMrc: sale.fiscal_mrc,
      createdAt: sale.created_at.toISOString(),
      items: itemsRes.rows.map((i: any) => ({
        id: i.id,
        productId: i.product_id,
        itemNameSnapshot: i.item_name_snapshot,
        quantity: parseFloat(i.quantity),
        unitPrice: parseFloat(i.unit_price),
        lineTotal: parseFloat(i.line_total),
        taxAmount: parseFloat(i.tax_amount),
      })),
      payments: paymentsRes.rows.map((p: any) => ({
        paymentMethod: p.payment_method,
        amount: parseFloat(p.amount),
        providerReference: p.provider_reference,
      })),
    };
  }
}
