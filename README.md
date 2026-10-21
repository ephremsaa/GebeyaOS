# GebeyaOS (ገበያ OS)
**Production-Grade, Local-Server-First Multi-Branch Supermarket Management System**
*Engineered specifically for the Ethiopian retail market.*

---

## 1. Core Principles

- **Local-Server-First**: Each supermarket branch operates a dedicated local server on an isolated LAN. All POS terminals, barcode scanners, deli scales, and receipt printers communicate solely with this local server.
- **Zero Internet Selling Dependency**: If the internet is severed or Central HQ is down for days or weeks, branch operations (checkout, receiving goods, stock takes, shift closing, and offline-safe receipt printing) continue 100% uninterrupted.
- **Power Cut & ACID Durability**: PostgreSQL 16 write-ahead logging (WAL) with `fsync=on` backed by line-interactive UPS hardware guarantees that unexpected load-shedding power loss never corrupts the database or produces orphaned transactions.
- **Strictly Append-Only Auditability**: Sales, refunds, price changes, and stock movements are immutable. The system never mutates historical inventory counters; every physical change is an append-only row in the `stock_ledger`.
- **Ethiopian Localization**:
  - Currency: Ethiopian Birr (ETB) with 4-decimal precision.
  - Tax: 15% VAT (retail tax-inclusive standard) with support for VAT-exempt goods and branch-level tax overrides.
  - Electronic Fiscal Device (EFD) / MOR (ERCA) Abstract Receipt Adapter generating compliant Electronic Journal (EJ) logs.
  - Pluggable Payments: Cash (zero connectivity), Telebirr (offline SMS verification / online API), CBE Birr, and Card POS slips.
  - Produce & Butcher Scales: Embedded EAN-13 weight barcodes (`20-PLU-WEIGHT-C`) and price barcodes.

---

## 2. System Architecture

```
                    Central HQ (Cloud VPS / Data Center)
                  ┌─────────────────────────────────────┐
                  │    Consolidated PostgreSQL 16       │
                  │    HQ Synchronization & Analytics   │
                  └──────────────────┬──────────────────┘
                                     │ Resumable Batch Sync (HTTPS)
       ┌─────────────────────────────┴─────────────────────────────┐
       ▼                                                           ▼
 Branch 1 (Bole Branch LAN)                                  Branch N (Local LAN)
┌──────────────────────────────────────┐                   ┌───────────────────────┐
│ Primary Server PC (Docker Compose)   │                   │ Primary Server PC     │
│  - PostgreSQL 16 (WAL durability)    │                   │  - PostgreSQL 16      │
│  - NestJS Branch Server (API & Auth) │                   │  - NestJS Server      │
│  - Outbox / Inbox Sync Agent         │                   │  - Sync Agent         │
│  - Automated Local Backup Daemon     │                   └───────────┬───────────┘
└──────────────────┬───────────────────┘                               │
                   │ Isolated Gigabit LAN                              │
    ┌──────────────┼──────────────┬──────────────┐                     │
    ▼              ▼              ▼              ▼                     ▼
POS Lane 1    POS Lane 2    Back-Office    Deli Scale            POS Terminals
(Thermal ESC) (Thermal ESC)  (Stock Clerk)  (EAN-13 Label)
```

---

## 3. Technology Stack

| Layer | Technology | Justification |
| :--- | :--- | :--- |
| **Branch DB** | **PostgreSQL 16** | Identical dialect to Central HQ, native multi-terminal concurrency (eliminating `SQLITE_BUSY` locks during checkout rush), streaming replication, and JSONB outbox. |
| **Backend API** | **NestJS + TypeScript** | Clean architecture, enterprise dependency injection, strict DTO validation (`class-validator`), and modular boundaries. |
| **Primary Keys** | **UUIDv7** | RFC 9562 time-ordered, collision-free primary keys across offline branches with high B-tree index cache locality. |
| **Containerization** | **Docker Compose** | One-command installation and restoration by non-expert IT technicians. |
| **Test Runner** | **Vitest** | Sub-second test execution across all 16 test suites. |

---

## 4. Module Directory

1. **Products & Pricing (`src/modules/products`)**:
   - Central catalog with bilingual names (English + Amharic).
   - Multiple barcodes per product with pack conversion multipliers (e.g., cartons of 24).
   - Scale-embedded barcode parser (EAN-13 with `20`/`02` prefix for weighed butcher/produce items).
   - Ethiopian 15% tax-inclusive VAT and branch-level price overrides.
   - Price change history audit log (`price_change_logs`) with mandatory justification.
2. **Inventory (`src/modules/inventory`)**:
   - Fundamental append-only `stock_ledger`.
   - First-Expired, First-Out (**FEFO**) batch allocation for perishables.
   - Formal stock write-offs and adjustments with mandatory reason codes (`DAMAGED_GOODS`, `EXPIRED`, `CORRECTION`, `THEFT`).
   - Physical inventory stock count and variance reconciliation.
