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
