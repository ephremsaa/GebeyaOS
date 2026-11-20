import { ThermalReceiptData, ElectronicJournalEntry, SaleRecord, SaleItemRecord, SalePaymentRecord } from './pos.types';

/**
 * Generates an offline-safe, terminal-independent receipt number according to GebeyaOS standard:
 * Format: {BRANCH_CODE}-{TERMINAL_CODE}-{YYYYMMDD}-{SHIFT_NO}-{SEQ}
 * Example: BOLE01-POS01-20261021-01-0001
 */
export function generateReceiptNumber(
  branchCode: string,
  terminalCode: string,
  date: Date,
  shiftNumber: number,
  sequence: number,
): string {
  const cleanBranch = branchCode.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  const cleanTerm = terminalCode.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  const yyyy = date.getFullYear().toString();
  const mm = (date.getMonth() + 1).toString().padStart(2, '0');
  const dd = date.getDate().toString().padStart(2, '0');
  const shiftStr = shiftNumber.toString().padStart(2, '0');
  const seqStr = sequence.toString().padStart(4, '0');

  return `${cleanBranch}-${cleanTerm}-${yyyy}${mm}${dd}-${shiftStr}-${seqStr}`;
}

/**
 * Formats standard 80mm ESC/POS thermal text receipt (42-48 columns wide).
 * Strictly complies with Ethiopian Ministry of Revenues tax receipt rules.
 */
export function formatEscPosThermalReceipt(data: ThermalReceiptData): string {
  const LINE_WIDTH = 42;
  const pad = (str: string, width: number) => str.padEnd(width, ' ');
  const center = (str: string) => {
    const space = Math.max(0, Math.floor((LINE_WIDTH - str.length) / 2));
    return ' '.repeat(space) + str;
  };
  const formatMoney = (val: number) => val.toFixed(2);
  const row2 = (label: string, value: string) => {
    const spacing = Math.max(1, LINE_WIDTH - label.length - value.length);
    return label + ' '.repeat(spacing) + value;
  };

  const lines: string[] = [];

  // Header
  lines.push('='.repeat(LINE_WIDTH));
  lines.push(center(data.storeName || 'Gebeya Supermarket'));
  lines.push(center(data.branchName || 'Bole Medhanialem'));
  const address = data.branchAddress || 'Ethiopia , Addis Ababa';
  lines.push(center(address));
  if (data.branchPhone) lines.push(center(`TEL: ${data.branchPhone}`));
  lines.push(center(`TIN: ${data.storeTin || '0012345678'}`));
  if (data.storeVatNumber) lines.push(center(`VAT REG: ${data.storeVatNumber}`));
  lines.push('-'.repeat(LINE_WIDTH));

  // Metadata
  lines.push(row2('Receipt:', data.receiptNumber));
  lines.push(row2('Date:', data.saleDate));
  lines.push(row2(`Term: ${data.terminalCode}`, `Cashier: ${data.cashierName}`));
  lines.push('-'.repeat(LINE_WIDTH));

  // Items
  lines.push(row2('ITEM', 'QTY x PRICE   TOTAL'));
  lines.push('-'.repeat(LINE_WIDTH));

  let subtotalBeforeVat = 0;

  for (const item of data.items) {
    lines.push(item.name);

    const isTaxable = item.isVat !== false;
    const unitPriceBeforeVat = isTaxable ? item.unitPrice / 1.15 : item.unitPrice;
    const lineTotalBeforeVat = isTaxable ? item.lineTotal / 1.15 : item.lineTotal;
    subtotalBeforeVat += lineTotalBeforeVat;

    const qtyStr = Number.isInteger(item.quantity) ? `${item.quantity}.` : item.quantity.toFixed(3);
    const qtyPrice = `${qtyStr} x ${formatMoney(unitPriceBeforeVat)}`;
    const totalStr = `${formatMoney(lineTotalBeforeVat)} ETB`;
    lines.push(row2(`   ${qtyPrice}`, totalStr));

    if (item.discount && item.discount > 0) {
      lines.push(row2('   Discount:', `-${formatMoney(item.discount)} ETB`));
    }
  }

  lines.push('-'.repeat(LINE_WIDTH));

  // Round subtotal to 2 decimals
  const finalSubtotal = Math.round(subtotalBeforeVat * 100) / 100;
  const finalVat = Math.max(0, Math.round((data.grandTotal - finalSubtotal) * 100) / 100);

  // Subtotal & VAT Breakdown (VAT-inclusive reconciliation)
  lines.push(row2('Subtotal:', `${formatMoney(finalSubtotal)} ETB`));
  lines.push(row2('VAT Amount (15%):', `${formatMoney(finalVat)} ETB`));
  lines.push('-'.repeat(LINE_WIDTH));

  // Grand Total
  lines.push(row2('TOTAL :', `${formatMoney(data.grandTotal)} ETB`));
  lines.push('='.repeat(LINE_WIDTH));
  lines.push(center('THANK YOU FOR SHOPPING WITH US!'));
  lines.push('='.repeat(LINE_WIDTH));

  return lines.join('\n');
}

/**
 * Creates structured Electronic Journal (EJ) record for MOR fiscal audit storage.
 */
export function createElectronicJournalEntry(
  sale: SaleRecord,
  items: SaleItemRecord[],
  payments: SalePaymentRecord[],
): ElectronicJournalEntry {
  // Deterministic signature hash across critical financial fields
  const dataString = [
    sale.receiptNumber,
    sale.terminalId,
    sale.cashierId,
    sale.grandTotal.toFixed(2),
    sale.taxTotal.toFixed(2),
    sale.serverTimestamp,
    items.length.toString(),
  ].join('|');

  // Fast djb2-based hash representation for offline environment
  let hash = 5381;
  for (let i = 0; i < dataString.length; i++) {
    hash = (hash * 33) ^ dataString.charCodeAt(i);
  }
  const hashSignature = Math.abs(hash).toString(16).toUpperCase().padStart(16, '0');

  return {
    receiptNumber: sale.receiptNumber,
    timestamp: sale.serverTimestamp,
    terminalId: sale.terminalId,
    branchId: sale.branchId,
    cashierId: sale.cashierId,
    grandTotal: sale.grandTotal,
    taxTotal: sale.taxTotal,
    taxableSubtotal: sale.taxableSubtotal,
    itemCount: items.length,
    payments: payments.map((p) => ({
      method: p.paymentMethod,
      amount: p.amount,
      reference: p.providerReference || undefined,
    })),
    hashSignature,
  };
}
