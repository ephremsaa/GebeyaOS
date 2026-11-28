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
  DollarSign,
  Package,
  AlertCircle,
  RefreshCw,
  Archive,
  Clock,
  Lock,
  History,
  Palette,
  Trash2,
  Camera,
} from 'lucide-react';
import { useI18n } from '../../i18n/I18nContext';
import { useAuth } from '../../auth/AuthContext';
import { posApi } from '../../utils/pos-api';
import { generateInternalEan13, generateInternalCode128 } from '../../utils/code128Svg';
import { calculateItemVatBreakdown } from '@gebeyaos/shared-types';
import { PriceHistoryModal } from './PriceHistoryModal';
import { ExpiryDatePicker } from '../ui/ExpiryDatePicker';
import { CameraBarcodeScanner } from '../ui/CameraBarcodeScanner';
import { ProductPhotoUpload } from './ProductPhotoUpload';

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
  photo_path?: string | null;
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
  onDeleted?: (deletedId: string) => void;
  onOpenCategoryManager?: () => void;
}

const STANDARD_UOMS = [
  { code: 'PCS', name_en: 'Piece', name_am: 'ፍሬ / ቁራጭ' },
  { code: 'KG', name_en: 'Kilogram', name_am: 'ኪሎግራም' },
  { code: 'G', name_en: 'Gram', name_am: 'ግራም' },
  { code: 'LTR', name_en: 'Liter', name_am: 'ሊትር' },
  { code: 'ML', name_en: 'Milliliter', name_am: 'ሚሊሊትር' },
  { code: 'PACK', name_en: 'Pack', name_am: 'ፓኬት' },
  { code: 'BOX', name_en: 'Box', name_am: 'ሳጥን' },
  { code: 'DOZ', name_en: 'Dozen', name_am: 'ደርዘን' },
  { code: 'BTL', name_en: 'Bottle', name_am: 'ጠርሙስ' },
  { code: 'CTN', name_en: 'Carton', name_am: 'ካርቶን' },
  { code: 'BAG', name_en: 'Bag', name_am: 'ጆንያ / ፌስታል' },
  { code: 'SCH', name_en: 'Sachet', name_am: 'ሳሼ' },
];

const PRESET_COLORS = [
  '#10B981', '#0284C7', '#7C3AED', '#EA580C',
  '#E11D48', '#0D9488', '#D97706', '#475569',
];

