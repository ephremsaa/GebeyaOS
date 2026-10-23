-- ============================================================================
-- GebeyaOS - Database Schema Migration
-- Migration: 003_inventory_imports.sql
-- Phase 2: Inventory Inflow, Excel/CSV Import Batches, and Undo Reversals
-- ============================================================================

CREATE TABLE IF NOT EXISTS import_batches (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    file_name VARCHAR(255) NOT NULL,
    file_hash VARCHAR(64) NOT NULL,
    import_mode VARCHAR(32) NOT NULL, -- 'NEW_ONLY', 'ADD_STOCK_EXISTING', 'CREATE_OR_UPDATE'
    source_type VARCHAR(32) NOT NULL DEFAULT 'OPENING_BALANCE', -- 'OPENING_BALANCE', 'GOODS_RECEIVED'
    supplier_id UUID REFERENCES suppliers(id) ON DELETE SET NULL,
    total_rows INT NOT NULL DEFAULT 0,
    created_count INT NOT NULL DEFAULT 0,
    updated_count INT NOT NULL DEFAULT 0,
    skipped_count INT NOT NULL DEFAULT 0,
    error_count INT NOT NULL DEFAULT 0,
    status VARCHAR(32) NOT NULL DEFAULT 'COMPLETED', -- 'COMPLETED', 'REVERTED', 'FAILED'
    reverted_at TIMESTAMPTZ,
    reverted_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX IF NOT EXISTS idx_import_batches_branch ON import_batches(branch_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_import_batches_hash ON import_batches(branch_id, file_hash);

CREATE TABLE IF NOT EXISTS import_batch_rows (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
    batch_id UUID NOT NULL REFERENCES import_batches(id) ON DELETE CASCADE,
    row_number INT NOT NULL,
    sku VARCHAR(64),
    barcode VARCHAR(64),
    product_id UUID REFERENCES products(id) ON DELETE SET NULL,
    batch_id_ref UUID REFERENCES batches(id) ON DELETE SET NULL,
    stock_ledger_id UUID REFERENCES stock_ledger(id) ON DELETE SET NULL,
    reversal_ledger_id UUID REFERENCES stock_ledger(id) ON DELETE SET NULL,
    quantity_imported NUMERIC(14, 3) NOT NULL DEFAULT 0,
    unit_cost NUMERIC(14, 4) NOT NULL DEFAULT 0,
    status VARCHAR(16) NOT NULL DEFAULT 'OK', -- 'OK', 'WARNING', 'ERROR'
    raw_data JSONB NOT NULL,
    error_messages TEXT[],
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX IF NOT EXISTS idx_import_batch_rows_batch ON import_batch_rows(batch_id, row_number);
