import { Injectable, BadRequestException } from '@nestjs/common';
import * as argon2 from 'argon2';
import * as bcrypt from 'bcryptjs';
import { PasswordValidationResult, PasswordStrengthScore } from '@gebeyaos/shared-types';

const COMMON_PASSWORDS = new Set([
  'password',
  'password123',
  'admin123456',
  '1234567890',
  'qwerty1234',
  'supermarket',
  'gebeyaos2026',
  'letmein123',
  'welcome123',
  'iloveyou123',
  'ethiopia2026',
  'addisababa1',
]);

@Injectable()
export class PasswordPolicyService {
  /**
   * Validate password compliance:
   * - At least 10 characters
   * - Not in common password blacklist
   * - Provides strength score 0-4
   */
  validatePassword(password: string): PasswordValidationResult {
    const errors: string[] = [];

    if (!password || typeof password !== 'string') {
      return { isValid: false, score: 0, errors: ['Password is required'] };
    }

    if (password.length < 10) {
      errors.push('Password must be at least 10 characters long');
    }

    const normalized = password.toLowerCase().trim();
    if (COMMON_PASSWORDS.has(normalized)) {
      errors.push('Password is too common and easily guessable');
    }

    // Calculate strength score
    let score: PasswordStrengthScore = 0;
    const hasLower = /[a-z]/.test(password);
    const hasUpper = /[A-Z]/.test(password);
    const hasNumber = /[0-9]/.test(password);
    const hasSpecial = /[^a-zA-Z0-9]/.test(password);

    let varietyCount = 0;
    if (hasLower) varietyCount++;
    if (hasUpper) varietyCount++;
    if (hasNumber) varietyCount++;
    if (hasSpecial) varietyCount++;

    if (password.length >= 10 && varietyCount >= 2) score = 1;
    if (password.length >= 12 && varietyCount >= 3) score = 2;
    if (password.length >= 14 && varietyCount >= 3) score = 3;
    if (password.length >= 16 && varietyCount === 4) score = 4;

    const isValid = errors.length === 0;
    return { isValid, score, errors };
  }

  /**
   * Enforce password policy or throw BadRequestException
   */
  assertValidPassword(password: string): void {
    const res = this.validatePassword(password);
    if (!res.isValid) {
      throw new BadRequestException(res.errors[0] || 'Password does not meet security requirements');
    }
  }

  /**
   * Hash password using Argon2id
   */
  async hashPassword(password: string): Promise<string> {
    return argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: 2 ** 16, // 64 MB
      timeCost: 3,
      parallelism: 1,
    });
  }

  /**
   * Verify candidate password with Argon2id, with bcrypt backward-compatibility fallback
   */
  async verifyPassword(storedHash: string | null | undefined, candidate: string): Promise<boolean> {
    if (!storedHash || !candidate) return false;
    try {
      if (storedHash.startsWith('$argon2')) {
        return await argon2.verify(storedHash, candidate);
      }
      return await bcrypt.compare(candidate, storedHash);
    } catch {
      return false;
    }
  }
}

