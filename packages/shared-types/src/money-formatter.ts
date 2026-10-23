export type SupportedLanguage = 'en' | 'am';

export interface FormatMoneyOptions {
  includeSymbol?: boolean;
}

/**
 * Formats monetary amounts with thousands separators and 2 decimal places.
 * - English format: "12,500.00 ETB"
 * - Amharic format: "12,500.00 ብር"
 */
export function formatMoney(
  amount: number,
  language: SupportedLanguage = 'en',
  options: FormatMoneyOptions = { includeSymbol: true }
): string {
  const numericValue = typeof amount === 'number' && !isNaN(amount) ? amount : 0;

  // Format with thousands separator and exactly 2 decimal places
  const fixed = Math.abs(numericValue).toFixed(2);
  const [integerPart, decimalPart] = fixed.split('.');
  const formattedInteger = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const sign = numericValue < 0 ? '-' : '';
  const formattedNumber = `${sign}${formattedInteger}.${decimalPart}`;

  if (options.includeSymbol === false) {
    return formattedNumber;
  }

  const symbol = language === 'am' ? 'ብር' : 'ETB';
  return `${formattedNumber} ${symbol}`;
}
