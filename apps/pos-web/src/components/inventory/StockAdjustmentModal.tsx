import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  RefreshCw,
  AlertCircle,
  AlertTriangle,
  Trash2,
  ShieldAlert,
  ClipboardCheck,
  Coffee,
  PackagePlus,
  CheckCircle2,
  ArrowRight,
  Calendar,
  Lock,
} from 'lucide-react';
import { useAuth } from '../../auth/AuthContext';
import { useI18n } from '../../i18n/I18nContext';

export type AdjustmentReasonOption =
  | 'DAMAGED_GOODS'
  | 'EXPIRED'
  | 'THEFT'
  | 'COUNT_CORRECTION'
  | 'INTERNAL_USE'
  | 'FOUND_STOCK';

export interface AdjustableProduct {
  id: string;
  sku: string;
  name_en: string;
  name_am?: string | null;
  uom_code?: string;
  stock_on_hand?: number | string;
  cost_price?: number | string;
  base_price?: number | string;
}

interface ProductBatchOption {
  id: string;
  batchNumber: string;
  expiryDate: string | null;
  currentQuantity: number;
  unitCost: number;
  daysLeft: number | null;
}

interface StockAdjustmentModalProps {
  isOpen: boolean;
  product: AdjustableProduct | null;
  initialReason?: AdjustmentReasonOption;
  onClose: () => void;
  onSuccess: (message: string, productId: string, newStock: number) => void;
}

interface ReasonMeta {
  id: AdjustmentReasonOption;
  labelEn: string;
  labelAm: string;
  descEn: string;
  descAm: string;
  mode: 'DEDUCT' | 'ADD' | 'COUNT';
  colorClass: string;
  activeBorder: string;
  icon: React.ComponentType<{ size?: number | string; className?: string }>;
  chips: Array<{ en: string; am: string }>;
  placeholderEn: string;
  placeholderAm: string;
}

