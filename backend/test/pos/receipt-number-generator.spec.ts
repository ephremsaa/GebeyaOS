import { describe, it, expect } from 'vitest';
import { ReceiptNumberGenerator } from '../../src/modules/pos/domain/receipt-number-generator';

describe('ReceiptNumberGenerator', () => {
  it('generates an offline-safe receipt number with correct format and padding', () => {
    const fixedDate = new Date(2026, 9, 21); // Oct 21, 2026
    const receiptNo = ReceiptNumberGenerator.generate(
      'BOLE-01',
      'POS-01',
      2,
      42,
      fixedDate,
    );

    expect(receiptNo).toBe('BOLE01-POS01-20261021-02-00042');
  });

  it('handles single-digit shift and high sequence numbers', () => {
    const fixedDate = new Date(2026, 0, 5); // Jan 05, 2026
    const receiptNo = ReceiptNumberGenerator.generate(
      'MEK-01',
      'POS-03',
      1,
      1234,
      fixedDate,
    );

    expect(receiptNo).toBe('MEK01-POS03-20260105-01-01234');
  });
});
