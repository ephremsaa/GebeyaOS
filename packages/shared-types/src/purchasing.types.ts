export type PurchaseOrderStatus =
  | 'DRAFT'
  | 'ISSUED'
  | 'PARTIALLY_RECEIVED'
  | 'COMPLETED'
  | 'CANCELLED';

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
  landedOtherCost: number;
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
