# GebeyaOS – Backup, Restore, and Disaster Recovery Guide

---

## 1. Backup Strategy Overview
Every GebeyaOS installation employs a 3-tier safety net:
1. **Database Snapshots**: Compressed PostgreSQL custom-format (`.dump`) dumps via `pg_dump -F c`.
2. **Media & Photo Archives**: Zipped snapshots of uploaded receipts, KYC photos, and barcode assets.
3. **Automated Verification**: Every backup file is verified with `pg_restore --list` immediately upon creation before being marked successful.

---

## 2. Windows Branch Shop Server

### Manual Daily Backup:
```powershell
cd C:\GebeyaOS\scripts\windows
.\backup.ps1
```
* **Output Path**: `C:\GebeyaOS\backups\gebeyaos_branch_<YYYY-MM-DD_HH-mm>.dump`
* **Retention**: Automatically prunes backups older than 30 days.

### Database Restore Procedure:
> [!CAUTION]
> Restoring a database will overwrite current branch transaction data with the snapshot.

```powershell
cd C:\GebeyaOS\scripts\windows
.\restore.ps1
```
The script will display all available backups, ask you to select the target backup number, and require confirmation typing `YES`.

### Monthly Disaster Recovery Drill:
Run the non-destructive restore drill:
```powershell
cd C:\GebeyaOS\scripts\windows
.\restore-drill.ps1
```
This restores the latest snapshot into an isolated sandbox database `gebeyaos_restore_test`, audits row counts across `products`, `sales`, and `batches`, and cleans up without touching live POS sales.

---

## 3. Offsite Backup Synchronization
To protect against hardware theft or water damage in the store:
1. Configure a second USB flash drive formatted with BitLocker or NTFS.
2. Mirror the `C:\GebeyaOS\backups\` folder nightly to the secondary physical drive.
