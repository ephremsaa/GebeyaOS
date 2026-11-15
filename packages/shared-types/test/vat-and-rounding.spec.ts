import { describe, it, expect } from 'vitest';
import {
  calculateTaxInclusiveLineVat,
  calculateBasketFinancials,
  calculateItemVatBreakdown,
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

  describe('Item Catalog Bidirectional VAT Calculation (Part 3 Requirements)', () => {
    it('calculates inclusive 15% VAT: 115.00 shelf price -> Net 100.00, VAT 15.00, Gross 115.00', () => {
      const result = calculateItemVatBreakdown({
        typedPrice: 115,
        priceIncludesVat: true,
        isVatApplicable: true,
        vatRate: 0.15,
        costPrice: 80,
      });

      expect(result.grossPrice).toBe(115.0);
      expect(result.netPrice).toBe(100.0);
      expect(result.vatAmount).toBe(15.0);
      expect(result.netCents + result.vatCents).toBe(result.grossCents);
      expect(result.profitMarginBirr).toBe(20.0); // 100 net - 80 cost
      expect(result.profitMarginPercent).toBe(20.0); // 20 / 100 * 100
      expect(result.isSellingBelowCost).toBe(false);
    });

    it('calculates exclusive 15% VAT: 100.00 net price -> Net 100.00, VAT 15.00, Gross 115.00', () => {
      const result = calculateItemVatBreakdown({
        typedPrice: 100,
        priceIncludesVat: false,
        isVatApplicable: true,
        vatRate: 0.15,
        costPrice: 80,
      });

      expect(result.netPrice).toBe(100.0);
      expect(result.vatAmount).toBe(15.0);
      expect(result.grossPrice).toBe(115.0);
      expect(result.netCents + result.vatCents).toBe(result.grossCents);
      expect(result.profitMarginBirr).toBe(20.0);
      expect(result.profitMarginPercent).toBe(20.0);
      expect(result.isSellingBelowCost).toBe(false);
    });

    it('calculates exempt 0% VAT: Net === Gross, VAT is 0', () => {
      const result = calculateItemVatBreakdown({
        typedPrice: 250,
        priceIncludesVat: true,
        isVatApplicable: false,
        vatRate: 0,
        costPrice: 200,
      });

      expect(result.grossPrice).toBe(250.0);
      expect(result.netPrice).toBe(250.0);
      expect(result.vatAmount).toBe(0.0);
      expect(result.netCents + result.vatCents).toBe(result.grossCents);
      expect(result.profitMarginBirr).toBe(50.0);
      expect(result.profitMarginPercent).toBe(20.0);
    });

    it('detects selling below cost with warning flag', () => {
      const result = calculateItemVatBreakdown({
        typedPrice: 100, // Gross 100 -> Net 86.96
        priceIncludesVat: true,
        isVatApplicable: true,
        vatRate: 0.15,
        costPrice: 95, // Cost 95 > Net 86.96
      });

      expect(result.isSellingBelowCost).toBe(true);
      expect(result.isNegativeMargin).toBe(true);
      expect(result.profitMarginBirr).toBeLessThan(0);
    });

    it('preserves exact cent identity (netCents + vatCents === grossCents) across edge cases', () => {
      const testCases = [0.01, 0.05, 0.33, 0.99, 1.0, 9.99, 33.33, 49.95, 99.99, 100.0, 115.0, 199.99, 1000.0];

      for (const price of testCases) {
        // Inclusive
        const inc = calculateItemVatBreakdown({
          typedPrice: price,
          priceIncludesVat: true,
          isVatApplicable: true,
          vatRate: 0.15,
        });
        expect(inc.netCents + inc.vatCents).toBe(inc.grossCents);
        expect(round2(inc.netPrice + inc.vatAmount)).toBe(inc.grossPrice);

        // Exclusive
        const exc = calculateItemVatBreakdown({
          typedPrice: price,
          priceIncludesVat: false,
          isVatApplicable: true,
          vatRate: 0.15,
        });
        expect(exc.netCents + exc.vatCents).toBe(exc.grossCents);
        expect(round2(exc.netPrice + exc.vatAmount)).toBe(exc.grossPrice);
      }
    });
  });
});
