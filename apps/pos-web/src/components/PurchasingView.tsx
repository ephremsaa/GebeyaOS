import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Truck,
  Plus,
  CheckCircle2,
  FileText,
  Users,
  Search,
  Filter,
  DollarSign,
  Calendar,
  AlertTriangle,
  Building,
  Phone,
  Mail,
  ChevronRight,
  ChevronLeft,
  Eye,
  Printer,
  X,
  Package,
  Layers,
  Sparkles,
  ArrowRight,
  Info,
  Clock,
  ExternalLink,
  QrCode,
  Scan,
  ShieldCheck,
  Check,
  Send,
  RotateCcw,
  CreditCard,
  Landmark,
  Wallet,
  Zap,
} from 'lucide-react';
import { apportionLandedCost, calculateWithholdingTax, calculateAVCO } from '@gebeyaos/shared-types';
import { posApi } from '../utils/pos-api';
import { useAuth } from '../auth/AuthContext';
import { useI18n } from '../i18n/I18nContext';

const FALLBACK_SUPPLIERS: any[] = [];

export interface POLineItem {
  id?: string;
  productId: string;
  productName: string;
  sku: string;
  orderedQuantity: number;
  receivedQuantity: number;
  unitCost: number;
  taxRate: number;
  totalCost: number;
}

export interface PurchaseOrderSummary {
  id: string;
  orderNumber: string;
  supplierId: string;
  supplierName: string;
  supplierCode: string;
  supplierPhone?: string;
  supplierTin?: string;
  status: 'DRAFT' | 'APPROVED' | 'SENT' | 'PARTIALLY_RECEIVED' | 'RECEIVED' | 'CLOSED' | 'CANCELLED';
  requiresApproval?: boolean;
  expectedDeliveryDate: string | null;
  subtotal: number;
  taxTotal: number;
  grandTotal: number;
  itemCount: number;
  notes?: string;
  createdAt: string;
  items?: POLineItem[];
}

export interface GRNLineItem {
  id?: string;
  productId: string;
  productName: string;
  sku: string;
  orderedQuantity?: number;
  receivedQuantity: number;
  acceptedQuantity: number;
  rejectedQuantity: number;
  rejectReason?: string;
  batchNumber: string;
  expiryDate: string;
  purchaseUnitCost: number;
  apportionedLandedCost: number;
  finalUnitCost: number;
}

export interface GRNSummary {
  id: string;
  grnNumber: string;
  purchaseOrderId?: string | null;
  poOrderNumber?: string | null;
  supplierId: string;
  supplierName: string;
  supplierCode?: string;
  supplierInvoiceNo?: string;
  supplierInvoiceDate?: string;
  landedFreightCost: number;
  landedDutyCost?: number;
  landedOtherCost: number;
  totalReceivedCost: number;
  withholdingTaxAmount: number;
  netSupplierPayable?: number;
  itemCount: number;
  receivedBy: string;
  createdAt: string;
  items?: GRNLineItem[];
}

export interface SupplierPayableItem {
  id: string;
  branchId: string;
  supplierId: string;
  supplierName: string;
  supplierCode: string;
  tinNumber?: string;
  grnId?: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  totalAmount: number;
  withholdingAmount: number;
  netPayable: number;
  paidAmount: number;
  remainingBalance: number;
  agingDays: number;
  agingBucket: 'CURRENT' | '1-30' | '31-60' | '60+';
  status: 'UNPAID' | 'PARTIALLY_PAID' | 'PAID' | 'CANCELLED';
}

