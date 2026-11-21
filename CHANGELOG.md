# Changelog – GebeyaOS

All notable changes to GebeyaOS are documented in this file.

## [1.0.0] - 2026-11-21 - Production Release ("Deploy-Ready")

### Added
- **Production Safety & Hardening (Part 0)**:
  - Startup environment validation (`env.validation.ts`) ensuring all required variables are present, enforcing 32+ character high-entropy secrets, and refusing to start with default/example passwords in production.
  - Health & Readiness endpoints (`GET /health`, `GET /ready`) on both `branch-server` and `hq-server` with zero leakage of connection strings or tenant data.
  - Security headers via Helmet (strict CSP, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `no-referrer`).
  - Strict CORS origin whitelisting (disallowing wildcard `*` in production).
  - Rate limiting (200 req/min general, 20 req/min on `/auth/*` brute-force defense).
  - Guarded `seed-dev.js` and `reset-supermarkets.js` to strictly reject execution in production environments.
  - Replaced hardcoded example values with clean `.env.example` templates.
  - Isolated PostgreSQL container networking (never published to host port 5432).
  - Unified system ports (Branch Server API: `3001`, POS Web: `3000`, HQ: `4000`).

- **Windows Branch Supermarket Packaging & Automation (Part A & B)**:
  - `scripts/windows/install.ps1`: Idempotent unattended installer for Windows 10/11 shop servers (prerequisites audit, secret generation, DB initialization, migration runner, NSSM Windows service creation, LAN firewall configuration).
  - `scripts/windows/make-cashier-shortcut.ps1`: Automated Chrome/Edge kiosk desktop shortcut generator for cashier tablets.
  - `scripts/windows/backup.ps1`: Daily scheduled pg_dump + media backup with verification and 30-day retention pruning.
  - `scripts/windows/restore.ps1`: Interactive point-in-time database and photo restore with double-confirmation safety.
  - `scripts/windows/restore-drill.ps1`: Monthly automated disaster recovery verification in an isolated sandbox database.
  - `scripts/windows/upgrade.ps1`: Zero-risk upgrade pipeline with automatic pre-upgrade backup, transactional migrations, and automatic rollback on health probe failure.
  - `scripts/windows/uninstall.ps1`: Windows service de-registration with safety data preservation.
  - `scripts/windows/package-release.ps1`: Release bundler generating production zip archives and SHA256 checksums.

- **Linux HQ Cloud Stack**:
  - `docker/Dockerfile.branch-server` and `docker/Dockerfile.hq-server`: Monorepo multi-stage Docker builds.
  - `docker/docker-compose.hq.yml`: Production HQ stack with isolated internal database and Caddy reverse proxy providing automated HTTPS.
  - `docker/Caddyfile`: Secure reverse proxy configuration with TLS termination and SPA routing.

- **Deployment Documentation**:
  - `docs/deploy/shop-install-guide.md`: Complete Windows shop PC setup guide with Amharic quick card.
  - `docs/deploy/hq-deploy-guide.md`: Linux VPS production deployment guide.
  - `docs/deploy/backup-and-restore-guide.md`: Disaster recovery and backup management manual.
  - `docs/deploy/upgrade-and-rollback-guide.md`: Upgrade and safe rollback guide.
  - `docs/deploy/hardware-setup-guide.md`: 80mm ESC/POS thermal printers, RJ11 cash drawers, and barcode scanners guide.
  - `docs/deploy/security-checklist.md`: Production hardening audit checklist.
  - `docs/deploy/operations-runbook.md`: Daily store opening, shift management, cash drops, and closing routines.
  - `docs/deploy/pre-launch-checklist.md`: Pre-launch go-live signoff checklist.
  - `docs/deploy/if-something-breaks.md`: Emergency troubleshooting manual.