3. **POS & Cashier (`src/modules/pos`)**:
   - POS lane checkout with offline-safe receipt numbering: `{BRANCH}-{TERM}-{YYYYMMDD}-{SHIFT}-{SEQ}`.
   - Pluggable payment adapters (Cash, Telebirr, CBE Birr, Card POS) supporting split tenders.
   - Shift opening/closing with expected cash drawer reconciliation and variance auditing.
   - Cashier role discount limits (`max_discount_percentage`).
   - Manager-authorized returns and refunds.
   - Abstract fiscal printing adapter generating ESC/POS thermal receipts and MOR Electronic Journal payloads.
4. **Purchasing & Costing (`src/modules/purchasing`)**:
   - Suppliers directory with Ethiopian TIN.
   - Purchase orders (POs) and Goods Received Notes (GRNs) with partial receiving.
   - Landed-cost freight and handling apportionment by value.
   - Dynamic **Weighted Average Costing (AVCO)** recalculation on every receipt.
   - Ethiopian 2% Withholding Tax calculation for purchases $\ge 10,000\text{ ETB}$.
5. **Inter-Branch Transfers (`src/modules/transfers`)**:
   - Complete transfer state machine: `REQUESTED` &rarr; `APPROVED` &rarr; `IN_TRANSIT` &rarr; `RECEIVED` / `DISCREPANCY`.
   - Dual-branch ledger updates: `TRANSFER_OUT` at source; `TRANSFER_IN` at destination.
   - Short-shipment and transport damage discrepancy logging.
6. **Synchronization Engine (`src/modules/sync`)**:
   - Transactional Outbox pattern with monotonic sequence numbers.
   - Central HQ ingestion with safe deduplication via unique `idempotency_key`.
   - Authority Matrix: Branch is authoritative for sales/stock; HQ is authoritative for catalog/users (`HQ_WINS`).
   - Resumable batch cursor sync with exponential backoff and jitter after extended outages.
7. **Reports & Analytics (`src/modules/reports`)**:
   - Branch offline sales summaries and payment breakdowns.
   - Real-time gross profit and margin analytics (Revenue vs actual snapshot COGS).
   - Stock valuation at Weighted Average Cost vs potential retail revenue.
   - Cashier performance and drawer variance audit reports.
   - Central HQ multi-branch consolidated dashboard with **Live Freshness Indicators** (`LIVE`, `DELAYED`, `STALE`, `OFFLINE`).
   - CSV / Excel export engine.

---

## 5. Quick Start & Development

### Prerequisites
- Node.js v20+ or v24
- PostgreSQL 16 (or Docker Desktop)

### Running the Test Suite
```bash
cd backend
npm install
npm test
```
*Current test suite: 62 automated unit and integration tests passing with 0 failures.*

### Building the Server
```bash
cd backend
npm run build
```

---

## 6. Production Deployment

### Branch Server Installation (Docker Compose)
1. Copy the repository to the primary branch PC.
2. Configure `.env` with branch credentials:
   ```env
   BRANCH_CODE=BOLE-01
   DB_NAME=gebeyaos_branch
   DB_USER=postgres
   DB_PASSWORD=SecurePassword123
   HQ_SYNC_URL=https://hq.gebeyaos.et/api/sync
   ```
3. Start the branch stack:
   ```bash
   docker compose -f docker-compose.branch.yml up -d
   ```
   *This starts the PostgreSQL 16 WAL database, the NestJS branch server on port 3000, and the automated nightly backup cron container.*

### Central HQ Deployment
On the cloud VPS:
```bash
docker compose -f docker-compose.hq.yml up -d
```

---

## 7. Disaster Recovery & Backup Procedures

### Automated Backups
The `branch-backup` container executes a full compressed database backup every night at 01:00 AM using `scripts/backup.sh`. Backups are saved to `./backups/gebeyaos_backup_YYYYMMDD_HHMMSS.sql.gz` with a 30-day retention window.

### Restoring from Backup
If the database directory becomes corrupted:
```bash
./scripts/restore.sh ./backups/gebeyaos_backup_20261021_010000.sql.gz
```

### Warm Standby Failover (Hardware Failure)
If the primary branch PC experiences catastrophic hardware failure (e.g. motherboard/PSU failure):
1. Navigate to the secondary back-office PC (pre-installed standby).
2. Execute the failover script:
   ```bash
   ./scripts/failover.sh
   ```
3. Terminals automatically reconnect to `server.branch.lan` within 2 minutes.

---

## 8. License
Proprietary software engineered for Ethiopian supermarket enterprises.