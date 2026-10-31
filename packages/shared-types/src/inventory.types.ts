export type StockMovementType =
  | 'SALE'
  | 'SALE_REFUND'
  | 'PURCHASE_RECEIVE'
  | 'PURCHASE_RETURN'
  | 'TRANSFER_OUT'
  | 'TRANSFER_IN'
  | 'ADJUSTMENT'
  | 'COUNT_VARIANCE'
  | 'DAMAGE'
  | 'EXPIRED';

export type StockReferenceType =
  | 'SALE'
  | 'GRN'
  | 'RETURN'
  | 'TRANSFER'
  | 'ADJUSTMENT'
  | 'STOCK_TAKE';

export type StockAdjustmentReasonCode =
  | 'DAMAGED_GOODS'
  | 'EXPIRED'
  | 'INTERNAL_USE'
  | 'CORRECTION'
  | 'THEFT';

export type StockTakeScope = 'FULL' | 'CATEGORY' | 'LOCATION' | 'RANDOM_SAMPLE';

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
  sku?: string;
  nameEn?: string;
  nameAm?: string;
  uomCode?: string;
  categoryName?: string;
  systemQuantity: number; // snapshot at started_at
  laterMovements?: number; // sales & receipts during count
  expectedQuantity?: number; // systemQuantity + laterMovements
  countedQuantity: number;
  variance: number; // countedQuantity - expectedQuantity
  unitCost: number;
  varianceValue?: number; // variance * unitCost
  needsRecount?: boolean; // outside tolerance
  barcodes?: string[];
  createdAt: string;
}

export interface StockTakeCategoryReport {
  categoryId?: string | null;
  categoryName: string;
  itemCount: number;
  expectedValue: number;
  countedValue: number;
  varianceValue: number;
  shrinkagePercent: number;
}

export interface StockTakeReport {
  stockTakeId: string;
  countNumber: string;
  startedAt: string;
  completedAt?: string | null;
  totalItems: number;
  totalCountedItems: number;
  totalSnapshotValue: number;
  totalCountedValue: number;
  netVarianceValue: number;
  totalShrinkageValue: number;
  shrinkagePercent: number;
  categories: StockTakeCategoryReport[];
}

export interface StockTake {
  id: string;
  branchId: string;
  countNumber: string;
  scope: StockTakeScope;
  categoryId?: string | null;
  location?: string | null;
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
