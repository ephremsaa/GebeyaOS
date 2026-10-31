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

export class PricingCalculatorService {
  /**
   * Resolves the effective unit price and tax settings for a product at a specific branch.
   */
  public resolvePriceAndTax(
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
  public calculatePackPrice(unitPrice: number, packMultiplier: number): number {
    if (packMultiplier <= 0) {
      throw new Error('Pack multiplier must be greater than zero');
    }
    return Number((unitPrice * packMultiplier).toFixed(4));
  }

  /**
   * Standard rounding to 2 decimal places using half-up EPSILON correction.
   */
  public static round2(val: number): number {
    return Math.round((val + Number.EPSILON) * 100) / 100;
  }

  /**
   * Calculates Ethiopian retail tax-inclusive 15% VAT for a single line item.
   * Rule: VAT = round2(gross * 15 / 115) for taxable items, 0 for exempt.
   */
  public static calculateTaxInclusiveLineVat(gross: number, isVatApplicable: boolean): number {
    if (!isVatApplicable || gross <= 0) {
      return 0;
    }
    return PricingCalculatorService.round2((gross * 15) / 115);
  }

  /**
   * Calculates basket totals following Ethiopian retail rule:
   * Rule: Calculate VAT per line rounded to 2 decimals, then sum across all lines.
   */
  public static calculateBasketTotals(
    lines: Array<{
      quantity: number;
      unitPrice: number;
      discountAmount?: number;
      isVatApplicable: boolean;
    }>,
  ) {
    let subtotal = 0;
    let discountTotal = 0;
    let taxableSubtotal = 0;
    let taxExemptSubtotal = 0;
    let totalVatAmount = 0;
    let grandTotal = 0;

    for (const line of lines) {
      const gross = PricingCalculatorService.round2(line.quantity * line.unitPrice);
      const discount = PricingCalculatorService.round2(Math.min(line.discountAmount || 0, gross));
      const lineTotal = PricingCalculatorService.round2(gross - discount);

      subtotal = PricingCalculatorService.round2(subtotal + gross);
      discountTotal = PricingCalculatorService.round2(discountTotal + discount);
      grandTotal = PricingCalculatorService.round2(grandTotal + lineTotal);

      if (line.isVatApplicable) {
        const lineVat = PricingCalculatorService.calculateTaxInclusiveLineVat(lineTotal, true);
        const lineTaxable = PricingCalculatorService.round2(lineTotal - lineVat);
        totalVatAmount = PricingCalculatorService.round2(totalVatAmount + lineVat);
        taxableSubtotal = PricingCalculatorService.round2(taxableSubtotal + lineTaxable);
      } else {
        taxExemptSubtotal = PricingCalculatorService.round2(taxExemptSubtotal + lineTotal);
      }
    }

    return {
      subtotal,
      discountTotal,
      taxableSubtotal,
      taxExemptSubtotal,
      totalVatAmount,
      grandTotal,
    };
  }

  /**
   * Calculates line item financials with Ethiopian 15% tax-inclusive VAT standard.
   */
  public calculateLineItem(input: LineItemCalculationInput): LineItemCalculationResult {
    const { quantity, unitPrice, isVatApplicable, vatRate } = input;

    if (quantity <= 0) {
      throw new Error('Quantity must be greater than zero');
    }
    if (unitPrice < 0) {
      throw new Error('Unit price cannot be negative');
    }

    const grossAmount = PricingCalculatorService.round2(quantity * unitPrice);

    // Calculate discount
    let discountAmount = 0;
    if (input.discountAmount && input.discountAmount > 0) {
      discountAmount = input.discountAmount;
    } else if (input.discountPercentage && input.discountPercentage > 0) {
      discountAmount = (grossAmount * input.discountPercentage) / 100;
    }

    // Ensure discount does not exceed gross
    discountAmount = PricingCalculatorService.round2(Math.min(discountAmount, grossAmount));
    const netAmount = PricingCalculatorService.round2(grossAmount - discountAmount);

    // Tax calculation
    // Ethiopian supermarket shelf prices are tax-inclusive by law:
    // netAmount = taxableSubtotal + taxAmount
    // VAT = gross x 15/115 for taxable items, 0 for exempt
    let taxableSubtotal = netAmount;
    let taxAmount = 0;

    if (isVatApplicable && vatRate > 0) {
      taxAmount = PricingCalculatorService.calculateTaxInclusiveLineVat(netAmount, true);
      taxableSubtotal = PricingCalculatorService.round2(netAmount - taxAmount);
    }

    return {
      quantity: Number(quantity.toFixed(3)),
      unitPrice: PricingCalculatorService.round2(unitPrice),
      grossAmount,
      discountAmount,
      netAmount,
      taxableSubtotal,
      taxAmount,
      lineTotal: netAmount,
    };
  }
}
