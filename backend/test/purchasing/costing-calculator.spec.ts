import { describe, it, expect } from 'vitest';
import { CostingCalculator } from '../../src/modules/purchasing/domain/costing.calculator';

describe('CostingCalculator', () => {
  describe('apportionLandedCosts', () => {
    it('apportions landed freight costs proportionately based on purchase value', () => {
      // Item 1: 10 units @ 100 ETB = 1,000 ETB (25% of total value)
      // Item 2: 10 units @ 300 ETB = 3,000 ETB (75% of total value)
      // Total Purchase Value = 4,000 ETB
      // Total Freight = 400 ETB
      const items = [
        { productId: 'prod-1', quantity: 10, purchaseUnitCost: 100.0 },
        { productId: 'prod-2', quantity: 10, purchaseUnitCost: 300.0 },
      ];

      const result = CostingCalculator.apportionLandedCosts(items, 400.0);

      // Item 1 gets 25% of 400 ETB = 100 ETB / 10 units = 10 ETB/unit
      // Final cost = 100 + 10 = 110 ETB
      expect(result[0].apportionedLandedCostPerUnit).toBe(10.0);
      expect(result[0].finalUnitCost).toBe(110.0);

      // Item 2 gets 75% of 400 ETB = 300 ETB / 10 units = 30 ETB/unit
      // Final cost = 300 + 30 = 330 ETB
      expect(result[1].apportionedLandedCostPerUnit).toBe(30.0);
      expect(result[1].finalUnitCost).toBe(330.0);
    });

    it('returns original unit costs when landed cost is zero', () => {
      const items = [{ productId: 'prod-1', quantity: 5, purchaseUnitCost: 50.0 }];
      const result = CostingCalculator.apportionLandedCosts(items, 0);

      expect(result[0].apportionedLandedCostPerUnit).toBe(0);
      expect(result[0].finalUnitCost).toBe(50.0);
    });
  });

  describe('calculateWeightedAverageCost (AVCO)', () => {
    it('calculates new blended AVCO accurately', () => {
      // Existing stock: 20 units @ 100 ETB = 2,000 ETB
      // Incoming stock: 10 units @ 130 ETB = 1,300 ETB
      // Total units: 30, Total value: 3,300 ETB
      // New AVCO = 3300 / 30 = 110 ETB
      const newCost = CostingCalculator.calculateWeightedAverageCost(20, 100.0, 10, 130.0);
      expect(newCost).toBe(110.0);
    });

    it('sets initial AVCO to incoming cost when existing stock is 0', () => {
      const newCost = CostingCalculator.calculateWeightedAverageCost(0, 0, 15, 85.5);
      expect(newCost).toBe(85.5);
    });
  });

  describe('calculateWithholdingTax', () => {
    it('calculates 2% Withholding Tax for purchases >= 10,000 ETB', () => {
      // Purchase of 25,000 ETB -> 2% = 500 ETB
      const tax = CostingCalculator.calculateWithholdingTax(25000.0, true);
      expect(tax).toBe(500.0);
    });

    it('returns zero Withholding Tax for purchases below 10,000 ETB threshold', () => {
      const tax = CostingCalculator.calculateWithholdingTax(8500.0, true);
      expect(tax).toBe(0.0);
    });

    it('returns zero Withholding Tax when exempt/not applicable', () => {
      const tax = CostingCalculator.calculateWithholdingTax(50000.0, false);
      expect(tax).toBe(0.0);
    });
  });
});
