import { describe, it, expect } from 'vitest';
import { formatMoney } from '../src/money-formatter';

describe('formatMoney (Money Formatter)', () => {
  it('formats thousands separators with 2 decimals in English ("12,500.00 ETB")', () => {
    expect(formatMoney(12500, 'en')).toBe('12,500.00 ETB');
    expect(formatMoney(110, 'en')).toBe('110.00 ETB');
    expect(formatMoney(35.5, 'en')).toBe('35.50 ETB');
    expect(formatMoney(0, 'en')).toBe('0.00 ETB');
  });

  it('formats thousands separators with 2 decimals in Amharic ("12,500.00 ብር")', () => {
    expect(formatMoney(12500, 'am')).toBe('12,500.00 ብር');
    expect(formatMoney(110, 'am')).toBe('110.00 ብር');
    expect(formatMoney(890, 'am')).toBe('890.00 ብር');
    expect(formatMoney(0, 'am')).toBe('0.00 ብር');
  });

  it('handles negative numbers correctly', () => {
    expect(formatMoney(-50.25, 'en')).toBe('-50.25 ETB');
    expect(formatMoney(-1500, 'am')).toBe('-1,500.00 ብር');
  });

  it('formats large multi-million amounts with proper comma separators', () => {
    expect(formatMoney(1234567.89, 'en')).toBe('1,234,567.89 ETB');
    expect(formatMoney(1234567.89, 'am')).toBe('1,234,567.89 ብር');
  });

  it('supports omitting the currency symbol when requested', () => {
    expect(formatMoney(12500, 'en', { includeSymbol: false })).toBe('12,500.00');
  });
});
