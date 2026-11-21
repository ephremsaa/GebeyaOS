# GebeyaOS – Supermarket Branch Server Installation Guide
**ዒላማ፡ የሱፐርማርኬት ቅርንጫፍ ሰርቨር ኮምፒውተር (Windows 10/11) – ሙሉ በሙሉ ከመስመር ውጭ (Offline) የሚሰራ**

---

## 1. Prerequisites (አስፈላጊ ቅድመ ሁኔታዎች)
* **Operating System**: Windows 10 (21H2+) ወይም Windows 11 (64-bit)
* **Processor & RAM**: Intel Core i3/i5 (or equivalent), 8GB RAM minimum (16GB recommended)
* **Storage**: 256GB SSD (ቢያንስ 20GB ነፃ ቦታ)
* **Network**: LAN Router / Wi-Fi Access Point (ሰርቨሩ እና የካሳ ታብሌቶች በአንድ የአካባቢ መረብ ላይ መሆን አለባቸው፤ የኢንተርኔት ግንኙነት አያስፈልግም)
* **UPS (Power Protection)**: APC/CyberPower 650VA+ የማይቋረጥ የኤሌክትሪክ አቅርቦት

---

## 2. Software Prerequisites Installation
1. **Node.js LTS (v20+)**:
   * [https://nodejs.org](https://nodejs.org) ያውርዱ እና ጫን ያድርጉ (Default settings).
2. **PostgreSQL 16**:
   * [EnterpriseDB PostgreSQL 16](https://www.enterprisedb.com/downloads/postgres-postgresql-installers) ያውርዱ።
   * የመጫኛ ፓስወርድ ያስገቡ (ለምሳሌ የሱፐርዩዘር `postgres` ፓስወርድ)።
   * ነባሪ ፖርት `5432` ይምረጡ።

---

## 3. Automated Setup via PowerShell (በአንድ ትእዛዝ መጫን)
1. የ `gebeyaos-branch-v1.0.0.zip` ፋይሉን ወደ `C:\GebeyaOS` ዚፕ ይክፈቱ (Extract)።
2. **PowerShell** በ **Administrator (አስተዳዳሪ)** መብት ይክፈቱ።
3. የሚከተለውን ትእዛዝ ያስኪዱ፡
   ```powershell
   cd C:\GebeyaOS\scripts\windows
   Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
   .\install.ps1
   ```
4. ስክሪፕቱ የሚከተሉትን ስራዎች በራሱ ያከናውናል፡
   * የዊንዶውስ እና የኮምፒውተሩን ዝርዝር ማረጋገጥ
   * 32-ባይት የሆኑ የደህንነት ሚስጥሮችን (JWT secret, encryption key, DB password) በራሱ ማመንጨት
   * `gebeyaos_branch` ዳታቤዝ እና የተወሰነ መብት ያለው `gebeyaos_app` ተጠቃሚ መፍጠር
   * ሁሉንም የዳታቤዝ ማይግሬሽኖች መተግበር
   * የ `GebeyaOS-API` ዊንዶውስ ሰርቪስ መመዝገብ (ኮምፒውተሩ ሲበራ ራሱ ይጀምራል፤ ቢቋረጥ ራሱ እንደገና ይነሳል)
   * በዊንዶውስ ፋየርዎል ላይ ፖርት `3001` ለካሳ ታብሌቶች ክፍት ማድረግ
   * የአገልጋዩን የLAN IP አድራሻ ማሳየት

---

## 4. Cashier Terminal Setup (የካሳ ታብሌቶችን ማገናኘት)
በእያንዳንዱ የካሳ ታብሌት (Cashier Tablet/PC) ላይ፡
1. ጎግል ክሮም (Chrome) ወይም ማይክሮሶፍት ኤጅ (Edge) ይክፈቱ።
2. የሰርቨሩን አድራሻ ይክፈቱ (ለምሳሌ፡ `http://192.168.1.100:3001`)።
3. **Kiosk Shortcut** ለመፍጠር በታብሌቱ ላይ የሚከተለውን ስክሪፕት ያስኪዱ፡
   ```powershell
   .\make-cashier-shortcut.ps1 -ServerIP 192.168.1.100
   ```
4. በዴስክቶፕ ላይ የሚፈጠረው **"GebeyaOS – Cashier POS"** የሚለው አዶ በቀጥታ ሙሉ ስክሪን ሆኖ ለካሳ ስራ ዝግጁ ይሆናል።

---

## 5. Daily Backup Verification
የሰርቨሩ መረጃ በየቀኑ በሌሊት 02:00 ላይ በራስ-ሰር በታስክ ስኬጁለር ወደ `C:\GebeyaOS\backups\` ይቀመጣል።
የመጠባበቂያ ፋይል መፈጠሩን ለማረጋገጥ፡
```powershell
.\backup.ps1
```
