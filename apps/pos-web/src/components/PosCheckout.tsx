import React, { useState, useEffect, useRef } from 'react';
import { Scale, AlertTriangle, RefreshCw, Layers, PackageX, Sun, Camera } from 'lucide-react';
import {
  BarcodeParser,
  round2,
  generateUuidV7,
  HeldBasketRecord,
  Shift,
} from '@gebeyaos/shared-types';
import { useI18n } from '../i18n/I18nContext';
import { useAuth } from '../auth/AuthContext';
import { useShift } from '../context/ShiftContext';
import { Pill, SearchInput, SearchInputHandle, Button, EmptyState } from './ui';
import { CameraBarcodeScanner } from './ui/CameraBarcodeScanner';
import { BasketPanel } from './BasketPanel';
import { WeightModal } from './WeightModal';
import { PaymentModal, CompleteSaleDetails } from './PaymentModal';
import { ReceiptModal } from './ReceiptModal';
import { DayControlBar } from './DayControlBar';
import { DiscountModal } from './checkout/DiscountModal';
import { HeldBasketsDrawer } from './checkout/HeldBasketsDrawer';
import { RefundModal } from './checkout/RefundModal';
import { ExpiredItemBlockModal } from './checkout/ExpiredItemBlockModal';
import { posApi, PosCatalogItem } from '../utils/pos-api';
import { playScanBeep } from '../utils/sound';

export interface CartItem {
  product: PosCatalogItem;
  quantity: number;
  unitPrice: number;
  discount: number;
  lineTotal: number;
  isVat: boolean;
  scaleWeightGrams?: number;
  discountDetail?: {
    type: 'PERCENT' | 'FIXED';
    value: number;
    amount: number;
    authorizedBy?: string;
  };
}

