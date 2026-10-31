import { Injectable, BadRequestException } from '@nestjs/common';
import * as crypto from 'crypto';
import * as argon2 from 'argon2';

const DEFAULT_PEPPER = process.env.PIN_PEPPER || 'gebeyaos-pos-terminal-pepper-v1-2026';

@Injectable()
export class PinHasherService {
  /**
   * Validate that PIN is 4 to 6 numeric digits
   */
  validatePin(pin: string): boolean {
    return /^\d{4,6}$/.test(pin);
  }

  assertValidPin(pin: string): void {
    if (!this.validatePin(pin)) {
      throw new BadRequestException('Cashier PIN must be between 4 and 6 numeric digits');
    }
  }

  /**
   * Generate a random cryptographically secure 16-byte salt (hex)
   */
  generateSalt(): string {
    return crypto.randomBytes(16).toString('hex');
  }

  /**
   * Hash PIN with per-user salt and server pepper using Argon2id
   */
  async hashPin(pin: string, userSalt: string): Promise<string> {
    this.assertValidPin(pin);
    const combined = `${pin}:${userSalt}:${DEFAULT_PEPPER}`;
    return argon2.hash(combined, {
      type: argon2.argon2id,
      memoryCost: 2 ** 14, // 16 MB for fast terminal switching
      timeCost: 2,
    });
  }

  /**
   * Verify PIN against stored hash with per-user salt and server pepper
   */
  async verifyPin(pin: string, userSalt: string | null | undefined, storedHash: string | null | undefined): Promise<boolean> {
    if (!pin || !storedHash) return false;
    try {
      if (userSalt) {
        const combined = `${pin}:${userSalt}:${DEFAULT_PEPPER}`;
        if (storedHash.startsWith('$argon2')) {
          return await argon2.verify(storedHash, combined);
        }
      }
      // Backward compatibility for raw argon2 or legacy bcrypt hashes without per-user salt
      if (storedHash.startsWith('$argon2')) {
        return await argon2.verify(storedHash, pin);
      }
      return false;
    } catch {
      return false;
    }
  }
}

