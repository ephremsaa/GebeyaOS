import React, { createContext, useContext, useState, useEffect } from 'react';
import { Language, TRANSLATIONS, TranslationKey } from './translations';
import { formatMoney } from '@gebeyaos/shared-types';

interface I18nContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: TranslationKey) => string;
  formatCurrency: (amount: number) => string;
  formatMoney: (amount: number) => string;
  isDarkMode: boolean;
  toggleDarkMode: () => void;
  setUserThemePreference: (userId: string, isDark: boolean) => void;
}

const I18nContext = createContext<I18nContextType | undefined>(undefined);

export const I18nProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLanguageState] = useState<Language>(() => {
    return (localStorage.getItem('gebeya_lang') as Language) || 'en';
  });

  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => {
    const activeUserId = localStorage.getItem('gebeya_active_user_id');
    const userTheme = activeUserId ? localStorage.getItem(`gebeya_theme_${activeUserId}`) : null;
    return userTheme ? userTheme === 'dark' : localStorage.getItem('gebeya_theme') === 'dark';
  });

  useEffect(() => {
    localStorage.setItem('gebeya_lang', language);
    document.documentElement.lang = language;
  }, [language]);

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
  };

  const toggleDarkMode = () => {
    setIsDarkMode((prev) => !prev);
  };

  const setUserThemePreference = (userId: string, isDark: boolean) => {
    localStorage.setItem(`gebeya_theme_${userId}`, isDark ? 'dark' : 'light');
    localStorage.setItem('gebeya_active_user_id', userId);
    setIsDarkMode(isDark);
  };

  const t = (key: TranslationKey): string => {
    const dict = TRANSLATIONS[language] || TRANSLATIONS.en;
    return (dict as Record<string, string>)[key] || TRANSLATIONS.en[key] || key;
  };

  const formatCurrency = (amount: number): string => {
    return formatMoney(amount, language);
  };

  return (
    <I18nContext.Provider
      value={{
        language,
        setLanguage,
        t,
        formatCurrency,
        formatMoney: formatCurrency,
        isDarkMode,
        toggleDarkMode,
        setUserThemePreference,
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
