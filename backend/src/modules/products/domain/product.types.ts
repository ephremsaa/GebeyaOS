export interface Product {
  id: string;
  sku: string;
  name_en: string;
  name_am: string | null;
  category_id: string;
  uom_code: string;
  base_price: number;
  cost_price: number;
  is_vat_applicable: boolean;
  vat_rate: number;
  is_weighed: boolean;
  scale_plu: string | null;
  min_stock_level: number;
  max_stock_level: number | null;
  allow_discount: boolean;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface ProductBarcode {
  id: string;
  product_id: string;
  barcode: string;
  barcode_type: 'EAN13' | 'UPCA' | 'CODE128' | 'CUSTOM';
  pack_multiplier: number;
  is_primary: boolean;
  created_at: Date;
}

export interface BranchProductOverride {
  id: string;
  branch_id: string;
  product_id: string;
  selling_price: number | null;
  is_vat_applicable: boolean | null;
  vat_rate: number | null;
  min_stock_level: number | null;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface PriceChangeLog {
  id: string;
  product_id: string;
  branch_id: string | null;
  old_price: number;
  new_price: number;
  reason: string;
  changed_by: string | null;
  created_at: Date;
}

export interface ResolvedProductPrice {
  product_id: string;
  branch_id: string;
  base_price: number;
  effective_unit_price: number;
  is_branch_override: boolean;
  is_vat_applicable: boolean;
  vat_rate: number;
  tax_amount_per_unit: number;
  net_price_per_unit: number;
}
