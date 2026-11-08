import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';
import {
  BRAND_PRESETS,
  BrandPreset,
  generateBrandPalette,
  GeneratedBrandPalette,
} from './brandPresets';

export type AnimationMode = 'full' | 'reduced' | 'off';

interface BrandThemeContextType {
  brandPresetId: string;
  brandPreset: BrandPreset;
  brandColor: string;
  palette: GeneratedBrandPalette;
  animationMode: AnimationMode;
  isLowPowerDevice: boolean;
  setBrandPreset: (presetId: string) => void;
  setCustomBrandColor: (hex: string) => void;
  setAnimationMode: (mode: AnimationMode) => void;
  resetToDefaultBrand: () => void;
}

const BrandThemeContext = createContext<BrandThemeContextType | undefined>(undefined);

const STORAGE_PRESET_KEY = 'gebeyaos_brand_preset';
const STORAGE_CUSTOM_KEY = 'gebeyaos_brand_custom_color';
const STORAGE_ANIM_KEY = 'gebeyaos_animation_mode';

export const BrandThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // 1. Low-power & Reduced motion hardware detection
  const isLowPowerDevice = useMemo(() => {
    if (typeof window === 'undefined') return false;
    const lowCores = typeof navigator.hardwareConcurrency === 'number' && navigator.hardwareConcurrency <= 2;
    const lowMemory = typeof (navigator as any).deviceMemory === 'number' && (navigator as any).deviceMemory <= 2;
    const prefersReduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    return lowCores || lowMemory || prefersReduced;
  }, []);

  // 2. Animation Mode state (Full / Reduced / Off)
  const [animationMode, setAnimationModeState] = useState<AnimationMode>(() => {
    const saved = localStorage.getItem(STORAGE_ANIM_KEY) as AnimationMode | null;
    if (saved === 'full' || saved === 'reduced' || saved === 'off') {
      return saved;
    }
    return isLowPowerDevice ? 'reduced' : 'full';
  });

  // 3. Brand Preset state
  const [brandPresetId, setBrandPresetId] = useState<string>(() => {
    return localStorage.getItem(STORAGE_PRESET_KEY) || 'emerald';
  });

  const [customHex, setCustomHex] = useState<string>(() => {
    return localStorage.getItem(STORAGE_CUSTOM_KEY) || '#10B981';
  });

  // Active preset metadata
  const brandPreset = useMemo(() => {
    const found = BRAND_PRESETS.find((p) => p.id === brandPresetId);
    if (found) return found;
    return {
      id: 'custom',
      name: 'Custom Supermarket Brand',
      nameAm: 'ብጁ የሱቅ ቀለም',
      primaryHex: customHex,
      secondaryHex: '#0F766E',
      accentHex: '#F5B942',
      description: 'Custom brand color selected for this supermarket.',
    };
  }, [brandPresetId, customHex]);

  // Derived Palette
  const palette = useMemo(() => {
    return generateBrandPalette(brandPreset.primaryHex, brandPreset.secondaryHex);
  }, [brandPreset]);

  // 4. Update CSS variables dynamically in DOM
  useEffect(() => {
    const root = document.documentElement;

    // Set brand primary & variants
    root.style.setProperty('--primary', palette.primary);
    root.style.setProperty('--primary-hover', palette.primaryHover);
    root.style.setProperty('--primary-fg', palette.primaryFg);
    root.style.setProperty('--primary-glow', palette.primaryGlow);

    // Set secondary & variants
    root.style.setProperty('--secondary', palette.secondary);
    root.style.setProperty('--secondary-hover', palette.secondaryHover);
    root.style.setProperty('--secondary-fg', palette.secondaryFg);

    // Set warm gold accent
    root.style.setProperty('--accent', palette.accent);
    root.style.setProperty('--accent-soft', palette.accentSoft);
    root.style.setProperty('--accent-glow', palette.accentGlow);

    // Dynamic soft backgrounds based on light/dark mode
    const isDark = root.classList.contains('dark');
    root.style.setProperty('--primary-soft', isDark ? palette.primarySoftDark : palette.primarySoftLight);

    // Animation Mode classes on <html>
    root.classList.remove('anim-full', 'anim-reduced', 'anim-off');
    root.classList.add(`anim-${animationMode}`);
    root.setAttribute('data-animation-mode', animationMode);
  }, [palette, animationMode]);

  // Actions
  const setBrandPreset = useCallback((presetId: string) => {
    setBrandPresetId(presetId);
    localStorage.setItem(STORAGE_PRESET_KEY, presetId);
  }, []);

  const setCustomBrandColor = useCallback((hex: string) => {
    setBrandPresetId('custom');
    setCustomHex(hex);
    localStorage.setItem(STORAGE_PRESET_KEY, 'custom');
    localStorage.setItem(STORAGE_CUSTOM_KEY, hex);
  }, []);

  const setAnimationMode = useCallback((mode: AnimationMode) => {
    setAnimationModeState(mode);
    localStorage.setItem(STORAGE_ANIM_KEY, mode);
  }, []);

  const resetToDefaultBrand = useCallback(() => {
    setBrandPresetId('emerald');
    setCustomHex('#10B981');
    setAnimationModeState(isLowPowerDevice ? 'reduced' : 'full');
    localStorage.removeItem(STORAGE_PRESET_KEY);
    localStorage.removeItem(STORAGE_CUSTOM_KEY);
    localStorage.removeItem(STORAGE_ANIM_KEY);
  }, [isLowPowerDevice]);

  return (
    <BrandThemeContext.Provider
      value={{
        brandPresetId,
        brandPreset,
        brandColor: brandPreset.primaryHex,
        palette,
        animationMode,
        isLowPowerDevice,
        setBrandPreset,
        setCustomBrandColor,
        setAnimationMode,
        resetToDefaultBrand,
      }}
    >
      {children}
    </BrandThemeContext.Provider>
  );
};

export const useBrandTheme = (): BrandThemeContextType => {
  const ctx = useContext(BrandThemeContext);
  if (!ctx) {
    throw new Error('useBrandTheme must be used within a BrandThemeProvider');
  }
  return ctx;
};
