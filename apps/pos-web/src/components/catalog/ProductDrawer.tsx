import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  X,
  Barcode,
  Sparkles,
  Tag,
  Scale,
  Percent,
  AlertTriangle,
  Check,
  Plus,
  Layers,
  Image as ImageIcon,
  DollarSign,
  Package,
  AlertCircle,
  RefreshCw,
  Archive,
  Clock,
  Lock,
  History,
} from 'lucide-react';
import { useI18n } from '../../i18n/I18nContext';
import { useAuth } from '../../auth/AuthContext';
import { posApi } from '../../utils/pos-api';
import { generateInternalEan13, generateInternalCode128 } from '../../utils/code128Svg';
import { calculateItemVatBreakdown } from '@gebeyaos/shared-types';
import { PriceHistoryModal } from './PriceHistoryModal';

export interface ProductDrawerData {
  id?: string;
  sku: string;
  name_en: string;
  name_am?: string | null;
  category_id: string;
  uom_code: string;
  base_price: number;
  cost_price: number;
  branch_override_price?: number | null;
  is_vat_applicable: boolean;
  vat_rate: number;
  is_weighed: boolean;
  scale_plu?: string | null;
  min_stock_level: number;
  max_stock_level?: number | null;
  allow_discount: boolean;
  is_active: boolean;
  barcode: string;
  pack_multiplier?: number;
  image_url?: string;
  stock_on_hand?: number;
  has_expiry_date?: boolean;
}

interface ProductDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  product?: ProductDrawerData | null;
  categories: Array<{ id: string; code: string; name_en: string; name_am?: string | null }>;
  uoms: Array<{ code: string; name_en: string }>;
  onSaved: (savedProduct: any) => void;
  onOpenCategoryManager: () => void;
}

