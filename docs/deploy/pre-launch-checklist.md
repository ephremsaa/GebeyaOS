# GebeyaOS – Pre-Launch Go-Live Signoff Checklist

Before welcoming customers and opening the store doors for commercial sales, the Store Manager and IT Lead must execute and sign off on this checklist:

---

## Station 1: Hardware & Network (15 Minutes)
- [ ] **Router & Wi-Fi**: Shop PC and Cashier terminals can ping each other with latency < 5ms.
- [ ] **Static IP / DHCP Reservation**: Shop PC is assigned a static IP (e.g., `192.168.1.100`) on the router.
- [ ] **UPS Battery**: Server PC and main receipt printers plugged into UPS; power cut simulated for 30 seconds with zero downtime.
- [ ] **Thermal Printer**: Print test receipt executed; Amharic text legible, cutter operational.
- [ ] **Cash Drawer**: Drawer kicks open smoothly upon completing cash checkout.
- [ ] **Barcode Scanner**: Barcode scanned at high speed; item added to cart with correct price and tax.

---

## Station 2: Software & Data (15 Minutes)
- [ ] **Health Endpoint**: `http://<server-ip>:3001/ready` returns `{"status":"ok","db":"reachable"}`.
- [ ] **Catalog Verification**: Item master contains all shelf products with correct barcode, name (Amharic & English), VAT rate (15% vs Exempt), and retail price.
- [ ] **Opening Stock**: Batches and inventory quantities accurately reflect warehouse counts.
- [ ] **Shift Machine**: Cashier can open shift with initial opening float (e.g., 500 ETB change fund).
- [ ] **Completed Sale**: Complete 1 cash sale and 1 Telebirr sale; verify receipt matches customer basket.
- [ ] **Z-Report (End of Shift)**: Cashier blind close reconciles expected vs actual drawer totals.

---

## Station 3: Disaster Recovery Readiness (10 Minutes)
- [ ] **Backup Test**: Run `.\backup.ps1` and verify `.dump` file appears in `C:\GebeyaOS\backups\`.
- [ ] **Disaster Drill**: Run `.\restore-drill.ps1` and confirm success message in log.
- [ ] **Operator Signoff**:
  * Store Manager Signature: _______________________
  * Date / Time: ___________________________________
