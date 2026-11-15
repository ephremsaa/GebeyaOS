-- Migration 005: Add has_expiry_date flag to products
ALTER TABLE products ADD COLUMN IF NOT EXISTS has_expiry_date BOOLEAN NOT NULL DEFAULT FALSE;
CREATE INDEX IF NOT EXISTS idx_products_has_expiry_date ON products(has_expiry_date) WHERE has_expiry_date = TRUE;

