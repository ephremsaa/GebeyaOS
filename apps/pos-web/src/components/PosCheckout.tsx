import React, { useState, useEffect, useRef } from 'react';
import { Search, Scale, Sparkles } from 'lucide-react';
import { SAMPLE_PRODUCTS, SAMPLE_CATEGORIES, SampleProduct } from '../sample-data';
import {
  BarcodeParser,
  formatEscPosThermalReceipt,
  generateReceiptNumber,
} from '@gebeyaos/shared-types';
import { useI18n } from '../i18n/I18nContext';
import { Pill } from './ui/Pill';
import { Card } from './ui/Card';
import { BasketPanel } from './BasketPanel';
import { WeightModal } from './WeightModal';
import { PaymentModal, PaymentMethodType } from './PaymentModal';
import { ReceiptModal } from './ReceiptModal';
import { playScanBeep } from '../utils/sound';

export interface CartItem {
  product: SampleProduct;
  quantity: number;
  unitPrice: number;
  discount: number;
  lineTotal: number;
  isVat: boolean;
  scaleWeightGrams?: number;
}

export const PosCheckout: React.FC = () => {
  const { language, t, formatCurrency } = useI18n();
  const [cart, setCart] = useState<CartItem[]>([]);
  const [heldCart, setHeldCart] = useState<CartItem[] | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [recentlyAddedId, setRecentlyAddedId] = useState<string | null>(null);

  // Modals state
  const [weighedProduct, setWeighedProduct] = useState<SampleProduct | null>(null);
  const [isPaymentOpen, setIsPaymentOpen] = useState<boolean>(false);
  const [completedReceiptNo, setCompletedReceiptNo] = useState<string | null>(null);
  const [completedReceiptText, setCompletedReceiptText] = useState<string | null>(null);

  const searchInputRef = useRef<HTMLInputElement>(null);

  // Focus search input on mount and keep focused
  useEffect(() => {
    searchInputRef.current?.focus();
  }, []);

  // Global keyboard shortcuts (F2: search, F4: pay, F6: hold, Esc: close)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F2') {
        e.preventDefault();
        searchInputRef.current?.focus();
      } else if (e.key === 'F4') {
        e.preventDefault();
        if (cart.length > 0 && !isPaymentOpen) {
          setIsPaymentOpen(true);
        }
      } else if (e.key === 'F6') {
        e.preventDefault();
        if (cart.length > 0) {
          handleHoldBasket();
        } else if (heldCart) {
          handleResumeBasket();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [cart, heldCart, isPaymentOpen]);

  // Add Item to Cart with sound and visual feedback
  const addToCart = (product: SampleProduct, quantity: number = 1, scaleWeightGrams?: number) => {
    playScanBeep();
    setRecentlyAddedId(product.id);
    setTimeout(() => setRecentlyAddedId(null), 400);

    setCart((prev) => {
      // If scale item, always add as discrete line
      if (scaleWeightGrams) {
        return [
          ...prev,
          {
            product,
            quantity,
            unitPrice: product.price,
            discount: 0,
            lineTotal: Number((product.price * quantity).toFixed(2)),
            isVat: product.isVat,
            scaleWeightGrams,
          },
        ];
      }

      // If unit item, increment if already exists
      const existingIdx = prev.findIndex((i) => i.product.id === product.id && !i.scaleWeightGrams);
      if (existingIdx >= 0) {
        const copy = [...prev];
        const item = copy[existingIdx];
        const newQty = item.quantity + quantity;
        copy[existingIdx] = {
          ...item,
          quantity: newQty,
          lineTotal: Number((item.unitPrice * newQty).toFixed(2)),
        };
        return copy;
      }

      return [
        ...prev,
        {
          product,
          quantity,
          unitPrice: product.price,
          discount: 0,
          lineTotal: Number((product.price * quantity).toFixed(2)),
          isVat: product.isVat,
        },
      ];
    });
  };

  const handleProductCardClick = (product: SampleProduct) => {
    if (product.stockOnHand <= 0) return;

    if (product.isWeighed) {
      setWeighedProduct(product);
    } else {
      addToCart(product, 1);
    }
  };

  const handleBarcodeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const code = searchQuery.trim();
    if (!code) return;

    // Check for EAN-13 scale barcode (prefix 20 or 02)
    if (code.startsWith('20') || code.startsWith('02')) {
      const parsed = BarcodeParser.parse(code);
      if (parsed.isScaleBarcode && parsed.embeddedQuantity) {
        const matched =
          SAMPLE_PRODUCTS.find((p) => p.isWeighed && code.startsWith(p.barcode.slice(0, 4))) ||
          SAMPLE_PRODUCTS.find((p) => p.isWeighed);

        if (matched) {
          addToCart(matched, parsed.embeddedQuantity, parsed.embeddedQuantity * 1000);
          setSearchQuery('');
          return;
        }
      }
    }

    // Standard barcode or SKU match
    const found = SAMPLE_PRODUCTS.find(
      (p) =>
        p.barcode === code ||
        p.sku.toLowerCase() === code.toLowerCase() ||
        p.nameEn.toLowerCase() === code.toLowerCase()
    );

    if (found) {
      if (found.isWeighed) {
        setWeighedProduct(found);
      } else {
        addToCart(found, 1);
      }
      setSearchQuery('');
    } else {
      // Keep query in input for manual name filtering
    }
  };

  const handleUpdateQuantity = (index: number, newQty: number) => {
    if (newQty <= 0) {
      handleRemoveItem(index);
      return;
    }
    setCart((prev) => {
      const copy = [...prev];
      const item = copy[index];
      copy[index] = {
        ...item,
        quantity: newQty,
        lineTotal: Number((item.unitPrice * newQty).toFixed(2)),
      };
      return copy;
    });
  };

  const handleRemoveItem = (index: number) => {
    setCart((prev) => prev.filter((_, i) => i !== index));
  };

  const handleClearBasket = () => {
    setCart([]);
  };

  const handleHoldBasket = () => {
    if (cart.length === 0) return;
    setHeldCart([...cart]);
    setCart([]);
  };

  const handleResumeBasket = () => {
    if (!heldCart) return;
    setCart([...heldCart]);
    setHeldCart(null);
  };

  // Complete Sale & Fiscal Receipt Formatting
  const handleCompleteSale = (details: {
    method: PaymentMethodType;
    amountPaid: number;
    change: number;
    refCode?: string;
  }) => {
    const totalAmount = cart.reduce((sum, i) => sum + i.lineTotal, 0);
    const receiptNo = generateReceiptNumber('BOLE01', 'POS01', new Date(), 1, Math.floor(Math.random() * 8999 + 1000));
    setCompletedReceiptNo(receiptNo);

    // Format 80mm ESC/POS Thermal Receipt
    const receiptText = formatEscPosThermalReceipt({
      storeName: 'GebeyaOS Supermarket',
      storeTin: '0012345678',
      storeVatNumber: 'VAT-ET-9921',
      branchName: 'Bole Medhanialem',
      branchAddress: 'Cameroon St, Addis Ababa',
      branchPhone: '+251 11 661 2233',
      terminalCode: 'POS-01',
      cashierName: 'Bethlehem T.',
      receiptNumber: receiptNo,
      saleDate: new Date().toLocaleString(),
      items: cart.map((i) => ({
        name: language === 'am' && i.product.nameAm ? i.product.nameAm : i.product.nameEn,
        quantity: i.quantity,
        unitPrice: i.unitPrice,
        discount: 0,
        lineTotal: i.lineTotal,
        isVat: i.isVat,
      })),
      subtotal: totalAmount,
      discountTotal: 0,
      taxableSubtotal: totalAmount,
      vatAmount: totalAmount * (15 / 115),
      exemptSubtotal: 0,
      grandTotal: totalAmount,
      payments: [
        {
          method: details.method as any,
          amount: details.amountPaid,
          reference: details.refCode,
        },
      ],
      changeGiven: details.change,
      fiscalMrc: 'MOR-ET-2026-0081',
      fiscalReceiptNo: `FS-${receiptNo}`,
      fiscalSignature: 'SIG-ET-98234-VALID',
    });

    setCompletedReceiptText(receiptText);
  };

  const handleNewSale = () => {
    setCart([]);
    setIsPaymentOpen(false);
    setCompletedReceiptNo(null);
    setCompletedReceiptText(null);
    searchInputRef.current?.focus();
  };

  // Filtered Products
  const filteredProducts = SAMPLE_PRODUCTS.filter((prod) => {
    const matchesCategory =
      selectedCategory === 'ALL' ||
      (selectedCategory === 'FAVORITES' && ['prod-01', 'prod-02', 'prod-03', 'prod-06'].includes(prod.id)) ||
      prod.category === selectedCategory;

    const matchesSearch =
      !searchQuery ||
      prod.nameEn.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (prod.nameAm && prod.nameAm.includes(searchQuery)) ||
      prod.barcode.includes(searchQuery);

    return matchesCategory && matchesSearch;
  });

  return (
    <div className="flex-1 flex h-full overflow-hidden bg-slate-50 dark:bg-slate-950">
      {/* Product Catalog Area (Left) */}
      <div className="flex-1 flex flex-col p-4 sm:p-5 overflow-hidden">
        {/* Search Bar (Large, Always Focused with subtle F2 hint) */}
        <form onSubmit={handleBarcodeSubmit} className="relative mb-3 flex-shrink-0">
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('scanOrSearchPlaceholder')}
            className="w-full min-h-[54px] pl-12 pr-14 rounded-2xl bg-white dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white text-base font-medium shadow-xs focus:border-gebeya-500 dark:focus:border-gebeya-500 focus:outline-none transition-all placeholder:text-slate-400"
          />
          <Search
            size={22}
            className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
          />
          <kbd className="absolute right-4 top-1/2 -translate-y-1/2 hidden sm:inline-block px-2 py-0.5 text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-400 border border-slate-200 dark:border-slate-700 rounded-md">
            F2
          </kbd>
        </form>

        {/* Categories (Horizontally Scrollable Large Pills) */}
        <div className="flex items-center gap-2 overflow-x-auto pb-2 mb-3 flex-shrink-0 no-scrollbar">
          <Pill
            active={selectedCategory === 'ALL'}
            onClick={() => setSelectedCategory('ALL')}
          >
            {t('allCategories')}
          </Pill>
          <Pill
            active={selectedCategory === 'FAVORITES'}
            onClick={() => setSelectedCategory('FAVORITES')}
          >
            {t('favorites')}
          </Pill>
          {SAMPLE_CATEGORIES.filter((c) => c !== 'ALL').map((cat) => (
            <Pill
              key={cat}
              active={selectedCategory === cat}
              onClick={() => setSelectedCategory(cat)}
            >
              {cat}
            </Pill>
          ))}
        </div>

        {/* Product Cards Grid */}
        <div className="flex-1 overflow-y-auto pr-1">
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {filteredProducts.map((product) => {
              const productName = language === 'am' && product.nameAm ? product.nameAm : product.nameEn;
              const isOut = product.stockOnHand <= 0;
              const isLow = product.stockOnHand > 0 && product.stockOnHand <= product.minStock;
              const isRecentlyAdded = recentlyAddedId === product.id;

              return (
                <Card
                  key={product.id}
                  interactive={!isOut}
                  onClick={() => handleProductCardClick(product)}
                  className={`p-4 flex flex-col justify-between min-h-[130px] transition-all relative ${
                    isOut
                      ? 'opacity-40 cursor-not-allowed bg-slate-100 dark:bg-slate-800/40'
                      : isRecentlyAdded
                      ? 'ring-2 ring-gebeya-500 bg-gebeya-50/50 dark:bg-gebeya-950/40 scale-[0.98]'
                      : 'hover:shadow-md'
                  }`}
                >
                  {/* Top: Name & Badges */}
                  <div>
                    <div className="flex items-start justify-between gap-1.5 mb-1">
                      <h3 className="font-bold text-sm sm:text-base text-slate-900 dark:text-slate-100 line-clamp-2 leading-snug">
                        {productName}
                      </h3>
                      {product.isWeighed && (
                        <span className="flex-shrink-0 px-1.5 py-0.5 rounded-md bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 text-[11px] font-bold flex items-center gap-1">
                          <Scale size={11} />
                          {t('weighedBadge')}
                        </span>
                      )}
                    </div>

                    {/* Stock Alert (only low or out) */}
                    {isOut ? (
                      <span className="text-[11px] font-bold text-red-600 dark:text-red-400">
                        {t('outOfStock')}
                      </span>
                    ) : isLow ? (
                      <span className="text-[11px] font-semibold text-amber-600 dark:text-amber-400">
                        {t('lowStock')} ({product.stockOnHand})
                      </span>
                    ) : null}
                  </div>

                  {/* Bottom: Price in 20px+ bold */}
                  <div className="pt-2 flex items-baseline justify-between mt-auto">
                    <span className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white">
                      {formatCurrency(product.price)}
                    </span>
                    {product.isWeighed && (
                      <span className="text-xs text-slate-400 font-medium">/{t('weighedUnitKg')}</span>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        </div>
      </div>

      {/* Basket Panel (Right Side, Always Visible) */}
      <BasketPanel
        cart={cart}
        onUpdateQuantity={handleUpdateQuantity}
        onRemoveItem={handleRemoveItem}
        onClearBasket={handleClearBasket}
        onHoldBasket={handleHoldBasket}
        onResumeBasket={handleResumeBasket}
        hasHeldBasket={!!heldCart}
        onOpenPayment={() => setIsPaymentOpen(true)}
      />

      {/* Weighed Item Entry Modal */}
      <WeightModal
        isOpen={!!weighedProduct}
        onClose={() => setWeighedProduct(null)}
        product={weighedProduct}
        onConfirm={(prod, weightKg) => {
          addToCart(prod, weightKg, weightKg * 1000);
          setWeighedProduct(null);
        }}
      />

      {/* Payment & Change Modal */}
      <PaymentModal
        isOpen={isPaymentOpen}
        onClose={() => setIsPaymentOpen(false)}
        totalAmount={cart.reduce((sum, i) => sum + i.lineTotal, 0)}
        onCompleteSale={handleCompleteSale}
        onPrintReceipt={() => {
          // Open thermal preview
        }}
        onNewSale={handleNewSale}
        completedReceiptNo={completedReceiptNo}
      />

      {/* 80mm ESC/POS Thermal Receipt Modal (Optional preview when printing) */}
      {completedReceiptText && (
        <ReceiptModal
          receiptText={completedReceiptText}
          receiptNumber={completedReceiptNo || ''}
          onClose={() => setCompletedReceiptText(null)}
        />
      )}
    </div>
  );
};
