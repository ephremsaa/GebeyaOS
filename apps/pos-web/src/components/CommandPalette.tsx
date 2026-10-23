import React, { useState, useEffect, useRef } from 'react';
import {
  Search,
  ShoppingCart,
  Clock,
  Package,
  Truck,
  BarChart3,
  RefreshCw,
  Users,
  Settings,
  HardDrive,
  ShieldCheck,
  Tag,
  ClipboardList,
  PlusCircle,
  Printer,
  Moon,
  Sun,
  Lock,
  ArrowRight,
  Sparkles,
} from 'lucide-react';
import { useI18n } from '../i18n/I18nContext';
import { useAuth } from '../auth/AuthContext';
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
  const { lockSession, switchCashier } = useAuth();
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
      } catch (err) {
        setProductResults([]);
      }
    }, 200);

    return () => clearTimeout(timer);
  }, [query, isOpen]);

  // Static Commands
  const staticActions: PaletteAction[] = [
    // 1. Navigation
    {
      id: 'nav-dashboard',
      category: 'Navigation',
      label: 'Home Dashboard',
      sublabel: 'View sales KPIs, alerts, and system health',
      icon: <Sparkles size={16} className="text-gebeya-500" />,
      run: () => {
        onNavigate('dashboard');
        onClose();
      },
    },
    {
      id: 'nav-checkout',
      category: 'Navigation',
      label: 'POS Register / Checkout',
      sublabel: 'Barcode scanning, scales, and customer payment',
      icon: <ShoppingCart size={16} className="text-emerald-500" />,
      shortcut: 'F1',
      run: () => {
        onNavigate('checkout');
        onClose();
      },
    },
    {
      id: 'nav-catalog',
      category: 'Navigation',
      label: 'Product Master Catalog',
      sublabel: 'SKU registry, pricing, and barcode labels',
      icon: <Tag size={16} className="text-cyan-500" />,
      run: () => {
        onNavigate('catalog');
        onClose();
      },
    },
    {
      id: 'nav-inventory',
      category: 'Navigation',
      label: 'Inventory & Stock Ledger',
      sublabel: 'Stock balances, movements, and add stock intake',
      icon: <Package size={16} className="text-blue-500" />,
      run: () => {
        onNavigate('inventory');
        onClose();
      },
    },
    {
      id: 'nav-stocktake',
      category: 'Navigation',
      label: 'Stocktake & Cycle Count',
      sublabel: 'Audit physical stock, variances, and reconciliation',
      icon: <ClipboardList size={16} className="text-purple-500" />,
      run: () => {
        onNavigate('stocktake');
        onClose();
      },
    },
    {
      id: 'nav-reorder',
      category: 'Navigation',
      label: 'Reorder Suggestions',
      sublabel: 'Replenishment forecasting and 1-click PO draft',
      icon: <Truck size={16} className="text-amber-500" />,
      run: () => {
        onNavigate('reorder');
        onClose();
      },
    },
    {
      id: 'nav-shifts',
      category: 'Navigation',
      label: 'Cashier Shifts & Floats',
      sublabel: 'Shift open/close, cash drops, and register count',
      icon: <Clock size={16} className="text-indigo-500" />,
      run: () => {
        onNavigate('shifts');
        onClose();
      },
    },
    {
      id: 'nav-reports',
      category: 'Navigation',
      label: 'Financial & Sales Reports',
      sublabel: 'Z-report, profit margins, and valuation',
      icon: <BarChart3 size={16} className="text-rose-500" />,
      run: () => {
        onNavigate('reports');
        onClose();
      },
    },
    {
      id: 'nav-settings',
      category: 'Navigation',
      label: 'System & Branch Settings',
      sublabel: 'Receipt templates, TIN, VAT rate, and currency',
      icon: <Settings size={16} className="text-slate-500" />,
      run: () => {
        onNavigate('settings');
        onClose();
      },
    },
    {
      id: 'nav-backup',
      category: 'Navigation',
      label: 'Backup & Restore',
      sublabel: '1-click JSON snapshot with SHA-256 verification',
      icon: <HardDrive size={16} className="text-emerald-600" />,
      run: () => {
        onNavigate('backup');
        onClose();
      },
    },
    {
      id: 'nav-audit',
      category: 'Navigation',
      label: 'Immutable Audit Log Viewer',
      sublabel: 'Track user logins, overrides, and settings events',
      icon: <ShieldCheck size={16} className="text-indigo-600" />,
      run: () => {
        onNavigate('audit');
        onClose();
      },
    },
    {
      id: 'nav-sync',
      category: 'Navigation',
      label: 'HQ Sync Monitor',
      sublabel: 'Outbox queue and cloud connectivity status',
      icon: <RefreshCw size={16} className="text-teal-500" />,
      run: () => {
        onNavigate('sync');
        onClose();
      },
    },
    {
      id: 'nav-users',
      category: 'Navigation',
      label: 'User Management & RBAC',
      sublabel: 'Cashier PINs, staff roles, and permissions',
      icon: <Users size={16} className="text-orange-500" />,
      run: () => {
        onNavigate('users');
        onClose();
      },
    },

    // 2. Quick Actions
    {
      id: 'act-add-stock',
      category: 'Quick Actions',
      label: 'Add Stock Intake',
      sublabel: 'Barcode scan, manual entry, or Excel import',
      icon: <PlusCircle size={16} className="text-emerald-500" />,
      run: () => {
        onClose();
        if (onOpenAddStock) onOpenAddStock();
        else onNavigate('inventory');
      },
    },
    {
      id: 'act-lock',
      category: 'Quick Actions',
      label: 'Lock Terminal Register',
      sublabel: 'Require Cashier PIN to unlock',
      icon: <Lock size={16} className="text-amber-500" />,
      shortcut: 'F9',
      run: () => {
        onClose();
        lockSession();
      },
    },
    {
      id: 'act-theme',
      category: 'Quick Actions',
      label: 'Toggle Dark / Light Theme',
      sublabel: isDarkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode',
      icon: isDarkMode ? <Sun size={16} className="text-amber-400" /> : <Moon size={16} className="text-slate-600" />,
      run: () => {
        toggleDarkMode();
        onClose();
      },
    },
  ];

  // Convert product results to actions
  const productActions: PaletteAction[] = productResults.map((p) => ({
    id: `prod-${p.id}`,
    category: 'Product Catalog',
    label: p.name_en,
    sublabel: `${p.sku} • ${Number(p.base_price).toFixed(2)} ETB • Stock: ${p.stock_on_hand || 0}`,
    icon: <Tag size={16} className="text-cyan-500" />,
    run: () => {
      onNavigate('catalog');
      onClose();
    },
  }));

  // Filter actions based on search
  const q = query.toLowerCase();
  const filteredActions = [
    ...productActions,
    ...staticActions.filter(
      (a) =>
        a.label.toLowerCase().includes(q) ||
        (a.sublabel && a.sublabel.toLowerCase().includes(q)),
    ),
  ];

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % Math.max(1, filteredActions.length));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + filteredActions.length) % Math.max(1, filteredActions.length));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredActions[selectedIndex]) {
        filteredActions[selectedIndex].run();
      }
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
        className="w-full max-w-2xl bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search Header */}
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center gap-3">
          <Search size={20} className="text-gebeya-600 flex-shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            onKeyDown={handleKeyDown}
            placeholder={
              language === 'am'
                ? 'ወደ ማንኛውም ገጽ፣ እቃ ወይም ተግባር በ2 ኪይ ይሂዱ...'
                : 'Type a command, page name, or search any product...'
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
              No results found for "{query}".
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
                      <div className="text-xs font-bold leading-tight">
                        {action.label}
                      </div>
                      {action.sublabel && (
                        <div className="text-[10px] text-slate-400 mt-0.5">
                          {action.sublabel}
                        </div>
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

        {/* Footer shortcuts */}
        <div className="px-4 py-2 bg-slate-50 dark:bg-slate-800/60 border-t border-slate-200 dark:border-slate-800 text-[10px] text-slate-400 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <span>Use <kbd className="px-1 rounded bg-slate-200 dark:bg-slate-700">&uarr;</kbd> <kbd className="px-1 rounded bg-slate-200 dark:bg-slate-700">&darr;</kbd> to navigate</span>
            <span><kbd className="px-1 rounded bg-slate-200 dark:bg-slate-700">&crarr;</kbd> to select</span>
          </div>
          <span>GebeyaOS Fast Command v1.0</span>
        </div>
      </div>
    </div>
  );
};
