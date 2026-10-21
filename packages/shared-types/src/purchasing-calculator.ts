import {
  AVCOCalculationInput,
  AVCOCalculationResult,
  LandedCostItemInput,
  LandedCostApportionResultItem,
} from './purchasing.types';

/**
 * Calculates Weighted Average Cost (AVCO) dynamically on receipt of goods.
 * Blends existing on-hand stock with newly received stock at final landed cost.
 */
export function calculateAVCO(input: AVCOCalculationInput): AVCOCalculationResult {
  const { currentOnHandQty, currentCost, receivedQty, receivedUnitCost } = input;
  const r4 = (n: number) => Number(n.toFixed(4));

  if (receivedQty <= 0) {
    return {
      newCost: r4(currentCost),
      previousCost: r4(currentCost),
      blendedQuantity: r4(Math.max(0, currentOnHandQty)),
    };
  }

  // If current stock is zero or negative (e.g. from allowed negative sales),
  // the incoming shipment resets the unit cost directly.
  if (currentOnHandQty <= 0) {
    return {
      newCost: r4(receivedUnitCost),
      previousCost: r4(currentCost),
      blendedQuantity: r4(receivedQty),
    };
  }

  const existingValue = currentOnHandQty * currentCost;
  const incomingValue = receivedQty * receivedUnitCost;
  const blendedQty = currentOnHandQty + receivedQty;
  const newCost = (existingValue + incomingValue) / blendedQty;

  return {
    newCost: r4(newCost),
    previousCost: r4(currentCost),
    blendedQuantity: r4(blendedQty),
  };
}

/**
 * Apportions landed costs (freight, offloading, insurance) across GRN line items.
 * Uses value-based allocation proportional to total purchase cost of each item.
 */
export function apportionLandedCost(
  items: LandedCostItemInput[],
  totalLandedFreight: number,
  totalLandedOther: number,
): LandedCostApportionResultItem[] {
  const r4 = (n: number) => Number(n.toFixed(4));
  const totalLanded = totalLandedFreight + totalLandedOther;

  if (items.length === 0) {
    return [];
  }

  const itemTotals = items.map((item) => ({
    ...item,
    purchaseTotal: item.receivedQuantity * item.purchaseUnitCost,
  }));

  const totalPurchaseValue = itemTotals.reduce(
    (sum, item) => sum + item.purchaseTotal,
    0,
  );
  const totalQuantity = itemTotals.reduce(
    (sum, item) => sum + item.receivedQuantity,
    0,
  );

  return itemTotals.map((item) => {
    let apportionedLanded = 0;

    if (totalLanded > 0) {
      if (totalPurchaseValue > 0) {
        // Apportion by purchase value share
        const share = item.purchaseTotal / totalPurchaseValue;
        apportionedLanded = r4(totalLanded * share);
      } else if (totalQuantity > 0) {
        // Fallback: apportion by quantity share if items had 0 base cost
        const share = item.receivedQuantity / totalQuantity;
        apportionedLanded = r4(totalLanded * share);
      }
    }

    const additionalCostPerUnit =
      item.receivedQuantity > 0 ? apportionedLanded / item.receivedQuantity : 0;
    const finalUnitCost = r4(item.purchaseUnitCost + additionalCostPerUnit);

    return {
      productId: item.productId,
      purchaseTotal: r4(item.purchaseTotal),
      apportionedLandedCost: apportionedLanded,
      finalUnitCost,
    };
  });
}

/**
 * Computes Ethiopian Withholding Tax (2%) for supplier purchases.
 * Under Ethiopian tax law: applicable when a single transaction is >= 10,000 ETB.
 */
export function calculateWithholdingTax(
  totalAmount: number,
  hasValidTin = true,
  threshold = 10000,
  rate = 0.02,
): number {
  const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

  if (!hasValidTin || totalAmount < threshold) {
    return 0;
  }

  return r2(totalAmount * rate);
}
