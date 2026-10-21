import { describe, it, expect } from 'vitest';
import {
  generateReceiptNumber,
  formatEscPosThermalReceipt,
  createElectronicJournalEntry,
  ThermalReceiptData,
  SaleRecord,
} from '../src';

describe('Receipt Formatter', () => {
  describe('generateReceiptNumber', () => {
    it('generates offline-safe standard receipt number with formatted date, shift, and sequence', () => {
      const date = new Date(2026, 9, 21); // October 21, 2026
      const receiptNo = generateReceiptNumber('BOLE-01', 'POS-02', date, 3, 47);

      expect(receiptNo).toBe('BOLE01-POS02-20261021-03-0047');
    });

    it('cleans special characters and pads values properly', () => {
      const date = new Date(2026, 0, 5); // January 5, 2026
      const receiptNo = generateReceiptNumber('hq/main', 'term #1', date, 1, 3);

      expect(receiptNo).toBe('HQMAIN-TERM1-20260105-01-0003');
    });
  });

  describe('formatEscPosThermalReceipt', () => {
    it('produces formatted 80mm ESC/POS layout with Ethiopian VAT flags and payment summary', () => {
      const data: ThermalReceiptData = {
        storeName: 'GEBEYA HYPERMARKET',
        storeTin: '0012345678',
        storeVatNumber: 'ETH-VAT-98765',
        branchName: 'BOLE BRANCH',
        branchAddress: 'Cameroon St, Addis Ababa',
        branchPhone: '+251 11 661 0000',
        terminalCode: 'POS-01',
        cashierName: 'Abebe Bikila',
        receiptNumber: 'BOLE01-POS01-20261021-01-0001',
        saleDate: '2026-10-21 14:35:10',
        items: [
          {
            name: 'Highland Water 1L',
            quantity: 2,
            unitPrice: 35.0,
            lineTotal: 70.0,
            isVat: true,
          },
          {
            name: 'Fresh Apples 1KG',
            quantity: 1.5,
            unitPrice: 100.0,
            lineTotal: 150.0,
            isVat: false,
          },
        ],
        subtotal: 220.0,
        discountTotal: 0,
        taxableSubtotal: 60.87,
        vatAmount: 9.13,
        exemptSubtotal: 150.0,
        grandTotal: 220.0,
        payments: [
          { method: 'CASH', amount: 200.0 },
          { method: 'TELEBIRR', amount: 50.0, reference: 'TB-99887766' },
        ],
        changeGiven: 30.0,
        fiscalMrc: 'MOR-REG-0001',
        fiscalReceiptNo: '000001',
        fiscalSignature: 'SIG99887766554433221100',
      };

      const formatted = formatEscPosThermalReceipt(data);

      expect(formatted).toContain('GEBEYA HYPERMARKET');
      expect(formatted).toContain('TIN: 0012345678');
      expect(formatted).toContain('Highland Water 1L (A)');
      expect(formatted).toContain('Fresh Apples 1KG (B)');
      expect(formatted).toContain('TOTAL TO PAY:');
      expect(formatted).toContain('220.00 ETB');
      expect(formatted).toContain('TELEBIRR:');
      expect(formatted).toContain('TB-99887766');
      expect(formatted).toContain('Change Given:');
      expect(formatted).toContain('30.00 ETB');
      expect(formatted).toContain('Fiscal MRC:');
    });
  });

  describe('createElectronicJournalEntry', () => {
    it('creates structured EJ record with deterministic signature', () => {
      const sale: SaleRecord = {
        id: 'sale-01',
        branchId: 'b-01',
        terminalId: 'term-01',
        shiftId: 'shift-01',
        receiptNumber: 'BOLE01-POS01-20261021-01-0001',
        cashierId: 'cashier-01',
        subtotal: 100,
        discountTotal: 0,
        taxableSubtotal: 86.96,
        taxExemptSubtotal: 0,
        taxTotal: 13.04,
        grandTotal: 100,
        totalPaid: 100,
        changeGiven: 0,
        paymentStatus: 'PAID',
        fiscalStatus: 'FISCALIZED',
        reprintCount: 0,
        clientTimestamp: '2026-10-21T14:00:00Z',
        serverTimestamp: '2026-10-21T14:00:01Z',
        createdAt: '2026-10-21T14:00:01Z',
      };

      const ej = createElectronicJournalEntry(sale, [], []);

      expect(ej.receiptNumber).toBe('BOLE01-POS01-20261021-01-0001');
      expect(ej.grandTotal).toBe(100);
      expect(ej.hashSignature).toHaveLength(16);
    });
  });
});
