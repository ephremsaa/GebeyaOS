export type TransferStatus =
  | 'REQUESTED'
  | 'APPROVED'
  | 'DISPATCHED'
  | 'IN_TRANSIT'
  | 'RECEIVED'
  | 'DISCREPANCY'
  | 'CANCELLED';

export type TransferDiscrepancyReason =
  | 'DAMAGED_IN_TRANSIT'
  | 'SHORTAGE_MISSING'
  | 'EXPIRED_ON_ARRIVAL'
  | 'WRONG_ITEM';

export interface TransferItem {
  id: string;
  transferId: string;
  productId: string;
  batchId?: string | null;
  batchNumber?: string | null;
  expiryDate?: string | null;
  unitCost: number;
  requestedQuantity: number;
  dispatchedQuantity: number;
  receivedQuantity: number;
  discrepancyQuantity: number; // dispatched - received
  discrepancyReason?: string | null;
}

export interface Transfer {
  id: string;
  transferNumber: string;
  sourceBranchId: string;
  destinationBranchId: string;
  status: TransferStatus;
  notes?: string | null;
  requestedBy: string;
  approvedBy?: string | null;
  dispatchedBy?: string | null;
  receivedBy?: string | null;
  dispatchedAt?: string | null;
  receivedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  items?: TransferItem[];
}

export interface CreateTransferItemInput {
  productId: string;
  batchId?: string;
  requestedQuantity: number;
}

export interface CreateTransferRequest {
  destinationBranchId: string;
  notes?: string;
  items: CreateTransferItemInput[];
}

export interface DispatchTransferItemInput {
  transferItemId: string;
  dispatchedQuantity: number;
  batchId?: string;
}

export interface DispatchTransferRequest {
  items?: DispatchTransferItemInput[];
}

export interface ReceiveTransferItemInput {
  transferItemId: string;
  receivedQuantity: number;
  discrepancyReason?: string;
}

export interface ReceiveTransferRequest {
  items: ReceiveTransferItemInput[];
}