const REASON_CONFIGS: ReasonMeta[] = [
  {
    id: 'DAMAGED_GOODS',
    labelEn: 'Damaged / Spoiled',
    labelAm: 'የተበላሸ / የተሰበረ',
    descEn: 'Broken, leaked, or unsellable stock',
    descAm: 'የተሰበረ፣ የፈሰሰ ወይም ለሽያጭ የማይሆን',
    mode: 'DEDUCT',
    colorClass: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
    activeBorder: 'border-amber-500 bg-amber-500/10 ring-2 ring-amber-500/20',
    icon: AlertTriangle,
    chips: [
      { en: 'Broken in store', am: 'በሱቅ ውስጥ የተሰበረ' },
      { en: 'Packaging torn / leaked', am: 'ማሸጊያ የተቀደደ / የፈሰሰ' },
      { en: 'Spoiled / Moldy', am: 'የተበላሸ / የሻገተ' },
      { en: 'Customer dropped', am: 'ደንበኛ የሰበረው' },
      { en: 'Supplier defect', am: 'ከአቅራቢ በችግር የመጣ' },
    ],
    placeholderEn: 'Describe how the item was damaged...',
    placeholderAm: 'እቃው እንዴት እንደተበላሸ ይግለጹ...',
  },
  {
    id: 'EXPIRED',
    labelEn: 'Expired Goods',
    labelAm: 'ጊዜው ያለፈበት',
    descEn: 'Write off expired shelf or batch stock',
    descAm: 'የመጠቀሚያ ቀኑ ያለፈበትን እቃ ማስወገድ',
    mode: 'DEDUCT',
    colorClass: 'bg-rose-500/10 text-rose-600 dark:text-rose-400',
    activeBorder: 'border-rose-500 bg-rose-500/10 ring-2 ring-rose-500/20',
    icon: Trash2,
    chips: [
      { en: 'Expired on shelf', am: 'መደርደሪያ ላይ ጊዜው ያለፈበት' },
      { en: 'Past sell-by date', am: 'የመሸጫ ቀኑ ያለፈበት' },
      { en: 'FEFO batch disposal', am: 'በFEFO ፍተሻ የተወገደ' },
    ],
    placeholderEn: 'Batch number or expiry disposal details...',
    placeholderAm: 'የባች ቁጥር ወይም የማስወገጃ ዝርዝር...',
  },
  {
    id: 'THEFT',
    labelEn: 'Lost / Theft',
    labelAm: 'የጠፋ / የተሰረቀ',
    descEn: 'Missing items or unexplained shrinkage',
    descAm: 'የጠፋ፣ የተሰረቀ ወይም በፍተሻ የጎደለ',
    mode: 'DEDUCT',
    colorClass: 'bg-purple-500/10 text-purple-600 dark:text-purple-400',
    activeBorder: 'border-purple-500 bg-purple-500/10 ring-2 ring-purple-500/20',
    icon: ShieldAlert,
    chips: [
      { en: 'Shoplifting / Theft', am: 'ስርቆት / የጠፋ' },
      { en: 'Missing during shelf check', am: 'በፍተሻ የጎደለ' },
      { en: 'Unaccounted shrinkage', am: 'ያልታወቀ ጉድለት' },
      { en: 'Delivery shortage', am: 'በርክክብ ወቅት የጎደለ' },
    ],
    placeholderEn: 'Incident details or when shortage was noticed...',
    placeholderAm: 'ስለ ጉድለቱ ወይም ስለ ስርቆቱ ዝርዝር...',
  },
  {
    id: 'COUNT_CORRECTION',
    labelEn: 'Count Correction',
    labelAm: 'የቆጠራ ማስተካከያ',
    descEn: 'Enter actual shelf count to auto-adjust',
    descAm: 'ትክክለኛውን የመደርደሪያ ቆጠራ በማስገባት ማስተካከል',
    mode: 'COUNT',
    colorClass: 'bg-sky-500/10 text-sky-600 dark:text-sky-400',
    activeBorder: 'border-sky-500 bg-sky-500/10 ring-2 ring-sky-500/20',
    icon: ClipboardCheck,
    chips: [
      { en: 'Physical shelf recount', am: 'የመደርደሪያ ዳግም ቆጠራ' },
      { en: 'Initial entry mistake', am: 'የመጀመሪያ አመዘጋገብ ስህተት' },
      { en: 'Unit/Pack conversion fix', am: 'የመለኪያ (ፍሬ/ካርቶን) ማስተካከያ' },
    ],
    placeholderEn: 'Reason for count discrepancy...',
    placeholderAm: 'የቆጠራ ልዩነት ምክንያት...',
  },
  {
    id: 'INTERNAL_USE',
    labelEn: 'Internal Use',
    labelAm: 'ለውስጥ አገልግሎት',
    descEn: 'Used for cleaning, staff, or store ops',
    descAm: 'ለሱቅ ጽዳት፣ ለሰራተኞች ወይም ለውስጥ ስራ',
    mode: 'DEDUCT',
    colorClass: 'bg-teal-500/10 text-teal-600 dark:text-teal-400',
    activeBorder: 'border-teal-500 bg-teal-500/10 ring-2 ring-teal-500/20',
    icon: Coffee,
    chips: [
      { en: 'Store cleaning', am: 'ለሱቅ ጽዳት' },
      { en: 'Staff breakroom / tea', am: 'ለሰራተኞች ሻይ / ምግብ' },
      { en: 'Kitchen / Bakery prep', am: 'ለማብሰያ / ዳቦ ቤት' },
      { en: 'Packaging / Operations', am: 'ለማሸጊያ / ለስራ' },
      { en: 'Customer sampling', am: 'ለደንበኛ ቅምሻ' },
    ],
    placeholderEn: 'Department or staff member using item...',
    placeholderAm: 'የተጠቀመው ክፍል ወይም ሰራተኛ...',
  },
  {
    id: 'FOUND_STOCK',
    labelEn: 'Found / Extra',
    labelAm: 'ተጨማሪ የተገኘ',
    descEn: 'Add unrecorded or recovered stock',
    descAm: 'መጋዘን ውስጥ የተገኘ ወይም ያልተመዘገበ እቃ መጨመር',
    mode: 'ADD',
    colorClass: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
    activeBorder: 'border-emerald-500 bg-emerald-500/10 ring-2 ring-emerald-500/20',
    icon: PackagePlus,
    chips: [
      { en: 'Found in backroom', am: 'መጋዘን ውስጥ የተገኘ' },
      { en: 'Unrecorded delivery', am: 'ያልተመዘገበ ገቢ' },
      { en: 'Returned to shelf', am: 'ወደ መደርደሪያ የተመለሰ' },
    ],
    placeholderEn: 'Where the extra stock was found...',
    placeholderAm: 'ተጨማሪው እቃ የት እንደተገኘ...',
  },
];

