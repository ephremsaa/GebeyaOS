import React, { useState, useEffect, useMemo } from 'react';
import {
  Users,
  Truck,
  Plus,
  Search,
  DollarSign,
  FileText,
  Clock,
  CheckCircle2,
  AlertCircle,
  X,
  CreditCard,
  Building,
  Calendar,
  Layers,
  ArrowRight,
  ArrowLeft,
  Printer,
  ShieldCheck,
  ChevronRight,
  Trash2,
} from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { useI18n } from '../i18n/I18nContext';
import { posApi } from '../utils/pos-api';
import { calculateAVCO } from '@gebeyaos/shared-types';

interface SupplierRecord {
  id: string;
  code: string;
  name: string;
  contactPerson?: string;
  phone: string;
  email?: string;
  tinNumber?: string;
  paymentTermsDays?: number;
  balanceOwed?: number;
}

interface GRNLine {
  productId: string;
  productName: string;
  sku: string;
  quantity: number;
  unitCost: number;
  batchNumber?: string;
  expiryDate?: string;
  hasExpiry?: boolean;
}

interface GRNRecord {
  id: string;
  grnNumber: string;
  supplierId?: string;
  supplierName: string;
  invoiceNumber: string;
  invoiceDate: string;
  itemCount: number;
  totalCost: number;
  status: 'RECEIVED' | 'DRAFT';
  receivedBy: string;
  createdAt: string;
  items: GRNLine[];
}

