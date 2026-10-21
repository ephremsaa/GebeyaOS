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
}

export interface ProductProfitabilityItem {
  productId: string;
  sku: string;
  nameEn: string;
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
