import { describe, it, expect } from 'vitest';
import { FiscalReceiptAdapter } from '../../src/modules/pos/domain/fiscal/fiscal-receipt-adapter';

describe('FiscalReceiptAdapter', () => {
  const adapter = new FiscalReceiptAdapter();

  const mockReceiptData = {
    branchName: 'Gebeya Supermarket - Bole',
    branchTradeName: 'Gebeya Bole',
    branchAddress: 'Addis Ababa, Bole',
    branchPhone: '+251 11 662 0200',
    tinNumber: '0012345678',
    vatRegistrationNo: 'VAT-ET-987654321',
    terminalCode: 'POS-01',
    cashierName: 'Almaz Tadesse',
    receiptNumber: 'BOLE01-POS01-20261021-01-00001',
    createdAt: new Date('2026-10-21T14:30:00Z'),
    items: [
      {
        name: 'Sunflower Cooking Oil 5L',
        quantity: 1,
        unitPrice: 1150.0,
        discountAmount: 0,
        isVatApplicable: true,
        vatRate: 0.15,
        lineTotal: 1150.0,
      },
      {
        name: 'Fresh Bread',
        quantity: 2,
        unitPrice: 20.0,
        discountAmount: 0,
        isVatApplicable: false,
        vatRate: 0,
        lineTotal: 40.0,
      },
    ],
    subtotal: 1190.0,
    discountTotal: 0,
    taxableSubtotal: 1000.0,
    taxExemptSubtotal: 40.0,
    taxTotal: 150.0,
    grandTotal: 1190.0,
    payments: [
      { method: 'CASH', amount: 1000.0 },
      { method: 'TELEBIRR', amount: 200.0, reference: 'TLB-98765432' },
    ],
    changeGiven: 10.0,
    reprintCount: 0,
  };

  it('generates formatted ESC/POS receipt text containing MOR TIN, VAT, and item breakdown', () => {
    const text = adapter.generateReceiptText(mockReceiptData);

    expect(text).toContain('GEBEYA SUPERMARKET - BOLE');
    expect(text).toContain('TIN: 0012345678');
    expect(text).toContain('VAT REG: VAT-ET-987654321');
    expect(text).toContain('BOLE01-POS01-20261021-01-00001');
    expect(text).toContain('Sunflower Cooking Oil 5L (15% VAT)');
    expect(text).toContain('Fresh Bread (EXEMPT)');
    expect(text).toContain('TOTAL AMOUNT DUE');
    expect(text).toContain('1190.00 ETB');
    expect(text).toContain('CHANGE GIVEN');
    expect(text).toContain('10.00 ETB');
  });

  it('renders duplicate reprint banner when reprintCount > 0', () => {
    const reprintData = {
      ...mockReceiptData,
      reprintCount: 2,
    };
    const text = adapter.generateReceiptText(reprintData);

    expect(text).toContain('*** DUPLICATE REPRINT ***');
    expect(text).toContain('REPRINT COUNT: 2');
  });

  it('generates compliant electronic journal payload for fiscal log', () => {
    const payload = adapter.generateFiscalPayload(mockReceiptData);

    expect(payload.tin).toBe('0012345678');
    expect(payload.grand_total).toBe(1190.0);
    expect(payload.vat_15_amount).toBe(150.0);
    expect(payload.vat_exempt_amount).toBe(40.0);
    expect(payload.items_count).toBe(2);
  });
});
