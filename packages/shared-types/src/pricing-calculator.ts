export interface LineItemCalculationInput {
  quantity: number;
  unitPrice: number; // Shelf price (tax-inclusive standard in Ethiopian retail)
  isVatApplicable: boolean;
  vatRate: number; // e.g., 0.15 for 15%
  discountAmount?: number; // Fixed amount discount in ETB
  discountPercentage?: number; // Percentage discount (0-100)
}

export interface LineItemCalculationResult {
  quantity: number;
  unitPrice: number;
  grossAmount: number;
  discountAmount: number;
  netAmount: number; // Total after discount
  taxableSubtotal: number; // Base before tax
  taxAmount: number; // 15% VAT
  lineTotal: number; // Final payable for this line
}

export class PricingCalculator {
  /**
   * Resolves the effective unit price and tax settings for a product at a specific branch.
   */
  public static resolvePriceAndTax(
    basePrice: number,
    baseIsVat: boolean,
    baseVatRate: number,
    branchOverride?: {
      selling_price: number | null;
      is_vat_applicable: boolean | null;
      vat_rate: number | null;
    } | null,
  ): {
    effectivePrice: number;
    isBranchOverride: boolean;
    isVatApplicable: boolean;
    vatRate: number;
  } {
    let effectivePrice = basePrice;
    let isBranchOverride = false;
    let isVatApplicable = baseIsVat;
    let vatRate = baseVatRate;

    if (branchOverride) {
      if (branchOverride.selling_price !== null && branchOverride.selling_price !== undefined) {
        effectivePrice = Number(branchOverride.selling_price);
        isBranchOverride = true;
      }
      if (branchOverride.is_vat_applicable !== null && branchOverride.is_vat_applicable !== undefined) {
        isVatApplicable = Boolean(branchOverride.is_vat_applicable);
      }
      if (branchOverride.vat_rate !== null && branchOverride.vat_rate !== undefined) {
        vatRate = Number(branchOverride.vat_rate);
      }
    }

    return {
      effectivePrice: Number(effectivePrice.toFixed(4)),
      isBranchOverride,
      isVatApplicable,
      vatRate: isVatApplicable ? vatRate : 0,
    };
  }

  /**
   * Calculates pack price and conversions.
   * e.g., if selling a carton of 24 pieces.
   */
  public static calculatePackPrice(unitPrice: number, packMultiplier: number): number {
    if (packMultiplier <= 0) {
      throw new Error('Pack multiplier must be greater than zero');
    }
    return Number((unitPrice * packMultiplier).toFixed(4));
  }

  /**
   * Calculates line item financials with Ethiopian 15% tax-inclusive VAT standard.
   */
  public static calculateLineItem(input: LineItemCalculationInput): LineItemCalculationResult {
    const { quantity, unitPrice, isVatApplicable, vatRate } = input;

    if (quantity <= 0) {
      throw new Error('Quantity must be greater than zero');
    }
    if (unitPrice < 0) {
      throw new Error('Unit price cannot be negative');
    }

    const grossAmount = Number((quantity * unitPrice).toFixed(4));

    // Calculate discount
    let discountAmount = 0;
    if (input.discountAmount && input.discountAmount > 0) {
      discountAmount = input.discountAmount;
    } else if (input.discountPercentage && input.discountPercentage > 0) {
      discountAmount = (grossAmount * input.discountPercentage) / 100;
    }

    // Ensure discount does not exceed gross
    discountAmount = Number(Math.min(discountAmount, grossAmount).toFixed(4));
    const netAmount = Number((grossAmount - discountAmount).toFixed(4));

    // Tax calculation
    // Ethiopian supermarket shelf prices are tax-inclusive by law:
    // netAmount = taxableSubtotal + taxAmount
    // taxableSubtotal = netAmount / (1 + vatRate)
    let taxableSubtotal = netAmount;
    let taxAmount = 0;

    if (isVatApplicable && vatRate > 0) {
      taxableSubtotal = Number((netAmount / (1 + vatRate)).toFixed(4));
      taxAmount = Number((netAmount - taxableSubtotal).toFixed(4));
    }

    return {
      quantity: Number(quantity.toFixed(3)),
      unitPrice: Number(unitPrice.toFixed(4)),
      grossAmount,
      discountAmount,
      netAmount,
      taxableSubtotal,
      taxAmount,
      lineTotal: netAmount,
    };
  }
}