export const ProductDrawer: React.FC<ProductDrawerProps> = ({
  isOpen,
  onClose,
  product,
  categories,
  uoms,
  onSaved,
  onOpenCategoryManager,
}) => {
  const { language, t, formatCurrency } = useI18n();
  const { hasPermission, currentUser } = useAuth();
  const isEdit = Boolean(product?.id);

  // Form State
  const [sku, setSku] = useState('');
  const [nameEn, setNameEn] = useState('');
  const [nameAm, setNameAm] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [uomCode, setUomCode] = useState('PCS');
  const [packMultiplier, setPackMultiplier] = useState<number>(1);
  const [basePrice, setBasePrice] = useState<number>(0);
  const [costPrice, setCostPrice] = useState<number>(0);
  const [branchOverridePrice, setBranchOverridePrice] = useState<string>('');
  const [isVatApplicable, setIsVatApplicable] = useState(true);
  const [vatRate, setVatRate] = useState(0.15);
  const [isWeighed, setIsWeighed] = useState(false);
  const [scalePlu, setScalePlu] = useState('');
  const [minStockLevel, setMinStockLevel] = useState(5);
  const [maxStockLevel, setMaxStockLevel] = useState(50);
  const [allowDiscount, setAllowDiscount] = useState(true);
  const [isActive, setIsActive] = useState(true);
  const [barcode, setBarcode] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [hasExpiryDate, setHasExpiryDate] = useState<boolean>(false);
  const [priceChangeReason, setPriceChangeReason] = useState('');

  // Duplicate Barcode Warning Inline state
  const [barcodeChecking, setBarcodeChecking] = useState(false);
  const [duplicateWarning, setDuplicateWarning] = useState<{
    exists: boolean;
    productName?: string;
    productSku?: string;
  } | null>(null);

  // Stock Warning on Archive
  const [stockOnHand, setStockOnHand] = useState<number>(0);

  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);

  const barcodeInputRef = useRef<HTMLInputElement>(null);

  const [priceIncludesVat, setPriceIncludesVat] = useState<boolean>(true);
  const [isPriceHistoryOpen, setIsPriceHistoryOpen] = useState<boolean>(false);

  const canChangePrice =
    currentUser?.role === 'OWNER' ||
    currentUser?.role === 'STORE_OWNER' ||
    currentUser?.role === 'BRANCH_MANAGER' ||
    currentUser?.role === 'HQ_ADMIN' ||
    hasPermission('pricing.override') ||
    hasPermission('pos.override_price');

  // Live Bidirectional VAT and Profit Margin Calculation (Part 3)
  const vatBreakdown = useMemo(() => {
    return calculateItemVatBreakdown({
      typedPrice: basePrice,
      priceIncludesVat,
      isVatApplicable,
      vatRate: isVatApplicable ? vatRate : 0,
      costPrice,
    });
  }, [basePrice, priceIncludesVat, isVatApplicable, vatRate, costPrice]);

  // Initialize or reset form
  useEffect(() => {
    if (!isOpen) return;

    if (product) {
      setSku(product.sku);
      setNameEn(product.name_en);
      setNameAm(product.name_am || '');
      setCategoryId(product.category_id || categories[0]?.id || '');
      setUomCode(product.uom_code || 'PCS');
      setPackMultiplier(product.pack_multiplier || 1);
      setBasePrice(Number(product.base_price) || 0);
      setCostPrice(Number(product.cost_price) || 0);
      setBranchOverridePrice(
        product.branch_override_price !== undefined && product.branch_override_price !== null
          ? String(product.branch_override_price)
          : '',
      );
      setIsVatApplicable(product.is_vat_applicable);
      setVatRate(Number(product.vat_rate) || 0.15);
      setIsWeighed(product.is_weighed);
      setScalePlu(product.scale_plu || '');
      setMinStockLevel(Number(product.min_stock_level) || 0);
      setMaxStockLevel(Number(product.max_stock_level) || 50);
      setAllowDiscount(product.allow_discount);
      setIsActive(product.is_active);
      setBarcode(product.barcode || '');
      setImageUrl(product.image_url || '');
      setHasExpiryDate(Boolean(product.has_expiry_date));
      setStockOnHand(Number(product.stock_on_hand) || 0);
      setPriceChangeReason('');
    } else {
      // Rapid Add Initializer (<30s)
      setSku(`SKU-${Date.now().toString().slice(-6)}`);
      setNameEn('');
      setNameAm('');
      setCategoryId(categories[0]?.id || '');
      setUomCode('PCS');
      setPackMultiplier(1);
      setBasePrice(0);
      setCostPrice(0);
      setBranchOverridePrice('');
      setIsVatApplicable(true);
      setVatRate(0.15);
      setIsWeighed(false);
      setScalePlu('');
      setMinStockLevel(5);
      setMaxStockLevel(50);
      setAllowDiscount(true);
      setIsActive(true);
      setBarcode('');
      setImageUrl('');
      setHasExpiryDate(false);
      setStockOnHand(0);
      setPriceChangeReason('');

      // Auto focus barcode input for rapid scanning
      setTimeout(() => {
        barcodeInputRef.current?.focus();
      }, 100);
    }

    setDuplicateWarning(null);
    setFormError(null);
    setFormSuccess(null);
  }, [isOpen, product, categories]);

  // Debounced Barcode Inline Duplicate Check
  useEffect(() => {
    if (!barcode || barcode.trim() === '') {
      setDuplicateWarning(null);
      return;
    }

    const trimmed = barcode.trim();
    // Don't warn on the product's own existing barcode when editing
    if (isEdit && product?.barcode === trimmed) {
      setDuplicateWarning(null);
      return;
    }

    const timer = setTimeout(async () => {
      setBarcodeChecking(true);
      try {
        const check = await posApi.checkBarcode(trimmed);
        if (check.exists && check.product) {
          // If editing and matched product is current product, ignore
          if (isEdit && check.product.id === product?.id) {
            setDuplicateWarning(null);
          } else {
            setDuplicateWarning({
              exists: true,
              productName: check.product.name_en,
              productSku: check.product.sku,
            });
          }
        } else {
          setDuplicateWarning(null);
        }
      } catch (err) {
        console.error('Barcode check failed', err);
      } finally {
        setBarcodeChecking(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [barcode, isEdit, product]);

  if (!isOpen) return null;

  // Rapid generators
  const handleGenerateEan = () => {
    const ean = generateInternalEan13();
    setBarcode(ean);
    if (!sku || sku.startsWith('SKU-')) {
      setSku(`EAN-${ean.slice(-6)}`);
    }
  };

  const handleGenerateCode128 = () => {
    const code = generateInternalCode128();
    setBarcode(code);
    if (!sku || sku.startsWith('SKU-')) {
      setSku(code);
    }
  };

  const handleSave = async (addAnother = false) => {
    setFormError(null);
    setFormSuccess(null);

    const effectiveNameEn = nameEn.trim() || nameAm.trim();
    const effectiveNameAm = nameAm.trim() || undefined;

    if (!effectiveNameEn) {
      setFormError(t('catalog.nameRequired'));
      return;
    }
    const finalSku = sku.trim() || (barcode.trim() ? `SKU-${barcode.trim().slice(-6)}` : `SKU-${Date.now().toString().slice(-6)}`);
    if (basePrice < 0) {
      setFormError('Selling price cannot be negative.');
      return;
    }
    if (costPrice < 0) {
      setFormError('Cost price cannot be negative.');
      return;
    }

    // Check duplicate barcode restriction
    if (duplicateWarning?.exists) {
      setFormError(`Barcode '${barcode}' is already in use by ${duplicateWarning.productName}. Barcodes must be unique.`);
      return;
    }

    const finalSellingPrice = vatBreakdown.grossPrice;

    // Check price modification permission if price changed on existing product
    if (isEdit && product && Number(product.base_price) !== finalSellingPrice) {
      if (!canChangePrice) {
        setFormError('You do not have permission to modify product base prices.');
        return;
      }
      if (!priceChangeReason.trim()) {
        setFormError('Please enter a reason for this price change (audit requirement).');
        return;
      }
    }

    setSaving(true);
    try {
      const payload: any = {
        sku: finalSku,
        name_en: effectiveNameEn,
        name_am: effectiveNameAm,
        category_id: categoryId || categories[0]?.id,
        uom_code: uomCode,
        base_price: finalSellingPrice,
        cost_price: Number(costPrice),
        is_vat_applicable: isVatApplicable,
        vat_rate: isVatApplicable ? Number(vatRate) : 0,
        is_weighed: isWeighed,
        scale_plu: isWeighed ? (scalePlu.trim() || undefined) : undefined,
        min_stock_level: Number(minStockLevel),
        max_stock_level: Number(maxStockLevel),
        allow_discount: allowDiscount,
        is_active: isActive,
        barcode: barcode.trim() || undefined,
        image_url: imageUrl.trim() || undefined,
        has_expiry_date: hasExpiryDate,
      };

      let resultProduct: any;

      if (isEdit && product?.id) {
        // Update product
        const res = await posApi.updateProduct(product.id, payload);
        resultProduct = res.product;

        // If price changed, record audit price change
        if (Number(product.base_price) !== finalSellingPrice && priceChangeReason) {
          await posApi.updatePrice(product.id, {
            new_price: finalSellingPrice,
            reason: priceChangeReason.trim(),
            changed_by: currentUser?.id,
          });
        }

        // If branch override price specified
        if (branchOverridePrice !== '') {
          const overrideVal = parseFloat(branchOverridePrice);
          if (!isNaN(overrideVal)) {
            await fetch(`/api/products/${product.id}/branch-overrides/${currentUser?.branchId || '018e0000-0000-7000-8000-000000000020'}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ selling_price: overrideVal }),
            });
          }
        }
      } else {
        // Create product
        resultProduct = await posApi.createProduct(payload);

        // If barcode entered, also attach via barcodes endpoint
        if (barcode.trim()) {
          try {
            await fetch(`/api/products/${resultProduct.id}/barcodes`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                barcode: barcode.trim(),
                barcode_type: barcode.length === 13 ? 'EAN13' : 'CODE128',
                pack_multiplier: Number(packMultiplier) || 1.0,
                is_primary: true,
              }),
            });
          } catch {}
        }
      }

      setFormSuccess(
        isEdit
          ? 'Product updated successfully!'
          : `"${nameEn}" added to catalog in under 30 seconds!`,
      );

      onSaved(resultProduct);

      if (addAnother) {
        // Reset for another rapid addition
        setSku(`SKU-${Date.now().toString().slice(-6)}`);
        setNameEn('');
        setNameAm('');
        setBasePrice(0);
        setCostPrice(0);
        setBranchOverridePrice('');
        setBarcode('');
        setImageUrl('');
        setDuplicateWarning(null);
        setTimeout(() => {
          barcodeInputRef.current?.focus();
        }, 150);
      } else {
        setTimeout(onClose, 600);
      }
    } catch (err: any) {
      setFormError(err.message || 'Failed to save product');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden select-none">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity animate-in fade-in"
        onClick={onClose}
      />

      <div className="fixed inset-y-0 right-0 max-w-full flex pl-10">
        <div className="w-screen max-w-xl bg-white dark:bg-slate-800 shadow-2xl flex flex-col border-l border-slate-200 dark:border-slate-700 animate-in slide-in-from-right duration-250">
          {/* Header */}
          <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-gebeya-100 dark:bg-gebeya-950/60 text-gebeya-600 flex items-center justify-center font-bold">
                <Package size={20} />
              </div>
              <div>
                <h2 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
                  {isEdit ? t('catalog.editProduct') : t('catalog.addProductQuick')}
                </h2>
                <p className="text-xs text-slate-500">
                  {isEdit ? `SKU: ${product?.sku}` : 'Scan or type barcode, enter name, price, and save.'}
                </p>
              </div>
            </div>

            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full hover:bg-slate-200 dark:hover:bg-slate-800 flex items-center justify-center text-slate-400 hover:text-slate-600 transition"
            >
              <X size={18} />
            </button>
          </div>

          {/* Body: Fast Form Fields */}
          <div className="flex-1 overflow-y-auto p-6 space-y-5">
            {/* Alerts */}
            {formError && (
              <div className="p-3.5 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-600 text-xs flex items-center gap-2 animate-in fade-in">
                <AlertCircle size={16} className="shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            {formSuccess && (
              <div className="p-3.5 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-600 text-xs flex items-center gap-2 animate-in fade-in">
                <Check size={16} className="shrink-0" />
                <span>{formSuccess}</span>
              </div>
            )}

            {/* 1. Barcode Scanner & Inline Warning (UX Focus: 30 seconds) */}
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                  <Barcode size={16} className="text-gebeya-600" />
                  {language === 'am' ? 'ባርኮድ (ስካን ወይም ፃፍ) *' : 'Barcode (Scan or Type) *'}
                </label>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={handleGenerateEan}
                    className="px-2.5 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 text-[10px] font-bold flex items-center gap-1 transition"
                  >
                    <Sparkles size={11} className="text-emerald-600 dark:text-emerald-400" />
                    {t('catalog.makeCodeForMe')}
                  </button>
                  <button
                    type="button"
                    onClick={handleGenerateCode128}
                    className="px-2 py-1 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 text-[10px] font-bold transition"
                  >
                    + Code128
                  </button>
                </div>
              </div>

              <div className="relative">
                <input
                  ref={barcodeInputRef}
                  type="text"
                  placeholder={t('catalog.barcodePlaceholder')}
                  value={barcode}
                  onChange={(e) => setBarcode(e.target.value)}
                  className={`w-full px-3.5 py-2.5 rounded-xl bg-white dark:bg-slate-800 border font-mono text-xs font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 ${
                    duplicateWarning?.exists
                      ? 'border-rose-400 focus:ring-rose-500 bg-rose-50/20'
                      : 'border-slate-200 dark:border-slate-700 focus:ring-gebeya-500'
                  }`}
                />
                {barcodeChecking && (
                  <div className="absolute right-3 top-2.5">
                    <RefreshCw size={14} className="animate-spin text-slate-400" />
                  </div>
                )}
              </div>

              {/* INLINE DUPLICATE WARNING */}
              {duplicateWarning?.exists && (
                <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs flex items-start gap-2 animate-in fade-in">
                  <AlertTriangle size={15} className="shrink-0 text-rose-500 mt-0.5" />
                  <div>
                    <span className="font-bold">Duplicate Barcode Warning:</span> This barcode is already assigned to{' '}
                    <strong>{duplicateWarning.productName}</strong> ({duplicateWarning.productSku}). Barcodes must be unique across the catalog!
                  </div>
                </div>
              )}
            </div>

            {/* 2. Names & SKU */}
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 block mb-1">
                    {language === 'am' ? 'የእቃ ስም (እንግሊዝኛ) *' : 'Product Name (EN) *'}
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Sunflower Cooking Oil 5L"
                    value={nameEn}
                    onChange={(e) => setNameEn(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-gebeya-500"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 block mb-1">
                    {language === 'am' ? 'የእቃ ስም (አማርኛ)' : 'Product Name (AM)'}
                  </label>
                  <input
                    type="text"
                    placeholder="ለምሳሌ የሱፍ ዘይት 5 ሊትር"
                    value={nameAm}
                    onChange={(e) => setNameAm(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-gebeya-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 block mb-1">
                    SKU Code *
                  </label>
                  <input
                    type="text"
                    required
                    value={sku}
                    onChange={(e) => setSku(e.target.value.toUpperCase())}
                    className="w-full px-3.5 py-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-mono font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-gebeya-500"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 block mb-1">
                    {language === 'am' ? 'የምስል አድራሻ (Image URL)' : 'Image URL'}
                  </label>
                  <input
                    type="text"
                    placeholder="https://images.unsplash.com/..."
                    value={imageUrl}
                    onChange={(e) => setImageUrl(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-gebeya-500"
                  />
                </div>
              </div>
            </div>

            {/* 3. Category & Base Unit */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400">
                    {language === 'am' ? 'ምድብ (Category) *' : 'Category *'}
                  </label>
                  <button
                    type="button"
                    onClick={onOpenCategoryManager}
                    className="text-[10px] text-gebeya-600 hover:underline font-bold flex items-center gap-0.5"
                  >
                    <Plus size={10} /> {language === 'am' ? 'አዲስ ምድብ' : '+ New Cat'}
                  </button>
                </div>
                <select
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-gebeya-500"
                >
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name_en} {c.name_am ? `(${c.name_am})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 block mb-1">
                  {language === 'am' ? 'መለኪያ አሃድ (Unit)' : 'Base Unit (UOM) *'}
                </label>
                <select
                  value={uomCode}
                  onChange={(e) => setUomCode(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-gebeya-500"
                >
                  {uoms.map((u) => (
                    <option key={u.code} value={u.code}>
                      {u.code} - {u.name_en}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* 4. Pack Multiplier Conversion */}
            <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/30 border border-slate-200 dark:border-slate-700 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                  <Layers size={14} className="text-indigo-500" />
                  Pack Units & Conversion
                </span>
                <span className="text-[11px] text-slate-400">
                  {packMultiplier > 1 ? `1 Pack = ${packMultiplier} ${uomCode}` : 'Single Unit'}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-bold text-slate-500 block mb-0.5">
                    Pack Multiplier
                  </label>
                  <input
                    type="number"
                    step="1"
                    min="1"
                    value={packMultiplier}
                    onChange={(e) => setPackMultiplier(Math.max(1, parseInt(e.target.value, 10) || 1))}
                    className="w-full px-3 py-1.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-500 block mb-0.5">
                    Pack Selling Price (Computed)
                  </label>
                  <div className="px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-mono font-bold text-indigo-600">
                    {(basePrice * packMultiplier).toFixed(2)} ETB
                  </div>
                </div>
              </div>
            </div>

            {/* 5. Pricing & Automatic Bidirectional VAT (Part 3) */}
            <div className="p-4 rounded-2xl bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800/60 space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <h3 className="text-xs font-black uppercase tracking-wider text-emerald-800 dark:text-emerald-300 flex items-center gap-1.5">
                  <DollarSign size={15} />
                  Pricing & VAT Calculation
                </h3>

                <div className="flex items-center gap-3">
                  {/* Price History Button (if product exists) */}
                  {isEdit && product?.id && (
                    <button
                      type="button"
                      onClick={() => setIsPriceHistoryOpen(true)}
                      className="px-2.5 py-1 rounded-lg bg-white dark:bg-slate-800 border border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 text-[11px] font-bold flex items-center gap-1 transition shadow-xs"
                      title={t('catalog.priceHistory')}
                    >
                      <History size={12} />
                      {t('catalog.priceHistory')}
                    </button>
                  )}

                  {/* "Price includes VAT" Switch (default ON for retail) */}
                  <label className="inline-flex items-center gap-2 cursor-pointer select-none">
                    <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300">
                      {t('catalog.priceIncludesVat')}
                    </span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={priceIncludesVat}
                      onClick={() => setPriceIncludesVat(!priceIncludesVat)}
                      className={`w-9 h-5 flex items-center rounded-full p-0.5 transition-colors duration-200 ease-in-out ${
                        priceIncludesVat ? 'bg-emerald-600' : 'bg-slate-300 dark:bg-slate-600'
                      }`}
                    >
                      <div
                        className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform duration-200 ease-in-out ${
                          priceIncludesVat ? 'translate-x-4' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </label>
                </div>
              </div>

              {/* VAT Type Selection */}
              <div className="p-2.5 rounded-xl bg-white/70 dark:bg-slate-900/60 border border-emerald-200/60 dark:border-emerald-800/40 flex items-center justify-between flex-wrap gap-2">
                <span className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                  <Percent size={13} className="text-emerald-600" />
                  {t('catalog.vatType')}:
                </span>
                <div className="flex items-center gap-4">
                  <label className="inline-flex items-center gap-1.5 text-xs font-semibold cursor-pointer">
                    <input
                      type="radio"
                      name="vatType"
                      checked={isVatApplicable}
                      onChange={() => {
                        setIsVatApplicable(true);
                        setVatRate(0.15);
                      }}
                      className="text-emerald-600 focus:ring-emerald-500"
                    />
                    <span>{t('catalog.vatTypeTaxable')} (15%)</span>
                  </label>
                  <label className="inline-flex items-center gap-1.5 text-xs font-semibold cursor-pointer">
                    <input
                      type="radio"
                      name="vatType"
                      checked={!isVatApplicable}
                      onChange={() => {
                        setIsVatApplicable(false);
                        setVatRate(0);
                      }}
                      className="text-emerald-600 focus:ring-emerald-500"
                    />
                    <span>{t('catalog.vatTypeExempt')}</span>
                  </label>
                </div>
              </div>

              {/* Price Inputs */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {/* Selling Price Input (Gross if switch is ON, Net if switch is OFF) */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300">
                      {priceIncludesVat ? t('catalog.grossPrice') : t('catalog.netPrice')} (ETB) *
                    </label>
                    {!canChangePrice && (
                      <span className="flex items-center gap-1 text-[10px] text-amber-600 dark:text-amber-400 font-semibold" title={t('catalog.noEditPermission')}>
                        <Lock size={10} /> Locked
                      </span>
                    )}
                  </div>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    disabled={!canChangePrice}
                    value={basePrice || ''}
                    onChange={(e) => setBasePrice(parseFloat(e.target.value) || 0)}
                    placeholder="0.00"
                    className={`w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-800 border text-xs font-mono font-black text-slate-900 dark:text-white focus:outline-none focus:ring-2 ${
                      !canChangePrice
                        ? 'opacity-60 cursor-not-allowed border-slate-200 dark:border-slate-700'
                        : 'border-emerald-300 dark:border-emerald-700 focus:ring-emerald-500'
                    }`}
                  />
                  <div className="text-[10px] text-slate-500 mt-0.5">
                    {priceIncludesVat
                      ? (language === 'am' ? 'የመደርደሪያ ዋጋ (ተ.እ.ታን ጨምሮ)' : 'Shelf price inclusive of VAT')
                      : (language === 'am' ? 'የተጣራ ዋጋ (ያለ ተ.እ.ታ)' : 'Net price before VAT')}
                  </div>
                </div>

                {/* Cost Price Input */}
                <div>
                  <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    {t('catalog.costPriceLabel')} (ETB)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={costPrice || ''}
                    onChange={(e) => setCostPrice(parseFloat(e.target.value) || 0)}
                    placeholder="0.00"
                    className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-mono font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                  <div className="text-[10px] text-slate-500 mt-0.5">
                    {language === 'am' ? 'የእቃው አማካይ የግዢ ወጪ' : 'Unit cost / AVCO'}
                  </div>
                </div>

                {/* Branch Override Price */}
                <div>
                  <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    Branch Override Price
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="Optional override"
                    value={branchOverridePrice}
                    onChange={(e) => setBranchOverridePrice(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-mono font-bold text-cyan-600 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                  />
                  <div className="text-[10px] text-slate-500 mt-0.5">
                    {language === 'am' ? 'ለዚህ ቅርንጫፍ ብቻ የሚተገበር' : 'Local branch price'}
                  </div>
                </div>
              </div>

              {/* LIVE BIDIRECTIONAL VAT BREAKDOWN CARD (Part 3) */}
              <div className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-emerald-200 dark:border-emerald-800 space-y-2">
                <div className="text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  {language === 'am' ? 'የዋጋ እና ተ.እ.ታ ስሌት ዝርዝር (Live Calculation)' : 'Computed Price & VAT Breakdown (Live)'}
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  {/* Net Price */}
                  <div className="p-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                    <div className="text-[10px] font-bold text-slate-500">{t('catalog.netPrice')}</div>
                    <div className="text-sm font-mono font-black text-slate-900 dark:text-white mt-0.5">
                      {vatBreakdown.netPrice.toFixed(2)} <span className="text-[10px] font-normal">ETB</span>
                    </div>
                  </div>

                  {/* VAT Amount */}
                  <div className="p-2 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800">
                    <div className="text-[10px] font-bold text-emerald-700 dark:text-emerald-300">
                      {isVatApplicable ? t('catalog.vatAmount') : t('catalog.vatTypeExempt')}
                    </div>
                    <div className="text-sm font-mono font-black text-emerald-600 dark:text-emerald-400 mt-0.5">
                      {vatBreakdown.vatAmount.toFixed(2)} <span className="text-[10px] font-normal">ETB</span>
                    </div>
                  </div>

                  {/* Gross Price */}
                  <div className="p-2 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800">
                    <div className="text-[10px] font-bold text-indigo-700 dark:text-indigo-300">{t('catalog.grossPrice')}</div>
                    <div className="text-sm font-mono font-black text-indigo-600 dark:text-indigo-400 mt-0.5">
                      {vatBreakdown.grossPrice.toFixed(2)} <span className="text-[10px] font-normal">ETB</span>
                    </div>
                  </div>
                </div>

                {/* Profit Margin & AVCO Cost Breakdown */}
                <div className="flex items-center justify-between pt-1 border-t border-slate-100 dark:border-slate-800 text-xs">
                  <span className="text-slate-600 dark:text-slate-400 font-medium">
                    {t('catalog.profitMarginBirr')}:
                  </span>
                  <div className="flex items-center gap-2">
                    <span className={`font-mono font-bold ${vatBreakdown.isNegativeMargin ? 'text-rose-600' : 'text-emerald-600'}`}>
                      {vatBreakdown.profitMarginBirr > 0 ? '+' : ''}{vatBreakdown.profitMarginBirr.toFixed(2)} ETB
                    </span>
                    <span className={`px-2 py-0.5 rounded-full font-mono text-[10px] font-bold ${
                      vatBreakdown.isNegativeMargin
                        ? 'bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300'
                        : 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300'
                    }`}>
                      {vatBreakdown.profitMarginPercent.toFixed(1)}%
                    </span>
                  </div>
                </div>

                {/* Selling Below Cost Alert */}
                {vatBreakdown.isSellingBelowCost && (
                  <div className="p-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-300 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs font-bold flex items-start gap-2 animate-in fade-in">
                    <AlertTriangle size={15} className="shrink-0 text-rose-500 mt-0.5" />
                    <div>
                      <div>{t('catalog.sellingBelowCost')}</div>
                      <div className="text-[11px] font-normal text-rose-600 dark:text-rose-400">
                        {t('catalog.sellingBelowCostDesc')}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Mandatory Reason for Price Change if editing existing price */}
              {isEdit && product && Number(product.base_price) !== vatBreakdown.grossPrice && (
                <div className="pt-2 animate-in fade-in">
                  <label className="text-[11px] font-bold text-amber-700 dark:text-amber-400 block mb-1">
                    Reason for Price Change (Mandatory Audit Requirement) *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Supplier invoice cost revision, periodic tariff update"
                    value={priceChangeReason}
                    onChange={(e) => setPriceChangeReason(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-800 border border-amber-300 dark:border-amber-700 text-xs font-semibold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>
              )}
            </div>

            {/* 6. Deli / Scale Options */}
            <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/30 border border-slate-200 dark:border-slate-700 space-y-2">
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isWeighed}
                    onChange={(e) => setIsWeighed(e.target.checked)}
                    className="rounded text-gebeya-600 focus:ring-gebeya-500"
                  />
                  <span className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                    <Scale size={14} className="text-gebeya-600" />
                    Weighed / Scale Item (Butcher & Produce)
                  </span>
                </label>
              </div>

              {isWeighed && (
                <div className="pt-2 grid grid-cols-2 gap-3 animate-in fade-in">
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 block mb-0.5">
                      Scale PLU Code (5 digits, e.g. 00123)
                    </label>
                    <input
                      type="text"
                      placeholder="00123"
                      value={scalePlu}
                      onChange={(e) => setScalePlu(e.target.value)}
                      className="w-full px-3 py-1.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-mono font-bold"
                    />
                  </div>
                  <div className="text-[11px] text-slate-500 flex items-center">
                    Barcode format: 20-PLU-WEIGHT-C (e.g. 2000123015002)
                  </div>
                </div>
              )}
            </div>

            {/* 7. Stock Thresholds */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 block mb-1">
                  Min Stock Level (Alert Point)
                </label>
                <input
                  type="number"
                  min="0"
                  value={minStockLevel}
                  onChange={(e) => setMinStockLevel(parseInt(e.target.value, 10) || 0)}
                  className="w-full px-3.5 py-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-mono font-bold text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 block mb-1">
                  Reorder Quantity (Max Stock)
                </label>
                <input
                  type="number"
                  min="0"
                  value={maxStockLevel}
                  onChange={(e) => setMaxStockLevel(parseInt(e.target.value, 10) || 0)}
                  className="w-full px-3.5 py-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-mono font-bold text-slate-900 dark:text-white"
                />
              </div>
            </div>

            {/* 8. Expiry Date Tracking */}
            <div className="p-3.5 rounded-2xl bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/60">
              <label className="flex items-center justify-between cursor-pointer">
                <div className="flex items-center gap-2">
                  <Clock size={16} className="text-amber-500" />
                  <div>
                    <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                      {t('catalog.hasExpiryDate')}
                    </span>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400">
                      {t('catalog.hasExpiryDateDesc')}
                    </p>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={hasExpiryDate}
                  onChange={(e) => setHasExpiryDate(e.target.checked)}
                  className="rounded text-amber-600 focus:ring-amber-500 w-4 h-4 cursor-pointer"
                />
              </label>
            </div>

            {/* 9. Active vs Archived Status with Stock Warning */}
            <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/30 border border-slate-200 dark:border-slate-700 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Archive size={15} className="text-slate-500" />
                  <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                    Product Status
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <label className="inline-flex items-center gap-1.5 text-xs font-semibold cursor-pointer">
                    <input
                      type="radio"
                      name="status"
                      checked={isActive}
                      onChange={() => setIsActive(true)}
                      className="text-emerald-600 focus:ring-emerald-500"
                    />
                    Active
                  </label>
                  <label className="inline-flex items-center gap-1.5 text-xs font-semibold cursor-pointer">
                    <input
                      type="radio"
                      name="status"
                      checked={!isActive}
                      onChange={() => setIsActive(false)}
                      className="text-amber-600 focus:ring-amber-500"
                    />
                    Archived
                  </label>
                </div>
              </div>

              {/* Warning if archiving with physical stock */}
              {!isActive && stockOnHand > 0 && (
                <div className="p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300 text-xs flex items-start gap-2 animate-in fade-in">
                  <AlertTriangle size={15} className="shrink-0 text-amber-500 mt-0.5" />
                  <div>
                    <strong>Stock Warning:</strong> This product currently has{' '}
                    <strong>{stockOnHand} {uomCode}</strong> in stock. Archiving will hide it from the POS cashier register while stock remains on ledger!
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Footer Action Bar */}
          <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200 transition"
            >
              {language === 'am' ? 'ሰርዝ' : 'Cancel'}
            </button>

            <div className="flex items-center gap-2">
              {!isEdit && (
                <button
                  type="button"
                  disabled={saving || duplicateWarning?.exists}
                  onClick={() => handleSave(true)}
                  className="px-4 py-2.5 rounded-xl border border-gebeya-600 text-gebeya-600 hover:bg-gebeya-50 dark:hover:bg-gebeya-950/50 text-xs font-bold transition disabled:opacity-50"
                >
                  {language === 'am' ? 'መዝግብ እና ሌላ ጨምር' : 'Save & Add Another'}
                </button>
              )}

              <button
                type="button"
                disabled={saving || duplicateWarning?.exists}
                onClick={() => handleSave(false)}
                className="px-5 py-2.5 rounded-xl bg-gebeya-600 hover:bg-gebeya-700 text-white text-xs font-bold flex items-center gap-2 shadow-xs transition active:scale-95 disabled:opacity-50"
              >
                {saving ? <RefreshCw size={14} className="animate-spin" /> : <Check size={14} />}
                {saving
                  ? 'Saving...'
                  : isEdit
                  ? (language === 'am' ? 'ለውጦችን መዝግብ' : 'Update Product')
                  : (language === 'am' ? 'እቃ መዝግብ' : 'Save Product')}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Price History Modal (Part 3) */}
      {isPriceHistoryOpen && product?.id && (
        <PriceHistoryModal
          isOpen={isPriceHistoryOpen}
          onClose={() => setIsPriceHistoryOpen(false)}
          product={{
            id: product.id,
            sku: product.sku,
            name_en: product.name_en,
            base_price: product.base_price,
            override_price: product.branch_override_price,
          }}
          onPriceUpdated={() => {}}
        />
      )}
    </div>
  );
};
