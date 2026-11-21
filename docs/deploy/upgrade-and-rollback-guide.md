# GebeyaOS – Zero-Risk Upgrade & Rollback Runbook

---

## 1. Safe Upgrade Pipeline
Upgrades on Windows branch servers are executed with transactional safety and zero risk of orphaned databases:

```
[Stop Service] ──▶ [Pre-Upgrade Backup] ──▶ [Code Swap] ──▶ [Transactional Migrations] ──▶ [Health Probe]
                                                                                               │
                                                         ┌─────────────────────────────────────┴────────┐
                                                         ▼                                              ▼
                                                   [200 OK: Complete]                         [Fail: Auto-Rollback]
```

---

## 2. Performing an Upgrade on Windows
1. Download the new release zip `gebeyaos-branch-v1.X.X.zip` and extract to `C:\GebeyaOS\releases\gebeyaos-1.X.X`.
2. Open PowerShell as Administrator and run:
   ```powershell
   cd C:\GebeyaOS\scripts\windows
   .\upgrade.ps1 -ReleasePath "C:\GebeyaOS\releases\gebeyaos-1.X.X"
   ```
3. What the upgrade script does automatically:
   * Triggers an immediate pre-upgrade database backup (`.dump`).
   * Takes a shadow copy of the active application code into `C:\GebeyaOS\rollback`.
   * Stops the `GebeyaOS-API` Windows service.
   * Copies the new binaries and migrations.
   * Runs all new SQL migrations inside a single atomic `BEGIN ... COMMIT` transaction.
   * Starts the service and polls `http://localhost:3001/ready`.

---

## 3. Automatic & Manual Rollback

### Automatic Rollback:
If `http://localhost:3001/ready` fails to return `{"status":"ok"}` within 25 seconds, the script automatically:
1. Re-stops the service.
2. Restores the previous code tree from `C:\GebeyaOS\rollback`.
3. Restarts the service on the previously working version.

### Manual Emergency Rollback:
If logic errors are identified after an upgrade:
```powershell
# Restore previous database snapshot
.\restore.ps1 -BackupFile "C:\GebeyaOS\backups\pre-upgrade-backup.dump"
```
