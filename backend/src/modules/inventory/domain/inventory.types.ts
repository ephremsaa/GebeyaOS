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

export type AdjustmentReasonCode =
  | 'DAMAGED_GOODS'
  | 'EXPIRED'
  | 'INTERNAL_USE'
  | 'CORRECTION'
  | 'THEFT';

export interface Batch {
  id: string;
  branch_id: string;
  product_id: string;
  batch_number: string;
  expiry_date: string | null;
  unit_cost: number;
  initial_quantity: number;
  current_quantity: number;
  supplier_id?: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface StockLedgerEntry {
  id: string;
  branch_id: string;
  product_id: string;
  batch_id: string | null;
  movement_type: StockMovementType;
  quantity_change: number; // positive = stock in, negative = stock out
  unit_cost: number;
  balance_after: number;
  reference_type: string;
  reference_id: string;
  notes: string | null;
  created_by: string | null;
  created_at: Date;
}

export interface StockAdjustment {
  id: string;
  branch_id: string;
  adjustment_number: string;
  reason_code: AdjustmentReasonCode;
  notes: string;
  status: 'DRAFT' | 'SUBMITTED' | 'COMPLETED' | 'REJECTED';
  approved_by: string | null;
  created_by: string;
  created_at: Date;
}

export interface StockTake {
  id: string;
  branch_id: string;
  count_number: string;
  scope: 'FULL' | 'CATEGORY' | 'RANDOM_SAMPLE';
  category_id: string | null;
  status: 'IN_PROGRESS' | 'RECONCILED' | 'CANCELLED';
  notes: string | null;
  conducted_by: string;
  reconciled_by: string | null;
  started_at: Date;
  completed_at: Date | null;
}

export interface BatchAllocation {
  batchId: string;
  batchNumber: string;
  expiryDate: string | null;
  unitCost: number;
  allocatedQuantity: number;
}