export const PosCheckout: React.FC = () => {
  const { language, t, formatCurrency } = useI18n();
  const { currentUser } = useAuth();

  const {
    currentShift,
    isShiftOpen,
    isLoadingShift,
    terminalId,
    terminalCode,
    branchId,
  } = useShift();
  const cashierId = currentUser?.id || '01a19309-1e78-7e91-a0a7-56edac4beb90';
  const userRole = currentUser?.role || 'CASHIER';
  const [isStartDayRequested, setIsStartDayRequested] = useState<boolean>(false);

  // State: Cart & Held Baskets
  const [cart, setCart] = useState<CartItem[]>([]);
  const [heldBaskets, setHeldBaskets] = useState<HeldBasketRecord[]>([]);
  const [basketDiscount, setBasketDiscount] = useState<{
    type: 'PERCENT' | 'FIXED';
    value: number;
    amount: number;
    authorizedBy?: string;
  } | null>(null);

  // State: Catalog & Search
  const [catalog, setCatalog] = useState<PosCatalogItem[]>([]);
  const [isLoadingCatalog, setIsLoadingCatalog] = useState<boolean>(false);
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [recentlyAddedId, setRecentlyAddedId] = useState<string | null>(null);
  const [mobilePane, setMobilePane] = useState<'catalog' | 'basket'>('catalog');
  const [isCameraScannerOpen, setIsCameraScannerOpen] = useState<boolean>(false);

  // Modals state
  const [weighedProduct, setWeighedProduct] = useState<PosCatalogItem | null>(null);
  const [isPaymentOpen, setIsPaymentOpen] = useState<boolean>(false);
  const [isSubmittingPayment, setIsSubmittingPayment] = useState<boolean>(false);
  const [completedReceiptNo, setCompletedReceiptNo] = useState<string | null>(null);
  const [completedReceiptText, setCompletedReceiptText] = useState<string | null>(null);
  const [completedSaleId, setCompletedSaleId] = useState<string | null>(null);

  const [isHeldDrawerOpen, setIsHeldDrawerOpen] = useState<boolean>(false);
  const [isRefundModalOpen, setIsRefundModalOpen] = useState<boolean>(false);
  const [discountModalState, setDiscountModalState] = useState<{
    isOpen: boolean;
    mode: 'LINE' | 'BASKET';
    lineIndex?: number;
    title: string;
    grossAmount: number;
  }>({
    isOpen: false,
    mode: 'LINE',
    title: '',
    grossAmount: 0,
  });

  // Expired scanner block & Manager Override state
  const [blockedExpiredProduct, setBlockedExpiredProduct] = useState<PosCatalogItem | null>(null);
  const [overriddenProductIds, setOverriddenProductIds] = useState<Set<string>>(new Set());
  const [hasOverriddenExpiredItems, setHasOverriddenExpiredItems] = useState<boolean>(false);

  const searchInputRef = useRef<SearchInputHandle>(null);

  // Initial Data Load (Catalog & held baskets)
  const refreshCatalog = async () => {
    setIsLoadingCatalog(true);
    try {
      const [catalogItems, held] = await Promise.all([
        posApi.getCatalog(branchId),
        posApi.getHeldBaskets(branchId, terminalId),
      ]);
      setCatalog(catalogItems);
      setHeldBaskets(held);
    } catch (err) {
      console.error('Error loading checkout catalog:', err);
    } finally {
      setIsLoadingCatalog(false);
    }
  };

  useEffect(() => {
    refreshCatalog();
  }, [branchId, terminalId]);

  // Focus search input on mount and keep focused
  useEffect(() => {
    searchInputRef.current?.focus();
  }, [isShiftOpen, isPaymentOpen, isHeldDrawerOpen, isRefundModalOpen]);

  // Global keyboard shortcuts (F2: search, F4: pay, F6: hold/resume)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F2') {
        e.preventDefault();
        searchInputRef.current?.focus();
      } else if (e.key === 'F4') {
        e.preventDefault();
        if (!isShiftOpen) {
          setIsStartDayRequested(true);
          return;
        }
        if (cart.length > 0 && !isPaymentOpen) {
          setIsPaymentOpen(true);
        }
      } else if (e.key === 'F6') {
        e.preventDefault();
        if (cart.length > 0) {
          handleHoldBasket();
        } else if (heldBaskets.length > 0) {
          setIsHeldDrawerOpen(true);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [cart, heldBaskets, isPaymentOpen]);

  // Add Item to Cart with sound and visual feedback
  const addToCart = (
    product: PosCatalogItem,
    quantity: number = 1,
    scaleWeightGrams?: number,
    isOverride: boolean = false,
  ) => {
    if (!isShiftOpen) {
      setIsStartDayRequested(true);
      return;
    }
    if (product.isExpired && !overriddenProductIds.has(product.id) && !isOverride) {
      setBlockedExpiredProduct(product);
      return;
    }
    playScanBeep();
    setRecentlyAddedId(product.id);
    setTimeout(() => setRecentlyAddedId(null), 300);

    const price = product.effectivePrice ?? product.basePrice;

    setCart((prev) => {
      // If scale item, always add as discrete line
      if (scaleWeightGrams) {
        return [
          ...prev,
          {
            product,
            quantity: round2(quantity),
            unitPrice: price,
            discount: 0,
            lineTotal: round2(price * quantity),
            isVat: product.isVatApplicable,
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
        const rawGross = round2(item.unitPrice * newQty);
        const discount = item.discount || 0;
        copy[existingIdx] = {
          ...item,
          quantity: newQty,
          lineTotal: round2(Math.max(0, rawGross - discount)),
        };
        return copy;
      }

      return [
        ...prev,
        {
          product,
          quantity,
          unitPrice: price,
          discount: 0,
          lineTotal: round2(price * quantity),
          isVat: product.isVatApplicable,
        },
      ];
    });

    // Refocus search bar after instant add
    setTimeout(() => {
      searchInputRef.current?.focus();
    }, 50);
  };

  const handleProductCardClick = (product: PosCatalogItem) => {
    if (!isShiftOpen) {
      setIsStartDayRequested(true);
      return;
    }
    if (product.stockOnHand <= 0) return;
    if (product.isExpired && !overriddenProductIds.has(product.id)) {
      setBlockedExpiredProduct(product);
      return;
    }

    if (product.isWeighed) {
      setWeighedProduct(product);
    } else {
      addToCart(product, 1);
    }
  };

  const handleAuthorizeExpiredOverride = (product: PosCatalogItem, _reason: string) => {
    setOverriddenProductIds((prev) => new Set(prev).add(product.id));
    setHasOverriddenExpiredItems(true);
    setBlockedExpiredProduct(null);
    if (product.isWeighed) {
      setWeighedProduct(product);
    } else {
      addToCart(product, 1, undefined, true);
    }
  };

  const handleBarcodeSubmit = (overrideCode?: string) => {
    const code = (overrideCode ?? searchQuery).trim();
    if (!code) return;

    if (!isShiftOpen) {
      setIsStartDayRequested(true);
      return;
    }

    // Check for EAN-13 scale or price barcode (prefix 20, 02, 21)
    if (code.startsWith('20') || code.startsWith('02') || code.startsWith('21')) {
      const parsed = BarcodeParser.parse(code);
      if (parsed.isScaleBarcode && parsed.embeddedQuantity) {
        const matched =
          catalog.find((p) => p.isWeighed && code.startsWith(p.barcode.slice(0, 4))) ||
          catalog.find((p) => p.isWeighed);

        if (matched) {
          if (matched.isExpired && !overriddenProductIds.has(matched.id)) {
            setBlockedExpiredProduct(matched);
            setSearchQuery('');
            return;
          }
          addToCart(matched, parsed.embeddedQuantity, parsed.embeddedQuantity * 1000);
          setSearchQuery('');
          searchInputRef.current?.focus();
          return;
        }
      } else if (parsed.embeddedPrice) {
        const matched =
          catalog.find((p) => !p.isWeighed && code.startsWith(p.barcode.slice(0, 4))) ||
          catalog.find((p) => p.barcode === code);
        if (matched) {
          if (matched.isExpired && !overriddenProductIds.has(matched.id)) {
            setBlockedExpiredProduct(matched);
            setSearchQuery('');
            return;
          }
          const price = matched.effectivePrice ?? matched.basePrice;
          const qty = price > 0 ? round2(parsed.embeddedPrice / price) : 1;
          addToCart(matched, qty);
          setSearchQuery('');
          searchInputRef.current?.focus();
          return;
        }
      }
    }

    // Standard barcode or SKU match
    const found = catalog.find(
      (p) =>
        p.barcode === code ||
        p.sku.toLowerCase() === code.toLowerCase() ||
        p.nameEn.toLowerCase() === code.toLowerCase(),
    );

    if (found) {
      if (found.isExpired && !overriddenProductIds.has(found.id)) {
        setBlockedExpiredProduct(found);
        setSearchQuery('');
        return;
      }
      if (found.isWeighed) {
        setWeighedProduct(found);
      } else {
        addToCart(found, 1);
      }
      setSearchQuery('');
      searchInputRef.current?.focus();
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
      const rawGross = round2(item.unitPrice * newQty);
      const discount = item.discount || 0;
      copy[index] = {
        ...item,
        quantity: newQty,
        lineTotal: round2(Math.max(0, rawGross - discount)),
      };
      return copy;
    });
  };

  const handleRemoveItem = (index: number) => {
    setCart((prev) => prev.filter((_, i) => i !== index));
  };

  const handleClearBasket = () => {
    setCart([]);
    setBasketDiscount(null);
    searchInputRef.current?.focus();
  };

  // Hold basket persisted to DB
  const handleHoldBasket = async () => {
    if (cart.length === 0) return;
    try {
      const grossSub = round2(cart.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0));
      const lineDiscs = round2(cart.reduce((sum, item) => sum + (item.discount || 0), 0));
      const netSub = round2(grossSub - lineDiscs);
      const taxTot = round2(
        cart.reduce((sum, item) => {
          return item.isVat ? sum + (item.lineTotal * 15 / 115) : sum;
        }, 0),
      );
      const defaultRef = `Shopper #${heldBaskets.length + 1} (${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})`;

      const held = await posApi.holdBasket(branchId, cashierId, {
        terminalId,
        customerIdentifier: defaultRef,
        items: cart.map((i) => ({
          productId: i.product.id,
          name: language === 'am' && i.product.nameAm ? i.product.nameAm : i.product.nameEn,
          barcode: i.product.barcode,
          quantity: i.quantity,
          unitPrice: i.unitPrice,
          discount: i.discount || 0,
          lineTotal: i.lineTotal,
          isVat: i.isVat,
          scaleWeightGrams: i.scaleWeightGrams,
        })),
        subtotal: netSub,
        taxTotal: taxTot,
        grandTotal: netSub,
      });

      setHeldBaskets((prev) => [held, ...prev]);
      setCart([]);
      setBasketDiscount(null);
    } catch (err: any) {
      console.error('Failed to hold basket:', err);
    } finally {
      searchInputRef.current?.focus();
    }
  };

  // Resume basket from DB
  const handleResumeBasket = async (basket: HeldBasketRecord) => {
    try {
      await posApi.resumeHeldBasket(branchId, basket.id);
      const resumedCart: CartItem[] = basket.items.map((it: any) => {
        const prod = catalog.find((p) => p.id === it.productId) || {
          id: it.productId,
          sku: 'RESUMED',
          nameEn: it.productName || 'Resumed Item',
          basePrice: it.unitPrice,
          effectivePrice: it.unitPrice,
          isPriceOverridden: false,
          costPrice: 0,
          isVatApplicable: it.isVatApplicable ?? true,
          vatRate: 0.15,
          isWeighed: !!it.scaleWeightGrams,
          minStockLevel: 0,
          allowDiscount: true,
          barcode: '',
          stockOnHand: 100,
        };

        const rawGross = round2(it.unitPrice * it.quantity);
        const disc = it.discountAmount || 0;

        return {
          product: prod,
          quantity: it.quantity,
          unitPrice: it.unitPrice,
          discount: disc,
          lineTotal: round2(Math.max(0, rawGross - disc)),
          isVat: it.isVatApplicable ?? true,
          scaleWeightGrams: it.scaleWeightGrams,
        };
      });

      setCart(resumedCart);
      setHeldBaskets((prev) => prev.filter((b) => b.id !== basket.id));
      setIsHeldDrawerOpen(false);
    } catch (err: any) {
      console.error('Failed to resume held basket:', err);
    } finally {
      searchInputRef.current?.focus();
    }
  };

  const handleDeleteHeldBasket = async (basketId: string) => {
    try {
      await fetch(`/api/pos/baskets/${encodeURIComponent(basketId)}`, {
        method: 'DELETE',
        headers: { 'x-branch-id': branchId },
      });
      setHeldBaskets((prev) => prev.filter((b) => b.id !== basketId));
    } catch (err: any) {
      console.error('Failed to delete held basket:', err);
    }
  };


  // Discount Handlers
  const handleOpenLineDiscount = (index: number) => {
    const item = cart[index];
    const name = language === 'am' && item.product.nameAm ? item.product.nameAm : item.product.nameEn;
    const gross = round2(item.unitPrice * item.quantity);
    setDiscountModalState({
      isOpen: true,
      mode: 'LINE',
      lineIndex: index,
      title: `${t('lineDiscount')}: ${name}`,
      grossAmount: gross,
    });
  };

  const handleOpenBasketDiscount = () => {
    const gross = round2(cart.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0));
    setDiscountModalState({
      isOpen: true,
      mode: 'BASKET',
      title: t('basketDiscount'),
      grossAmount: gross,
    });
  };

  const handleApplyDiscount = (discountAmount: number, reason: string, authorizedBy?: string) => {
    if (discountModalState.mode === 'LINE' && discountModalState.lineIndex !== undefined) {
      const idx = discountModalState.lineIndex;
      setCart((prev) => {
        const copy = [...prev];
        const item = copy[idx];
        const rawGross = round2(item.unitPrice * item.quantity);
        const disc = round2(Math.min(discountAmount, rawGross));
        copy[idx] = {
          ...item,
          discount: disc,
          lineTotal: round2(Math.max(0, rawGross - disc)),
          discountDetail: {
            type: 'FIXED',
            value: disc,
            amount: disc,
            authorizedBy,
          },
        };
        return copy;
      });
    } else if (discountModalState.mode === 'BASKET') {
      setBasketDiscount({
        type: 'FIXED',
        value: discountAmount,
        amount: round2(discountAmount),
        authorizedBy,
      });
    }

    setDiscountModalState((prev) => ({ ...prev, isOpen: false }));
  };

  // Complete Sale & Fiscal Receipt Formatting
  const handleCompleteSale = async (details: CompleteSaleDetails) => {
    if (cart.length === 0 || isSubmittingPayment) return;

    setIsSubmittingPayment(true);
    try {
      const idempotencyKey = generateUuidV7();
      const lineDiscountsTotal = round2(cart.reduce((sum, item) => sum + (item.discount || 0), 0));
      const basketDiscountAmt = round2(basketDiscount ? basketDiscount.amount : 0);
      const totalDiscounts = round2(lineDiscountsTotal + basketDiscountAmt);

      const saleItems = cart.map((i) => ({
        productId: i.product.id,
        quantity: i.quantity,
        unitPrice: i.unitPrice,
        discountAmount: i.discount || 0,
        isVatApplicable: i.isVat,
      }));

      const salePayments = details.payments.map((p) => ({
        paymentMethod: p.method === 'CARD' ? 'CARD_POS' : p.method,
        method: p.method === 'CARD' ? 'CARD_POS' : p.method,
        amount: p.amount,
        providerReference: p.reference,
        reference: p.reference,
      }));

      const payload = {
        branchId,
        terminalId,
        shiftId: currentShift?.id || '018e0000-0000-7000-8000-000000000050',
        idempotencyKey,
        managerOverrideExpired: hasOverriddenExpiredItems || cart.some((i) => i.product.isExpired),
        discountTotal: totalDiscounts,
        items: saleItems,
        lines: saleItems,
        payments: salePayments,
      };

      const result = await posApi.checkoutSale(branchId, cashierId, payload);
      setCompletedReceiptNo(result.sale.receiptNumber);
      setCompletedReceiptText(result.thermalReceipt);
      setCompletedSaleId(result.sale.id);
      setIsPaymentOpen(false);

      // Notify dashboard and reports that a new sale was completed
      try {
        window.dispatchEvent(new CustomEvent('gebeyaos:sale-completed', { detail: { saleId: result.sale.id } }));
      } catch { }

      // Refresh inventory levels in the background
      posApi.getCatalog(branchId).then(setCatalog).catch(() => { });
    } catch (err: any) {
      alert(err.message || 'Checkout failed. Please check shift status or negative stock rule.');
    } finally {
      setIsSubmittingPayment(false);
    }
  };

  const handleReprintReceipt = async (saleId: string, reason: string): Promise<string> => {
    const res = await posApi.reprintReceipt(branchId, cashierId, saleId, reason);
    return res.thermalReceipt;
  };

  const handleNewSale = () => {
    setCart([]);
    setBasketDiscount(null);
    setIsPaymentOpen(false);
    setCompletedReceiptNo(null);
    setCompletedReceiptText(null);
    setCompletedSaleId(null);
    setHasOverriddenExpiredItems(false);
    setOverriddenProductIds(new Set());
    searchInputRef.current?.focus();
  };

  // Filtered Products
  const filteredProducts = catalog.filter((prod) => {
    const matchesCategory =
      selectedCategory === 'ALL' ||
      (selectedCategory === 'FAVORITES' && ['prod-01', 'prod-02', 'prod-03', 'prod-06'].includes(prod.id)) ||
      prod.categoryId === selectedCategory ||
      prod.categoryNameEn === selectedCategory;

    const matchesSearch =
      !searchQuery ||
      prod.nameEn.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (prod.nameAm && prod.nameAm.includes(searchQuery)) ||
      prod.barcode.includes(searchQuery) ||
      prod.sku.toLowerCase().includes(searchQuery.toLowerCase());

    return matchesCategory && matchesSearch;
  });

  // Calculate distinct categories from catalog
  const distinctCategories = Array.from(
    new Set(catalog.map((c) => c.categoryNameEn || c.categoryId).filter(Boolean)),
  ) as string[];

  const cartGross = round2(cart.reduce((sum, item) => sum + item.lineTotal, 0));
  const finalCartTotal = Math.max(0, round2(cartGross - (basketDiscount?.amount || 0)));

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-page text-text-main relative">
      {/* Sales Header: Day Control Strip (Start Day / End Day / 24h warning) */}
      <DayControlBar
        onDayStarted={refreshCatalog}
        openStartRequested={isStartDayRequested}
        onStartRequestedHandled={() => setIsStartDayRequested(false)}
      />

      {/* Mobile Catalog / Basket Switcher */}
      <div className="lg:hidden px-3 py-2 bg-surface border-b border-border-subtle flex items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={() => setMobilePane('catalog')}
          className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer ${mobilePane === 'catalog'
            ? 'bg-primary text-white shadow-soft'
            : 'bg-surface-2 text-text-muted'
            }`}
        >
          {t('common.itemsTab') || 'Products'}
        </button>
        <button
          type="button"
          onClick={() => setMobilePane('basket')}
          className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${mobilePane === 'basket'
            ? 'bg-primary text-white shadow-soft'
            : 'bg-surface-2 text-text-muted'
            }`}
        >
          <span>Basket ({cart.reduce((s, i) => s + (Number.isInteger(i.quantity) ? i.quantity : 1), 0)})</span>
          {finalCartTotal > 0 && (
            <span className="font-mono">• {formatCurrency(finalCartTotal)}</span>
          )}
        </button>
      </div>

      {/* Main Workspace (Left Products + Right Basket) */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* 1. Left (flexible): Search field 52px, Category pills 44px, Product Grid */}
        <div className={`flex-1 flex-col p-3 sm:p-6 overflow-hidden min-w-0 ${mobilePane === 'catalog' ? 'flex' : 'hidden lg:flex'}`}>
          {/* Friendly Start your day banner if shift is not started */}
          {!isShiftOpen && !isLoadingShift && (
            <div className="mb-4 p-4 rounded-2xl bg-primary-soft/30 border border-primary/25 flex items-center justify-between shadow-soft flex-shrink-0 animate-in fade-in">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary text-white flex items-center justify-center flex-shrink-0">
                  <Sun size={20} />
                </div>
                <div>
                  <h4 className="font-bold text-sm text-text-main">{t('checkout.startDayCardTitle')}</h4>
                  <p className="text-xs text-text-muted mt-0.5">{t('checkout.startDayCardDesc')}</p>
                </div>
              </div>
              <Button
                variant="primary"
                size="md"
                onClick={() => setIsStartDayRequested(true)}
                className="font-bold shrink-0"
              >
                <Sun size={15} className="mr-1.5" />
                {t('checkout.startDay')}
              </Button>
            </div>
          )}

          {/* Search Field (52px high, search icon, F2 hint, clear button) */}
          <div className="mb-3.5 flex-shrink-0 flex items-center gap-3">
            <div className="flex-1">
              <SearchInput
                ref={searchInputRef}
                value={searchQuery}
                onValueChange={setSearchQuery}
                onSearchSubmit={() => handleBarcodeSubmit()}
                placeholder={t('scanOrSearchPlaceholder')}
                shortcut="F2"
                size="lg"
              />
            </div>
          <button
            type="button"
            onClick={() => setIsCameraScannerOpen(true)}
            className="h-[52px] px-3.5 rounded-xl border border-primary/30 bg-primary-soft/60 hover:bg-primary-soft text-primary transition-colors flex items-center justify-center gap-1.5 cursor-pointer shadow-soft shrink-0"
            title="Scan Barcode with Camera"
            aria-label="Scan Barcode with Camera"
          >
            <Camera size={18} />
            <span className="hidden sm:inline text-xs font-bold">Scan</span>
          </button>
          <button
            type="button"
            onClick={refreshCatalog}
            disabled={isLoadingCatalog}
            className="h-[52px] px-3.5 rounded-xl border border-border-subtle bg-surface hover:bg-surface-2 text-text-muted hover:text-text-main transition-colors flex items-center justify-center cursor-pointer shadow-soft"
            title="Refresh Catalog"
            aria-label="Refresh"
          >
            <RefreshCw size={18} className={isLoadingCatalog ? 'animate-spin text-primary' : ''} />
          </button>
        </div>

          {/* Category Pills (44px, horizontally scrollable) */}
          {distinctCategories.length > 0 && (
            <div className="flex items-center gap-2 overflow-x-auto pb-2 mb-3.5 flex-shrink-0 no-scrollbar select-none">
              <Pill
                active={selectedCategory === 'ALL'}
                onClick={() => setSelectedCategory('ALL')}
              >
                {language === 'am' ? 'ሁሉ' : 'All'}
              </Pill>
              <Pill
                active={selectedCategory === 'FAVORITES'}
                onClick={() => setSelectedCategory('FAVORITES')}
              >
                {language === 'am' ? '⭐ ተወዳጆች' : '⭐ Favorites'}
              </Pill>
              {distinctCategories.map((cat) => (
                <Pill
                  key={cat}
                  active={selectedCategory === cat}
                  onClick={() => setSelectedCategory(cat)}
                >
                  {cat}
                </Pill>
              ))}
            </div>
          )}

          {/* Product Grid: auto-fill minmax(180px, 1fr), gap 12px (gap-3) */}
          <div className="flex-1 overflow-y-auto pr-1">
            {isLoadingCatalog && catalog.length === 0 ? (
              <div className="h-full flex items-center justify-center text-text-muted">
                <RefreshCw size={28} className="animate-spin text-primary mr-2" />
                <span>{t('checkout.loadingCatalog')}</span>
              </div>
            ) : filteredProducts.length === 0 ? (
              <div className="h-full flex items-center justify-center">
                <EmptyState
                  icon={<PackageX size={36} className="text-text-muted" />}
                  title={language === 'am' ? 'ምንም ምርቶች አልተገኙም' : 'No products found'}
                  subtitle={
                    searchQuery
                      ? (language === 'am' ? 'ለፍለጋዎ የሚዛመድ ምርት የለም።' : `No product matches "${searchQuery}".`)
                      : (language === 'am' ? 'በዚህ ቅርንጫፍ እስካሁን የተመዘገበ ምርት የለም። እባክዎ ካታሎግ ውስጥ ምርት ያስገቡ።' : 'No products exist in this branch catalog yet. Add products to get started.')
                  }
                />
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-[repeat(auto-fill,minmax(175px,1fr))] gap-2.5 sm:gap-3">
                {filteredProducts.map((product) => {
                  const productName = language === 'am' && product.nameAm ? product.nameAm : product.nameEn;
                  const isOut = product.stockOnHand <= 0;
                  const isLow = product.stockOnHand > 0 && product.stockOnHand <= product.minStockLevel;
                  const isRecentlyAdded = recentlyAddedId === product.id;
                  const price = product.effectivePrice ?? product.basePrice;

                  return (
                    <div
                      key={product.id}
                      data-testid="product-card"
                      data-product-out={isOut}
                      onClick={() => !isOut && handleProductCardClick(product)}
                      className={`bg-surface border border-border-subtle rounded-xl min-h-[108px] p-3.5 flex flex-col justify-between transition-all duration-fast shadow-soft select-none ${isOut
                        ? 'opacity-40 cursor-not-allowed bg-surface-2/60 pointer-events-none'
                        : isRecentlyAdded
                          ? 'border-primary ring-2 ring-primary/25 bg-primary-soft/30 scale-[0.98]'
                          : 'cursor-pointer hover:border-border-strong hover:shadow-md active:scale-[0.98]'
                        }`}
                    >
                      {/* Top Details */}
                      <div>
                        <div className="flex items-start justify-between gap-1.5 mb-1.5">
                          <h3 className="font-semibold text-[14px] text-text-main line-clamp-2 leading-snug">
                            {productName}
                          </h3>
                          {product.isWeighed && (
                            <span className="flex-shrink-0 px-1.5 py-0.5 rounded-full bg-warning-soft text-warning text-[11px] font-semibold flex items-center gap-1 select-none">
                              <Scale size={11} strokeWidth={1.75} />
                              {t('weighedBadge')}
                            </span>
                          )}
                        </div>

                        {/* Stock Badge */}
                        {isOut ? (
                          <span className="text-[12px] font-medium text-danger">
                            {t('outOfStock')}
                          </span>
                        ) : isLow ? (
                          <span className="inline-flex items-center gap-1 text-[12px] font-medium text-warning">
                            <AlertTriangle size={12} strokeWidth={1.75} />
                            {t('lowStock')} ({product.stockOnHand})
                          </span>
                        ) : null}
                      </div>

                      {/* Bottom Price */}
                      <div className="pt-2 flex items-baseline justify-between mt-auto">
                        <div className="flex items-baseline gap-1">
                          <span className="text-[20px] font-semibold text-text-main tabular-nums font-mono leading-none">
                            {formatCurrency(price)}
                          </span>
                          {product.isPriceOverridden && (
                            <span className="text-[10px] font-semibold text-primary px-1 py-0.2 bg-primary-soft rounded">
                              Branch
                            </span>
                          )}
                        </div>
                        {product.isWeighed && (
                          <span className="text-xs text-text-muted font-normal">/{t('weighedUnitKg')}</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* 2. Right (380px, surface, left border): Basket Panel */}
        <div className={`${mobilePane === 'basket' ? 'flex w-full lg:w-auto' : 'hidden lg:flex'} h-full overflow-hidden`}>
          <BasketPanel
            cart={cart}
            onUpdateQuantity={handleUpdateQuantity}
            onRemoveItem={handleRemoveItem}
            onClearBasket={handleClearBasket}
            onHoldBasket={handleHoldBasket}
            onResumeBasket={() => {
              if (heldBaskets.length === 1) {
                handleResumeBasket(heldBaskets[0]);
              } else {
                setIsHeldDrawerOpen(true);
              }
            }}
            hasHeldBasket={heldBaskets.length > 0}
            heldBasketsCount={heldBaskets.length}
            onOpenHeldBaskets={() => setIsHeldDrawerOpen(true)}
            onOpenPayment={() => {
              if (!isShiftOpen) {
                setIsStartDayRequested(true);
                return;
              }
              setIsPaymentOpen(true);
            }}
            onOpenLineDiscount={handleOpenLineDiscount}
            onOpenBasketDiscount={handleOpenBasketDiscount}
            onOpenRefund={() => setIsRefundModalOpen(true)}
            basketDiscount={basketDiscount}
          />
        </div>
      </div>

      {/* 3. Weight Entry Modal for scale items */}
      <WeightModal
        isOpen={!!weighedProduct}
        onClose={() => setWeighedProduct(null)}
        product={weighedProduct as any}
        onConfirm={(prod, weightKg) => {
          addToCart(prod as any, weightKg, weightKg * 1000);
          setWeighedProduct(null);
        }}
      />

      {/* 4. Payment Modal with Multi-Tender & Split Options */}
      <PaymentModal
        isOpen={isPaymentOpen}
        onClose={() => setIsPaymentOpen(false)}
        totalAmount={finalCartTotal}
        onCompleteSale={handleCompleteSale}
        onPrintReceipt={() => {
          // Open thermal receipt modal
        }}
        onNewSale={handleNewSale}
        completedReceiptNo={completedReceiptNo}
        isSubmitting={isSubmittingPayment}
      />

      {/* 5. 80mm ESC/POS Thermal Receipt Modal with Audited Reprint */}
      {completedReceiptText && (
        <ReceiptModal
          receiptText={completedReceiptText}
          receiptNumber={completedReceiptNo || ''}
          saleId={completedSaleId || undefined}
          onClose={() => {
            setCompletedReceiptText(null);
            handleNewSale();
          }}
          onReprint={handleReprintReceipt}
        />
      )}

      {/* 7. Line & Basket Discount Modal */}
      <DiscountModal
        isOpen={discountModalState.isOpen}
        onClose={() => setDiscountModalState((prev) => ({ ...prev, isOpen: false }))}
        title={discountModalState.title}
        grossAmount={discountModalState.grossAmount}
        userRole={userRole}
        branchId={branchId}
        onApplyDiscount={handleApplyDiscount}
      />

      {/* 8. Persistent Held Baskets Drawer */}
      <HeldBasketsDrawer
        isOpen={isHeldDrawerOpen}
        onClose={() => setIsHeldDrawerOpen(false)}
        baskets={heldBaskets}
        onResume={handleResumeBasket}
        onDelete={handleDeleteHeldBasket}
      />

      {/* 9. Refund Modal with Supervisor PIN */}
      <RefundModal
        isOpen={isRefundModalOpen}
        onClose={() => setIsRefundModalOpen(false)}
        branchId={branchId}
        cashierId={cashierId}
        currentShiftId={currentShift?.id || '018e0000-0000-7000-8000-000000000050'}
      />

      {/* 10. Expired Item Scanner Block Modal with Manager Override */}
      <ExpiredItemBlockModal
        isOpen={!!blockedExpiredProduct}
        product={blockedExpiredProduct}
        branchId={branchId}
        onClose={() => setBlockedExpiredProduct(null)}
        onAuthorizeOverride={handleAuthorizeExpiredOverride}
      />

      {/* 11. Phone Camera Barcode Scanner */}
      <CameraBarcodeScanner
        isOpen={isCameraScannerOpen}
        onClose={() => setIsCameraScannerOpen(false)}
        onDetected={(code) => handleBarcodeSubmit(code)}
        title="Scan Item to Basket"
      />
    </div>
  );
};
