import React, { useState } from 'react';
import {
  Sparkles,
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
  | 'sync';

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

  // Define tab items with permission gates
  const allTabs = [
    {
      id: 'dashboard' as NavTabId,
      label: language === 'am' ? 'ዳሽቦርድ' : 'Home',
      icon: <Sparkles size={20} />,
      isPrimary: true,
      allowed: true,
    },
    {
      id: 'checkout' as NavTabId,
      label: t('posTab'),
      icon: <ShoppingCart size={20} />,
      isPrimary: true,
      allowed: hasPermission('pos:sale:create') || hasRole('CASHIER', 'BRANCH_MANAGER', 'OWNER'),
    },
    {
      id: 'shifts' as NavTabId,
      label: t('shiftTab'),
      icon: <Clock size={20} />,
      isPrimary: true,
      allowed: hasPermission('pos:shift:open') || hasPermission('pos:shift:close') || hasRole('CASHIER', 'BRANCH_MANAGER', 'OWNER'),
    },
    {
      id: 'catalog' as NavTabId,
      label: language === 'am' ? 'እቃዎች' : 'Catalog',
      icon: <Tag size={19} />,
      isPrimary: false,
      allowed: hasPermission('catalog:cost:view') || hasRole('STOREKEEPER', 'BRANCH_MANAGER', 'OWNER'),
    },
    {
      id: 'inventory' as NavTabId,
      label: t('inventoryTab'),
      icon: <Package size={19} />,
      isPrimary: false,
      allowed: hasPermission('inventory:stock:view') || hasRole('STOREKEEPER', 'BRANCH_MANAGER', 'OWNER'),
    },
    {
      id: 'stocktake' as NavTabId,
      label: language === 'am' ? 'ቆጠራ' : 'Stocktake',
      icon: <ClipboardList size={19} />,
      isPrimary: false,
      allowed: hasRole('STOREKEEPER', 'BRANCH_MANAGER', 'OWNER'),
    },
    {
      id: 'reorder' as NavTabId,
      label: language === 'am' ? 'ማዘዣ' : 'Reorders',
      icon: <Truck size={19} />,
      isPrimary: false,
      allowed: hasRole('STOREKEEPER', 'BRANCH_MANAGER', 'OWNER'),
    },
    {
      id: 'purchasing' as NavTabId,
      label: t('purchasingTab'),
      icon: <Truck size={19} />,
      isPrimary: false,
      allowed: hasPermission('purchasing:grn:receive') || hasPermission('purchasing:po:create') || hasRole('STOREKEEPER', 'BRANCH_MANAGER', 'OWNER'),
    },
    {
      id: 'reports' as NavTabId,
      label: t('reportsTab'),
      icon: <BarChart3 size={19} />,
      isPrimary: false,
      allowed: hasPermission('reports:branch:view') || hasRole('ACCOUNTANT', 'BRANCH_MANAGER', 'OWNER'),
    },
    {
      id: 'users' as NavTabId,
      label: t('usersTab'),
      icon: <Users size={19} />,
      isPrimary: false,
      allowed: hasPermission('admin:users:manage') || hasRole('BRANCH_MANAGER', 'OWNER'),
    },
    {
      id: 'audit' as NavTabId,
      label: language === 'am' ? 'ኦዲት' : 'Audit',
      icon: <ShieldCheck size={19} />,
      isPrimary: false,
      allowed: hasRole('BRANCH_MANAGER', 'OWNER', 'ACCOUNTANT'),
    },
    {
      id: 'settings' as NavTabId,
      label: language === 'am' ? 'ቅንብሮች' : 'Settings',
      icon: <Settings size={19} />,
      isPrimary: false,
      allowed: hasRole('BRANCH_MANAGER', 'OWNER'),
    },
    {
      id: 'backup' as NavTabId,
      label: language === 'am' ? 'ቅጂ' : 'Backup',
      icon: <HardDrive size={19} />,
      isPrimary: false,
      allowed: hasRole('BRANCH_MANAGER', 'OWNER'),
    },
    {
      id: 'sync' as NavTabId,
      label: t('syncTab'),
      icon: <RefreshCw size={19} />,
      isPrimary: false,
      allowed: hasRole('HQ_ADMIN', 'BRANCH_MANAGER', 'OWNER'),
    },
  ];

  const allowedTabs = allTabs.filter((tab) => tab.allowed);
  const primaryItems = allowedTabs.filter((tab) => tab.isPrimary);
  const secondaryItems = allowedTabs.filter((tab) => !tab.isPrimary);

  return (
    <nav className="w-16 sm:w-20 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 flex flex-col items-center py-2.5 justify-between flex-shrink-0 select-none z-20 overflow-y-auto">
      {/* Primary Actions */}
      <div className="flex flex-col gap-1.5 w-full px-2">
        {primaryItems.map((item) => {
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onTabChange(item.id)}
              className={`min-h-[48px] w-full rounded-2xl flex flex-col items-center justify-center gap-1 transition-all active:scale-95 ${
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
        <div className="flex flex-col gap-1.5 animate-in fade-in duration-100">
          {secondaryItems.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onTabChange(item.id)}
                className={`min-h-[44px] w-full rounded-xl flex flex-col items-center justify-center gap-0.5 transition-all active:scale-95 ${
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
