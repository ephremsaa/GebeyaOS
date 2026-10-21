export type SyncAggregateType =
  | 'SALE'
  | 'SHIFT'
  | 'STOCK_LEDGER'
  | 'GRN'
  | 'TRANSFER'
  | 'PRODUCT'
  | 'CATEGORY'
  | 'SUPPLIER'
  | 'PRICE_OVERRIDE';

export type SyncEventType = 'CREATED' | 'UPDATED' | 'DELETED';

export type SyncPacketStatus =
  | 'PENDING'
  | 'IN_FLIGHT'
  | 'ACKNOWLEDGED'
  | 'FAILED';

export type ConflictResolutionPolicy =
  | 'APPLIED_BRANCH'
  | 'APPLIED_HQ'
  | 'MANUAL_REQUIRED';

export interface SyncEvent {
  id: string; // UUIDv7
  sourceBranchId: string;
  aggregateType: SyncAggregateType;
  aggregateId: string;
  eventType: SyncEventType;
  payload: Record<string, any>;
  idempotencyKey: string;
  timestamp: string;
}

export interface SyncBatchPushRequest {
  sourceBranchId: string;
  batchId: string;
  cursor?: string | null;
  events: SyncEvent[];
}

export interface ConflictRecord {
  eventId: string;
  idempotencyKey: string;
  aggregateType: SyncAggregateType;
  policy: ConflictResolutionPolicy;
  reason: string;
}

export interface SyncBatchPushResponse {
  success: boolean;
  sourceBranchId: string;
  batchId: string;
  acknowledgedEventIds: string[];
  failedEventIds: string[];
  conflicts: ConflictRecord[];
  nextCursor?: string | null;
  serverTimestamp: string;
}

export interface SyncPullRequest {
  branchId: string;
  lastSyncedAt?: string | null;
  limit?: number;
}

export interface CatalogDeltaItem {
  aggregateType: 'PRODUCT' | 'CATEGORY' | 'SUPPLIER';
  aggregateId: string;
  eventType: SyncEventType;
  data: Record<string, any>;
  updatedAt: string;
}

export interface SyncPullResponse {
  branchId: string;
  deltas: CatalogDeltaItem[];
  syncedUntil: string;
  hasMore: boolean;
}
