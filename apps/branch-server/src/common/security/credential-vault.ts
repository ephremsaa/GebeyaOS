import * as crypto from 'crypto';

const ALGO = 'aes-256-gcm';

function getVaultKey(): Buffer {
  const raw =
    process.env.ENCRYPTION_KEY ||
    process.env.JWT_SECRET ||
    'gebeyaos-credential-vault-key-2026';
  return crypto.createHash('sha256').update(raw).digest();
}

/**
 * Encrypts a staff/owner password or PIN with AES-256-GCM so an authenticated
 * Supermarket Owner can inspect current credentials when assisting staff.
 */
export function encryptSecret(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, getVaultKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

/**
 * Decrypts a secret stored by encryptSecret(). Returns null if missing or invalid.
 */
export function decryptSecret(payload: string | null | undefined): string | null {
  if (!payload) return null;
  try {
    const parts = payload.split(':');
    if (parts.length !== 3) return null;
    const [ivHex, tagHex, dataHex] = parts;
    const decipher = crypto.createDecipheriv(
      ALGO,
      getVaultKey(),
      Buffer.from(ivHex, 'hex'),
    );
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(dataHex, 'hex')),
      decipher.final(),
    ]);
    return decrypted.toString('utf8');
  } catch {
    return null;
  }
}
