import { describe, it, expect } from 'vitest';
import { PricingCalculatorService } from '../../src/modules/products/domain/pricing-calculator.service';

describe('PricingCalculatorService', () => {
  const calculator = new PricingCalculatorService();

  describe('resolvePriceAndTax', () => {
    it('returns master base price when no branch override exists', () => {
      const res = calculator.resolvePriceAndTax(120.0, true, 0.15, null);
      expect(res.effectivePrice).toBe(120.0);
      expect(res.isBranchOverride).toBe(false);
      expect(res.isVatApplicable).toBe(true);
      expect(res.vatRate).toBe(0.15);
    });

    it('applies branch-specific price override', () => {
      const res = calculator.resolvePriceAndTax(120.0, true, 0.15, {
        selling_price: 135.5,
        is_vat_applicable: null,
        vat_rate: null,
      });
      expect(res.effectivePrice).toBe(135.5);
      expect(res.isBranchOverride).toBe(true);
      expect(res.isVatApplicable).toBe(true);
      expect(res.vatRate).toBe(0.15);
    });

    it('applies branch-specific tax exemption override', () => {
      const res = calculator.resolvePriceAndTax(100.0, true, 0.15, {
        selling_price: null,
        is_vat_applicable: false,
        vat_rate: 0,
      });
      expect(res.effectivePrice).toBe(100.0);
      expect(res.isBranchOverride).toBe(false);
      expect(res.isVatApplicable).toBe(false);
      expect(res.vatRate).toBe(0);
    });
  });

  describe('Pack Multiplier Calculations', () => {
    it('multiplies unit price by pack multiplier', () => {
      // 1 bottle = 30 ETB, Carton of 24 = 720 ETB
      expect(calculator.calculatePackPrice(30.0, 24)).toBe(720.0);
    });

    it('throws when pack multiplier is <= 0', () => {
      expect(() => calculator.calculatePackPrice(30.0, 0)).toThrow();
    });
  });

  describe('Ethiopian 15% VAT Tax-Inclusive Line Item Calculation', () => {
    it('calculates 15% VAT accurately for tax-inclusive retail price', () => {
      // 1 item @ 115 ETB (inclusive of 15% VAT)
      // taxableSubtotal = 115 / 1.15 = 100 ETB
      // taxAmount = 15 ETB
      const result = calculator.calculateLineItem({
        quantity: 1,
        unitPrice: 115.0,
        isVatApplicable: true,
        vatRate: 0.15,
      });

      expect(result.grossAmount).toBe(115.0);
      expect(result.discountAmount).toBe(0);
      expect(result.lineTotal).toBe(115.0);
      expect(result.taxableSubtotal).toBe(100.0);
      expect(result.taxAmount).toBe(15.0);
    });

    it('calculates weighted items with fractional quantities', () => {
      // 1.5 kg of beef @ 460 ETB/kg (tax-inclusive)
      // gross = 690 ETB
      // taxableSubtotal = 690 / 1.15 = 600 ETB
      // taxAmount = 90 ETB
      const result = calculator.calculateLineItem({
        quantity: 1.5,
        unitPrice: 460.0,
        isVatApplicable: true,
        vatRate: 0.15,
      });

      expect(result.grossAmount).toBe(690.0);
      expect(result.lineTotal).toBe(690.0);
      expect(result.taxableSubtotal).toBe(600.0);
      expect(result.taxAmount).toBe(90.0);
    });

    it('calculates VAT-exempt items with zero tax', () => {
      // Bread/injera exempt from VAT
      const result = calculator.calculateLineItem({
        quantity: 5,
        unitPrice: 20.0,
        isVatApplicable: false,
        vatRate: 0,
      });

      expect(result.grossAmount).toBe(100.0);
      expect(result.lineTotal).toBe(100.0);
      expect(result.taxableSubtotal).toBe(100.0);
      expect(result.taxAmount).toBe(0.0);
    });

    it('applies percentage discounts before tax breakdown', () => {
      // 100 ETB item with 10% discount = 90 ETB net
      // taxableSubtotal = 90 / 1.15 = 78.2609 ETB
      // taxAmount = 11.7391 ETB
      const result = calculator.calculateLineItem({
        quantity: 1,
        unitPrice: 100.0,
        isVatApplicable: true,
        vatRate: 0.15,
        discountPercentage: 10,
      });

      expect(result.grossAmount).toBe(100.0);
      expect(result.discountAmount).toBe(10.0);
      expect(result.lineTotal).toBe(90.0);
      expect(result.taxableSubtotal).toBe(78.26);
      expect(result.taxAmount).toBe(11.74);
    });

    it('implements VAT = gross x 15/115 for taxable items, 0 for exempt, rounding per line then summing', () => {
      // Line 1: Taxable item gross = 100 ETB. VAT = round2(100 * 15 / 115) = 13.04 ETB, base = 86.96 ETB
      // Line 2: Taxable item gross = 50 ETB. VAT = round2(50 * 15 / 115) = 6.52 ETB, base = 43.48 ETB
      // Line 3: Exempt item gross = 80 ETB. VAT = 0 ETB, exempt base = 80 ETB
      const basket = PricingCalculatorService.calculateBasketTotals([
        { quantity: 1, unitPrice: 100, isVatApplicable: true },
        { quantity: 1, unitPrice: 50, isVatApplicable: true },
        { quantity: 1, unitPrice: 80, isVatApplicable: false },
      ]);

      expect(basket.subtotal).toBe(230.0);
      expect(basket.grandTotal).toBe(230.0);
      expect(basket.totalVatAmount).toBe(19.56); // 13.04 + 6.52
      expect(basket.taxableSubtotal).toBe(130.44); // 86.96 + 43.48
      expect(basket.taxExemptSubtotal).toBe(80.0);
      // Sum of taxable base + VAT + exempt base must equal grandTotal
      expect(basket.taxableSubtotal + basket.totalVatAmount + basket.taxExemptSubtotal).toBe(230.0);
    });
  });
});
