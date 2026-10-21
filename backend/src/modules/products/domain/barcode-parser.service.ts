export interface ScaleBarcodeConfig {
  prefix: string; // e.g., '20' or '02'
  mode: 'WEIGHT' | 'PRICE';
  pluLength: number; // default 5 (digits 3 to 7)
  valueLength: number; // default 5 (digits 8 to 12)
  weightUnit: 'KG' | 'G'; // default 'G' (grams in barcode, convert to KG)
  priceDivisor: number; // default 100 for cents, or 1 for whole birr
}

export interface ParsedBarcodeResult {
  rawBarcode: string;
  isScaleBarcode: boolean;
  plu?: string;
  embeddedQuantity?: number; // Quantity in default UOM (e.g., kg)
  embeddedPrice?: number; // Embedded total price in ETB
  checksumValid: boolean;
}

export class BarcodeParserService {
  private defaultConfig: ScaleBarcodeConfig = {
    prefix: '20',
    mode: 'WEIGHT',
    pluLength: 5,
    valueLength: 5,
    weightUnit: 'G',
    priceDivisor: 100,
  };

  /**
   * Validates standard EAN-13 modulo-10 checksum.
   */
  public isValidEan13Checksum(barcode: string): boolean {
    if (!/^\d{13}$/.test(barcode)) {
      return false;
    }

    const digits = barcode.split('').map(Number);
    const checkDigit = digits[12];

    let sum = 0;
    for (let i = 0; i < 12; i++) {
      sum += digits[i] * (i % 2 === 0 ? 1 : 3);
    }

    const calculatedCheck = (10 - (sum % 10)) % 10;
    return calculatedCheck === checkDigit;
  }

  /**
   * Parses a scanned barcode string.
   * If it matches scale prefix (e.g., starts with '20' and length 13), extracts PLU and weight/price.
   * Otherwise treats as standard merchandise barcode.
   */
  public parse(
    barcode: string,
    customConfig?: Partial<ScaleBarcodeConfig>,
  ): ParsedBarcodeResult {
    const trimmed = barcode.trim();
    const config: ScaleBarcodeConfig = {
      ...this.defaultConfig,
      ...customConfig,
    };

    // Check if it's an EAN-13 barcode
    const isEan13Length = trimmed.length === 13 && /^\d+$/.test(trimmed);
    const checksumValid = isEan13Length ? this.isValidEan13Checksum(trimmed) : true;

    // Check if it matches scale prefix
    if (isEan13Length && trimmed.startsWith(config.prefix)) {
      const prefixLen = config.prefix.length;
      const pluStart = prefixLen;
      const pluEnd = pluStart + config.pluLength;
      const valueStart = pluEnd;
      const valueEnd = valueStart + config.valueLength;

      const plu = trimmed.substring(pluStart, pluEnd);
      const rawValue = parseInt(trimmed.substring(valueStart, valueEnd), 10);

      if (config.mode === 'WEIGHT') {
        // Typically encoded in grams (e.g., 01500 = 1500 grams = 1.5 kg)
        const quantity = config.weightUnit === 'G' ? rawValue / 1000 : rawValue;
        return {
          rawBarcode: trimmed,
          isScaleBarcode: true,
          plu,
          embeddedQuantity: Number(quantity.toFixed(3)),
          checksumValid,
        };
      } else {
        // Price embedded (e.g., 00750 = 7.50 ETB)
        const price = rawValue / config.priceDivisor;
        return {
          rawBarcode: trimmed,
          isScaleBarcode: true,
          plu,
          embeddedPrice: Number(price.toFixed(4)),
          checksumValid,
        };
      }
    }

    return {
      rawBarcode: trimmed,
      isScaleBarcode: false,
      checksumValid,
    };
  }
}
