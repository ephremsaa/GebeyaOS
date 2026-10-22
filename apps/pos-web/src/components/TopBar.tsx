import React, { useState, useRef, useEffect } from 'react';
import { Store, Globe, Moon, Sun, LogOut, Wifi, Monitor, User, ShieldCheck } from 'lucide-react';
import { useI18n } from '../i18n/I18nContext';
import { StatusDot } from './ui/StatusDot';

export const TopBar: React.FC = () => {
  const { language, setLanguage, t, isDarkMode, toggleDarkMode } = useI18n();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsMenuOpen(false);
      }
    };
    if (isMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isMenuOpen]);

  return (
    <header className="h-14 px-4 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between flex-shrink-0 relative z-30 select-none">
      {/* Brand & Branch */}
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-gebeya-600 flex items-center justify-center text-white shadow-sm shadow-gebeya-600/30">
          <Store size={18} />
        </div>
        <div className="flex items-baseline gap-2">
          <span className="font-extrabold text-lg tracking-tight text-slate-900 dark:text-white">
            {t('appName')}
          </span>
          <span className="text-xs font-semibold px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
            {t('branchName')}
          </span>
        </div>
      </div>

      {/* Cashier & Status Dropdown trigger */}
      <div className="relative" ref={menuRef}>
        <StatusDot
          status="online"
          cashierName="Bethlehem T."
          onClick={() => setIsMenuOpen(!isMenuOpen)}
        />

        {/* Dropdown Menu */}
        {isMenuOpen && (
          <div className="absolute right-0 top-12 w-72 bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-800 p-3 flex flex-col gap-2 animate-in fade-in zoom-in-95 duration-100 z-50">
            {/* Cashier & Terminal Info */}
            <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800 flex flex-col gap-1.5">
              <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                <span className="flex items-center gap-1.5">
                  <User size={13} />
                  {t('cashier')}:
                </span>
                <span className="font-semibold text-slate-800 dark:text-slate-200">Bethlehem T.</span>
              </div>
              <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                <span className="flex items-center gap-1.5">
                  <Monitor size={13} />
                  {t('terminal')}:
                </span>
                <span className="font-semibold text-slate-800 dark:text-slate-200">Terminal #01</span>
              </div>
              <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-medium">
                  <Wifi size={13} />
                  {t('online')}
                </span>
                <span className="font-mono text-[11px] text-slate-400">192.168.1.100</span>
              </div>
            </div>

            {/* Language Switcher */}
            <div className="flex items-center justify-between px-2 py-1.5 text-sm">
              <span className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
                <Globe size={16} />
                {t('language')}
              </span>
              <div className="flex bg-slate-100 dark:bg-slate-800 p-0.5 rounded-lg border border-slate-200 dark:border-slate-700">
                <button
                  onClick={() => setLanguage('en')}
                  className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-all ${
                    language === 'en'
                      ? 'bg-white dark:bg-slate-700 text-gebeya-600 dark:text-gebeya-400 shadow-xs'
                      : 'text-slate-500'
                  }`}
                >
                  EN
                </button>
                <button
                  onClick={() => setLanguage('am')}
                  className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-all ${
                    language === 'am'
                      ? 'bg-white dark:bg-slate-700 text-gebeya-600 dark:text-gebeya-400 shadow-xs'
                      : 'text-slate-500'
                  }`}
                >
                  አማ
                </button>
              </div>
            </div>

            {/* Theme Toggle */}
            <div className="flex items-center justify-between px-2 py-1.5 text-sm">
              <span className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
                {isDarkMode ? <Moon size={16} /> : <Sun size={16} />}
                {t('theme')}
              </span>
              <button
                onClick={toggleDarkMode}
                className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition-all border border-slate-200 dark:border-slate-700"
              >
                {isDarkMode ? t('darkMode') : t('lightMode')}
              </button>
            </div>

            {/* Divider */}
            <div className="h-px bg-slate-100 dark:bg-slate-800 my-0.5" />

            {/* Logout */}
            <button
              onClick={() => {
                setIsMenuOpen(false);
                alert('Logging out cashier session...');
              }}
              className="flex items-center gap-2 px-2.5 py-2 rounded-xl text-sm font-semibold text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 transition-all text-left"
            >
              <LogOut size={16} />
              {t('logout')}
            </button>
          </div>
        )}
      </div>
    </header>
  );
};
