export type PurchaseOrderStatus =
  | 'DRAFT'
  | 'APPROVED'
  | 'SENT'
  | 'PARTIALLY_RECEIVED'
  | 'RECEIVED'
  | 'CLOSED'
  | 'CANCELLED';

export type LandedCostAllocationMethod = 'BY_VALUE' | 'BY_QUANTITY';

export interface Supplier {
  id: string;
  code: string;
  name: string;
  tinNumber?: string | null;
  vatNumber?: string | null;
  contactPerson?: string | null;
  phone: string;
  email?: string | null;
  address?: string | null;
  paymentTermsDays: number;
  withholdingEligible?: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PurchaseOrderItem {
  id: string;
  purchaseOrderId: string;
  productId: string;
  orderedQuantity: number;
  receivedQuantity: number;
  unitCost: number;
  taxRate: number;
  totalCost: number;
}

export interface PurchaseOrder {
  id: string;
  branchId: string;
  orderNumber: string;
  supplierId: string;
  status: PurchaseOrderStatus;
  requiresApproval?: boolean;
  approvedBy?: string | null;
  approvedAt?: string | null;
  expectedDeliveryDate?: string | null;
  subtotal: number;
  taxTotal: number;
  grandTotal: number;
  notes?: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  items?: PurchaseOrderItem[];
}

export interface GRNItem {
  id: string;
  grnId: string;
  productId: string;
  batchNumber: string;
  expiryDate?: string | null;
  receivedQuantity: number;
  purchaseUnitCost: number;
  apportionedLandedCost: number;
  finalUnitCost: number;
  createdAt: string;
}

export interface GoodsReceivedNote {
  id: string;
  branchId: string;
  grnNumber: string;
  purchaseOrderId?: string | null;
  supplierId: string;
  supplierInvoiceNo?: string | null;
  supplierInvoiceDate?: string | null;
  landedFreightCost: number;
  landedDutyCost?: number;
  landedOtherCost: number;
  allocationMethod?: LandedCostAllocationMethod;
  totalReceivedCost: number;
  withholdingTaxAmount: number;
  receivedBy: string;
  createdAt: string;
  items?: GRNItem[];
}

export interface AVCOCalculationInput {
  currentOnHandQty: number;
  currentCost: number;
  receivedQty: number;
  receivedUnitCost: number;
}

export interface AVCOCalculationResult {
  newCost: number;
  previousCost: number;
  blendedQuantity: number;
}

export interface LandedCostItemInput {
  productId: string;
  receivedQuantity: number;
  purchaseUnitCost: number;
}

export interface LandedCostApportionResultItem {
  productId: string;
  purchaseTotal: number;
  apportionedLandedCost: number;
  finalUnitCost: number;
}

export interface SupplierPayable {
  id: string;
  branchId: string;
  supplierId: string;
  supplierName: string;
  grnId?: string | null;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  totalAmount: number;
  withholdingAmount: number;
  netPayable: number;
  paidAmount: number;
  remainingBalance: number;
  status: 'UNPAID' | 'PARTIALLY_PAID' | 'PAID' | 'CANCELLED';
  agingDays: number;
  agingBucket: 'CURRENT' | '1-30' | '31-60' | '60+';
  createdAt: string;
}

export interface SupplierPayment {
  id: string;
  branchId: string;
  supplierId: string;
  payableId?: string | null;
  paymentNumber: string;
  amount: number;
  paymentMethod: 'CASH' | 'BANK_TRANSFER' | 'TELEBIRR' | 'CBE_BIRR' | 'CHECK';
  referenceNumber?: string | null;
  paymentDate: string;
  notes?: string | null;
  paidBy: string;
  createdAt: string;
}

export interface SupplierReturnItem {
  id: string;
  returnId: string;
  productId: string;
  productName: string;
  sku: string;
  batchId?: string | null;
  batchNumber?: string | null;
  quantity: number;
  unitCost: number;
  totalCost: number;
  reason: string;
}

export interface SupplierReturn {
  id: string;
  returnNumber: string;
  branchId: string;
  supplierId: string;
  supplierName: string;
  grnId?: string | null;
  status: 'CONFIRMED' | 'CANCELLED';
  totalReturnValue: number;
  reason: string;
  createdBy: string;
  createdAt: string;
  items: SupplierReturnItem[];
}
