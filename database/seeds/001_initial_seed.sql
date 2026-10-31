-- ============================================================================
-- GebeyaOS - Initial Seed Data
-- Seed: 001_initial_seed.sql
-- ============================================================================

-- 1. UNITS OF MEASURE
INSERT INTO units_of_measure (code, name_en, name_am, allow_fractions) VALUES
('PCS', 'Pieces', 'ፍሬ', FALSE),
('KG', 'Kilograms', 'ኪሎ ግራም', TRUE),
('G', 'Grams', 'ግራም', TRUE),
('L', 'Liters', 'ሊትር', TRUE),
('ML', 'Milliliters', 'ሚሊ ሊትር', TRUE),
('PACK', 'Pack', 'ፓኬት', FALSE),
('BOX', 'Box / Carton', 'ካርቶን', FALSE),
('BUNDLE', 'Bundle', 'እስር', FALSE)
ON CONFLICT (code) DO NOTHING;

-- 2. PERMISSIONS
INSERT INTO permissions (id, module, description) VALUES
-- POS & Cashier
('pos:shift:open', 'POS', 'Open a register shift with opening cash float'),
('pos:shift:close', 'POS', 'Close register shift and perform cash reconciliation'),
('pos:sale:create', 'POS', 'Process checkout sales and tender payments'),
('pos:sale:hold', 'POS', 'Hold and resume active customer carts'),
('pos:sale:discount', 'POS', 'Apply item or transaction level discounts'),
('pos:sale:refund', 'POS', 'Authorize and process customer returns and refunds'),
('pos:receipt:reprint', 'POS', 'Reprint customer receipts with audit logging'),
('pos:cash:movement', 'POS', 'Perform cash-in, safe drops, and petty cash out'),

-- Products & Catalog
('catalog:product:view', 'CATALOG', 'View product catalog and prices'),
('catalog:product:create', 'CATALOG', 'Create new products in catalog'),
('catalog:product:edit', 'CATALOG', 'Edit product metadata and master prices'),
('catalog:price:override', 'CATALOG', 'Set branch-specific price and tax overrides'),

-- Inventory
('inventory:stock:view', 'INVENTORY', 'View stock balances and batch expiry'),
('inventory:adjust:create', 'INVENTORY', 'Create stock adjustments and write-offs'),
('inventory:adjust:approve', 'INVENTORY', 'Approve stock adjustments'),
('inventory:stocktake:execute', 'INVENTORY', 'Conduct physical stock count'),
('inventory:stocktake:reconcile', 'INVENTORY', 'Reconcile stock take and post variances'),

-- Purchasing & Transfers
('purchasing:po:create', 'PURCHASING', 'Create and issue purchase orders'),
('purchasing:grn:receive', 'PURCHASING', 'Receive goods (GRN) and log landed costs'),
('transfers:request', 'TRANSFERS', 'Request stock transfer between branches'),
('transfers:dispatch', 'TRANSFERS', 'Dispatch stock transfer from source branch'),
('transfers:receive', 'TRANSFERS', 'Receive and verify stock transfer at destination'),

-- Reports & Management
('reports:branch:view', 'REPORTS', 'View branch sales, stock valuation, and cash reports'),
('reports:consolidated:view', 'REPORTS', 'View multi-branch consolidated HQ reports'),
('admin:users:manage', 'ADMIN', 'Manage staff users, branch assignments, and roles'),
('admin:settings:manage', 'ADMIN', 'Manage system, tax, and hardware settings')
ON CONFLICT (id) DO NOTHING;

-- 3. DEFAULT ROLES
INSERT INTO roles (id, name, description, is_system, max_discount_percentage) VALUES
('018e0000-0000-7000-8000-000000000001', 'SUPER_ADMIN', 'Central system administrator with full access', TRUE, 100.00),
('018e0000-0000-7000-8000-000000000002', 'BRANCH_MANAGER', 'Branch store manager with supervisor overrides', TRUE, 20.00),
('018e0000-0000-7000-8000-000000000003', 'CASHIER', 'POS lane cashier with shift and checkout access', TRUE, 5.00),
('018e0000-0000-7000-8000-000000000004', 'INVENTORY_CLERK', 'Back-office stock keeper for GRN, counts, and transfers', TRUE, 0.00)
ON CONFLICT (id) DO NOTHING;

-- Assign all permissions to SUPER_ADMIN
INSERT INTO role_permissions (role_id, permission_id)
SELECT '018e0000-0000-7000-8000-000000000001', id FROM permissions
ON CONFLICT DO NOTHING;

-- Assign branch manager permissions
INSERT INTO role_permissions (role_id, permission_id)
SELECT '018e0000-0000-7000-8000-000000000002', id FROM permissions
WHERE id NOT IN ('reports:consolidated:view', 'admin:users:manage')
ON CONFLICT DO NOTHING;

-- Assign cashier permissions
INSERT INTO role_permissions (role_id, permission_id)
SELECT '018e0000-0000-7000-8000-000000000003', id FROM permissions
WHERE id IN (
    'pos:shift:open', 'pos:shift:close', 'pos:sale:create', 
    'pos:sale:hold', 'pos:sale:discount', 'pos:receipt:reprint', 
    'pos:cash:movement', 'catalog:product:view'
)
ON CONFLICT DO NOTHING;

-- Assign inventory clerk permissions
INSERT INTO role_permissions (role_id, permission_id)
SELECT '018e0000-0000-7000-8000-000000000004', id FROM permissions
WHERE id IN (
    'catalog:product:view', 'inventory:stock:view', 'inventory:adjust:create',
    'inventory:stocktake:execute', 'purchasing:po:create', 'purchasing:grn:receive',
    'transfers:request', 'transfers:dispatch', 'transfers:receive'
)
ON CONFLICT DO NOTHING;

-- 4. EXPENSE CATEGORIES
INSERT INTO expense_categories (id, code, name_en, name_am) VALUES
('018e0000-0000-7000-8000-000000000061', 'UTILITIES', 'Electricity & Water', 'መብራት እና ውሃ'),
('018e0000-0000-7000-8000-000000000062', 'PACKAGING', 'Plastic Bags & Receipt Paper', 'ማሸጊያ ፌስታል እና ወረቀት'),
('018e0000-0000-7000-8000-000000000063', 'TRANSPORT', 'Freight & Local Transport', 'ትራንስፖርት እና ጭነት'),
('018e0000-0000-7000-8000-000000000064', 'MAINTENANCE', 'Equipment & Generator Maintenance', 'ጥገና እና ጄኔሬተር ነዳጅ'),
('018e0000-0000-7000-8000-000000000065', 'PETTY_CASH', 'General Petty Cash / Miscellaneous', 'ጥቃቅን ወጪዎች')
ON CONFLICT (id) DO NOTHING;