/**
 * Calculates Ethiopian tax-inclusive breakdown for a net total amount.
 */
export function calculatePricing(
  netTotal: number,
  isVatApplicable: boolean,
  vatRate = 0.15,
): {
  taxableSubtotal: number;
  taxAmount: number;
  taxExemptSubtotal: number;
  total: number;
} {
  const r4 = (n: number) => Number(n.toFixed(4));
  if (isVatApplicable && vatRate > 0) {
    const taxableSubtotal = r4(netTotal / (1 + vatRate));
    const taxAmount = r4(netTotal - taxableSubtotal);
    return {
      taxableSubtotal,
      taxAmount,
      taxExemptSubtotal: 0,
      total: netTotal,
    };
  }
  return {
    taxableSubtotal: 0,
    taxAmount: 0,
    taxExemptSubtotal: netTotal,
    total: netTotal,
  };
}

/**
 * Standard rounding to 2 decimal places using half-up EPSILON correction.
 */
export function round2(num: number): number {
  return Math.round((num + Number.EPSILON) * 100) / 100;
}

/**
 * Calculates Ethiopian retail tax-inclusive 15% VAT for a single line item.
 * Rule: VAT = round2(gross * 15 / 115) for taxable items, 0 for exempt.
 */
export function calculateTaxInclusiveLineVat(gross: number, isVatApplicable: boolean): number {
  if (!isVatApplicable || gross <= 0) {
    return 0;
  }
  return round2((gross * 15) / 115);
}

export interface BasketLineInput {
  quantity: number;
  unitPrice: number;
  discountAmount?: number;
  isVatApplicable: boolean;
}

export interface BasketFinancialTotals {
  subtotal: number;
  discountTotal: number;
  taxableSubtotal: number;
  taxExemptSubtotal: number;
  vatTotal: number;
  grandTotal: number;
}

/**
 * Calculates basket totals following the strict Ethiopian retail rule:
 * 1. Compute net gross for each line (quantity * unitPrice - discount).
 * 2. Compute VAT for each line rounded to 2 decimal places (gross * 15 / 115 or 0).
 * 3. Sum line VATs and line totals to produce authoritative grand totals.
 */
export function calculateBasketFinancials(lines: BasketLineInput[]): BasketFinancialTotals {
  let subtotal = 0;
  let discountTotal = 0;
  let vatTotal = 0;
  let taxableSubtotal = 0;
  let taxExemptSubtotal = 0;
  let grandTotal = 0;

  for (const line of lines) {
    const rawGross = round2(line.quantity * line.unitPrice);
    const discount = round2(Math.min(line.discountAmount || 0, rawGross));
    const netLine = round2(rawGross - discount);

    subtotal = round2(subtotal + rawGross);
    discountTotal = round2(discountTotal + discount);

    if (line.isVatApplicable) {
      const lineVat = calculateTaxInclusiveLineVat(netLine, true);
      const lineNetExVat = round2(netLine - lineVat);
      vatTotal = round2(vatTotal + lineVat);
      taxableSubtotal = round2(taxableSubtotal + lineNetExVat);
    } else {
      taxExemptSubtotal = round2(taxExemptSubtotal + netLine);
    }

    grandTotal = round2(grandTotal + netLine);
  }

  return {
    subtotal,
    discountTotal,
    taxableSubtotal,
    taxExemptSubtotal,
    vatTotal,
    grandTotal,
  };
}