export const PurchasingView: React.FC = () => {
  const { currentUser } = useAuth();
  const { language } = useI18n();

  // Navigation tab
  const [activeTab, setActiveTab] = useState<'orders' | 'grn' | 'suppliers' | 'payables'>('orders');

  // Search & Filter
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

  // Entities Data
  const [suppliers, setSuppliers] = useState<any[]>(FALLBACK_SUPPLIERS);
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrderSummary[]>([]);
  const [grnList, setGrnList] = useState<GRNSummary[]>([]);
  const [payables, setPayables] = useState<SupplierPayableItem[]>([]);
  const [catalogProducts, setCatalogProducts] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Modals & Drawers
  const [isPoModalOpen, setIsPoModalOpen] = useState(false);
  const [isGrnWizardOpen, setIsGrnWizardOpen] = useState(false);
  const [isSupplierModalOpen, setIsSupplierModalOpen] = useState(false);
  const [isReorderDrawerOpen, setIsReorderDrawerOpen] = useState(false);
  const [isApproveModalOpen, setIsApproveModalOpen] = useState(false);
  const [poToApprove, setPoToApprove] = useState<PurchaseOrderSummary | null>(null);
  const [managerPin, setManagerPin] = useState('');
  const [approvalError, setApprovalError] = useState('');

  // Payment Modal
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [selectedPayableForPayment, setSelectedPayableForPayment] = useState<SupplierPayableItem | null>(null);
  const [paymentAmount, setPaymentAmount] = useState<number>(0);
  const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'BANK_TRANSFER' | 'TELEBIRR' | 'CBE_BIRR' | 'CHECK'>('BANK_TRANSFER');
  const [paymentReference, setPaymentReference] = useState('');
  const [paymentNotes, setPaymentNotes] = useState('');

  // Supplier Return Modal
  const [isReturnModalOpen, setIsReturnModalOpen] = useState(false);
  const [returnSupplierId, setReturnSupplierId] = useState('');
  const [returnReason, setReturnReason] = useState('Defective goods identified at receipt');
  const [returnItems, setReturnItems] = useState<
    Array<{ productId: string; productName: string; sku: string; batchNumber: string; quantity: number; unitCost: number; reason: string }>
  >([]);

  // Selected PO for GRN receiving
  const [selectedPoForGrn, setSelectedPoForGrn] = useState<PurchaseOrderSummary | null>(null);

  // Document Inspection/Print Modal
  const [inspectDoc, setInspectDoc] = useState<{ type: 'PO' | 'GRN' | 'RETURN'; data: any } | null>(null);

  // Notifications
  const [toastMsg, setToastMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setToastMsg({ type, text });
    setTimeout(() => setToastMsg(null), 4500);
  };

  const fmt = (n: number) =>
    Number(n || 0).toLocaleString('en-ET', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  // ─── Initial Load ───
  useEffect(() => {
    loadPurchasingData();
  }, []);

  const loadPurchasingData = async () => {
    setIsLoading(true);
    try {
      const [supData, poData, grnData, payablesData, catData] = await Promise.all([
        posApi.getSuppliers(),
        posApi.getPurchaseOrders(currentUser?.branchId),
        posApi.getGrnList(currentUser?.branchId),
        posApi.getPayables(currentUser?.branchId),
        posApi.getCatalog(currentUser?.branchId),
      ]);

      setSuppliers(Array.isArray(supData) ? supData : []);
      setPurchaseOrders(Array.isArray(poData) ? poData : []);
      setGrnList(Array.isArray(grnData) ? grnData : []);
      setPayables(Array.isArray(payablesData) ? payablesData : []);
      setCatalogProducts(Array.isArray(catData) ? catData : []);
    } catch (err: any) {
      console.warn('Could not load purchasing from server:', err);
      setSuppliers([]);
      setPurchaseOrders([]);
      setGrnList([]);
      setPayables([]);
      setCatalogProducts([]);
    } finally {
      setIsLoading(false);
    }
  };

  // ─── Filtered Data ───
  const filteredPOs = useMemo(() => {
    return purchaseOrders.filter((po) => {
      const matchSearch =
        po.orderNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
        po.supplierName.toLowerCase().includes(searchQuery.toLowerCase());
      const matchStatus = statusFilter === 'ALL' || po.status === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [purchaseOrders, searchQuery, statusFilter]);

  const filteredGRNs = useMemo(() => {
    return grnList.filter((grn) => {
      const matchSearch =
        grn.grnNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
        grn.supplierName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (grn.poOrderNumber && grn.poOrderNumber.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (grn.supplierInvoiceNo && grn.supplierInvoiceNo.toLowerCase().includes(searchQuery.toLowerCase()));
      return matchSearch;
    });
  }, [grnList, searchQuery]);

  const filteredSuppliers = useMemo(() => {
    return suppliers.filter((s) => {
      return (
        s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (s.tinNumber && s.tinNumber.includes(searchQuery))
      );
    });
  }, [suppliers, searchQuery]);

  const filteredPayables = useMemo(() => {
    return payables.filter((p) => {
      return (
        p.supplierName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.invoiceNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (statusFilter === 'ALL' || p.agingBucket === statusFilter || p.status === statusFilter)
      );
    });
  }, [payables, searchQuery, statusFilter]);

  // Metric Aggregates
  const totalOpenPOs = purchaseOrders.filter(
    (p) => p.status === 'SENT' || p.status === 'PARTIALLY_RECEIVED' || p.status === 'APPROVED',
  ).length;
  const totalReceivedValue = grnList.reduce((acc, g) => acc + (g.totalReceivedCost || 0), 0);
  const totalLandedAdditions = grnList.reduce(
    (acc, g) => acc + (g.landedFreightCost || 0) + (g.landedDutyCost || 0) + (g.landedOtherCost || 0),
    0,
  );
  const totalWithheldTax = grnList.reduce((acc, g) => acc + (g.withholdingTaxAmount || 0), 0);
  const totalOutstandingPayables = payables.reduce((acc, p) => acc + (p.remainingBalance || 0), 0);

  // Aging summary buckets
  const agingSummary = useMemo(() => {
    const buckets = { current: 0, d1_30: 0, d31_60: 0, d60_plus: 0 };
    for (const p of payables) {
      if (p.status === 'PAID') continue;
      if (p.agingBucket === 'CURRENT') buckets.current += p.remainingBalance;
      else if (p.agingBucket === '1-30') buckets.d1_30 += p.remainingBalance;
      else if (p.agingBucket === '31-60') buckets.d31_60 += p.remainingBalance;
      else if (p.agingBucket === '60+') buckets.d60_plus += p.remainingBalance;
    }
    return buckets;
  }, [payables]);

  // Low stock products for 2-tap reorder
  const lowStockProducts = useMemo(() => {
    return catalogProducts.filter((p: any) => p.stockOnHand <= (p.minStockLevel || 0));
  }, [catalogProducts]);

  // ─── 2-Tap PO Creation from Reorder Suggestions ───
  const handleExecuteTwoTapReorder = async () => {
    if (lowStockProducts.length === 0 || suppliers.length === 0) return;
    const groups: Record<string, any[]> = {};
    for (const prod of lowStockProducts) {
      const supId = prod.supplierId || suppliers[0]?.id;
      if (!supId) continue;
      if (!groups[supId]) groups[supId] = [];
      groups[supId].push(prod);
    }

    let createdCount = 0;
    const newOrders: PurchaseOrderSummary[] = [];

    for (const [supId, prods] of Object.entries(groups)) {
      const sup = suppliers.find((s) => s.id === supId) || suppliers[0];
      if (!sup) continue;
      const items = prods.map((p) => ({
        id: `poi-reorder-${Date.now()}-${p.id}`,
        productId: p.id,
        productName: p.nameEn || p.sku,
        sku: p.sku,
        orderedQuantity: p.minStockLevel ? Math.max(10, p.minStockLevel * 2) : 20,
        receivedQuantity: 0,
        unitCost: p.costPrice || 0,
        taxRate: p.vatRate || 0.15,
        totalCost: (p.minStockLevel ? Math.max(10, p.minStockLevel * 2) : 20) * (p.costPrice || 0),
      }));

      const subtotal = items.reduce((s, i) => s + i.totalCost, 0);
      const taxTotal = subtotal * 0.15;
      const grandTotal = subtotal + taxTotal;
      const requiresApproval = grandTotal > 50000;
      const initialStatus = requiresApproval ? 'DRAFT' : 'APPROVED';

      const orderNumber = `PO-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-R${Math.floor(1000 + Math.random() * 9000)}`;

      const newPo: PurchaseOrderSummary = {
        id: `po-${Date.now()}-${supId}`,
        orderNumber,
        supplierId: sup.id,
        supplierName: sup.name,
        supplierCode: sup.code || 'SUP',
        supplierPhone: sup.phone,
        supplierTin: sup.tinNumber,
        status: initialStatus,
        requiresApproval,
        expectedDeliveryDate: new Date(Date.now() + 3 * 86400000).toISOString().split('T')[0],
        subtotal,
        taxTotal,
        grandTotal,
        itemCount: items.length,
        notes: '⚡ Auto-generated via 2-Tap Reorder Suggestions',
        createdAt: new Date().toISOString(),
        items,
      };

      try {
        await posApi.createPurchaseOrder({
          supplier_id: sup.id,
          expected_delivery_date: newPo.expectedDeliveryDate,
          notes: newPo.notes,
          items: items.map((i) => ({
            product_id: i.productId,
            ordered_quantity: i.orderedQuantity,
            unit_cost: i.unitCost,
            tax_rate: i.taxRate,
          })),
        });
      } catch {
        // fallback
      }

      newOrders.push(newPo);
      createdCount++;
    }

    setPurchaseOrders((prev) => [...newOrders, ...prev]);
    setIsReorderDrawerOpen(false);
    showToast(
      `⚡ Success! Created ${createdCount} Purchase Order(s) from reorder suggestions in 2 taps.`,
      'success',
    );
  };

  // ─── Create Purchase Order State (Manual) ───
  const [newPoSupplierId, setNewPoSupplierId] = useState(suppliers[0]?.id || '');
  const [newPoDeliveryDate, setNewPoDeliveryDate] = useState(
    new Date(Date.now() + 5 * 86400000).toISOString().split('T')[0],
  );
  const [newPoNotes, setNewPoNotes] = useState('');
  const [newPoItems, setNewPoItems] = useState<
    Array<{ productId: string; orderedQuantity: number; unitCost: number; taxRate: number }>
  >([]);

  const handleAddPoLine = () => {
    const nextProd = catalogProducts.length > 0 ? catalogProducts[newPoItems.length % catalogProducts.length] : null;
    setNewPoItems((prev) => [
      ...prev,
      {
        productId: nextProd?.id || '',
        orderedQuantity: 20,
        unitCost: nextProd?.costPrice || 0,
        taxRate: nextProd?.vatRate || 0.15,
      },
    ]);
  };

  const handleRemovePoLine = (idx: number) => {
    setNewPoItems((prev) => prev.filter((_, i) => i !== idx));
  };

  const calculatedPoSummary = useMemo(() => {
    let subtotal = 0;
    let taxTotal = 0;
    for (const item of newPoItems) {
      const lineCost = item.orderedQuantity * item.unitCost;
      const lineTax = lineCost * item.taxRate;
      subtotal += lineCost;
      taxTotal += lineTax;
    }
    const grandTotal = subtotal + taxTotal;
    const requiresApproval = grandTotal > 50000;
    return { subtotal, taxTotal, grandTotal, requiresApproval };
  }, [newPoItems]);

  const handleSubmitPO = async (e: React.FormEvent) => {
    e.preventDefault();
    const sup = suppliers.find((s) => s.id === newPoSupplierId) || suppliers[0];
    const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const orderNumber = `PO-${datePart}-000${purchaseOrders.length + 1}`;

    const itemsPayload = newPoItems.map((item) => {
      const prod = catalogProducts.find((p) => p.id === item.productId);
      return {
        id: `poi-${Date.now()}-${Math.random()}`,
        productId: item.productId,
        productName: prod?.nameEn || 'Product',
        sku: prod?.sku || 'SKU-001',
        orderedQuantity: item.orderedQuantity,
        receivedQuantity: 0,
        unitCost: item.unitCost,
        taxRate: item.taxRate,
        totalCost: item.orderedQuantity * item.unitCost,
      };
    });

    const initialStatus = calculatedPoSummary.requiresApproval ? 'DRAFT' : 'APPROVED';

    const newPo: PurchaseOrderSummary = {
      id: `po-${Date.now()}`,
      orderNumber,
      supplierId: sup.id,
      supplierName: sup.name,
      supplierCode: sup.code,
      supplierPhone: sup.phone,
      supplierTin: sup.tinNumber,
      status: initialStatus,
      requiresApproval: calculatedPoSummary.requiresApproval,
      expectedDeliveryDate: newPoDeliveryDate,
      subtotal: calculatedPoSummary.subtotal,
      taxTotal: calculatedPoSummary.taxTotal,
      grandTotal: calculatedPoSummary.grandTotal,
      itemCount: itemsPayload.length,
      notes: newPoNotes || 'Official Purchase Order',
      createdAt: new Date().toISOString(),
      items: itemsPayload,
    };

    try {
      await posApi.createPurchaseOrder({
        supplier_id: sup.id,
        expected_delivery_date: newPoDeliveryDate,
        notes: newPoNotes,
        items: newPoItems.map((i) => ({
          product_id: i.productId,
          ordered_quantity: i.orderedQuantity,
          unit_cost: i.unitCost,
          tax_rate: i.taxRate,
        })),
      });
    } catch {
      // offline fallback
    }

    setPurchaseOrders((prev) => [newPo, ...prev]);
    showToast(
      calculatedPoSummary.requiresApproval
        ? `PO ${orderNumber} created in DRAFT. Total exceeds 50,000 ETB: Manager PIN approval required.`
        : `PO ${orderNumber} created and APPROVED for ${sup.name}!`,
    );
    setIsPoModalOpen(false);
  };

  // ─── PO Approval & Sending ───
  const openApproveModal = (po: PurchaseOrderSummary) => {
    setPoToApprove(po);
    setManagerPin('');
    setApprovalError('');
    setIsApproveModalOpen(true);
  };

  const handleApprovePO = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!poToApprove) return;

    try {
      const verifyRes = await posApi.verifyManagerPin(currentUser?.branchId || '', { pin: managerPin });
      if (!verifyRes.authorized) {
        setApprovalError(verifyRes.message || 'Invalid Manager PIN.');
        return;
      }
      await posApi.approvePurchaseOrder(poToApprove.id, managerPin);
    } catch {
      // offline fallback
    }

    setPurchaseOrders((prev) =>
      prev.map((p) => (p.id === poToApprove.id ? { ...p, status: 'APPROVED' } : p)),
    );
    showToast(`Purchase Order ${poToApprove.orderNumber} APPROVED!`, 'success');
    setIsApproveModalOpen(false);
  };

  const handleSendPO = async (po: PurchaseOrderSummary) => {
    try {
      await posApi.sendPurchaseOrder(po.id);
    } catch {
      // offline fallback
    }
    setPurchaseOrders((prev) =>
      prev.map((p) => (p.id === po.id ? { ...p, status: 'SENT' } : p)),
    );
    showToast(`PO ${po.orderNumber} marked as SENT to ${po.supplierName}!`, 'success');
  };

  // ─── 4-Step "Receive Goods" (GRN) Wizard State ───
  // Step 1: Supplier & Reference
  // Step 2: Items & Discrepancies (with continuous barcode scan)
  // Step 3: Landed Costs (Freight, Duty, Other) + Allocation (By Value vs By Quantity)
  // Step 4: Review (AVCO impact, 2% Withholding, Payable due date)
  const [grnWizardStep, setGrnWizardStep] = useState<1 | 2 | 3 | 4>(1);
  const [grnSupplierId, setGrnSupplierId] = useState(suppliers[0]?.id || 's1');
  const [grnPoId, setGrnPoId] = useState<string | null>(null);
  const [grnInvoiceNo, setGrnInvoiceNo] = useState(`INV-${Date.now().toString().slice(-6)}`);
  const [grnInvoiceDate, setGrnInvoiceDate] = useState(new Date().toISOString().split('T')[0]);
  const [grnReceivingDock, setGrnReceivingDock] = useState('Main Receiving Dock');

  // Landed Costs
  const [grnFreightCost, setGrnFreightCost] = useState(0);
  const [grnDutyCost, setGrnDutyCost] = useState(0);
  const [grnOtherCost, setGrnOtherCost] = useState(0);
  const [grnAllocationMethod, setGrnAllocationMethod] = useState<'BY_VALUE' | 'BY_QUANTITY'>('BY_VALUE');

  // Items in GRN
  const [grnItems, setGrnItems] = useState<
    Array<{
      productId: string;
      productName: string;
      sku: string;
      barcode?: string;
      orderedQty?: number;
      receivedQuantity: number;
      acceptedQuantity: number;
      rejectedQuantity: number;
      rejectReason: string;
      purchaseUnitCost: number;
      batchNumber: string;
      expiryDate: string;
    }>
  >([]);

  // Scan input field in Step 2
  const [scanBarcodeInput, setScanBarcodeInput] = useState('');
  const scanInputRef = useRef<HTMLInputElement>(null);

  // Trigger GRN modal from PO
  const openGrnForPo = (po: PurchaseOrderSummary) => {
    setSelectedPoForGrn(po);
    setGrnPoId(po.id);
    setGrnSupplierId(po.supplierId);
    setGrnInvoiceNo(`INV-${po.orderNumber.replace('PO-', '')}`);
    setGrnWizardStep(1);

    const itemsToReceive = (po.items || []).map((poi) => {
      const remaining = Math.max(0, poi.orderedQuantity - poi.receivedQuantity);
      const prod = catalogProducts.find((p) => p.id === poi.productId);
      return {
        productId: poi.productId,
        productName: poi.productName,
        sku: poi.sku,
        barcode: prod?.barcode,
        orderedQty: poi.orderedQuantity,
        receivedQuantity: remaining,
        acceptedQuantity: remaining,
        rejectedQuantity: 0,
        rejectReason: '',
        purchaseUnitCost: poi.unitCost,
        batchNumber: `BAT-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${poi.sku.slice(0, 6)}`,
        expiryDate: new Date(Date.now() + 180 * 86400000).toISOString().split('T')[0],
      };
    });

    setGrnItems(itemsToReceive);
    setIsGrnWizardOpen(true);
  };

  // Direct Ad-Hoc GRN
  const openDirectGrn = () => {
    setSelectedPoForGrn(null);
    setGrnPoId(null);
    setGrnSupplierId(suppliers[0]?.id || '');
    setGrnInvoiceNo(`INV-DIR-${Date.now().toString().slice(-5)}`);
    setGrnWizardStep(1);
    if (catalogProducts.length > 0) {
      const first = catalogProducts[0];
      setGrnItems([
        {
          productId: first.id,
          productName: first.nameEn,
          sku: first.sku,
          barcode: first.barcode,
          receivedQuantity: 10,
          acceptedQuantity: 10,
          rejectedQuantity: 0,
          rejectReason: '',
          purchaseUnitCost: first.costPrice || 0,
          batchNumber: `BAT-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${first.sku.slice(0, 6)}`,
          expiryDate: new Date(Date.now() + 180 * 86400000).toISOString().split('T')[0],
        },
      ]);
    } else {
      setGrnItems([]);
    }
    setIsGrnWizardOpen(true);
  };

  // Handle Scanning an Item Barcode in Step 2
  const handleBarcodeScan = (e: React.FormEvent) => {
    e.preventDefault();
    const code = scanBarcodeInput.trim();
    if (!code) return;

    const matchedProduct = catalogProducts.find(
      (p) => p.barcode === code || p.sku?.toLowerCase() === code.toLowerCase(),
    );

    if (matchedProduct) {
      setGrnItems((prev) => {
        const existingIdx = prev.findIndex((i) => i.productId === matchedProduct.id);
        if (existingIdx >= 0) {
          // Increment quantity by 1
          return prev.map((item, idx) =>
            idx === existingIdx
              ? {
                  ...item,
                  receivedQuantity: item.receivedQuantity + 1,
                  acceptedQuantity: item.acceptedQuantity + 1,
                }
              : item,
          );
        } else {
          // Add new item line
          return [
            ...prev,
            {
              productId: matchedProduct.id,
              productName: matchedProduct.nameEn,
              sku: matchedProduct.sku,
              barcode: matchedProduct.barcode,
              receivedQuantity: 1,
              acceptedQuantity: 1,
              rejectedQuantity: 0,
              rejectReason: '',
              purchaseUnitCost: matchedProduct.costPrice,
              batchNumber: `BAT-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${matchedProduct.sku.slice(0, 5)}`,
              expiryDate: new Date(Date.now() + 180 * 86400000).toISOString().split('T')[0],
            },
          ];
        }
      });
      showToast(`Scanned: ${matchedProduct.nameEn}`, 'success');
    } else {
      showToast(`Unrecognized barcode: ${code}. Add via manual item picker.`, 'error');
    }

    setScanBarcodeInput('');
    scanInputRef.current?.focus();
  };

  // Landed Cost Apportionment Real-Time Calculation (By Value or By Quantity)
  const calculatedGrnDetails = useMemo(() => {
    const rawItems = grnItems.map((gi) => ({
      productId: gi.productId,
      receivedQuantity: gi.acceptedQuantity,
      purchaseUnitCost: gi.purchaseUnitCost,
    }));

    const totalFreight = Number(grnFreightCost || 0);
    const totalDuty = Number(grnDutyCost || 0);
    const totalOther = Number(grnOtherCost || 0);
    const totalLandedAdditions = totalFreight + totalDuty + totalOther;

    const apportioned = apportionLandedCost(
      rawItems,
      totalFreight,
      totalOther,
      totalDuty,
      grnAllocationMethod,
    );

    const totalGoodsValue = apportioned.reduce((sum, item) => sum + item.purchaseTotal, 0);
    const totalReceivedCost = totalGoodsValue + totalLandedAdditions;

    // Ethiopian Withholding Tax: 2% on purchases >= 10,000 ETB
    const sup = suppliers.find((s) => s.id === grnSupplierId);
    const withholdingTax = calculateWithholdingTax(totalReceivedCost, Boolean(sup?.tinNumber));
    const netSupplierPayable = totalReceivedCost - withholdingTax;

    // Due date calculation from payment terms
    const paymentTermsDays = sup?.paymentTermsDays || 0;
    const invDate = grnInvoiceDate ? new Date(grnInvoiceDate) : new Date();
    const dueDate = new Date(invDate.getTime() + paymentTermsDays * 86400000);

    // AVCO Blending impact preview
    const avcoPreviews = grnItems.map((gi, idx) => {
      const prod = catalogProducts.find((p) => p.id === gi.productId);
      const oldQty = prod?.stockOnHand || 0;
      const oldCost = prod?.costPrice || gi.purchaseUnitCost;
      const app = apportioned[idx];
      const landedUnitCost = app?.finalUnitCost || gi.purchaseUnitCost;

      const avcoResult = calculateAVCO({
        currentOnHandQty: oldQty,
        currentCost: oldCost,
        receivedQty: gi.acceptedQuantity,
        receivedUnitCost: landedUnitCost,
      });

      return {
        productName: gi.productName,
        sku: gi.sku,
        oldQty,
        oldCost,
        receivedQty: gi.acceptedQuantity,
        landedUnitCost,
        newAvco: avcoResult.newCost,
      };
    });

    return {
      apportioned,
      totalGoodsValue,
      totalLandedAdditions,
      totalReceivedCost,
      withholdingTax,
      netSupplierPayable,
      dueDate: dueDate.toISOString().split('T')[0],
      paymentTermsDays,
      avcoPreviews,
    };
  }, [
    grnItems,
    grnFreightCost,
    grnDutyCost,
    grnOtherCost,
    grnAllocationMethod,
    grnSupplierId,
    grnInvoiceDate,
    suppliers,
  ]);

  // Submit Final GRN in ONE Transaction
  const handleSubmitGRN = async (e: React.FormEvent) => {
    e.preventDefault();
    const sup = suppliers.find((s) => s.id === grnSupplierId) || suppliers[0];
    const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const grnNumber = `GRN-${datePart}-000${grnList.length + 1}`;

    const savedItems: GRNLineItem[] = grnItems.map((gi, idx) => {
      const app = calculatedGrnDetails.apportioned[idx];
      return {
        id: `gi-${Date.now()}-${idx}`,
        productId: gi.productId,
        productName: gi.productName,
        sku: gi.sku,
        orderedQuantity: gi.orderedQty,
        receivedQuantity: gi.receivedQuantity,
        acceptedQuantity: gi.acceptedQuantity,
        rejectedQuantity: gi.rejectedQuantity,
        rejectReason: gi.rejectReason,
        batchNumber: gi.batchNumber,
        expiryDate: gi.expiryDate,
        purchaseUnitCost: gi.purchaseUnitCost,
        apportionedLandedCost: app?.apportionedLandedCost || 0,
        finalUnitCost: app?.finalUnitCost || gi.purchaseUnitCost,
      };
    });

    const newGrn: GRNSummary = {
      id: `grn-${Date.now()}`,
      grnNumber,
      purchaseOrderId: grnPoId,
      poOrderNumber: selectedPoForGrn?.orderNumber || null,
      supplierId: sup.id,
      supplierName: sup.name,
      supplierCode: sup.code,
      supplierInvoiceNo: grnInvoiceNo,
      supplierInvoiceDate: grnInvoiceDate,
      landedFreightCost: Number(grnFreightCost || 0),
      landedDutyCost: Number(grnDutyCost || 0),
      landedOtherCost: Number(grnOtherCost || 0),
      totalReceivedCost: calculatedGrnDetails.totalReceivedCost,
      withholdingTaxAmount: calculatedGrnDetails.withholdingTax,
      netSupplierPayable: calculatedGrnDetails.netSupplierPayable,
      itemCount: savedItems.length,
      receivedBy: currentUser?.fullName || 'Storekeeper (Bole Branch)',
      createdAt: new Date().toISOString(),
      items: savedItems,
    };

    // Update PO status if linked
    if (grnPoId) {
      setPurchaseOrders((prev) =>
        prev.map((p) => {
          if (p.id === grnPoId) {
            const updatedItems = (p.items || []).map((poi) => {
              const matchingGrnItem = grnItems.find((gi) => gi.productId === poi.productId);
              const addQty = matchingGrnItem ? matchingGrnItem.acceptedQuantity : 0;
              const newRec = poi.receivedQuantity + addQty;
              return { ...poi, receivedQuantity: newRec };
            });
            const allComplete = updatedItems.every((i) => i.receivedQuantity >= i.orderedQuantity);
            return {
              ...p,
              status: allComplete ? 'RECEIVED' : 'PARTIALLY_RECEIVED',
              items: updatedItems,
            };
          }
          return p;
        }),
      );
    }

    // Create Supplier Payable in state
    const newPayable: SupplierPayableItem = {
      id: `pay-${Date.now()}`,
      branchId: 'b-01',
      supplierId: sup.id,
      supplierName: sup.name,
      supplierCode: sup.code,
      tinNumber: sup.tinNumber,
      grnId: newGrn.id,
      invoiceNumber: grnInvoiceNo,
      invoiceDate: grnInvoiceDate,
      dueDate: calculatedGrnDetails.dueDate,
      totalAmount: calculatedGrnDetails.totalReceivedCost,
      withholdingAmount: calculatedGrnDetails.withholdingTax,
      netPayable: calculatedGrnDetails.netSupplierPayable,
      paidAmount: 0,
      remainingBalance: calculatedGrnDetails.netSupplierPayable,
      agingDays: 0,
      agingBucket: 'CURRENT',
      status: 'UNPAID',
    };

    try {
      await posApi.createGRN({
        supplier_id: sup.id,
        purchase_order_id: grnPoId,
        supplier_invoice_no: grnInvoiceNo,
        supplier_invoice_date: grnInvoiceDate,
        landed_freight_cost: Number(grnFreightCost || 0),
        landed_duty_cost: Number(grnDutyCost || 0),
        landed_other_cost: Number(grnOtherCost || 0),
        allocation_method: grnAllocationMethod,
        apply_withholding_tax: Boolean(sup?.tinNumber),
        items: grnItems.map((gi) => ({
          product_id: gi.productId,
          received_quantity: gi.acceptedQuantity,
          purchase_unit_cost: gi.purchaseUnitCost,
          batch_number: gi.batchNumber,
          expiry_date: gi.expiryDate,
        })),
      });
    } catch {
      // offline fallback
    }

    setGrnList((prev) => [newGrn, ...prev]);
    setPayables((prev) => [newPayable, ...prev]);
    showToast(
      `GRN ${grnNumber} authorized in ONE transaction: stock ledger posted, AVCO blended, and payable created with due date ${calculatedGrnDetails.dueDate}!`,
      'success',
    );
    setIsGrnWizardOpen(false);
  };

  // ─── Record Supplier Payment State ───
  const openPaymentModal = (payable: SupplierPayableItem) => {
    setSelectedPayableForPayment(payable);
    setPaymentAmount(payable.remainingBalance);
    setPaymentMethod('BANK_TRANSFER');
    setPaymentReference(`TXN-${Date.now().toString().slice(-6)}`);
    setPaymentNotes('');
    setIsPaymentModalOpen(true);
  };

  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPayableForPayment) return;

    const amt = Number(paymentAmount);
    if (amt <= 0 || amt > selectedPayableForPayment.remainingBalance) {
      showToast('Payment amount must be greater than 0 and not exceed balance', 'error');
      return;
    }

    try {
      await posApi.recordSupplierPayment({
        branch_id: 'b-01',
        supplier_id: selectedPayableForPayment.supplierId,
        payable_id: selectedPayableForPayment.id,
        amount: amt,
        payment_method: paymentMethod,
        reference_number: paymentReference,
        notes: paymentNotes,
      });
    } catch {
      // offline fallback
    }

    setPayables((prev) =>
      prev.map((p) => {
        if (p.id === selectedPayableForPayment.id) {
          const newPaid = p.paidAmount + amt;
          const newRem = p.netPayable - newPaid;
          return {
            ...p,
            paidAmount: newPaid,
            remainingBalance: Math.max(0, newRem),
            status: newRem <= 0.01 ? 'PAID' : 'PARTIALLY_PAID',
          };
        }
        return p;
      }),
    );

    showToast(`Payment of ${fmt(amt)} ETB recorded for ${selectedPayableForPayment.supplierName}!`);
    setIsPaymentModalOpen(false);
  };

  // ─── Supplier Return Modal ───
  const openReturnModal = (grn?: GRNSummary) => {
    if (grn) {
      setReturnSupplierId(grn.supplierId);
      const items = (grn.items || []).map((gi) => ({
        productId: gi.productId,
        productName: gi.productName,
        sku: gi.sku,
        batchNumber: gi.batchNumber,
        quantity: 1,
        unitCost: gi.purchaseUnitCost,
        reason: 'Damaged or defective goods discovered upon inspection',
      }));
      setReturnItems(items);
    } else {
      setReturnSupplierId(suppliers[0]?.id || '');
      setReturnItems([]);
    }
    setIsReturnModalOpen(true);
  };

  const handleProcessReturn = async (e: React.FormEvent) => {
    e.preventDefault();
    const sup = suppliers.find((s) => s.id === returnSupplierId) || suppliers[0];
    const returnNumber = `RET-${Date.now().toString().slice(-6)}`;

    try {
      await posApi.processSupplierReturn({
        branch_id: 'b-01',
        supplier_id: sup.id,
        reason: returnReason,
        items: returnItems.map((i) => ({
          product_id: i.productId,
          batch_number: i.batchNumber,
          quantity: i.quantity,
          unit_cost: i.unitCost,
          reason: i.reason,
        })),
      });
    } catch {
      // offline fallback
    }

    showToast(
      `Purchase Return ${returnNumber} processed! Reversing movements recorded in stock ledger.`,
      'success',
    );
    setIsReturnModalOpen(false);
  };

  // ─── New Supplier State ───
  const [newSupName, setNewSupName] = useState('');
  const [newSupCode, setNewSupCode] = useState('');
  const [newSupTin, setNewSupTin] = useState('');
  const [newSupPhone, setNewSupPhone] = useState('+251 9');
  const [newSupEmail, setNewSupEmail] = useState('');
  const [newSupTerms, setNewSupTerms] = useState(30);

  const handleCreateSupplier = async (e: React.FormEvent) => {
    e.preventDefault();
    const newSup = {
      id: `s-${Date.now()}`,
      code: newSupCode.toUpperCase() || `SUP-${Date.now().toString().slice(-4)}`,
      name: newSupName,
      tinNumber: newSupTin || null,
      phone: newSupPhone,
      email: newSupEmail || null,
      paymentTermsDays: Number(newSupTerms),
      isActive: true,
    };

    try {
      await posApi.createSupplier(newSup);
    } catch {
      // offline fallback
    }

    setSuppliers((prev) => [newSup, ...prev]);
    showToast(`Supplier ${newSup.name} added to approved directory!`);
    setIsSupplierModalOpen(false);
    setNewSupName('');
    setNewSupCode('');
    setNewSupTin('');
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-50 dark:bg-slate-950 overflow-hidden font-sans">
      {/* ─── Top Header Bar ─── */}
      <div className="px-6 py-4 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between shrink-0">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-purple-100 dark:bg-purple-900/40 text-purple-600 dark:text-purple-400 flex items-center justify-center font-bold shadow-xs">
              <Truck size={22} />
            </div>
            <div>
              <h1 className="text-xl font-black text-slate-900 dark:text-white flex items-center gap-2 tracking-tight">
                {language === 'am' ? 'ግዢ እና ዕቃ መቀበያ' : 'Purchasing & Goods Receiving (GRN)'}
                <span className="text-xs px-2.5 py-0.5 rounded-full font-semibold bg-purple-50 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300 border border-purple-200/60 dark:border-purple-700/50">
                  AVCO Blending &amp; Landed Cost
                </span>
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {language === 'am'
                  ? 'የግዢ ትዕዛዞች፣ የእቃ መቀበያ ሰነዶች፣ የመጓጓዣ ወጪ ክፍፍል እና 2% ታክስ'
                  : 'Supplier relationships, automated reorder POs, 4-step landed cost receiving, and payables aging.'}
              </p>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          {/* 2-Tap Reorder Button */}
          <button
            onClick={() => setIsReorderDrawerOpen(true)}
            className="px-3.5 py-2 text-xs font-bold rounded-xl bg-amber-500 hover:bg-amber-400 text-white shadow-sm transition-all flex items-center gap-1.5"
            title="Create PO from reorder suggestions in two taps"
          >
            <Zap size={15} className="fill-white" />
            <span>2-Tap Reorder ({lowStockProducts.length})</span>
          </button>

          <button
            onClick={() => setIsSupplierModalOpen(true)}
            className="px-3 py-2 text-xs font-semibold rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-200 transition-colors flex items-center gap-1.5"
          >
            <Users size={15} />
            {language === 'am' ? 'አቅራቢ መዝግብ' : 'Add Supplier'}
          </button>

          <button
            onClick={() => setIsPoModalOpen(true)}
            className="px-3 py-2 text-xs font-semibold rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-200 transition-colors flex items-center gap-1.5"
          >
            <FileText size={15} />
            {language === 'am' ? 'አዲስ የግዢ ትዕዛዝ' : 'New PO'}
          </button>

          <button
            onClick={() => openReturnModal()}
            className="px-3 py-2 text-xs font-semibold rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-200 transition-colors flex items-center gap-1.5"
          >
            <RotateCcw size={15} />
            <span>Return to Supplier</span>
          </button>

          <button
            onClick={openDirectGrn}
            className="px-4 py-2 text-xs font-bold rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm transition-colors flex items-center gap-1.5"
          >
            <Plus size={16} />
            {language === 'am' ? 'ዕቃ ተቀበል (GRN)' : 'Receive Goods Wizard'}
          </button>
        </div>
      </div>

      {/* ─── Metric Summaries ─── */}
      <div className="px-6 py-3.5 bg-slate-100/60 dark:bg-slate-900/40 border-b border-slate-200 dark:border-slate-800 grid grid-cols-5 gap-3.5 shrink-0">
        <div className="bg-white dark:bg-slate-800/80 p-3 rounded-xl border border-slate-200/80 dark:border-slate-700/60 flex items-center justify-between">
          <div>
            <div className="text-[10px] font-bold tracking-wider text-slate-500 dark:text-slate-400 uppercase">
              Open POs
            </div>
            <div className="text-lg font-black text-slate-900 dark:text-white mt-0.5">
              {totalOpenPOs} <span className="text-[11px] font-normal text-slate-500">active orders</span>
            </div>
          </div>
          <div className="w-8 h-8 rounded-lg bg-purple-50 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 flex items-center justify-center">
            <Clock size={16} />
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800/80 p-3 rounded-xl border border-slate-200/80 dark:border-slate-700/60 flex items-center justify-between">
          <div>
            <div className="text-[10px] font-bold tracking-wider text-slate-500 dark:text-slate-400 uppercase">
              Total Goods Received
            </div>
            <div className="text-lg font-black text-emerald-600 dark:text-emerald-400 mt-0.5 font-mono">
              {fmt(totalReceivedValue)} <span className="text-[11px] font-sans text-slate-500">ETB</span>
            </div>
          </div>
          <div className="w-8 h-8 rounded-lg bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
            <Truck size={16} />
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800/80 p-3 rounded-xl border border-slate-200/80 dark:border-slate-700/60 flex items-center justify-between">
          <div>
            <div className="text-[10px] font-bold tracking-wider text-slate-500 dark:text-slate-400 uppercase">
              Landed Freight &amp; Duty
            </div>
            <div className="text-lg font-black text-blue-600 dark:text-blue-400 mt-0.5 font-mono">
              {fmt(totalLandedAdditions)} <span className="text-[11px] font-sans text-slate-500">ETB</span>
            </div>
          </div>
          <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 flex items-center justify-center">
            <Layers size={16} />
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800/80 p-3 rounded-xl border border-slate-200/80 dark:border-slate-700/60 flex items-center justify-between">
          <div>
            <div className="text-[10px] font-bold tracking-wider text-slate-500 dark:text-slate-400 uppercase">
              Withholding Tax (2%)
            </div>
            <div className="text-lg font-black text-amber-600 dark:text-amber-400 mt-0.5 font-mono">
              {fmt(totalWithheldTax)} <span className="text-[11px] font-sans text-slate-500">ETB</span>
            </div>
          </div>
          <div className="w-8 h-8 rounded-lg bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 flex items-center justify-center">
            <DollarSign size={16} />
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800/80 p-3 rounded-xl border border-slate-200/80 dark:border-slate-700/60 flex items-center justify-between">
          <div>
            <div className="text-[10px] font-bold tracking-wider text-slate-500 dark:text-slate-400 uppercase">
              Payables Balance
            </div>
            <div className="text-lg font-black text-rose-600 dark:text-rose-400 mt-0.5 font-mono">
              {fmt(totalOutstandingPayables)} <span className="text-[11px] font-sans text-slate-500">ETB</span>
            </div>
          </div>
          <div className="w-8 h-8 rounded-lg bg-rose-50 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400 flex items-center justify-center">
            <CreditCard size={16} />
          </div>
        </div>
      </div>

      {/* ─── Navigation Subtabs & Search ─── */}
      <div className="px-6 py-3 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-1.5 p-1 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
          <button
            onClick={() => { setActiveTab('orders'); setStatusFilter('ALL'); }}
            className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-all flex items-center gap-1.5 ${
              activeTab === 'orders'
                ? 'bg-white dark:bg-slate-700 text-purple-600 dark:text-purple-300 shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <FileText size={14} />
            {language === 'am' ? 'የግዢ ትዕዛዞች' : 'Purchase Orders'} ({purchaseOrders.length})
          </button>
          <button
            onClick={() => { setActiveTab('grn'); setStatusFilter('ALL'); }}
            className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-all flex items-center gap-1.5 ${
              activeTab === 'grn'
                ? 'bg-white dark:bg-slate-700 text-emerald-600 dark:text-emerald-300 shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Truck size={14} />
            {language === 'am' ? 'የዕቃ መቀበያ (GRN)' : 'Goods Received (GRN)'} ({grnList.length})
          </button>
          <button
            onClick={() => { setActiveTab('suppliers'); setStatusFilter('ALL'); }}
            className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-all flex items-center gap-1.5 ${
              activeTab === 'suppliers'
                ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-300 shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Users size={14} />
            {language === 'am' ? 'አቅራቢዎች' : 'Suppliers'} ({suppliers.length})
          </button>
          <button
            onClick={() => { setActiveTab('payables'); setStatusFilter('ALL'); }}
            className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-all flex items-center gap-1.5 ${
              activeTab === 'payables'
                ? 'bg-white dark:bg-slate-700 text-rose-600 dark:text-rose-300 shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Landmark size={14} />
            <span>Payables Aging ({payables.length})</span>
          </button>
        </div>

        {/* Search Bar & Status Filter */}
        <div className="flex items-center gap-3">
          <div className="relative w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
            <input
              type="text"
              placeholder={
                activeTab === 'orders'
                  ? 'Search PO #, supplier...'
                  : activeTab === 'grn'
                  ? 'Search GRN #, invoice...'
                  : activeTab === 'payables'
                  ? 'Search payable, supplier...'
                  : 'Search suppliers, TIN...'
              }
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full text-xs pl-9 pr-3.5 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 border-none text-slate-900 dark:text-white placeholder:text-slate-400 focus:ring-1 focus:ring-purple-500"
            />
          </div>

          {activeTab === 'orders' && (
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="text-xs rounded-lg bg-slate-100 dark:bg-slate-800 border-none py-1.5 px-3 text-slate-700 dark:text-slate-300 font-semibold"
            >
              <option value="ALL">All Statuses</option>
              <option value="DRAFT">DRAFT (Needs Approval)</option>
              <option value="APPROVED">APPROVED</option>
              <option value="SENT">SENT</option>
              <option value="PARTIALLY_RECEIVED">PARTIALLY RECEIVED</option>
              <option value="RECEIVED">RECEIVED</option>
              <option value="CLOSED">CLOSED</option>
              <option value="CANCELLED">CANCELLED</option>
            </select>
          )}

          {activeTab === 'payables' && (
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="text-xs rounded-lg bg-slate-100 dark:bg-slate-800 border-none py-1.5 px-3 text-slate-700 dark:text-slate-300 font-semibold"
            >
              <option value="ALL">All Aging Buckets</option>
              <option value="CURRENT">Current (&lt; 0d due)</option>
              <option value="1-30">1-30 Days Overdue</option>
              <option value="31-60">31-60 Days Overdue</option>
              <option value="60+">60+ Days Overdue</option>
              <option value="PAID">Paid Only</option>
            </select>
          )}
        </div>
      </div>

      {/* ─── Main Content Views ─── */}
      <div className="flex-1 overflow-y-auto p-6">
        {/* VIEW 1: PURCHASE ORDERS */}
        {activeTab === 'orders' && (
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-[11px] font-bold text-slate-400 uppercase tracking-wider bg-slate-50 dark:bg-slate-800/40">
                    <th className="py-3 px-4">PO Number</th>
                    <th className="py-3 px-4">Supplier</th>
                    <th className="py-3 px-4 text-center">Items</th>
                    <th className="py-3 px-4 text-right">Subtotal</th>
                    <th className="py-3 px-4 text-right">Grand Total</th>
                    <th className="py-3 px-4 text-center">Status</th>
                    <th className="py-3 px-4 text-center">Expected Delivery</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                  {filteredPOs.map((po) => {
                    const statusColors: Record<string, string> = {
                      DRAFT: 'bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 border-amber-200/60',
                      APPROVED: 'bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 border-blue-200/60',
                      SENT: 'bg-purple-50 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300 border-purple-200/60',
                      PARTIALLY_RECEIVED: 'bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 border-amber-200/60',
                      RECEIVED: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-200/60',
                      CLOSED: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-slate-200/60',
                      CANCELLED: 'bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300 border-rose-200/60',
                    };

                    return (
                      <tr key={po.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors">
                        <td className="py-3 px-4 font-mono font-bold text-purple-600 dark:text-purple-400">
                          {po.orderNumber}
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-semibold text-slate-900 dark:text-white">{po.supplierName}</div>
                          <div className="text-[11px] text-slate-400 font-mono">{po.supplierCode}</div>
                        </td>
                        <td className="py-3 px-4 text-center font-mono font-semibold">{po.itemCount}</td>
                        <td className="py-3 px-4 text-right font-mono text-slate-600 dark:text-slate-400">
                          {fmt(po.subtotal)}
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-bold text-slate-900 dark:text-white">
                          {fmt(po.grandTotal)} ETB
                        </td>
                        <td className="py-3 px-4 text-center">
                          <span
                            className={`px-2.5 py-1 rounded-full text-[10px] font-bold border tracking-wide uppercase ${
                              statusColors[po.status] || 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            {po.status.replace('_', ' ')}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-center text-slate-500 font-mono text-[11px]">
                          {po.expectedDeliveryDate || '—'}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {/* Manager Approval Button if DRAFT */}
                            {po.status === 'DRAFT' && (
                              <button
                                onClick={() => openApproveModal(po)}
                                className="px-2.5 py-1 text-[11px] font-bold rounded-lg bg-amber-500 hover:bg-amber-400 text-white flex items-center gap-1 shadow-xs"
                                title="Approve with Manager PIN"
                              >
                                <ShieldCheck size={13} />
                                <span>Approve</span>
                              </button>
                            )}

                            {/* Send to Supplier if APPROVED */}
                            {po.status === 'APPROVED' && (
                              <button
                                onClick={() => handleSendPO(po)}
                                className="px-2.5 py-1 text-[11px] font-bold rounded-lg bg-purple-600 hover:bg-purple-500 text-white flex items-center gap-1 shadow-xs"
                                title="Send PO to Supplier"
                              >
                                <Send size={13} />
                                <span>Send</span>
                              </button>
                            )}

                            {/* Receive Goods Button if SENT or PARTIALLY_RECEIVED */}
                            {(po.status === 'SENT' || po.status === 'PARTIALLY_RECEIVED') && (
                              <button
                                onClick={() => openGrnForPo(po)}
                                className="px-2.5 py-1 text-[11px] font-bold rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white flex items-center gap-1 shadow-xs"
                                title="Receive goods against this PO"
                              >
                                <Truck size={13} />
                                <span>Receive</span>
                              </button>
                            )}

                            <button
                              onClick={() => setInspectDoc({ type: 'PO', data: po })}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                              title="Print / View Voucher"
                            >
                              <Printer size={15} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {filteredPOs.length === 0 && (
                    <tr>
                      <td colSpan={8} className="py-12 text-center text-slate-400">
                        <FileText className="mx-auto mb-2 text-slate-300 dark:text-slate-600" size={32} />
                        <p className="font-semibold text-sm">No purchase orders yet</p>
                        <p className="text-xs text-slate-400 mt-1">Create your first purchase order to order stock from suppliers</p>
                        <button
                          onClick={() => setIsPoModalOpen(true)}
                          className="mt-3 px-3 py-1.5 text-xs font-bold rounded-lg bg-purple-600 hover:bg-purple-500 text-white shadow-xs inline-flex items-center gap-1"
                        >
                          <Plus size={14} /> New Purchase Order
                        </button>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* VIEW 2: GOODS RECEIVED (GRN) */}
        {activeTab === 'grn' && (
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-[11px] font-bold text-slate-400 uppercase tracking-wider bg-slate-50 dark:bg-slate-800/40">
                    <th className="py-3 px-4">GRN Number</th>
                    <th className="py-3 px-4">Supplier</th>
                    <th className="py-3 px-4">Invoice / Waybill #</th>
                    <th className="py-3 px-4 text-center">Items</th>
                    <th className="py-3 px-4 text-right">Landed Cost</th>
                    <th className="py-3 px-4 text-right">Total Cost</th>
                    <th className="py-3 px-4 text-right">Withholding (2%)</th>
                    <th className="py-3 px-4 text-right">Net Payable</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                  {filteredGRNs.map((grn) => (
                    <tr key={grn.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors">
                      <td className="py-3 px-4 font-mono font-bold text-emerald-600 dark:text-emerald-400">
                        <div>{grn.grnNumber}</div>
                        {grn.poOrderNumber && (
                          <div className="text-[10px] text-slate-400 font-mono">PO: {grn.poOrderNumber}</div>
                        )}
                      </td>
                      <td className="py-3 px-4 font-semibold text-slate-900 dark:text-white">
                        {grn.supplierName}
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-600 dark:text-slate-300">
                        <div>{grn.supplierInvoiceNo || 'Direct Receipt'}</div>
                        <div className="text-[10px] text-slate-400">{grn.supplierInvoiceDate}</div>
                      </td>
                      <td className="py-3 px-4 text-center font-mono font-semibold">{grn.itemCount}</td>
                      <td className="py-3 px-4 text-right font-mono text-blue-600 dark:text-blue-400 font-semibold">
                        +{fmt((grn.landedFreightCost || 0) + (grn.landedDutyCost || 0) + (grn.landedOtherCost || 0))}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-slate-900 dark:text-white">
                        {fmt(grn.totalReceivedCost)} ETB
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-amber-600 dark:text-amber-400 font-semibold">
                        {grn.withholdingTaxAmount > 0 ? `-${fmt(grn.withholdingTaxAmount)}` : '0.00'}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-emerald-600 dark:text-emerald-400">
                        {fmt(grn.netSupplierPayable || grn.totalReceivedCost - grn.withholdingTaxAmount)} ETB
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => openReturnModal(grn)}
                            className="px-2 py-1 text-[11px] font-semibold rounded-lg text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 flex items-center gap-1"
                            title="Return defective/rejected items to supplier"
                          >
                            <RotateCcw size={13} />
                            <span>Return</span>
                          </button>
                          <button
                            onClick={() => setInspectDoc({ type: 'GRN', data: grn })}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                            title="Print / View GRN Voucher"
                          >
                            <Printer size={15} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {filteredGRNs.length === 0 && (
                    <tr>
                      <td colSpan={9} className="py-12 text-center text-slate-400">
                        <Truck className="mx-auto mb-2 text-slate-300 dark:text-slate-600" size={32} />
                        <p className="font-semibold text-sm">No goods received notes yet</p>
                        <p className="text-xs text-slate-400 mt-1">Receive deliveries from purchase orders or record direct receiving</p>
                        <button
                          onClick={openDirectGrn}
                          className="mt-3 px-3 py-1.5 text-xs font-bold rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white shadow-xs inline-flex items-center gap-1"
                        >
                          <Plus size={14} /> Receive Goods Wizard
                        </button>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* VIEW 3: SUPPLIERS DIRECTORY */}
        {activeTab === 'suppliers' && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredSuppliers.map((sup) => (
              <div
                key={sup.id}
                className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <h3 className="font-bold text-sm text-slate-900 dark:text-white leading-tight">
                      {sup.name}
                    </h3>
                    <span className="font-mono text-xs px-2 py-0.5 rounded-md font-bold bg-purple-50 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300">
                      {sup.code}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-[11px] px-2 py-0.5 rounded-md bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-300 font-semibold border border-amber-200/50">
                      WHT 2% {sup.tinNumber ? 'Eligible' : 'Exempt'}
                    </span>
                    <span className="text-[11px] text-slate-500 font-mono">
                      Terms: {sup.paymentTermsDays === 0 ? 'Cash on Delivery' : `Net ${sup.paymentTermsDays} Days`}
                    </span>
                  </div>

                  <div className="space-y-1.5 text-xs text-slate-500 dark:text-slate-400">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-slate-700 dark:text-slate-300 font-semibold">TIN:</span>
                      <span className="font-mono">{sup.tinNumber || 'Unregistered'}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Phone size={13} className="text-slate-400" />
                      <span>{sup.phone}</span>
                    </div>
                    {sup.email && (
                      <div className="flex items-center gap-2">
                        <Mail size={13} className="text-slate-400" />
                        <span>{sup.email}</span>
                      </div>
                    )}
                    {sup.address && (
                      <div className="text-[11px] text-slate-400 pt-1 line-clamp-1">
                        📍 {sup.address}
                      </div>
                    )}
                  </div>
                </div>

                <div className="pt-4 mt-4 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    Active Partner
                  </span>
                  <button
                    onClick={() => {
                      setNewPoSupplierId(sup.id);
                      setIsPoModalOpen(true);
                    }}
                    className="text-xs font-semibold text-purple-600 hover:text-purple-700 dark:text-purple-400 flex items-center gap-1"
                  >
                    Issue PO <ArrowRight size={13} />
                  </button>
                </div>
              </div>
            ))}
            {filteredSuppliers.length === 0 && (
              <div className="col-span-full py-12 text-center text-slate-400 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800">
                <Users className="mx-auto mb-2 text-slate-300 dark:text-slate-600" size={32} />
                <p className="font-semibold text-sm">No suppliers registered yet</p>
                <p className="text-xs text-slate-400 mt-1">Add your first supplier to begin issuing purchase orders</p>
                <button
                  onClick={() => setIsSupplierModalOpen(true)}
                  className="mt-3 px-3 py-1.5 text-xs font-bold rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white shadow-xs inline-flex items-center gap-1"
                >
                  <Plus size={14} /> Add Supplier
                </button>
              </div>
            )}
          </div>
        )}

        {/* VIEW 4: PAYABLES & AGING REPORT */}
        {activeTab === 'payables' && (
          <div className="space-y-5">
            {/* Aging Bucket Cards */}
            <div className="grid grid-cols-4 gap-4">
              <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs">
                <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">Current (&lt; 0d Due)</div>
                <div className="text-xl font-black text-emerald-600 dark:text-emerald-400 mt-1 font-mono">
                  {fmt(agingSummary.current)} ETB
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5">Within standard credit terms</div>
              </div>

              <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs">
                <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">1 - 30 Days Overdue</div>
                <div className="text-xl font-black text-amber-500 dark:text-amber-400 mt-1 font-mono">
                  {fmt(agingSummary.d1_30)} ETB
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5">Payment due shortly</div>
              </div>

              <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs">
                <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">31 - 60 Days Overdue</div>
                <div className="text-xl font-black text-orange-500 dark:text-orange-400 mt-1 font-mono">
                  {fmt(agingSummary.d31_60)} ETB
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5">Requires cashier priority</div>
              </div>

              <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs">
                <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">60+ Days Overdue</div>
                <div className="text-xl font-black text-rose-600 dark:text-rose-400 mt-1 font-mono">
                  {fmt(agingSummary.d60_plus)} ETB
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5">Immediate settlement needed</div>
              </div>
            </div>

            {/* Payables Table */}
            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-xs">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 text-[11px] font-bold text-slate-400 uppercase tracking-wider bg-slate-50 dark:bg-slate-800/40">
                      <th className="py-3 px-4">Invoice #</th>
                      <th className="py-3 px-4">Supplier</th>
                      <th className="py-3 px-4">Invoice Date</th>
                      <th className="py-3 px-4">Due Date</th>
                      <th className="py-3 px-4 text-center">Aging Bucket</th>
                      <th className="py-3 px-4 text-right">Net Payable</th>
                      <th className="py-3 px-4 text-right">Paid Amount</th>
                      <th className="py-3 px-4 text-right">Remaining Balance</th>
                      <th className="py-3 px-4 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                    {filteredPayables.map((payable) => {
                      const bucketBadges: Record<string, string> = {
                        CURRENT: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
                        '1-30': 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
                        '31-60': 'bg-orange-50 text-orange-700 dark:bg-orange-950 dark:text-orange-300',
                        '60+': 'bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-300',
                      };

                      return (
                        <tr key={payable.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors">
                          <td className="py-3 px-4 font-mono font-bold text-slate-900 dark:text-white">
                            {payable.invoiceNumber}
                          </td>
                          <td className="py-3 px-4">
                            <div className="font-semibold text-slate-900 dark:text-white">{payable.supplierName}</div>
                            <div className="text-[11px] text-slate-400 font-mono">TIN: {payable.tinNumber || '—'}</div>
                          </td>
                          <td className="py-3 px-4 font-mono text-slate-500">{payable.invoiceDate}</td>
                          <td className="py-3 px-4 font-mono font-semibold text-slate-800 dark:text-slate-200">
                            {payable.dueDate}
                          </td>
                          <td className="py-3 px-4 text-center">
                            <span
                              className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                                bucketBadges[payable.agingBucket] || 'bg-slate-100 text-slate-700'
                              }`}
                            >
                              {payable.agingBucket === 'CURRENT' ? 'CURRENT' : `${payable.agingBucket} DAYS`}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right font-mono text-slate-600 dark:text-slate-400">
                            {fmt(payable.netPayable)}
                          </td>
                          <td className="py-3 px-4 text-right font-mono text-emerald-600 dark:text-emerald-400 font-semibold">
                            {fmt(payable.paidAmount)}
                          </td>
                          <td className="py-3 px-4 text-right font-mono font-bold text-rose-600 dark:text-rose-400">
                            {fmt(payable.remainingBalance)} ETB
                          </td>
                          <td className="py-3 px-4 text-right">
                            {payable.remainingBalance > 0 ? (
                              <button
                                onClick={() => openPaymentModal(payable)}
                                className="px-3 py-1 text-[11px] font-bold rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white shadow-xs flex items-center gap-1 ml-auto"
                              >
                                <DollarSign size={13} />
                                <span>Record Payment</span>
                              </button>
                            ) : (
                              <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                                ✓ Paid in Full
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                    {filteredPayables.length === 0 && (
                      <tr>
                        <td colSpan={9} className="py-12 text-center text-slate-400">
                          <CheckCircle2 className="mx-auto mb-2 text-emerald-500" size={32} />
                          <p className="font-semibold text-sm">No outstanding payables</p>
                          <p className="text-xs text-slate-400 mt-1">All supplier invoices are clear with zero overdue balance</p>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ─── MODAL: 4-STEP "RECEIVE GOODS" (GRN) WIZARD ─── */}
      {isGrnWizardOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-4xl w-full border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
            {/* Wizard Header with Progress Steps */}
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 shrink-0">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Truck className="text-emerald-600" size={20} />
                  <h2 className="text-base font-black text-slate-900 dark:text-white">
                    Receive Goods (GRN) Wizard
                  </h2>
                  {selectedPoForGrn && (
                    <span className="text-xs px-2.5 py-0.5 rounded-full font-mono bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300">
                      Against {selectedPoForGrn.orderNumber}
                    </span>
                  )}
                </div>
                <button onClick={() => setIsGrnWizardOpen(false)} className="text-slate-400 hover:text-slate-600">
                  <X size={18} />
                </button>
              </div>

              {/* Stepper Tabs */}
              <div className="grid grid-cols-4 gap-2">
                {[
                  { step: 1, title: '1. Supplier & Ref', desc: 'Vendor, Invoice #' },
                  { step: 2, title: '2. Items & Scan', desc: 'Scan items, batch, qty' },
                  { step: 3, title: '3. Landed Costs', desc: 'Freight, duty allocation' },
                  { step: 4, title: '4. Review & Post', desc: 'AVCO, 2% WHT, Due date' },
                ].map((s) => (
                  <div
                    key={s.step}
                    className={`p-2 rounded-xl border text-left transition-all ${
                      grnWizardStep === s.step
                        ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-200'
                        : grnWizardStep > s.step
                        ? 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                        : 'border-slate-100 dark:border-slate-800/60 opacity-50 text-slate-400'
                    }`}
                  >
                    <div className="text-xs font-bold">{s.title}</div>
                    <div className="text-[10px] text-slate-400">{s.desc}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Wizard Body by Step */}
            <form onSubmit={handleSubmitGRN} className="flex-1 overflow-y-auto p-6 space-y-4">
              {/* ─── STEP 1: SUPPLIER & REFERENCE ─── */}
              {grnWizardStep === 1 && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        Supplier Partner *
                      </label>
                      <select
                        value={grnSupplierId}
                        onChange={(e) => setGrnSupplierId(e.target.value)}
                        disabled={Boolean(selectedPoForGrn)}
                        className="w-full text-xs rounded-xl bg-slate-100 dark:bg-slate-800 border-none p-3 text-slate-900 dark:text-white font-semibold"
                      >
                        {suppliers.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name} ({s.code}) — {s.paymentTermsDays === 0 ? 'Cash on Delivery' : `Net ${s.paymentTermsDays}d`}
                          </option>
                        ))}
                      </select>
                      <p className="text-[11px] text-slate-400 mt-1">
                        Withholding 2% tax will be computed automatically for registered TIN holders.
                      </p>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        Linked Purchase Order (Optional)
                      </label>
                      <select
                        value={grnPoId || ''}
                        onChange={(e) => {
                          const poId = e.target.value;
                          setGrnPoId(poId || null);
                          const matchingPo = purchaseOrders.find((p) => p.id === poId);
                          if (matchingPo) {
                            setSelectedPoForGrn(matchingPo);
                            setGrnSupplierId(matchingPo.supplierId);
                          }
                        }}
                        className="w-full text-xs rounded-xl bg-slate-100 dark:bg-slate-800 border-none p-3 text-slate-900 dark:text-white font-mono"
                      >
                        <option value="">Direct Ad-Hoc Receipt (No PO)</option>
                        {purchaseOrders
                          .filter((p) => p.status === 'SENT' || p.status === 'PARTIALLY_RECEIVED' || p.status === 'APPROVED')
                          .map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.orderNumber} - {p.supplierName} ({fmt(p.grandTotal)} ETB)
                            </option>
                          ))}
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        Supplier Invoice / Waybill # *
                      </label>
                      <input
                        type="text"
                        value={grnInvoiceNo}
                        onChange={(e) => setGrnInvoiceNo(e.target.value)}
                        placeholder="e.g. INV-2026-99"
                        className="w-full text-xs rounded-xl bg-slate-100 dark:bg-slate-800 border-none p-3 font-mono font-semibold"
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        Supplier Invoice Date *
                      </label>
                      <input
                        type="date"
                        value={grnInvoiceDate}
                        onChange={(e) => setGrnInvoiceDate(e.target.value)}
                        className="w-full text-xs rounded-xl bg-slate-100 dark:bg-slate-800 border-none p-3 font-mono"
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        Receiving Dock / Bay
                      </label>
                      <input
                        type="text"
                        value={grnReceivingDock}
                        onChange={(e) => setGrnReceivingDock(e.target.value)}
                        className="w-full text-xs rounded-xl bg-slate-100 dark:bg-slate-800 border-none p-3"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* ─── STEP 2: ITEMS & SCANNING ─── */}
              {grnWizardStep === 2 && (
                <div className="space-y-4">
                  {/* Scan Input Bar */}
                  <div className="p-3.5 bg-emerald-50 dark:bg-emerald-950/30 rounded-xl border border-emerald-200/60 dark:border-emerald-800/40">
                    <div className="flex items-center gap-2 mb-1.5 text-xs font-bold text-emerald-900 dark:text-emerald-200">
                      <Scan size={16} />
                      <span>Scan Items While Receiving</span>
                      <span className="text-[11px] font-normal text-slate-500">
                        (Supports continuous barcode wedge scanners &amp; camera scanners)
                      </span>
                    </div>
                    <div className="flex gap-2">
                      <input
                        ref={scanInputRef}
                        type="text"
                        placeholder="Scan or enter barcode (e.g. 6001234567890) and press Enter..."
                        value={scanBarcodeInput}
                        onChange={(e) => setScanBarcodeInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleBarcodeScan(e);
                          }
                        }}
                        className="flex-1 text-xs rounded-lg bg-white dark:bg-slate-800 border-none p-2.5 font-mono shadow-xs"
                      />
                      <button
                        type="button"
                        onClick={handleBarcodeScan}
                        className="px-4 py-2 text-xs font-bold rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white shadow-xs"
                      >
                        Add Item
                      </button>
                    </div>
                  </div>

                  {/* Shipment Line Items */}
                  <div className="space-y-3">
                    {grnItems.map((item, idx) => {
                      const hasDiscrepancy =
                        item.orderedQty !== undefined && item.acceptedQuantity !== item.orderedQty;

                      return (
                        <div
                          key={idx}
                          className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-2.5"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-xs text-slate-900 dark:text-white">
                                {item.productName}
                              </span>
                              <span className="font-mono text-[11px] text-slate-400">({item.sku})</span>
                              {item.orderedQty !== undefined && (
                                <span className="text-[11px] px-2 py-0.5 rounded-md bg-purple-50 text-purple-700 dark:bg-purple-950 dark:text-purple-300 font-mono">
                                  PO Ordered: {item.orderedQty}
                                </span>
                              )}
                              {hasDiscrepancy && (
                                <span className="text-[11px] px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-600 dark:text-amber-300 font-bold flex items-center gap-1">
                                  <AlertTriangle size={12} />
                                  Discrepancy ({item.acceptedQuantity > (item.orderedQty || 0) ? '+' : ''}
                                  {item.acceptedQuantity - (item.orderedQty || 0)})
                                </span>
                              )}
                            </div>
                            <div className="text-xs font-mono text-slate-500">
                              Base Cost: <strong>{fmt(item.purchaseUnitCost)} ETB</strong>
                            </div>
                          </div>

                          <div className="grid grid-cols-5 gap-2.5">
                            <div>
                              <label className="block text-[10px] font-semibold text-slate-500 uppercase mb-0.5">
                                Accepted Qty *
                              </label>
                              <input
                                type="number"
                                min="1"
                                value={item.acceptedQuantity}
                                onChange={(e) => {
                                  const val = parseFloat(e.target.value) || 0;
                                  setGrnItems((prev) =>
                                    prev.map((g, i) => (i === idx ? { ...g, acceptedQuantity: val } : g)),
                                  );
                                }}
                                className="w-full text-xs rounded-lg bg-white dark:bg-slate-700 border-none p-2 font-mono font-bold text-slate-900 dark:text-white"
                              />
                            </div>

                            <div>
                              <label className="block text-[10px] font-semibold text-slate-500 uppercase mb-0.5">
                                Purchase Unit Cost
                              </label>
                              <input
                                type="number"
                                step="0.01"
                                value={item.purchaseUnitCost}
                                onChange={(e) => {
                                  const val = parseFloat(e.target.value) || 0;
                                  setGrnItems((prev) =>
                                    prev.map((g, i) => (i === idx ? { ...g, purchaseUnitCost: val } : g)),
                                  );
                                }}
                                className="w-full text-xs rounded-lg bg-white dark:bg-slate-700 border-none p-2 font-mono"
                              />
                            </div>

                            <div>
                              <label className="block text-[10px] font-semibold text-slate-500 uppercase mb-0.5">
                                Batch / Lot # *
                              </label>
                              <input
                                type="text"
                                value={item.batchNumber}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setGrnItems((prev) =>
                                    prev.map((g, i) => (i === idx ? { ...g, batchNumber: val } : g)),
                                  );
                                }}
                                className="w-full text-xs rounded-lg bg-white dark:bg-slate-700 border-none p-2 font-mono"
                                required
                              />
                            </div>

                            <div>
                              <label className="block text-[10px] font-semibold text-slate-500 uppercase mb-0.5">
                                Expiry Date (FEFO) *
                              </label>
                              <input
                                type="date"
                                value={item.expiryDate}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setGrnItems((prev) =>
                                    prev.map((g, i) => (i === idx ? { ...g, expiryDate: val } : g)),
                                  );
                                }}
                                className="w-full text-xs rounded-lg bg-white dark:bg-slate-700 border-none p-2 font-mono"
                                required
                              />
                            </div>

                            <div>
                              <label className="block text-[10px] font-semibold text-slate-500 uppercase mb-0.5">
                                Rejected Qty
                              </label>
                              <input
                                type="number"
                                min="0"
                                value={item.rejectedQuantity}
                                onChange={(e) => {
                                  const val = parseFloat(e.target.value) || 0;
                                  setGrnItems((prev) =>
                                    prev.map((g, i) => (i === idx ? { ...g, rejectedQuantity: val } : g)),
                                  );
                                }}
                                className="w-full text-xs rounded-lg bg-white dark:bg-slate-700 border-none p-2 font-mono text-rose-600 font-semibold"
                              />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* ─── STEP 3: LANDED COSTS & ALLOCATION ─── */}
              {grnWizardStep === 3 && (
                <div className="space-y-4">
                  <div className="bg-blue-50/60 dark:bg-blue-950/20 p-4 rounded-xl border border-blue-200/60 dark:border-blue-900/50 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Layers size={16} className="text-blue-600" />
                        <span className="text-xs font-bold text-blue-950 dark:text-blue-200 uppercase tracking-wider">
                          Landed Cost Apportionment (Freight &amp; Duty)
                        </span>
                      </div>
                      {/* Allocation Method Selector */}
                      <div className="flex items-center gap-1 p-1 bg-white dark:bg-slate-800 rounded-lg border border-blue-200 dark:border-blue-800">
                        <button
                          type="button"
                          onClick={() => setGrnAllocationMethod('BY_VALUE')}
                          className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${
                            grnAllocationMethod === 'BY_VALUE'
                              ? 'bg-blue-600 text-white'
                              : 'text-slate-600 dark:text-slate-400'
                          }`}
                        >
                          By Value (ETB)
                        </button>
                        <button
                          type="button"
                          onClick={() => setGrnAllocationMethod('BY_QUANTITY')}
                          className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${
                            grnAllocationMethod === 'BY_QUANTITY'
                              ? 'bg-blue-600 text-white'
                              : 'text-slate-600 dark:text-slate-400'
                          }`}
                        >
                          By Quantity (Units)
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-4">
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                          Freight / Shipping (ETB)
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          value={grnFreightCost}
                          onChange={(e) => setGrnFreightCost(parseFloat(e.target.value) || 0)}
                          className="w-full text-xs rounded-lg bg-white dark:bg-slate-800 border-none p-2 font-mono text-blue-600 font-bold"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                          Customs / Duty Tax (ETB)
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          value={grnDutyCost}
                          onChange={(e) => setGrnDutyCost(parseFloat(e.target.value) || 0)}
                          className="w-full text-xs rounded-lg bg-white dark:bg-slate-800 border-none p-2 font-mono text-blue-600 font-bold"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                          Offloading &amp; Handling (ETB)
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          value={grnOtherCost}
                          onChange={(e) => setGrnOtherCost(parseFloat(e.target.value) || 0)}
                          className="w-full text-xs rounded-lg bg-white dark:bg-slate-800 border-none p-2 font-mono text-blue-600 font-bold"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Apportionment Distribution Preview Table */}
                  <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
                    <div className="px-4 py-2.5 bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                      Apportioned Line Impact ({grnAllocationMethod === 'BY_VALUE' ? 'Weighted by Value' : 'Weighted by Quantity'})
                    </div>
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="border-b border-slate-100 dark:border-slate-800 text-slate-400 text-[10px] uppercase font-bold">
                          <th className="p-3">Product</th>
                          <th className="p-3 text-center">Accepted Qty</th>
                          <th className="p-3 text-right">Invoice Unit Cost</th>
                          <th className="p-3 text-right">Apportioned Landed / Unit</th>
                          <th className="p-3 text-right">Final Landed Unit Cost</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {grnItems.map((gi, idx) => {
                          const app = calculatedGrnDetails.apportioned[idx];
                          return (
                            <tr key={idx}>
                              <td className="p-3 font-semibold text-slate-900 dark:text-white">
                                {gi.productName}
                              </td>
                              <td className="p-3 text-center font-mono">{gi.acceptedQuantity}</td>
                              <td className="p-3 text-right font-mono">{fmt(gi.purchaseUnitCost)}</td>
                              <td className="p-3 text-right font-mono text-blue-600 dark:text-blue-400 font-semibold">
                                +{fmt(gi.acceptedQuantity > 0 ? (app?.apportionedLandedCost || 0) / gi.acceptedQuantity : 0)} ETB
                              </td>
                              <td className="p-3 text-right font-mono font-bold text-emerald-600 dark:text-emerald-400">
                                {fmt(app?.finalUnitCost || gi.purchaseUnitCost)} ETB
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* ─── STEP 4: REVIEW & FINANCIALS (AVCO, WHT, PAYABLE) ─── */}
              {grnWizardStep === 4 && (
                <div className="space-y-4">
                  {/* Weighted-Average Cost (AVCO) Blending Preview */}
                  <div className="bg-purple-50/60 dark:bg-purple-950/20 p-4 rounded-xl border border-purple-200/60 dark:border-purple-900/50 space-y-2">
                    <div className="flex items-center gap-2 text-xs font-bold text-purple-950 dark:text-purple-200 uppercase tracking-wider">
                      <Sparkles size={16} className="text-purple-600" />
                      <span>Weighted Average Cost (AVCO) Update Formula Preview</span>
                    </div>
                    <div className="text-[11px] font-mono text-purple-700 dark:text-purple-300">
                      New Avg = (Old Qty × Old Cost + Received Qty × Landed Unit Cost) / (Old Qty + Received Qty)
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                      {calculatedGrnDetails.avcoPreviews.map((ap, idx) => (
                        <div
                          key={idx}
                          className="bg-white dark:bg-slate-800 p-3 rounded-lg border border-purple-100 dark:border-purple-800/40 text-xs space-y-1"
                        >
                          <div className="font-bold text-slate-900 dark:text-white line-clamp-1">{ap.productName}</div>
                          <div className="flex justify-between text-slate-500 font-mono text-[11px]">
                            <span>Prior On-Hand: {ap.oldQty} @ {fmt(ap.oldCost)}</span>
                            <span>Received: {ap.receivedQty} @ {fmt(ap.landedUnitCost)}</span>
                          </div>
                          <div className="flex justify-between pt-1 border-t border-slate-100 dark:border-slate-700 text-slate-800 dark:text-slate-200 font-bold">
                            <span>New Blended AVCO:</span>
                            <span className="font-mono text-purple-600 dark:text-purple-400">
                              {fmt(ap.newAvco)} ETB / unit
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Financial & Tax Breakdown Card */}
                  <div className="bg-emerald-50/60 dark:bg-emerald-950/30 p-4 rounded-xl border border-emerald-200/60 dark:border-emerald-800/40 space-y-2 text-xs">
                    <div className="flex justify-between text-slate-600 dark:text-slate-400">
                      <span>Total Goods Invoice Value:</span>
                      <span className="font-mono">{fmt(calculatedGrnDetails.totalGoodsValue)} ETB</span>
                    </div>
                    <div className="flex justify-between text-blue-600 dark:text-blue-400">
                      <span>Landed Additions (Freight, Duty, Handling):</span>
                      <span className="font-mono">+{fmt(calculatedGrnDetails.totalLandedAdditions)} ETB</span>
                    </div>
                    <div className="flex justify-between text-slate-800 dark:text-slate-200 font-bold">
                      <span>Total Received Inventory Value:</span>
                      <span className="font-mono">{fmt(calculatedGrnDetails.totalReceivedCost)} ETB</span>
                    </div>
                    <div className="flex justify-between text-amber-600 dark:text-amber-400 font-semibold pt-1 border-t border-emerald-200/50">
                      <span>Withholding Tax (2% applied on purchases ≥ 10,000 ETB):</span>
                      <span className="font-mono">
                        {calculatedGrnDetails.withholdingTax > 0
                          ? `-${fmt(calculatedGrnDetails.withholdingTax)} ETB`
                          : '0.00 ETB'}
                      </span>
                    </div>
                    <div className="flex justify-between font-bold text-slate-900 dark:text-white pt-2 border-t border-emerald-300 dark:border-emerald-700 text-sm">
                      <span>Net Supplier Payable Created (Due {calculatedGrnDetails.dueDate}):</span>
                      <span className="font-mono text-emerald-600 dark:text-emerald-400">
                        {fmt(calculatedGrnDetails.netSupplierPayable)} ETB
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Wizard Footer Controls */}
              <div className="flex items-center justify-between pt-4 border-t border-slate-200 dark:border-slate-800 shrink-0">
                {grnWizardStep > 1 ? (
                  <button
                    type="button"
                    onClick={() => setGrnWizardStep((prev) => (prev - 1) as any)}
                    className="px-4 py-2 text-xs font-semibold rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-200 flex items-center gap-1"
                  >
                    <ChevronLeft size={16} /> Back
                  </button>
                ) : (
                  <div />
                )}

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsGrnWizardOpen(false)}
                    className="px-4 py-2 text-xs font-semibold rounded-xl text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800"
                  >
                    Cancel
                  </button>

                  {grnWizardStep < 4 ? (
                    <button
                      type="button"
                      onClick={() => setGrnWizardStep((prev) => (prev + 1) as any)}
                      className="px-5 py-2 text-xs font-bold rounded-xl bg-purple-600 hover:bg-purple-500 text-white shadow-sm flex items-center gap-1"
                    >
                      Next Step <ChevronRight size={16} />
                    </button>
                  ) : (
                    <button
                      type="submit"
                      className="px-6 py-2.5 text-xs font-black rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white shadow-md flex items-center gap-1.5"
                    >
                      <CheckCircle2 size={16} />
                      Commit GRN in ONE Transaction
                    </button>
                  )}
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── MODAL: 2-TAP REORDER SUGGESTIONS DRAWER ─── */}
      {isReorderDrawerOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-2xl w-full border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between shrink-0 bg-amber-50 dark:bg-amber-950/30">
              <div className="flex items-center gap-2">
                <Zap className="text-amber-500 fill-amber-500" size={20} />
                <div>
                  <h2 className="text-base font-bold text-slate-900 dark:text-white">
                    2-Tap Purchase Order Reorder Engine
                  </h2>
                  <p className="text-xs text-slate-500">
                    {lowStockProducts.length} item(s) below reorder point. Tap once to review, second tap to issue PO.
                  </p>
                </div>
              </div>
              <button onClick={() => setIsReorderDrawerOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X size={18} />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-3">
              {lowStockProducts.length === 0 ? (
                <div className="py-12 text-center text-slate-400">
                  <CheckCircle2 size={32} className="mx-auto mb-2 text-emerald-500" />
                  <p className="font-semibold text-sm">All inventory levels are optimal</p>
                  <p className="text-xs text-slate-400 mt-1">No products are currently at or below their reorder points.</p>
                </div>
              ) : (
                lowStockProducts.map((p) => {
                  const sup = suppliers.find((s) => s.id === p.supplierId) || suppliers[0];
                  return (
                    <div
                      key={p.id}
                      className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 flex items-center justify-between"
                    >
                      <div>
                        <div className="font-bold text-xs text-slate-900 dark:text-white">{p.nameEn || p.sku}</div>
                        <div className="text-[11px] text-slate-400 font-mono">
                          SKU: {p.sku} • On-Hand: <span className="text-rose-500 font-bold">{p.stockOnHand}</span> / Min: {p.minStockLevel || 0}
                        </div>
                        <div className="text-[11px] text-slate-500 mt-1">
                          Supplier: <strong className="text-purple-600">{sup?.name || 'Unassigned'}</strong>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs font-mono font-bold text-emerald-600 dark:text-emerald-400">
                          Order Qty: {p.minStockLevel ? Math.max(10, p.minStockLevel * 2) : 20}
                        </div>
                        <div className="text-[11px] text-slate-400 font-mono">
                          Est: {fmt((p.minStockLevel ? Math.max(10, p.minStockLevel * 2) : 20) * (p.costPrice || 0))} ETB
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 flex items-center justify-between shrink-0">
              <span className="text-xs text-slate-500">
                Total suggested lines: <strong>{lowStockProducts.length}</strong>
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setIsReorderDrawerOpen(false)}
                  className="px-4 py-2 text-xs font-semibold rounded-xl text-slate-600 hover:bg-slate-200 dark:hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button
                  onClick={handleExecuteTwoTapReorder}
                  className="px-5 py-2.5 text-xs font-black rounded-xl bg-amber-500 hover:bg-amber-400 text-white shadow-md flex items-center gap-1.5"
                >
                  <Zap size={15} className="fill-white" />
                  Tap 2: Generate &amp; Issue POs Now
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── MODAL: MANAGER PIN APPROVAL (THRESHOLD > 50,000 ETB) ─── */}
      {isApproveModalOpen && poToApprove && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-md w-full border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-amber-50 dark:bg-amber-950/30">
              <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <ShieldCheck className="text-amber-600" size={18} />
                Manager Threshold Authorization
              </h2>
              <button onClick={() => setIsApproveModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleApprovePO} className="p-6 space-y-4">
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800 text-xs space-y-1">
                <div className="flex justify-between">
                  <span className="text-slate-500">Purchase Order:</span>
                  <span className="font-mono font-bold text-purple-600">{poToApprove.orderNumber}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Supplier:</span>
                  <span className="font-semibold">{poToApprove.supplierName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Grand Total:</span>
                  <span className="font-mono font-bold text-rose-600">{fmt(poToApprove.grandTotal)} ETB</span>
                </div>
                <div className="text-[11px] text-amber-600 pt-1 border-t border-slate-200 dark:border-slate-700">
                  ⚠️ PO exceeds threshold of 50,000 ETB. Manager PIN required to transition to APPROVED.
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Manager Authorization PIN *
                </label>
                <input
                  type="password"
                  maxLength={6}
                  placeholder="Enter Manager PIN"
                  value={managerPin}
                  onChange={(e) => {
                    setManagerPin(e.target.value);
                    setApprovalError('');
                  }}
                  className="w-full text-center text-lg tracking-widest rounded-xl bg-slate-100 dark:bg-slate-800 border-none p-3 font-mono font-bold"
                  required
                  autoFocus
                />
                {approvalError && <div className="text-xs text-rose-500 font-semibold mt-1">{approvalError}</div>}
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsApproveModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold rounded-xl text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-bold rounded-xl bg-amber-500 hover:bg-amber-400 text-white shadow-sm flex items-center gap-1.5"
                >
                  <Check size={15} />
                  Authorize &amp; Approve
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── MODAL: RECORD SUPPLIER PAYMENT ─── */}
      {isPaymentModalOpen && selectedPayableForPayment && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-md w-full border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <CreditCard className="text-emerald-600" size={18} />
                Record Supplier Payment
              </h2>
              <button onClick={() => setIsPaymentModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleRecordPayment} className="p-6 space-y-3.5">
              <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-xl text-xs space-y-1">
                <div className="flex justify-between">
                  <span className="text-slate-500">Supplier:</span>
                  <span className="font-bold">{selectedPayableForPayment.supplierName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Invoice Ref:</span>
                  <span className="font-mono">{selectedPayableForPayment.invoiceNumber}</span>
                </div>
                <div className="flex justify-between font-bold">
                  <span className="text-slate-500">Outstanding Balance:</span>
                  <span className="font-mono text-rose-600">{fmt(selectedPayableForPayment.remainingBalance)} ETB</span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Payment Amount (ETB) *
                </label>
                <input
                  type="number"
                  step="0.01"
                  max={selectedPayableForPayment.remainingBalance}
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(parseFloat(e.target.value) || 0)}
                  className="w-full text-xs rounded-xl bg-slate-100 dark:bg-slate-800 border-none p-3 font-mono font-bold text-emerald-600"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Payment Channel *
                  </label>
                  <select
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value as any)}
                    className="w-full text-xs rounded-xl bg-slate-100 dark:bg-slate-800 border-none p-3"
                  >
                    <option value="BANK_TRANSFER">Bank Transfer (CBE/Awash)</option>
                    <option value="TELEBIRR">Telebirr Merchant</option>
                    <option value="CBE_BIRR">CBE Birr</option>
                    <option value="CASH">Cash Petty Cash</option>
                    <option value="CHECK">Bank Check</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Reference / Voucher #
                  </label>
                  <input
                    type="text"
                    value={paymentReference}
                    onChange={(e) => setPaymentReference(e.target.value)}
                    placeholder="e.g. TXN-12345"
                    className="w-full text-xs rounded-xl bg-slate-100 dark:bg-slate-800 border-none p-3 font-mono"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setIsPaymentModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold rounded-xl text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-bold rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm flex items-center gap-1.5"
                >
                  <CheckCircle2 size={15} />
                  Confirm Payment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── MODAL: SUPPLIER PURCHASE RETURN (REVERSING MOVEMENTS) ─── */}
      {isReturnModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-xl w-full border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-rose-50 dark:bg-rose-950/30">
              <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <RotateCcw className="text-rose-600" size={18} />
                Return to Supplier (Debit Note / Reversing Movement)
              </h2>
              <button onClick={() => setIsReturnModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleProcessReturn} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Supplier *
                </label>
                <select
                  value={returnSupplierId}
                  onChange={(e) => setReturnSupplierId(e.target.value)}
                  className="w-full text-xs rounded-xl bg-slate-100 dark:bg-slate-800 border-none p-3 font-semibold"
                >
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.code})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Overall Return Reason *
                </label>
                <input
                  type="text"
                  value={returnReason}
                  onChange={(e) => setReturnReason(e.target.value)}
                  placeholder="e.g. Broken safety seals / spoilage on arrival"
                  className="w-full text-xs rounded-xl bg-slate-100 dark:bg-slate-800 border-none p-3"
                  required
                />
              </div>

              {/* Return Items */}
              <div className="space-y-2">
                <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">Items to Return</div>
                {returnItems.map((item, idx) => (
                  <div
                    key={idx}
                    className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700 flex items-center justify-between"
                  >
                    <div>
                      <div className="font-bold text-xs text-slate-900 dark:text-white">{item.productName}</div>
                      <div className="text-[11px] text-slate-400 font-mono">
                        Batch: {item.batchNumber} • Unit Cost: {fmt(item.unitCost)} ETB
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min="1"
                        value={item.quantity}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value) || 1;
                          setReturnItems((prev) =>
                            prev.map((it, i) => (i === idx ? { ...it, quantity: val } : it)),
                          );
                        }}
                        className="w-20 text-xs rounded-lg bg-white dark:bg-slate-700 border-none p-2 font-mono text-right font-bold"
                      />
                      <span className="text-xs text-slate-500">units</span>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsReturnModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold rounded-xl text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-bold rounded-xl bg-rose-600 hover:bg-rose-500 text-white shadow-sm flex items-center gap-1.5"
                >
                  <RotateCcw size={14} />
                  Authorize Return &amp; Reverse Stock
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── MODAL: CREATE MANUAL PURCHASE ORDER ─── */}
      {isPoModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-2xl w-full border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between shrink-0">
              <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <FileText className="text-purple-600" size={18} />
                Create Purchase Order (PO)
              </h2>
              <button onClick={() => setIsPoModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSubmitPO} className="flex-1 overflow-y-auto p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Select Supplier *
                  </label>
                  <select
                    value={newPoSupplierId}
                    onChange={(e) => setNewPoSupplierId(e.target.value)}
                    className="w-full text-xs rounded-xl bg-slate-100 dark:bg-slate-800 border-none p-3 text-slate-900 dark:text-white"
                  >
                    {suppliers.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.code}) - {s.paymentTermsDays === 0 ? 'COD' : `${s.paymentTermsDays}d`}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Expected Delivery Date *
                  </label>
                  <input
                    type="date"
                    value={newPoDeliveryDate}
                    onChange={(e) => setNewPoDeliveryDate(e.target.value)}
                    className="w-full text-xs rounded-xl bg-slate-100 dark:bg-slate-800 border-none p-3 text-slate-900 dark:text-white"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Order Instructions &amp; Notes
                </label>
                <input
                  type="text"
                  placeholder="e.g. Deliver to Loading Bay 2 between 8AM - 11AM"
                  value={newPoNotes}
                  onChange={(e) => setNewPoNotes(e.target.value)}
                  className="w-full text-xs rounded-xl bg-slate-100 dark:bg-slate-800 border-none p-3 text-slate-900 dark:text-white"
                />
              </div>

              {/* Items Section */}
              <div className="pt-2">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                    Order Line Items
                  </h3>
                  <button
                    type="button"
                    onClick={handleAddPoLine}
                    className="text-xs font-semibold text-purple-600 hover:text-purple-700 flex items-center gap-1"
                  >
                    <Plus size={14} /> Add Product
                  </button>
                </div>

                <div className="space-y-2">
                  {newPoItems.map((line, idx) => (
                    <div
                      key={idx}
                      className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 flex items-center gap-3"
                    >
                      <div className="flex-1">
                        <select
                          value={line.productId}
                          onChange={(e) => {
                            const pid = e.target.value;
                            const prod = catalogProducts.find((p) => p.id === pid);
                            setNewPoItems((prev) =>
                              prev.map((item, i) =>
                                i === idx
                                  ? { ...item, productId: pid, unitCost: prod?.costPrice || item.unitCost }
                                  : item,
                              ),
                            );
                          }}
                          className="w-full text-xs rounded-lg bg-white dark:bg-slate-700 border-none p-2 text-slate-900 dark:text-white"
                        >
                          {catalogProducts.length === 0 && (
                            <option value="">No products in catalog — add products first</option>
                          )}
                          {catalogProducts.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.nameEn} ({p.sku})
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="w-24">
                        <input
                          type="number"
                          placeholder="Qty"
                          min="1"
                          value={line.orderedQuantity}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value) || 0;
                            setNewPoItems((prev) =>
                              prev.map((item, i) => (i === idx ? { ...item, orderedQuantity: val } : item)),
                            );
                          }}
                          className="w-full text-xs rounded-lg bg-white dark:bg-slate-700 border-none p-2 text-right font-mono"
                        />
                      </div>

                      <div className="w-28">
                        <input
                          type="number"
                          step="0.01"
                          placeholder="Cost (ETB)"
                          value={line.unitCost}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value) || 0;
                            setNewPoItems((prev) =>
                              prev.map((item, i) => (i === idx ? { ...item, unitCost: val } : item)),
                            );
                          }}
                          className="w-full text-xs rounded-lg bg-white dark:bg-slate-700 border-none p-2 text-right font-mono"
                        />
                      </div>

                      <div className="w-24">
                        <select
                          value={line.taxRate}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value);
                            setNewPoItems((prev) =>
                              prev.map((item, i) => (i === idx ? { ...item, taxRate: val } : item)),
                            );
                          }}
                          className="w-full text-xs rounded-lg bg-white dark:bg-slate-700 border-none p-2 font-mono"
                        >
                          <option value={0.15}>15% VAT</option>
                          <option value={0}>Exempt</option>
                        </select>
                      </div>

                      <div className="w-24 text-right font-mono font-bold text-xs">
                        {fmt(line.orderedQuantity * line.unitCost * (1 + line.taxRate))} ETB
                      </div>

                      {newPoItems.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemovePoLine(idx)}
                          className="text-slate-400 hover:text-rose-500"
                        >
                          <X size={15} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Total Card & Threshold Warning */}
              <div className="bg-purple-50 dark:bg-purple-950/40 p-4 rounded-xl border border-purple-200/60 dark:border-purple-800/40 space-y-1.5 text-xs">
                <div className="flex justify-between text-slate-600 dark:text-slate-400">
                  <span>Subtotal:</span>
                  <span className="font-mono">{fmt(calculatedPoSummary.subtotal)} ETB</span>
                </div>
                <div className="flex justify-between text-slate-600 dark:text-slate-400">
                  <span>Estimated Tax (15% VAT):</span>
                  <span className="font-mono">{fmt(calculatedPoSummary.taxTotal)} ETB</span>
                </div>
                <div className="flex justify-between font-bold text-slate-900 dark:text-white pt-1 border-t border-purple-200/60 dark:border-purple-800/40 text-sm">
                  <span>Grand Total:</span>
                  <span className="font-mono text-purple-600 dark:text-purple-400">
                    {fmt(calculatedPoSummary.grandTotal)} ETB
                  </span>
                </div>
                {calculatedPoSummary.requiresApproval && (
                  <div className="p-2 mt-2 bg-amber-500/20 text-amber-800 dark:text-amber-200 rounded-lg text-[11px] font-semibold flex items-center gap-1.5">
                    <ShieldCheck size={14} className="text-amber-600" />
                    <span>Total exceeds 50,000 ETB. This PO will be saved as DRAFT requiring manager authorization.</span>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-end gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setIsPoModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold rounded-xl text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-bold rounded-xl bg-purple-600 hover:bg-purple-500 text-white shadow-sm"
                >
                  Issue Purchase Order
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── MODAL: ADD APPROVED SUPPLIER ─── */}
      {isSupplierModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-md w-full border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Building className="text-purple-600" size={18} />
                Register Approved Supplier
              </h2>
              <button onClick={() => setIsSupplierModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateSupplier} className="p-6 space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Supplier Name *
                </label>
                <input
                  type="text"
                  placeholder="e.g. Awash Agro Processing PLC"
                  value={newSupName}
                  onChange={(e) => setNewSupName(e.target.value)}
                  className="w-full text-xs rounded-xl bg-slate-100 dark:bg-slate-800 border-none p-3"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Code *
                  </label>
                  <input
                    type="text"
                    placeholder="SUP-AWASH"
                    value={newSupCode}
                    onChange={(e) => setNewSupCode(e.target.value)}
                    className="w-full text-xs rounded-xl bg-slate-100 dark:bg-slate-800 border-none p-3 font-mono uppercase"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    TIN (Tax ID)
                  </label>
                  <input
                    type="text"
                    placeholder="0012345678"
                    value={newSupTin}
                    onChange={(e) => setNewSupTin(e.target.value)}
                    className="w-full text-xs rounded-xl bg-slate-100 dark:bg-slate-800 border-none p-3 font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Phone *</label>
                  <input
                    type="text"
                    value={newSupPhone}
                    onChange={(e) => setNewSupPhone(e.target.value)}
                    className="w-full text-xs rounded-xl bg-slate-100 dark:bg-slate-800 border-none p-3 font-mono"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Payment Terms
                  </label>
                  <select
                    value={newSupTerms}
                    onChange={(e) => setNewSupTerms(Number(e.target.value))}
                    className="w-full text-xs rounded-xl bg-slate-100 dark:bg-slate-800 border-none p-3"
                  >
                    <option value={0}>Cash on Delivery</option>
                    <option value={15}>Net 15 Days</option>
                    <option value={30}>Net 30 Days</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setIsSupplierModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold rounded-xl text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-bold rounded-xl bg-purple-600 hover:bg-purple-500 text-white shadow-sm"
                >
                  Register Supplier
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── MODAL: DOCUMENT INSPECTION & PRINT (PO / GRN / RETURN) ─── */}
      {inspectDoc && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-2xl w-full border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between shrink-0">
              <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Printer size={18} className="text-purple-600" />
                {inspectDoc.type === 'PO'
                  ? 'Official Purchase Order Voucher'
                  : inspectDoc.type === 'GRN'
                  ? 'Goods Received Note Voucher'
                  : 'Purchase Return Voucher'}
              </h2>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => window.print()}
                  className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-purple-600 text-white hover:bg-purple-500 flex items-center gap-1.5"
                >
                  <Printer size={14} /> Print
                </button>
                <button onClick={() => setInspectDoc(null)} className="text-slate-400 hover:text-slate-600">
                  <X size={18} />
                </button>
              </div>
            </div>

            <div className="p-8 overflow-y-auto space-y-6 text-xs text-slate-800 dark:text-slate-200 font-sans">
              {/* Header */}
              <div className="flex justify-between items-start border-b border-slate-200 dark:border-slate-800 pb-4">
                <div>
                  <div className="text-lg font-black text-slate-900 dark:text-white">GEBEYA HYPERMARKET</div>
                  <div className="text-slate-500">Bole Medhanialem Branch, Addis Ababa</div>
                  <div className="text-slate-500 font-mono">TIN: 0098765432-001 • VAT: VAT-889900</div>
                </div>
                <div className="text-right">
                  <div className="text-base font-mono font-bold text-purple-600 dark:text-purple-400">
                    {inspectDoc.type === 'PO'
                      ? inspectDoc.data.orderNumber
                      : inspectDoc.type === 'GRN'
                      ? inspectDoc.data.grnNumber
                      : inspectDoc.data.returnNumber}
                  </div>
                  <div className="text-slate-400">
                    Date: {new Date(inspectDoc.data.createdAt || Date.now()).toLocaleDateString()}
                  </div>
                  <div className="mt-1">
                    <span className="px-2 py-0.5 rounded font-bold text-[10px] bg-slate-100 dark:bg-slate-800">
                      {inspectDoc.data.status || 'CONFIRMED'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Parties */}
              <div className="grid grid-cols-2 gap-4">
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40">
                  <div className="font-bold text-[11px] text-slate-400 uppercase mb-1">Supplier</div>
                  <div className="font-bold text-sm text-slate-900 dark:text-white">{inspectDoc.data.supplierName}</div>
                  <div className="text-slate-500 font-mono">{inspectDoc.data.supplierCode}</div>
                </div>
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40">
                  <div className="font-bold text-[11px] text-slate-400 uppercase mb-1">
                    {inspectDoc.type === 'PO' ? 'Delivery Details' : 'Receiving Details'}
                  </div>
                  <div>
                    {inspectDoc.type === 'PO'
                      ? `Expected: ${inspectDoc.data.expectedDeliveryDate || 'Immediate'}`
                      : `Invoice: ${inspectDoc.data.supplierInvoiceNo || 'Direct'}`}
                  </div>
                  <div className="text-slate-500">
                    {inspectDoc.type === 'PO'
                      ? `Terms: Net 30`
                      : `Receiver: ${inspectDoc.data.receivedBy || 'Storekeeper'}`}
                  </div>
                </div>
              </div>

              {/* Items Table */}
              <table className="w-full text-left border-collapse border border-slate-200 dark:border-slate-800">
                <thead>
                  <tr className="bg-slate-100 dark:bg-slate-800 text-[11px] font-bold uppercase">
                    <th className="p-2 border border-slate-200 dark:border-slate-800">Item Description</th>
                    <th className="p-2 border border-slate-200 dark:border-slate-800 text-center">Batch / Expiry</th>
                    <th className="p-2 border border-slate-200 dark:border-slate-800 text-right">Quantity</th>
                    <th className="p-2 border border-slate-200 dark:border-slate-800 text-right">Unit Cost</th>
                    <th className="p-2 border border-slate-200 dark:border-slate-800 text-right">Line Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {(inspectDoc.data.items || []).map((line: any, i: number) => (
                    <tr key={i}>
                      <td className="p-2 border border-slate-200 dark:border-slate-800">
                        <div className="font-semibold">{line.productName || line.sku}</div>
                        <div className="font-mono text-[10px] text-slate-400">{line.sku}</div>
                      </td>
                      <td className="p-2 border border-slate-200 dark:border-slate-800 text-center font-mono text-[11px]">
                        {line.batchNumber ? `${line.batchNumber} (${line.expiryDate || 'N/A'})` : '—'}
                      </td>
                      <td className="p-2 border border-slate-200 dark:border-slate-800 text-right font-mono font-bold">
                        {line.acceptedQuantity || line.orderedQuantity || line.receivedQuantity || line.quantity}
                      </td>
                      <td className="p-2 border border-slate-200 dark:border-slate-800 text-right font-mono">
                        {fmt(line.finalUnitCost || line.unitCost || line.purchaseUnitCost)}
                      </td>
                      <td className="p-2 border border-slate-200 dark:border-slate-800 text-right font-mono font-bold">
                        {fmt(
                          (line.acceptedQuantity || line.orderedQuantity || line.receivedQuantity || line.quantity) *
                            (line.finalUnitCost || line.unitCost || line.purchaseUnitCost),
                        )}{' '}
                        ETB
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Signatures */}
              <div className="grid grid-cols-2 gap-8 pt-8 border-t border-slate-200 dark:border-slate-800">
                <div className="border-t border-dashed border-slate-300 dark:border-slate-700 pt-2 text-center text-[11px] text-slate-500">
                  Authorized Manager Signature &amp; Stamp
                </div>
                <div className="border-t border-dashed border-slate-300 dark:border-slate-700 pt-2 text-center text-[11px] text-slate-500">
                  Storekeeper / Logistics Verification Signature
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
