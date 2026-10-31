import React from 'react';
import { PauseCircle, PlayCircle, Trash2, Clock, ShoppingCart } from 'lucide-react';
import { useI18n } from '../../i18n/I18nContext';
import { Drawer, Button, EmptyState } from '../ui';
import { HeldBasketRecord } from '@gebeyaos/shared-types';

export interface HeldBasketsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  baskets: HeldBasketRecord[];
  onResume: (basket: HeldBasketRecord) => Promise<void>;
  onDelete: (basketId: string) => Promise<void>;
}

export const HeldBasketsDrawer: React.FC<HeldBasketsDrawerProps> = ({
  isOpen,
  onClose,
  baskets,
  onResume,
  onDelete,
}) => {
  const { t, formatCurrency } = useI18n();

  return (
    <Drawer
      isOpen={isOpen}
      onClose={onClose}
      title={`${t('heldBasketsDrawerTitle')} (${baskets.length})`}
      width="md"
    >
      <div className="flex flex-col h-full divide-y divide-border-subtle">
        {baskets.length === 0 ? (
          <EmptyState
            title={t('noHeldBaskets')}
            subtitle="Hold a customer cart anytime with F6 to serve another shopper"
          />
        ) : (
          baskets.map((basket) => {
            const itemCount = basket.items.reduce((sum, item) => sum + item.quantity, 0);
            const timeStr = new Date(basket.heldAt).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            });

            return (
              <div
                key={basket.id}
                className="p-4 flex flex-col gap-3 hover:bg-surface-2/40 transition-colors duration-fast"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <h4 className="font-semibold text-text-main text-[15px] flex items-center gap-2">
                      <PauseCircle size={16} className="text-warning" />
                      {basket.customerIdentifier || 'Held Customer Cart'}
                    </h4>
                    <div className="flex items-center gap-3 text-xs text-text-muted mt-1">
                      <span className="flex items-center gap-1">
                        <Clock size={12} />
                        {timeStr}
                      </span>
                      <span className="flex items-center gap-1">
                        <ShoppingCart size={12} />
                        {itemCount} {t('items')}
                      </span>
                    </div>
                  </div>

                  <div className="text-right">
                    <span className="text-lg font-bold text-text-main font-mono tabular-nums block">
                      {formatCurrency(basket.grandTotal)}
                    </span>
                  </div>
                </div>

                {/* Items preview preview pills */}
                <div className="text-xs text-text-muted line-clamp-1 italic bg-surface-2 px-2.5 py-1.5 rounded-lg border border-border-subtle">
                  {basket.items.map((i) => `${i.quantity}x ${i.name}`).join(', ')}
                </div>

                {/* Action buttons */}
                <div className="flex items-center justify-end gap-2 pt-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onDelete(basket.id)}
                    className="text-danger hover:bg-danger-soft"
                  >
                    <Trash2 size={14} className="mr-1" />
                    {t('clearBasket')}
                  </Button>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => {
                      onResume(basket);
                      onClose();
                    }}
                  >
                    <PlayCircle size={14} className="mr-1" />
                    {t('resumeCartAction')}
                  </Button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </Drawer>
  );
};
