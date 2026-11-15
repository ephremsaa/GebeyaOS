import React from 'react';
import {
  ShoppingCart,
  Tag,
  Archive,
  Truck,
  BarChart3,
  Users,
  Settings,
} from 'lucide-react';
import { useI18n } from '../i18n/I18nContext';
import { useAuth } from '../auth/AuthContext';

/**
 * The 7 primary pages plus legacy ids (kept for redirect handling in App.tsx).
 * No new code should use the legacy ids directly — they redirect on mount.
 */
export type NavTabId =
  // ── 7 pages ──
  | 'sales'
  | 'items'
  | 'stock'
  | 'suppliers'
  | 'reports'
  | 'staff'
  | 'settings'
  // ── legacy ids (redirected in App.tsx, never rendered directly) ──
  | 'dashboard'
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
  const { t } = useI18n();
  const { hasPermission, hasRole } = useAuth();

  const tabs: NavItem[] = [
    {
      id: 'sales',
      label: t('common.salesTab'),
      icon: <ShoppingCart size={22} strokeWidth={1.75} />,
      allowed:
        hasPermission('pos:sale:create') ||
        hasRole('CASHIER', 'BRANCH_MANAGER', 'OWNER'),
    },
    {
      id: 'items',
      label: t('common.itemsTab'),
      icon: <Tag size={22} strokeWidth={1.75} />,
      allowed:
        hasPermission('catalog:cost:view') ||
        hasRole('STOREKEEPER', 'BRANCH_MANAGER', 'OWNER'),
    },
    {
      id: 'stock',
      label: t('common.stockTab'),
      icon: <Archive size={22} strokeWidth={1.75} />,
      allowed:
        hasPermission('inventory:stock:view') ||
        hasRole('STOREKEEPER', 'BRANCH_MANAGER', 'OWNER'),
    },
    {
      id: 'suppliers',
      label: t('common.suppliersTab'),
      icon: <Truck size={22} strokeWidth={1.75} />,
      allowed:
        hasPermission('purchasing:grn:receive') ||
        hasRole('STOREKEEPER', 'BRANCH_MANAGER', 'OWNER'),
    },
    {
      id: 'reports',
      label: t('common.reportsTab'),
      icon: <BarChart3 size={22} strokeWidth={1.75} />,
      allowed:
        hasPermission('reports:branch:view') ||
        hasRole('ACCOUNTANT', 'BRANCH_MANAGER', 'OWNER'),
    },
    {
      id: 'staff',
      label: t('common.staffTab'),
      icon: <Users size={22} strokeWidth={1.75} />,
      allowed:
        hasPermission('admin:users:manage') ||
        hasRole('BRANCH_MANAGER', 'OWNER'),
    },
    {
      id: 'settings',
      label: t('common.settingsTab'),
      icon: <Settings size={22} strokeWidth={1.75} />,
      allowed: hasRole('BRANCH_MANAGER', 'OWNER'),
    },
  ];

  const visibleTabs = tabs.filter((tab) => tab.allowed);

  return (
    <nav
      className="w-[88px] min-w-[88px] bg-sidebar border-r border-border-subtle flex flex-col items-center py-3.5 justify-between flex-shrink-0 select-none z-20 overflow-y-auto no-scrollbar"
      aria-label="Main navigation"
    >
      <div className="flex flex-col gap-1 w-full px-2">
        {visibleTabs.map((item) => {
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onTabChange(item.id)}
              className={`w-full min-h-[58px] rounded-xl flex flex-col items-center justify-center gap-1.5 transition-all duration-fast active:scale-95 cursor-pointer relative ${
                isActive
                  ? 'bg-secondary text-primary font-bold shadow-xs'
                  : 'text-text-muted hover:text-text-main hover:bg-surface-2'
              }`}
              title={item.label}
              aria-label={item.label}
              aria-current={isActive ? 'page' : undefined}
            >
              {isActive && (
                <span className="absolute left-0 top-2.5 bottom-2.5 w-1 bg-primary rounded-r-full" />
              )}
              {item.id === 'stock' && hasCriticalAlerts && (
                <span className="absolute top-2 right-3 flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-rose-600" />
                </span>
              )}
              {item.icon}
              <span className="text-[11px] leading-tight text-center truncate w-full px-1">
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};

export const SideRail = NavigationRail;
