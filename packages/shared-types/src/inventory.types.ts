export type StockMovementType =
  | 'SALE'
  | 'SALE_REFUND'
  | 'PURCHASE_RECEIVE'
  | 'TRANSFER_OUT'
  | 'TRANSFER_IN'
  | 'ADJUSTMENT'
  | 'COUNT_VARIANCE'
  | 'DAMAGE'
  | 'EXPIRED';

export type StockReferenceType =
  | 'SALE'
  | 'GRN'
  | 'TRANSFER'
  | 'ADJUSTMENT'
  | 'STOCK_TAKE';

export type StockAdjustmentReasonCode =
  | 'DAMAGED_GOODS'
  | 'EXPIRED'
  | 'INTERNAL_USE'
  | 'CORRECTION'
  | 'THEFT';

export type StockTakeScope = 'FULL' | 'CATEGORY' | 'RANDOM_SAMPLE';

export type StockTakeStatus = 'IN_PROGRESS' | 'RECONCILED' | 'CANCELLED';

export interface Batch {
  id: string;
  branchId: string;
  productId: string;
  batchNumber: string;
  expiryDate: string | null; // ISO Date YYYY-MM-DD
  unitCost: number;
  initialQuantity: number;
  currentQuantity: number;
  supplierId?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface StockLedgerEntry {
  id: string;
  branchId: string;
  productId: string;
  batchId?: string | null;
  movementType: StockMovementType;
  quantityChange: number;
  unitCost: number;
  balanceAfter: number;
  referenceType: StockReferenceType;
  referenceId: string;
  notes?: string | null;
  createdBy?: string | null;
  createdAt: string;
}

export interface StockAdjustmentItem {
  id: string;
  adjustmentId: string;
  productId: string;
  batchId?: string | null;
  quantityChange: number;
  unitCost: number;
  createdAt: string;
}

export interface StockAdjustment {
  id: string;
  branchId: string;
  adjustmentNumber: string;
  reasonCode: StockAdjustmentReasonCode;
  notes: string;
  status: 'DRAFT' | 'SUBMITTED' | 'COMPLETED' | 'REJECTED';
  approvedBy?: string | null;
  createdBy: string;
  createdAt: string;
  items?: StockAdjustmentItem[];
}

export interface StockTakeItem {
  id: string;
  stockTakeId: string;
  productId: string;
  batchId?: string | null;
  systemQuantity: number;
  countedQuantity: number;
  variance: number; // countedQuantity - systemQuantity
  unitCost: number;
  createdAt: string;
}

export interface StockTake {
  id: string;
  branchId: string;
  countNumber: string;
  scope: StockTakeScope;
  categoryId?: string | null;
  status: StockTakeStatus;
  notes?: string | null;
  conductedBy: string;
  reconciledBy?: string | null;
  startedAt: string;
  completedAt?: string | null;
  items?: StockTakeItem[];
}

export interface FEFOBatchCandidate {
  id: string;
  batchNumber: string;
  expiryDate: string | null;
  unitCost: number;
  currentQuantity: number;
  createdAt: string;
}

export interface FEFOAllocationItem {
  batchId: string;
  batchNumber: string;
  quantity: number;
  unitCost: number;
  expiryDate: string | null;
}

export interface FEFOAllocationResult {
  allocations: FEFOAllocationItem[];
  totalAllocated: number;
  unallocatedQuantity: number;
  fullyAllocated: boolean;
}
