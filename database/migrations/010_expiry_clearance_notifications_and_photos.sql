-- 010_expiry_clearance_notifications_and_photos.sql
-- Adds clearance markdown pricing fields to batches, photo metadata to products, and dedicated notifications table.

-- 1. Batches table: clearance markdown pricing
ALTER TABLE batches
  ADD COLUMN IF NOT EXISTS clearance_price NUMERIC(12, 2) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS clearance_start_date DATE DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS clearance_end_date DATE DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS clearance_reason TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS clearance_set_by UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS clearance_set_at TIMESTAMPTZ DEFAULT NULL;

-- 2. Products table: photo metadata
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS photo_path TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS photo_hash VARCHAR(64) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS photo_size INTEGER DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS photo_width INTEGER DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS photo_height INTEGER DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS photo_uploaded_by UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS photo_updated_at TIMESTAMPTZ DEFAULT NULL;

-- 3. Notifications table
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  type VARCHAR(32) NOT NULL, -- 'EXPIRY', 'STOCKOUT', 'SYNC', 'CASH_THRESHOLD'
  stage VARCHAR(32) DEFAULT NULL, -- '90D', '30D', '7D', 'EXPIRED'
  severity VARCHAR(16) NOT NULL DEFAULT 'INFO', -- 'INFO', 'WARNING', 'CRITICAL'
  title VARCHAR(255) NOT NULL,
  title_am VARCHAR(255) DEFAULT NULL,
  message TEXT NOT NULL,
  message_am TEXT DEFAULT NULL,
  action_url VARCHAR(128) DEFAULT NULL,
  batch_id UUID REFERENCES batches(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id) ON DELETE CASCADE,
  is_read BOOLEAN DEFAULT FALSE,
  snoozed_until TIMESTAMPTZ DEFAULT NULL,
  dismissed BOOLEAN DEFAULT FALSE,
  resolved BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indices for rapid querying and idempotency checks
CREATE INDEX IF NOT EXISTS idx_notifications_tenant_branch ON notifications(tenant_id, branch_id);
CREATE INDEX IF NOT EXISTS idx_notifications_batch_stage ON notifications(batch_id, stage);
CREATE INDEX IF NOT EXISTS idx_notifications_status ON notifications(tenant_id, is_read, dismissed, resolved);

-- Enable RLS for notifications table
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'notifications' AND policyname = 'tenant_isolation_notifications'
  ) THEN
    CREATE POLICY tenant_isolation_notifications ON notifications
      USING (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid);
  END IF;
END $$;
