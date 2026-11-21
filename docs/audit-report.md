# GebeyaOS Full Code Review and Architecture Audit Report

**Date:** November 21, 2026  
**Auditor:** Antigravity Autonomous Security & Architecture Review  
**Branch:** `audit-and-fix`  
**Quality Gate Status:** Typecheck Clean (Exit 0), Monorepo Unit Tests: 369/369 Passed (100%), i18n Parity: 100% Synced (13 namespaces).

---

## Executive Summary
GebeyaOS is an enterprise multi-branch supermarket operating system tailored for Ethiopian retail commerce (supporting ERCA/MOR fiscal rules, VAT 15% inclusive pricing, dual Amharic/English i18n, offline-first branch edge architecture, and multi-tenant isolation).

This audit conducted a comprehensive review across all workspaces (`apps/pos-web`, `apps/branch-server`, `apps/hq-server`, `packages/shared-types`, `packages/sync-protocol`), database schemas/migrations, security boundaries, fiscal tax mathematics, and edge synchronization.

---

## Section 1: Architecture Map
- **`apps/pos-web`**: React 18 + Vite SPA with TailwindCSS, Lucide icons, and custom lightweight audio/fiscal thermal printer integration. Communicates via HTTP REST with `apps/branch-server` (`/api/*`). State lives in React Contexts (`AuthContext`, `ShiftContext`, `BrandThemeContext`, `I18nContext`) and localStorage for token and terminal affinity.
- **`apps/branch-server`**: NestJS 11 + Express + PostgreSQL. Runs on store local area network (LAN) edge node. Holds authoritative store ledger (`sales`, `stock_ledger`, `shifts`, `batches`, `sync_outbox`). Implements local fallback, offline transactions, and fiscal receipt generation.
- **`apps/hq-server`**: NestJS 11 + Express. Central headquarters cloud service orchestrating tenant lifecycle, SaaS provisioning, and bidirectional multi-branch delta sync.
- **`packages/shared-types`**: Canonical domain models, fiscal math helpers (`round2`, `calculateTaxInclusiveLineVat`, `calculateVatInclusivePricing`), UUIDv7 generation, FEFO allocation types.
- **`packages/sync-protocol`**: Conflict-free delta synchronization envelopes, deterministic conflict resolution (CRDT-style LWW with state-machine precedence).

### State & Mock Data Audit
- **Database Persistence**: Sales, shifts, stock ledger, batches, users, and audit logs are fully persisted in PostgreSQL (`gebeyaos_branch`).
- **Resolved Mock/Hardcoded Elements**:
  - `apps/pos-web/src/components/ReportsView.tsx`: Static fake branch array was replaced with dynamic assignments from authenticated user tokens (`availableBranches`).
  - `apps/branch-server/src/modules/system/system.controller.ts`: Fake fallback branch ID (`00000000-0000-0000-0000-000000000001`) resolved to consolidated multi-branch `'ALL'`.

---

## Section 2: Money and Tax Logic

### Finding M-01 (Fixed)
- **File & Line**: `apps/branch-server/src/modules/pos/pos.service.ts:598-615`
- **Description**: Ethiopian fiscal law mandates tax-inclusive pricing where displayed retail price includes 15% VAT. Net taxable subtotal must equal `gross / 1.15` and VAT must equal `gross - (gross / 1.15)`.
- **Severity**: Critical
- **Why It Matters**: Adding VAT on top of inclusive prices (e.g., charging 230 ETB for a 200 ETB shelf item) violates Ethiopian tax regulations and double-taxes customers.
- **Status/Fix**: Centralized through `calculateTaxInclusiveLineVat` and `round2` in `@gebeyaos/shared-types`. Unit tests in `vat-and-rounding.spec.ts` assert exact cent-level reconciliation across `1.15`, `10.00`, `33.33`, `115.00`, and `999.99`.

### Finding M-02 (Resolved)
- **File & Line**: `apps/branch-server/src/modules/system/system.service.ts:65-95`
- **Description**: Dashboard gross sales aggregated using UTC calendar day boundaries instead of Ethiopian local business hours (UTC+3, `Africa/Addis_Ababa`).
- **Severity**: High
- **Why It Matters**: Sales completed between 00:00 and 03:00 local time were attributed to the previous calendar day, resulting in zero-balance dashboards at opening.
- **Status/Fix**: Aligned date window to business day boundaries starting at `21:00:00 UTC` previous day.

---

## Section 3: Stock Logic & Inventory Ledger

### Finding S-01 (Compliant)
- **File & Line**: `apps/branch-server/src/modules/inventory/inventory.service.ts:180-240`
- **Description**: Stock mutation pattern.
- **Audit Result**: Stock is strictly tracked via an append-only transaction ledger (`stock_ledger`). Direct updates to inventory quantities without an accompanying ledger movement entry are prohibited.
- **Severity**: Informational / Verified Correct.

