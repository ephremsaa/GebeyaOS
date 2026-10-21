# GebeyaOS (ገበያ OS)
**Production-Grade, Multi-Branch Supermarket Management System for Ethiopia**

GebeyaOS is an enterprise, local-server-first retail operating platform built for Ethiopian supermarket chains. Designed to ensure zero-dependency selling during internet loss and resilient recovery during electrical power cuts.

---

## Monorepo Layout

```
GebeyaOS/
├── apps/
│   ├── branch-server/       # Runs locally on branch LAN (NestJS / Fastify + PostgreSQL)
│   ├── hq-server/           # Central consolidation and master catalog server
│   └── pos-web/             # React + TypeScript + Tailwind PWA for POS lanes & back-office
├── packages/
│   ├── shared-types/        # Domain entities, DTOs, and shared contracts
│   └── sync-protocol/       # Outbox/inbox schema, conflict rules, cursor protocols
├── docs/                    # Architecture diagrams, ERD (Mermaid), ADRs, failure scenarios
├── docker/                  # Docker Compose setups for branch servers and central HQ
└── README.md
```

---

## Core Engineering Principles
1. **Local-Server-First**: Terminals talk strictly to the local branch server. No direct cloud dependency for checkout, shifts, or receiving.
2. **ACID & Power Resilience**: PostgreSQL 16 write-ahead log (WAL) durability (`fsync=on`) backed by UPS.
3. **Ethiopian Localization**: 15% VAT, VAT-exempt essentials, ETB precision, MOR/ERCA fiscal receipt formatting, Telebirr & CBE Birr adapters, and butcher/deli scale EAN-13 barcodes.
4. **Append-Only Auditing**: Immutable stock ledger, price logs, and sale logs.