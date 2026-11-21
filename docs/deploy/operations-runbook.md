# GebeyaOS – Operations Runbook & Daily Routines

---

## 1. Morning Store Opening Routine (07:30 AM)
1. Power on the Shop Server PC (if turned off overnight).
2. The `GebeyaOS-API` Windows service starts automatically upon boot.
3. Power on Cashier Tablets / Terminals.
4. Launch the **GebeyaOS – Cashier POS** shortcut from desktop.
5. Cashier logs in with PIN:
   * Prompted for **Opening Cash Float** (e.g. 500 ETB change fund).
   * Shift starts; cashier name and session ID are bound to all subsequent sales.

---

## 2. Midday Cash Drops (Float Management)
When cash drawer accumulates excess cash (exceeding safety threshold, e.g. 15,000 ETB):
1. Navigate to **Shift / Session** menu.
2. Select **Cash Drop / Payout**.
3. Enter amount collected by supervisor (e.g. 10,000 ETB).
4. System prints Cash Drop receipt with two signature slips (Supervisor & Cashier).

---

## 3. Evening Store Closing Routine (09:00 PM)
1. Cashier initiates **Shift Close / Blind Count**:
   * Counts physical cash in drawer without seeing expected totals.
   * Inputs actual counts (ETB 100, 50, 10 notes).
2. System computes discrepancy (Overage / Shortage).
3. **Z-Report** prints with gross sales, VAT breakdown, payment method totals, and audit counts.
4. Cashier hands drawer cash to manager.
5. At 02:00 AM, the Windows Scheduled Task runs `backup.ps1` automatically.

---

## 4. Log Inspection
When troubleshooting:
* **API Standard Logs**: `C:\GebeyaOS\logs\api-stdout.log`
* **API Error Logs**: `C:\GebeyaOS\logs\api-stderr.log`
* **Backup Activity Log**: `C:\GebeyaOS\backups\backup.log`
