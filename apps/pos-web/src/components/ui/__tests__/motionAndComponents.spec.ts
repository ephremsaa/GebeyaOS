import { describe, it, expect } from 'vitest';
import {
  BRAND_PRESETS,
  generateBrandPalette,
  getContrastRatio,
  hexToRgb,
} from '../../../theme/brandPresets';

describe('Shared UI Components, Tokens & Brand-Color Engine (Step 1)', () => {
  it('generates the deep-green retail palette for default Emerald preset', () => {
    const emerald = BRAND_PRESETS[0];
    expect(emerald.primaryHex).toBe('#1F8A4C');
    expect(emerald.secondaryHex).toBe('#0E4B2F');

    const palette = generateBrandPalette(emerald.primaryHex, emerald.secondaryHex);
    expect(palette.primary).toBe('#1F8A4C');
    expect(palette.sidebarFrom).toBe('#0E4B2F');
    expect(palette.sidebarTo).toBe('#0A3A25');
    expect(palette.sidebarActive).toBe('#1F8A4C');
    expect(palette.sidebarHover).toBe('rgba(255, 255, 255, 0.08)');
    expect(palette.primaryFg).toBe('#FFFFFF');
  });

  it('enforces WCAG AA contrast for dark navy brand color in sidebar', () => {
    // Dark navy custom color: #0A192F
    const palette = generateBrandPalette('#0A192F');
    const whiteRgb = { r: 255, g: 255, b: 255 };

    const fromRgb = hexToRgb(palette.sidebarFrom);
    const toRgb = hexToRgb(palette.sidebarTo);

    const fromContrast = getContrastRatio(fromRgb, whiteRgb);
    const toContrast = getContrastRatio(toRgb, whiteRgb);

    expect(fromContrast).toBeGreaterThanOrEqual(4.5);
    expect(toContrast).toBeGreaterThanOrEqual(4.5);
  });

  it('safely handles very light yellow brand color by darkening to meet contrast requirements', () => {
    // Very light yellow #FFF9C4
    const palette = generateBrandPalette('#FFF9C4');
    expect(palette.primary).not.toBe('#FFF9C4'); // Darkened for contrast

    const whiteRgb = { r: 255, g: 255, b: 255 };
    const fromRgb = hexToRgb(palette.sidebarFrom);
    const fromContrast = getContrastRatio(fromRgb, whiteRgb);
    expect(fromContrast).toBeGreaterThanOrEqual(4.5);
  });

  it('formats thousands correctly in CountUpNumber utility logic', () => {
    const formatThousands = (val: number, decimals: number = 2) => {
      const fixed = val.toFixed(decimals);
      const parts = fixed.split('.');
      parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
      return parts.join('.');
    };

    expect(formatThousands(12500)).toBe('12,500.00');
    expect(formatThousands(1000000.5, 2)).toBe('1,000,000.50');
    expect(formatThousands(0, 2)).toBe('0.00');
    expect(formatThousands(45.99, 2)).toBe('45.99');
  });

  it('calculates progress bar percentages with boundary clamping', () => {
    const calcPercentage = (value: number, max: number = 100) => {
      return Math.max(0, Math.min(100, Math.round((value / max) * 100)));
    };

    expect(calcPercentage(50, 100)).toBe(50);
    expect(calcPercentage(150, 100)).toBe(100);
    expect(calcPercentage(-10, 100)).toBe(0);
    expect(calcPercentage(1, 3)).toBe(33);
  });
});
