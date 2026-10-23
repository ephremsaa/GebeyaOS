export type ImportMode = 'NEW_ONLY' | 'ADD_STOCK_EXISTING' | 'CREATE_OR_UPDATE';
export type ImportSourceType = 'OPENING_BALANCE' | 'GOODS_RECEIVED';
export type ImportRowStatus = 'OK' | 'WARNING' | 'ERROR';

export interface ParsedImportRow {
  rowNumber: number;
  sku: string;
  barcode: string;
  nameEn: string;
  nameAm?: string;
  category: string;
  unit: string;
  quantity: number;
  costPrice: number;
  sellingPrice: number;
  batchNumber?: string;
  expiryDate?: string;
  isVat?: boolean;
  status: ImportRowStatus;
  issues: string[];
}

export interface ImportValidationSummary {
  totalRows: number;
  okRows: number;
  warningRows: number;
  errorRows: number;
  duplicateFileWarning: boolean;
  fileHash: string;
  rows: ParsedImportRow[];
}

export interface ImportCommitRequest {
  fileHash: string;
  fileName: string;
  importMode: ImportMode;
  sourceType: ImportSourceType;
  supplierId?: string;
  confirmDuplicate?: boolean;
  rows: ParsedImportRow[];
}

export interface ImportCommitResult {
  batchId: string;
  fileName: string;
  importMode: ImportMode;
  sourceType: ImportSourceType;
  totalRows: number;
  createdCount: number;
  updatedCount: number;
  skippedCount: number;
  failedCount: number;
  totalQuantityAdded: number;
}

export interface ImportBatchSummary {
  id: string;
  fileName: string;
  fileHash: string;
  importMode: ImportMode;
  sourceType: ImportSourceType;
  supplierName?: string;
  totalRows: number;
  createdCount: number;
  updatedCount: number;
  skippedCount: number;
  errorCount: number;
  status: 'COMPLETED' | 'REVERTED' | 'FAILED';
  userName?: string;
  createdAt: string;
  revertedAt?: string;
}

export interface ScanIntakeItem {
  barcode: string;
  productId: string;
  productName: string;
  sku: string;
  category: string;
  quantity: number;
  unitCost: number;
  sellingPrice: number;
  batchNumber?: string;
  expiryDate?: string;
  isPerishable: boolean;
  unit: string;
}
