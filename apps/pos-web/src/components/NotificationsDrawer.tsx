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
  Tag,
  AlertOctagon,
  Eye,
  Calendar,
} from 'lucide-react';
import { useI18n } from '../i18n/I18nContext';
import { NavTabId } from './NavigationRail';
import { computeDaysLeftInAddis } from '@gebeyaos/shared-types';

export interface NotificationItem {
  id: string;
  type: 'STOCKOUT' | 'LOW_STOCK' | 'EXPIRY' | 'SYNC' | 'CASH_THRESHOLD';
  stage?: 'EXPIRED' | '7D' | '30D' | '90D';
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  title: string;
  titleAm?: string;
  message: string;
  messageAm?: string;
  timestamp: string;
  actionUrl?: NavTabId;
  isRead?: boolean;
  batchId?: string;
  productId?: string;
  batchNumber?: string;
  expiryDate?: string;
  currentQuantity?: number;
  clearancePrice?: number | null;
  productName?: string;
  productNameAm?: string;
  photoPath?: string | null;
  uomCode?: string;
}

interface NotificationsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigate: (tab: NavTabId) => void;
  onUnreadCountChange?: (count: number) => void;
  onCriticalCountChange?: (count: number) => void;
}

export const NotificationsDrawer: React.FC<NotificationsDrawerProps> = ({
  isOpen,
  onClose,
  onNavigate,
  onUnreadCountChange,
  onCriticalCountChange,
}) => {
  const { t, language } = useI18n();
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  const fetchAlerts = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/system/notifications');
      if (res.ok) {
        const data: NotificationItem[] = await res.json();
        setNotifications(data || []);
        const unread = (data || []).filter((n) => !n.isRead).length;
        const critical = (data || []).filter(
          (n) => n.severity === 'CRITICAL' || n.stage === 'EXPIRED' || n.stage === '7D',
        ).length;
        if (onUnreadCountChange) onUnreadCountChange(unread);
        if (onCriticalCountChange) onCriticalCountChange(critical);
      }
    } catch (err) {
      console.error('Failed to load notifications', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAlerts();
    const interval = setInterval(fetchAlerts, 30000); // 30s poll
    return () => clearInterval(interval);
  }, []);

  const handleMarkAsRead = async (id: string) => {
    try {
      await fetch(`/api/system/notifications/${id}/read`, { method: 'POST' });
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)),
      );
      if (onUnreadCountChange) {
        const remaining = notifications.filter((n) => n.id !== id && !n.isRead).length;
        onUnreadCountChange(remaining);
      }
    } catch (err) {
      console.error('Failed to mark read', err);
    }
  };

  const handleSnooze = async (id: string, days: number = 7) => {
    try {
      await fetch(`/api/system/notifications/${id}/snooze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ days }),
      });
      const updated = notifications.filter((n) => n.id !== id);
      setNotifications(updated);
      if (onUnreadCountChange) onUnreadCountChange(updated.filter((n) => !n.isRead).length);
    } catch (err) {
      console.error('Failed to snooze notification', err);
    }
  };

  const handleDismiss = async (id: string) => {
    try {
      await fetch(`/api/system/notifications/${id}/dismiss`, { method: 'POST' });
      const updated = notifications.filter((n) => n.id !== id);
      setNotifications(updated);
      if (onUnreadCountChange) onUnreadCountChange(updated.filter((n) => !n.isRead).length);
    } catch (err) {
      console.error('Failed to dismiss notification', err);
    }
  };

  const handleClearAll = async () => {
    try {
      await fetch('/api/system/notifications/dismiss-all', { method: 'POST' });
      setNotifications([]);
      if (onUnreadCountChange) onUnreadCountChange(0);
      if (onCriticalCountChange) onCriticalCountChange(0);
    } catch (err) {
      console.error('Failed to clear all notifications', err);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-2xs animate-in fade-in select-none">
      <div className="w-full max-w-md bg-white dark:bg-slate-800 h-full shadow-2xl border-l border-slate-200 dark:border-slate-700 flex flex-col animate-in slide-in-from-right duration-200">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-100 dark:bg-amber-950/60 text-amber-600 flex items-center justify-center">
              <Bell size={18} />
            </div>
            <div>
              <h2 className="text-sm font-extrabold text-slate-900 dark:text-white">
                {language === 'am' ? 'የማሳወቂያ ማዕከል' : 'Notifications & Expiry Alerts'}
              </h2>
              <p className="text-[11px] text-slate-400">
                {language === 'am'
                  ? `${notifications.length} ንቁ ማስጠንቀቂያዎች`
                  : `${notifications.length} active system alerts`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1">
            {notifications.length > 0 && (
              <button
                onClick={handleClearAll}
                className="px-2.5 py-1 rounded-lg text-slate-400 hover:text-slate-600 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-800 transition"
              >
                {language === 'am' ? 'ሁሉንም አጽዳ' : 'Dismiss all'}
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
              <RefreshCw className="animate-spin inline-block mr-2 text-primary" size={16} />
              {language === 'am' ? 'ማሳወቂያዎች በመጫን ላይ...' : 'Loading notifications...'}
            </div>
          ) : notifications.length === 0 ? (
            <div className="py-16 text-center text-slate-400 flex flex-col items-center justify-center gap-2">
              <div className="w-12 h-12 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-500 flex items-center justify-center">
                <CheckCircle2 size={24} />
              </div>
              <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                {language === 'am' ? 'ሁሉም ስርዓቶች ጤናማ ናቸው!' : 'All systems healthy!'}
              </span>
              <p className="text-[11px] text-slate-400 max-w-xs">
                {language === 'am'
                  ? 'ምንም ጊዜው ያለፈበት ወይም አደጋ ላይ ያለ እቃ የለም።'
                  : 'No expired items or critical alerts requiring immediate action.'}
              </p>
            </div>
          ) : (
            notifications.map((item) => {
              const isCritical = item.severity === 'CRITICAL' || item.stage === 'EXPIRED' || item.stage === '7D';
              const days = item.expiryDate ? computeDaysLeftInAddis(item.expiryDate) : null;

              const titleText = language === 'am' && item.titleAm ? item.titleAm : item.title;
              const msgText = language === 'am' && item.messageAm ? item.messageAm : item.message;

              return (
                <div
                  key={item.id}
                  className={`p-3.5 rounded-2xl border transition flex flex-col gap-2.5 shadow-2xs ${
                    isCritical
                      ? 'bg-rose-50/70 border-rose-300 dark:bg-rose-950/30 dark:border-rose-800'
                      : item.stage === '30D'
                      ? 'bg-amber-50/70 border-amber-300 dark:bg-amber-950/30 dark:border-amber-800'
                      : 'bg-white border-slate-200 dark:bg-slate-800 dark:border-slate-700'
                  } ${item.isRead ? 'opacity-70' : ''}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2.5 flex-1 min-w-0">
                      {/* Thumbnail or Icon */}
                      <div className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 overflow-hidden flex items-center justify-center shrink-0">
                        {item.photoPath ? (
                          <img
                            src={`/api/media/products/${item.productId}/160`}
                            alt={item.productName || 'Photo'}
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              (e.target as HTMLElement).style.display = 'none';
                            }}
                          />
                        ) : isCritical ? (
                          <AlertOctagon size={18} className="text-rose-600" />
                        ) : item.type === 'EXPIRY' ? (
                          <Clock size={18} className="text-amber-500" />
                        ) : (
                          <AlertTriangle size={18} className="text-amber-500" />
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-extrabold text-slate-900 dark:text-white leading-tight truncate">
                          {titleText}
                        </div>
                        <div className="text-[11px] text-slate-600 dark:text-slate-300 mt-0.5 leading-relaxed">
                          {msgText}
                        </div>

                        {/* Batch & Expiry metadata */}
                        {item.batchNumber && (
                          <div className="flex items-center gap-2 mt-1.5 text-[10px] font-mono text-slate-500 flex-wrap">
                            <span className="font-bold">Batch: {item.batchNumber}</span>
                            {item.currentQuantity !== undefined && (
                              <span>• {item.currentQuantity} {item.uomCode || 'units'}</span>
                            )}
                            {item.expiryDate && (
                              <span className={isCritical ? 'text-rose-600 font-bold' : ''}>
                                • Exp: {item.expiryDate.slice(0, 10)}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    <button
                      onClick={() => handleDismiss(item.id)}
                      className="text-slate-400 hover:text-slate-600 p-1 shrink-0"
                      title={language === 'am' ? 'አስወግድ' : 'Dismiss'}
                    >
                      <X size={13} />
                    </button>
                  </div>

                  {/* Actions Toolbar */}
                  <div className="flex items-center justify-between pt-2 border-t border-black/5 dark:border-white/5 text-[11px] flex-wrap gap-1">
                    <div className="flex items-center gap-1.5">
                      {!item.isRead && (
                        <button
                          type="button"
                          onClick={() => handleMarkAsRead(item.id)}
                          className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 text-slate-700 dark:text-slate-300 font-bold flex items-center gap-1"
                        >
                          <CheckCircle2 size={11} className="text-emerald-600" />
                          <span>{language === 'am' ? 'እንደተነበበ ምልክት አድርግ' : 'Read'}</span>
                        </button>
                      )}

                      {/* Snooze 7d */}
                      <button
                        type="button"
                        onClick={() => handleSnooze(item.id, 7)}
                        className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 text-slate-700 dark:text-slate-300 font-bold flex items-center gap-1"
                      >
                        <Clock size={11} className="text-amber-500" />
                        <span>{language === 'am' ? 'በ7 ቀን አስታውሰኝ' : 'Snooze 7d'}</span>
                      </button>
                    </div>

                    <div className="flex items-center gap-1">
                      {item.type === 'EXPIRY' && (
                        <button
                          type="button"
                          onClick={() => {
                            onNavigate('stock');
                            onClose();
                          }}
                          className="px-2 py-0.5 rounded-md bg-primary text-white font-bold flex items-center gap-1"
                        >
                          <span>{language === 'am' ? 'እርምጃ ውሰድ' : 'Take Action'}</span>
                          <ArrowRight size={11} />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="p-3 bg-slate-50 dark:bg-slate-800/60 border-t border-slate-200 dark:border-slate-700 text-[11px] text-slate-400 flex items-center justify-between">
          <span>{language === 'am' ? 'የቅርንጫፍ ስርዓት ጥበቃ' : 'Branch LAN Guardian'}</span>
          <button
            onClick={fetchAlerts}
            className="font-bold text-gebeya-600 hover:underline flex items-center gap-1"
          >
            <RefreshCw size={11} /> {t('common.refresh') || 'Refresh'}
          </button>
        </div>
      </div>
    </div>
  );
};
