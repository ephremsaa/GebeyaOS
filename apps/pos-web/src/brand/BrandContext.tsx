import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';

export interface BrandInfo {
  displayName: string;
  logoUrl: string | null;
  primaryColor: string;
  tagline: string;
  showPoweredBy: boolean;
  isLoading: boolean;
}

export interface BrandContextType extends BrandInfo {
  refreshBrand: (codeOverride?: string) => Promise<void>;
  updateBrandLocally: (updates: Partial<BrandInfo>) => void;
}

const DEFAULT_BRAND: BrandInfo = {
  displayName: 'GebeyaOS',
  logoUrl: null,
  primaryColor: '#2563eb',
  tagline: '',
  showPoweredBy: true,
  isLoading: false,
};

const STORAGE_KEY = 'gebeyaos_brand_cache';
const CODE_KEY = 'gebeyaos_company_code';

const BrandContext = createContext<BrandContextType | null>(null);

function getInitialBrand(): BrandInfo {
  try {
    const cached = localStorage.getItem(STORAGE_KEY);
    if (cached) {
      const parsed = JSON.parse(cached);
      return { ...DEFAULT_BRAND, ...parsed, isLoading: false };
    }
  } catch {}
  return DEFAULT_BRAND;
}

export const BrandProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [brand, setBrand] = useState<BrandInfo>(getInitialBrand);

  const fetchBranding = useCallback(async (codeOverride?: string) => {
    try {
      const code = codeOverride || localStorage.getItem(CODE_KEY) || '';
      const url = code
        ? `/api/public/branding?code=${encodeURIComponent(code)}`
        : '/api/public/branding';

      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        const updated: BrandInfo = {
          displayName: data.displayName || 'GebeyaOS',
          logoUrl: data.logoUrl || null,
          primaryColor: data.primaryColor || '#2563eb',
          tagline: data.tagline || '',
          showPoweredBy: data.showPoweredBy !== false,
          isLoading: false,
        };
        setBrand(updated);
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
        } catch {}
      }
    } catch {
      // Keep cached or default on network error
    }
  }, []);

  useEffect(() => {
    fetchBranding();
  }, [fetchBranding]);

  // Keep document.title synchronized with tenant brand
  useEffect(() => {
    if (brand.displayName && brand.displayName !== 'GebeyaOS') {
      document.title = `${brand.displayName} - POS & Retail System`;
    } else {
      document.title = 'GebeyaOS - Retail Management & POS';
    }
  }, [brand.displayName]);

  const updateBrandLocally = useCallback((updates: Partial<BrandInfo>) => {
    setBrand((prev) => {
      const next = { ...prev, ...updates };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  }, []);

  const value = useMemo(
    () => ({
      ...brand,
      refreshBrand: fetchBranding,
      updateBrandLocally,
    }),
    [brand, fetchBranding, updateBrandLocally],
  );

  return <BrandContext.Provider value={value}>{children}</BrandContext.Provider>;
};

export function useBrand(): BrandContextType {
  const ctx = useContext(BrandContext);
  if (!ctx) {
    return {
      ...DEFAULT_BRAND,
      refreshBrand: async () => {},
      updateBrandLocally: () => {},
    };
  }
  return ctx;
}
