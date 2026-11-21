# GebeyaOS – Hardware Setup & POS Peripherals Guide
**Thermal Receipt Printers, Cash Drawers, and Barcode Scanners**

---

## 1. 80mm ESC/POS Thermal Receipt Printers
GebeyaOS supports all standard 80mm ESC/POS USB and Network thermal receipt printers (Epson TM-T88, TM-T20, Xprinter XP-N160II, Sunmi, Bixolon, Posiflex).

### Windows Driver Configuration:
1. Connect printer via USB and install the vendor's Windows driver.
2. In Windows **Settings > Bluetooth & devices > Printers & scanners**:
   * Select your thermal printer and click **Printer properties**.
   * On the **General** tab, name the printer clearly (e.g., `Cashier-1-Receipt`).
   * Set paper size to `80mm x 297mm` or `Roll 80mm`.
   * Set margins to `0mm` (None).

### Amharic Text Support:
* GebeyaOS outputs receipts using high-contrast Unicode canvas/raster formatting.
* UTF-8 Amharic characters (ፊደላት) render crisply on any standard ESC/POS graphical driver without requiring special Ethiopian hardware font ROM chips.

---

## 2. Cash Drawers (RJ11 / RJ12 Trigger)
Most electronic cash drawers connect directly to the receipt printer via a 6-pin RJ11/RJ12 modular kick-out cable.

### Printer Kick Configuration:
1. Open **Printer Properties > Device Settings**.
2. Locate **Cash Drawer** settings:
   * **Cash Drawer #1**: Set to `Open Before Printing` or `Open After Printing`.
   * **Pulse duration**: `50ms` (standard for 24V solenoids).
3. Test drawer kick using the **Hardware Diagnostic** screen in GebeyaOS POS or by issuing a test cash receipt.

---

## 3. Barcode Scanners (1D & 2D QR Readers)
* Standard USB or Bluetooth HID (Human Interface Device) keyboard wedge scanners work plug-and-play.
* Configure scanner settings using the barcode manual that came with the scanner:
  * Ensure **Suffix character** is set to `Enter` (`CR+LF`).
  * Enable GS1-128, EAN-13, and UPC-A symbologies.
