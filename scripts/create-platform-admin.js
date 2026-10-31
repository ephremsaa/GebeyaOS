#!/usr/bin/env node
/**
 * GebeyaOS - Platform Admin Creation CLI
 * 
 * Command: npm run create-platform-admin
 * Usage:
 *   Interactive:
 *     npm run create-platform-admin
 *   Non-interactive / automation:
 *     node scripts/create-platform-admin.js --username operator1 --email operator@gebeyaos.et --name "Ops Lead" --role SUPER_ADMIN --password "StrongPass2026!"
 */

const readline = require('readline');
const path = require('path');
const crypto = require('crypto');
const argon2 = require(path.resolve(process.cwd(), 'node_modules/argon2'));
const { Client } = require(path.resolve(process.cwd(), 'node_modules/pg'));

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Encode(buffer) {
  let bits = 0;
  let value = 0;
  let output = '';
  for (let i = 0; i < buffer.length; i++) {
    value = (value << 8) | buffer[i];
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }
  return output;
}

function generateUuidV7() {
  const timestamp = Date.now();
  const timeHex = timestamp.toString(16).padStart(12, '0');
  const randomBytes = crypto.randomBytes(10);
  randomBytes[0] = (randomBytes[0] & 0x0f) | 0x70;
  randomBytes[2] = (randomBytes[2] & 0x3f) | 0x80;
  const randHex = randomBytes.toString('hex');
  return [
    timeHex.substring(0, 8),
    timeHex.substring(8, 12),
    randHex.substring(0, 4),
    randHex.substring(4, 8),
    randHex.substring(8, 20),
  ].join('-');
}

function encryptSecret(plainSecret, masterKeyString) {
  const key = crypto.createHash('sha256').update(masterKeyString).digest();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  let enc = cipher.update(plainSecret, 'utf8', 'hex');
  enc += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');
  return `${iv.toString('hex')}:${authTag}:${enc}`;
}

const COMMON_PASSWORDS = new Set([
  'password', 'password123', 'admin', 'admin123', 'admin1234', '1234567890',
  '123456789', '12345678', 'qwerty12345', 'administrator', 'gebeyaos123',
  'superadmin', 'welcome123', 'operator123'
]);

function validatePassword(pwd) {
  if (!pwd || pwd.length < 10) {
    return 'Password must be at least 10 characters long';
  }
  if (COMMON_PASSWORDS.has(pwd.toLowerCase())) {
    return 'Password is too common; choose a more unique passphrase';
  }
  return null;
}

function parseArgs() {
  const args = process.argv.slice(2);
  const parsed = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      const key = args[i].substring(2);
      const val = args[i + 1] && !args[i + 1].startsWith('--') ? args[++i] : true;
      parsed[key] = val;
    }
  }
  return parsed;
}

async function prompt(rl, question, hidden = false) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer.trim());
    });
  });
}