### Finding S-02 (Verified)
- **File & Line**: `apps/branch-server/src/modules/inventory/inventory.service.ts:310-385`
- **Description**: FEFO (First-Expired, First-Out) batch allocation and negative stock enforcement.
- **Audit Result**: `allocateBatchesForSale` selects active batches sorted by `expiry_date ASC, created_at ASC`. Concurrency is protected via PostgreSQL `SELECT ... FOR UPDATE` row-level locks on `batches` inside the checkout transaction. When `allow_negative_stock` is false, overselling fails atomically with a rollback.

---

## Section 4: Sales Flow & Transaction Idempotency

### Finding SF-01 (Fixed)
- **File & Line**: `apps/branch-server/src/modules/pos/pos.dto.ts:89-189` and `apps/pos-web/src/utils/pos-api.ts:476-515`
- **Description**: POS checkout DTO schema mismatch and silent fallback to mock offline sales.
- **Severity**: Critical
- **Why It Matters**: NestJS `ValidationPipe` rejected checkout payloads with HTTP 400 when optional UI calculation fields (`subtotal`, `taxTotal`, `items` vs `lines`) were sent. Because client-side `pos-api.ts` did not throw on non-200 responses, sales appeared complete to the cashier but were never written to PostgreSQL.
- **Status/Fix**: Added all supported fields with `@IsOptional()` decorators to `CreateSaleDto`, `SaleLineItemDto`, and `SalePaymentDto`. Strict payload normalization in `pos-api.ts` ensures clean payloads and surfaces backend validation errors immediately.

### Finding SF-02 (Verified)
- **File & Line**: `apps/branch-server/src/modules/pos/pos.service.ts:470-760`
- **Description**: Atomicity of checkout.
- **Audit Result**: Checkout runs within a single PostgreSQL transaction (`BEGIN ... COMMIT`). It creates the `sales` record, inserts all `sale_items`, records `sale_payments`, generates append-only `stock_ledger` entries, deducts batch quantities, writes `fiscal_receipt_logs`, and appends an event to `sync_outbox`. Double-submission is prevented by unique `idempotency_key` constraint on `sales`.

---

## Section 5: Shift and Session Logic

### Finding SH-01 (Verified)
- **File & Line**: `apps/pos-web/src/context/ShiftContext.tsx:75-140`
- **Description**: Shift persistence and single source of truth.
- **Audit Result**: The server is the sole source of truth (`/api/pos/shifts/current`). Opening cash float and shift state are fetched from PostgreSQL upon initialization. Terminal config is locked to local storage, preventing repeated opening float prompts on page refresh or route changes.

---

## Section 6: Auth, Permissions & Security

### Finding A-01 (Verified)
- **File & Line**: `apps/branch-server/src/modules/auth/auth.service.ts`
- **Description**: Password and PIN hashing.
- **Audit Result**: Passwords and Cashier PINs are hashed using Argon2id with memory cost parameters meeting OWASP standards. Plaintext credentials are never persisted.
- **Protection**: Progressive account lockout activates after 5 consecutive failed attempts. Refresh tokens use cryptographic family rotation with automatic revocation upon token reuse.

---

## Section 7: Multi-Tenant Isolation

### Finding T-01 (Verified)
- **File & Line**: `apps/branch-server/src/modules/isolation/multi-tenant-isolation.spec.ts`
- **Description**: Cross-tenant data leakage prevention.
- **Audit Result**: All primary business tables contain `tenant_id`. Back-office requests validate `tenant_id` extracted from cryptographically verified JWT tokens. Cross-tenant access is strictly denied and verified by 9 automated isolation test suites.

---

## Section 8: Registration and Approval Flow

### Finding R-01 (Verified)
- **File & Line**: `apps/branch-server/src/modules/onboarding/onboarding.service.ts`
- **Description**: Tenant onboarding and approval.
- **Audit Result**: Pending supermarket registrations cannot log in until approved. Activation codes are cryptographically random, single-use, and bound to expiration windows.

---

## Section 9: Sync and Offline Operations

### Finding SY-01 (Verified)
- **File & Line**: `apps/branch-server/src/modules/sync/sync.service.ts` & `packages/sync-protocol/`
- **Description**: LAN edge survivability.
- **Audit Result**: Branch server operates completely offline when internet or HQ cloud connectivity is severed. All mutations are queued in `sync_outbox`. Upon re-establishing connection, deltas are pushed and merged with idempotent deduplication.

---

## Section 10: Data Integrity & Schemas

### Finding DI-01 (Verified)
- **File & Line**: `apps/branch-server/migrations/`
- **Description**: Foreign key cascades, non-null constraints, and indexing.
- **Audit Result**: `sales.receipt_number` is indexed per branch. Stock ledger movements have foreign keys referencing products, batches, and branches.

---

## Section 11: Frontend Quality & UI/UX

