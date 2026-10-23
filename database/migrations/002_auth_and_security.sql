-- ============================================================================
-- GebeyaOS - Database Schema Migration
-- Migration: 002_auth_and_security.sql
-- Phase 1: Authentication, Access Control, Lockout, and System Setup
-- ============================================================================

-- 1. Extend `users` table for lockout and password lifecycle
ALTER TABLE users 
    ADD COLUMN IF NOT EXISTS failed_login_attempts INT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS locked_until TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS force_password_change BOOLEAN NOT NULL DEFAULT FALSE;

-- 2. Create `refresh_tokens` table for JWT session rotation
CREATE TABLE IF NOT EXISTS refresh_tokens (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash VARCHAR(255) NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens(user_id, expires_at);

-- 3. Create `system_settings` table for setup wizard lock and store config
CREATE TABLE IF NOT EXISTS system_settings (
    key VARCHAR(64) PRIMARY KEY,
    value JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

-- 4. Seed Canonical 6 Roles and Granular Permissions
INSERT INTO permissions (id, module, description) VALUES
-- Cost & Pricing visibility
('catalog:cost:view', 'CATALOG', 'View product purchase cost and profit margins'),
('inventory:import:execute', 'INVENTORY', 'Perform bulk Excel/CSV stock imports and rollbacks'),
('admin:roles:manage', 'ADMIN', 'Edit role permissions and maximum discount limits'),
('reports:financial:view', 'REPORTS', 'Access financial income, expense, and tax liability statements')
ON CONFLICT (id) DO NOTHING;

-- Canonical Roles
INSERT INTO roles (id, name, description, is_system, max_discount_percentage) VALUES
('018e0000-0000-7000-8000-000000000001', 'OWNER', 'Store owner with full system sovereignty and user management', TRUE, 100.00),
('018e0000-0000-7000-8000-000000000002', 'BRANCH_MANAGER', 'Branch store manager with supervisor overrides', TRUE, 25.00),
('018e0000-0000-7000-8000-000000000003', 'CASHIER', 'POS register cashier with checkout and shift access', TRUE, 5.00),
('018e0000-0000-7000-8000-000000000004', 'STOREKEEPER', 'Warehouse & inventory receiving, stocktake, and write-offs', TRUE, 0.00),
('018e0000-0000-7000-8000-000000000005', 'ACCOUNTANT', 'Financial auditor for tax, cash book, and reports', TRUE, 0.00),
('018e0000-0000-7000-8000-000000000006', 'HQ_ADMIN', 'Central headquarters manager across multiple branches', TRUE, 50.00)
ON CONFLICT (id) DO UPDATE SET 
    name = EXCLUDED.name, 
    description = EXCLUDED.description,
    max_discount_percentage = EXCLUDED.max_discount_percentage;

-- Assign permissions for OWNER (All permissions)
INSERT INTO role_permissions (role_id, permission_id)
SELECT '018e0000-0000-7000-8000-000000000001', id FROM permissions
ON CONFLICT DO NOTHING;

-- Assign permissions for HQ_ADMIN
INSERT INTO role_permissions (role_id, permission_id)
SELECT '018e0000-0000-7000-8000-000000000006', id FROM permissions
ON CONFLICT DO NOTHING;

-- Assign permissions for BRANCH_MANAGER
INSERT INTO role_permissions (role_id, permission_id)
SELECT '018e0000-0000-7000-8000-000000000002', id FROM permissions
WHERE id NOT IN ('reports:consolidated:view', 'admin:roles:manage')
ON CONFLICT DO NOTHING;

-- Assign permissions for CASHIER
INSERT INTO role_permissions (role_id, permission_id)
SELECT '018e0000-0000-7000-8000-000000000003', id FROM permissions
WHERE id IN (
    'pos:shift:open', 'pos:shift:close', 'pos:sale:create',
    'pos:sale:hold', 'pos:sale:discount', 'pos:receipt:reprint',
    'pos:cash:movement', 'catalog:product:view'
)
ON CONFLICT DO NOTHING;

-- Assign permissions for STOREKEEPER
INSERT INTO role_permissions (role_id, permission_id)
SELECT '018e0000-0000-7000-8000-000000000004', id FROM permissions
WHERE id IN (
    'catalog:product:view', 'catalog:cost:view', 'inventory:stock:view',
    'inventory:adjust:create', 'inventory:stocktake:execute',
    'inventory:import:execute', 'purchasing:po:create', 'purchasing:grn:receive',
    'transfers:request', 'transfers:dispatch', 'transfers:receive'
)
ON CONFLICT DO NOTHING;

-- Assign permissions for ACCOUNTANT
INSERT INTO role_permissions (role_id, permission_id)
SELECT '018e0000-0000-7000-8000-000000000005', id FROM permissions
WHERE id IN (
    'catalog:product:view', 'catalog:cost:view', 'inventory:stock:view',
    'reports:branch:view', 'reports:consolidated:view', 'reports:financial:view'
)
ON CONFLICT DO NOTHING;
