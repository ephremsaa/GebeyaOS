export interface LandedCostItemInput {
  productId: string;
  quantity: number;
  purchaseUnitCost: number;
}

export interface ApportionedLandedCostResult {
  productId: string;
  quantity: number;
  purchaseUnitCost: number;
  apportionedLandedCostPerUnit: number;
  finalUnitCost: number;
}

export class CostingCalculator {
  /**
   * Apportions total landed costs (freight, handling, transport) across received line items.
   * Standard method in supermarket receiving is Value-Weighted apportionment.
   */
  public static apportionLandedCosts(
    items: LandedCostItemInput[],
    totalLandedCost: number,
  ): ApportionedLandedCostResult[] {
    if (totalLandedCost <= 0 || items.length === 0) {
      return items.map((item) => ({
        productId: item.productId,
        quantity: item.quantity,
        purchaseUnitCost: item.purchaseUnitCost,
        apportionedLandedCostPerUnit: 0,
        finalUnitCost: item.purchaseUnitCost,
      }));
    }

    // Calculate total purchase value
    const totalPurchaseValue = items.reduce(
      (sum, item) => sum + item.quantity * item.purchaseUnitCost,
      0,
    );

    return items.map((item) => {
      const lineValue = item.quantity * item.purchaseUnitCost;
      const itemLandedShare =
        totalPurchaseValue > 0
          ? (lineValue / totalPurchaseValue) * totalLandedCost
          : totalLandedCost / items.length;

      const apportionedPerUnit =
        item.quantity > 0 ? itemLandedShare / item.quantity : 0;
      const finalUnitCost = item.purchaseUnitCost + apportionedPerUnit;

      return {
        productId: item.productId,
        quantity: item.quantity,
        purchaseUnitCost: Number(item.purchaseUnitCost.toFixed(4)),
        apportionedLandedCostPerUnit: Number(apportionedPerUnit.toFixed(4)),
        finalUnitCost: Number(finalUnitCost.toFixed(4)),
      };
    });
  }

  /**
   * Calculates new Weighted Average Cost (AVCO) dynamically on receipt of new stock.
   *
   * Formula:
   * New AVCO = ((Current Stock * Current AVCO) + (Received Stock * New Cost)) / (Current Stock + Received Stock)
   */
  public static calculateWeightedAverageCost(
    currentOnHandQuantity: number,
    currentCostPrice: number,
    receivedQuantity: number,
    newUnitCost: number,
  ): number {
    const existingQty = Math.max(0, currentOnHandQuantity);
    const existingCost = Math.max(0, currentCostPrice);
    const newQty = Math.max(0, receivedQuantity);
    const incomingCost = Math.max(0, newUnitCost);

    const totalQty = existingQty + newQty;
    if (totalQty <= 0) {
      return incomingCost;
    }

    const totalValue = existingQty * existingCost + newQty * incomingCost;
    return Number((totalValue / totalQty).toFixed(4));
  }

  /**
   * Calculates Ethiopian Withholding Tax (2% for purchase of goods >= 10,000 ETB).
   */
  public static calculateWithholdingTax(
    totalPurchaseAmount: number,
    isWithholdingApplicable = true,
    threshold = 10000.0,
    taxRate = 0.02,
  ): number {
    if (!isWithholdingApplicable || totalPurchaseAmount < threshold) {
      return 0.0;
    }
    return Number((totalPurchaseAmount * taxRate).toFixed(4));
  }
}
