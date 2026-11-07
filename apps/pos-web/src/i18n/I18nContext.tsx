import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { NAMESPACED_TRANSLATIONS, SupportedLanguage } from './locales';
import { TRANSLATIONS } from './translations'; // Legacy dictionary compatibility
import { formatMoney } from '@gebeyaos/shared-types';

export type Language = SupportedLanguage;
export type CalendarType = 'gregorian' | 'ethiopic';

export interface FormatDateOptions {
  includeTime?: boolean;
  dateStyle?: 'short' | 'medium' | 'long' | 'full';
  timeStyle?: 'short' | 'medium';
}

export interface I18nContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  calendar: CalendarType;
  setCalendar: (cal: CalendarType) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
  tError: (codeOrMsg?: string | null, fallback?: string) => string;
  formatDate: (dateInput: Date | string | number | null | undefined, options?: FormatDateOptions) => string;
  formatCurrency: (amount: number) => string;
  formatMoney: (amount: number) => string;
  isDarkMode: boolean;
  toggleDarkMode: () => void;
  setUserThemePreference: (userId: string, isDark: boolean) => void;
  setUserLanguagePreference: (userId: string, lang: Language) => void;
}

const I18nContext = createContext<I18nContextType | undefined>(undefined);

export const I18nProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Device-level language preference
  const [language, setLanguageState] = useState<Language>(() => {
    const activeUserId = localStorage.getItem('gebeya_active_user_id');
    const userLang = activeUserId ? localStorage.getItem(`gebeya_lang_${activeUserId}`) : null;
    return (userLang as Language) || (localStorage.getItem('gebeya_lang') as Language) || 'en';
  });

  // Calendar preference (Gregorian by default or Ethiopian)
  const [calendar, setCalendarState] = useState<CalendarType>(() => {
    return (localStorage.getItem('gebeya_calendar') as CalendarType) || 'gregorian';
  });

  // Theme preference
  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => {
    const activeUserId = localStorage.getItem('gebeya_active_user_id');
    const userTheme = activeUserId ? localStorage.getItem(`gebeya_theme_${activeUserId}`) : null;
    return userTheme ? userTheme === 'dark' : localStorage.getItem('gebeya_theme') === 'dark';
  });

  // Sync document lang and title on language change
  useEffect(() => {
    localStorage.setItem('gebeya_lang', language);
    document.documentElement.lang = language;
    document.title =
      language === 'am'
        ? 'ገበያ ኦኤስ - የችርቻሮ መሸጫ እና መጋዘን አስተዳደር'
        : 'GebeyaOS - Retail Management & POS';
  }, [language]);

  // Sync calendar preference
  useEffect(() => {
    localStorage.setItem('gebeya_calendar', calendar);
  }, [calendar]);

  // Sync theme
  useEffect(() => {
    const themeStr = isDarkMode ? 'dark' : 'light';
    localStorage.setItem('gebeya_theme', themeStr);
    const activeUserId = localStorage.getItem('gebeya_active_user_id');
    if (activeUserId) {
      localStorage.setItem(`gebeya_theme_${activeUserId}`, themeStr);
    }
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDarkMode]);

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    const activeUserId = localStorage.getItem('gebeya_active_user_id');
    if (activeUserId) {
      localStorage.setItem(`gebeya_lang_${activeUserId}`, lang);
    }
  };

  const setCalendar = (cal: CalendarType) => {
    setCalendarState(cal);
  };

  const setUserLanguagePreference = (userId: string, lang: Language) => {
    localStorage.setItem(`gebeya_lang_${userId}`, lang);
    localStorage.setItem('gebeya_active_user_id', userId);
    setLanguageState(lang);
  };

  const toggleDarkMode = () => {
    setIsDarkMode((prev) => !prev);
  };

  const setUserThemePreference = (userId: string, isDark: boolean) => {
    localStorage.setItem(`gebeya_theme_${userId}`, isDark ? 'dark' : 'light');
    localStorage.setItem('gebeya_active_user_id', userId);
    setIsDarkMode(isDark);
  };

  /**
   * Translates a semantic key with optional interpolation and pluralization.
   * e.g., t('shift.grossSalesTotal', { count: 12 })
   * e.g., t('common.save')
   */
  const t = useCallback(
    (key: string, params?: Record<string, string | number>): string => {
      if (!key) return '';

      const dicts = NAMESPACED_TRANSLATIONS;
      const currentLang = language;
      const count = params?.count;

      // Helper to find raw template in a given language dictionary
      const findTemplate = (lang: Language, lookupKey: string): string | undefined => {
        const langDict = dicts[lang];

        // 1. Check dot-notation namespace (e.g. "shift.grossSalesTotal")
        if (lookupKey.includes('.')) {
          const [ns, ...rest] = lookupKey.split('.');
          const subKey = rest.join('.');
          const nsObj = (langDict as Record<string, any>)[ns];
          if (nsObj && typeof nsObj === 'object') {
            // Plural check
            if (count !== undefined) {
              const pluralSuffix = count === 1 ? '_one' : '_other';
              if (nsObj[subKey + pluralSuffix]) {
                return nsObj[subKey + pluralSuffix];
              }
            }
            if (nsObj[subKey]) {
              return nsObj[subKey];
            }
          }
        }

        // 2. Search all namespaces for the key if namespace not specified
        for (const ns of Object.keys(langDict)) {
          const nsObj = (langDict as Record<string, any>)[ns];
          if (count !== undefined) {
            const pluralSuffix = count === 1 ? '_one' : '_other';
            if (nsObj[lookupKey + pluralSuffix]) {
              return nsObj[lookupKey + pluralSuffix];
            }
          }
          if (nsObj[lookupKey]) {
            return nsObj[lookupKey];
          }
        }

        // 3. Fallback to legacy flat TRANSLATIONS dictionary
        const legacyDict = TRANSLATIONS[lang] || TRANSLATIONS.en;
        if (legacyDict && (legacyDict as Record<string, string>)[lookupKey]) {
          return (legacyDict as Record<string, string>)[lookupKey];
        }

        return undefined;
      };

      // Lookup in active language first
      let template = findTemplate(currentLang, key);

      // If missing in Amharic, fall back to English
      if (template === undefined && currentLang !== 'en') {
        template = findTemplate('en', key);
        if (template !== undefined) {
          if (process.env.NODE_ENV === 'development') {
            console.warn(`[i18n] Missing Amharic translation for key "${key}", falling back to English.`);
          }
        }
      }

      // If still missing in both
      if (template === undefined) {
        if (process.env.NODE_ENV === 'development') {
          console.warn(`[i18n] Missing key "${key}" in all locales.`);
          return `[MISSING: ${key}]`;
        }
        return key;
      }

      // Perform {{param}} interpolation
      let result = template;
      if (params) {
        for (const [paramKey, paramVal] of Object.entries(params)) {
          result = result.replace(new RegExp(`{{\\s*${paramKey}\\s*}}`, 'g'), String(paramVal));
        }
      }

      // Check if any {{param}} remains unreplaced
      const unreplacedMatch = result.match(/{{\s*([a-zA-Z0-9_]+)\s*}}/);
      if (unreplacedMatch) {
        const missingParam = unreplacedMatch[1];
        const errorMsg = `[i18n] Missing interpolation value for {{${missingParam}}} in key "${key}"`;
        if (process.env.NODE_ENV === 'test' || process.env.NODE_ENV === 'development') {
          console.error(errorMsg);
        }
      }

      return result;
    },
    [language],
  );

  /**
   * Stable API error code translator.
   */
  const tError = useCallback(
    (codeOrMsg?: string | null, fallback?: string): string => {
      if (!codeOrMsg) return fallback || t('errors.GENERIC_ERROR');

      // Check if code exists in errors namespace
      const codeKey = `errors.${codeOrMsg}`;
      const translated = t(codeKey);
      if (!translated.startsWith('[MISSING:')) {
        return translated;
      }

      // If it's already an error message string or unknown code
      return fallback || codeOrMsg;
    },
    [t],
  );

  /**
   * Formats a date using Ethiopian or Gregorian calendar with Africa/Addis_Ababa timezone.
   */
  const formatDate = useCallback(
    (dateInput: Date | string | number | null | undefined, options?: FormatDateOptions): string => {
      if (!dateInput) return '—';
      const d = new Date(dateInput);
      if (isNaN(d.getTime())) return '—';

      const isEthiopic = calendar === 'ethiopic';
      const locale = isEthiopic
        ? language === 'am'
          ? 'am-ET-u-ca-ethiopic'
          : 'en-ET-u-ca-ethiopic'
        : language === 'am'
        ? 'am-ET'
        : 'en-ET';

      try {
        const intlOptions: Intl.DateTimeFormatOptions = {
          timeZone: 'Africa/Addis_Ababa',
          year: 'numeric',
          month: options?.dateStyle === 'short' ? 'numeric' : 'short',
          day: 'numeric',
        };

        if (options?.includeTime) {
          intlOptions.hour = '2-digit';
          intlOptions.minute = '2-digit';
        }

        return new Intl.DateTimeFormat(locale, intlOptions).format(d);
      } catch (err) {
        console.error('Date formatting error:', err);
        return d.toLocaleDateString();
      }
    },
    [calendar, language],
  );

  const formatCurrency = useCallback(
    (amount: number): string => {
      return formatMoney(amount, language);
    },
    [language],
  );

  return (
    <I18nContext.Provider
      value={{
        language,
        setLanguage,
        calendar,
        setCalendar,
        t,
        tError,
        formatDate,
        formatCurrency,
        formatMoney: formatCurrency,
        isDarkMode,
        toggleDarkMode,
        setUserThemePreference,
        setUserLanguagePreference,
      }}
    >
      {children}
    </I18nContext.Provider>
  );
};

export const useI18n = (): I18nContextType => {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error('useI18n must be used within an I18nProvider');
  }
  return context;
};