export const SuppliersView: React.FC = () => {
  const { currentUser } = useAuth();
  const { t, language } = useI18n();

  // Primary Tabs: 'suppliers' | 'grn'
  const [activeTab, setActiveTab] = useState<'suppliers' | 'grn'>('suppliers');
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Entities Data
  const [suppliers, setSuppliers] = useState<SupplierRecord[]>([]);
  const [grnList, setGrnList] = useState<GRNRecord[]>([]);
  const [catalogProducts, setCatalogProducts] = useState<any[]>([]);

  // Modals
  const [isAddSupplierOpen, setIsAddSupplierOpen] = useState(false);
  const [isWizardOpen, setIsWizardOpen] = useState(false);
  const [isPayModalOpen, setIsPayModalOpen] = useState(false);
  const [inspectGrn, setInspectGrn] = useState<GRNRecord | null>(null);

  // Add Supplier Form
  const [supName, setSupName] = useState('');
  const [supCode, setSupCode] = useState('');
  const [supContact, setSupContact] = useState('');
  const [supPhone, setSupPhone] = useState('');
  const [supEmail, setSupEmail] = useState('');
  const [supTin, setSupTin] = useState('');
  const [supTerms, setSupTerms] = useState(30);
  const [supError, setSupError] = useState<string | null>(null);

  // Pay Supplier Modal State
  const [payTargetSupplier, setPayTargetSupplier] = useState<SupplierRecord | null>(null);
  const [payAmount, setPayAmount] = useState<number>(0);
  const [payMethod, setPayMethod] = useState<'BANK_TRANSFER' | 'CASH' | 'TELEBIRR' | 'CBE_BIRR'>('BANK_TRANSFER');
  const [payRef, setPayRef] = useState('');

  // 3-Step Receive Items Wizard State
  const [wizardStep, setWizardStep] = useState<1 | 2 | 3>(1);
  const [wizardSupplierId, setWizardSupplierId] = useState<string>('');
  const [wizardInvoiceNo, setWizardInvoiceNo] = useState<string>('');
  const [wizardInvoiceDate, setWizardInvoiceDate] = useState<string>(
    new Date().toISOString().slice(0, 10),
  );
  const [wizardLines, setWizardLines] = useState<GRNLine[]>([]);
  const [wizardItemSearch, setWizardItemSearch] = useState('');
  const [wizardSubmitting, setWizardSubmitting] = useState(false);
  const [wizardError, setWizardError] = useState<string | null>(null);

  // Format money helper
  const fmt = (n: number) =>
    Number(n || 0).toLocaleString('en-ET', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [supData, grnData, catData] = await Promise.all([
        posApi.getSuppliers(),
        posApi.getGrnList(currentUser?.branchId),
        posApi.getCatalog(currentUser?.branchId),
      ]);

      const formattedSuppliers: SupplierRecord[] = Array.isArray(supData)
        ? supData.map((s: any) => ({
            id: s.id,
            code: s.code || `SUP-${s.id.slice(0, 4).toUpperCase()}`,
            name: s.name,
            contactPerson: s.contactPerson || s.contact_person,
            phone: s.phone || '',
            email: s.email,
            tinNumber: s.tinNumber || s.tin_number,
            paymentTermsDays: s.paymentTermsDays || s.payment_terms_days || 30,
            balanceOwed: s.balanceOwed !== undefined ? s.balanceOwed : (s.balance_owed || 0),
          }))
        : [];

      const formattedGrns: GRNRecord[] = Array.isArray(grnData)
        ? grnData.map((g: any) => ({
            id: g.id,
            grnNumber: g.grnNumber || g.grn_number || `GRN-${g.id.slice(0, 8)}`,
            supplierId: g.supplierId || g.supplier_id,
            supplierName: g.supplierName || g.supplier_name || 'Direct Receipt',
            invoiceNumber: g.supplierInvoiceNo || g.invoice_number || 'N/A',
            invoiceDate: g.supplierInvoiceDate || g.invoice_date || g.createdAt?.slice(0, 10),
            itemCount: g.itemCount || g.items?.length || 0,
            totalCost: Number(g.totalReceivedCost || g.total_cost || 0),
            status: (g.status as any) || 'RECEIVED',
            receivedBy: g.receivedBy || g.received_by || 'Staff',
            createdAt: g.createdAt || new Date().toISOString(),
            items: Array.isArray(g.items) ? g.items : [],
          }))
        : [];

      setSuppliers(formattedSuppliers);
      setGrnList(formattedGrns);
      setCatalogProducts(Array.isArray(catData) ? catData : []);
    } catch (err) {
      console.warn('Failed to fetch suppliers/GRN:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // ─── Metrics ───
  const metrics = useMemo(() => {
    const totalSuppliersCount = suppliers.length;
    const totalReceivedVal = grnList.reduce((acc, g) => acc + (g.totalCost || 0), 0);
    const totalPayables = suppliers.reduce((acc, s) => acc + (s.balanceOwed || 0), 0);
    return {
      totalSuppliersCount,
      totalReceivedCount: grnList.length,
      totalReceivedVal,
      totalPayables,
    };
  }, [suppliers, grnList]);

  // Filtered Suppliers
  const filteredSuppliers = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return suppliers;
    return suppliers.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.code.toLowerCase().includes(q) ||
        (s.phone && s.phone.includes(q)) ||
        (s.tinNumber && s.tinNumber.includes(q)),
    );
  }, [suppliers, searchQuery]);

  // Filtered GRNs
  const filteredGrns = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return grnList;
    return grnList.filter(
      (g) =>
        g.grnNumber.toLowerCase().includes(q) ||
        g.supplierName.toLowerCase().includes(q) ||
        g.invoiceNumber.toLowerCase().includes(q),
    );
  }, [grnList, searchQuery]);

  // ─── Add Supplier Handler ───
  const handleCreateSupplier = async (e: React.FormEvent) => {
    e.preventDefault();
    setSupError(null);
    if (!supName.trim()) {
      setSupError(language === 'am' ? 'የአቅራቢው ስም ያስፈልጋል' : 'Supplier name is required');
      return;
    }

    try {
      const code = supCode.trim() || `SUP-${Date.now().toString().slice(-4)}`;
      const payload = {
        name: supName.trim(),
        code,
        contact_person: supContact.trim() || undefined,
        phone: supPhone.trim() || undefined,
        email: supEmail.trim() || undefined,
        tin_number: supTin.trim() || undefined,
        payment_terms_days: Number(supTerms) || 30,
      };

      const res = await posApi.createSupplier(payload);
      const newSup: SupplierRecord = {
        id: res?.id || `sup-${Date.now()}`,
        code,
        name: supName.trim(),
        contactPerson: supContact.trim(),
        phone: supPhone.trim(),
        email: supEmail.trim(),
        tinNumber: supTin.trim(),
        paymentTermsDays: Number(supTerms) || 30,
        balanceOwed: 0,
      };

      setSuppliers((prev) => [newSup, ...prev]);
      setIsAddSupplierOpen(false);
      setSupName('');
      setSupCode('');
      setSupContact('');
      setSupPhone('');
      setSupEmail('');
      setSupTin('');
      setSuccessMsg(t('purchasing.addSupplierSuccess'));
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: any) {
      setSupError(err?.message || 'Failed to save supplier');
    }
  };

  // ─── Pay Supplier Handler ───
  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!payTargetSupplier || payAmount <= 0) return;

    try {
      setSuppliers((prev) =>
        prev.map((s) => {
          if (s.id === payTargetSupplier.id) {
            const newBal = Math.max(0, (s.balanceOwed || 0) - payAmount);
            return { ...s, balanceOwed: newBal };
          }
          return s;
        }),
      );

      setIsPayModalOpen(false);
      setPayTargetSupplier(null);
      setSuccessMsg(t('purchasing.paymentSuccess'));
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err) {
      console.error(err);
    }
  };

  // ─── Wizard: Add Item to Lines ───
  const handleAddProductToWizard = (prod: any) => {
    const existing = wizardLines.find((l) => l.productId === prod.id);
    if (existing) {
      setWizardLines((prev) =>
        prev.map((l) => (l.productId === prod.id ? { ...l, quantity: l.quantity + 1 } : l)),
      );
    } else {
      setWizardLines((prev) => [
        ...prev,
        {
          productId: prod.id,
          productName: prod.nameEn || prod.name_en || 'Product',
          sku: prod.sku || 'SKU',
          quantity: 1,
          unitCost: Number(prod.costPrice || prod.cost_price || 0),
          batchNumber: `B-${new Date().toISOString().slice(2, 10).replace(/-/g, '')}`,
          expiryDate: '',
          hasExpiry: Boolean(prod.has_expiry_date || prod.isPerishable),
        },
      ]);
    }
    setWizardItemSearch('');
  };

  const handleUpdateWizardLine = (idx: number, patch: Partial<GRNLine>) => {
    setWizardLines((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], ...patch };
      return next;
    });
  };

  const handleRemoveWizardLine = (idx: number) => {
    setWizardLines((prev) => prev.filter((_, i) => i !== idx));
  };

  // Wizard totals & AVCO calculations
  const wizardCalculations = useMemo(() => {
    let subtotal = 0;
    const linesWithAvco = wizardLines.map((line) => {
      const lineCost = line.quantity * line.unitCost;
      subtotal += lineCost;

      const prod = catalogProducts.find((p) => p.id === line.productId);
      const curQty = Number(prod?.stockOnHand || prod?.stock_on_hand || 0);
      const curCost = Number(prod?.costPrice || prod?.cost_price || line.unitCost);

      const avcoRes = calculateAVCO({
        currentOnHandQty: curQty,
        currentCost: curCost,
        receivedQty: line.quantity,
        receivedUnitCost: line.unitCost,
      });

      return {
        ...line,
        lineCost,
        currentStock: curQty,
        currentCost: curCost,
        newAvco: avcoRes.newCost,
      };
    });

    const withholdingTax = subtotal >= 10000 ? subtotal * 0.02 : 0;
    const netPayable = subtotal - withholdingTax;

    return {
      subtotal,
      withholdingTax,
      netPayable,
      lines: linesWithAvco,
    };
  }, [wizardLines, catalogProducts]);

  // Submit Final GRN
  const handleCommitGrn = async () => {
    setWizardError(null);
    if (wizardLines.length === 0) {
      setWizardError(language === 'am' ? 'እባክዎ ቢያንስ አንድ ዕቃ ያስገቡ' : 'Please add at least one item');
      return;
    }

    // Validate perishable batch & expiry
    for (const l of wizardLines) {
      if (l.hasExpiry && !l.expiryDate) {
        setWizardError(
          language === 'am'
            ? `ለ '${l.productName}' የማለቂያ ቀን ማስገባት ግዴታ ነው`
            : `Expiry date is required for '${l.productName}'`,
        );
        return;
      }
    }

    setWizardSubmitting(true);
    try {
      const selectedSup = suppliers.find((s) => s.id === wizardSupplierId);
      const supNameStr = selectedSup ? selectedSup.name : t('purchasing.cashPurchaseNoSupplier');
      const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const grnNum = `GRN-${datePart}-000${grnList.length + 1}`;

      const payload = {
        branch_id: currentUser?.branchId,
        supplier_id: wizardSupplierId || undefined,
        supplier_name: supNameStr,
        supplier_invoice_no: wizardInvoiceNo.trim() || undefined,
        supplier_invoice_date: wizardInvoiceDate,
        total_received_cost: wizardCalculations.subtotal,
        withholding_tax_amount: wizardCalculations.withholdingTax,
        net_supplier_payable: wizardCalculations.netPayable,
        items: wizardLines.map((l) => ({
          product_id: l.productId,
          received_quantity: l.quantity,
          accepted_quantity: l.quantity,
          purchase_unit_cost: l.unitCost,
          batch_number: l.batchNumber || undefined,
          expiry_date: l.expiryDate || undefined,
        })),
      };

      try {
        await posApi.createGRN(payload);
      } catch (e) {
        console.warn('Backend GRN call fallback:', e);
      }

      const newGrnRecord: GRNRecord = {
        id: `grn-${Date.now()}`,
        grnNumber: grnNum,
        supplierId: wizardSupplierId || undefined,
        supplierName: supNameStr,
        invoiceNumber: wizardInvoiceNo.trim() || 'N/A',
        invoiceDate: wizardInvoiceDate,
        itemCount: wizardLines.length,
        totalCost: wizardCalculations.subtotal,
        status: 'RECEIVED',
        receivedBy: currentUser?.fullName || 'Storekeeper',
        createdAt: new Date().toISOString(),
        items: [...wizardLines],
      };

      setGrnList((prev) => [newGrnRecord, ...prev]);

      // If tied to supplier with balance, increase payable balance
      if (wizardSupplierId) {
        setSuppliers((prev) =>
          prev.map((s) =>
            s.id === wizardSupplierId
              ? { ...s, balanceOwed: (s.balanceOwed || 0) + wizardCalculations.netPayable }
              : s,
          ),
        );
      }

      // Close wizard & reset
      setIsWizardOpen(false);
      setWizardStep(1);
      setWizardSupplierId('');
      setWizardInvoiceNo('');
      setWizardLines([]);
      setSuccessMsg(t('purchasing.recordGrnSuccess'));
      setTimeout(() => setSuccessMsg(null), 3000);
      loadData();
    } catch (err: any) {
      setWizardError(err?.message || 'Failed to complete receiving');
    } finally {
      setWizardSubmitting(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-page p-4 sm:p-6 overflow-hidden select-none text-text-main">
      {/* ─── 1. Header & Actions ─── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
        <div>
          <h1 className="text-[26px] font-extrabold text-text-main flex items-center gap-2.5 tracking-tight">
            <Users className="text-primary" size={24} />
            {t('purchasing.suppliersTitle')}
          </h1>
          <p className="text-[14px] text-text-muted mt-0.5">{t('purchasing.suppliersSubtitle')}</p>
        </div>

        <div className="flex items-center gap-2">
          {/* Add Supplier Button */}
          <button
            onClick={() => setIsAddSupplierOpen(true)}
            className="px-4 py-2.5 rounded-xl bg-surface hover:bg-surface-2 border border-border-subtle text-text-main text-[14px] font-semibold flex items-center gap-2 shadow-soft transition active:scale-95 cursor-pointer"
          >
            <Plus size={16} />
            {t('purchasing.addSupplier')}
          </button>

          {/* Receive Items Button (Wizard Trigger) */}
          <button
            onClick={() => {
              setWizardStep(1);
              setWizardLines([]);
              setWizardError(null);
              setIsWizardOpen(true);
            }}
            className="px-5 py-2.5 rounded-xl bg-primary hover:bg-primary-hover text-white text-[15px] font-bold flex items-center gap-2 shadow-soft transition active:scale-95 cursor-pointer"
          >
            <Truck size={16} />
            {t('purchasing.receiveItemsBtn')}
          </button>
        </div>
      </div>

      {/* Global Success Feedback */}
      {successMsg && (
        <div className="mb-4 p-3 rounded-2xl bg-primary-soft border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 text-xs font-semibold flex items-center gap-2 animate-in fade-in">
          <CheckCircle2 size={16} className="text-primary shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* ─── 2. Top Summary KPI Cards ─── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
        {/* Card 1: Suppliers Count */}
        <div className="p-4 rounded-2xl bg-surface border border-border-subtle shadow-card flex items-center justify-between">
          <div>
            <div className="text-[11px] font-bold text-text-muted uppercase tracking-wider">
              {t('purchasing.tabSuppliersSimple')}
            </div>
            <div className="text-xl font-black text-text-main font-mono">
              {metrics.totalSuppliersCount}
            </div>
          </div>
          <div className="w-9 h-9 rounded-xl bg-primary-soft text-primary flex items-center justify-center">
            <Users size={18} />
          </div>
        </div>

        {/* Card 2: Received Goods Total */}
        <div className="p-4 rounded-2xl bg-surface border border-border-subtle shadow-card flex items-center justify-between">
          <div>
            <div className="text-[11px] font-bold text-text-muted uppercase tracking-wider">
              {t('purchasing.totalGoodsReceivedStat')}
            </div>
            <div className="text-xl font-black text-primary font-mono">
              ETB {fmt(metrics.totalReceivedVal)}
            </div>
            <span className="text-[10px] text-text-muted">
              {metrics.totalReceivedCount} {t('purchasing.tabReceivedItems')}
            </span>
          </div>
          <div className="w-9 h-9 rounded-xl bg-blue-100 dark:bg-blue-950 text-blue-600 flex items-center justify-center">
            <Truck size={18} />
          </div>
        </div>

        {/* Card 3: Total Payables Balance */}
        <div className="p-4 rounded-2xl bg-surface border border-border-subtle shadow-card flex items-center justify-between">
          <div>
            <div className="text-[11px] font-bold text-text-muted uppercase tracking-wider">
              {t('purchasing.payablesBalanceStat')}
            </div>
            <div className="text-xl font-black text-rose-600 dark:text-rose-400 font-mono">
              ETB {fmt(metrics.totalPayables)}
            </div>
            <span className="text-[10px] text-text-muted">
              {suppliers.filter((s) => (s.balanceOwed || 0) > 0).length} {t('purchasing.tabSuppliersSimple')}
            </span>
          </div>
          <div className="w-9 h-9 rounded-xl bg-rose-100 dark:bg-rose-950 text-rose-600 flex items-center justify-center">
            <CreditCard size={18} />
          </div>
        </div>
      </div>

      {/* ─── 3. Navigation Tabs & Search ─── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
        {/* Two clean tabs: Suppliers | Received items */}
        <div className="flex items-center gap-1 p-1 bg-surface-2 rounded-xl border border-border-subtle self-start">
          <button
            type="button"
            onClick={() => setActiveTab('suppliers')}
            className={`px-4 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
              activeTab === 'suppliers'
                ? 'bg-primary text-white shadow-soft font-bold'
                : 'text-text-muted hover:text-text-main font-semibold'
            }`}
          >
            <Users size={14} className="text-primary" />
            {t('purchasing.tabSuppliersSimple')}
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-surface-2 text-text-main font-mono">
              {suppliers.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('grn')}
            className={`px-4 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
              activeTab === 'grn'
                ? 'bg-primary text-white shadow-soft font-bold'
                : 'text-text-muted hover:text-text-main font-semibold'
            }`}
          >
            <Truck size={14} className="text-blue-500" />
            {t('purchasing.tabReceivedItems')}
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-surface-2 text-text-main font-mono">
              {grnList.length}
            </span>
          </button>
        </div>

        {/* Search */}
        <div className="relative w-full sm:w-72">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            type="text"
            placeholder={
              activeTab === 'suppliers'
                ? t('purchasing.searchSuppliersPlaceholder')
                : t('purchasing.searchGRNPlaceholder')
            }
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 rounded-xl bg-surface border border-border-subtle text-xs text-text-main placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
      </div>

      {/* ─── 4. Main Tables ─── */}
      <div className="flex-1 bg-surface rounded-2xl border border-border-subtle overflow-hidden flex flex-col shadow-xs min-h-0">
        <div className="flex-1 overflow-auto">
          {/* TAB 1: SUPPLIERS */}
          {activeTab === 'suppliers' && (
            <table className="w-full text-left border-collapse text-xs">
              <thead className="sticky top-0 bg-surface-2/80 border-b border-border-subtle z-10 font-bold text-text-muted uppercase tracking-wider text-[11px]">
                <tr>
                  <th className="p-3 pl-4">{t('purchasing.supplier')}</th>
                  <th className="p-3">Contact</th>
                  <th className="p-3">TIN #</th>
                  <th className="p-3">Payment Terms</th>
                  <th className="p-3 text-right">{t('purchasing.balanceOwed')}</th>
                  <th className="p-3 pr-4 text-right">{t('purchasing.actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle dark:divide-border-subtle/60 font-medium text-text-main">
                {filteredSuppliers.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-text-muted">
                      <Users size={32} className="mx-auto mb-2 opacity-40" />
                      <div>No suppliers found</div>
                    </td>
                  </tr>
                ) : (
                  filteredSuppliers.map((s) => (
                    <tr key={s.id} className="hover:bg-surface-2 dark:hover:bg-surface-2/30 transition">
                      <td className="p-3 pl-4">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-xl bg-primary-soft text-emerald-700 dark:text-emerald-300 font-black text-xs flex items-center justify-center shrink-0">
                            {s.name.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <div className="font-bold text-text-main">{s.name}</div>
                            <div className="text-[10px] text-text-muted font-mono">{s.code}</div>
                          </div>
                        </div>
                      </td>
                      <td className="p-3">
                        <div>{s.contactPerson || '—'}</div>
                        <div className="text-[10px] text-text-muted font-mono">{s.phone || '—'}</div>
                      </td>
                      <td className="p-3 font-mono text-[11px] text-text-muted">
                        {s.tinNumber || '—'}
                      </td>
                      <td className="p-3">
                        <span className="text-[11px] px-2 py-0.5 rounded-md bg-surface-2 text-text-muted font-semibold">
                          {s.paymentTermsDays === 0
                            ? t('purchasing.termsCod')
                            : t('purchasing.termsNet', { days: s.paymentTermsDays || 30 })}
                        </span>
                      </td>
                      <td className="p-3 text-right">
                        <div
                          className={`font-mono font-bold ${
                            (s.balanceOwed || 0) > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-text-muted'
                          }`}
                        >
                          ETB {fmt(s.balanceOwed || 0)}
                        </div>
                      </td>
                      <td className="p-3 pr-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {(s.balanceOwed || 0) > 0 && (
                            <button
                              onClick={() => {
                                setPayTargetSupplier(s);
                                setPayAmount(s.balanceOwed || 0);
                                setIsPayModalOpen(true);
                              }}
                              className="px-2.5 py-1 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300 font-bold text-[11px] transition"
                            >
                              {t('purchasing.paySupplier')}
                            </button>
                          )}
                          <button
                            onClick={() => {
                              setWizardSupplierId(s.id);
                              setWizardStep(1);
                              setWizardLines([]);
                              setIsWizardOpen(true);
                            }}
                            className="px-2.5 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300 font-bold text-[11px] transition"
                          >
                            {t('purchasing.receiveAction')}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}

          {/* TAB 2: RECEIVED ITEMS (GRN) */}
          {activeTab === 'grn' && (
            <table className="w-full text-left border-collapse text-xs">
              <thead className="sticky top-0 bg-surface-2/80 border-b border-border-subtle z-10 font-bold text-text-muted uppercase tracking-wider text-[11px]">
                <tr>
                  <th className="p-3 pl-4">{t('purchasing.grnNumber')}</th>
                  <th className="p-3">Date</th>
                  <th className="p-3">{t('purchasing.supplier')}</th>
                  <th className="p-3">{t('purchasing.invoiceWaybill')}</th>
                  <th className="p-3 text-center">{t('purchasing.items')}</th>
                  <th className="p-3 text-right">{t('purchasing.totalCost')}</th>
                  <th className="p-3 text-center">{t('purchasing.status')}</th>
                  <th className="p-3 pr-4 text-right">{t('purchasing.actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle dark:divide-border-subtle/60 font-medium text-text-main">
                {filteredGrns.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-text-muted">
                      <Truck size={32} className="mx-auto mb-2 opacity-40" />
                      <div>{t('purchasing.noGRNsYet')}</div>
                    </td>
                  </tr>
                ) : (
                  filteredGrns.map((g) => (
                    <tr key={g.id} className="hover:bg-surface-2 dark:hover:bg-surface-2/30 transition">
                      <td className="p-3 pl-4 font-mono font-bold text-primary">
                        {g.grnNumber}
                      </td>
                      <td className="p-3 text-text-muted font-mono text-[11px]">
                        {g.invoiceDate || g.createdAt.slice(0, 10)}
                      </td>
                      <td className="p-3 font-semibold text-text-main">
                        {g.supplierName}
                      </td>
                      <td className="p-3 font-mono text-[11px] text-text-muted">
                        {g.invoiceNumber}
                      </td>
                      <td className="p-3 text-center font-mono">
                        <span className="px-2 py-0.5 rounded-full bg-surface-2 font-bold">
                          {g.itemCount}
                        </span>
                      </td>
                      <td className="p-3 text-right font-mono font-bold text-text-main">
                        ETB {fmt(g.totalCost)}
                      </td>
                      <td className="p-3 text-center">
                        <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                          {g.status}
                        </span>
                      </td>
                      <td className="p-3 pr-4 text-right">
                        <button
                          onClick={() => setInspectGrn(g)}
                          className="px-2.5 py-1 rounded-lg bg-surface-2 hover:bg-surface-2 dark:hover:bg-surface-2 text-text-main font-bold text-[11px] transition"
                        >
                          {t('purchasing.inspectGrn')}
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* ─── 5. Add Supplier Modal ─── */}
      {isAddSupplierOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in select-none">
          <div className="bg-surface rounded-3xl shadow-2xl border border-border-subtle w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-primary-soft text-primary flex items-center justify-center">
                  <Users size={20} />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-text-main">
                    {t('purchasing.addSupplier')}
                  </h3>
                  <p className="text-xs text-text-muted">Create new supplier directory entry</p>
                </div>
              </div>
              <button
                onClick={() => setIsAddSupplierOpen(false)}
                className="w-8 h-8 rounded-full hover:bg-surface-2 dark:hover:bg-surface-2 flex items-center justify-center text-text-muted"
              >
                <X size={16} />
              </button>
            </div>

            {supError && (
              <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 text-rose-600 text-xs font-semibold flex items-center gap-2">
                <AlertCircle size={15} />
                <span>{supError}</span>
              </div>
            )}

            <form onSubmit={handleCreateSupplier} className="space-y-3">
              <div>
                <label className="text-[11px] font-bold text-text-muted block mb-1">
                  Supplier Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Awash Agro Industry"
                  value={supName}
                  onChange={(e) => setSupName(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl bg-surface-2 border border-border-subtle text-xs font-semibold text-text-main"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] font-bold text-text-muted block mb-1">
                    Contact Person
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Ato Girma"
                    value={supContact}
                    onChange={(e) => setSupContact(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-xl bg-surface-2 border border-border-subtle text-xs font-semibold text-text-main"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-text-muted block mb-1">
                    Phone Number *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. 0911223344"
                    value={supPhone}
                    onChange={(e) => setSupPhone(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-xl bg-surface-2 border border-border-subtle text-xs font-mono font-semibold text-text-main"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] font-bold text-text-muted block mb-1">
                    TIN Number (ERCA)
                  </label>
                  <input
                    type="text"
                    placeholder="10 digits"
                    value={supTin}
                    onChange={(e) => setSupTin(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-xl bg-surface-2 border border-border-subtle text-xs font-mono font-semibold text-text-main"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-text-muted block mb-1">
                    Payment Terms (Days)
                  </label>
                  <select
                    value={supTerms}
                    onChange={(e) => setSupTerms(Number(e.target.value))}
                    className="w-full px-3.5 py-2 rounded-xl bg-surface-2 border border-border-subtle text-xs font-bold text-text-main"
                  >
                    <option value={0}>0 Days (Cash on Delivery)</option>
                    <option value={15}>15 Days</option>
                    <option value={30}>30 Days (Net 30)</option>
                    <option value={60}>60 Days</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAddSupplierOpen(false)}
                  className="px-4 py-2 rounded-xl bg-surface-2 text-xs font-bold text-text-main transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl btn-primary bg-primary hover:bg-primary-hover text-white shadow-soft text-xs font-bold transition flex items-center gap-1.5 shadow-xs"
                >
                  Save Supplier
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── 6. Receive Items 3-Step Wizard ─── */}
      {isWizardOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in select-none">
          <div className="bg-surface rounded-3xl shadow-2xl border border-border-subtle w-full max-w-2xl p-6 space-y-4 max-h-[90vh] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-primary-soft text-primary flex items-center justify-center">
                  <Truck size={20} />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-text-main">
                    {t('purchasing.receiveItemsBtn')}
                  </h3>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span
                      className={`text-[11px] font-bold ${
                        wizardStep === 1 ? 'text-primary' : 'text-text-muted'
                      }`}
                    >
                      {t('purchasing.step1SelectSupplier')}
                    </span>
                    <span className="text-text-muted">•</span>
                    <span
                      className={`text-[11px] font-bold ${
                        wizardStep === 2 ? 'text-primary' : 'text-text-muted'
                      }`}
                    >
                      {t('purchasing.step2SelectItems')}
                    </span>
                    <span className="text-text-muted">•</span>
                    <span
                      className={`text-[11px] font-bold ${
                        wizardStep === 3 ? 'text-primary' : 'text-text-muted'
                      }`}
                    >
                      {t('purchasing.step3ConfirmAvco')}
                    </span>
                  </div>
                </div>
              </div>
              <button
                onClick={() => setIsWizardOpen(false)}
                className="w-8 h-8 rounded-full hover:bg-surface-2 dark:hover:bg-surface-2 flex items-center justify-center text-text-muted"
              >
                <X size={16} />
              </button>
            </div>

            {wizardError && (
              <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 text-rose-600 text-xs font-semibold flex items-center gap-2 shrink-0">
                <AlertCircle size={15} />
                <span>{wizardError}</span>
              </div>
            )}

            {/* STEP 1: Supplier & Invoice */}
            {wizardStep === 1 && (
              <div className="space-y-4 py-2 flex-1 overflow-y-auto">
                <div>
                  <label className="text-[11px] font-bold text-text-muted block mb-1">
                    Select Supplier *
                  </label>
                  <select
                    value={wizardSupplierId}
                    onChange={(e) => setWizardSupplierId(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-surface-2 border border-border-subtle text-xs font-bold text-text-main"
                  >
                    <option value="">{t('purchasing.cashPurchaseNoSupplier')}</option>
                    {suppliers.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.code})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] font-bold text-text-muted block mb-1">
                      {t('purchasing.invoiceRefNumber')}
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. INV-9842"
                      value={wizardInvoiceNo}
                      onChange={(e) => setWizardInvoiceNo(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-surface-2 border border-border-subtle text-xs font-mono font-semibold text-text-main"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-bold text-text-muted block mb-1">
                      Invoice Date
                    </label>
                    <input
                      type="date"
                      value={wizardInvoiceDate}
                      onChange={(e) => setWizardInvoiceDate(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-surface-2 border border-border-subtle text-xs font-mono font-semibold text-text-main"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* STEP 2: Items & Batches */}
            {wizardStep === 2 && (
              <div className="space-y-3 py-1 flex-1 overflow-y-auto">
                {/* Search / Add Item */}
                <div className="relative">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                  <input
                    type="text"
                    placeholder="Search catalog to add item to intake..."
                    value={wizardItemSearch}
                    onChange={(e) => setWizardItemSearch(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 rounded-xl bg-surface-2 border border-border-subtle text-xs text-text-main"
                  />
                  {wizardItemSearch && (
                    <div className="absolute left-0 right-0 top-full mt-1 bg-surface border border-border-subtle rounded-xl shadow-xl max-h-48 overflow-y-auto z-20">
                      {catalogProducts
                        .filter(
                          (p) =>
                            (p.nameEn || p.name_en || '').toLowerCase().includes(wizardItemSearch.toLowerCase()) ||
                            (p.sku || '').toLowerCase().includes(wizardItemSearch.toLowerCase()),
                        )
                        .slice(0, 5)
                        .map((prod) => (
                          <div
                            key={prod.id}
                            onClick={() => handleAddProductToWizard(prod)}
                            className="p-2.5 hover:bg-primary-soft dark:hover:bg-surface-2 cursor-pointer flex items-center justify-between border-b last:border-0 border-border-subtle dark:border-border-subtle/60"
                          >
                            <div>
                              <div className="text-xs font-bold text-text-main">
                                {prod.nameEn || prod.name_en}
                              </div>
                              <div className="text-[10px] text-text-muted font-mono">{prod.sku}</div>
                            </div>
                            <span className="text-xs font-bold text-primary font-mono">
                              ETB {fmt(Number(prod.costPrice || prod.cost_price || 0))}
                            </span>
                          </div>
                        ))}
                    </div>
                  )}
                </div>

                {/* Lines Table */}
                <div className="border border-border-subtle rounded-2xl overflow-hidden max-h-60 overflow-y-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead className="bg-surface-2 border-b border-border-subtle text-[10px] font-bold text-text-muted uppercase">
                      <tr>
                        <th className="p-2 pl-3">Item</th>
                        <th className="p-2 w-20">Qty</th>
                        <th className="p-2 w-24">Unit Cost</th>
                        <th className="p-2">Batch / Expiry</th>
                        <th className="p-2 text-right">Subtotal</th>
                        <th className="p-2 pr-3 w-8"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border-subtle dark:divide-border-subtle/60">
                      {wizardLines.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="p-6 text-center text-text-muted text-xs">
                            No items added yet. Search above to add items.
                          </td>
                        </tr>
                      ) : (
                        wizardLines.map((line, idx) => (
                          <tr key={line.productId} className="hover:bg-surface-2/50">
                            <td className="p-2 pl-3">
                              <div className="font-bold text-text-main truncate max-w-[140px]">
                                {line.productName}
                              </div>
                              <div className="text-[10px] text-text-muted font-mono">{line.sku}</div>
                            </td>
                            <td className="p-2">
                              <input
                                type="number"
                                min="0.01"
                                step="any"
                                value={line.quantity}
                                onChange={(e) =>
                                  handleUpdateWizardLine(idx, {
                                    quantity: Math.max(0.01, parseFloat(e.target.value) || 0),
                                  })
                                }
                                className="w-full p-1 rounded-lg bg-surface-2 border border-border-subtle font-mono font-bold text-center text-xs"
                              />
                            </td>
                            <td className="p-2">
                              <input
                                type="number"
                                min="0"
                                step="any"
                                value={line.unitCost}
                                onChange={(e) =>
                                  handleUpdateWizardLine(idx, {
                                    unitCost: Math.max(0, parseFloat(e.target.value) || 0),
                                  })
                                }
                                className="w-full p-1 rounded-lg bg-surface-2 border border-border-subtle font-mono font-bold text-right text-xs"
                              />
                            </td>
                            <td className="p-2">
                              <div className="flex flex-col gap-1">
                                <input
                                  type="text"
                                  placeholder="Batch #"
                                  value={line.batchNumber || ''}
                                  onChange={(e) =>
                                    handleUpdateWizardLine(idx, { batchNumber: e.target.value })
                                  }
                                  className="w-full p-1 rounded-lg bg-surface-2 border border-border-subtle font-mono text-[10px]"
                                />
                                {line.hasExpiry && (
                                  <input
                                    type="date"
                                    required
                                    value={line.expiryDate || ''}
                                    onChange={(e) =>
                                      handleUpdateWizardLine(idx, { expiryDate: e.target.value })
                                    }
                                    className="w-full p-1 rounded-lg bg-surface-2 border border-amber-300 dark:border-amber-700 font-mono text-[10px]"
                                  />
                                )}
                              </div>
                            </td>
                            <td className="p-2 text-right font-mono font-bold">
                              ETB {fmt(line.quantity * line.unitCost)}
                            </td>
                            <td className="p-2 pr-3 text-right">
                              <button
                                onClick={() => handleRemoveWizardLine(idx)}
                                className="text-text-muted hover:text-rose-500"
                              >
                                <Trash2 size={13} />
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* STEP 3: Review & Confirm AVCO */}
            {wizardStep === 3 && (
              <div className="space-y-4 py-2 flex-1 overflow-y-auto">
                <div className="p-3 rounded-2xl bg-surface-2/60 border border-border-subtle space-y-2">
                  <div className="text-xs font-bold text-text-main">
                    AVCO Blending Preview:
                  </div>
                  <div className="space-y-1.5 max-h-40 overflow-y-auto">
                    {wizardCalculations.lines.map((l) => (
                      <div
                        key={l.productId}
                        className="text-xs p-2 rounded-xl bg-surface border border-border-subtle dark:border-border-subtle flex items-center justify-between"
                      >
                        <div>
                          <div className="font-bold text-text-main">{l.productName}</div>
                          <div className="text-[10px] text-text-muted">
                            Current: {l.currentStock} @ ETB {fmt(l.currentCost)} | Intake: +{l.quantity} @ ETB {fmt(l.unitCost)}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-[10px] font-bold text-primary uppercase">New AVCO</div>
                          <div className="font-mono font-bold text-primary text-xs">
                            ETB {fmt(l.newAvco)}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Financial Summary */}
                <div className="p-3.5 rounded-2xl bg-emerald-50/60 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800/50 space-y-2 text-xs">
                  <div className="flex justify-between text-text-muted">
                    <span>{t('purchasing.subtotal')}</span>
                    <span className="font-mono font-bold">ETB {fmt(wizardCalculations.subtotal)}</span>
                  </div>
                  {wizardCalculations.withholdingTax > 0 && (
                    <div className="flex justify-between text-amber-600 dark:text-amber-400">
                      <span>{t('purchasing.withholdingTaxStat')}</span>
                      <span className="font-mono font-bold">
                        -ETB {fmt(wizardCalculations.withholdingTax)}
                      </span>
                    </div>
                  )}
                  <div className="border-t border-emerald-200 dark:border-emerald-800 pt-2 flex justify-between font-black text-sm text-text-main">
                    <span>{t('purchasing.netPayable')}</span>
                    <span className="font-mono text-primary">
                      ETB {fmt(wizardCalculations.netPayable)}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Wizard Navigation Footer */}
            <div className="flex items-center justify-between pt-3 border-t border-border-subtle shrink-0">
              {wizardStep > 1 ? (
                <button
                  type="button"
                  onClick={() => setWizardStep((prev) => (prev - 1) as any)}
                  className="px-4 py-2 rounded-xl bg-surface-2 text-xs font-bold text-text-main flex items-center gap-1.5 transition"
                >
                  <ArrowLeft size={14} /> Back
                </button>
              ) : (
                <div />
              )}

              {wizardStep < 3 ? (
                <button
                  type="button"
                  onClick={() => {
                    if (wizardStep === 2 && wizardLines.length === 0) {
                      setWizardError(
                        language === 'am' ? 'እባክዎ ቢያንስ አንድ ዕቃ ያስገቡ' : 'Please add at least one item',
                      );
                      return;
                    }
                    setWizardError(null);
                    setWizardStep((prev) => (prev + 1) as any);
                  }}
                  className="px-4 py-2 rounded-xl btn-primary bg-primary hover:bg-primary-hover text-white shadow-soft text-xs font-bold flex items-center gap-1.5 shadow-xs transition"
                >
                  Next <ArrowRight size={14} />
                </button>
              ) : (
                <button
                  type="button"
                  disabled={wizardSubmitting}
                  onClick={handleCommitGrn}
                  className="px-5 py-2 rounded-xl btn-primary bg-primary hover:bg-primary-hover text-white shadow-soft text-xs font-bold flex items-center gap-1.5 shadow-xs transition"
                >
                  <CheckCircle2 size={15} />
                  {wizardSubmitting ? 'Recording...' : 'Confirm & Commit Intake'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ─── 7. Pay Supplier Modal ─── */}
      {isPayModalOpen && payTargetSupplier && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in select-none">
          <div className="bg-surface rounded-3xl shadow-2xl border border-border-subtle w-full max-w-sm p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-rose-100 dark:bg-rose-950 text-rose-600 flex items-center justify-center">
                  <CreditCard size={20} />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-text-main">
                    {t('purchasing.paySupplier')}
                  </h3>
                  <p className="text-xs text-text-muted">{payTargetSupplier.name}</p>
                </div>
              </div>
              <button
                onClick={() => setIsPayModalOpen(false)}
                className="w-8 h-8 rounded-full hover:bg-surface-2 dark:hover:bg-surface-2 flex items-center justify-center text-text-muted"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleRecordPayment} className="space-y-3">
              <div>
                <label className="text-[11px] font-bold text-text-muted block mb-1">
                  {t('purchasing.balanceOwed')}
                </label>
                <div className="text-base font-black font-mono text-rose-600">
                  ETB {fmt(payTargetSupplier.balanceOwed || 0)}
                </div>
              </div>

              <div>
                <label className="text-[11px] font-bold text-text-muted block mb-1">
                  {t('purchasing.amountToPay')}
                </label>
                <input
                  type="number"
                  step="any"
                  required
                  min="0.01"
                  max={payTargetSupplier.balanceOwed || undefined}
                  value={payAmount}
                  onChange={(e) => setPayAmount(parseFloat(e.target.value) || 0)}
                  className="w-full px-3.5 py-2 rounded-xl bg-surface-2 border border-border-subtle text-xs font-mono font-bold text-text-main"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-text-muted block mb-1">
                  Payment Method
                </label>
                <select
                  value={payMethod}
                  onChange={(e) => setPayMethod(e.target.value as any)}
                  className="w-full px-3.5 py-2 rounded-xl bg-surface-2 border border-border-subtle text-xs font-bold text-text-main"
                >
                  <option value="BANK_TRANSFER">Bank Transfer (CBE / Awash / Dashen)</option>
                  <option value="TELEBIRR">Telebirr SuperApp</option>
                  <option value="CBE_BIRR">CBE Birr</option>
                  <option value="CASH">Cash</option>
                </select>
              </div>

              <div>
                <label className="text-[11px] font-bold text-text-muted block mb-1">
                  Reference #
                </label>
                <input
                  type="text"
                  placeholder="e.g. TX-98427189"
                  value={payRef}
                  onChange={(e) => setPayRef(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl bg-surface-2 border border-border-subtle text-xs font-mono text-text-main"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsPayModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-surface-2 text-xs font-bold text-text-main transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition flex items-center gap-1.5 shadow-xs"
                >
                  Confirm Payment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── 8. Inspect GRN Modal ─── */}
      {inspectGrn && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in select-none">
          <div className="bg-surface rounded-3xl shadow-2xl border border-border-subtle w-full max-w-xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b pb-3 border-border-subtle">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-blue-100 dark:bg-blue-950 text-blue-600 flex items-center justify-center">
                  <FileText size={20} />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-text-main">
                    {inspectGrn.grnNumber}
                  </h3>
                  <p className="text-xs text-text-muted">
                    {inspectGrn.supplierName} • {inspectGrn.invoiceDate}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setInspectGrn(null)}
                className="w-8 h-8 rounded-full hover:bg-surface-2 dark:hover:bg-surface-2 flex items-center justify-center text-text-muted"
              >
                <X size={16} />
              </button>
            </div>

            <div className="space-y-2 text-xs">
              <div className="grid grid-cols-2 gap-2 p-3 bg-surface-2 rounded-2xl">
                <div>
                  <span className="text-text-muted block text-[10px]">Supplier Invoice:</span>
                  <span className="font-mono font-bold text-text-main text-text-main">
                    {inspectGrn.invoiceNumber}
                  </span>
                </div>
                <div>
                  <span className="text-text-muted block text-[10px]">Received By:</span>
                  <span className="font-semibold text-text-main text-text-main">
                    {inspectGrn.receivedBy}
                  </span>
                </div>
              </div>

              <div className="border border-border-subtle rounded-2xl overflow-hidden max-h-48 overflow-y-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-surface-2 text-[10px] uppercase font-bold text-text-muted">
                    <tr>
                      <th className="p-2 pl-3">Item</th>
                      <th className="p-2 text-center">Qty</th>
                      <th className="p-2 text-right">Cost</th>
                      <th className="p-2 pr-3 text-right">Subtotal</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border-subtle dark:divide-border-subtle/60 font-mono">
                    {inspectGrn.items && inspectGrn.items.length > 0 ? (
                      inspectGrn.items.map((it, i) => (
                        <tr key={i}>
                          <td className="p-2 pl-3 font-sans font-semibold text-text-main text-text-main">
                            {it.productName}
                          </td>
                          <td className="p-2 text-center">{it.quantity}</td>
                          <td className="p-2 text-right">ETB {fmt(it.unitCost)}</td>
                          <td className="p-2 pr-3 text-right font-bold">
                            ETB {fmt(it.quantity * it.unitCost)}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={4} className="p-3 text-center text-text-muted">
                          {inspectGrn.itemCount} items received
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div className="flex justify-between items-center p-3 bg-primary-soft rounded-2xl">
                <span className="font-bold text-emerald-800 dark:text-emerald-200">Total Value:</span>
                <span className="font-black text-sm font-mono text-primary">
                  ETB {fmt(inspectGrn.totalCost)}
                </span>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => window.print()}
                className="px-4 py-2 rounded-xl bg-surface-2 text-xs font-bold text-text-main flex items-center gap-1.5 transition"
              >
                <Printer size={14} />
                {t('purchasing.printReceipt')}
              </button>
              <button
                type="button"
                onClick={() => setInspectGrn(null)}
                className="px-4 py-2 rounded-xl btn-primary bg-primary hover:bg-primary-hover text-white shadow-soft text-xs font-bold transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
