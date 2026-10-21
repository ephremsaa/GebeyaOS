# GebeyaOS Database Schema Documentation

## 1. Overview & Principles
- **Engine**: PostgreSQL 16
- **Dialect Consistency**: Exactly identical schema on Branch Local Server and Central HQ Server.
- **Primary Keys**: Monotonically increasing **UUIDv7** using a native PostgreSQL PL/pgSQL function (`uuid_generate_v7()`). Ensures temporal clustering, high B-tree cache locality, and zero key collision across offline branches.
- **Tenancy Boundary**: Every transactional record explicitly carries `branch_id UUID NOT NULL REFERENCES branches(id)`.
- **Financial Precision**: All currency amounts use `NUMERIC(14, 4)` to eliminate floating-point discrepancies. All quantities use `NUMERIC(14, 3)` to support fractional weights (e.g., 1.425 kg).
- **Audit Immutability**: Stock ledger, sales, payments, refunds, and price logs are strictly append-only. There are no destructive `UPDATE` or `DELETE` operations on transactional rows.

---

## 2. Table Catalog

### 2.1 Core Tenancy & Hardware
- `branches`: Physical store branches and HQ. Stores TIN, VAT certificate, contact, and JSONB store policy settings (`allow_negative_stock`, `scale_barcode_prefix`, `default_vat_rate`).
- `terminals`: Hardware registers (POS lanes, back-office, handhelds), paired with their receipt printers (`ESC_POS`, `FISCAL_SERIAL`). Enforces uniqueness on `(branch_id, code)`.

### 2.2 Auth & Role-Based Access Control (RBAC)
- `permissions`: Fine-grained permission strings (`pos:sale:create`, `inventory:adjust:approve`, etc.).
- `roles`: Role definitions (`SUPER_ADMIN`, `BRANCH_MANAGER`, `CASHIER`, `INVENTORY_CLERK`) with `max_discount_percentage` limit.
- `role_permissions`: Many-to-many junction table.
- `users`: Staff credentials. Passwords hashed with Argon2id/bcrypt; 4-6 digit quick PIN hash for terminal lock/unlock.
- `user_branch_assignments`: Restricts staff to specific branches or allows multi-branch access.
- `audit_logs`: Centralized audit trail for sensitive actions (price overrides, adjustments, logins).

### 2.3 Products, Catalog & Pricing
- `categories`: Hierarchical category tree with English and Amharic names.
- `units_of_measure`: Standard units (`KG`, `G`, `L`, `ML`, `PCS`, `PACK`, `BOX`, `BUNDLE`) with fractional quantity flag.
- `products`: Product master record with SKU, bilingual names, UOM, base selling price, tax applicability (15% VAT), weighed scale PLU, and stock alert levels.
- `product_barcodes`: Multiple barcodes per product (individual item, shrink-wrap pack, carton box) with `pack_multiplier`.
- `branch_product_overrides`: Enables branch-specific pricing and localized VAT rates/exemptions without polluting the master catalog.
- `price_change_logs`: Immutable history of price adjustments with user ID and mandatory reason.

### 2.4 Inventory, Batches & Append-Only Ledger
- `batches`: Per-branch product batches tracking batch number, expiration date, purchase unit cost, initial quantity, and current remaining quantity. Indexed by `(branch_id, product_id, expiry_date ASC)` for **FEFO** allocation.
- `stock_ledger`: The single source of truth for stock levels. Every change is an append-only row (`SALE`, `PURCHASE_RECEIVE`, `TRANSFER_OUT`, `TRANSFER_IN`, `ADJUSTMENT`, etc.) tracking `quantity_change`, `unit_cost`, and resulting `balance_after`.
- `stock_adjustments` & `stock_adjustment_items`: Formal inventory adjustments with mandatory reason codes (`DAMAGED_GOODS`, `EXPIRED`, `CORRECTION`, `THEFT`) and approval workflow.
- `stock_takes` & `stock_take_items`: Physical inventory count tracking with auto-computed variance.

### 2.5 Purchasing & Suppliers
- `suppliers`: Supplier directory with Ethiopian TIN and payment terms.
- `purchase_orders` & `purchase_order_items`: PO lifecycle tracking (`DRAFT`, `ISSUED`, `PARTIALLY_RECEIVED`, `COMPLETED`).
- `goods_received_notes` & `grn_items`: GRN receiving documentation. Automatically generates new batch rows and calculates **apportioned landed costs** (freight, duties) to establish true unit cost.

### 2.6 Inter-Branch Transfers
- `transfers` & `transfer_items`: Inter-branch stock movement lifecycle: `REQUESTED` &rarr; `APPROVED` &rarr; `DISPATCHED` (deducted from source) &rarr; `IN_TRANSIT` &rarr; `RECEIVED` (added to destination). Discrepancy quantities are auto-computed and flagged.

### 2.7 POS, Shifts & Fiscal Sales
- `shifts`: Cashier register sessions. Tracks opening float, system-calculated expected cash, physical closing counted cash, and variance.
- `cash_movements`: Shift cash-in, petty cash disbursements, and safe drops with manager authorization.
- `sales`: Completed sales tickets. Offline-safe receipt number (`{BRANCH}-{TERM}-{YYYYMMDD}-{SHIFT}-{SEQ}`). Subtotal, VAT breakdowns, discount totals, payment status, reprint count, and client vs server timestamps.
- `sale_items`: Snapshot of items sold, prices, applied discounts, VAT amounts, and unit costs for real-time margin reporting.
- `sale_payments`: Split payments across multiple tenders (`CASH`, `TELEBIRR`, `CBE_BIRR`, `CARD_POS`, `BANK_TRANSFER`) with transaction references and offline verification flags.
- `sale_refunds` & `sale_refund_items`: Manager-authorized return records with inventory return toggle.
- `fiscal_receipt_logs`: MOR/ERCA Electronic Journal (EJ) payload logs, fiscal signature records, and daily Z-counters.

### 2.8 Expenses & Cash Management
- `expense_categories`: Branch expense taxonomy (Utilities, Packaging, Transport, Maintenance, Petty Cash).
- `expenses`: Direct branch operating expenditures deducted from cash drawer or bank.

### 2.9 Synchronization Layer
- `sync_outbox`: Append-only transactional event queue on branch servers. Monotonic `sequence_no` (`BIGSERIAL`), UUIDv7 ID, idempotency keys, and JSONB entity payloads.
- `sync_inbox`: Deduplication and ingestion queue on Central HQ server.
- `sync_checkpoints`: Tracks high-water mark sequence numbers per stream.
- `sync_conflict_logs`: Logs and flags edge-case data conflicts for audit.

---

## 3. High-Performance Indexing Strategy
1. **Barcode Scanning (< 5ms)**: `idx_product_barcodes_lookup` on `product_barcodes(barcode)` guarantees sub-millisecond barcode resolution.
2. **FEFO Batch Picking**: `idx_batches_fefo` on `batches(branch_id, product_id, expiry_date ASC, created_at ASC) WHERE current_quantity > 0` instantly retrieves the next expiring batch for sale item allocation.
3. **Stock Balances**: `idx_stock_ledger_branch_prod` on `stock_ledger(branch_id, product_id, created_at DESC)` allows instantaneous balance lookups.
4. **Sync Drain**: `idx_sync_outbox_pending` on `sync_outbox(branch_id, status, sequence_no) WHERE status = 'PENDING'` provides index-only scans for background replication workers.
5. **Deduplication**: `idx_sync_inbox_dedup` on `sync_inbox(idempotency_key)` guarantees zero duplicate event processing.
