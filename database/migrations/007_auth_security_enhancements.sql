-- ============================================================================
-- GebeyaOS - Database Schema Migration
-- Migration: 007_auth_security_enhancements.sql
-- Auth & Security: Enhanced Hashing, Tokens, TOTP 2FA, Audit & Rate Limiting
-- ============================================================================

-- 1. Extend `users` table
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS token_version INT NOT NULL DEFAULT 1,
    ADD COLUMN IF NOT EXISTS requires_totp BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS totp_secret_encrypted TEXT,
    ADD COLUMN IF NOT EXISTS pin_salt VARCHAR(64),
    ADD COLUMN IF NOT EXISTS pin_failed_attempts INT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS pin_locked_until TIMESTAMPTZ;

-- 2. Extend `platform_admins` table
ALTER TABLE platform_admins
    ADD COLUMN IF NOT EXISTS role VARCHAR(32) NOT NULL DEFAULT 'SUPER_ADMIN'
        CHECK (role IN ('SUPER_ADMIN', 'SUPPORT', 'BILLING')),
    ADD COLUMN IF NOT EXISTS totp_secret_encrypted TEXT,
    ADD COLUMN IF NOT EXISTS totp_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS backup_codes JSONB,
    ADD COLUMN IF NOT EXISTS ip_allowlist TEXT[],
    ADD COLUMN IF NOT EXISTS token_version INT NOT NULL DEFAULT 1,
    ADD COLUMN IF NOT EXISTS failed_login_attempts INT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS locked_until TIMESTAMPTZ;

-- 3. Create `platform_sessions` table for platform admin refresh token families
CREATE TABLE IF NOT EXISTS platform_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
    admin_id UUID NOT NULL REFERENCES platform_admins(id) ON DELETE CASCADE,
    family_id UUID NOT NULL DEFAULT uuid_generate_v7(),
    token_hash VARCHAR(255) NOT NULL,
    device_info VARCHAR(255),
    ip_address VARCHAR(45),
    user_agent TEXT,
    last_active_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

ALTER TABLE platform_sessions
    ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp();

CREATE INDEX IF NOT EXISTS idx_platform_sessions_admin ON platform_sessions(admin_id, expires_at);
CREATE INDEX IF NOT EXISTS idx_platform_sessions_family ON platform_sessions(family_id);
CREATE INDEX IF NOT EXISTS idx_platform_sessions_hash ON platform_sessions(token_hash);

-- 4. Extend `refresh_tokens` table for tenant token family rotation & device tracking
ALTER TABLE refresh_tokens
    ADD COLUMN IF NOT EXISTS family_id UUID NOT NULL DEFAULT uuid_generate_v7(),
    ADD COLUMN IF NOT EXISTS device_info VARCHAR(255),
    ADD COLUMN IF NOT EXISTS user_agent TEXT,
    ADD COLUMN IF NOT EXISTS ip_address VARCHAR(45);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_family ON refresh_tokens(family_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_hash ON refresh_tokens(token_hash);

-- 5. Create `password_resets` table (tenant scoped)
CREATE TABLE IF NOT EXISTS password_resets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    code_hash VARCHAR(255) NOT NULL,
    contact_type VARCHAR(16) NOT NULL CHECK (contact_type IN ('EMAIL', 'SMS')),
    contact_target VARCHAR(128) NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX IF NOT EXISTS idx_password_resets_tenant_user ON password_resets(tenant_id, user_id, expires_at);

-- Enable RLS on password_resets
ALTER TABLE password_resets ENABLE ROW LEVEL SECURITY;
ALTER TABLE password_resets FORCE ROW LEVEL SECURITY;

DO $$
BEGIN
    DROP POLICY IF EXISTS password_resets_tenant_isolation ON password_resets;
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'password_resets' AND policyname = 'tenant_isolation'
    ) THEN
        CREATE POLICY tenant_isolation ON password_resets
            FOR ALL
            USING (
                tenant_id = NULLIF(current_setting('app.current_tenant', TRUE), '')::UUID
            )
            WITH CHECK (
                tenant_id = NULLIF(current_setting('app.current_tenant', TRUE), '')::UUID
            );
    END IF;
END $$;

-- 6. Extend `terminals` table for device pairing & auto-lock
ALTER TABLE terminals
    ADD COLUMN IF NOT EXISTS device_token_hash VARCHAR(255),
    ADD COLUMN IF NOT EXISTS paired_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS paired_by UUID REFERENCES users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS auto_lock_minutes INT NOT NULL DEFAULT 3;

-- 7. Extend `audit_logs` and `platform_audit_logs`
ALTER TABLE audit_logs
    ADD COLUMN IF NOT EXISTS user_agent TEXT,
    ADD COLUMN IF NOT EXISTS result VARCHAR(32) NOT NULL DEFAULT 'SUCCESS';

ALTER TABLE platform_audit_logs
    ADD COLUMN IF NOT EXISTS user_agent TEXT,
    ADD COLUMN IF NOT EXISTS result VARCHAR(32) NOT NULL DEFAULT 'SUCCESS';
