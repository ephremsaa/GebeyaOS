import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PasswordPolicyService } from '../../src/common/security/password-policy.service';
import { PinHasherService } from '../../src/common/security/pin-hasher.service';
import { TotpService } from '../../src/common/security/totp.service';
import { TokenService, TENANT_ISSUER, TENANT_AUDIENCE, PLATFORM_ISSUER, PLATFORM_AUDIENCE, TENANT_JWT_SECRET, PLATFORM_JWT_SECRET } from '../../src/common/security/token.service';
import { RateLimiterService } from '../../src/common/security/rate-limiter.service';
import { AuditSecurityService } from '../../src/common/security/audit-security.service';
import * as jwt from 'jsonwebtoken';

describe('Auth & Security Core (Step 1)', () => {
  describe('1. Password Policy & Argon2id Hashing', () => {
    let policy: PasswordPolicyService;

    beforeEach(() => {
      policy = new PasswordPolicyService();
    });

    it('rejects passwords shorter than 10 characters', () => {
      const res = policy.validatePassword('Short1!');
      expect(res.isValid).toBe(false);
      expect(res.errors).toContain('Password must be at least 10 characters long');
    });

    it('rejects common passwords from the blacklist', () => {
      const res1 = policy.validatePassword('password123');
      expect(res1.isValid).toBe(false);
      expect(res1.errors).toContain('Password is too common and easily guessable');

      const res2 = policy.validatePassword('admin123456');
      expect(res2.isValid).toBe(false);
      expect(res2.errors).toContain('Password is too common and easily guessable');
    });

    it('scores password strength accurately from 0 to 4', () => {
      const weak = policy.validatePassword('simplepass'); // short & simple
      expect(weak.score).toBe(0);

      const moderate = policy.validatePassword('SecurePass2026'); // 14 chars, lower + upper + number
      expect(moderate.score).toBeGreaterThanOrEqual(2);

      const strong = policy.validatePassword('GebeyaOS-Ethiopia-2026!#'); // 24 chars, all 4 categories
      expect(strong.score).toBe(4);
      expect(strong.isValid).toBe(true);
    });

    it('hashes passwords using Argon2id and verifies successfully', async () => {
      const rawPassword = 'StrongPassword2026!';
      const hash = await policy.hashPassword(rawPassword);

      expect(hash.startsWith('$argon2id$')).toBe(true);

      const isValid = await policy.verifyPassword(hash, rawPassword);
      expect(isValid).toBe(true);

      const isInvalid = await policy.verifyPassword(hash, 'WrongPassword2026!');
      expect(isInvalid).toBe(false);
    });
  });

  describe('2. POS Cashier PIN Hasher (Salt & Pepper)', () => {
    let pinHasher: PinHasherService;

    beforeEach(() => {
      pinHasher = new PinHasherService();
    });

    it('validates 4 to 6 numeric digits PINs strictly', () => {
      expect(pinHasher.validatePin('1234')).toBe(true);
      expect(pinHasher.validatePin('123456')).toBe(true);
      expect(pinHasher.validatePin('123')).toBe(false); // too short
      expect(pinHasher.validatePin('1234567')).toBe(false); // too long
      expect(pinHasher.validatePin('abcd')).toBe(false); // non-numeric
    });

    it('hashes PIN with unique per-user salt and server pepper', async () => {
      const pin = '4829';
      const salt1 = pinHasher.generateSalt();
      const salt2 = pinHasher.generateSalt();

      expect(salt1).not.toBe(salt2);

      const hash1 = await pinHasher.hashPin(pin, salt1);
      const hash2 = await pinHasher.hashPin(pin, salt2);

      // Same PIN with different salts yields distinct hashes
      expect(hash1).not.toBe(hash2);

      // Verification succeeds with correct salt
      expect(await pinHasher.verifyPin(pin, salt1, hash1)).toBe(true);
      // Fails with wrong salt or wrong PIN
      expect(await pinHasher.verifyPin(pin, salt2, hash1)).toBe(false);
      expect(await pinHasher.verifyPin('9999', salt1, hash1)).toBe(false);
    });
  });

  describe('3. RFC 6238 TOTP 2FA & Secret Encryption', () => {
    let totp: TotpService;

    beforeEach(() => {
      totp = new TotpService();
    });

    it('generates Base32 secrets and valid otpauth URI', () => {
      const secret = totp.generateSecret();
      expect(secret).toMatch(/^[A-Z2-7]{32}$/);

      const uri = totp.generateOtpAuthUri('admin@gebeyaos.et', 'GebeyaOS Platform', secret);
      expect(uri.startsWith('otpauth://totp/')).toBe(true);
      expect(uri).toContain('secret=' + secret);
      expect(uri).toContain('issuer=GebeyaOS%20Platform');
    });

    it('generates and verifies 6-digit TOTP code with time drift tolerance', () => {
      const secret = totp.generateSecret();
      const nowSeconds = Math.floor(Date.now() / 1000);

      const currentCode = totp.generateCode(secret, nowSeconds);
      expect(currentCode).toMatch(/^\d{6}$/);

      // Current step verifies
      expect(totp.verifyCode(secret, currentCode, nowSeconds)).toBe(true);

      // Past step (-30s) drift tolerance verifies
      const pastCode = totp.generateCode(secret, nowSeconds - 30);
      expect(totp.verifyCode(secret, pastCode, nowSeconds)).toBe(true);

      // Future step (+30s) drift tolerance verifies
      const futureCode = totp.generateCode(secret, nowSeconds + 30);
      expect(totp.verifyCode(secret, futureCode, nowSeconds)).toBe(true);

      // Step outside window (-60s) fails
      const expiredCode = totp.generateCode(secret, nowSeconds - 60);
      expect(totp.verifyCode(secret, expiredCode, nowSeconds)).toBe(false);
    });

    it('generates 10 single-use backup codes and consumes them securely', () => {
      const { plainCodes, hashedCodes } = totp.generateBackupCodes();
      expect(plainCodes.length).toBe(10);
      expect(hashedCodes.length).toBe(10);

      const codeToUse = plainCodes[0];

      // Consume first code
      const result = totp.verifyAndConsumeBackupCode(codeToUse, hashedCodes);
      expect(result.isValid).toBe(true);
      expect(result.remainingHashedCodes.length).toBe(9);

      // Attempting to reuse the exact same code fails (single-use)
      const reuseAttempt = totp.verifyAndConsumeBackupCode(codeToUse, result.remainingHashedCodes);
      expect(reuseAttempt.isValid).toBe(false);
      expect(reuseAttempt.remainingHashedCodes.length).toBe(9);
    });

    it('encrypts and decrypts TOTP secret at rest with AES-256-GCM', () => {
      const secret = totp.generateSecret();
      const encrypted = totp.encryptSecret(secret);

      expect(encrypted).not.toBe(secret);
      expect(encrypted.split(':').length).toBe(3); // iv:tag:ciphertext

      const decrypted = totp.decryptSecret(encrypted);
      expect(decrypted).toBe(secret);
    });
  });

  describe('4. Token Service, Rotation & Reuse Detection', () => {
    let tokenService: TokenService;
    let mockDb: any;

    beforeEach(() => {
      mockDb = {
        query: vi.fn(),
        withTransaction: vi.fn(async (cb: any) => cb(mockDb)),
      };
      tokenService = new TokenService(mockDb);
    });

    it('issues tenant access token with correct claims and audience', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [{ token_version: 1, is_active: true }] }) // user token version
        .mockResolvedValueOnce({ rows: [] }); // insert refresh_tokens

      const user: any = {
        id: 'usr-1',
        tenantId: 'ten-1',
        tenantSlug: 'kerod',
        tenantName: 'Kerod Supermarket',
        username: 'cashier1',
        role: 'CASHIER',
        branchId: 'br-1',
        permissions: ['pos:sale:create'],
      };

      const tokens = await tokenService.createTenantSessionTokens(user);
      expect(tokens.accessToken).toBeDefined();
      expect(tokens.refreshToken).toBeDefined();
      expect(tokens.familyId).toBeDefined();

      const decoded: any = jwt.verify(tokens.accessToken, TENANT_JWT_SECRET, {
        issuer: TENANT_ISSUER,
        audience: TENANT_AUDIENCE,
      });

      expect(decoded.sub).toBe('usr-1');
      expect(decoded.tenantId).toBe('ten-1');
      expect(decoded.role).toBe('CASHIER');
      expect(decoded.tokenVersion).toBe(1);
    });

    it('issues platform token with distinct PLATFORM_JWT_SECRET and audience', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [{ token_version: 1 }] })
        .mockResolvedValueOnce({ rows: [] });

      const admin: any = {
        id: 'adm-1',
        username: 'platform_admin',
        email: 'admin@gebeyaos.et',
        role: 'SUPER_ADMIN',
      };

      const tokens = await tokenService.createPlatformSessionTokens(admin);
      const decoded: any = jwt.verify(tokens.accessToken, PLATFORM_JWT_SECRET, {
        issuer: PLATFORM_ISSUER,
        audience: PLATFORM_AUDIENCE,
      });

      expect(decoded.sub).toBe('adm-1');
      expect(decoded.isPlatformAdmin).toBe(true);

      // Verify that verifying with TENANT_JWT_SECRET fails (cross-boundary rejection)
      expect(() => {
        jwt.verify(tokens.accessToken, TENANT_JWT_SECRET);
      }).toThrow();
    });

    it('rotates refresh token within the same family', async () => {
      const familyId = 'fam-123';
      const userId = 'usr-1';
      const rawSecret = 'secret123456';
      const rawToken = `${userId}.${familyId}.${rawSecret}`;

      mockDb.query
        // 1. find token
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'tok-1',
              tenant_id: 'ten-1',
              user_id: userId,
              family_id: familyId,
              expires_at: new Date(Date.now() + 86400000),
              revoked_at: null,
              username: 'owner',
              full_name: 'Abebe',
              role_name: 'OWNER',
              is_active: true,
              token_version: 1,
            },
          ],
        })
        // 2. revoke old token
        .mockResolvedValueOnce({ rows: [] })
        // 3. fetch token version for new token
        .mockResolvedValueOnce({ rows: [{ token_version: 1 }] })
        // 4. insert new refresh token in family
        .mockResolvedValueOnce({ rows: [] });

      const rotated = await tokenService.rotateTenantRefreshToken(rawToken);
      expect(rotated.accessToken).toBeDefined();
      expect(rotated.refreshToken).toContain(`.${familyId}.`);
    });

    it('detects refresh token reuse and immediately revokes entire token family', async () => {
      const familyId = 'fam-compromised';
      const userId = 'usr-1';
      const rawSecret = 'oldsecret';
      const rawToken = `${userId}.${familyId}.${rawSecret}`;

      mockDb.query
        // 1. find token — already revoked!
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'tok-old',
              tenant_id: 'ten-1',
              user_id: userId,
              family_id: familyId,
              expires_at: new Date(Date.now() + 86400000),
              revoked_at: new Date(Date.now() - 3600000), // revoked an hour ago!
              is_active: true,
            },
          ],
        })
        // 2. update: revoke entire family!
        .mockResolvedValueOnce({ rows: [] })
        // 3. audit alert
        .mockResolvedValueOnce({ rows: [] });

      await expect(tokenService.rotateTenantRefreshToken(rawToken)).rejects.toThrow(
        /Session compromised: refresh token reuse detected/,
      );

      // Verify that DB query revoked ALL tokens for that family_id
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE refresh_tokens SET revoked_at = clock_timestamp() WHERE family_id = $1'),
        [familyId],
        'ten-1',
      );
    });
  });

  describe('5. Rate Limiting & Account Lockout', () => {
    let rateLimiter: RateLimiterService;
    let mockDb: any;

    beforeEach(() => {
      mockDb = {
        query: vi.fn(),
      };
      rateLimiter = new RateLimiterService(mockDb);
      rateLimiter.resetIpRateLimits();
    });

    it('enforces IP rate limiting on repeated requests', () => {
      const ip = '192.168.1.100';
      for (let i = 0; i < 30; i++) {
        rateLimiter.checkIpRateLimit(ip);
      }
      expect(() => rateLimiter.checkIpRateLimit(ip)).toThrow(/Too many requests from this network/);
    });

    it('locks account after 5 failed login attempts for 15 minutes', async () => {
      mockDb.query.mockResolvedValue({ rows: [] });

      // Attempt 1 to 4: increments counter
      const attempt1 = await rateLimiter.recordFailedAttempt('user-1', 0, 'ten-1');
      expect(attempt1.isLocked).toBe(false);
      expect(attempt1.remainingAttempts).toBe(4);

      const attempt4 = await rateLimiter.recordFailedAttempt('user-1', 3, 'ten-1');
      expect(attempt4.isLocked).toBe(false);
      expect(attempt4.remainingAttempts).toBe(1);

      // 5th attempt: triggers 15 min lockout
      const attempt5 = await rateLimiter.recordFailedAttempt('user-1', 4, 'ten-1');
      expect(attempt5.isLocked).toBe(true);
      expect(attempt5.remainingAttempts).toBe(0);
      expect(attempt5.lockedUntil).toBeDefined();

      // Check assertNotLocked throws when locked
      expect(() => rateLimiter.assertNotLocked(attempt5.lockedUntil)).toThrow(/Account is temporarily locked/);
    });
  });

  describe('6. Immutable Audit Security Logging', () => {
    let audit: AuditSecurityService;
    let mockDb: any;

    beforeEach(() => {
      mockDb = {
        query: vi.fn().mockResolvedValue({ rows: [] }),
      };
      audit = new AuditSecurityService(mockDb);
    });

    it('redacts sensitive fields (passwords, pins, secrets) from audit records', async () => {
      await audit.logAuthEvent({
        tenantId: 'ten-1',
        userId: 'usr-1',
        action: 'USER_LOGIN',
        ipAddress: '10.0.0.1',
        result: 'SUCCESS',
        details: {
          username: 'admin',
          password: 'SecretPassword123!',
          cashierPin: '1234',
          deviceToken: 'token-xyz',
          normalData: 'checkout-lane-1',
        },
      });

      expect(mockDb.query).toHaveBeenCalled();
      const callArgs = mockDb.query.mock.calls[0][1];
      const detailsArg = JSON.parse(callArgs[10]);

      expect(detailsArg.password).toBe('[REDACTED]');
      expect(detailsArg.cashierPin).toBe('[REDACTED]');
      expect(detailsArg.deviceToken).toBe('[REDACTED]');
      expect(detailsArg.username).toBe('admin');
      expect(detailsArg.normalData).toBe('checkout-lane-1');
    });
  });
});