export const ProductDrawer: React.FC<ProductDrawerProps> = ({
  isOpen,
  onClose,
  product,
  categories: initialCategories,
  uoms: initialUoms,
  onSaved,
  onDeleted,
}) => {
  const { language, t, formatCurrency } = useI18n();
  const isAm = language === 'am';
  const { hasPermission, currentUser } = useAuth();
  const isEdit = Boolean(product?.id);
  const [deleting, setDeleting] = useState(false);

  // Categories list
  const [categoriesList, setCategoriesList] = useState(initialCategories);
  useEffect(() => {
    setCategoriesList(initialCategories);
    if (!categoryId && initialCategories.length > 0) {
      setCategoryId(initialCategories[0].id);
    }
  }, [initialCategories]);

  // Form state
  const [nameEn, setNameEn] = useState('');
  const [nameAm, setNameAm] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [barcode, setBarcode] = useState('');
  const [sku, setSku] = useState('');
  const [uomCode, setUomCode] = useState('PCS');
  const [packMultiplier, setPackMultiplier] = useState<number>(1);

  // Price & Bidirectional VAT State
  const [priceBeforeVat, setPriceBeforeVat] = useState<string>('0.00');
  const [priceAfterVat, setPriceAfterVat] = useState<string>('0.00');
  const [isVatApplicable, setIsVatApplicable] = useState<boolean>(true);
  const [vatRate, setVatRate] = useState<number>(0.15);
  const [costPrice, setCostPrice] = useState<number>(0);
  const [minStockLevel, setMinStockLevel] = useState<number>(5);
  const [maxStockLevel, setMaxStockLevel] = useState<number>(50);
  const [hasExpiryDate, setHasExpiryDate] = useState<boolean>(false);
  const [defaultExpiryDate, setDefaultExpiryDate] = useState<string | null>(null);
  const [isWeighed, setIsWeighed] = useState<boolean>(false);
  const [scalePlu, setScalePlu] = useState<string>('');
  const [allowDiscount, setAllowDiscount] = useState<boolean>(true);
  const [isActive, setIsActive] = useState<boolean>(true);
  const [imageUrl, setImageUrl] = useState('');
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [currentPhotoUrl, setCurrentPhotoUrl] = useState<string | null>(null);
  const [priceChangeReason, setPriceChangeReason] = useState<string>('');
  const [stockOnHand, setStockOnHand] = useState<number>(0);

  // Inline Category Add State
  const [showInlineCatAdd, setShowInlineCatAdd] = useState<boolean>(false);
  const [inlineCatNameEn, setInlineCatNameEn] = useState<string>('');
  const [inlineCatNameAm, setInlineCatNameAm] = useState<string>('');
  const [inlineCatColor, setInlineCatColor] = useState<string>('#10B981');
  const [inlineCatSaving, setInlineCatSaving] = useState<boolean>(false);
  const [inlineCatError, setInlineCatError] = useState<string | null>(null);

  // Inline Barcode Duplicate Check
  const [barcodeChecking, setBarcodeChecking] = useState<boolean>(false);
  const [isCameraScannerOpen, setIsCameraScannerOpen] = useState<boolean>(false);
  const [duplicateWarning, setDuplicateWarning] = useState<{
    exists: boolean;
    productName?: string;
    productSku?: string;
  } | null>(null);

  const [saving, setSaving] = useState<boolean>(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);
  const [isPriceHistoryOpen, setIsPriceHistoryOpen] = useState<boolean>(false);

  const barcodeInputRef = useRef<HTMLInputElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);

  const canChangePrice =
    currentUser?.role === 'OWNER' ||
    currentUser?.role === 'STORE_OWNER' ||
    currentUser?.role === 'BRANCH_MANAGER' ||
    currentUser?.role === 'HQ_ADMIN' ||
    hasPermission('pricing.override') ||
    hasPermission('pos.override_price');

  // Compute live VAT breakdown based on priceAfterVat (shelf price)
  const vatBreakdown = useMemo(() => {
    const shelfPrice = parseFloat(priceAfterVat) || 0;
    return calculateItemVatBreakdown({
      typedPrice: shelfPrice,
      priceIncludesVat: true,
      isVatApplicable,
      vatRate: isVatApplicable ? vatRate : 0,
      costPrice,
    });
  }, [priceAfterVat, isVatApplicable, vatRate, costPrice]);

  // Handle typing in Price Before VAT -> recalculate Price After VAT
  const handlePriceBeforeVatChange = (valStr: string) => {
    setPriceBeforeVat(valStr);
    const num = parseFloat(valStr);
    if (isNaN(num) || num < 0) {
      setPriceAfterVat('');
      return;
    }
    if (!isVatApplicable || vatRate <= 0) {
      setPriceAfterVat(num.toFixed(2));
    } else {
      const gross = Math.round(num * (1 + vatRate) * 100) / 100;
      setPriceAfterVat(gross.toFixed(2));
    }
  };

  // Handle typing in Price After VAT (shelf price) -> back-calculate Price Before VAT
  const handlePriceAfterVatChange = (valStr: string) => {
    setPriceAfterVat(valStr);
    const num = parseFloat(valStr);
    if (isNaN(num) || num < 0) {
      setPriceBeforeVat('');
      return;
    }
    if (!isVatApplicable || vatRate <= 0) {
      setPriceBeforeVat(num.toFixed(2));
    } else {
      const net = Math.round((num / (1 + vatRate)) * 100) / 100;
      setPriceBeforeVat(net.toFixed(2));
    }
  };

  // When VAT switch or rate toggles, re-sync from Price After VAT
  const handleVatToggle = (applicable: boolean, newRate: number = 0.15) => {
    setIsVatApplicable(applicable);
    setVatRate(newRate);
    const shelf = parseFloat(priceAfterVat) || 0;
    if (!applicable || newRate <= 0) {
      setPriceBeforeVat(shelf.toFixed(2));
    } else {
      const net = Math.round((shelf / (1 + newRate)) * 100) / 100;
      setPriceBeforeVat(net.toFixed(2));
    }
  };

  // Initialize form when drawer opens
  useEffect(() => {
    if (!isOpen) return;

    if (product) {
      setSku(product.sku);
      setNameEn(product.name_en);
      setNameAm(product.name_am || '');
      setCategoryId(product.category_id || categoriesList[0]?.id || '');
      setUomCode(product.uom_code || 'PCS');
      setPackMultiplier(product.pack_multiplier || 1);
      const gross = Number(product.base_price) || 0;
      const effectiveVat = Boolean(product.is_vat_applicable);
      const effectiveRate = Number(product.vat_rate) || 0.15;
      setIsVatApplicable(effectiveVat);
      setVatRate(effectiveRate);
      setPriceAfterVat(gross.toFixed(2));
      const net = effectiveVat ? Math.round((gross / (1 + effectiveRate)) * 100) / 100 : gross;
      setPriceBeforeVat(net.toFixed(2));
      setCostPrice(Number(product.cost_price) || 0);
      setIsWeighed(Boolean(product.is_weighed));
      setScalePlu(product.scale_plu || '');
      setMinStockLevel(Number(product.min_stock_level) || 0);
      setMaxStockLevel(Number(product.max_stock_level) || 50);
      setAllowDiscount(product.allow_discount);
      setIsActive(product.is_active);
      setBarcode(product.barcode || '');
      setImageUrl(product.image_url || '');
      setCurrentPhotoUrl(product.photo_path || (product as any).photoUrl || null);
      setPhotoFile(null);
      setHasExpiryDate(Boolean(product.has_expiry_date));
      setStockOnHand(Number(product.stock_on_hand) || 0);
      setPriceChangeReason('');
    } else {
      setSku(`SKU-${Date.now().toString().slice(-6)}`);
      setNameEn('');
      setNameAm('');
      setCategoryId(categoriesList[0]?.id || initialCategories[0]?.id || '');
      setUomCode('PCS');
      setPackMultiplier(1);
      setPriceBeforeVat('0.00');
      setPriceAfterVat('0.00');
      setIsVatApplicable(true);
      setVatRate(0.15);
      setCostPrice(0);
      setIsWeighed(false);
      setScalePlu('');
      setMinStockLevel(5);
      setMaxStockLevel(50);
      setAllowDiscount(true);
      setIsActive(true);
      setBarcode('');
      setImageUrl('');
      setCurrentPhotoUrl(null);
      setPhotoFile(null);
      setHasExpiryDate(false);
      setDefaultExpiryDate(null);
      setStockOnHand(0);
      setPriceChangeReason('');
      setTimeout(() => nameInputRef.current?.focus(), 120);
    }

    setDuplicateWarning(null);
    setFormError(null);
    setFormSuccess(null);
    setShowInlineCatAdd(false);
  }, [isOpen, product, categoriesList]);

  // Debounced Barcode Duplicate Check
  useEffect(() => {
    if (!barcode || barcode.trim() === '') {
      setDuplicateWarning(null);
      return;
    }

    const trimmed = barcode.trim();
    if (isEdit && product?.barcode === trimmed) {
      setDuplicateWarning(null);
      return;
    }

    const timer = setTimeout(async () => {
      setBarcodeChecking(true);
      try {
        const check = await posApi.checkBarcode(trimmed);
        if (check.exists && check.product) {
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

  const handleGenerateBarcode = () => {
    const ean = generateInternalEan13();
    setBarcode(ean);
    if (!sku || sku.startsWith('SKU-')) {
      setSku(`EAN-${ean.slice(-6)}`);
    }
  };

  const handleCreateCategoryInline = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inlineCatNameEn.trim()) {
      setInlineCatError(isAm ? 'የምድብ ስም ያስገቡ' : 'Category name is required');
      return;
    }

    setInlineCatSaving(true);
    setInlineCatError(null);
    try {
      const code = inlineCatNameEn.trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8) || `CAT-${Date.now().toString().slice(-4)}`;
      const newCat = await posApi.createCategory({
        code,
        name_en: inlineCatNameEn.trim(),
        name_am: inlineCatNameAm.trim() || undefined,
      });

      setCategoriesList((prev) => [...prev, newCat]);
      setCategoryId(newCat.id);
      setShowInlineCatAdd(false);
      setInlineCatNameEn('');
      setInlineCatNameAm('');
    } catch (err: any) {
      setInlineCatError(err.message || 'Failed to create category');
    } finally {
      setInlineCatSaving(false);
    }
  };

  const handleSave = async (addAnother = false) => {
    setFormError(null);
    setFormSuccess(null);

    const effectiveNameEn = nameEn.trim() || nameAm.trim();
    if (!effectiveNameEn) {
      setFormError(isAm ? 'እባክዎ የእቃውን ስም ያስገቡ' : 'Product English name is required');
      return;
    }

    const finalSellingPrice = parseFloat(priceAfterVat) || 0;
    if (finalSellingPrice < 0) {
      setFormError(isAm ? 'የሽያጭ ዋጋ ከዜሮ በታች መሆን አይችልም' : 'Selling price cannot be negative');
      return;
    }

    if (duplicateWarning?.exists) {
      setFormError(
        isAm
          ? `ባርኮድ '${barcode}' በ${duplicateWarning.productName} ተይዟል`
          : `Barcode '${barcode}' is already in use by ${duplicateWarning.productName}. Barcodes must be unique.`,
      );
      return;
    }

    if (isEdit && product && Number(product.base_price) !== finalSellingPrice) {
      if (!canChangePrice) {
        setFormError('You do not have permission to modify product base prices.');
        return;
      }
      if (!priceChangeReason.trim()) {
        setFormError(isAm ? 'እባክዎ የዋጋ ለውጥ ምክንያት ያስገቡ' : 'Please enter a reason for this price change (audit requirement).');
        return;
      }
    }

    setSaving(true);
    try {
      const finalSku = sku.trim() || (barcode.trim() ? `SKU-${barcode.trim().slice(-6)}` : `SKU-${Date.now().toString().slice(-6)}`);

      const payload: any = {
        sku: finalSku,
        name_en: effectiveNameEn,
        name_am: nameAm.trim() || undefined,
        category_id: categoryId || categoriesList[0]?.id || initialCategories[0]?.id || undefined,
        uom_code: uomCode,
        base_price: finalSellingPrice,
        cost_price: Number(costPrice) || 0,
        is_vat_applicable: isVatApplicable,
        vat_rate: isVatApplicable ? Number(vatRate) : 0,
        is_weighed: isWeighed,
        scale_plu: isWeighed ? (scalePlu.trim() || undefined) : undefined,
        min_stock_level: Number(minStockLevel) || 0,
        max_stock_level: Number(maxStockLevel) || 50,
        allow_discount: allowDiscount,
        is_active: isActive,
        barcode: barcode.trim() || undefined,
        image_url: imageUrl.trim() || undefined,
        has_expiry_date: hasExpiryDate,
        pack_multiplier: Number(packMultiplier) || 1.0,
      };

      let resultProduct: any;

      if (isEdit && product?.id) {
        const res = await posApi.updateProduct(product.id, payload);
        resultProduct = res.product;

        if (Number(product.base_price) !== finalSellingPrice && priceChangeReason) {
          await posApi.updatePrice(product.id, {
            new_price: finalSellingPrice,
            reason: priceChangeReason.trim(),
            changed_by: currentUser?.id,
          });
        }
      } else {
        resultProduct = await posApi.createProduct(payload);

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
          } catch { }
        }
      }

      // Photo upload
      if (photoFile && resultProduct?.id) {
        try {
          const photoFormData = new FormData();
          photoFormData.append('photo', photoFile);
          await fetch(`/api/media/products/${resultProduct.id}/photo`, {
            method: 'POST',
            body: photoFormData,
          });
        } catch (err) {
          console.error('Failed to upload product photo:', err);
        }
      } else if (!currentPhotoUrl && isEdit && product?.id && product?.photo_path) {
        try {
          await fetch(`/api/media/products/${product.id}/photo`, {
            method: 'DELETE',
          });
        } catch { }
      }

      setFormSuccess(
        isEdit
          ? (isAm ? 'እቃው በተሳካ ሁኔታ ተሻሽሏል!' : 'Product updated successfully!')
          : (isAm ? `"${effectiveNameEn}" በተሳካ ሁኔታ ተመዝግቧል!` : `"${effectiveNameEn}" added to catalog!`),
      );

      onSaved(resultProduct);

      if (addAnother) {
        setNameEn('');
        setNameAm('');
        setPriceBeforeVat('0.00');
        setPriceAfterVat('0.00');
        setCostPrice(0);
        setBarcode('');
        setSku(`SKU-${Date.now().toString().slice(-6)}`);
        setImageUrl('');
        setDuplicateWarning(null);
        setTimeout(() => nameInputRef.current?.focus(), 150);
      } else {
        setTimeout(onClose, 600);
      }
    } catch (err: any) {
      setFormError(err.message || 'Failed to save product');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteProduct = async () => {
    if (!product?.id) return;
    const confirmMsg = isAm
      ? `እርግጠኛ ነዎት "${nameEn || product.name_en}" የተባለውን እቃ መሰረዝ ይፈልጋሉ?`
      : `Are you sure you want to delete "${nameEn || product.name_en}"?`;
    if (!window.confirm(confirmMsg)) return;

    setDeleting(true);
    try {
      const res = await posApi.deleteProduct(product.id, true);
      alert(res.message || (isAm ? 'እቃው በተሳካ ሁኔታ ተሰርዟል!' : 'Product deleted successfully!'));
      onDeleted?.(product.id);
      onClose();
    } catch (err: any) {
      alert(err.message || 'Failed to delete product');
    } finally {
      setDeleting(false);
    }
  };

  const isPackUnit = ['PACK', 'BOX', 'DOZ', 'CTN', 'BAG'].includes(uomCode.toUpperCase());

  return (
    <div className="fixed inset-0 z-50 overflow-hidden select-none font-sans">
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity animate-in fade-in"
        onClick={onClose}
      />

      <div className="fixed inset-y-0 right-0 max-w-full flex pl-10">
        <div className="w-screen max-w-2xl bg-surface shadow-2xl flex flex-col border-l border-border-subtle animate-in slide-in-from-right duration-250">
          {/* Header */}
          <div className="px-6 py-4 border-b border-border-subtle bg-surface-2 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-primary text-white flex items-center justify-center font-bold shadow-md shadow-primary/25">
                <Package size={20} />
              </div>
              <div>
                <h2 className="text-base font-black text-text-main flex items-center gap-2">
                  {isEdit
                    ? isAm ? 'እቃ ማሻሻያ' : 'Edit Product'
                    : isAm ? 'አዲስ እቃ መመዝገቢያ' : 'Add New Item'}
                </h2>
                <p className="text-xs text-text-muted">
                  {isEdit
                    ? `SKU: ${product?.sku}`
                    : isAm
                      ? 'ስም፣ ምድብ፣ ባርኮድ እና ዋጋ ያስገቡና ይመዝግቡ'
                      : 'Enter product name, category, barcode, and price'}
                </p>
              </div>
            </div>

            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full hover:bg-surface-2 flex items-center justify-center text-text-muted hover:text-text-main transition-colors"
            >
              <X size={18} />
            </button>
          </div>

          {/* Body: High-Legibility Fields in Strict Order */}
          <div className="flex-1 overflow-y-auto p-6 space-y-5">
            {/* Alerts */}
            {formError && (
              <div className="p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-500 text-xs flex items-center gap-2 animate-in fade-in">
                <AlertCircle size={16} className="shrink-0" />
                <span className="font-semibold">{formError}</span>
              </div>
            )}

            {formSuccess && (
              <div className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 text-xs flex items-center gap-2 animate-in fade-in">
                <Check size={16} className="shrink-0" />
                <span className="font-semibold">{formSuccess}</span>
              </div>
            )}

            {/* 1. English Name (Required, Large 16px) */}
            <div>
              <label className="text-xs font-bold text-text-main block mb-1">
                {isAm ? 'የእቃ ስም (እንግሊዝኛ) *' : 'Product Name (English) *'}
              </label>
              <input
                ref={nameInputRef}
                type="text"
                required
                placeholder={isAm ? 'ለምሳሌ Cooking Oil 1L' : 'e.g. Cooking Oil 1L'}
                value={nameEn}
                onChange={(e) => setNameEn(e.target.value)}
                className="w-full h-12 px-4 rounded-xl bg-surface border border-border-subtle text-base font-semibold text-text-main placeholder-text-dim focus:outline-hidden focus:border-primary transition-colors"
              />
            </div>

            {/* 2. Amharic Name (Optional) */}
            <div>
              <label className="text-xs font-bold text-text-main block mb-1">
                {isAm ? 'የእቃ ስም (አማርኛ - አማራጭ)' : 'Product Name (Amharic - Optional)'}
              </label>
              <input
                type="text"
                placeholder={isAm ? 'ለምሳሌ የምግብ ዘይት 1 ሊትር' : 'e.g. የምግብ ዘይት 1 ሊትር'}
                value={nameAm}
                onChange={(e) => setNameAm(e.target.value)}
                className="w-full h-12 px-4 rounded-xl bg-surface border border-border-subtle text-base font-semibold text-text-main placeholder-text-dim focus:outline-hidden focus:border-primary transition-colors"
              />
            </div>

            {/* 3. Category (Required) + Inline Category Add Option */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-text-main flex items-center gap-1.5">
                  <Tag size={14} className="text-primary" />
                  <span>{isAm ? 'ምድብ (Category) *' : 'Category *'}</span>
                </label>
                <button
                  type="button"
                  onClick={() => setShowInlineCatAdd((prev) => !prev)}
                  className="text-xs text-primary hover:underline font-bold flex items-center gap-1"
                >
                  <Plus size={13} />
                  {showInlineCatAdd
                    ? (isAm ? 'ሰርዝ' : 'Close')
                    : (isAm ? '+ አዲስ ምድብ ጨምር' : '+ Add new category')}
                </button>
              </div>

              {/* Inline Category Mini Form */}
              {showInlineCatAdd && (
                <form
                  onSubmit={handleCreateCategoryInline}
                  className="p-4 rounded-2xl bg-surface-2 border border-border-subtle space-y-3 animate-in fade-in"
                >
                  <div className="text-xs font-bold text-text-main">
                    {isAm ? 'አዲስ ምድብ መፍጠሪያ' : 'Create New Category'}
                  </div>

                  {inlineCatError && (
                    <div className="text-xs text-rose-500 font-semibold">{inlineCatError}</div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <input
                      type="text"
                      required
                      placeholder="Category name (EN)"
                      value={inlineCatNameEn}
                      onChange={(e) => setInlineCatNameEn(e.target.value)}
                      className="w-full h-10 px-3 rounded-xl bg-surface border border-border-subtle text-sm text-text-main"
                    />
                    <input
                      type="text"
                      placeholder="የምድብ ስም (አማርኛ)"
                      value={inlineCatNameAm}
                      onChange={(e) => setInlineCatNameAm(e.target.value)}
                      className="w-full h-10 px-3 rounded-xl bg-surface border border-border-subtle text-sm text-text-main"
                    />
                  </div>

                  {/* Preset Colors */}
                  <div className="flex items-center gap-2 pt-1">
                    <span className="text-[11px] font-semibold text-text-muted">
                      {isAm ? 'ቀለም:' : 'Color:'}
                    </span>
                    <div className="flex items-center gap-1.5">
                      {PRESET_COLORS.map((col) => (
                        <button
                          key={col}
                          type="button"
                          onClick={() => setInlineCatColor(col)}
                          style={{ backgroundColor: col }}
                          className={`w-6 h-6 rounded-full transition-transform ${inlineCatColor === col ? 'ring-2 ring-offset-2 ring-primary scale-110' : ''
                            }`}
                        />
                      ))}
                    </div>
                  </div>

                  <div className="flex justify-end gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setShowInlineCatAdd(false)}
                      className="px-3 py-1.5 rounded-xl text-xs font-semibold text-text-muted hover:text-text-main"
                    >
                      {isAm ? 'ተመለስ' : 'Cancel'}
                    </button>
                    <button
                      type="submit"
                      disabled={inlineCatSaving}
                      className="px-4 py-1.5 rounded-xl bg-primary text-white text-xs font-bold shadow-xs hover:opacity-90 disabled:opacity-50"
                    >
                      {inlineCatSaving
                        ? (isAm ? 'በመመዝገብ ላይ...' : 'Saving...')
                        : (isAm ? 'ምድብ መዝግብ' : 'Save Category')}
                    </button>
                  </div>
                </form>
              )}

              <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="w-full h-12 px-4 rounded-xl bg-surface border border-border-subtle text-base font-semibold text-text-main focus:outline-hidden focus:border-primary transition-colors"
              >
                {categoriesList.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name_en} {c.name_am ? `(${c.name_am})` : ''}
                  </option>
                ))}
              </select>
            </div>

            {/* 4. Barcode (Scan / Type / Auto Generator / Instant Duplicate Check) */}
            <div className="space-y-2 p-4 rounded-2xl bg-surface-2 border border-border-subtle">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-text-main flex items-center gap-1.5">
                  <Barcode size={15} className="text-primary" />
                  <span>{isAm ? 'ባርኮድ (ስካን ወይም ፃፍ)' : 'Barcode (Scan or Type)'}</span>
                </label>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsCameraScannerOpen(true)}
                    className="px-3 py-1 rounded-lg bg-primary/10 border border-primary/30 text-primary hover:bg-primary/20 text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <Camera size={13} />
                    {isAm ? 'በካሜራ ስካን' : 'Scan Camera'}
                  </button>
                  <button
                    type="button"
                    onClick={handleGenerateBarcode}
                    className="px-3 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20 text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <Sparkles size={12} />
                    {isAm ? 'ኮድ አዘጋጅልኝ' : 'Make a code for me'}
                  </button>
                </div>
              </div>

              <div className="relative">
                <input
                  ref={barcodeInputRef}
                  type="text"
                  placeholder={isAm ? 'ባርኮድ ስካን ያድርጉ ወይም ቁጥሩን እዚህ ይፃፉ' : 'Scan barcode or type barcode number'}
                  value={barcode}
                  onChange={(e) => setBarcode(e.target.value)}
                  className={`w-full h-12 px-4 rounded-xl bg-surface border font-mono text-base font-bold text-text-main placeholder-text-dim focus:outline-hidden ${duplicateWarning?.exists
                    ? 'border-rose-500 bg-rose-500/10'
                    : 'border-border-subtle focus:border-primary'
                    }`}
                />
                {barcodeChecking && (
                  <div className="absolute right-4 top-3.5">
                    <RefreshCw size={16} className="animate-spin text-text-muted" />
                  </div>
                )}
              </div>

              {/* Instant Duplicate Warning with Product Link */}
              {duplicateWarning?.exists && (
                <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-500 text-xs flex items-start gap-2 animate-in fade-in">
                  <AlertTriangle size={15} className="shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold">{isAm ? 'የተደገመ ባርኮድ ማስጠንቀቂያ:' : 'Duplicate Barcode Warning:'}</span>{' '}
                    {isAm
                      ? `ይህ ባርኮድ አስቀድሞ ለ"${duplicateWarning.productName}" (${duplicateWarning.productSku}) ተሰጥቷል። ባርኮዶች በካታሎግ ውስጥ ልዩ መሆን አለባቸው።`
                      : `This barcode is already assigned to "${duplicateWarning.productName}" (${duplicateWarning.productSku}). Every product must have a unique barcode.`}
                  </div>
                </div>
              )}
            </div>

            {/* 5. Unit of Measure (Required Dropdown + Pack Multiplier) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-bold text-text-main block mb-1">
                  {isAm ? 'መለኪያ አሃድ (Unit) *' : 'Unit of Measure (UOM) *'}
                </label>
                <select
                  value={uomCode}
                  onChange={(e) => setUomCode(e.target.value)}
                  className="w-full h-12 px-4 rounded-xl bg-surface border border-border-subtle text-base font-semibold text-text-main focus:outline-hidden focus:border-primary transition-colors"
                >
                  {STANDARD_UOMS.map((u) => (
                    <option key={u.code} value={u.code}>
                      {u.code} - {isAm ? u.name_am : u.name_en}
                    </option>
                  ))}
                </select>
              </div>

              {/* Pack Multiplier (automatically visible when Pack/Box/Carton/Dozen or multiplier > 1) */}
              {(isPackUnit || packMultiplier > 1) && (
                <div className="animate-in fade-in">
                  <label className="text-xs font-bold text-text-main block mb-1 flex items-center gap-1.5">
                    <Layers size={13} className="text-primary" />
                    <span>{isAm ? 'በአንድ ፓኬት ውስጥ ያለው ብዛት' : 'Pack Multiplier (Pieces)'}</span>
                  </label>
                  <input
                    type="number"
                    min={1}
                    step={1}
                    value={packMultiplier}
                    onChange={(e) => setPackMultiplier(Math.max(1, parseInt(e.target.value, 10) || 1))}
                    className="w-full h-12 px-4 rounded-xl bg-surface border border-border-subtle text-base font-mono font-bold text-text-main focus:outline-hidden focus:border-primary"
                  />
                </div>
              )}
            </div>

            {/* 6. Pricing & Bidirectional Automatic VAT Calculator */}
            <div className="p-4 rounded-2xl bg-surface-2 border border-border-subtle space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <h3 className="text-xs font-black uppercase tracking-wider text-text-main flex items-center gap-1.5">
                  <DollarSign size={15} className="text-primary" />
                  <span>{isAm ? 'የዋጋ እና ተ.እ.ታ (VAT) ስሌት' : 'Price & Automatic VAT Calculation'}</span>
                </h3>

                {isEdit && product?.id && (
                  <button
                    type="button"
                    onClick={() => setIsPriceHistoryOpen(true)}
                    className="px-2.5 py-1 rounded-lg bg-surface border border-border-subtle text-text-muted hover:text-text-main text-xs font-bold flex items-center gap-1 transition-colors"
                  >
                    <History size={12} />
                    <span>{isAm ? 'የዋጋ ታሪክ' : 'Price History'}</span>
                  </button>
                )}
              </div>

              {/* VAT Switch (Taxable 15% vs Exempt 0%) */}
              <div className="p-3 rounded-xl bg-surface border border-border-subtle flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Percent size={15} className="text-primary" />
                  <span className="text-xs font-bold text-text-main">
                    {isAm ? 'ተጨማሪ እሴት ታክስ (VAT 15%):' : 'Value Added Tax (15%):'}
                  </span>
                </div>
                <div className="flex items-center gap-4">
                  <label className="inline-flex items-center gap-1.5 text-xs font-semibold cursor-pointer">
                    <input
                      type="radio"
                      name="vatApplicable"
                      checked={isVatApplicable}
                      onChange={() => handleVatToggle(true, 0.15)}
                      className="text-primary focus:ring-0 cursor-pointer"
                    />
                    <span>{isAm ? 'የሚከፈልበት (15%)' : 'Taxable (15%)'}</span>
                  </label>
                  <label className="inline-flex items-center gap-1.5 text-xs font-semibold cursor-pointer">
                    <input
                      type="radio"
                      name="vatApplicable"
                      checked={!isVatApplicable}
                      onChange={() => handleVatToggle(false, 0)}
                      className="text-primary focus:ring-0 cursor-pointer"
                    />
                    <span>{isAm ? 'ነጻ (Exempt 0%)' : 'Tax Exempt (0%)'}</span>
                  </label>
                </div>
              </div>

              {/* Bidirectional Price Pair */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Price Before VAT */}
                <div>
                  <label className="text-xs font-bold text-text-muted block mb-1">
                    {isAm ? 'ዋጋ ያለ ተ.እ.ታ (Price Before VAT)' : 'Price Before VAT (Net ETB)'}
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    disabled={!canChangePrice}
                    value={priceBeforeVat}
                    onChange={(e) => handlePriceBeforeVatChange(e.target.value)}
                    placeholder="0.00"
                    className="w-full h-12 px-4 rounded-xl bg-surface border border-border-subtle text-base font-mono font-semibold text-text-main focus:outline-hidden focus:border-primary disabled:opacity-50"
                  />
                  <div className="text-[11px] text-text-muted mt-1">
                    {isAm ? 'ያለ 15% ተ.እ.ታ የተጣራ ዋጋ' : 'Net base price before tax'}
                  </div>
                </div>

                {/* Price After VAT (Bold Shelf Price) */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-extrabold text-text-main flex items-center gap-1">
                      <span>{isAm ? 'የመደርደሪያ ዋጋ ከተ.እ.ታ ጋር *' : 'Shelf Price After VAT (Gross) *'}</span>
                    </label>
                    {!canChangePrice && (
                      <span className="text-[10px] text-amber-500 font-bold flex items-center gap-1">
                        <Lock size={10} /> {isAm ? 'የተቆለፈ' : 'Locked'}
                      </span>
                    )}
                  </div>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    disabled={!canChangePrice}
                    value={priceAfterVat}
                    onChange={(e) => handlePriceAfterVatChange(e.target.value)}
                    placeholder="0.00"
                    className="w-full h-12 px-4 rounded-xl bg-surface border-2 border-primary text-lg font-mono font-black text-text-main focus:outline-hidden shadow-xs disabled:opacity-50"
                  />
                  <div className="text-[11px] font-semibold text-primary mt-1 flex items-center justify-between">
                    <span>
                      {isVatApplicable
                        ? `VAT (15%): ETB ${vatBreakdown.vatAmount.toFixed(2)}`
                        : (isAm ? 'ከታክስ ነጻ (0.00 ETB)' : 'Tax Exempt (0.00 ETB)')}
                    </span>
                    <span className="text-text-muted text-[10px]">
                      {isAm ? 'ደንበኞች የሚከፍሉት ዋጋ' : 'Customer pays this'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Profit Margin & AVCO Cost Line */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
                <div>
                  <label className="text-xs font-bold text-text-main block mb-1">
                    {isAm ? 'የግዢ ወጪ ዋጋ (Cost Price ETB)' : 'Cost Price (AVCO ETB)'}
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={costPrice || ''}
                    onChange={(e) => setCostPrice(parseFloat(e.target.value) || 0)}
                    placeholder="0.00"
                    className="w-full h-11 px-4 rounded-xl bg-surface border border-border-subtle text-sm font-mono font-semibold text-text-main focus:outline-hidden focus:border-primary"
                  />
                </div>

                <div className="flex flex-col justify-end">
                  <div className="p-2.5 rounded-xl bg-surface border border-border-subtle flex items-center justify-between text-xs">
                    <span className="font-semibold text-text-muted">
                      {isAm ? 'የትርፍ ህዳግ:' : 'Gross Margin:'}
                    </span>
                    <div className="flex items-center gap-2">
                      <span className={`font-mono font-bold ${vatBreakdown.isNegativeMargin ? 'text-rose-500' : 'text-emerald-500'}`}>
                        {vatBreakdown.profitMarginBirr > 0 ? '+' : ''}{vatBreakdown.profitMarginBirr.toFixed(2)} ETB
                      </span>
                      <span className={`px-2 py-0.5 rounded-full font-mono text-[10px] font-bold ${vatBreakdown.isNegativeMargin ? 'bg-rose-500/10 text-rose-500' : 'bg-emerald-500/10 text-emerald-500'
                        }`}>
                        {vatBreakdown.profitMarginPercent.toFixed(1)}%
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Mandatory Reason for Price Change if editing existing price */}
              {isEdit && product && Number(product.base_price) !== (parseFloat(priceAfterVat) || 0) && (
                <div className="pt-2 animate-in fade-in">
                  <label className="text-xs font-bold text-amber-600 dark:text-amber-400 block mb-1">
                    {isAm ? 'የዋጋ ለውጥ ምክንያት (የኦዲት መስፈርት) *' : 'Reason for Price Change (Mandatory Audit Requirement) *'}
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Supplier invoice revision, tariff update"
                    value={priceChangeReason}
                    onChange={(e) => setPriceChangeReason(e.target.value)}
                    className="w-full h-11 px-4 rounded-xl bg-surface border border-amber-500/40 text-sm font-semibold text-text-main focus:outline-hidden focus:border-amber-500"
                  />
                </div>
              )}
            </div>

            {/* 7. Minimum Stock Level */}
            <div>
              <label className="text-xs font-bold text-text-main block mb-1">
                {isAm ? 'ዝቅተኛ የክምችት መጠን (Min Stock Alert Level)' : 'Minimum Stock Level (Alert Point)'}
              </label>
              <input
                type="number"
                min={0}
                value={minStockLevel}
                onChange={(e) => setMinStockLevel(parseInt(e.target.value, 10) || 0)}
                className="w-full h-11 px-4 rounded-xl bg-surface border border-border-subtle text-base font-mono font-bold text-text-main focus:outline-hidden focus:border-primary"
              />
            </div>

            {/* 8. Expiry Date Required Switch & Expiry Control */}
            <div className="p-4 rounded-2xl bg-surface-2 border border-border-subtle space-y-3">
              <label className="flex items-center justify-between cursor-pointer">
                <div className="flex items-center gap-2.5">
                  <Clock size={18} className="text-amber-500" />
                  <div>
                    <span className="text-xs font-bold text-text-main">
                      {isAm ? 'ይህ እቃ የጊዜ ማብቂያ ቀን አለው (Has Expiry Date)' : 'This Item Has an Expiry Date'}
                    </span>
                    <p className="text-[11px] text-text-muted">
                      {isAm
                        ? 'ሲበራ ክምችት ሲገባ እና ሲሸጥ የFEFO ባች ቁጥጥር ይደረግበታል'
                        : 'Enforces FEFO batch tracking, 90-day expiry notifications, and cashier alerts'}
                    </p>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={hasExpiryDate}
                  onChange={(e) => setHasExpiryDate(e.target.checked)}
                  className="w-5 h-5 rounded-md text-primary focus:ring-0 cursor-pointer"
                />
              </label>

              {/* Show ExpiryDatePicker when Has Expiry Date is checked */}
              {hasExpiryDate && (
                <div className="pt-2 border-t border-border-subtle animate-in fade-in">
                  <ExpiryDatePicker
                    value={defaultExpiryDate}
                    onChange={setDefaultExpiryDate}
                    label={isAm ? 'የመጀመሪያ ክምችት ማለቂያ ቀን (Default Batch Expiry)' : 'Default Batch Expiry Date'}
                  />
                </div>
              )}
            </div>

            {/* 9. Product Photo Direct Upload (Camera / File, NO URL fields) */}
            <div className="space-y-1">
              <label className="text-xs font-bold text-text-main block mb-1">
                {isAm ? 'የእቃው ፎቶ (Product Photo)' : 'Product Photo'}
              </label>
              <ProductPhotoUpload
                currentPhotoUrl={currentPhotoUrl}
                onPhotoSelected={(file) => {
                  setPhotoFile(file);
                  if (!file) setCurrentPhotoUrl(null);
                }}
                disabled={saving}
              />
            </div>

            {/* Active vs Archived Status */}
            <div className="p-3.5 rounded-2xl bg-surface-2 border border-border-subtle flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Archive size={15} className="text-text-muted" />
                <span className="text-xs font-bold text-text-main">
                  {isAm ? 'የእቃው ሁኔታ (Status)' : 'Product Status'}
                </span>
              </div>
              <div className="flex items-center gap-4">
                <label className="inline-flex items-center gap-1.5 text-xs font-semibold cursor-pointer">
                  <input
                    type="radio"
                    name="productActiveStatus"
                    checked={isActive}
                    onChange={() => setIsActive(true)}
                    className="text-primary focus:ring-0"
                  />
                  <span>{isAm ? 'ንቁ (Active)' : 'Active'}</span>
                </label>
                <label className="inline-flex items-center gap-1.5 text-xs font-semibold cursor-pointer">
                  <input
                    type="radio"
                    name="productActiveStatus"
                    checked={!isActive}
                    onChange={() => setIsActive(false)}
                    className="text-amber-500 focus:ring-0"
                  />
                  <span>{isAm ? 'የታገደ (Archived)' : 'Archived'}</span>
                </label>
              </div>
            </div>
          </div>

          {/* Footer Action Bar: Save & Save and Add Another */}
          <div className="px-6 py-4 border-t border-border-subtle bg-surface-2 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2.5 rounded-xl bg-surface hover:bg-surface-2 border border-border-subtle text-xs font-bold text-text-main transition-colors"
              >
                {isAm ? 'ተመለስ' : 'Cancel'}
              </button>

              {isEdit && product?.id && hasPermission('MANAGE_PRODUCTS') && (
                <button
                  type="button"
                  disabled={deleting || saving}
                  onClick={handleDeleteProduct}
                  className="px-3.5 py-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 dark:hover:bg-rose-900/60 border border-rose-200 dark:border-rose-800 text-xs font-bold text-rose-600 dark:text-rose-400 flex items-center gap-1.5 transition-colors disabled:opacity-50 cursor-pointer"
                  title={isAm ? 'እቃውን ሰርዝ' : 'Delete Product'}
                >
                  {deleting ? <RefreshCw size={13} className="animate-spin" /> : <Trash2 size={13} />}
                  <span>{deleting ? (isAm ? 'በመሰረዝ ላይ...' : 'Deleting...') : (isAm ? 'እቃውን ሰርዝ' : 'Delete Product')}</span>
                </button>
              )}
            </div>

            <div className="flex items-center gap-2">
              {!isEdit && (
                <button
                  type="button"
                  disabled={saving || duplicateWarning?.exists}
                  onClick={() => handleSave(true)}
                  className="px-4 py-2.5 rounded-xl border border-primary text-primary hover:bg-primary/10 text-xs font-bold transition-colors disabled:opacity-50"
                >
                  {isAm ? 'መዝግብ እና ሌላ ጨምር' : 'Save & Add Another'}
                </button>
              )}

              <button
                type="button"
                disabled={saving || duplicateWarning?.exists}
                onClick={() => handleSave(false)}
                className="btn-primary px-6 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 shadow-md disabled:opacity-50"
              >
                {saving ? <RefreshCw size={14} className="animate-spin" /> : <Check size={14} />}
                {saving
                  ? (isAm ? 'በመመዝገብ ላይ...' : 'Saving...')
                  : isEdit
                    ? (isAm ? 'ለውጦችን መዝግብ' : 'Update Product')
                    : (isAm ? 'እቃ መዝግብ' : 'Save Product')}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Price History Modal */}
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
          onPriceUpdated={() => { }}
        />
      )}

      {/* Phone Camera Barcode Scanner */}
      <CameraBarcodeScanner
        isOpen={isCameraScannerOpen}
        onClose={() => setIsCameraScannerOpen(false)}
        onDetected={(code) => setBarcode(code)}
        title={isAm ? 'ባርኮድ በካሜራ ስካን' : 'Scan Product Barcode'}
      />
    </div>
  );
};
