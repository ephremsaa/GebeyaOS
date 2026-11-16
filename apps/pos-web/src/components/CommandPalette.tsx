import React, { useState, useEffect, useRef } from 'react';
import {
  Search,
  ShoppingCart,
  Tag,
  Archive,
  Truck,
  BarChart3,
  Users,
  Settings,
  PlusCircle,
  Moon,
  Sun,
  Lock,
  ArrowRight,
} from 'lucide-react';
import { useI18n } from '../i18n/I18nContext';
import { useAuth } from '../auth/AuthContext';
import { useBrand } from '../brand/BrandContext';
import { NavTabId } from './NavigationRail';

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigate: (tab: NavTabId) => void;
  onOpenAddStock?: () => void;
}

interface PaletteAction {
  id: string;
  category: 'Navigation' | 'Quick Actions' | 'Product Catalog';
  label: string;
  sublabel?: string;
  icon: React.ReactNode;
  shortcut?: string;
  run: () => void;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  isOpen,
  onClose,
  onNavigate,
  onOpenAddStock,
}) => {
  const { language, isDarkMode, toggleDarkMode } = useI18n();
  const { lockSession } = useAuth();
  const brand = useBrand();
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [productResults, setProductResults] = useState<any[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input on open
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Product search debounce
  useEffect(() => {
    if (!isOpen || !query.trim() || query.length < 2) {
      setProductResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/products?search=${encodeURIComponent(query)}&limit=5`);
        if (res.ok) {
          const data = await res.json();
          setProductResults(data.rows || []);
        }
      } catch {
        setProductResults([]);
      }
    }, 200);

    return () => clearTimeout(timer);
  }, [query, isOpen]);

  // ── Static Commands for the 7 pages ──
  const staticActions: PaletteAction[] = [
    {
      id: 'nav-sales',
      category: 'Navigation',
      label: language === 'am' ? 'መሸጫ' : 'Sales',
      sublabel: language === 'am' ? 'ምርቶችን ቅኙ፣ ሸምቱ፣ ክፍያ ይፈጽሙ' : 'Scan, sell, and collect payment',
      icon: <ShoppingCart size={16} className="text-emerald-500" />,
      shortcut: 'F1',
      run: () => { onNavigate('sales'); onClose(); },
    },
    {
      id: 'nav-items',
      category: 'Navigation',
      label: language === 'am' ? 'ዕቃዎች' : 'Items',
      sublabel: language === 'am' ? 'ምርቶች እና ምድቦች ያስተዳድሩ' : 'Products, categories, and barcodes',
      icon: <Tag size={16} className="text-cyan-500" />,
      run: () => { onNavigate('items'); onClose(); },
    },
    {
      id: 'nav-stock',
      category: 'Navigation',
      label: language === 'am' ? 'ክምችት እና ማብቂያ' : 'Stock & Expiry',
      sublabel: language === 'am' ? 'ክምችት፣ ቀን፣ እና ዝቅ ያለ ክምችት' : 'Stock levels, expiry dates, and low-stock',
      icon: <Archive size={16} className="text-blue-500" />,
      run: () => { onNavigate('stock'); onClose(); },
    },
    {
      id: 'nav-suppliers',
      category: 'Navigation',
      label: language === 'am' ? 'አቅራቢዎች' : 'Suppliers',
      sublabel: language === 'am' ? 'አቅራቢዎች እና ዕቃ ተቀበል' : 'Suppliers and receive items',
      icon: <Truck size={16} className="text-amber-500" />,
      run: () => { onNavigate('suppliers'); onClose(); },
    },
    {
      id: 'nav-reports',
      category: 'Navigation',
      label: language === 'am' ? 'ሪፖርቶች' : 'Reports',
      sublabel: language === 'am' ? 'ሽያጭ፣ ትርፍ፣ እና ቫት ሪፖርቶች' : 'Sales, profit, and VAT reports',
      icon: <BarChart3 size={16} className="text-rose-500" />,
      run: () => { onNavigate('reports'); onClose(); },
    },
    {
      id: 'nav-staff',
      category: 'Navigation',
      label: language === 'am' ? 'ሰራተኞች' : 'Staff',
      sublabel: language === 'am' ? 'ሰራተኞች ጨምር፣ ሚና ቀይር' : 'Add employees, change roles, deactivate',
      icon: <Users size={16} className="text-orange-500" />,
      run: () => { onNavigate('staff'); onClose(); },
    },
    {
      id: 'nav-settings',
      category: 'Navigation',
      label: language === 'am' ? 'ቅንብሮች' : 'Settings',
      sublabel: language === 'am' ? 'ቅርንጫፍ፣ ደረሰኝ፣ ዳሳ፣ ምትኬ' : 'Branch info, receipt, data, backup',
      icon: <Settings size={16} className="text-slate-500" />,
      run: () => { onNavigate('settings'); onClose(); },
    },

    // ── Quick Actions ──
    {
      id: 'act-add-stock',
      category: 'Quick Actions',
      label: language === 'am' ? 'ዕቃ ጨምር' : 'Add Stock',
      sublabel: language === 'am' ? 'ስካን፣ ወይም ብዛት ጨምር' : 'Barcode scan, manual entry, or Excel',
      icon: <PlusCircle size={16} className="text-emerald-500" />,
      run: () => {
        onClose();
        if (onOpenAddStock) onOpenAddStock();
        else onNavigate('stock');
      },
    },
    {
      id: 'act-lock',
      category: 'Quick Actions',
      label: language === 'am' ? 'ተርሚናሉን ቆልፍ' : 'Lock Terminal',
      sublabel: language === 'am' ? 'ፒን ያስፈልጋል ለመክፈት' : 'Require PIN to unlock',
      icon: <Lock size={16} className="text-amber-500" />,
      shortcut: 'F9',
      run: () => { onClose(); lockSession(); },
    },
    {
      id: 'act-theme',
      category: 'Quick Actions',
      label: language === 'am'
        ? (isDarkMode ? 'ብርሃን ገጽታ' : 'ጨለማ ገጽታ')
        : (isDarkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'),
      icon: isDarkMode
        ? <Sun size={16} className="text-amber-400" />
        : <Moon size={16} className="text-slate-600" />,
      run: () => { toggleDarkMode(); onClose(); },
    },
  ];

  // Convert product results to actions
  const productActions: PaletteAction[] = productResults.map((p) => ({
    id: `prod-${p.id}`,
    category: 'Product Catalog' as const,
    label: p.name_en,
    sublabel: `${p.sku} • ${Number(p.base_price).toFixed(2)} ETB • Stock: ${p.stock_on_hand || 0}`,
    icon: <Tag size={16} className="text-cyan-500" />,
    run: () => { onNavigate('items'); onClose(); },
  }));

  const q = query.toLowerCase();
  const filteredActions = [
    ...productActions,
    ...staticActions.filter(
      (a) =>
        a.label.toLowerCase().includes(q) ||
        (a.sublabel && a.sublabel.toLowerCase().includes(q)),
    ),
  ];

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % Math.max(1, filteredActions.length));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + filteredActions.length) % Math.max(1, filteredActions.length));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredActions[selectedIndex]) filteredActions[selectedIndex].run();
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-20 bg-black/60 backdrop-blur-2xs p-4 animate-in fade-in select-none"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl bg-white dark:bg-slate-800 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-700 overflow-hidden flex flex-col animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search Header */}
        <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex items-center gap-3">
          <Search size={20} className="text-gebeya-600 flex-shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setSelectedIndex(0); }}
            onKeyDown={handleKeyDown}
            placeholder={
              language === 'am'
                ? 'ወደ ማንኛውም ገጽ፣ እቃ ወይም ተግባር ይፈልጉ...'
                : 'Type a page name, product, or action...'
            }
            className="flex-1 bg-transparent text-sm font-bold text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-hidden"
          />
          <kbd className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-mono text-[10px] text-slate-400">
            ESC
          </kbd>
        </div>

        {/* Results List */}
        <div className="max-h-96 overflow-y-auto p-2 space-y-1">
          {filteredActions.length === 0 ? (
            <div className="py-12 text-center text-slate-400 text-xs">
              {language === 'am' ? `"${query}" ምንም ውጤት አልተገኘም።` : `No results for "${query}".`}
            </div>
          ) : (
            filteredActions.map((action, idx) => {
              const isSelected = idx === selectedIndex;
              return (
                <div
                  key={action.id}
                  onClick={action.run}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  className={`p-3 rounded-2xl flex items-center justify-between cursor-pointer transition ${
                    isSelected
                      ? 'bg-gebeya-50 text-gebeya-950 dark:bg-slate-800 dark:text-white'
                      : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-8 h-8 rounded-xl flex items-center justify-center ${
                        isSelected
                          ? 'bg-gebeya-600 text-white'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
                      }`}
                    >
                      {action.icon}
                    </div>
                    <div>
                      <div className="text-xs font-bold leading-tight">{action.label}</div>
                      {action.sublabel && (
                        <div className="text-[10px] text-slate-400 mt-0.5">{action.sublabel}</div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-[10px] uppercase font-bold text-slate-400">
                      {action.category}
                    </span>
                    {action.shortcut && (
                      <kbd className="px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-700 font-mono text-[10px] font-bold">
                        {action.shortcut}
                      </kbd>
                    )}
                    {isSelected && <ArrowRight size={13} className="text-gebeya-600" />}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2 bg-slate-50 dark:bg-slate-800/60 border-t border-slate-200 dark:border-slate-700 text-[10px] text-slate-400 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <span>Use <kbd className="px-1 rounded bg-slate-200 dark:bg-slate-700">&uarr;</kbd> <kbd className="px-1 rounded bg-slate-200 dark:bg-slate-700">&darr;</kbd> to navigate</span>
            <span><kbd className="px-1 rounded bg-slate-200 dark:bg-slate-700">&crarr;</kbd> to select</span>
          </div>
          <span>{brand.displayName}</span>
        </div>
      </div>
    </div>
  );
};
