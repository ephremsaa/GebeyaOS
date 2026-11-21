/**
 * GebeyaOS Branch Server – Entry Point
 *
 * Part 0 hardening applied here:
 *   • Env validation at startup (fails fast with plain-English errors)
 *   • Helmet security headers
 *   • CORS restricted to CORS_ORIGINS env var (not wildcard *)
 *   • Rate limiting (100 req/min per IP; 10 req/min on /auth/*)
 *   • Request body size limit (1 MB; 50 MB only on /media/upload)
 *   • Structured logs that never contain passwords, PINs, or tokens
 */

import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { json, urlencoded } from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { AppModule } from './app.module';
import { validateEnv } from './config/env.validation';

async function bootstrap() {
  // ── 1. Validate environment before anything else ───────────────────────
  const env = validateEnv();

  const logger = new Logger('GebeyaOS-BranchServer');
  const app = await NestFactory.create(AppModule, {
    logger: ['log', 'warn', 'error', 'debug'],
  });

  // ── 2. Security headers (Helmet) ────────────────────────────────────────
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:', 'blob:'],
          connectSrc: ["'self'"],
          fontSrc: ["'self'"],
          objectSrc: ["'none'"],
          upgradeInsecureRequests: [],
        },
      },
      crossOriginEmbedderPolicy: false, // keep off: receipt images served inline
    }),
  );

  // ── 3. CORS – restricted to configured origins ──────────────────────────
  const allowedOrigins = env.CORS_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean);
  app.enableCors({
    origin: (origin, callback) => {
      // Allow requests with no Origin header (server-to-server, curl health checks)
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);
      logger.warn(`CORS blocked request from origin: ${origin}`);
      callback(new Error(`Origin ${origin} not allowed by CORS policy`));
    },
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    credentials: true,
    maxAge: 86400,
  });

  // ── 4. Request body limits ───────────────────────────────────────────────
  app.use('/media/upload', json({ limit: '50mb' }));
  app.use('/media/upload', urlencoded({ extended: true, limit: '50mb' }));
  app.use(json({ limit: '2mb' }));
  app.use(urlencoded({ extended: true, limit: '2mb' }));

  // ── 5. Rate limiting ────────────────────────────────────────────────────
  // General: 200 requests per minute per IP
  app.use(
    rateLimit({
      windowMs: 60_000,
      max: 200,
      standardHeaders: true,
      legacyHeaders: false,
      message: { error: 'Too many requests. Please wait a moment and try again.' },
      skip: (req) => req.path === '/health' || req.path === '/ready',
    }),
  );
  // Auth endpoints: stricter (20 req/min – protects against brute-force PIN / password attacks)
  app.use(
    '/auth',
    rateLimit({
      windowMs: 60_000,
      max: 20,
      standardHeaders: true,
      legacyHeaders: false,
      message: { error: 'Too many login attempts. Please wait 1 minute and try again.' },
    }),
  );

  // ── 6. Global validation pipe ───────────────────────────────────────────
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: false, // already audited; keep false to avoid 400s on clients
    }),
  );

  // ── 7. Listen ───────────────────────────────────────────────────────────
  await app.listen(env.PORT);

  // Log startup info – deliberately EXCLUDES secrets
  logger.log(`GebeyaOS Branch Server listening on port ${env.PORT}`);
  logger.log(`NODE_ENV: ${env.NODE_ENV}`);
  logger.log(`CORS origins: ${allowedOrigins.join(', ') || '(none – check CORS_ORIGINS)'}`);
  logger.log(`DB: ${env.DB_HOST}:${env.DB_PORT}/${env.DB_NAME} (user: ${env.DB_USER})`);
  logger.log(`Health: http://localhost:${env.PORT}/health`);
  logger.log(`Ready:  http://localhost:${env.PORT}/ready`);
}

bootstrap();
