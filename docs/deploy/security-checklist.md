# GebeyaOS – Production Security & Hardening Checklist

---

## 1. System & Network Boundaries
- [x] **PostgreSQL Port Isolation**: Port 5432 is bound to `127.0.0.1` on Windows and restricted to the internal Docker network on Linux. Never exposed to public internet or LAN.
- [x] **LAN Cashier Firewall**: Only TCP port `3001` (API) is permitted inbound through Windows Defender Firewall, restricted to the Private network profile.
- [x] **CORS Origins Whitelist**: Wildcard CORS (`*`) disabled. Server only responds to configured terminal origins.
- [x] **Security Headers (Helmet)**: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, strict CSP, and disabled server fingerprinting.
- [x] **Rate Limiting**: Express rate limiter enforcing 200 requests/minute per terminal, and 20 requests/minute on authentication endpoints to defeat PIN brute-force attacks.

---

## 2. Credential & Secret Management
- [x] **No Hardcoded Secrets**: Zero default keys in repository code or production configs.
- [x] **Entropy Enforcement**: Startup environment validator halts process if `JWT_SECRET`, `ENCRYPTION_KEY`, or `DB_PASSWORD` are under 32 characters or match example placeholders.
- [x] **Password & PIN Hashing**: Argon2id used for platform operators and passwords; bcrypt used for cashier PINs.
- [x] **Restricted File ACLs**: Production `.env` files protected with Windows ACLs allowing read access to SYSTEM and Administrators only.

---

## 3. Data Integrity & Safety Guards
- [x] **Production Seed Lock**: `seed-dev.js` throws an error and exits immediately if `NODE_ENV=production`.
- [x] **Reset Lock**: `reset-supermarkets.js` blocked in production unless `--force-production-reset` is passed.
- [x] **Audit Trail**: Every sensitive operation (price change, batch adjustment, void, refund, cashier session shift) logged with user ID, timestamp, and IP address.
