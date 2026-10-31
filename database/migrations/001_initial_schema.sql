-- ============================================================================
-- GebeyaOS - Database Schema Migration
-- Migration: 001_initial_schema.sql
-- Engine: PostgreSQL 16
-- Multi-Branch Supermarket Management System (Local-Server-First)
-- ============================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ----------------------------------------------------------------------------
-- UUIDv7 Generator Function
-- Generates time-ordered UUIDv7 natively in PostgreSQL
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION uuid_generate_v7()
RETURNS uuid AS $$
DECLARE
  v_time timestamp with time zone:= clock_timestamp();
  v_epoch_ms bigint;
  v_uuid text;
BEGIN
  v_epoch_ms := (extract(epoch from v_time) * 1000)::bigint;
  
  -- 48 bits of unix timestamp milliseconds (12 hex chars)
  v_uuid := lpad(to_hex(v_epoch_ms), 12, '0');
  
  -- 16 bits version (4 bits: '7') + rand_a (12 bits)
  v_uuid := v_uuid || '7' || substr(encode(gen_random_bytes(2), 'hex'), 2, 3);
  
  -- 16 bits variant (2 bits: '10' -> 8,9,a,b) + rand_b (14 bits)
  v_uuid := v_uuid || substr('89ab', (floor(random() * 4) + 1)::int, 1) || substr(encode(gen_random_bytes(2), 'hex'), 2, 3);
  
  -- 48 bits random
  v_uuid := v_uuid || encode(gen_random_bytes(6), 'hex');
  
  RETURN v_uuid::uuid;
END;
$$ LANGUAGE plpgsql VOLATILE;

-- ----------------------------------------------------------------------------
-- Helper: Trigger to automatically update `updated_at`
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = clock_timestamp();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 1. CORE TENANCY & HARDWARE
-- ============================================================================

CREATE TABLE branches (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
    code VARCHAR(16) NOT NULL UNIQUE,          -- e.g., 'BOLE-01', 'MEK-01', 'HQ'
    name VARCHAR(128) NOT NULL,
    trade_name VARCHAR(128),
    tin_number VARCHAR(16) NOT NULL,           -- Ethiopian 10-digit Tax Identification Number
    vat_registration_no VARCHAR(32),           -- VAT certificate number
    phone VARCHAR(32) NOT NULL,
    email VARCHAR(128),
    city VARCHAR(64) NOT NULL DEFAULT 'Addis Ababa',
    subcity VARCHAR(64),
    woreda VARCHAR(32),
    house_no VARCHAR(32),
    is_hq BOOLEAN NOT NULL DEFAULT FALSE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    settings JSONB NOT NULL DEFAULT '{
        "currency": "ETB",
        "default_vat_rate": 0.15,
        "allow_negative_stock": false,
        "require_manager_refund_auth": true,
        "scale_barcode_prefix": "20",
        "scale_barcode_type": "WEIGHT",
        "scale_weight_unit": "G"
    }'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE TRIGGER trg_branches_updated_at
BEFORE UPDATE ON branches
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE terminals (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
    code VARCHAR(16) NOT NULL,                  -- e.g., 'POS-01', 'POS-02'
    name VARCHAR(64) NOT NULL,                  -- 'Lane 1 Express'
    device_type VARCHAR(32) NOT NULL DEFAULT 'POS_STATION', -- 'POS_STATION', 'BACKOFFICE', 'HANDHELD'
    mac_address VARCHAR(32),
    ip_address VARCHAR(45),
    printer_type VARCHAR(32) NOT NULL DEFAULT 'ESC_POS',   -- 'ESC_POS', 'FISCAL_SERIAL', 'NETWORK'
    printer_target VARCHAR(128) DEFAULT 'COM1',            -- port, IP, or share name
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    last_active_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT uq_branch_terminal_code UNIQUE (branch_id, code)
);

CREATE TRIGGER trg_terminals_updated_at
BEFORE UPDATE ON terminals
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- 2. AUTHENTICATION, USERS & RBAC
-- ============================================================================

