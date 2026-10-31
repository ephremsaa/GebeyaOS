import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import * as argon2 from 'argon2';
import * as bcrypt from 'bcryptjs';
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
  HeldBasketRecord,
} from '@gebeyaos/shared-types';
import {
  OpenShiftDto,
  RecordCashMovementDto,
  CloseShiftDto,
  CreateSaleDto,
  CreateSaleRefundDto,
  HoldBasketDto,
  ManagerPinVerifyDto,
  ReprintReceiptDto,
} from './pos.dto';

const round2 = (num: number): number => Math.round((num + Number.EPSILON) * 100) / 100;
const calculateTaxInclusiveLineVat = (gross: number, isVat: boolean): number =>
  isVat && gross > 0 ? round2((gross * 15) / 115) : 0;



@Injectable()
export class PosService {
  private readonly logger = new Logger(PosService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly inventoryService: InventoryService,
  ) {}

  /**
   * License verification & Grace Period Enforcement for Suspended Tenants
   */
  async verifyTenantLicense(): Promise<{ notice?: string }> {
    try {
      const res = await this.db.query(
        `SELECT status, suspended_at, grace_period_days FROM tenants
         WHERE id = NULLIF(current_setting('app.current_tenant', TRUE), '')::uuid`,
      );

      if (!res || !res.rows || res.rows.length === 0) return {};

      const tenant = res.rows[0];
      if (tenant.status !== 'suspended') return {};

      const gracePeriodDays = Number(tenant.grace_period_days || 14);
      const suspendedAt = tenant.suspended_at ? new Date(tenant.suspended_at) : new Date();
      const elapsedDays = Math.floor((Date.now() - suspendedAt.getTime()) / (24 * 3600 * 1000));
      const remainingDays = Math.max(0, gracePeriodDays - elapsedDays);

      if (elapsedDays >= gracePeriodDays) {
        throw new ForbiddenException(
          `Supermarket subscription grace period expired (${gracePeriodDays} days exceeded). POS sales are disabled until reactivated by HQ.`,
        );
      }

      return {
        notice: `Supermarket subscription suspended. Offline grace period active: ${remainingDays} day(s) remaining. Please contact HQ billing.`,
      };
    } catch (err) {
      if (err instanceof ForbiddenException) throw err;
      return {};
    }
  }

