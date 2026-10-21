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
