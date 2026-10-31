import { describe, it, expect } from 'vitest';
import {
  calculateAVCO,
  apportionLandedCost,
  calculateWithholdingTax,
} from '../src';

describe('Purchasing Calculator', () => {
  describe('calculateAVCO', () => {
    it('blends existing inventory cost with incoming shipment at landed cost', () => {
      // Existing: 100 units at 50 ETB = 5,000 ETB
      // Received: 50 units at 80 ETB = 4,000 ETB
      // Total: 150 units at 9,000 ETB -> 60 ETB / unit
      const result = calculateAVCO({
        currentOnHandQty: 100,
        currentCost: 50,
        receivedQty: 50,
        receivedUnitCost: 80,
      });

      expect(result.newCost).toBe(60);
      expect(result.blendedQuantity).toBe(150);
      expect(result.previousCost).toBe(50);
    });

    it('sets new cost directly when current on hand quantity is zero or negative', () => {
      const resultZero = calculateAVCO({
        currentOnHandQty: 0,
        currentCost: 45,
        receivedQty: 20,
        receivedUnitCost: 55,
      });
      expect(resultZero.newCost).toBe(55);

      const resultNegative = calculateAVCO({
        currentOnHandQty: -5,
        currentCost: 45,
        receivedQty: 20,
        receivedUnitCost: 55,
      });
      expect(resultNegative.newCost).toBe(55);
    });

    it('returns current cost if received quantity is zero', () => {
      const result = calculateAVCO({
        currentOnHandQty: 30,
        currentCost: 70,
        receivedQty: 0,
        receivedUnitCost: 90,
      });
      expect(result.newCost).toBe(70);
    });
  });

  describe('apportionLandedCost', () => {
    it('apportions freight and other landed charges proportionally to purchase value', () => {
      // Item 1: 10 units at 100 ETB = 1,000 ETB (50% of total)
      // Item 2: 20 units at 50 ETB = 1,000 ETB (50% of total)
      // Total freight = 150, other = 50 -> total landed = 200 ETB
      // Each item gets 100 ETB of landed cost
      // Item 1 final unit cost = 100 + (100 / 10) = 110 ETB
      // Item 2 final unit cost = 50 + (100 / 20) = 55 ETB
      const items = [
        { productId: 'p1', receivedQuantity: 10, purchaseUnitCost: 100 },
        { productId: 'p2', receivedQuantity: 20, purchaseUnitCost: 50 },
      ];

      const apportioned = apportionLandedCost(items, 150, 50);

      expect(apportioned).toHaveLength(2);
      expect(apportioned[0].apportionedLandedCost).toBe(100);
      expect(apportioned[0].finalUnitCost).toBe(110);

      expect(apportioned[1].apportionedLandedCost).toBe(100);
      expect(apportioned[1].finalUnitCost).toBe(55);
    });

    it('apportions landed costs by quantity when BY_QUANTITY allocation method is chosen', () => {
      // Item 1: 10 units at 100 ETB (10/30 = 33.33% of units)
      // Item 2: 20 units at 50 ETB (20/30 = 66.67% of units)
      // Total freight: 120, duty: 60, other: 30 -> total landed = 210 ETB
      // Item 1 gets 210 * (10 / 30) = 70 ETB -> 7 ETB/unit -> final unit cost = 107 ETB
      // Item 2 gets 210 * (20 / 30) = 140 ETB -> 7 ETB/unit -> final unit cost = 57 ETB
      const items = [
        { productId: 'p1', receivedQuantity: 10, purchaseUnitCost: 100 },
        { productId: 'p2', receivedQuantity: 20, purchaseUnitCost: 50 },
      ];

      const apportioned = apportionLandedCost(items, 120, 30, 60, 'BY_QUANTITY');

      expect(apportioned[0].apportionedLandedCost).toBe(70);
      expect(apportioned[0].finalUnitCost).toBe(107);
      expect(apportioned[1].apportionedLandedCost).toBe(140);
      expect(apportioned[1].finalUnitCost).toBe(57);
    });

    it('handles zero landed cost cleanly', () => {
      const items = [
        { productId: 'p1', receivedQuantity: 5, purchaseUnitCost: 20 },
      ];

      const apportioned = apportionLandedCost(items, 0, 0);

      expect(apportioned[0].apportionedLandedCost).toBe(0);
      expect(apportioned[0].finalUnitCost).toBe(20);
    });
  });

  describe('calculateWithholdingTax', () => {
    it('calculates 2% withholding tax for purchases >= 10,000 ETB', () => {
      // 15,000 ETB * 0.02 = 300 ETB
      const tax = calculateWithholdingTax(15000, true);
      expect(tax).toBe(300);
    });

    it('returns zero withholding tax for purchases under 10,000 ETB', () => {
      const tax = calculateWithholdingTax(9999.99, true);
      expect(tax).toBe(0);
    });

    it('returns zero withholding tax if supplier lacks a valid TIN', () => {
      const tax = calculateWithholdingTax(20000, false);
      expect(tax).toBe(0);
    });
  });
});
