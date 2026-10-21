import { describe, it, expect } from 'vitest';
import { BarcodeParserService } from '../../src/modules/products/domain/barcode-parser.service';

describe('BarcodeParserService', () => {
  const parser = new BarcodeParserService();

  describe('EAN-13 Checksum Validation', () => {
    it('validates a correct EAN-13 checksum', () => {
      // 5901234123457 is a valid EAN-13
      expect(parser.isValidEan13Checksum('5901234123457')).toBe(true);
    });

    it('rejects an invalid EAN-13 checksum', () => {
      expect(parser.isValidEan13Checksum('5901234123459')).toBe(false);
    });
  });

  describe('Standard Barcode Parsing', () => {
    it('treats normal product barcode as standard merchandise', () => {
      const result = parser.parse('6281006560027'); // e.g. imported canned food
      expect(result.isScaleBarcode).toBe(false);
      expect(result.rawBarcode).toBe('6281006560027');
      expect(result.plu).toBeUndefined();
    });
  });

  describe('Deli / Butcher Scale Weight-Embedded Barcodes', () => {
    it('extracts 5-digit PLU and weight in KG from EAN-13 scale barcode', () => {
      // Prefix '20', PLU '00123', Weight '01500' (1.500 kg), Checksum '2'
      const rawBarcode = '2000123015002';
      const result = parser.parse(rawBarcode, {
        prefix: '20',
        mode: 'WEIGHT',
        weightUnit: 'G',
      });

      expect(result.isScaleBarcode).toBe(true);
      expect(result.plu).toBe('00123');
      expect(result.embeddedQuantity).toBe(1.5);
    });

    it('handles light items e.g., 250 grams (0.250 kg)', () => {
      // Prefix '20', PLU '00456', Weight '00250' (250g)
      const rawBarcode = '2000456002500';
      const result = parser.parse(rawBarcode);

      expect(result.isScaleBarcode).toBe(true);
      expect(result.plu).toBe('00456');
      expect(result.embeddedQuantity).toBe(0.25);
    });
  });

  describe('Price-Embedded Scale Barcodes', () => {
    it('extracts embedded total price in ETB', () => {
      // Prefix '02', PLU '00789', Price '04500' (45.00 ETB)
      const rawBarcode = '0200789045001';
      const result = parser.parse(rawBarcode, {
        prefix: '02',
        mode: 'PRICE',
        priceDivisor: 100,
      });

      expect(result.isScaleBarcode).toBe(true);
      expect(result.plu).toBe('00789');
      expect(result.embeddedPrice).toBe(45.0);
    });
  });
});
