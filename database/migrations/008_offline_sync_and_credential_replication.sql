-- ============================================================================
-- GebeyaOS - Database Schema Migration
-- Migration: 008_offline_sync_and_credential_replication.sql
-- Phase: Step 5 - Offline Verification, Credential Sync & Audit Queuing
-- ============================================================================

-- 1. Extend `sync_outbox` for aggregate types and flexible offline event queuing
ALTER TABLE sync_outbox
    ADD COLUMN IF NOT EXISTS aggregate_type VARCHAR(64),
    ADD COLUMN IF NOT EXISTS aggregate_id VARCHAR(128),
    ADD COLUMN IF NOT EXISTS event_type VARCHAR(32);

-- Allow nullable legacy columns so aggregate-based events can be inserted seamlessly
ALTER TABLE sync_outbox ALTER COLUMN branch_id DROP NOT NULL;
ALTER TABLE sync_outbox ALTER COLUMN entity_id DROP NOT NULL;
ALTER TABLE sync_outbox ALTER COLUMN entity_type DROP NOT NULL;
ALTER TABLE sync_outbox ALTER COLUMN operation DROP NOT NULL;

UPDATE sync_outbox
SET aggregate_type = COALESCE(aggregate_type, entity_type),
    aggregate_id = COALESCE(aggregate_id, entity_id::text),
    event_type = COALESCE(event_type, operation)
WHERE aggregate_type IS NULL;

-- 2. Extend `sync_inbox` for aggregate types and authority matrix conflict resolution
ALTER TABLE sync_inbox
    ADD COLUMN IF NOT EXISTS event_id VARCHAR(128),
    ADD COLUMN IF NOT EXISTS aggregate_type VARCHAR(64),
    ADD COLUMN IF NOT EXISTS aggregate_id VARCHAR(128),
    ADD COLUMN IF NOT EXISTS event_type VARCHAR(32),
    ADD COLUMN IF NOT EXISTS conflict_resolution VARCHAR(32);

ALTER TABLE sync_inbox ALTER COLUMN entity_id DROP NOT NULL;
ALTER TABLE sync_inbox ALTER COLUMN entity_type DROP NOT NULL;
ALTER TABLE sync_inbox ALTER COLUMN operation DROP NOT NULL;
ALTER TABLE sync_inbox ALTER COLUMN sequence_no DROP NOT NULL;
ALTER TABLE sync_inbox ALTER COLUMN sequence_no SET DEFAULT 0;

UPDATE sync_inbox
SET aggregate_type = COALESCE(aggregate_type, entity_type),
    aggregate_id = COALESCE(aggregate_id, entity_id::text),
    event_type = COALESCE(event_type, operation)
WHERE aggregate_type IS NULL;

-- 3. Extend `audit_logs` for offline sync tracking
ALTER TABLE audit_logs
    ADD COLUMN IF NOT EXISTS sync_status VARCHAR(16) NOT NULL DEFAULT 'PENDING',
    ADD COLUMN IF NOT EXISTS synced_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_audit_logs_sync_status ON audit_logs(sync_status, created_at)
WHERE sync_status = 'PENDING';