  /**
   * Opens a new cashier shift on a terminal.
   */
  async openShift(
    branchId: string,
    cashierId: string,
    dto: OpenShiftDto,
  ): Promise<Shift> {
    await this.verifyTenantLicense();
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
    await this.verifyTenantLicense();
    return this.db.withTransaction(async (client) => {
      // 0. Check idempotency: if sale with idempotencyKey already completed, replay it safely
      if (dto.idempotencyKey) {
        const dupRes = await client.query<any>(
          `SELECT * FROM sales WHERE branch_id = $1 AND idempotency_key = $2`,
          [branchId, dto.idempotencyKey],
        );
        if (dupRes.rows.length > 0) {
          const s = dupRes.rows[0];
          const itemsRes = await client.query<any>(
            `SELECT * FROM sale_items WHERE sale_id = $1`,
            [s.id],
          );
          const paymentsRes = await client.query<any>(
            `SELECT * FROM sale_payments WHERE sale_id = $1`,
            [s.id],
          );
          const saleRecord: SaleRecord = {
            id: s.id,
            branchId: s.branch_id,
            terminalId: s.terminal_id,
            shiftId: s.shift_id,
            receiptNumber: s.receipt_number,
            cashierId: s.cashier_id,
            subtotal: parseFloat(s.subtotal),
            discountTotal: parseFloat(s.discount_total),
            taxableSubtotal: parseFloat(s.taxable_subtotal),
            taxExemptSubtotal: parseFloat(s.tax_exempt_subtotal),
            taxTotal: parseFloat(s.tax_total),
            grandTotal: parseFloat(s.grand_total),
            totalPaid: parseFloat(s.total_paid),
            changeGiven: parseFloat(s.change_given),
            paymentStatus: s.payment_status,
            fiscalStatus: s.fiscal_status,
            fiscalReceiptNo: s.fiscal_receipt_no,
            fiscalMrc: s.fiscal_mrc,
            fiscalSignature: s.fiscal_signature,
            reprintCount: s.reprint_count,
            idempotencyKey: s.idempotency_key,
            clientTimestamp: s.client_timestamp.toISOString(),
            serverTimestamp: s.server_timestamp.toISOString(),
            createdAt: s.created_at.toISOString(),
            items: itemsRes.rows.map((r: any) => ({
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
            })),
            payments: paymentsRes.rows.map((pr: any) => ({
              id: pr.id,
              saleId: pr.sale_id,
              paymentMethod: pr.payment_method,
              amount: parseFloat(pr.amount),
              providerReference: pr.provider_reference,
              isOfflineVerified: pr.is_offline_verified,
              metadata: pr.metadata,
              createdAt: pr.created_at.toISOString(),
            })),
          };
          return {
            sale: saleRecord,
            thermalReceipt: formatEscPosThermalReceipt({
              storeName: 'GEBEYA SUPERMARKET',
              storeTin: '0012345678',
              storeVatNumber: 'ETH-VAT-001',
              branchName: 'Branch',
              terminalCode: 'POS01',
              cashierName: cashierId,
              receiptNumber: s.receipt_number,
              saleDate: s.created_at.toISOString().replace('T', ' ').substring(0, 19),
              items: itemsRes.rows.map((i: any) => ({
                name: i.item_name_snapshot,
                quantity: parseFloat(i.quantity),
                unitPrice: parseFloat(i.unit_price),
                discount: parseFloat(i.discount_amount),
                lineTotal: parseFloat(i.line_total),
                isVat: i.is_vat_applicable,
              })),
              subtotal: parseFloat(s.subtotal),
              discountTotal: parseFloat(s.discount_total),
              taxableSubtotal: parseFloat(s.taxable_subtotal),
              vatAmount: parseFloat(s.tax_total),
              exemptSubtotal: parseFloat(s.tax_exempt_subtotal),
              grandTotal: parseFloat(s.grand_total),
              payments: paymentsRes.rows.map((p: any) => ({
                method: p.payment_method,
                amount: parseFloat(p.amount),
                reference: p.provider_reference,
              })),
              changeGiven: parseFloat(s.change_given),
              fiscalMrc: s.fiscal_mrc,
              fiscalReceiptNo: s.fiscal_receipt_no,
            }),
            electronicJournal: { receiptNumber: s.receipt_number, replayed: true },
          };
        }
      }

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
        `SELECT code, name_en, tin_number, vat_number, phone, address, settings FROM branches WHERE id = $1`,
        [branchId],
      );
      const branch = branchRes.rows[0];
      const allowNegativeStock = branch?.settings?.allow_negative_stock === true;

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
        const rawLineGross = round2(item.quantity * unitPrice);
        const discountAmount = round2(item.discountAmount ?? 0);
        const netLineTotal = Math.max(0, round2(rawLineGross - discountAmount));

        // Tax-inclusive VAT rule: VAT = gross * 15 / 115 for taxable items, 0 for exempt
        let lineVat = 0;
        let lineTaxable = 0;
        let lineExempt = 0;

        if (prod.is_vat_applicable) {
          lineVat = calculateTaxInclusiveLineVat(netLineTotal, true);
          lineTaxable = round2(netLineTotal - lineVat);
          taxableSubtotal = round2(taxableSubtotal + lineTaxable);
          taxTotal = round2(taxTotal + lineVat);
        } else {
          lineExempt = netLineTotal;
          taxExemptSubtotal = round2(taxExemptSubtotal + lineExempt);
        }

        subtotal = round2(subtotal + rawLineGross);
        discountTotal = round2(discountTotal + discountAmount);
        grandTotal = round2(grandTotal + netLineTotal);

        // FEFO batch allocation & stock ledger deduction
        const alloc = await this.inventoryService.allocateBatchesForSale(
          branchId,
          item.productId,
          item.quantity,
          allowNegativeStock,
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
          allowNegativeStock,
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
          taxAmount: lineVat,
          lineTotal: netLineTotal,
        });

        receiptItems.push({
          name: prod.name_en,
          quantity: item.quantity,
          unitPrice,
          discount: discountAmount,
          lineTotal: netLineTotal,
          isVat: prod.is_vat_applicable,
        });
      }

