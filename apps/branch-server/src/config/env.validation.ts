/**
 * GebeyaOS Branch Server – Environment Validation (Part 0, Fix #2)
 * Validates all required environment variables at startup using plain checks.
 * Fails fast with a clear plain-English message so the operator knows exactly
 * what to fix before the app accepts any traffic.
 *
 * We intentionally avoid a Zod/Joi dependency here (keeps the runtime lean),
 * but the validation is still exhaustive.
 */

export interface BranchServerEnv {
  NODE_ENV: string;
  PORT: number;
  DB_HOST: string;
  DB_PORT: number;
  DB_USER: string;
  DB_PASSWORD: string;
  DB_NAME: string;
  JWT_SECRET: string;
  ENCRYPTION_KEY: string;
  CORS_ORIGINS: string;
}

/** Known example / placeholder values that must NEVER be used in production */
const FORBIDDEN_SECRETS = new Set([
  'changeme',
  'secret',
  'password',
  '123456',
  'your_jwt_secret_here',
  'your_encryption_key_here',
  'replace_me',
  'example',
  'test',
  'dev',
]);

function isForbiddenSecret(value: string): boolean {
  return FORBIDDEN_SECRETS.has(value.toLowerCase().trim());
}

export function validateEnv(): BranchServerEnv {
  const errors: string[] = [];

  // ── Required string fields ──────────────────────────────────────────────
  const requiredStrings: Array<[string, string]> = [
    ['DB_HOST',       'PostgreSQL host (e.g. localhost or 127.0.0.1)'],
    ['DB_USER',       'PostgreSQL username'],
    ['DB_PASSWORD',   'PostgreSQL password'],
    ['DB_NAME',       'PostgreSQL database name (e.g. gebeyaos_branch)'],
    ['JWT_SECRET',    '32+ random bytes for JWT signing (run: openssl rand -hex 32)'],
    ['ENCRYPTION_KEY','32+ random bytes for data encryption (run: openssl rand -hex 32)'],
  ];

  for (const [key, hint] of requiredStrings) {
    const val = process.env[key];
    if (!val || val.trim() === '') {
      errors.push(`  ✗ ${key} is missing  → ${hint}`);
    }
  }

  // ── Production-only extra checks ────────────────────────────────────────
  const isProd = process.env.NODE_ENV === 'production';

  if (isProd) {
    const secretFields = ['DB_PASSWORD', 'JWT_SECRET', 'ENCRYPTION_KEY'];
    for (const field of secretFields) {
      const val = process.env[field] ?? '';
      if (isForbiddenSecret(val)) {
        errors.push(
          `  ✗ ${field} contains a known example/placeholder value and cannot be used in production.` +
          `\n      Run: node -e "process.stdout.write(require('crypto').randomBytes(32).toString('hex'))" to generate one.`,
        );
      }
      if (val.length < 32) {
        errors.push(`  ✗ ${field} is too short (${val.length} chars). Production requires ≥ 32 characters.`);
      }
    }
  }

  // ── Numeric fields ───────────────────────────────────────────────────────
  const portRaw = process.env.PORT ?? '3001';
  const dbPortRaw = process.env.DB_PORT ?? '5432';

  const port = parseInt(portRaw, 10);
  const dbPort = parseInt(dbPortRaw, 10);

  if (isNaN(port) || port < 1 || port > 65535) {
    errors.push(`  ✗ PORT must be a valid port number (got: "${portRaw}")`);
  }
  if (isNaN(dbPort) || dbPort < 1 || dbPort > 65535) {
    errors.push(`  ✗ DB_PORT must be a valid port number (got: "${dbPortRaw}")`);
  }

  // ── Fail fast ────────────────────────────────────────────────────────────
  if (errors.length > 0) {
    const lines = [
      '',
      '╔══════════════════════════════════════════════════════════════╗',
      '║   GebeyaOS Branch Server – STARTUP CONFIGURATION ERROR      ║',
      '╚══════════════════════════════════════════════════════════════╝',
      '',
      'The following required environment variables are missing or invalid:',
      '',
      ...errors,
      '',
      'Copy apps/branch-server/.env.example to apps/branch-server/.env',
      'and fill in the values before starting the server.',
      '',
    ];
    console.error(lines.join('\n'));
    process.exit(1);
  }

  return {
    NODE_ENV:       process.env.NODE_ENV ?? 'development',
    PORT:           port,
    DB_HOST:        process.env.DB_HOST!,
    DB_PORT:        dbPort,
    DB_USER:        process.env.DB_USER!,
    DB_PASSWORD:    process.env.DB_PASSWORD!,
    DB_NAME:        process.env.DB_NAME!,
    JWT_SECRET:     process.env.JWT_SECRET!,
    ENCRYPTION_KEY: process.env.ENCRYPTION_KEY!,
    CORS_ORIGINS:   process.env.CORS_ORIGINS ?? 'http://localhost:3000',
  };
}
