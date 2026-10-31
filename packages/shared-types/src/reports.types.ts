export interface PaymentMethodBreakdown {
  paymentMethod: string;
  totalAmount: number;
  transactionCount: number;
}

export interface CashierAuditSummary {
  cashierId: string;
  shiftCount: number;
  openingFloatTotal: number;
  closingCountedTotal: number;
  expectedCashTotal: number;
  netVariance: number; // positive = over, negative = short
}

export interface SalesByHourItem {
  hour: number;
  hourLabel: string; // e.g. "08:00 - 09:00"
  transactionCount: number;
  grossAmount: number;
}

export interface SalesByCategoryItem {
  categoryId: string;
  categoryName: string;
  grossRevenue: number;
  netRevenue: number;
  cogs: number;
  grossProfit: number;
  marginPercentage: number;
  // Units explicitly kept separate (never added together)
  unitsPcs: number;
  unitsKg: number;
  otherUnits: number;
}

export interface CashierPerformanceItem {
  cashierId: string;
  cashierName: string;
  shiftsCount: number;
  transactionsProcessed: number;
  openingFloatTotal: number;
  closingCountedTotal: number;
  expectedCashTotal: number;
  totalVariance: number;
  totalSales: number;
  accuracyRate: number; // Percentage where variance == 0
}

export interface VatReconciliationSummary {
  taxableSales: number; // 15% standard base
  taxExemptSales: number; // 0% exempt base
  vatCollected: number; // Total VAT on sales
  sumOfLineVat: number; // Sum of line-item tax amounts
  isVatReconciled: boolean; // vatCollected == sumOfLineVat (within 0.05 ETB)
  grossSales: number; // Total sales revenue
  sumOfPayments: number; // Sum of payment records
  isPaymentReconciled: boolean; // grossSales == sumOfPayments (within 0.05 ETB)
}

export interface BranchSyncFreshness {
  branchId: string;
  branchCode: string;
  branchName: string;
  lastSyncedAt: string | null;
  minutesSinceSync: number | null;
  status: 'LIVE' | 'DELAYED' | 'STALE' | 'OFFLINE';
  isOnline: boolean;
  todaySales: number;
  todayTransactions: number;
}

export type ReportTimeRange = 'today' | 'yesterday' | 'week' | 'month' | 'custom';

export interface DailySalesReport {
  branchId: string;
  startDate: string;
  endDate: string;
  totalSalesCount: number;
  grossSalesAmount: number;
  discountTotal: number;
  taxableSubtotal: number;
  taxExemptSubtotal: number;
  taxTotal: number;
  netSalesAmount: number;
  paymentBreakdown: PaymentMethodBreakdown[];
  cashierAudits: CashierAuditSummary[];
  hourlyBreakdown?: SalesByHourItem[];
  categoryBreakdown?: SalesByCategoryItem[];
  vatReconciliation?: VatReconciliationSummary;
}

export interface ProductProfitabilityItem {
  productId: string;
  sku: string;
  nameEn: string;
  uom?: string;
  quantitySold: number;
  grossRevenue: number;
  discountAmount: number;
  netRevenue: number;
  cogs: number; // Cost of goods sold
  grossProfit: number; // netRevenue - cogs
  marginPercentage: number; // (grossProfit / netRevenue) * 100
}

export interface ProductProfitabilityReport {
  branchId: string;
  startDate: string;
  endDate: string;
  totalRevenue: number;
  totalCOGS: number;
  totalGrossProfit: number;
  overallMarginPercentage: number;
  items: ProductProfitabilityItem[];
}

export interface CategoryValuationSummary {
  categoryId: string;
  categoryName: string;
  productCount: number;
  totalQuantity: number;
  // Units explicitly segregated by Unit of Measure (pcs vs kg)
  totalQuantityPcs: number;
  totalQuantityKg: number;
  totalValuation: number;
}

export interface StockValuationReport {
  branchId: string;
  generatedAt: string;
  totalProducts: number;
  totalQuantityOnHand: number;
  totalValuationETB: number;
  lowStockItemsCount: number;
  categories: CategoryValuationSummary[];
}

export interface ExpiringBatchItem {
  batchId: string;
  batchNumber: string;
  productId: string;
  productName: string;
  expiryDate: string;
  daysUntilExpiry: number;
  quantityOnHand: number;
  unitCost: number;
  potentialLossValue: number;
  isExpired: boolean;
  uom?: string;
}

export interface ExpiringStockReport {
  branchId: string;
  thresholdDays: number;
  generatedAt: string;
  totalExpiringBatches: number;
  totalExpiringValueETB: number;
  alreadyExpiredValueETB: number;
  batches: ExpiringBatchItem[];
}
