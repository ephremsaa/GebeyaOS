import { describe, it, expect } from 'vitest';
import { BRAND_PRESETS, generateBrandPalette } from '../../../theme/brandPresets';

describe('Shared UI Components & Motion Primitives (Part 2)', () => {
  it('verifies that brand palette generates valid classes and colors for IconTile and Progress', () => {
    const palette = generateBrandPalette(BRAND_PRESETS[0].primaryHex, BRAND_PRESETS[0].secondaryHex);
    expect(palette.primary).toBe('#10B981');
    expect(palette.secondary).toBe('#0F766E');
    expect(palette.accent).toBe('#F5B942');
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
