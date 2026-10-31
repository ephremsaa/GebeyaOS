-- ============================================================================
-- GebeyaOS - Database Schema Migration
-- Migration: 005_purchasing_payables_and_returns.sql
-- Description: Supplier payables, aging, payments, and purchase returns
-- ============================================================================

-- 1. Alter purchase_orders to support threshold approval and full status lifecycle
ALTER TABLE purchase_orders
    ADD COLUMN IF NOT EXISTS requires_approval BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES users(id),
    ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;

-- 2. Supplier Payables (Invoices created upon GRN confirmation)
CREATE TABLE IF NOT EXISTS supplier_payables (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
    supplier_id UUID NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
    grn_id UUID REFERENCES goods_received_notes(id) ON DELETE RESTRICT,
    invoice_number VARCHAR(64) NOT NULL,
    invoice_date DATE NOT NULL DEFAULT CURRENT_DATE,
    due_date DATE NOT NULL,
    total_amount NUMERIC(14, 4) NOT NULL,
    withholding_amount NUMERIC(14, 4) NOT NULL DEFAULT 0.0000,
    net_payable NUMERIC(14, 4) NOT NULL,
    paid_amount NUMERIC(14, 4) NOT NULL DEFAULT 0.0000,
    status VARCHAR(32) NOT NULL DEFAULT 'UNPAID', -- 'UNPAID', 'PARTIALLY_PAID', 'PAID', 'CANCELLED'
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX IF NOT EXISTS idx_supplier_payables_aging 
    ON supplier_payables(branch_id, status, due_date);

-- 3. Supplier Payments (Settlement against payables)
CREATE TABLE IF NOT EXISTS supplier_payments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
    supplier_id UUID NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
    payable_id UUID REFERENCES supplier_payables(id) ON DELETE SET NULL,
    payment_number VARCHAR(32) NOT NULL UNIQUE,
    amount NUMERIC(14, 4) NOT NULL CHECK (amount > 0),
    payment_method VARCHAR(32) NOT NULL, -- 'CASH', 'BANK_TRANSFER', 'TELEBIRR', 'CBE_BIRR', 'CHECK'
    reference_number VARCHAR(64),
    payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
    notes TEXT,
    paid_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

-- 4. Supplier Purchase Returns (Reversing movements)
CREATE TABLE IF NOT EXISTS supplier_returns (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
    supplier_id UUID NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
    grn_id UUID REFERENCES goods_received_notes(id) ON DELETE SET NULL,
    return_number VARCHAR(32) NOT NULL UNIQUE,
    status VARCHAR(32) NOT NULL DEFAULT 'CONFIRMED', -- 'DRAFT', 'CONFIRMED', 'CANCELLED'
    total_return_value NUMERIC(14, 4) NOT NULL,
    reason TEXT NOT NULL,
    created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE IF NOT EXISTS supplier_return_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
    return_id UUID NOT NULL REFERENCES supplier_returns(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    batch_id UUID REFERENCES batches(id) ON DELETE SET NULL,
    quantity NUMERIC(14, 3) NOT NULL CHECK (quantity > 0),
    unit_cost NUMERIC(14, 4) NOT NULL CHECK (unit_cost >= 0),
    total_cost NUMERIC(14, 4) NOT NULL,
    reason VARCHAR(64)
);
