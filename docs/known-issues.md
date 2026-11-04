# Known Issues & Deferred Polish (Stabilization Sprint)

This document tracks secondary polish items and non-critical enhancements discovered during the stabilization sprint that were deferred to preserve focus on the core flow (`login -> unlock -> open shift -> sell -> close shift`).

---

### 1. Large Production Bundle Size Warning
- **Status:** Non-breaking / Optimization backlog
- **Details:** Vite build emits a warning that `dist/assets/index-*.js` is ~1.04 MB minified (>500 kB recommended threshold).
- **Remediation Plan:** Introduce `React.lazy()` dynamic chunking for secondary views (`ReportsView`, `PurchasingView`, `BackupRestoreView`, and `PlatformAdminConsole`) in the next release cycle.

### 2. Physical Esc/POS Thermal Printer Protocol Support
- **Status:** Functional via Web/Browser Print Dialog
- **Details:** Direct serial / raw COM port ESC/POS communication relies on Web Serial API or Electron sidecar. For web browser usage, receipts render cleanly via styled HTML print dialog. Direct TCP socket printing to network thermal printers will be unified in the hardware daemon module.

### 3. Central HQ Cloud Sync Connectivity
- **Status:** Expected Branch-Isolated Behavior
- **Details:** When running branch-server in standalone store LAN mode without an active cloud HQ connection, `SyncClientService` logs `Sync push failed: Connection refused`. This is normal and expected; branch outbox safely queues all changes locally in PostgreSQL until HQ connection is re-established.