async function main() {
  const cliArgs = parseArgs();
  console.log('\n======================================================');
  console.log('   GebeyaOS Platform Control Plane - Admin Provisioner');
  console.log('======================================================\n');

  let username = cliArgs.username;
  let email = cliArgs.email;
  let fullName = cliArgs.name || cliArgs.fullName;
  let role = (cliArgs.role || '').toUpperCase();
  let password = cliArgs.password;

  const isInteractive = !username || !email || !password;

  if (isInteractive) {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    try {
      if (!username) username = await prompt(rl, 'Platform Operator Username: ');
      if (!fullName) fullName = await prompt(rl, 'Full Name: ');
      if (!email) email = await prompt(rl, 'Email Address: ');
      
      if (!role) {
        console.log('\nAvailable Roles:');
        console.log('  1. SUPER_ADMIN (Fleet config, tenant provisioning, full security)');
        console.log('  2. SUPPORT     (Tenants view, break-glass support access required)');
        console.log('  3. BILLING     (Subscriptions, plan upgrades, usage invoices)');
        const roleChoice = await prompt(rl, 'Choose Role [1/2/3] (default: 1): ');
        if (roleChoice === '2') role = 'SUPPORT';
        else if (roleChoice === '3') role = 'BILLING';
        else role = 'SUPER_ADMIN';
      }

      if (!password) {
        while (true) {
          password = await prompt(rl, 'Master Password (min 10 chars): ');
          const err = validatePassword(password);
          if (!err) break;
          console.error(`  ❌ ${err}`);
        }
      }
    } finally {
      rl.close();
    }
  }

  // Final validation
  if (!username) throw new Error('Username is required');
  if (!email || !email.includes('@')) throw new Error('Valid email is required');
  if (!fullName) fullName = username;
  if (!['SUPER_ADMIN', 'SUPPORT', 'BILLING'].includes(role)) {
    role = 'SUPER_ADMIN';
  }

  const pwdErr = validatePassword(password);
  if (pwdErr) {
    throw new Error(pwdErr);
  }

  console.log('\n[1/4] Hashing password with Argon2id...');
  const passwordHash = await argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 4,
  });

  console.log('[2/4] Generating 160-bit TOTP secret and 10 single-use backup codes...');
  const secretBytes = crypto.randomBytes(20);
  const totpSecret = base32Encode(secretBytes);
  const masterEncryptionKey = process.env.TOTP_ENCRYPTION_KEY || 'gebeyaos-totp-master-encryption-key-2026';
  const totpSecretEncrypted = encryptSecret(totpSecret, masterEncryptionKey);

  const plainBackupCodes = [];
  const backupCodesJson = [];
  for (let i = 0; i < 10; i++) {
    const c1 = crypto.randomBytes(2).toString('hex').toUpperCase();
    const c2 = crypto.randomBytes(2).toString('hex').toUpperCase();
    const code = `${c1}-${c2}`;
    plainBackupCodes.push(code);
    const hash = crypto.createHash('sha256').update(code.replace('-', '')).digest('hex');
    backupCodesJson.push({ code_hash: hash, used: false });
  }

  const adminId = generateUuidV7();
  console.log('[3/4] Writing platform administrator to PostgreSQL database...');
  const dbUrl = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/gebeyaos_branch';
  const client = new Client({ connectionString: dbUrl });
  await client.connect();

  try {
    const res = await client.query(
      `INSERT INTO platform_admins (
         id, username, full_name, email, role, password_hash,
         totp_secret_encrypted, totp_enabled, backup_codes, is_active, token_version
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE, $8, TRUE, 1)
       ON CONFLICT (username) DO UPDATE SET
         full_name = EXCLUDED.full_name,
         email = EXCLUDED.email,
         role = EXCLUDED.role,
         password_hash = EXCLUDED.password_hash,
         totp_secret_encrypted = EXCLUDED.totp_secret_encrypted,
         totp_enabled = TRUE,
         backup_codes = EXCLUDED.backup_codes,
         is_active = TRUE
       RETURNING id, username, email, role, created_at`,
      [
        adminId,
        username.trim(),
        fullName.trim(),
        email.trim(),
        role,
        passwordHash,
        totpSecretEncrypted,
        JSON.stringify(backupCodesJson),
      ],
    );

    const saved = res.rows[0];

    // Immutable Platform Audit Record
    try {
      await client.query(
        `INSERT INTO platform_audit_logs (id, admin_id, action, result, details, created_at)
         VALUES ($1, $2, 'PLATFORM_ADMIN_PROVISIONED_CLI', 'SUCCESS', $3, clock_timestamp())`,
        [generateUuidV7(), saved.id, JSON.stringify({ username: saved.username, role: saved.role, email: saved.email })],
      );
    } catch {}

    const otpAuthUri = `otpauth://totp/GebeyaOS%20Platform:${encodeURIComponent(
      saved.username,
    )}?secret=${totpSecret}&issuer=GebeyaOS%20Platform&algorithm=SHA1&digits=6&period=30`;

    console.log('\n[4/4] Provisioning Complete! Save the following credentials securely:');
    console.log('------------------------------------------------------');
    console.log(` Admin ID        : ${saved.id}`);
    console.log(` Username        : ${saved.username}`);
    console.log(` Full Name       : ${fullName}`);
    console.log(` Email           : ${saved.email}`);
    console.log(` Assigned Role   : ${saved.role}`);
    console.log('------------------------------------------------------');
    console.log(' 🔐 TWO-FACTOR AUTHENTICATION (TOTP):');
    console.log(` Base32 Key      : ${totpSecret.match(/.{1,4}/g).join(' ')}`);
    console.log(` OTPAuth URI     : ${otpAuthUri}`);
    console.log('------------------------------------------------------');
    console.log(' 🛡️  10 ONE-TIME BACKUP CODES (Keep in a secure vault):');
    plainBackupCodes.forEach((code, idx) => {
      console.log(`   [${String(idx + 1).padStart(2, '0')}] ${code}`);
    });
    console.log('------------------------------------------------------\n');
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('\n❌ Error provisioning platform administrator:', err.message);
  process.exit(1);
});

