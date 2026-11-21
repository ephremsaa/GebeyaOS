# GebeyaOS – Emergency Troubleshooting ("If Something Breaks")

---

## 1. Cashier Screen says "Cannot connect to server" (Network / Offline)
* **Symptom**: Red banner at the top of POS or checkout screen failing with network error.
* **Checks**:
  1. Check if the server PC is turned on and awake (make sure Sleep mode is disabled in Windows Settings).
  2. Verify Cashier terminal Wi-Fi is connected to the store's internal network (not guest Wi-Fi or cellular hotspot).
  3. Verify Server IP address:
     * On the server PC, open Command Prompt and type `ipconfig`.
     * If the IP changed (e.g. from `.100` to `.104`), update the Cashier shortcut URL or configure DHCP reservation on the router.
  4. Test if the server service is running on the shop PC:
     * Open PowerShell as Administrator and run: `Get-Service GebeyaOS-API`
     * If stopped, run: `Start-Service GebeyaOS-API`

---

## 2. Power Outage Occurred During a Sale (Sudden Loss of Power)
* **Symptom**: Computer rebooted mid-transaction.
* **Safety Net**:
  1. PostgreSQL runs with `fsync=on` and Write-Ahead-Logging (WAL) enabled. Uncommitted transactions are automatically rolled back safely.
  2. Once the server restarts, visit `http://localhost:3001/ready`. It will automatically verify data integrity.
  3. Check the **Sales History** screen on the cashier terminal:
     * If the sale appears in the list, the receipt printed and transaction was committed.
     * If not, no funds were recorded and the cashier can re-scan the customer basket.

---

## 3. Receipt Printer Not Printing
* **Checks**:
  1. Check paper roll direction (thermal paper only prints on one side; ensure roll feeds from bottom).
  2. Inspect the printer USB cable connection.
  3. In Windows Printers, verify printer is set to "Default" and has no stuck print jobs in queue.
  4. Power cycle printer (turn off for 5 seconds, then turn back on).

---

## 4. Immediate Disaster Recovery (Database Corruption / Disk Failure)
If the database fails to start or disk was damaged:
1. Re-install PostgreSQL or recover files.
2. Run the automated restore script:
   ```powershell
   cd C:\GebeyaOS\scripts\windows
   .\restore.ps1
   ```
3. Select the most recent `.dump` file (created at 02:00 AM or earlier).
4. Type `YES` to restore. All product catalogs, inventory, and historical sales are recovered.
