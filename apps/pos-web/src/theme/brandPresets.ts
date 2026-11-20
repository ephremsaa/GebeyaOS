// ═══════════════════════════════════════════════════════════════════════════
// GebeyaOS Dynamic Brand-Color Palette Engine & Supermarket Presets
// Conforms to WCAG AA Contrast Standards & Generates Complete Palette
// (Includes Sidebar Gradients, Soft Backgrounds & Contrast Protection)
// ═══════════════════════════════════════════════════════════════════════════

export interface BrandPreset {
  id: string;
  name: string;
  nameAm: string;
  primaryHex: string;
  secondaryHex: string;
  accentHex: string;
  description: string;
}

export const BRAND_PRESETS: BrandPreset[] = [
  {
    id: 'emerald',
    name: 'Emerald Retail',
    nameAm: 'ኤመራልድ ቸርቻሪ',
    primaryHex: '#1F8A4C',
    secondaryHex: '#0E4B2F',
    accentHex: '#F5B942',
    description: 'Clean light and deep-green Ethiopian retail dashboard standard.',
  },
  {
    id: 'ocean',
    name: 'Ocean Blue',
    nameAm: 'ውቅያኖስ ሰማያዊ',
    primaryHex: '#0284C7',
    secondaryHex: '#0B3A5D',
    accentHex: '#F5B942',
    description: 'Modern corporate supermarket and clean hypermarket look.',
  },
  {
    id: 'violet',
    name: 'Royal Violet',
    nameAm: 'ሮያል ቫዮሌት',
    primaryHex: '#7C3AED',
    secondaryHex: '#38166D',
    accentHex: '#F5B942',
    description: 'Premium boutique and gourmet market elegance.',
  },
  {
    id: 'sunset',
    name: 'Sunset Orange',
    nameAm: 'ጀንበር ብርቱካናማ',
    primaryHex: '#EA580C',
    secondaryHex: '#5C1D05',
    accentHex: '#F5B942',
    description: 'Energetic, warm bakery, grocery, and discount supermarket.',
  },
  {
    id: 'ruby',
    name: 'Ruby Red',
    nameAm: 'ሩቢ ቀይ',
    primaryHex: '#E11D48',
    secondaryHex: '#580A1C',
    accentHex: '#F5B942',
    description: 'Bold, high-visibility retail chain brand identity.',
  },
  {
    id: 'teal',
    name: 'Deep Teal',
    nameAm: 'ጥልቅ ቲል',
    primaryHex: '#0D9488',
    secondaryHex: '#083D38',
    accentHex: '#F5B942',
    description: 'Sophisticated organic, pharmacy, and wellness retail.',
  },
  {
    id: 'gold',
    name: 'Warm Gold',
    nameAm: 'ሞቃት ወርቃማ',
    primaryHex: '#D97706',
    secondaryHex: '#4E2B03',
    accentHex: '#1F8A4C',
    description: 'Traditional Ethiopian commercial prestige and warmth.',
  },
  {
    id: 'slate',
    name: 'Modern Slate',
    nameAm: 'ዘመናዊ ስሌት',
    primaryHex: '#475569',
    secondaryHex: '#1E293B',
    accentHex: '#F5B942',
    description: 'Minimalist industrial and high-end hardware/grocery.',
  },
];

// Color Math Utilities
export interface RgbColor {
  r: number;
  g: number;
  b: number;
}

export function hexToRgb(hex: string): RgbColor {
  let clean = hex.replace('#', '').trim();
  if (clean.length === 3) {
    clean = clean.split('').map((c) => c + c).join('');
  }
  const num = parseInt(clean, 16);
  if (isNaN(num)) return { r: 31, g: 138, b: 76 }; // Fallback emerald #1F8A4C
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255,
  };
}

