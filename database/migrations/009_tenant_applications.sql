-- Migration 009: Tenant Applications (Public Supermarket Registration & Approval Flow)
CREATE TABLE IF NOT EXISTS tenant_applications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    supermarket_name VARCHAR(255) NOT NULL,
    owner_full_name VARCHAR(255) NOT NULL,
    phone VARCHAR(50) NOT NULL,
    email VARCHAR(255) NOT NULL,
    city VARCHAR(100) NOT NULL,
    address TEXT,
    notes TEXT,
    status VARCHAR(50) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
    rejection_reason TEXT,
    approved_by UUID REFERENCES platform_admins(id) ON DELETE SET NULL,
    approved_at TIMESTAMPTZ,
    tenant_id UUID REFERENCES tenants(id) ON DELETE SET NULL,
    invite_token VARCHAR(255),
    ip_address VARCHAR(100),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_tenant_applications_status ON tenant_applications(status);
CREATE INDEX IF NOT EXISTS idx_tenant_applications_created ON tenant_applications(created_at DESC);

-- Update v_rls_coverage view to exclude platform-level tenant_applications table
CREATE OR REPLACE VIEW v_rls_coverage AS
SELECT
    c.relname                                            AS table_name,
    c.relrowsecurity                                     AS rls_enabled,
    c.relforcerowsecurity                                AS rls_forced,
    (SELECT count(*) FROM pg_policies p
      WHERE p.tablename = c.relname AND p.policyname = 'tenant_isolation')::int AS isolation_policy_count
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
  AND c.relname NOT IN ('platform_audit_logs', 'tenant_support_access', 'tenant_invite_links', 'tenant_applications')
  AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = c.relname
      AND column_name = 'tenant_id'
      AND table_schema = 'public'
  )
ORDER BY c.relname;
