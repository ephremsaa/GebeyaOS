/**
 * Offline Code 128B Barcode SVG Generator
 * Generates crisp vector SVG barcodes for thermal label printers without any external dependencies.
 */

// Code 128 pattern table (patterns for characters 0-106)
const CODE128_PATTERNS = [
  '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213',
  '221312', '231212', '112232', '122132', '122231', '113222', '123122', '123221', '223211', '221132',
  '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211',
  '212123', '212321', '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313',
  '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121', '313121', '211331',
  '231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111',
  '314111', '221411', '431111', '111224', '111422', '121124', '121421', '141122', '141221', '112214',
  '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111',
  '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141',
  '214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113', '411311', '113141',
  '114131', '311141', '411131', '211412', '211214', '211232', '2331112'
];

const START_B = 104;
const STOP = 106;

export function generateCode128Svg(text: string, width = 240, height = 70): string {
  if (!text || text.trim() === '') return '';

  const cleanText = text.trim();
  const codes: number[] = [START_B];

  // Convert each ASCII char to Code 128B index (ASCII 32 to 126 maps to 0 to 94)
  for (let i = 0; i < cleanText.length; i++) {
    const code = cleanText.charCodeAt(i) - 32;
    if (code >= 0 && code <= 95) {
      codes.push(code);
    } else {
      codes.push(0); // Space fallback
    }
  }

  // Calculate Checksum: (START_B + sum(i * code_i)) % 103
  let checksum = codes[0];
  for (let i = 1; i < codes.length; i++) {
    checksum += i * codes[i];
  }
  codes.push(checksum % 103);
  codes.push(STOP);

  // Convert codes to bar pattern string
  let pattern = '';
  for (const c of codes) {
    pattern += CODE128_PATTERNS[c] || '';
  }

  // Calculate total modules: sum of digits in pattern
  let totalModules = 0;
  for (let i = 0; i < pattern.length; i++) {
    totalModules += parseInt(pattern[i], 10);
  }

  const quietZone = 10;
  const totalWidth = totalModules + (quietZone * 2);
  const moduleWidth = width / totalWidth;

  let x = quietZone * moduleWidth;
  let isBar = true;
  let rects = '';

  for (let i = 0; i < pattern.length; i++) {
    const barWidth = parseInt(pattern[i], 10) * moduleWidth;
    if (isBar) {
      rects += `<rect x="${x.toFixed(2)}" y="0" width="${barWidth.toFixed(2)}" height="${height}" fill="currentColor" />`;
    }
    x += barWidth;
    isBar = !isBar;
  }

  return `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" preserveAspectRatio="none">
      ${rects}
    </svg>
  `.trim();
}
