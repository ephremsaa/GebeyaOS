-- ============================================================================
-- GebeyaOS - Database Schema Migration
-- Migration: 004_pos_checkout_enhancements.sql
-- Description: Idempotency key on sales and persistent held baskets
-- ============================================================================

-- 1. Add idempotency_key to sales table for double-charge prevention
ALTER TABLE sales
    ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(128);

CREATE UNIQUE INDEX IF NOT EXISTS idx_sales_idempotency_key 
    ON sales(idempotency_key) 
    WHERE idempotency_key IS NOT NULL;

-- 2. Create held_baskets table for persistent customer baskets
CREATE TABLE IF NOT EXISTS held_baskets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    terminal_id UUID NOT NULL REFERENCES terminals(id) ON DELETE CASCADE,
    cashier_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    customer_identifier VARCHAR(128),
    cart_items JSONB NOT NULL,
    subtotal NUMERIC(14, 4) NOT NULL DEFAULT 0.0000,
    tax_total NUMERIC(14, 4) NOT NULL DEFAULT 0.0000,
    grand_total NUMERIC(14, 4) NOT NULL DEFAULT 0.0000,
    held_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    resumed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_held_baskets_active 
    ON held_baskets(branch_id, terminal_id, held_at DESC) 
    WHERE resumed_at IS NULL;
