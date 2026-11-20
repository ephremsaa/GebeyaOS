import React, { useState } from 'react';
import {
  LayoutDashboard,
  ShoppingCart,
  Tag,
  Archive,
  Truck,
  BarChart3,
  Users,
  Settings,
  LogOut,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { useI18n } from '../i18n/I18nContext';
import { useAuth } from '../auth/AuthContext';
import { useBrand } from '../brand/BrandContext';

export type NavTabId =
  | 'dashboard'
  | 'sales'
  | 'items'
  | 'stock'
  | 'suppliers'
  | 'reports'
  | 'staff'
  | 'settings'
  // Legacy aliases
  | 'checkout'
  | 'shifts'
  | 'catalog'
  | 'inventory'
  | 'stocktake'
  | 'reorder'
  | 'purchasing'
  | 'users'
  | 'audit'
  | 'backup'
  | 'sync';

export interface NavigationRailProps {
  activeTab: NavTabId;
  onTabChange: (tab: NavTabId) => void;
  hasCriticalAlerts?: boolean;
}

interface NavItem {
  id: NavTabId;
  label: string;
  icon: React.ReactNode;
  allowed: boolean;
}

export const NavigationRail: React.FC<NavigationRailProps> = ({
  activeTab,
  onTabChange,
  hasCriticalAlerts = false,
}) => {
  const { t, language } = useI18n();
  const { hasPermission, hasRole, logout, currentUser } = useAuth();
  const brand = useBrand();

  const [isCollapsed, setIsCollapsed] = useState<boolean>(() => {
    return localStorage.getItem('gebeyaos_sidebar_collapsed') === 'true';
  });

  const toggleCollapsed = () => {
    setIsCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem('gebeyaos_sidebar_collapsed', String(next));
      return next;
    });
  };

  const brandDisplayName =
    currentUser?.tenantName?.trim() ||
    (brand.displayName !== 'GebeyaOS' ? brand.displayName : '') ||
    'Retail POS';
  const initialLetter = brandDisplayName.charAt(0).toUpperCase();

  const tabs: NavItem[] = [
    {
      id: 'dashboard',
      label: language === 'am' ? 'ዳሽቦርድ' : 'Dashboard',
      icon: <LayoutDashboard size={21} strokeWidth={2} />,
      allowed: hasRole('OWNER', 'BRANCH_MANAGER', 'HQ_ADMIN'),
    },
    {
      id: 'sales',
      label: t('common.salesTab'),
      icon: <ShoppingCart size={21} strokeWidth={2} />,
      allowed:
        hasPermission('pos:sale:create') ||
        hasRole('CASHIER', 'BRANCH_MANAGER', 'OWNER'),
    },
    {
      id: 'items',
      label: t('common.itemsTab'),
      icon: <Tag size={21} strokeWidth={2} />,
      allowed:
        hasPermission('catalog:cost:view') ||
        hasRole('STOREKEEPER', 'BRANCH_MANAGER', 'OWNER'),
    },
    {
      id: 'stock',
      label: t('common.stockTab'),
      icon: <Archive size={21} strokeWidth={2} />,
      allowed:
        hasPermission('inventory:stock:view') ||
        hasRole('STOREKEEPER', 'BRANCH_MANAGER', 'OWNER'),
    },
    {
      id: 'suppliers',
      label: t('common.suppliersTab'),
      icon: <Truck size={21} strokeWidth={2} />,
      allowed:
        hasPermission('purchasing:grn:receive') ||
        hasRole('STOREKEEPER', 'BRANCH_MANAGER', 'OWNER'),
    },
    {
      id: 'reports',
      label: t('common.reportsTab'),
      icon: <BarChart3 size={21} strokeWidth={2} />,
      allowed:
        hasPermission('reports:branch:view') ||
        hasRole('ACCOUNTANT', 'BRANCH_MANAGER', 'OWNER'),
    },
    {
      id: 'staff',
      label: t('common.staffTab'),
      icon: <Users size={21} strokeWidth={2} />,
      allowed:
        hasPermission('admin:users:manage') ||
        hasRole('BRANCH_MANAGER', 'OWNER'),
    },
    {
      id: 'settings',
      label: t('common.settingsTab'),
      icon: <Settings size={21} strokeWidth={2} />,
      allowed: hasRole('BRANCH_MANAGER', 'OWNER'),
    },
  ];

  const visibleTabs = tabs.filter((tab) => tab.allowed);

  return (
    <aside
      className={`transition-all duration-200 select-none z-30 flex flex-col justify-between text-white shrink-0 shadow-xl ${
        isCollapsed ? 'w-[76px]' : 'w-[240px]'
      }`}
      style={{
        background: 'linear-gradient(180deg, var(--sidebar-from, #0E4B2F) 0%, var(--sidebar-to, #0A3A25) 100%)',
      }}
      aria-label="Main sidebar navigation"
    >
      {/* ─── 1. Brand Header at Top of Sidebar ─── */}
      <div className="p-4 border-b border-white/10 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 overflow-hidden">
          <div className="w-10 h-10 rounded-xl bg-white/15 border border-white/20 flex items-center justify-center text-white shrink-0 font-extrabold text-base shadow-sm overflow-hidden">
            {brand.logoUrl ? (
              <img src={brand.logoUrl} alt={brandDisplayName} className="w-full h-full object-cover" />
            ) : (
              <span>{initialLetter}</span>
            )}
          </div>
          {!isCollapsed && (
            <div className="flex flex-col min-w-0">
              <span className="font-extrabold text-[16px] tracking-tight leading-tight text-white truncate">
                {brandDisplayName}
              </span>
              <span className="text-[12px] font-medium text-emerald-200/80 truncate">
                {currentUser?.branchName || 'Retail Hub'}
              </span>
            </div>
          )}
        </div>

        {/* Collapse / Expand toggle button */}
        <button
          type="button"
          onClick={toggleCollapsed}
          className="hidden lg:flex w-7 h-7 rounded-lg bg-white/10 hover:bg-white/20 text-white/80 hover:text-white items-center justify-center transition"
          title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {isCollapsed ? <ChevronRight size={15} /> : <ChevronLeft size={15} />}
        </button>
      </div>

      {/* ─── 2. Navigation Items ─── */}
      <div className="flex-1 py-3 px-2.5 space-y-1.5 overflow-y-auto no-scrollbar">
        {visibleTabs.map((item) => {
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onTabChange(item.id)}
              className={`w-full min-h-[46px] rounded-xl flex items-center gap-3 px-3 py-2.5 transition-all duration-150 active:scale-[0.98] cursor-pointer relative ${
                isActive
                  ? 'bg-[var(--sidebar-active,#1F8A4C)] text-white shadow-md font-bold'
                  : 'text-white/80 hover:text-white hover:bg-white/10 font-semibold'
              } ${isCollapsed ? 'justify-center px-0' : ''}`}
              title={item.label}
              aria-label={item.label}
              aria-current={isActive ? 'page' : undefined}
            >
              <div className="relative shrink-0 flex items-center justify-center">
                {item.icon}
                {item.id === 'stock' && hasCriticalAlerts && (
                  <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-rose-500" />
                  </span>
                )}
              </div>

              {!isCollapsed && (
                <span className="text-[15px] leading-tight truncate flex-1 text-left">
                  {item.label}
                </span>
              )}

              {/* Red badge for stock alerts in expanded mode */}
              {!isCollapsed && item.id === 'stock' && hasCriticalAlerts && (
                <span className="px-2 py-0.5 rounded-full bg-rose-600 text-white text-[11px] font-bold">
                  !
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ─── 3. Footer with Logout & Brand Note ─── */}
      <div className="p-3 border-t border-white/10 space-y-2">
        <button
          type="button"
          onClick={logout}
          className={`w-full min-h-[42px] rounded-xl flex items-center gap-3 px-3 py-2 text-white/70 hover:text-white hover:bg-white/10 transition active:scale-95 cursor-pointer font-semibold text-[14px] ${
            isCollapsed ? 'justify-center px-0' : ''
          }`}
          title={t('common.logout') || 'Logout'}
        >
          <LogOut size={18} />
          {!isCollapsed && <span>{t('common.logout') || 'Logout'}</span>}
        </button>

        {!isCollapsed && brand.showPoweredBy && (
          <div className="text-[11px] text-white/40 text-center font-medium pt-1">
            powered by GebeyaOS
          </div>
        )}
      </div>
    </aside>
  );
};

export const SideRail = NavigationRail;
