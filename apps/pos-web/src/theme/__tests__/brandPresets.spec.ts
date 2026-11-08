import { describe, it, expect } from 'vitest';
import {
  BRAND_PRESETS,
  generateBrandPalette,
  hexToRgb,
  rgbToHex,
  getContrastRatio,
} from '../brandPresets';

describe('Brand Presets & Color Palette Engine (Part 1)', () => {
  it('defines all 8 ready supermarket brand presets', () => {
    expect(BRAND_PRESETS.length).toBe(8);
    const presetIds = BRAND_PRESETS.map((p) => p.id);
    expect(presetIds).toEqual([
      'emerald',
      'ocean',
      'violet',
      'sunset',
      'ruby',
      'teal',
      'gold',
      'slate',
    ]);

    for (const preset of BRAND_PRESETS) {
      expect(preset.primaryHex).toMatch(/^#[0-9A-Fa-f]{6}$/);
      expect(preset.secondaryHex).toMatch(/^#[0-9A-Fa-f]{6}$/);
      expect(preset.accentHex).toMatch(/^#[0-9A-Fa-f]{6}$/);
      expect(preset.name).toBeTruthy();
      expect(preset.nameAm).toBeTruthy();
    }
  });

  it('converts hex to rgb and rgb to hex accurately', () => {
    const rgb = hexToRgb('#10B981');
    expect(rgb).toEqual({ r: 16, g: 185, b: 129 });
    const hex = rgbToHex(rgb);
    expect(hex.toLowerCase()).toBe('#10b981');
  });

  it('calculates WCAG contrast ratio correctly', () => {
    const black = { r: 0, g: 0, b: 0 };
    const white = { r: 255, g: 255, b: 255 };
    const ratio = getContrastRatio(white, black);
    expect(ratio).toBeCloseTo(21, 0);
  });

  it('generates complete brand palette with contrast-safe foreground text for all 8 presets', () => {
    for (const preset of BRAND_PRESETS) {
      const palette = generateBrandPalette(preset.primaryHex, preset.secondaryHex);

      expect(palette.primary).toBe(preset.primaryHex);
      expect(palette.primaryHover).toMatch(/^#[0-9A-Fa-f]{6}$/);
      expect(palette.primarySoftLight).toContain('rgba(');
      expect(palette.primarySoftDark).toContain('rgba(');
      expect(['#FFFFFF', '#0F172A']).toContain(palette.primaryFg);
      expect(palette.primaryGlow).toContain('rgba(');
      expect(palette.secondary).toBe(preset.secondaryHex);
      expect(palette.accent).toBe('#F5B942');
      expect(palette.accentSoft).toContain('rgba(');
      expect(palette.accentGlow).toContain('rgba(');
    }
  });

  it('handles custom brand hex colors without error', () => {
    const customPalette = generateBrandPalette('#6366F1'); // Indigo
    expect(customPalette.primary).toBe('#6366F1');
    expect(customPalette.primaryFg).toBe('#FFFFFF');
    expect(customPalette.primaryHover).toBeTruthy();
  });
});
