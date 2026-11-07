# GebeyaOS Ethiopian Retail & Accounting Amharic Glossary (የገበያ ኦኤስ የቃላት መፍቻ)

This glossary defines standard, natural, everyday Ethiopian supermarket, retail, and accounting terminology for GebeyaOS. It ensures absolute consistency across all screens, receipts, export documents, reports, and error messages.

---

## 1. Core Navigation & Roles (ዋና አሰሳ እና የስራ ድርሻዎች)

| English Term | Standard Amharic | Usage / Context | Notes & Clarifications |
| :--- | :--- | :--- | :--- |
| **Checkout / Sales (POS)** | **መሸጫ** | Primary navigation tab & register screen | Natural retail term for POS checkout counter |
| **Shift** | **ፈረቃ** | Cashier working session & register shifts | Standard Ethiopian shift terminology |
| **Cashier** | **ገንዘብ ተቀባይ** | User role & terminal operator badge | Formal & retail standard |
| **Catalog / Products** | **ምርቶች** | Product master list, SKUs, barcode setup | Preferred over wordy "የዕቃዎች ዝርዝር" |
| **Inventory / Stock** | **ክምችት** | Store stock, on-hand ledger, adjustments | Retail warehouse & accounting standard |
| **Stocktake / Physical Count** | **ቆጠራ** | Periodic inventory count / cycle count | Standard retail accounting term |
| **Purchasing / Receiving (GRN)** | **ግዢ** | Supplier purchase orders & goods receiving | Standard commercial term |
| **Supplier / Vendor** | **አቅራቢ** | Supplier records, trade creditors, aging | Standard commercial term |
| **Reports & Analytics** | **ሪፖርቶች** | Z/X sales reports, tax declarations, VAT | Accounting standard |
| **HQ Sync** | **ማመሳሰል** | Cloud HQ background synchronization | Clean and direct |
| **Staff Directory** | **ሰራተኞች** | Employee accounts, PINs, role matrix | Standard administrative term |
| **Settings** | **ቅንብሮች** | Store profile, receipt config, fiscal rules | Standard system UI term |
| **Branch** | **ቅርንጫፍ** | Store location / branch identity | Standard corporate term |
| **Platform Admin** | **የስርዓት አስተዳዳሪ** | Multi-tenant SaaS console | Internal administrative tier |

---

## 2. Cash Handling & Shift Operations (የገንዘብ አያያዝ እና ፈረቃ)

| English Term | Standard Amharic | Usage / Context | Notes & Clarifications |
| :--- | :--- | :--- | :--- |
| **Opening cash float** | **መነሻ ገንዘብ** | Starting cash amount placed in register drawer | Retail standard |
| **Cash** | **ጥሬ ገንዘብ** | Physical currency tender | Standard banking & retail term |
| **Safe drop** | **ወደ ካዝና ማስገባት** | Skimming excess cash from drawer to safe | Prevents till overflow & theft |
| **Additional float** | **ተጨማሪ መነሻ ገንዘብ** | Adding petty cash to till mid-shift | Documented cash movement |
| **Petty cash out** | **የጥቃቅን ወጪ** | Minor store expenses paid from drawer | Accounting standard |
| **Blind close** | **ያልታየ ፈረቃ መዝጊያ** | Cashier counts drawer without knowing expected total | Fraud prevention standard |
| **Expected cash in drawer** | **በካዝና መገኘት ያለበት** | System computed cash total | Manager view only |
| **Actual cash counted** | **የተቆጠረ ጥሬ ገንዘብ** | Physical count entered by cashier | Reconciliation field |
| **Cash variance (Over / Short)** | **የገንዘብ ልዩነት (ብልጫ / ጉድለት)** | Discrepancy between expected and counted cash | Critical audit metric |
| **Interim X-Report** | **የመካከለኛ ንባብ (X-ሪፖርት)** | Mid-shift reading without closing shift | Fiscal & POS standard |
| **Final Z-Report** | **የፈረቃ ማጠቃለያ (Z-ሪፖርት)** | End-of-shift final fiscal settlement | Fiscal printer standard |

---

## 3. Checkout, Tenders & Transactions (መሸጫ፣ ክፍያዎች እና ግብይት)

| English Term | Standard Amharic | Usage / Context | Notes & Clarifications |
| :--- | :--- | :--- | :--- |
| **Basket / Cart** | **የዕቃ ቅርጫት** | Active customer checkout items | Everyday shopping term |
| **Subtotal** | **ንዑስ ድምር** | Pre-tax sum of line items | Accounting standard |
| **VAT (15%)** | **ተ.እ.ታ. (15%)** | Ethiopian Value Added Tax | Official Ethiopian tax authority abbreviation |
| **Withholding Tax (2%)** | **የቀረጥ ተቀናሽ (2%)** | Ethiopian 2% withholding for commercial GRN | Official tax regulation |
| **Total / Grand Total** | **ጠቅላላ ድምር** | Final payable balance | Retail standard |
| **Discount** | **ቅናሽ** | Item line or whole basket discount | Retail standard |
| **Amount Tendered** | **የተከፈለ ገንዘብ** | Amount handed by customer | Payment modal |
| **Change Due** | **ተመላሽ (መልስ)** | Cash to return to customer | Payment modal |
| **Exact Cash** | **ልክ ጥሬ ገንዘብ** | Customer provided exact bill amount | Quick action button |
| **Refund / Return** | **ተመላሽ ገንዘብ** | Customer returning goods for refund | Audited supervisor action |
| **Receipt** | **ደረሰኝ** | Customer sales invoice / slip | Commercial standard |
| **Reprint Receipt** | **ደረሰኝ በድጋሚ ማተም** | Duplicate receipt printing | Audited reason logged |
| **Hold Basket** | **ቅርጫት ለጊዜው ማቆየት** | Suspend customer transaction | Queue buster feature |
| **Resume Basket** | **የተያዘ ቅርጫት መልስ** | Retrieve suspended transaction | Quick POS recall |