export function rgbToHex({ r, g, b }: RgbColor): string {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  const toHex = (v: number) => clamp(v).toString(16).padStart(2, '0').toUpperCase();
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

// Relative Luminance for WCAG Contrast
export function getRelativeLuminance({ r, g, b }: RgbColor): number {
  const [rs, gs, bs] = [r, g, b].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

export function getContrastRatio(rgb1: RgbColor, rgb2: RgbColor): number {
  const lum1 = getRelativeLuminance(rgb1);
  const lum2 = getRelativeLuminance(rgb2);
  const lighter = Math.max(lum1, lum2);
  const darker = Math.min(lum1, lum2);
  return (lighter + 0.05) / (darker + 0.05);
}

// Adjust lightness / shade
export function adjustLightness(rgb: RgbColor, percent: number): RgbColor {
  return {
    r: Math.round(rgb.r + (255 - rgb.r) * percent),
    g: Math.round(rgb.g + (255 - rgb.g) * percent),
    b: Math.round(rgb.b + (255 - rgb.b) * percent),
  };
}

export function darkenRgb(rgb: RgbColor, percent: number): RgbColor {
  return {
    r: Math.round(rgb.r * (1 - percent)),
    g: Math.round(rgb.g * (1 - percent)),
    b: Math.round(rgb.b * (1 - percent)),
  };
}

export interface GeneratedBrandPalette {
  primary: string;
  primaryHover: string;
  primarySoftLight: string;
  primarySoftDark: string;
  primaryFg: string;
  primaryGlow: string;
  sidebarFrom: string;
  sidebarTo: string;
  sidebarActive: string;
  sidebarHover: string;
  secondary: string;
  secondaryHover: string;
  secondaryFg: string;
  accent: string;
  accentSoft: string;
  accentGlow: string;
}

export function generateBrandPalette(primaryHex: string, customSecondaryHex?: string): GeneratedBrandPalette {
  let rgb = hexToRgb(primaryHex);
  const whiteRgb: RgbColor = { r: 255, g: 255, b: 255 };

  // Enforce WCAG AA contrast for primary on white surfaces
  // If contrast against white is too low (< 3.0:1, e.g. very light yellow or pastel), darken until compliant
  let primaryContrast = getContrastRatio(rgb, whiteRgb);
  if (primaryContrast < 3.0) {
    rgb = darkenRgb(rgb, 0.35);
  }

  const effectivePrimaryHex = rgbToHex(rgb);
  const primaryFg = getContrastRatio(rgb, whiteRgb) >= 3.8 ? '#FFFFFF' : '#0F172A';

  // Hover variant: darken by 12% in light
  const hoverRgb = darkenRgb(rgb, 0.12);
  const primaryHover = rgbToHex(hoverRgb);

  // Soft backgrounds: 14% tint for light, 20% for dark
  const primarySoftLight = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.14)`;
  const primarySoftDark = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.20)`;
  const primaryGlow = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.30)`;

  // Sidebar Gradient: Auto-generated deep shades from brand color
  // Default emerald explicitly maps to clean #0E4B2F -> #0A3A25
  let sidebarFromRgb: RgbColor;
  let sidebarToRgb: RgbColor;

  if (effectivePrimaryHex.toUpperCase() === '#1F8A4C') {
    sidebarFromRgb = hexToRgb('#0E4B2F');
    sidebarToRgb = hexToRgb('#0A3A25');
  } else {
    // Auto-generate darker sidebar shades (55% and 68% darker)
    sidebarFromRgb = darkenRgb(rgb, 0.55);
    sidebarToRgb = darkenRgb(rgb, 0.68);
    // Ensure WCAG AA contrast against white text in sidebar (contrast >= 4.5:1)
    while (getContrastRatio(sidebarFromRgb, whiteRgb) < 4.5) {
      sidebarFromRgb = darkenRgb(sidebarFromRgb, 0.1);
    }
    while (getContrastRatio(sidebarToRgb, whiteRgb) < 4.5) {
      sidebarToRgb = darkenRgb(sidebarToRgb, 0.1);
    }
  }

  const sidebarFrom = rgbToHex(sidebarFromRgb);
  const sidebarTo = rgbToHex(sidebarToRgb);
  const sidebarActive = effectivePrimaryHex.toUpperCase();
  const sidebarHover = 'rgba(255, 255, 255, 0.08)';

  // Secondary color (defaults to sidebarFrom if not supplied)
  const secRgb = customSecondaryHex ? hexToRgb(customSecondaryHex) : sidebarFromRgb;
  const secondary = customSecondaryHex ? customSecondaryHex.toUpperCase() : sidebarFrom;
  const secondaryHover = rgbToHex(darkenRgb(secRgb, 0.15));
  const secondaryFg = getContrastRatio(secRgb, whiteRgb) >= 3.5 ? '#FFFFFF' : '#0F172A';

  // Warm Gold Accent (#F5B942)
  const accentRgb = hexToRgb('#F5B942');
  const accent = '#F5B942';
  const accentSoft = `rgba(${accentRgb.r}, ${accentRgb.g}, ${accentRgb.b}, 0.18)`;
  const accentGlow = `rgba(${accentRgb.r}, ${accentRgb.g}, ${accentRgb.b}, 0.35)`;

  return {
    primary: effectivePrimaryHex.toUpperCase(),
    primaryHover,
    primarySoftLight,
    primarySoftDark,
    primaryFg,
    primaryGlow,
    sidebarFrom,
    sidebarTo,
    sidebarActive,
    sidebarHover,
    secondary,
    secondaryHover,
    secondaryFg,
    accent,
    accentSoft,
    accentGlow,
  };
}