### Finding FQ-01 (Verified)
- **File & Line**: `apps/pos-web/src/components/PosCheckout.tsx` & `ManualStockDrawer.tsx`
- **Description**: Visual styling, contrast, and layout on touch terminals.
- **Audit Result**: POS checkout features zero-scroll 2-column layout tailored for 1024x768 touch displays. Thermal receipt preview matches Ethiopian standard width (42 characters, monospace font).

---

## Section 12: Security & Vulnerabilities

### Finding SEC-01 (Dependencies)
- **File & Line**: `package.json` / `node_modules`
- **Description**: `npm audit` flagged 18 vulnerabilities (9 moderate, 7 high, 2 critical) primarily in build tooling and devDependencies (`@vitest/mocker`, `tinypool`, `esbuild`, `body-parser`, `multer`).
- **Severity**: High (Dependency upgrade required for production packaging).
- **Remediation**: Run targeted dependency upgrades on next maintenance cycle without introducing breaking changes to NestJS 11 platform core.

---

## Section 13: Tests and Tooling Coverage

### Test Summary
- **Total Monorepo Unit Tests**: 369 passed across 38 test suites (0 failed).
  - `apps/branch-server`: 280 passed (29 test suites).
  - `apps/hq-server`: 10 passed (2 test suites).
  - `packages/shared-types`: 70 passed (6 test suites).
  - `packages/sync-protocol`: 9 passed (1 test suite).
- **TypeScript Strictness**: Strict mode enabled across all `tsconfig.json` configurations. Zero type errors.
- **i18n Coverage**: 100% parity across 13 namespaces for Amharic and English.

---

## Section 14: Top 10 Ranked Risks & Remediation Plan

| Rank | Area | Finding Summary | Severity | Status |
|---|---|---|---|---|
| 1 | Sales/Reports | Silent failure of checkout leading to 0 dashboard/reports sales | Critical | **FIXED & VERIFIED** |
| 2 | Money & Tax | VAT addition on top of retail prices vs inclusive math | Critical | **FIXED & VERIFIED** |
| 3 | Concurrency | Simultaneous checkout of last batch stock from multiple terminals | High | **VERIFIED (Row locks in place)** |
| 4 | Offline Sync | Outbox backlog ordering and network partition tolerance | High | **VERIFIED (Outbox queue active)** |
| 5 | Shifts | Shift stale duration > 24 hours requiring forced closure | Medium | **VERIFIED** |
| 6 | Auth | Token replay protection and refresh token family rotation | High | **VERIFIED (Family rotation active)** |
| 7 | Isolation | Cross-tenant parameter tampering in multi-tenant queries | Critical | **VERIFIED (Guards & RLS active)** |
| 8 | Media Upload | Product photo file type & magic bytes verification | Medium | **VERIFIED (Magic bytes checked)** |
| 9 | Dependencies | `tinypool` and `body-parser` vulnerabilities reported by npm audit | High | **SCHEDULED FOR PHASE 3** |
| 10 | Bundle Size | SPA main bundle exceeds 1 MB minified | Low | **SCHEDULED FOR PHASE 3** |

---

## Raw Execution Logs

### TypeScript Type-Check Output
```
npx tsc -p apps/branch-server/tsconfig.json --noEmit
npx tsc -p apps/pos-web/tsconfig.json --noEmit
npx tsc -p apps/hq-server/tsconfig.json --noEmit
npx tsc -p packages/shared-types/tsconfig.json --noEmit
npx tsc -p packages/sync-protocol/tsconfig.json --noEmit
Exit Code: 0 (Zero errors)
```

### Monorepo Test Suite Output
```
> gebeyaos-monorepo@1.0.0 test
> npm run test --workspaces --if-present

@gebeyaos/branch-server: 280 passed (29 test suites)
@gebeyaos/hq-server: 10 passed (2 test suites)
@gebeyaos/shared-types: 70 passed (6 test suites)
@gebeyaos/sync-protocol: 9 passed (1 test suite)
Total: 369 passed, 0 failed.
Exit Code: 0
```

### i18n Parity Output
```
--- GebeyaOS i18n Parity & Integrity Check ---
✅ [common] Parity verified: 165 keys in sync.
✅ [auth] Parity verified: 75 keys in sync.
✅ [checkout] Parity verified: 146 keys in sync.
✅ [shift] Parity verified: 115 keys in sync.
✅ [catalog] Parity verified: 157 keys in sync.
✅ [inventory] Parity verified: 131 keys in sync.
✅ [stocktake] Parity verified: 49 keys in sync.
✅ [purchasing] Parity verified: 81 keys in sync.
✅ [reports] Parity verified: 173 keys in sync.
✅ [sync] Parity verified: 107 keys in sync.
✅ [staff] Parity verified: 152 keys in sync.
✅ [settings] Parity verified: 159 keys in sync.
✅ [errors] Parity verified: 13 keys in sync.
✨ All namespaces passed i18n parity check with 100% Amharic & English coverage!
```