      // Round totals to 2 decimal places
      subtotal = round2(subtotal);
      discountTotal = round2(discountTotal);
      taxableSubtotal = round2(taxableSubtotal);
      taxExemptSubtotal = round2(taxExemptSubtotal);
      taxTotal = round2(taxTotal);
      grandTotal = round2(grandTotal);

      // 6. Validate payments
      let totalPaid = 0;
      let cashPaid = 0;
      for (const p of dto.payments) {
        totalPaid += p.amount;
        if (p.paymentMethod === 'CASH') {
          cashPaid += p.amount;
        }
      }
      totalPaid = round2(totalPaid);

      if (totalPaid < grandTotal) {
        throw new BadRequestException(
          `INSUFFICIENT_PAYMENT: Total paid (${totalPaid} ETB) is less than grand total (${grandTotal} ETB)`,
        );
      }

      const changeGiven = round2(totalPaid - grandTotal);
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
           fiscal_status, fiscal_receipt_no, fiscal_mrc, client_timestamp,
           idempotency_key
         ) VALUES (
           $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
           'PAID', $15, $16, $17, $18, $19
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
          dto.idempotencyKey || null,
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
        idempotencyKey: saleRow.idempotency_key,
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

      // 13. Enqueue event into sync_outbox
      await client.query(
        `INSERT INTO sync_outbox (
           branch_id, entity_type, entity_id, operation, idempotency_key, payload, status
         ) VALUES ($1, 'SALE', $2, 'INSERT', $3, $4, 'PENDING')`,
        [branchId, saleId, `sync_sale_${saleId}`, JSON.stringify(saleRecord)],
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

  /**
   * Retrieves active open shift for a terminal.
   */
  async getCurrentShift(branchId: string, terminalId: string): Promise<{ open: boolean; shift: Shift | null }> {
    const res = await this.db.query<any>(
      `SELECT * FROM shifts 
       WHERE branch_id = $1 AND terminal_id = $2 AND status = 'OPEN' 
       ORDER BY opened_at DESC LIMIT 1`,
      [branchId, terminalId],
    );
    if (res.rows.length === 0) {
      return { open: false, shift: null };
    }
    const s = res.rows[0];
    return {
      open: true,
      shift: {
        id: s.id,
        branchId: s.branch_id,
        terminalId: s.terminal_id,
        cashierId: s.cashier_id,
        shiftNumber: s.shift_number,
        openingCashFloat: parseFloat(s.opening_cash_float),
        expectedCashSystem: parseFloat(s.expected_cash_system),
        status: s.status,
        notes: s.notes,
        openedAt: s.opened_at.toISOString(),
        createdAt: s.created_at.toISOString(),
      },
    };
  }

  /**
   * Retrieves product catalog for POS with branch overrides and current stock.
   */
  async getCatalog(branchId: string): Promise<any[]> {
    const query = `
      SELECT 
        p.id,
        p.sku,
        p.name_en,
        p.name_am,
        p.category_id,
        c.name_en as category_name_en,
        c.name_am as category_name_am,
        p.uom_code,
        p.base_price,
        p.cost_price,
        p.is_vat_applicable,
        p.vat_rate,
        p.is_weighed,
        p.scale_plu,
        p.min_stock_level,
        p.allow_discount,
        COALESCE(bpo.selling_price, p.base_price) as effective_price,
        bpo.selling_price IS NOT NULL as is_price_overridden,
        pb.barcode,
        COALESCE(sl.current_stock, 0) as stock_on_hand
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      LEFT JOIN branch_product_overrides bpo ON p.id = bpo.product_id AND bpo.branch_id = $1 AND bpo.is_active = TRUE
      LEFT JOIN LATERAL (
        SELECT barcode FROM product_barcodes WHERE product_id = p.id AND is_primary = TRUE LIMIT 1
      ) pb ON TRUE
      LEFT JOIN LATERAL (
        SELECT COALESCE(SUM(quantity_change), 0) as current_stock
        FROM stock_ledger
        WHERE branch_id = $1 AND product_id = p.id
      ) sl ON TRUE
      WHERE p.is_active = TRUE
      ORDER BY p.name_en ASC
    `;
    const res = await this.db.query<any>(query, [branchId]);
    return res.rows.map((r) => ({
      id: r.id,
      sku: r.sku,
      nameEn: r.name_en,
      nameAm: r.name_am,
      categoryId: r.category_id,
      categoryNameEn: r.category_name_en,
      categoryNameAm: r.category_name_am,
      uomCode: r.uom_code,
      basePrice: parseFloat(r.base_price),
      effectivePrice: parseFloat(r.effective_price),
      isPriceOverridden: r.is_price_overridden,
      costPrice: parseFloat(r.cost_price),
      isVatApplicable: r.is_vat_applicable,
      vatRate: parseFloat(r.vat_rate),
      isWeighed: r.is_weighed,
      scalePlu: r.scale_plu,
      minStockLevel: parseFloat(r.min_stock_level || '0'),
      allowDiscount: r.allow_discount,
      barcode: r.barcode || r.sku,
      stockOnHand: parseFloat(r.stock_on_hand),
    }));
  }

  /**
   * Persists a held basket to the database.
   */
  async holdBasket(branchId: string, cashierId: string, dto: HoldBasketDto): Promise<HeldBasketRecord> {
    const idRes = await this.db.query<{ id: string }>('SELECT uuid_generate_v7() as id');
    const id = idRes.rows[0].id;

    const res = await this.db.query<any>(
      `INSERT INTO held_baskets (
         id, branch_id, terminal_id, cashier_id, customer_identifier,
         cart_items, subtotal, tax_total, grand_total
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        id,
        branchId,
        dto.terminalId,
        cashierId,
        dto.customerIdentifier || null,
        JSON.stringify(dto.items),
        dto.subtotal,
        dto.taxTotal,
        dto.grandTotal,
      ],
    );
    const r = res.rows[0];
    return {
      id: r.id,
      branchId: r.branch_id,
      terminalId: r.terminal_id,
      cashierId: r.cashier_id,
      customerIdentifier: r.customer_identifier,
      items: typeof r.cart_items === 'string' ? JSON.parse(r.cart_items) : r.cart_items,
      subtotal: parseFloat(r.subtotal),
      taxTotal: parseFloat(r.tax_total),
      grandTotal: parseFloat(r.grand_total),
      heldAt: r.held_at.toISOString(),
      resumedAt: r.resumed_at ? r.resumed_at.toISOString() : null,
    };
  }

  /**
   * Retrieves all active held baskets for a terminal.
   */
  async getHeldBaskets(branchId: string, terminalId: string): Promise<HeldBasketRecord[]> {
    const res = await this.db.query<any>(
      `SELECT * FROM held_baskets
       WHERE branch_id = $1 AND terminal_id = $2 AND resumed_at IS NULL
       ORDER BY held_at DESC`,
      [branchId, terminalId],
    );
    return res.rows.map((r) => ({
      id: r.id,
      branchId: r.branch_id,
      terminalId: r.terminal_id,
      cashierId: r.cashier_id,
      customerIdentifier: r.customer_identifier,
      items: typeof r.cart_items === 'string' ? JSON.parse(r.cart_items) : r.cart_items,
      subtotal: parseFloat(r.subtotal),
      taxTotal: parseFloat(r.tax_total),
      grandTotal: parseFloat(r.grand_total),
      heldAt: r.held_at.toISOString(),
      resumedAt: r.resumed_at ? r.resumed_at.toISOString() : null,
    }));
  }

  /**
   * Resumes and closes a held basket.
   */
  async resumeHeldBasket(branchId: string, basketId: string): Promise<HeldBasketRecord> {
    const res = await this.db.query<any>(
      `UPDATE held_baskets
       SET resumed_at = clock_timestamp()
       WHERE id = $1 AND branch_id = $2
       RETURNING *`,
      [basketId, branchId],
    );
    if (res.rows.length === 0) {
      throw new NotFoundException(`Held basket ${basketId} not found`);
    }
    const r = res.rows[0];
    return {
      id: r.id,
      branchId: r.branch_id,
      terminalId: r.terminal_id,
      cashierId: r.cashier_id,
      customerIdentifier: r.customer_identifier,
      items: typeof r.cart_items === 'string' ? JSON.parse(r.cart_items) : r.cart_items,
      subtotal: parseFloat(r.subtotal),
      taxTotal: parseFloat(r.tax_total),
      grandTotal: parseFloat(r.grand_total),
      heldAt: r.held_at.toISOString(),
      resumedAt: r.resumed_at ? r.resumed_at.toISOString() : null,
    };
  }

  /**
   * Deletes a held basket.
   */
  async deleteHeldBasket(branchId: string, basketId: string): Promise<void> {
    await this.db.query(
      `DELETE FROM held_baskets WHERE id = $1 AND branch_id = $2`,
      [basketId, branchId],
    );
  }

  /**
   * Verifies manager PIN for supervisor discount or refund override.
   */
  async verifyManagerPin(branchId: string, dto: ManagerPinVerifyDto): Promise<{
    authorized: boolean;
    authorizedBy?: string;
    role?: string;
    maxDiscountPercentage?: number;
    message?: string;
  }> {
    const query = `
      SELECT u.id, u.username, u.full_name, u.pin_hash, u.pin_salt, r.name as role_name, r.max_discount_percentage
      FROM users u
      JOIN roles r ON u.role_id = r.id
      LEFT JOIN user_branch_assignments uba ON u.id = uba.user_id
      WHERE (uba.branch_id = $1 OR r.name IN ('OWNER', 'SUPER_ADMIN'))
        AND r.name IN ('OWNER', 'BRANCH_MANAGER', 'SUPER_ADMIN')
        AND u.is_active = TRUE
    `;
    const res = await this.db.query<any>(query, [branchId]);

    for (const user of res.rows) {
      let match = false;
      const targetHash = user.pin_hash;
      if (targetHash) {
        if (user.pin_salt) {
          const pepper = process.env.PIN_PEPPER || 'gebeyaos-secure-cashier-pin-pepper-2026';
          const salted = `${dto.pin}:${user.pin_salt}:${pepper}`;
          match = await argon2.verify(targetHash, salted);
        } else if (targetHash.startsWith('$argon2')) {
          match = await argon2.verify(targetHash, dto.pin);
        } else {
          match = bcrypt.compareSync(dto.pin, targetHash);
        }
        if (match) {
          try {
            await this.db.query(
              `INSERT INTO audit_logs (id, tenant_id, branch_id, user_id, action, entity_name, details, result)
               VALUES (gen_random_uuid(), (SELECT tenant_id FROM branches WHERE id = $1), $1, $2, 'MANAGER_PIN_VERIFIED', 'pos_override', $3, 'SUCCESS')`,
              [branchId, user.id, JSON.stringify({ role: user.role_name, actionRequired: dto.actionRequired })],
            );
          } catch {}
          return {
            authorized: true,
            authorizedBy: user.id,
            role: user.role_name,
            maxDiscountPercentage: parseFloat(user.max_discount_percentage || '25.00'),
            message: `Authorized by ${user.full_name || user.username} (${user.role_name})`,
          };
        }
      }
    }

    return {
      authorized: false,
      message: 'Invalid Manager PIN or insufficient permissions',
    };
  }

  /**
   * Reprints a customer receipt with audit logging.
   */
  async reprintReceipt(branchId: string, saleId: string, cashierId: string, dto: ReprintReceiptDto): Promise<{
    sale: SaleRecord;
    thermalReceipt: string;
    reprintCount: number;
  }> {
    return this.db.withTransaction(async (client) => {
      // 1. Fetch and update sale
      const updateRes = await client.query<any>(
        `UPDATE sales
         SET reprint_count = reprint_count + 1
         WHERE id = $1 AND branch_id = $2
         RETURNING *`,
        [saleId, branchId],
      );

      if (updateRes.rows.length === 0) {
        throw new NotFoundException(`Sale ${saleId} not found`);
      }
      const sale = updateRes.rows[0];

      // 2. Insert audit log
      await client.query(
        `INSERT INTO audit_logs (
           branch_id, user_id, action, entity_type, entity_id, details
         ) VALUES ($1, $2, 'pos:receipt:reprint', 'SALE', $3, $4)`,
        [
          branchId,
          cashierId,
          saleId,
          JSON.stringify({
            receiptNumber: sale.receipt_number,
            reprintCount: sale.reprint_count,
            reason: dto.reason,
          }),
        ],
      );

      // 3. Fetch items and payments
      const itemsRes = await client.query<any>(
        `SELECT * FROM sale_items WHERE sale_id = $1`,
        [saleId],
      );
      const paymentsRes = await client.query<any>(
        `SELECT * FROM sale_payments WHERE sale_id = $1`,
        [saleId],
      );
      const branchRes = await client.query<any>(
        `SELECT code, name_en, tin_number, vat_number, phone, address FROM branches WHERE id = $1`,
        [branchId],
      );
      const branch = branchRes.rows[0] || {};

      const thermalReceipt = formatEscPosThermalReceipt({
        storeName: 'GEBEYA SUPERMARKET',
        storeTin: branch.tin_number || '0012345678',
        storeVatNumber: branch.vat_number || 'ETH-VAT-001',
        branchName: branch.name_en,
        branchAddress: branch.address || undefined,
        branchPhone: branch.phone || undefined,
        terminalCode: sale.terminal_id || 'POS01',
        cashierName: cashierId,
        receiptNumber: `${sale.receipt_number} [COPY #${sale.reprint_count}]`,
        saleDate: sale.created_at.toISOString().replace('T', ' ').substring(0, 19),
        items: itemsRes.rows.map((i: any) => ({
          name: i.item_name_snapshot,
          quantity: parseFloat(i.quantity),
          unitPrice: parseFloat(i.unit_price),
          discount: parseFloat(i.discount_amount),
          lineTotal: parseFloat(i.line_total),
          isVat: i.is_vat_applicable,
        })),
        subtotal: parseFloat(sale.subtotal),
        discountTotal: parseFloat(sale.discount_total),
        taxableSubtotal: parseFloat(sale.taxable_subtotal),
        vatAmount: parseFloat(sale.tax_total),
        exemptSubtotal: parseFloat(sale.tax_exempt_subtotal),
        grandTotal: parseFloat(sale.grand_total),
        payments: paymentsRes.rows.map((p: any) => ({
          method: p.payment_method,
          amount: parseFloat(p.amount),
          reference: p.provider_reference,
        })),
        changeGiven: parseFloat(sale.change_given),
        fiscalMrc: sale.fiscal_mrc,
        fiscalReceiptNo: sale.fiscal_receipt_no,
      });

      const saleRecord: SaleRecord = {
        id: sale.id,
        branchId: sale.branch_id,
        terminalId: sale.terminal_id,
        shiftId: sale.shift_id,
        receiptNumber: sale.receipt_number,
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
        fiscalSignature: sale.fiscal_signature,
        reprintCount: sale.reprint_count,
        idempotencyKey: sale.idempotency_key,
        clientTimestamp: sale.client_timestamp.toISOString(),
        serverTimestamp: sale.server_timestamp.toISOString(),
        createdAt: sale.created_at.toISOString(),
      };

      return {
        sale: saleRecord,
        thermalReceipt,
        reprintCount: sale.reprint_count,
      };
    });
  }
}

