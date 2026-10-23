import React, { useState } from 'react';
import {
  ShoppingCart,
  Clock,
  Package,
  Truck,
  BarChart3,
  RefreshCw,
  Users,
  MoreHorizontal,
} from 'lucide-react';
import { useI18n } from '../i18n/I18nContext';
import { useAuth } from '../auth/AuthContext';

export type NavTabId =
  | 'checkout'
  | 'shifts'
  | 'inventory'
  | 'purchasing'
  | 'reports'
  | 'sync'
  | 'users';

export interface NavigationRailProps {
  activeTab: NavTabId;
  onTabChange: (tab: NavTabId) => void;
}

export const NavigationRail: React.FC<NavigationRailProps> = ({
  activeTab,
  onTabChange,
}) => {
  const { t } = useI18n();
  const { hasPermission, hasRole } = useAuth();
  const [showMore, setShowMore] = useState(false);

  // Define tab items with permission gates
  const allTabs = [
    {
      id: 'checkout' as NavTabId,
      label: t('posTab'),
      icon: <ShoppingCart size={22} />,
      isPrimary: true,
      allowed: hasPermission('pos:sale:create') || hasRole('CASHIER', 'BRANCH_MANAGER', 'OWNER'),
    },
    {
      id: 'shifts' as NavTabId,
      label: t('shiftTab'),
      icon: <Clock size={22} />,
      isPrimary: true,
      allowed: hasPermission('pos:shift:open') || hasPermission('pos:shift:close') || hasRole('CASHIER', 'BRANCH_MANAGER', 'OWNER'),
    },
    {
      id: 'inventory' as NavTabId,
      label: t('inventoryTab'),
      icon: <Package size={22} />,
      isPrimary: false,
      allowed: hasPermission('inventory:stock:view') || hasRole('STOREKEEPER', 'BRANCH_MANAGER', 'OWNER'),
    },
    {
      id: 'purchasing' as NavTabId,
      label: t('purchasingTab'),
      icon: <Truck size={22} />,
      isPrimary: false,
      allowed: hasPermission('purchasing:grn:receive') || hasPermission('purchasing:po:create') || hasRole('STOREKEEPER', 'BRANCH_MANAGER', 'OWNER'),
    },
    {
      id: 'reports' as NavTabId,
      label: t('reportsTab'),
      icon: <BarChart3 size={22} />,
      isPrimary: false,
      allowed: hasPermission('reports:branch:view') || hasRole('ACCOUNTANT', 'BRANCH_MANAGER', 'OWNER'),
    },
    {
      id: 'users' as NavTabId,
      label: t('usersTab'),
      icon: <Users size={22} />,
      isPrimary: false,
      allowed: hasPermission('admin:users:manage') || hasRole('BRANCH_MANAGER', 'OWNER'),
    },
    {
      id: 'sync' as NavTabId,
      label: t('syncTab'),
      icon: <RefreshCw size={22} />,
      isPrimary: false,
      allowed: hasRole('HQ_ADMIN', 'BRANCH_MANAGER', 'OWNER'),
    },
  ];

  const allowedTabs = allTabs.filter((tab) => tab.allowed);
  const primaryItems = allowedTabs.filter((tab) => tab.isPrimary);
  const secondaryItems = allowedTabs.filter((tab) => !tab.isPrimary);

  return (
    <nav className="w-16 sm:w-20 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 flex flex-col items-center py-3 justify-between flex-shrink-0 select-none z-20">
      {/* Primary Actions */}
      <div className="flex flex-col gap-2 w-full px-2">
        {primaryItems.map((item) => {
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onTabChange(item.id)}
              className={`min-h-[52px] w-full rounded-2xl flex flex-col items-center justify-center gap-1 transition-all active:scale-95 ${
                isActive
                  ? 'bg-gebeya-600 text-white shadow-sm shadow-gebeya-600/30 font-bold'
                  : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 dark:hover:text-slate-200 font-medium'
              }`}
              title={item.label}
            >
              {item.icon}
              <span className="text-[10px] leading-none tracking-tight">{item.label}</span>
            </button>
          );
        })}

        {/* Divider if secondary items exist */}
        {secondaryItems.length > 0 && (
          <div className="h-px bg-slate-200 dark:bg-slate-800 my-1 mx-2" />
        )}

        {/* Secondary Modules */}
        <div className="flex flex-col gap-2 animate-in fade-in duration-100">
          {secondaryItems.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onTabChange(item.id)}
                className={`min-h-[48px] w-full rounded-xl flex flex-col items-center justify-center gap-1 transition-all active:scale-95 ${
                  isActive
                    ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 font-bold'
                    : 'text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 dark:hover:text-slate-200'
                }`}
                title={item.label}
              >
                {item.icon}
                <span className="text-[9px] leading-none">{item.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </nav>
  );
};
