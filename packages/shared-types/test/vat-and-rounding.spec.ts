import { describe, it, expect } from 'vitest';
import {
  calculateTaxInclusiveLineVat,
  calculateBasketFinancials,
  round2,
  generateReceiptNumber,
} from '../src';

describe('VAT and Rounding Rule for Ethiopian Retail POS', () => {
  it('calculates tax-inclusive 15% VAT per line using VAT = round2(gross * 15 / 115) for taxable items', () => {
    // 100 ETB gross: 100 * 15 / 115 = 13.043478... -> 13.04 ETB
    expect(calculateTaxInclusiveLineVat(100, true)).toBe(13.04);

    // 230 ETB gross: 230 * 15 / 115 = 30.00 ETB
    expect(calculateTaxInclusiveLineVat(230, true)).toBe(30.0);

    // 35.50 ETB gross: 35.50 * 15 / 115 = 4.6304... -> 4.63 ETB
    expect(calculateTaxInclusiveLineVat(35.5, true)).toBe(4.63);

    // Exempt items have 0.00 VAT
    expect(calculateTaxInclusiveLineVat(100, false)).toBe(0);
    expect(calculateTaxInclusiveLineVat(500, false)).toBe(0);
  });

  it('calculates basket financials rounding per line, then summing without floating point drift', () => {
    const lines = [
      // Line 1: Taxable item (e.g., Cooking Oil 1L)
      { quantity: 2, unitPrice: 150, discountAmount: 10, isVatApplicable: true }, // net 290 -> VAT = 290 * 15/115 = 37.83, net = 252.17
      // Line 2: Tax-exempt staple (e.g., Teff 5kg)
      { quantity: 5, unitPrice: 85, discountAmount: 0, isVatApplicable: false }, // net 425 -> VAT = 0, exempt = 425
      // Line 3: Small taxable item (e.g., Biscuit)
      { quantity: 3, unitPrice: 22.5, discountAmount: 0, isVatApplicable: true }, // net 67.5 -> VAT = 67.5 * 15/115 = 8.80, net = 58.70
    ];

    const result = calculateBasketFinancials(lines);

    // Subtotal = 300 + 425 + 67.5 = 792.50
    expect(result.subtotal).toBe(792.5);
    // Discount = 10
    expect(result.discountTotal).toBe(10);
    // Grand total = 290 + 425 + 67.5 = 782.50
    expect(result.grandTotal).toBe(782.5);

    // VAT = 37.83 + 8.80 = 46.63
    expect(result.vatTotal).toBe(46.63);

    // Taxable net base = 252.17 + 58.70 = 310.87
    expect(result.taxableSubtotal).toBe(310.87);

    // Tax-exempt base = 425
    expect(result.taxExemptSubtotal).toBe(425);

    // Integrity: taxableSubtotal + vatTotal + taxExemptSubtotal === grandTotal
    expect(round2(result.taxableSubtotal + result.vatTotal + result.taxExemptSubtotal)).toBe(result.grandTotal);
  });

  it('validates offline receipt number format: {BRANCH}-{TERM}-{YYYYMMDD}-{SHIFT}-{SEQ}', () => {
    const d = new Date(2026, 9, 25);
    const receiptNo = generateReceiptNumber('BOLE', 'POS01', d, 2, 88);
    expect(receiptNo).toBe('BOLE-POS01-20261025-02-0088');
  });

  it('validates split payment tender calculations', () => {
    const grandTotal = 782.5;

    // Split: 500 Telebirr + 300 Cash
    const payments = [
      { method: 'TELEBIRR', amount: 500 },
      { method: 'CASH', amount: 300 },
    ];

    const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0);
    const changeDue = Math.max(0, round2(totalPaid - grandTotal));

    expect(totalPaid).toBe(800);
    expect(changeDue).toBe(17.5); // Cash change
    expect(round2(totalPaid - changeDue)).toBe(grandTotal);
  });
});
