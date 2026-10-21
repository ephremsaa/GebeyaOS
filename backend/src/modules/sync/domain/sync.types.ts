export type SyncEntityType =
  | 'SALE'
  | 'STOCK_LEDGER'
  | 'SHIFT'
  | 'STOCK_ADJUSTMENT'
  | 'STOCK_TAKE'
  | 'PRODUCT'
  | 'CATEGORY'
  | 'USER'
  | 'ROLE'
  | 'TRANSFER';

export type SyncOperation = 'INSERT' | 'UPDATE' | 'DELETE';

export type SyncStatus = 'PENDING' | 'IN_FLIGHT' | 'ACKNOWLEDGED' | 'FAILED';

export interface SyncOutboxEvent {
  id: string;
  branch_id: string;
  sequence_no: number;
  entity_type: SyncEntityType;
  entity_id: string;
  operation: SyncOperation;
  idempotency_key: string;
  payload: Record<string, any>;
  status: SyncStatus;
  retry_count: number;
  last_error?: string | null;
  created_at: Date;
  acknowledged_at?: Date | null;
}

export interface SyncBatchPayload {
  branchId: string;
  batchTimestamp: string;
  events: Array<{
    eventId: string;
    sequenceNo: number;
    entityType: SyncEntityType;
    entityId: string;
    operation: SyncOperation;
    idempotencyKey: string;
    payload: Record<string, any>;
  }>;
}

export interface SyncBatchResponse {
  success: boolean;
  acknowledgedEventIds: string[];
  failedEventIds: string[];
  duplicateCount: number;
  lastProcessedSequence: number;
  serverTimestamp: string;
}

export interface SyncStreamStatus {
  branchId: string;
  pendingOutboxCount: number;
  inFlightCount: number;
  lastAcknowledgedSequence: number;
  lastSyncTimestamp: Date | null;
  isFresh: boolean; // True if synced within past 15 mins
}
