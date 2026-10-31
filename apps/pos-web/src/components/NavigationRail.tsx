import React from 'react';
import {
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
  ShieldAlert,
  Tag,
  ClipboardList,
} from 'lucide-react';
import { useI18n } from '../i18n/I18nContext';
import { useAuth } from '../auth/AuthContext';

export type NavTabId =
  | 'dashboard'
  | 'checkout'
  | 'shifts'
  | 'catalog'
  | 'inventory'
  | 'stocktake'
  | 'reorder'
  | 'purchasing'
  | 'reports'
  | 'users'
  | 'audit'
  | 'settings'
  | 'backup'
  | 'sync'
  | 'platform';

export interface NavigationRailProps {
  activeTab: NavTabId;
  onTabChange: (tab: NavTabId) => void;
}

export const NavigationRail: React.FC<NavigationRailProps> = ({
  activeTab,
  onTabChange,
}) => {
  const { t, language } = useI18n();
  const { hasPermission, hasRole } = useAuth();

  // Primary POS tabs on top
  const primaryTabs = [
    {
      id: 'checkout' as NavTabId,
      label: t('posTab'),
      icon: <ShoppingCart size={22} strokeWidth={1.75} />,
      allowed: hasPermission('pos:sale:create') || hasRole('CASHIER', 'BRANCH_MANAGER', 'OWNER'),
    },
    {
      id: 'shifts' as NavTabId,
      label: t('shiftTab'),
      icon: <Clock size={22} strokeWidth={1.75} />,
      allowed: hasPermission('pos:shift:open') || hasPermission('pos:shift:close') || hasRole('CASHIER', 'BRANCH_MANAGER', 'OWNER'),
    },
  ];

  // Secondary store management tabs below divider
  const secondaryTabs = [
    {
      id: 'inventory' as NavTabId,
      label: t('inventoryTab'),
      icon: <Package size={22} strokeWidth={1.75} />,
      allowed: hasPermission('inventory:stock:view') || hasRole('STOREKEEPER', 'BRANCH_MANAGER', 'OWNER'),
    },
    {
      id: 'purchasing' as NavTabId,
      label: t('purchasingTab'),
      icon: <Truck size={22} strokeWidth={1.75} />,
      allowed: hasPermission('purchasing:grn:receive') || hasPermission('purchasing:po:create') || hasRole('STOREKEEPER', 'BRANCH_MANAGER', 'OWNER'),
    },
    {
      id: 'reports' as NavTabId,
      label: t('reportsTab'),
      icon: <BarChart3 size={22} strokeWidth={1.75} />,
      allowed: hasPermission('reports:branch:view') || hasRole('ACCOUNTANT', 'BRANCH_MANAGER', 'OWNER'),
    },
    {
      id: 'sync' as NavTabId,
      label: t('syncTab'),
      icon: <RefreshCw size={22} strokeWidth={1.75} />,
      allowed: hasRole('HQ_ADMIN', 'BRANCH_MANAGER', 'OWNER'),
    },
    {
      id: 'catalog' as NavTabId,
      label: language === 'am' ? 'ካታሎግ' : 'Catalog',
      icon: <Tag size={20} strokeWidth={1.75} />,
      allowed: hasPermission('catalog:cost:view') || hasRole('STOREKEEPER', 'BRANCH_MANAGER', 'OWNER'),
    },
    {
      id: 'stocktake' as NavTabId,
      label: language === 'am' ? 'ቆጠራ' : 'Stocktake',
      icon: <ClipboardList size={20} strokeWidth={1.75} />,
      allowed: hasPermission('inventory:stocktake:execute') || hasRole('CASHIER', 'STOREKEEPER', 'BRANCH_MANAGER', 'OWNER'),
    },
    {
      id: 'users' as NavTabId,
      label: t('usersTab'),
      icon: <Users size={20} strokeWidth={1.75} />,
      allowed: hasPermission('admin:users:manage') || hasRole('BRANCH_MANAGER', 'OWNER'),
    },
    {
      id: 'settings' as NavTabId,
      label: language === 'am' ? 'ቅንብሮች' : 'Settings',
      icon: <Settings size={20} strokeWidth={1.75} />,
      allowed: hasRole('BRANCH_MANAGER', 'OWNER'),
    },
    {
      id: 'platform' as NavTabId,
      label: 'Platform',
      icon: <ShieldAlert size={20} strokeWidth={1.75} />,
      allowed: true,
    },
  ];

  const allowedPrimary = primaryTabs.filter((t) => t.allowed);
  const allowedSecondary = secondaryTabs.filter((t) => t.allowed);

  return (
    <nav className="w-[88px] min-w-[88px] bg-surface border-r border-border-subtle flex flex-col items-center py-3 justify-between flex-shrink-0 select-none z-20 overflow-y-auto no-scrollbar">
      <div className="flex flex-col gap-1 w-full px-2">
        {/* Top: Checkout & Shift */}
        {allowedPrimary.map((item) => {
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onTabChange(item.id)}
              className={`w-full min-h-[58px] rounded-xl flex flex-col items-center justify-center gap-1.5 transition-colors duration-fast active:scale-95 cursor-pointer ${
                isActive
                  ? 'bg-primary-soft text-primary font-semibold'
                  : 'text-text-muted hover:text-text-main hover:bg-surface-2'
              }`}
              title={item.label}
              aria-label={item.label}
            >
              {item.icon}
              <span className="text-[12px] leading-tight text-center">{item.label}</span>
            </button>
          );
        })}

        {/* Thin Divider */}
        {allowedSecondary.length > 0 && (
          <div className="h-px bg-border-subtle my-2 mx-1.5" />
        )}

        {/* Below Divider: Inventory, Purchasing, Reports, Sync */}
        <div className="flex flex-col gap-1 w-full">
          {allowedSecondary.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onTabChange(item.id)}
                className={`w-full min-h-[52px] rounded-xl flex flex-col items-center justify-center gap-1 transition-colors duration-fast active:scale-95 cursor-pointer ${
                  isActive
                    ? 'bg-primary-soft text-primary font-semibold'
                    : 'text-text-muted hover:text-text-main hover:bg-surface-2'
                }`}
                title={item.label}
                aria-label={item.label}
              >
                {item.icon}
                <span className="text-[12px] leading-tight text-center truncate w-full px-1">
                  {item.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </nav>
  );
};

export const SideRail = NavigationRail;
