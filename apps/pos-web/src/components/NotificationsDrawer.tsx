import React, { useState, useEffect } from 'react';
import {
  Bell,
  X,
  AlertTriangle,
  Clock,
  RefreshCw,
  DollarSign,
  Package,
  ArrowRight,
  CheckCircle2,
  Trash2,
} from 'lucide-react';
import { useI18n } from '../i18n/I18nContext';
import { NavTabId } from './NavigationRail';

export interface NotificationItem {
  id: string;
  type: 'STOCKOUT' | 'LOW_STOCK' | 'EXPIRY' | 'SYNC' | 'CASH_THRESHOLD';
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  title: string;
  message: string;
  timestamp: string;
  actionUrl?: NavTabId;
}

interface NotificationsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigate: (tab: NavTabId) => void;
  onUnreadCountChange?: (count: number) => void;
}

export const NotificationsDrawer: React.FC<NotificationsDrawerProps> = ({
  isOpen,
  onClose,
  onNavigate,
  onUnreadCountChange,
}) => {
  const { language } = useI18n();
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  const fetchAlerts = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/system/notifications');
      if (res.ok) {
        const data = await res.json();
        setNotifications(data || []);
        if (onUnreadCountChange) onUnreadCountChange((data || []).length);
      }
    } catch (err) {
      console.error('Failed to load notifications', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAlerts();
    const interval = setInterval(fetchAlerts, 45000); // 45s poll
    return () => clearInterval(interval);
  }, []);

  const handleDismiss = (id: string) => {
    const updated = notifications.filter((n) => n.id !== id);
    setNotifications(updated);
    if (onUnreadCountChange) onUnreadCountChange(updated.length);
  };

  const handleClearAll = () => {
    setNotifications([]);
    if (onUnreadCountChange) onUnreadCountChange(0);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-2xs animate-in fade-in select-none">
      <div className="w-full max-w-md bg-white dark:bg-slate-900 h-full shadow-2xl border-l border-slate-200 dark:border-slate-800 flex flex-col animate-in slide-in-from-right duration-200">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-100 dark:bg-amber-950/60 text-amber-600 flex items-center justify-center">
              <Bell size={18} />
            </div>
            <div>
              <h2 className="text-sm font-extrabold text-slate-900 dark:text-white">
                {language === 'am' ? 'የማሳወቂያ ሳጥን' : 'Notification Center'}
              </h2>
              <p className="text-[11px] text-slate-400">
                {notifications.length} {language === 'am' ? 'አስቸኳይ ማንቂያዎች' : 'active system alert(s)'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1">
            {notifications.length > 0 && (
              <button
                onClick={handleClearAll}
                className="px-2.5 py-1 rounded-lg text-slate-400 hover:text-slate-600 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-800 transition"
              >
                Clear all
              </button>
            )}
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center text-slate-400 hover:text-slate-600 transition"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Content list */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {loading ? (
            <div className="py-12 text-center text-slate-400 text-xs">
              <RefreshCw className="animate-spin inline-block mr-2" size={16} />
              Loading real-time notifications...
            </div>
          ) : notifications.length === 0 ? (
            <div className="py-16 text-center text-slate-400 flex flex-col items-center justify-center gap-2">
              <div className="w-12 h-12 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-500 flex items-center justify-center">
                <CheckCircle2 size={24} />
              </div>
              <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                All systems healthy!
              </span>
              <p className="text-[11px] text-slate-400 max-w-xs">
                No stockouts, expiring batches, sync delays, or cash threshold alerts at this time.
              </p>
            </div>
          ) : (
            notifications.map((item) => {
              let Icon = AlertTriangle;
              let colorClasses = 'bg-amber-50 border-amber-200 text-amber-900 dark:bg-amber-950/30 dark:border-amber-800 dark:text-amber-200';
              let iconColor = 'text-amber-500';

              if (item.severity === 'CRITICAL') {
                colorClasses = 'bg-rose-50 border-rose-200 text-rose-900 dark:bg-rose-950/30 dark:border-rose-800 dark:text-rose-200';
                iconColor = 'text-rose-500';
              } else if (item.type === 'SYNC') {
                Icon = RefreshCw;
                colorClasses = 'bg-blue-50 border-blue-200 text-blue-900 dark:bg-blue-950/30 dark:border-blue-800 dark:text-blue-200';
                iconColor = 'text-blue-500';
              } else if (item.type === 'EXPIRY') {
                Icon = Clock;
                colorClasses = 'bg-purple-50 border-purple-200 text-purple-900 dark:bg-purple-950/30 dark:border-purple-800 dark:text-purple-200';
                iconColor = 'text-purple-500';
              } else if (item.type === 'CASH_THRESHOLD') {
                Icon = DollarSign;
                colorClasses = 'bg-indigo-50 border-indigo-200 text-indigo-900 dark:bg-indigo-950/30 dark:border-indigo-800 dark:text-indigo-200';
                iconColor = 'text-indigo-500';
              }

              return (
                <div
                  key={item.id}
                  className={`p-3.5 rounded-2xl border ${colorClasses} flex flex-col justify-between gap-2 shadow-2xs transition`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2.5">
                      <Icon size={18} className={`${iconColor} mt-0.5 flex-shrink-0`} />
                      <div>
                        <div className="text-xs font-extrabold leading-tight">{item.title}</div>
                        <div className="text-[11px] opacity-90 mt-1 leading-relaxed">
                          {item.message}
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => handleDismiss(item.id)}
                      className="text-slate-400 hover:text-slate-600 p-1"
                      title="Dismiss"
                    >
                      <X size={13} />
                    </button>
                  </div>

                  <div className="flex items-center justify-between pt-1 border-t border-black/5 dark:border-white/5 text-[10px]">
                    <span className="opacity-60">Just now</span>
                    {item.actionUrl && (
                      <button
                        onClick={() => {
                          onNavigate(item.actionUrl as NavTabId);
                          onClose();
                        }}
                        className="font-bold flex items-center gap-1 hover:underline cursor-pointer"
                      >
                        Resolve issue <ArrowRight size={11} />
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="p-3 bg-slate-50 dark:bg-slate-800/60 border-t border-slate-200 dark:border-slate-800 text-[11px] text-slate-400 flex items-center justify-between">
          <span>Branch LAN Guardian</span>
          <button
            onClick={fetchAlerts}
            className="font-bold text-gebeya-600 hover:underline flex items-center gap-1"
          >
            <RefreshCw size={11} /> Refresh
          </button>
        </div>
      </div>
    </div>
  );
};
