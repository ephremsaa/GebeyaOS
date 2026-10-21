import { ScaleBarcodeConfig, ParsedBarcodeResult } from './barcode.types';

export class BarcodeParser {
  private static defaultConfig: ScaleBarcodeConfig = {
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
  public static isValidEan13Checksum(barcode: string): boolean {
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
   */
  public static parse(
    barcode: string,
    customConfig?: Partial<ScaleBarcodeConfig>,
  ): ParsedBarcodeResult {
    const trimmed = barcode.trim();
    const config: ScaleBarcodeConfig = {
      ...this.defaultConfig,
      ...customConfig,
    };

    const isEan13Length = trimmed.length === 13 && /^\d+$/.test(trimmed);
    const checksumValid = isEan13Length ? this.isValidEan13Checksum(trimmed) : true;

    if (isEan13Length && trimmed.startsWith(config.prefix)) {
      const prefixLen = config.prefix.length;
      const pluStart = prefixLen;
      const pluEnd = pluStart + config.pluLength;
      const valueStart = pluEnd;
      const valueEnd = valueStart + config.valueLength;

      const plu = trimmed.substring(pluStart, pluEnd);
      const rawValue = parseInt(trimmed.substring(valueStart, valueEnd), 10);

      if (config.mode === 'WEIGHT') {
        const quantity = config.weightUnit === 'G' ? rawValue / 1000 : rawValue;
        return {
          rawBarcode: trimmed,
          isScaleBarcode: true,
          plu,
          embeddedQuantity: Number(quantity.toFixed(3)),
          checksumValid,
        };
      } else {
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