CREATE TABLE permissions (
    id VARCHAR(64) PRIMARY KEY,                 -- e.g. 'pos:sale:create', 'inventory:adjust'
    module VARCHAR(32) NOT NULL,                -- 'POS', 'INVENTORY', 'PRICING', etc.
    description VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE roles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
    name VARCHAR(64) NOT NULL UNIQUE,          -- 'SUPER_ADMIN', 'BRANCH_MANAGER', 'CASHIER', 'INVENTORY_CLERK'
    description VARCHAR(255),
    is_system BOOLEAN NOT NULL DEFAULT FALSE,
    max_discount_percentage NUMERIC(5, 2) NOT NULL DEFAULT 0.00, -- Maximum discount cashier/role can apply
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE role_permissions (
    role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    permission_id VARCHAR(64) NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
    PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
    username VARCHAR(64) NOT NULL UNIQUE,
    full_name VARCHAR(128) NOT NULL,
    email VARCHAR(128) UNIQUE,
    phone VARCHAR(32),
    password_hash VARCHAR(255) NOT NULL,        -- Argon2id or bcrypt hash
    pin_hash VARCHAR(255),                      -- Quick 4-6 digit POS lock/unlock PIN
    role_id UUID NOT NULL REFERENCES roles(id) ON DELETE RESTRICT,
    default_branch_id UUID REFERENCES branches(id) ON DELETE SET NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    last_login_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE TRIGGER trg_users_updated_at
BEFORE UPDATE ON users
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE user_branch_assignments (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    PRIMARY KEY (user_id, branch_id)
);

CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
    branch_id UUID REFERENCES branches(id) ON DELETE SET NULL,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(64) NOT NULL,               -- 'USER_LOGIN', 'PRICE_OVERRIDE', 'STOCK_ADJUSTMENT'
    entity_name VARCHAR(64) NOT NULL,          -- 'sales', 'products', 'shifts'
    entity_id UUID,
    ip_address VARCHAR(45),
    details JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX idx_audit_logs_branch_date ON audit_logs(branch_id, created_at DESC);
CREATE INDEX idx_audit_logs_user_date ON audit_logs(user_id, created_at DESC);

-- ============================================================================
-- 3. PRODUCTS, UNITS, BARCODES & PRICING
-- ============================================================================

CREATE TABLE categories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
    code VARCHAR(32) NOT NULL UNIQUE,
    name_en VARCHAR(128) NOT NULL,
    name_am VARCHAR(128),                      -- Amharic category name
    parent_id UUID REFERENCES categories(id) ON DELETE RESTRICT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE units_of_measure (
    code VARCHAR(16) PRIMARY KEY,              -- 'KG', 'G', 'L', 'ML', 'PCS', 'PACK', 'BOX'
    name_en VARCHAR(64) NOT NULL,
    name_am VARCHAR(64),
    allow_fractions BOOLEAN NOT NULL DEFAULT FALSE -- TRUE for KG/L, FALSE for PCS/BOX
);

CREATE TABLE products (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
    sku VARCHAR(64) NOT NULL UNIQUE,
    name_en VARCHAR(255) NOT NULL,
    name_am VARCHAR(255),                      -- Amharic item name
    category_id UUID NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
    uom_code VARCHAR(16) NOT NULL REFERENCES units_of_measure(code) ON DELETE RESTRICT,
    base_price NUMERIC(14, 4) NOT NULL CHECK (base_price >= 0), -- Master selling price in ETB
    cost_price NUMERIC(14, 4) NOT NULL DEFAULT 0.0000 CHECK (cost_price >= 0), -- Global fallback cost
    is_vat_applicable BOOLEAN NOT NULL DEFAULT TRUE,
    vat_rate NUMERIC(5, 4) NOT NULL DEFAULT 0.1500 CHECK (vat_rate >= 0), -- Default 15% (0.1500)
    is_weighed BOOLEAN NOT NULL DEFAULT FALSE, -- True if sold by scale with embedded weight barcode
    scale_plu VARCHAR(16),                     -- 4-5 digit PLU code for deli/butcher scales
    min_stock_level NUMERIC(12, 3) NOT NULL DEFAULT 0.000,
    max_stock_level NUMERIC(12, 3),
    allow_discount BOOLEAN NOT NULL DEFAULT TRUE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE TRIGGER trg_products_updated_at
BEFORE UPDATE ON products
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE product_barcodes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    barcode VARCHAR(64) NOT NULL UNIQUE,
    barcode_type VARCHAR(32) NOT NULL DEFAULT 'EAN13', -- 'EAN13', 'UPCA', 'CODE128', 'CUSTOM'
    pack_multiplier NUMERIC(12, 3) NOT NULL DEFAULT 1.000 CHECK (pack_multiplier > 0), -- e.g. 24 for carton
    is_primary BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX idx_product_barcodes_lookup ON product_barcodes(barcode);

CREATE TABLE branch_product_overrides (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    selling_price NUMERIC(14, 4) CHECK (selling_price >= 0),
    is_vat_applicable BOOLEAN,
    vat_rate NUMERIC(5, 4) CHECK (vat_rate >= 0),
    min_stock_level NUMERIC(12, 3),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT uq_branch_product UNIQUE (branch_id, product_id)
);

CREATE TABLE price_change_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    branch_id UUID REFERENCES branches(id) ON DELETE SET NULL, -- NULL = Global catalog price change
    old_price NUMERIC(14, 4) NOT NULL,
    new_price NUMERIC(14, 4) NOT NULL,
    reason VARCHAR(255) NOT NULL,
    changed_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

-- ============================================================================
-- 4. INVENTORY, BATCHES & APPEND-ONLY STOCK LEDGER
-- ============================================================================

CREATE TABLE batches (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    batch_number VARCHAR(64) NOT NULL,
    expiry_date DATE,
    unit_cost NUMERIC(14, 4) NOT NULL CHECK (unit_cost >= 0),
    initial_quantity NUMERIC(14, 3) NOT NULL CHECK (initial_quantity >= 0),
    current_quantity NUMERIC(14, 3) NOT NULL, -- May be negative only if negative stock allowed
    supplier_id UUID,                         -- linked supplier if purchased directly
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT uq_branch_product_batch UNIQUE (branch_id, product_id, batch_number)
);

CREATE INDEX idx_batches_fefo ON batches(branch_id, product_id, expiry_date ASC, created_at ASC)
WHERE current_quantity > 0;

CREATE TRIGGER trg_batches_updated_at
BEFORE UPDATE ON batches
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE stock_ledger (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    batch_id UUID REFERENCES batches(id) ON DELETE RESTRICT,
    movement_type VARCHAR(32) NOT NULL,       -- 'SALE', 'SALE_REFUND', 'PURCHASE_RECEIVE', 'TRANSFER_OUT', 'TRANSFER_IN', 'ADJUSTMENT', 'COUNT_VARIANCE', 'DAMAGE', 'EXPIRED'
    quantity_change NUMERIC(14, 3) NOT NULL,  -- Positive for in, negative for out
    unit_cost NUMERIC(14, 4) NOT NULL CHECK (unit_cost >= 0),
    balance_after NUMERIC(14, 3) NOT NULL,    -- Running total on hand at this branch
    reference_type VARCHAR(32) NOT NULL,      -- 'SALE', 'GRN', 'TRANSFER', 'ADJUSTMENT', 'STOCK_TAKE'
    reference_id UUID NOT NULL,               -- FK to sales, grn, transfers, etc.
    notes TEXT,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX idx_stock_ledger_branch_prod ON stock_ledger(branch_id, product_id, created_at DESC);
CREATE INDEX idx_stock_ledger_ref ON stock_ledger(reference_type, reference_id);

CREATE TABLE stock_adjustments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
    adjustment_number VARCHAR(32) NOT NULL UNIQUE,
    reason_code VARCHAR(32) NOT NULL,         -- 'DAMAGED_GOODS', 'EXPIRED', 'INTERNAL_USE', 'CORRECTION', 'THEFT'
    notes TEXT NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'COMPLETED', -- 'DRAFT', 'SUBMITTED', 'COMPLETED', 'REJECTED'
    approved_by UUID REFERENCES users(id) ON DELETE RESTRICT,
    created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE stock_adjustment_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
    adjustment_id UUID NOT NULL REFERENCES stock_adjustments(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    batch_id UUID REFERENCES batches(id) ON DELETE RESTRICT,
    quantity_change NUMERIC(14, 3) NOT NULL,  -- Positive or negative
    unit_cost NUMERIC(14, 4) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE stock_takes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
    count_number VARCHAR(32) NOT NULL UNIQUE,
    scope VARCHAR(32) NOT NULL DEFAULT 'FULL',-- 'FULL', 'CATEGORY', 'RANDOM_SAMPLE'
    category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'IN_PROGRESS', -- 'IN_PROGRESS', 'RECONCILED', 'CANCELLED'
    notes TEXT,
    conducted_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    reconciled_by UUID REFERENCES users(id) ON DELETE SET NULL,
    started_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    completed_at TIMESTAMPTZ
);

CREATE TABLE stock_take_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
    stock_take_id UUID NOT NULL REFERENCES stock_takes(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    batch_id UUID REFERENCES batches(id) ON DELETE RESTRICT,
    system_quantity NUMERIC(14, 3) NOT NULL,
    counted_quantity NUMERIC(14, 3) NOT NULL,
    variance NUMERIC(14, 3) GENERATED ALWAYS AS (counted_quantity - system_quantity) STORED,
    unit_cost NUMERIC(14, 4) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

-- ============================================================================
-- 5. PURCHASING, SUPPLIERS & GOODS RECEIVING
-- ============================================================================

CREATE TABLE suppliers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
    code VARCHAR(32) NOT NULL UNIQUE,
    name VARCHAR(128) NOT NULL,
    tin_number VARCHAR(16),                    -- Supplier TIN for Withholding Tax (2%)
    vat_number VARCHAR(32),
    contact_person VARCHAR(128),
    phone VARCHAR(32) NOT NULL,
    email VARCHAR(128),
    address TEXT,
    payment_terms_days INT NOT NULL DEFAULT 0, -- 0 for cash, 15, 30, etc.
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE TRIGGER trg_suppliers_updated_at
BEFORE UPDATE ON suppliers
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE purchase_orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
    order_number VARCHAR(32) NOT NULL UNIQUE,
    supplier_id UUID NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
    status VARCHAR(32) NOT NULL DEFAULT 'DRAFT', -- 'DRAFT', 'ISSUED', 'PARTIALLY_RECEIVED', 'COMPLETED', 'CANCELLED'
    expected_delivery_date DATE,
    subtotal NUMERIC(14, 4) NOT NULL DEFAULT 0.0000,
    tax_total NUMERIC(14, 4) NOT NULL DEFAULT 0.0000,
    grand_total NUMERIC(14, 4) NOT NULL DEFAULT 0.0000,
    notes TEXT,
    created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE purchase_order_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
    purchase_order_id UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    ordered_quantity NUMERIC(14, 3) NOT NULL CHECK (ordered_quantity > 0),
    received_quantity NUMERIC(14, 3) NOT NULL DEFAULT 0.000,
    unit_cost NUMERIC(14, 4) NOT NULL CHECK (unit_cost >= 0),
    tax_rate NUMERIC(5, 4) NOT NULL DEFAULT 0.1500,
    total_cost NUMERIC(14, 4) NOT NULL
);

CREATE TABLE goods_received_notes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
    grn_number VARCHAR(32) NOT NULL UNIQUE,
    purchase_order_id UUID REFERENCES purchase_orders(id) ON DELETE RESTRICT,
    supplier_id UUID NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
    supplier_invoice_no VARCHAR(64),
    supplier_invoice_date DATE,
    landed_freight_cost NUMERIC(14, 4) NOT NULL DEFAULT 0.0000,
    landed_other_cost NUMERIC(14, 4) NOT NULL DEFAULT 0.0000,
    total_received_cost NUMERIC(14, 4) NOT NULL,
    withholding_tax_amount NUMERIC(14, 4) NOT NULL DEFAULT 0.0000, -- 2% if applicable
    received_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE grn_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
    grn_id UUID NOT NULL REFERENCES goods_received_notes(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    batch_number VARCHAR(64) NOT NULL,
    expiry_date DATE,
    received_quantity NUMERIC(14, 3) NOT NULL CHECK (received_quantity > 0),
    purchase_unit_cost NUMERIC(14, 4) NOT NULL CHECK (purchase_unit_cost >= 0),
    apportioned_landed_cost NUMERIC(14, 4) NOT NULL DEFAULT 0.0000,
    final_unit_cost NUMERIC(14, 4) NOT NULL CHECK (final_unit_cost >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

-- ============================================================================
-- 6. INTER-BRANCH TRANSFERS
-- ============================================================================

CREATE TABLE transfers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
    transfer_number VARCHAR(32) NOT NULL UNIQUE,
    source_branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
    destination_branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
    status VARCHAR(32) NOT NULL DEFAULT 'REQUESTED', -- 'REQUESTED', 'APPROVED', 'DISPATCHED', 'IN_TRANSIT', 'RECEIVED', 'DISCREPANCY', 'CANCELLED'
    notes TEXT,
    requested_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    approved_by UUID REFERENCES users(id) ON DELETE RESTRICT,
    dispatched_by UUID REFERENCES users(id) ON DELETE RESTRICT,
    received_by UUID REFERENCES users(id) ON DELETE RESTRICT,
    dispatched_at TIMESTAMPTZ,
    received_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT chk_different_branches CHECK (source_branch_id <> destination_branch_id)
);

CREATE TABLE transfer_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
    transfer_id UUID NOT NULL REFERENCES transfers(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    batch_id UUID REFERENCES batches(id) ON DELETE RESTRICT,
    batch_number VARCHAR(64),
    expiry_date DATE,
    unit_cost NUMERIC(14, 4) NOT NULL,
    requested_quantity NUMERIC(14, 3) NOT NULL CHECK (requested_quantity > 0),
    dispatched_quantity NUMERIC(14, 3) NOT NULL DEFAULT 0.000,
    received_quantity NUMERIC(14, 3) NOT NULL DEFAULT 0.000,
    discrepancy_quantity NUMERIC(14, 3) GENERATED ALWAYS AS (dispatched_quantity - received_quantity) STORED,
    discrepancy_reason VARCHAR(255)
);

-- ============================================================================
-- 7. POS, SHIFTS, SALES, PAYMENTS & FISCAL REGISTRATION
-- ============================================================================

CREATE TABLE shifts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
    terminal_id UUID NOT NULL REFERENCES terminals(id) ON DELETE RESTRICT,
    cashier_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    shift_number INT NOT NULL,
    opening_cash_float NUMERIC(14, 4) NOT NULL CHECK (opening_cash_float >= 0),
    closing_cash_counted NUMERIC(14, 4),
    expected_cash_system NUMERIC(14, 4) NOT NULL DEFAULT 0.0000,
    cash_variance NUMERIC(14, 4) GENERATED ALWAYS AS (closing_cash_counted - expected_cash_system) STORED,
    status VARCHAR(32) NOT NULL DEFAULT 'OPEN', -- 'OPEN', 'CLOSED', 'AUDITED'
    notes TEXT,
    opened_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    closed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX idx_shifts_open ON shifts(branch_id, terminal_id, status) WHERE status = 'OPEN';

CREATE TABLE cash_movements (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
    shift_id UUID NOT NULL REFERENCES shifts(id) ON DELETE RESTRICT,
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
    movement_type VARCHAR(32) NOT NULL,        -- 'FLOAT_IN', 'PETTY_CASH_OUT', 'SAFE_DROP', 'ADDITIONAL_FLOAT'
    amount NUMERIC(14, 4) NOT NULL CHECK (amount > 0),
    reason VARCHAR(255) NOT NULL,
    authorized_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE sales (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
    terminal_id UUID NOT NULL REFERENCES terminals(id) ON DELETE RESTRICT,
    shift_id UUID NOT NULL REFERENCES shifts(id) ON DELETE RESTRICT,
    receipt_number VARCHAR(64) NOT NULL UNIQUE, -- '{BRANCH}-{TERM}-{YYYYMMDD}-{SHIFT}-{SEQ}'
    cashier_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    subtotal NUMERIC(14, 4) NOT NULL CHECK (subtotal >= 0),
    discount_total NUMERIC(14, 4) NOT NULL DEFAULT 0.0000 CHECK (discount_total >= 0),
    taxable_subtotal NUMERIC(14, 4) NOT NULL DEFAULT 0.0000,
    tax_exempt_subtotal NUMERIC(14, 4) NOT NULL DEFAULT 0.0000,
    tax_total NUMERIC(14, 4) NOT NULL DEFAULT 0.0000 CHECK (tax_total >= 0),
    grand_total NUMERIC(14, 4) NOT NULL CHECK (grand_total >= 0),
    total_paid NUMERIC(14, 4) NOT NULL CHECK (total_paid >= grand_total),
    change_given NUMERIC(14, 4) NOT NULL DEFAULT 0.0000 CHECK (change_given >= 0),
    payment_status VARCHAR(32) NOT NULL DEFAULT 'PAID', -- 'PAID', 'PARTIALLY_REFUNDED', 'FULLY_REFUNDED', 'VOIDED'
    fiscal_status VARCHAR(32) NOT NULL DEFAULT 'PENDING', -- 'PENDING', 'FISCALIZED', 'FAILED', 'BYPASSED'
    fiscal_receipt_no VARCHAR(64),
    fiscal_mrc VARCHAR(64),                    -- Fiscal Machine Registration Code
    fiscal_signature VARCHAR(255),
    reprint_count INT NOT NULL DEFAULT 0,
    client_timestamp TIMESTAMPTZ NOT NULL,     -- POS Terminal Wall Clock
    server_timestamp TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(), -- Authoritative Local Server Time
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX idx_sales_branch_date ON sales(branch_id, created_at DESC);
CREATE INDEX idx_sales_receipt ON sales(receipt_number);
CREATE INDEX idx_sales_shift ON sales(shift_id);

CREATE TABLE sale_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
    sale_id UUID NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    batch_id UUID REFERENCES batches(id) ON DELETE RESTRICT,
    barcode VARCHAR(64),
    item_name_snapshot VARCHAR(255) NOT NULL,  -- Snapshot in case name changes
    quantity NUMERIC(14, 3) NOT NULL CHECK (quantity > 0),
    unit_price NUMERIC(14, 4) NOT NULL CHECK (unit_price >= 0),
    unit_cost NUMERIC(14, 4) NOT NULL DEFAULT 0.0000, -- Weighted cost at moment of sale
    discount_amount NUMERIC(14, 4) NOT NULL DEFAULT 0.0000 CHECK (discount_amount >= 0),
    discount_reason VARCHAR(128),
    is_vat_applicable BOOLEAN NOT NULL DEFAULT TRUE,
    tax_rate NUMERIC(5, 4) NOT NULL DEFAULT 0.1500,
    tax_amount NUMERIC(14, 4) NOT NULL DEFAULT 0.0000,
    line_total NUMERIC(14, 4) NOT NULL CHECK (line_total >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE sale_payments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
    sale_id UUID NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
    payment_method VARCHAR(32) NOT NULL,       -- 'CASH', 'TELEBIRR', 'CBE_BIRR', 'CARD_POS', 'BANK_TRANSFER'
    amount NUMERIC(14, 4) NOT NULL CHECK (amount > 0),
    provider_reference VARCHAR(128),          -- Telebirr/CBE Birr transaction code or card slip auth no
    is_offline_verified BOOLEAN NOT NULL DEFAULT FALSE, -- True if cashier verified SMS/USSD offline
    metadata JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE sale_refunds (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
    original_sale_id UUID NOT NULL REFERENCES sales(id) ON DELETE RESTRICT,
    refund_number VARCHAR(64) NOT NULL UNIQUE,
    cashier_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    authorized_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    reason VARCHAR(255) NOT NULL,
    total_refund_amount NUMERIC(14, 4) NOT NULL CHECK (total_refund_amount > 0),
    tax_refund_amount NUMERIC(14, 4) NOT NULL DEFAULT 0.0000,
    fiscal_credit_note_no VARCHAR(64),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE sale_refund_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
    refund_id UUID NOT NULL REFERENCES sale_refunds(id) ON DELETE CASCADE,
    original_sale_item_id UUID NOT NULL REFERENCES sale_items(id) ON DELETE RESTRICT,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    batch_id UUID REFERENCES batches(id) ON DELETE RESTRICT,
    quantity NUMERIC(14, 3) NOT NULL CHECK (quantity > 0),
    refund_unit_price NUMERIC(14, 4) NOT NULL,
    refund_tax_amount NUMERIC(14, 4) NOT NULL DEFAULT 0.0000,
    refund_total NUMERIC(14, 4) NOT NULL,
    return_to_inventory BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE fiscal_receipt_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
    sale_id UUID NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
    terminal_id UUID NOT NULL REFERENCES terminals(id) ON DELETE RESTRICT,
    payload JSONB NOT NULL,                   -- Complete MOR fiscal payload
    response JSONB,
    fiscal_receipt_number VARCHAR(64),
    daily_z_counter INT,
    status VARCHAR(32) NOT NULL,              -- 'SUCCESS', 'COMM_ERROR', 'FISCAL_MEMORY_FULL'
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

-- ============================================================================
-- 8. EXPENSES & CASH MANAGEMENT
-- ============================================================================

CREATE TABLE expense_categories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
    code VARCHAR(32) NOT NULL UNIQUE,
    name_en VARCHAR(128) NOT NULL,
    name_am VARCHAR(128),
    is_active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE expenses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
    category_id UUID NOT NULL REFERENCES expense_categories(id) ON DELETE RESTRICT,
    amount NUMERIC(14, 4) NOT NULL CHECK (amount > 0),
    payment_method VARCHAR(32) NOT NULL DEFAULT 'CASH', -- 'CASH', 'BANK_TRANSFER', 'TELEBIRR'
    reference_number VARCHAR(64),              -- Receipt or voucher no
    payee VARCHAR(128) NOT NULL,
    description TEXT NOT NULL,
    approved_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    paid_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

-- ============================================================================
-- 9. BIDIRECTIONAL SYNC ENGINE (OUTBOX / INBOX)
-- ============================================================================

CREATE TABLE sync_outbox (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
    sequence_no BIGSERIAL,                    -- Strictly monotonic branch sequence
    entity_type VARCHAR(64) NOT NULL,         -- 'SALE', 'STOCK_LEDGER', 'SHIFT', 'TRANSFER_UPDATE'
    entity_id UUID NOT NULL,
    operation VARCHAR(16) NOT NULL,           -- 'INSERT', 'UPDATE', 'DELETE'
    idempotency_key VARCHAR(128) NOT NULL UNIQUE, -- '{branch_id}_{entity_type}_{entity_id}_{operation}_{version}'
    payload JSONB NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'PENDING', -- 'PENDING', 'IN_FLIGHT', 'ACKNOWLEDGED', 'FAILED'
    retry_count INT NOT NULL DEFAULT 0,
    last_error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    acknowledged_at TIMESTAMPTZ
);

CREATE INDEX idx_sync_outbox_pending ON sync_outbox(branch_id, status, sequence_no)
WHERE status = 'PENDING';

CREATE TABLE sync_inbox (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
    source_branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
    sequence_no BIGINT NOT NULL,
    entity_type VARCHAR(64) NOT NULL,
    entity_id UUID NOT NULL,
    operation VARCHAR(16) NOT NULL,
    idempotency_key VARCHAR(128) NOT NULL UNIQUE,
    payload JSONB NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'PROCESSED', -- 'PROCESSED', 'FAILED', 'CONFLICT'
    processed_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    error_message TEXT
);

CREATE INDEX idx_sync_inbox_dedup ON sync_inbox(idempotency_key);

CREATE TABLE sync_checkpoints (
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    stream_name VARCHAR(64) NOT NULL,         -- 'OUTBOX_TO_HQ' or 'HQ_CATALOG_TO_BRANCH'
    last_synced_sequence BIGINT NOT NULL DEFAULT 0,
    last_synced_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    PRIMARY KEY (branch_id, stream_name)
);

CREATE TABLE sync_conflict_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
    entity_type VARCHAR(64) NOT NULL,
    entity_id UUID NOT NULL,
    conflict_type VARCHAR(32) NOT NULL,       -- 'CATALOG_MISMATCH', 'PRICE_OVERRIDE_COLLISION', 'OUT_OF_ORDER'
    local_state JSONB,
    remote_state JSONB,
    resolution VARCHAR(32) NOT NULL,          -- 'HQ_WINS', 'BRANCH_WINS', 'MANUAL_INTERVENTION'
    resolved_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