---

## 4. Payment Methods & Financial Institutions (የክፍያ አማራጮች)

| English Term | Standard Amharic | Notes & Clarifications |
| :--- | :--- | :--- |
| **Telebirr** | **ቴሌብር** | Ethio Telecom mobile money brand |
| **CBE Birr** | **ሲቢኢ ብር** | Commercial Bank of Ethiopia mobile money |
| **Card / POS** | **ባንክ ካርድ** | Bank debit/credit POS terminal |
| **Bank Transfer** | **የባንክ ማስተላለፍ** | Direct account-to-account transfer |

---

## 5. Inventory & Warehouse Logistics (ክምችት እና መጋዘን)

| English Term | Standard Amharic | Usage / Context | Notes & Clarifications |
| :--- | :--- | :--- | :--- |
| **Quantity** | **ብዛት** | Number of units | Retail standard |
| **Price / Unit Price** | **ዋጋ / የአንዱ ዋጋ** | Selling price per item | Retail standard |
| **Cost Price** | **የግዢ ዋጋ** | Landed purchase cost per unit | Accounting standard |
| **Margin / Markup** | **የትርፍ ህዳግ** | Gross profit margin percentage | Retail analytics |
| **Low stock** | **ክምችት እያለቀ ነው** | Stock below reorder alert threshold | Amber warning badge |
| **Out of stock** | **ያለቀ ክምችት** | Zero inventory on hand | Red danger badge |
| **In stock** | **በክምችት አለ** | Available for sale | Green badge |
| **Batch / Lot** | **ባች** | Inbound consignment grouping | Expiry & FIFO tracking |
| **Expiry date** | **የሚያበቃበት ቀን** | Product perishable expiration date | Food safety & compliance |
| **Stock adjustment** | **የክምችት ማስተካከያ** | Correcting damage, shrinkage, theft | Audited manager action |
| **Stock ledger** | **የክምችት እንቅስቃሴ መዝገብ** | Chronological record of all ins/outs | Immutable audit trail |
| **Reorder point** | **ዳግም ማዘዣ መጠን** | Minimum threshold triggering reorder PO | Inventory intelligence |

---

## 6. Purchasing & Supplier Management (ግዢ እና አቅራቢዎች)

| English Term | Standard Amharic | Usage / Context | Notes & Clarifications |
| :--- | :--- | :--- | :--- |
| **Purchase Order (PO)** | **የግዢ ትእዛዝ (PO)** | Formal purchase request sent to supplier | Commercial standard |
| **Goods Receiving Note (GRN)** | **የዕቃ መቀበያ ሰነድ (GRN)** | 4-step intake invoice & receiving document | Warehouse intake standard |
| **AVCO (Average Cost) Blending**| **አማካይ ዋጋ ስሌት (AVCO)** | Weighted average cost adjustment on intake | Accounting standard |
| **Landed Cost** | **ወደ መደብር የገባበት ጠቅላላ ወጪ** | Item cost plus freight, duty, transport | Commercial costing |
| **Payables Balance / Aging** | **ያልተከፈለ እዳ / የእዳ ቆይታ** | Money owed to vendors by aging bucket | Accounts payable standard |

---

## 7. Statuses & System Enums (ሁኔታዎች እና የስርዓት ምድቦች)

| Code / English | Standard Amharic | Usage & Scope |
| :--- | :--- | :--- |
| `OPEN` | **ክፍት** | Shift or PO status |
| `CLOSED` | **የተዘጋ** | Shift status |
| `DRAFT` | **ረቂቅ** | PO status |
| `SENT` | **የተላከ** | PO status |
| `PARTIALLY_RECEIVED` | **በከፊል የተረከበ** | GRN status |
| `RECEIVED` | **ሙሉ በሙሉ የተረከበ** | GRN status |
| `CANCELLED` | **የተሰረዘ** | Order / transaction status |
| `ACTIVE` | **ንቁ** | User or branch status |
| `INACTIVE` | **የቦዘነ** | Deactivated staff or terminal |
| `PAID` | **የተከፈለ** | Sales invoice status |
| `UNPAID` | **ያልተከፈለ** | Credit balance status |
| `PARTIALLY_REFUNDED` | **በከፊል የተመለሰ** | Return sales status |
| `REFUNDED` | **ሙሉ በሙሉ የተመለሰ** | Full return status |

---

## 8. Terms Flagged for User Review (ለተጠቃሚው ማረጋገጫ የቀረቡ ቃላት)

The following terms have been selected based on modern Ethiopian supermarket practices. Please review and confirm your preference:

1. **AVCO Blending (Weighted Average Cost)**:
   - *Proposed*: **አማካይ ዋጋ ስሌት (AVCO)**
   - *Alternative*: **የተቀላቀለ አማካይ ዋጋ**
2. **Safe Drop**:
   - *Proposed*: **ወደ ካዝና ማስገባት**
   - *Alternative*: **ጥሬ ገንዘብ ማውጣት** (less specific)
3. **Goods Receiving Note (GRN)**:
   - *Proposed*: **የዕቃ መቀበያ ሰነድ (GRN)**
   - *Alternative*: **የዕቃ ገቢ ደረሰኝ**
4. **Stocktake / Cycle Count**:
   - *Proposed*: **ቆጠራ** (Clean, familiar)
   - *Alternative*: **የመጋዘን ቆጠራ**
5. **Reorder Suggestions**:
   - *Proposed*: **የዳግም ግዢ ጥቆማዎች**
   - *Alternative*: **ዳግም ማዘዣዎች**

