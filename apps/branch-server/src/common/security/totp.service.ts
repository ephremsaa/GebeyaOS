import { Injectable } from '@nestjs/common';
import * as crypto from 'crypto';

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Encode(buffer: Buffer): string {
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

function base32Decode(input: string): Buffer {
  const cleanInput = input.toUpperCase().replace(/=+$/, '').replace(/\s+/g, '');
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];

  for (let i = 0; i < cleanInput.length; i++) {
    const idx = BASE32_ALPHABET.indexOf(cleanInput[i]);
    if (idx === -1) continue;

    value = (value << 5) | idx;
    bits += 5;

    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }

  return Buffer.from(bytes);
}

@Injectable()
export class TotpService {
  private readonly encryptionKey: Buffer;

  constructor() {
    const rawKey = process.env.TOTP_ENCRYPTION_KEY || 'gebeyaos-totp-master-encryption-key-2026';
    this.encryptionKey = crypto.createHash('sha256').update(rawKey).digest();
  }

  /**
   * Generate a random 20-byte secret, Base32 encoded (160 bits standard for SHA1 TOTP)
   */
  generateSecret(): string {
    const bytes = crypto.randomBytes(20);
    return base32Encode(bytes);
  }

  /**
   * Build otpauth:// URI for authenticator QR enrollment
   */
  generateOtpAuthUri(account: string, issuer: string, secret: string): string {
    const encAccount = encodeURIComponent(account);
    const encIssuer = encodeURIComponent(issuer);
    return `otpauth://totp/${encIssuer}:${encAccount}?secret=${secret}&issuer=${encIssuer}&algorithm=SHA1&digits=6&period=30`;
  }

  /**
   * Compute 6-digit TOTP code for a secret at a specific Unix timestamp (seconds)
   */
  generateCode(secret: string, timestampSeconds: number = Math.floor(Date.now() / 1000)): string {
    const timeStep = Math.floor(timestampSeconds / 30);
    const key = base32Decode(secret);

    const buffer = Buffer.alloc(8);
    buffer.writeBigInt64BE(BigInt(timeStep));

    const hmac = crypto.createHmac('sha1', key).update(buffer).digest();
    const offset = hmac[hmac.length - 1] & 0x0f;

    const binary =
      ((hmac[offset] & 0x7f) << 24) |
      ((hmac[offset + 1] & 0xff) << 16) |
      ((hmac[offset + 2] & 0xff) << 8) |
      (hmac[offset + 3] & 0xff);

    const otp = binary % 1000000;
    return otp.toString().padStart(6, '0');
  }

  /**
   * Verify TOTP code with +/- 1 time-step drift tolerance (prevents false negatives on clock jitter)
   */
  verifyCode(secret: string, code: string, timestampSeconds: number = Math.floor(Date.now() / 1000)): boolean {
    if (!secret || !code) return false;
    const cleanCode = code.trim().replace(/\s+/g, '');
    if (cleanCode.length !== 6 || !/^\d{6}$/.test(cleanCode)) return false;

    // Check steps: -1 (-30s), 0 (current), +1 (+30s)
    for (let step = -1; step <= 1; step++) {
      const expected = this.generateCode(secret, timestampSeconds + step * 30);
      if (crypto.timingSafeEqual(Buffer.from(cleanCode), Buffer.from(expected))) {
        return true;
      }
    }
    return false;
  }

  /**
   * Generate 10 single-use backup codes (format: XXXX-XXXX) and their SHA-256 hashes
   */
  generateBackupCodes(): { plainCodes: string[]; hashedCodes: string[] } {
    const plainCodes: string[] = [];
    const hashedCodes: string[] = [];

    for (let i = 0; i < 10; i++) {
      const p1 = crypto.randomBytes(2).toString('hex').toUpperCase();
      const p2 = crypto.randomBytes(2).toString('hex').toUpperCase();
      const code = `${p1}-${p2}`;
      plainCodes.push(code);
      hashedCodes.push(this.hashBackupCode(code));
    }

    return { plainCodes, hashedCodes };
  }

  hashBackupCode(code: string): string {
    const clean = code.trim().replace(/[-\s]/g, '').toUpperCase();
    return crypto.createHash('sha256').update(clean).digest('hex');
  }

  /**
   * Verify a backup code against an array of hashed backup codes.
   * If matched, returns { isValid: true, remainingHashedCodes: string[] }.
   */
  verifyAndConsumeBackupCode(
    candidateCode: string,
    existingHashedCodes: string[],
  ): { isValid: boolean; remainingHashedCodes: string[] } {
    if (!candidateCode || !existingHashedCodes || existingHashedCodes.length === 0) {
      return { isValid: false, remainingHashedCodes: existingHashedCodes || [] };
    }

    const candidateHash = this.hashBackupCode(candidateCode);
    const index = existingHashedCodes.indexOf(candidateHash);

    if (index === -1) {
      return { isValid: false, remainingHashedCodes: existingHashedCodes };
    }

    // Code matched -> Remove it (single use)
    const remaining = [...existingHashedCodes];
    remaining.splice(index, 1);
    return { isValid: true, remainingHashedCodes: remaining };
  }

  /**
   * Encrypt secret at rest using AES-256-GCM
   */
  encryptSecret(plainSecret: string): string {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.encryptionKey, iv);
    let encrypted = cipher.update(plainSecret, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');
    return `${iv.toString('hex')}:${authTag}:${encrypted}`;
  }

  /**
   * Decrypt secret at rest using AES-256-GCM
   */
  decryptSecret(encryptedPayload: string): string {
    const parts = encryptedPayload.split(':');
    if (parts.length !== 3) {
      throw new Error('Invalid encrypted secret format');
    }
    const [ivHex, authTagHex, encryptedHex] = parts;
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      this.encryptionKey,
      Buffer.from(ivHex, 'hex'),
    );
    decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
    let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }
}