export const StockAdjustmentModal: React.FC<StockAdjustmentModalProps> = ({
  isOpen,
  product,
  initialReason = 'DAMAGED_GOODS',
  onClose,
  onSuccess,
}) => {
  const { currentUser, fetchWithAuth } = useAuth();
  const { language } = useI18n();
  const isAm = language === 'am';

  const currentStock = Number(product?.stock_on_hand || 0);
  const costPrice = Number(product?.cost_price || 0);
  const uom = product?.uom_code || 'PCS';

  const [reason, setReason] = useState<AdjustmentReasonOption>(initialReason);
  const [qtyInput, setQtyInput] = useState<string>('1');
  const [physicalCountInput, setPhysicalCountInput] = useState<string>(String(currentStock));
  const [notes, setNotes] = useState<string>('');
  const [selectedBatchId, setSelectedBatchId] = useState<string>('');
  const [batches, setBatches] = useState<ProductBatchOption[]>([]);
  const [loadingBatches, setLoadingBatches] = useState<boolean>(false);
  const [managerPin, setManagerPin] = useState<string>('');
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const activeMeta = useMemo(
    () => REASON_CONFIGS.find((r) => r.id === reason) || REASON_CONFIGS[0],
    [reason],
  );

  // Reset form when modal opens or product changes
  useEffect(() => {
    if (!isOpen || !product) return;
    setReason(initialReason);
    setQtyInput('1');
    setPhysicalCountInput(String(Number(product.stock_on_hand || 0)));
    setNotes('');
    setSelectedBatchId('');
    setManagerPin('');
    setError(null);

    // Fetch batches for this product (helpful for Expired / Damaged)
    const loadBatches = async () => {
      setLoadingBatches(true);
      try {
        const res = await (fetchWithAuth || fetch)(`/api/inventory/batches?productId=${product.id}`, {
          headers: {
            'x-branch-id': currentUser?.branchId || '00000000-0000-0000-0000-000000000001',
          },
        });
        if (res.ok) {
          const data = await res.json();
          const list: ProductBatchOption[] = (Array.isArray(data) ? data : data.batches || [])
            .filter((b: any) => Number(b.current_quantity ?? b.currentQuantity ?? 0) > 0)
            .map((b: any) => {
              const exp = b.expiry_date || b.expiryDate || null;
              let daysLeft: number | null = null;
              if (exp) {
                const diff = new Date(exp).getTime() - Date.now();
                daysLeft = Math.ceil(diff / 86400000);
              }
              return {
                id: b.id || b.batchId,
                batchNumber: b.batch_number || b.batchNumber || 'BATCH',
                expiryDate: exp ? String(exp).slice(0, 10) : null,
                currentQuantity: Number(b.current_quantity ?? b.currentQuantity ?? 0),
                unitCost: Number(b.unit_cost ?? b.unitCost ?? costPrice),
                daysLeft,
              };
            });
          setBatches(list);
        }
      } catch {
        setBatches([]);
      } finally {
        setLoadingBatches(false);
      }
    };
    loadBatches();
  }, [isOpen, product?.id]);

  // Compute actual quantityChange based on reason mode
  const quantityChange = useMemo(() => {
    if (activeMeta.mode === 'COUNT') {
      const actual = parseFloat(physicalCountInput);
      if (isNaN(actual)) return 0;
      return Number((actual - currentStock).toFixed(3));
    }
    const raw = Math.abs(parseFloat(qtyInput) || 0);
    if (raw === 0) return 0;
    return activeMeta.mode === 'ADD' ? raw : -raw;
  }, [activeMeta.mode, physicalCountInput, qtyInput, currentStock]);

  const newStock = Number((currentStock + quantityChange).toFixed(3));
  const absQty = Math.abs(quantityChange);
  const estimatedCostImpact = absQty * costPrice;
  const requiresManagerApproval =
    quantityChange < 0 && (absQty > 20 || estimatedCostImpact > 5000);
  const isManagerRole =
    currentUser?.role === 'OWNER' ||
    currentUser?.role === 'MANAGER' ||
    currentUser?.role === 'HQ_ADMIN';

  if (!isOpen || !product) return null;

  const handleSelectBatch = (b: ProductBatchOption) => {
    if (selectedBatchId === b.id) {
      setSelectedBatchId('');
      return;
    }
    setSelectedBatchId(b.id);
    if (activeMeta.mode === 'DEDUCT') {
      setQtyInput(String(b.currentQuantity));
    }
    if (!notes.trim()) {
      setNotes(
        isAm
          ? `ባች ${b.batchNumber} (${b.expiryDate || ''})`
          : `Batch ${b.batchNumber}${b.expiryDate ? ` (Exp: ${b.expiryDate})` : ''}`,
      );
    }
  };

  const handleAppendChip = (chipText: string) => {
    setNotes((prev) => {
      if (!prev.trim()) return chipText;
      if (prev.includes(chipText)) return prev;
      return `${prev.trim()} • ${chipText}`;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (quantityChange === 0) {
      setError(
        activeMeta.mode === 'COUNT'
          ? isAm
            ? 'የተቆጠረው ብዛት አሁን ካለው ክምችት ጋር እኩል ነው (ምንም ለውጥ የለም)።'
            : 'Actual count matches current stock (no adjustment needed).'
          : isAm
            ? 'እባክዎ ከዜሮ በላይ ብዛት ያስገቡ።'
            : 'Please enter a quantity greater than 0.',
      );
      return;
    }

    if (!notes.trim()) {
      setError(
        isAm
          ? 'እባክዎ የማስተካከያውን ምክንያት ወይም ማስታወሻ ያስገቡ።'
          : 'Please select a quick reason or enter audit notes.',
      );
      return;
    }

    if (requiresManagerApproval && !isManagerRole && !managerPin.trim()) {
      setError(
        isAm
          ? 'ከ20 ፍሬ በላይ ወይም ከ5,000 ብር በላይ ቅናሽ የስራ አስኪያጅ PIN ያስፈልገዋል።'
          : 'Large write-offs (>20 units or >5,000 ETB) require a Manager PIN.',
      );
      return;
    }

    setSubmitting(true);
    try {
      const payload: any = {
        reasonCode: reason,
        notes: notes.trim(),
        items: [
          {
            productId: product.id,
            quantityChange,
            ...(selectedBatchId ? { batchId: selectedBatchId } : {}),
            ...(costPrice > 0 ? { unitCost: costPrice } : {}),
          },
        ],
      };

      if (requiresManagerApproval) {
        if (isManagerRole && currentUser?.id) {
          payload.approvedBy = currentUser.id;
        } else if (managerPin.trim()) {
          payload.managerPin = managerPin.trim();
        }
      }

      const res = await (fetchWithAuth || fetch)('/api/inventory/adjustments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-branch-id': currentUser?.branchId || '00000000-0000-0000-0000-000000000001',
          'x-user-id': currentUser?.id || '00000000-0000-0000-0000-000000000002',
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        const errMsg = Array.isArray(errData.message)
          ? errData.message.join(', ')
          : errData.message || 'Failed to save stock adjustment';
        throw new Error(errMsg);
      }

      const displayName = isAm && product.name_am ? product.name_am : product.name_en;
      onSuccess(
        isAm
          ? `የ "${displayName}" ክምችት በተሳካ ሁኔታ ተስተካክሏል (${quantityChange > 0 ? `+${quantityChange}` : quantityChange} ${uom})`
          : `Stock updated for "${displayName}" (${quantityChange > 0 ? `+${quantityChange}` : quantityChange} ${uom})`,
        product.id,
        newStock,
      );
      onClose();
    } catch (err: any) {
      setError(err.message || 'Adjustment failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-3 sm:p-4 animate-in fade-in select-none"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-surface rounded-3xl shadow-2xl border border-border-subtle w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden text-text-main">
        {/* Header */}
        <div className="shrink-0 flex items-center justify-between px-6 py-4 border-b border-border-subtle bg-surface-2/40">
          <div className="flex items-center gap-3 min-w-0">
            <div className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 ${activeMeta.colorClass}`}>
              <activeMeta.icon size={20} />
            </div>
            <div className="min-w-0">
              <h3 className="text-base font-black text-text-main truncate">
                {isAm ? 'የክምችት ማስተካከያ እና ቁጥጥር' : 'Stock Adjustment & Write-off'}
              </h3>
              <p className="text-xs text-text-muted truncate">
                <span className="font-bold text-text-main">
                  {isAm && product.name_am ? product.name_am : product.name_en}
                </span>{' '}
                • <span className="font-mono">SKU: {product.sku}</span>
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full hover:bg-surface-2 flex items-center justify-center text-text-muted cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Scrollable Body */}
        <form onSubmit={handleSubmit} className="flex-1 min-h-0 overflow-y-auto p-6 space-y-5">
          {error && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-500 text-xs font-bold flex items-center gap-2">
              <AlertCircle size={16} className="shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Step 1: Visual Reason Selector Grid */}
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-text-muted block mb-2.5">
              {isAm ? '1. የማስተካከያውን ምክንያት ይምረጡ *' : '1. Select Adjustment Type *'}
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              {REASON_CONFIGS.map((item) => {
                const Icon = item.icon;
                const isSelected = reason === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setReason(item.id);
                      setError(null);
                      if (item.mode === 'COUNT') {
                        setPhysicalCountInput(String(currentStock));
                      } else if (!qtyInput || qtyInput === '0') {
                        setQtyInput('1');
                      }
                    }}
                    className={`p-3 rounded-2xl border text-left transition cursor-pointer flex flex-col gap-1.5 ${
                      isSelected
                        ? item.activeBorder
                        : 'border-border-subtle bg-surface-2/40 hover:bg-surface-2'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${item.colorClass}`}>
                        <Icon size={15} />
                      </div>
                      <span
                        className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${
                          item.mode === 'DEDUCT'
                            ? 'bg-rose-500/10 text-rose-500'
                            : item.mode === 'ADD'
                              ? 'bg-emerald-500/10 text-emerald-500'
                              : 'bg-sky-500/10 text-sky-500'
                        }`}
                      >
                        {item.mode === 'DEDUCT'
                          ? isAm
                            ? '− ቅናሽ'
                            : '− Deduct'
                          : item.mode === 'ADD'
                            ? isAm
                              ? '+ ጭማሪ'
                              : '+ Add'
                            : isAm
                              ? '⇄ ቆጠራ'
                              : '⇄ Count'}
                      </span>
                    </div>
                    <div className="text-xs font-extrabold text-text-main leading-tight">
                      {isAm ? item.labelAm : item.labelEn}
                    </div>
                    <div className="text-[10px] text-text-muted leading-snug line-clamp-2">
                      {isAm ? item.descAm : item.descEn}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Optional Batch Picker (Especially useful for Expired & Damaged) */}
          {(reason === 'EXPIRED' || reason === 'DAMAGED_GOODS') && batches.length > 0 && (
            <div className="p-3.5 rounded-2xl bg-surface-2/60 border border-border-subtle space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-text-main flex items-center gap-1.5">
                  <Calendar size={14} className="text-primary" />
                  {isAm ? 'ባች ይምረጡ (አማራጭ - ካለ)' : 'Select Specific Batch (Optional)'}
                </span>
                {loadingBatches && <RefreshCw size={12} className="animate-spin text-text-muted" />}
              </div>
              <div className="flex flex-wrap gap-2">
                {batches.map((b) => {
                  const isExpired = b.daysLeft !== null && b.daysLeft <= 0;
                  const isSelected = selectedBatchId === b.id;
                  return (
                    <button
                      key={b.id}
                      type="button"
                      onClick={() => handleSelectBatch(b)}
                      className={`px-3 py-1.5 rounded-xl border text-xs font-bold transition cursor-pointer flex items-center gap-2 ${
                        isSelected
                          ? 'bg-primary text-white border-primary shadow-xs'
                          : isExpired
                            ? 'bg-rose-500/10 border-rose-500/30 text-rose-500 hover:bg-rose-500/20'
                            : 'bg-surface border-border-subtle text-text-main hover:bg-surface-2'
                      }`}
                    >
                      <span className="font-mono">{b.batchNumber}</span>
                      <span className="opacity-80">
                        ({b.currentQuantity} {uom})
                      </span>
                      {b.expiryDate && (
                        <span className="text-[10px] opacity-90">
                          {isExpired
                            ? isAm
                              ? '• ያለፈበት'
                              : '• EXPIRED'
                            : `• ${b.expiryDate}`}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Step 2: Tailored Quantity Input + Live Stock Preview */}
          <div className="p-4 rounded-2xl bg-surface-2/60 border border-border-subtle space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-end">
              {activeMeta.mode === 'COUNT' ? (
                <>
                  <div>
                    <label className="text-xs font-bold text-text-muted block mb-1.5">
                      {isAm ? 'አሁን በሲስተም ያለው ክምችት' : 'Current System Stock'}
                    </label>
                    <div className="px-4 py-2.5 rounded-xl bg-surface border border-border-subtle font-mono text-sm font-black text-text-muted">
                      {currentStock} {uom}
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-bold text-text-main block mb-1.5">
                      {isAm ? '2. በመደርደሪያው የተቆጠረው ትክክለኛ ብዛት *' : '2. Actual Physical Shelf Count *'}
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        required
                        value={physicalCountInput}
                        onChange={(e) => setPhysicalCountInput(e.target.value)}
                        className="w-full px-4 py-2.5 rounded-xl bg-surface border-2 border-sky-500/50 focus:border-sky-500 text-sm font-mono font-black text-text-main focus:outline-none"
                      />
                      <span className="absolute right-3.5 top-3 text-xs font-bold text-text-muted">
                        {uom}
                      </span>
                    </div>
                  </div>
                </>
              ) : (
                <div className="sm:col-span-2">
                  <label className="text-xs font-bold text-text-main block mb-1.5">
                    {activeMeta.mode === 'DEDUCT'
                      ? isAm
                        ? `2. የሚቀነሰው ብዛት (${activeMeta.labelAm}) *`
                        : `2. Quantity to Deduct (${activeMeta.labelEn}) *`
                      : isAm
                        ? `2. የሚጨመረው ብዛት (${activeMeta.labelAm}) *`
                        : `2. Quantity to Add (${activeMeta.labelEn}) *`}
                  </label>
                  <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                      <input
                        type="number"
                        step="0.01"
                        min="0.01"
                        required
                        value={qtyInput}
                        onChange={(e) => setQtyInput(e.target.value)}
                        className="w-full px-4 py-2.5 rounded-xl bg-surface border border-border-subtle focus:border-primary text-sm font-mono font-black text-text-main focus:outline-none"
                      />
                      <span className="absolute right-3.5 top-3 text-xs font-bold text-text-muted">
                        {uom}
                      </span>
                    </div>
                    {[1, 2, 5, 10].map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => setQtyInput(String(preset))}
                        className="px-3 py-2.5 rounded-xl bg-surface hover:bg-surface-2 border border-border-subtle text-xs font-mono font-bold text-text-main cursor-pointer transition"
                      >
                        {preset}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Live Before -> After Preview Strip */}
            <div className="pt-3 border-t border-border-subtle flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2 font-mono">
                <span className="text-text-muted">
                  {isAm ? 'ነባር:' : 'Current:'} <strong>{currentStock}</strong>
                </span>
                <ArrowRight size={13} className="text-text-dim" />
                <span
                  className={`font-black px-2 py-0.5 rounded-md ${
                    quantityChange < 0
                      ? 'bg-rose-500/10 text-rose-500'
                      : quantityChange > 0
                        ? 'bg-emerald-500/10 text-emerald-500'
                        : 'bg-surface text-text-muted'
                  }`}
                >
                  {quantityChange > 0 ? `+${quantityChange}` : quantityChange} {uom}
                </span>
                <ArrowRight size={13} className="text-text-dim" />
                <span className="font-black text-text-main">
                  {isAm ? 'አዲስ ክምችት:' : 'New Stock:'}{' '}
                  <span className={newStock < 0 ? 'text-rose-500' : 'text-primary'}>
                    {newStock} {uom}
                  </span>
                </span>
              </div>

              {costPrice > 0 && absQty > 0 && (
                <div className="font-mono text-text-muted">
                  {quantityChange < 0 ? (isAm ? 'የኪሳራ ግምት:' : 'Est. Loss:') : isAm ? 'የዋጋ ልዩነት:' : 'Est. Value:'}{' '}
                  <strong className={quantityChange < 0 ? 'text-rose-500' : 'text-emerald-500'}>
                    ETB {estimatedCostImpact.toLocaleString('en-ET', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </strong>
                </div>
              )}
            </div>

            {newStock < 0 && (
              <div className="text-[11px] font-bold text-amber-500 flex items-center gap-1.5">
                <AlertTriangle size={13} />
                <span>
                  {isAm
                    ? 'ማሳሰቢያ፡ አዲሱ ክምችት ከዜሮ በታች (Negative) ይሆናል።'
                    : 'Note: Resulting stock will drop below zero.'}
                </span>
              </div>
            )}
          </div>

          {/* Step 3: Quick Reason Chips & Audit Notes */}
          <div className="space-y-2.5">
            <label className="text-xs font-bold uppercase tracking-wider text-text-muted block">
              {isAm ? '3. ዝርዝር ምክንያት / ማስታወሻ *' : '3. Audit Reason & Notes *'}
            </label>

            {/* Quick Clickable Chips */}
            <div className="flex flex-wrap gap-1.5">
              {activeMeta.chips.map((chip) => {
                const label = isAm ? chip.am : chip.en;
                const active = notes.includes(label);
                return (
                  <button
                    key={chip.en}
                    type="button"
                    onClick={() => handleAppendChip(label)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition cursor-pointer ${
                      active
                        ? 'bg-primary text-white border-primary'
                        : 'bg-surface-2/60 border-border-subtle text-text-muted hover:text-text-main hover:bg-surface-2'
                    }`}
                  >
                    + {label}
                  </button>
                );
              })}
            </div>

            <input
              type="text"
              required
              placeholder={isAm ? activeMeta.placeholderAm : activeMeta.placeholderEn}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl bg-input border border-border-subtle text-xs font-semibold text-text-main focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>

          {/* Conditional Manager Approval Notice / PIN */}
          {requiresManagerApproval && (
            <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 space-y-2">
              <div className="flex items-center gap-2 text-xs font-bold text-amber-600 dark:text-amber-400">
                <Lock size={15} />
                <span>
                  {isAm
                    ? 'ከፍተኛ መጠን ያለው ቅናሽ (>20 ፍሬ ወይም >5,000 ብር)'
                    : 'Large Write-off Approval Required (>20 units or >5,000 ETB)'}
                </span>
              </div>
              {isManagerRole ? (
                <div className="text-[11px] text-text-muted flex items-center gap-1.5">
                  <CheckCircle2 size={13} className="text-emerald-500" />
                  <span>
                    {isAm
                      ? `እንደ ${currentUser?.role} በራስዎ ፍቃድ ይጸድቃል።`
                      : `Auto-approved by your ${currentUser?.role} authority.`}
                  </span>
                </div>
              ) : (
                <input
                  type="password"
                  placeholder={isAm ? 'የስራ አስኪያጅ PIN ያስገቡ...' : 'Enter Supervisor / Manager PIN...'}
                  value={managerPin}
                  onChange={(e) => setManagerPin(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl bg-surface border border-amber-500/40 text-xs font-mono font-bold text-text-main focus:outline-none"
                />
              )}
            </div>
          )}

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-border-subtle">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 rounded-xl bg-surface-2 hover:bg-surface border border-border-subtle text-xs font-bold text-text-main transition cursor-pointer"
            >
              {isAm ? 'ተመለስ' : 'Cancel'}
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2.5 rounded-xl bg-primary hover:bg-primary-hover text-white text-xs font-extrabold transition flex items-center gap-2 shadow-soft cursor-pointer disabled:opacity-50"
            >
              {submitting && <RefreshCw size={14} className="animate-spin" />}
              <span>
                {isAm
                  ? `ማስተካከያውን አስቀምጥ (${quantityChange > 0 ? `+${quantityChange}` : quantityChange})`
                  : `Confirm Adjustment (${quantityChange > 0 ? `+${quantityChange}` : quantityChange})`}
              </span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
