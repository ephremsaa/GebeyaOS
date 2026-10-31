export type ShiftStatus = 'OPEN' | 'CLOSED' | 'AUDITED';

export type CashMovementType =
  | 'FLOAT_IN'
  | 'PETTY_CASH_OUT'
  | 'SAFE_DROP'
  | 'ADDITIONAL_FLOAT';

export type PaymentMethod =
  | 'CASH'
  | 'TELEBIRR'
  | 'CBE_BIRR'
  | 'CARD_POS'
  | 'BANK_TRANSFER';

export type SaleStatus =
  | 'PAID'
  | 'PARTIALLY_REFUNDED'
  | 'FULLY_REFUNDED'
  | 'VOIDED';

export type FiscalStatus = 'PENDING' | 'FISCALIZED' | 'FAILED' | 'BYPASSED';

export interface Shift {
  id: string;
  branchId: string;
  terminalId: string;
  cashierId: string;
  shiftNumber: number;
  openingCashFloat: number;
  closingCashCounted?: number | null;
  expectedCashSystem: number;
  cashVariance?: number | null;
  status: ShiftStatus;
  notes?: string | null;
  openedAt: string;
  closedAt?: string | null;
  createdAt: string;
}

export interface CashMovement {
  id: string;
  shiftId: string;
  branchId: string;
  movementType: CashMovementType;
  amount: number;
  reason: string;
  authorizedBy?: string | null;
  createdAt: string;
}

export interface XReportSummary {
  shiftId: string;
  terminalId: string;
  cashierId: string;
  openedAt: string;
  reportGeneratedAt: string;
  openingFloat: number;
  totalSalesCount: number;
  grossSalesAmount: number;
  cashSalesAmount: number;
  telebirrSalesAmount: number;
  cbeBirrSalesAmount: number;
  cardSalesAmount: number;
  totalCashDrops: number;
  totalPettyCashOut: number;
  expectedCashInDrawer: number;
}

export interface ZReportSummary extends XReportSummary {
  closingCashCounted: number;
  cashVariance: number; // positive = over, negative = short
  closedAt: string;
}

export interface SaleLineItemInput {
  productId: string;
  barcode?: string;
  quantity: number;
  unitPrice?: number; // Override if authorized
  discountAmount?: number;
  discountReason?: string;
}

export interface SalePaymentInput {
  paymentMethod: PaymentMethod;
  amount: number;
  providerReference?: string;
  isOfflineVerified?: boolean;
  metadata?: Record<string, any>;
}

export interface CreateSaleRequest {
  terminalId: string;
  shiftId: string;
  cashierId: string;
  idempotencyKey?: string;
  clientTimestamp?: string;
  items: SaleLineItemInput[];
  payments: SalePaymentInput[];
  bypassFiscal?: boolean;
}


export interface SaleItemRecord {
  id: string;
  saleId: string;
  productId: string;
  batchId?: string | null;
  barcode?: string | null;
  itemNameSnapshot: string;
  quantity: number;
  unitPrice: number;
  unitCost: number;
  discountAmount: number;
  discountReason?: string | null;
  isVatApplicable: boolean;
  taxRate: number;
  taxAmount: number;
  lineTotal: number;
  createdAt: string;
}

export interface SalePaymentRecord {
  id: string;
  saleId: string;
  paymentMethod: PaymentMethod;
  amount: number;
  providerReference?: string | null;
  isOfflineVerified: boolean;
  metadata?: Record<string, any> | null;
  createdAt: string;
}

export interface SaleRecord {
  id: string;
  branchId: string;
  terminalId: string;
  shiftId: string;
  receiptNumber: string;
  cashierId: string;
  subtotal: number;
  discountTotal: number;
  taxableSubtotal: number;
  taxExemptSubtotal: number;
  taxTotal: number;
  grandTotal: number;
  totalPaid: number;
  changeGiven: number;
  paymentStatus: SaleStatus;
  fiscalStatus: FiscalStatus;
  fiscalReceiptNo?: string | null;
  fiscalMrc?: string | null;
  fiscalSignature?: string | null;
  reprintCount: number;
  idempotencyKey?: string | null;
  clientTimestamp: string;
  serverTimestamp: string;
  createdAt: string;
  items?: SaleItemRecord[];
  payments?: SalePaymentRecord[];
}

export interface RefundLineItemInput {
  originalSaleItemId: string;
  quantity: number;
  returnToInventory?: boolean;
}

export interface CreateSaleRefundRequest {
  originalSaleId: string;
  cashierId: string;
  authorizedBy: string;
  shiftId: string;
  reason: string;
  items: RefundLineItemInput[];
}

export interface ThermalReceiptData {
  storeName: string;
  storeTin: string;
  storeVatNumber?: string;
  branchName: string;
  branchAddress?: string;
  branchPhone?: string;
  terminalCode: string;
  cashierName: string;
  receiptNumber: string;
  saleDate: string;
  items: Array<{
    name: string;
    quantity: number;
    unitPrice: number;
    discount?: number;
    lineTotal: number;
    isVat: boolean;
  }>;
  subtotal: number;
  discountTotal: number;
  taxableSubtotal: number;
  vatAmount: number;
  exemptSubtotal: number;
  grandTotal: number;
  payments: Array<{
    method: PaymentMethod;
    amount: number;
    reference?: string;
  }>;
  changeGiven: number;
  fiscalMrc?: string;
  fiscalReceiptNo?: string;
  fiscalSignature?: string;
}

export interface ElectronicJournalEntry {
  receiptNumber: string;
  timestamp: string;
  terminalId: string;
  branchId: string;
  cashierId: string;
  grandTotal: number;
  taxTotal: number;
  taxableSubtotal: number;
  itemCount: number;
  payments: Array<{ method: string; amount: number; reference?: string }>;
  hashSignature: string;
}

export interface HeldBasketItem {
  productId: string;
  name: string;
  barcode?: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  lineTotal: number;
  isVat: boolean;
  scaleWeightGrams?: number;
}

export interface HeldBasketRecord {
  id: string;
  branchId: string;
  terminalId: string;
  cashierId: string;
  customerIdentifier?: string | null;
  items: HeldBasketItem[];
  subtotal: number;
  taxTotal: number;
  grandTotal: number;
  heldAt: string;
  resumedAt?: string | null;
}

export interface HoldBasketInput {
  terminalId: string;
  customerIdentifier?: string;
  items: HeldBasketItem[];
  subtotal: number;
  taxTotal: number;
  grandTotal: number;
}

export interface ManagerPinVerifyRequest {
  pin: string;
  actionRequired?: string; // e.g., 'DISCOUNT_OVERRIDE' | 'REFUND_AUTH'
}

export interface ManagerPinVerifyResponse {
  authorized: boolean;
  authorizedBy?: string;
  role?: string;
  maxDiscountPercentage?: number;
  message?: string;
}

export interface ReceiptReprintResponse {
  sale: SaleRecord;
  thermalReceipt: string;
  reprintCount: number;
}

