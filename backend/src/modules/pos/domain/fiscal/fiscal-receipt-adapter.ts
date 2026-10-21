export interface FiscalReceiptData {
  branchName: string;
  branchTradeName?: string;
  branchAddress: string;
  branchPhone: string;
  tinNumber: string;
  vatRegistrationNo?: string;
  terminalCode: string;
  cashierName: string;
  receiptNumber: string;
  fiscalMrc?: string;
  fiscalReceiptNo?: string;
  createdAt: Date;
  items: Array<{
    name: string;
    quantity: number;
    unitPrice: number;
    discountAmount: number;
    isVatApplicable: boolean;
    vatRate: number;
    lineTotal: number;
  }>;
  subtotal: number;
  discountTotal: number;
  taxableSubtotal: number;
  taxExemptSubtotal: number;
  taxTotal: number;
  grandTotal: number;
  payments: Array<{
    method: string;
    amount: number;
    reference?: string;
  }>;
  changeGiven: number;
  reprintCount: number;
}

export class FiscalReceiptAdapter {
  /**
   * Generates a standard formatted 80mm ESC/POS receipt text layout
   * with complete Ethiopian MOR / ERCA tax registration fields.
   */
  public generateReceiptText(data: FiscalReceiptData): string {
    const divider = '------------------------------------------------';
    const lines: string[] = [];

    // Header
    lines.push(this.center(data.branchName.toUpperCase()));
    if (data.branchTradeName) {
      lines.push(this.center(data.branchTradeName));
    }
    lines.push(this.center(data.branchAddress));
    lines.push(this.center(`TEL: ${data.branchPhone}`));
    lines.push(this.center(`TIN: ${data.tinNumber}`));
    if (data.vatRegistrationNo) {
      lines.push(this.center(`VAT REG: ${data.vatRegistrationNo}`));
    }
    lines.push(divider);

    if (data.reprintCount > 0) {
      lines.push(this.center('*** DUPLICATE REPRINT ***'));
      lines.push(this.center(`REPRINT COUNT: ${data.reprintCount}`));
      lines.push(divider);
    }

    // Fiscal / Receipt Metadata
    lines.push(`RECEIPT NO : ${data.receiptNumber}`);
    if (data.fiscalReceiptNo) {
      lines.push(`FISCAL NO  : ${data.fiscalReceiptNo}`);
    }
    if (data.fiscalMrc) {
      lines.push(`MRC        : ${data.fiscalMrc}`);
    }
    lines.push(`TERMINAL   : ${data.terminalCode}    CASHIER: ${data.cashierName}`);
    lines.push(`DATE / TIME: ${data.createdAt.toISOString().replace('T', ' ').substring(0, 19)}`);
    lines.push(divider);

    // Items table header
    lines.push(this.padRow('ITEM', 'QTY x PRICE', 'TOTAL (ETB)'));
    lines.push(divider);

    for (const item of data.items) {
      const taxFlag = item.isVatApplicable ? ' (15% VAT)' : ' (EXEMPT)';
      lines.push(`${item.name}${taxFlag}`);

      const qtyPrice = `${item.quantity} x ${item.unitPrice.toFixed(2)}`;
      const totalStr = item.lineTotal.toFixed(2);
      lines.push(this.padRow('', qtyPrice, totalStr));

      if (item.discountAmount > 0) {
        lines.push(this.padRow('', '  DISCOUNT', `-${item.discountAmount.toFixed(2)}`));
      }
    }
    lines.push(divider);

    // Financial Totals
    lines.push(this.padRow('SUBTOTAL (GROSS)', '', data.subtotal.toFixed(2)));
    if (data.discountTotal > 0) {
      lines.push(this.padRow('TOTAL DISCOUNT', '', `-${data.discountTotal.toFixed(2)}`));
    }
    lines.push(this.padRow('TAXABLE BASE (15%)', '', data.taxableSubtotal.toFixed(2)));
    lines.push(this.padRow('VAT 15%', '', data.taxTotal.toFixed(2)));
    if (data.taxExemptSubtotal > 0) {
      lines.push(this.padRow('VAT EXEMPT ITEMS', '', data.taxExemptSubtotal.toFixed(2)));
    }
    lines.push(divider);
    lines.push(this.padRow('TOTAL AMOUNT DUE', '', `${data.grandTotal.toFixed(2)} ETB`));
    lines.push(divider);

    // Payments
    lines.push('PAYMENT BREAKDOWN:');
    for (const p of data.payments) {
      const ref = p.reference ? ` [${p.reference}]` : '';
      lines.push(this.padRow(`- ${p.method}${ref}`, '', `${p.amount.toFixed(2)} ETB`));
    }
    if (data.changeGiven > 0) {
      lines.push(this.padRow('CHANGE GIVEN', '', `${data.changeGiven.toFixed(2)} ETB`));
    }

    lines.push(divider);
    lines.push(this.center('THANK YOU FOR SHOPPING AT GEBEYA!'));
    lines.push(this.center('እባክዎን የገንዘብ መቀበያ ደረሰኝዎን ይያዙ!'));
    lines.push(this.center('(PLEASE RETAIN YOUR FISCAL RECEIPT)'));
    lines.push('\n\n\n');

    return lines.join('\n');
  }

  /**
   * Generates the electronic journal (EJ) JSON structure for ERCA/MOR fiscal devices.
   */
  public generateFiscalPayload(data: FiscalReceiptData) {
    return {
      tin: data.tinNumber,
      vat_reg: data.vatRegistrationNo,
      receipt_no: data.receiptNumber,
      terminal: data.terminalCode,
      subtotal: data.subtotal,
      vat_15_base: data.taxableSubtotal,
      vat_15_amount: data.taxTotal,
      vat_exempt_amount: data.taxExemptSubtotal,
      grand_total: data.grandTotal,
      items_count: data.items.length,
      timestamp: data.createdAt.toISOString(),
      reprint: data.reprintCount > 0,
    };
  }

  private center(text: string, width = 48): string {
    if (text.length >= width) return text;
    const pad = Math.floor((width - text.length) / 2);
    return ' '.repeat(pad) + text;
  }

  private padRow(col1: string, col2: string, col3: string, width = 48): string {
    const col3Width = 14;
    const col2Width = 16;
    const col1Width = width - col2Width - col3Width;

    const c1 = col1.padEnd(col1Width).substring(0, col1Width);
    const c2 = col2.padStart(col2Width).substring(0, col2Width);
    const c3 = col3.padStart(col3Width).substring(0, col3Width);

    return `${c1}${c2}${c3}`;
  }
}
