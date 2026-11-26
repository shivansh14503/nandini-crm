import 'dotenv/config';
import os from 'node:os';
import path from 'node:path';
import { z } from 'zod';
import { resolveDatabaseUrl } from './databaseUrl.js';
import { configureSecretBox, parseKeyRing, SecretBoxError } from '../services/secretBox.js';

/** Used only outside production so local dev starts without a secret; production must set JWT_SECRET. */
const DEV_JWT_SECRET = 'dev-only-insecure-jwt-secret-do-not-use-in-production';

/** `KEY=` (blank in .env) reads as not set. */
const blankToUndefined = (value: unknown) => (typeof value === 'string' && value.trim() === '' ? undefined : value);
/** Optional text setting; blank = not set. */
const optionalText = z.preprocess(blankToUndefined, z.string().trim().optional());

const envSchema = z
    .object({
        NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
        PORT: z.coerce.number().int().positive().default(8008),
        CLIENT_ORIGIN: z.url().default('http://localhost:8007'),
        LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),

        JWT_SECRET: z.string().min(1).optional(),
        /** Lifetime of a login session: JWT expiry, auth cookie max-age and Redis session TTL. */
        SESSION_TTL_SECONDS: z.coerce.number().int().positive().default(8 * 60 * 60),

        DATABASE_URL: z.string({ error: 'DATABASE_URL (or DB_SERVER + DB_* variables) is required.' }).min(1),
        REDIS_URL: z.string().min(1).default('redis://localhost:6379'),
        /** Ping the database this often so pooled connections (and Azure SQL Serverless) never go cold. 0 disables. */
        DB_KEEPALIVE_INTERVAL_MS: z.coerce.number().int().min(0).default(0),

        LOGIN_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(10),
        LOGIN_RATE_LIMIT_WINDOW_SECONDS: z.coerce.number().int().positive().default(15 * 60),

        /** Timezone of wall-clock values entered in forms (ticket due dates) and of audit display times. */
        BUSINESS_TIMEZONE: z
            .string()
            .default('Asia/Kolkata')
            .refine((tz) => {
                try {
                    new Intl.DateTimeFormat('en-US', { timeZone: tz });
                    return true;
                } catch {
                    return false;
                }
            }, 'BUSINESS_TIMEZONE must be a valid IANA timezone (e.g. Asia/Kolkata).'),
        /** Run the BullMQ workers inside the API process (set false when running `npm run worker` separately). */
        RUN_WORKERS: z
            .enum(['true', 'false'])
            .default('true')
            .transform((value) => value === 'true'),

        /** PDF generation (src/modules/pdf): concurrent Chromium pages, per-render timeout, Redis cache TTL (0 disables). */
        PDF_MAX_CONCURRENCY: z.coerce.number().int().min(1).max(16).default(3),
        PDF_RENDER_TIMEOUT_MS: z.coerce.number().int().min(1000).max(120_000).default(15_000),
        PDF_CACHE_TTL_SECONDS: z.coerce.number().int().min(0).max(86_400).default(600),
        /** Use an installed Chrome / Chromium instead of the browser Puppeteer downloads. */
        PUPPETEER_EXECUTABLE_PATH: z.string().trim().min(1).optional(),
        /** Launch Chromium with --no-sandbox (needed in most containers that run as root). */
        PDF_CHROMIUM_NO_SANDBOX: z
            .enum(['true', 'false'])
            .default('false')
            .transform((value) => value === 'true'),

        /** Check saved lead / contact / organization emails in the background (syntax, typos, disposable, DNS). */
        EMAIL_VERIFICATION_ENABLED: z
            .enum(['true', 'false'])
            .default('true')
            .transform((value) => value === 'true'),
        /** QuickEmailVerification API key: adds the mailbox-exists check. Without it only the free checks run. */
        QUICKEMAILVERIFICATION_API_KEY: z.string().trim().min(1).optional(),
        /**
         * Admin bulk checks of at least this many addresses use the provider's List API (one CSV upload, polled);
         * smaller ones call the single-address API per address (the provider recommends that up to 1,000).
         */
        EMAIL_VERIFICATION_LIST_API_MIN: z.coerce.number().int().min(1).max(1_000_000).default(1_000),

        /** Audit log exports (kept 24 h). Shared storage when workers run in their own process. */
        AUDIT_EXPORT_DIR: z.string().trim().min(1).optional(),
        /** Ledger digests of the audit log: outside the database server, on storage its admins can't change. */
        AUDIT_DIGEST_DIR: z.string().trim().min(1).optional(),
        /** Longest a "Verify integrity" run may take; it reads the whole ledger (~100 s per million entries). */
        AUDIT_VERIFY_TIMEOUT_MS: z.coerce.number().int().min(60_000).max(6 * 60 * 60 * 1000).default(30 * 60 * 1000),

        /** Notifications (navbar bell): read rows older than this many days are deleted nightly, any row after twice that. */
        NOTIFICATION_RETENTION_DAYS: z.coerce.number().int().min(1).max(3650).default(90),
        /** The 9 AM morning summary email (it also needs MAIL_ENABLED and SMTP_HOST). */
        MORNING_SUMMARY_ENABLED: z
            .enum(['true', 'false'])
            .default('true')
            .transform((value) => value === 'true'),
        /** When the morning summary goes out, in BUSINESS_TIMEZONE (cron: minute hour day-of-month month day-of-week). */
        MORNING_SUMMARY_CRON: z
            .string()
            .trim()
            .default('0 9 * * 1-6')
            .refine((pattern) => [5, 6].includes(pattern.split(/\s+/).length), 'MORNING_SUMMARY_CRON must be a cron pattern such as "0 9 * * 1-6".'),
        /** Users with nothing due get no morning summary. */
        MORNING_SUMMARY_SKIP_EMPTY: z
            .enum(['true', 'false'])
            .default('true')
            .transform((value) => value === 'true'),

        /** Outgoing email (src/services/mail.service.ts). Off by default: nothing is sent until this is true and SMTP_HOST is set. */
        MAIL_ENABLED: z
            .enum(['true', 'false'])
            .default('false')
            .transform((value) => value === 'true'),
        /** SMTP server, e.g. smtp-relay.gmail.com (Google Workspace SMTP relay) or smtp.gmail.com (a mailbox + app password). */
        SMTP_HOST: optionalText,
        SMTP_PORT: z.coerce.number().int().min(1).max(65_535).default(587),
        /** true = TLS from the first byte (port 465); false = STARTTLS upgrade (port 587). */
        SMTP_SECURE: z
            .enum(['true', 'false'])
            .default('false')
            .transform((value) => value === 'true'),
        /** Optional: the relay authenticates the server by its IP address; a mailbox needs both. */
        SMTP_USER: optionalText,
        SMTP_PASS: optionalText,
        /** Host name sent in EHLO (Google's relay refuses a bare `localhost`), e.g. crm.nandiniinfosys.com. */
        SMTP_EHLO_NAME: optionalText,
        MAIL_FROM: z.string().trim().min(3).default('Nandini CRM <crm@nandiniinfosys.com>'),
        /** Address of the web app as users open it, for links in emails. Defaults to CLIENT_ORIGIN. */
        APP_PUBLIC_URL: z.preprocess(blankToUndefined, z.url().optional()),
        /** EmailLog rows older than this many days are deleted nightly. */
        EMAIL_LOG_RETENTION_DAYS: z.coerce.number().int().min(1).max(3650).default(180),

        /**
         * Integrations (Admin › API Integrations, calendar sync): the key ring that seals client secrets and OAuth
         * tokens in the database (src/services/secretBox.ts). One base64 32-byte key, or `kid:base64,…` (first =
         * active). Unset → the app runs and integrations are "not ready"; malformed → start-up fails.
         */
        INTEGRATIONS_ENCRYPTION_KEY: z.preprocess(blankToUndefined, z.string().trim().optional()).superRefine((value, ctx) => {
            try {
                parseKeyRing(value);
            } catch (err) {
                ctx.addIssue({ code: 'custom', message: err instanceof SecretBoxError ? err.message : 'Invalid key ring.' });
            }
        }),
        /**
         * Public base URL of this API as Google / Microsoft reach it (no trailing slash): calendar webhook URLs (P2-7)
         * are built from it. Default http://localhost:<PORT> outside production. Admin-managed calendar sync (P2-2b)
         * doesn't need it. Production: https://crm.nandiniinfosys.com.
         */
        PUBLIC_API_URL: z.preprocess(blankToUndefined, z.url().optional()),
        /**
         * Dev-only in-memory calendar provider `fake` in admin mode: it serves every company domain no enabled real provider
         * claims, so enrolment → check runs end to end without Google or Microsoft. Ignored,
         * with a start-up warning, when NODE_ENV=production. Never set it on the shared server.
         */
        CALENDAR_FAKE_PROVIDER: z
            .enum(['true', 'false'])
            .default('false')
            .transform((value) => value === 'true'),

        /**
         * Booking links (Calendar Phase 4): the key that signs the times a public booking page offers (slot tokens,
         * booking-links/bookingLink.token.ts). Optional: unset → a key derived from JWT_SECRET (HKDF, its own purpose).
         * Set it (≥ 32 random characters) to rotate slot tokens without signing everyone out. Same value on every API
         * instance. Changing it only voids times shown in the last 30 minutes.
         */
        BOOKING_SIGNING_KEY: z.preprocess(blankToUndefined, z.string().min(32, 'BOOKING_SIGNING_KEY must be at least 32 characters.').optional()),
    })
    .superRefine((env, ctx) => {
        if (env.NODE_ENV === 'production' && (!env.JWT_SECRET || env.JWT_SECRET.length < 32)) {
            ctx.addIssue({
                code: 'custom',
                path: ['JWT_SECRET'],
                message: 'JWT_SECRET must be set to at least 32 characters in production.',
            });
        }
    });

const parsed = envSchema.safeParse({ ...process.env, DATABASE_URL: resolveDatabaseUrl() });

if (!parsed.success) {
    const details = parsed.error.issues.map((issue) => `  • ${issue.path.join('.') || 'env'}: ${issue.message}`).join('\n');
    throw new Error(`Invalid environment configuration:\n${details}`);
}

const env = parsed.data;

/** Parsed again here (the schema only validated it): the ring the secret box seals and opens with. */
const integrationsKeyRing = parseKeyRing(env.INTEGRATIONS_ENCRYPTION_KEY);
configureSecretBox(integrationsKeyRing);
const publicApiUrl = (env.PUBLIC_API_URL ?? (env.NODE_ENV === 'production' ? undefined : `http://localhost:${env.PORT}`))?.replace(/\/+$/, '');

/**
 * Why integrations can't be used yet (Admin › API Integrations shows it), or null when they can. Admin-managed calendar
 * sync (P2-2b) needs no redirect URI, so PUBLIC_API_URL no longer gates readiness (webhooks, P2-7, still need it).
 */
export type IntegrationsNotReadyReason = 'key_missing';
const integrationsReadyReason: IntegrationsNotReadyReason | null = !integrationsKeyRing ? 'key_missing' : null;

export const ENV = {
    NODE_ENV: env.NODE_ENV,
    IS_PRODUCTION: env.NODE_ENV === 'production',
    PORT: env.PORT,
    CLIENT_ORIGIN: env.CLIENT_ORIGIN,
    LOG_LEVEL: env.LOG_LEVEL,
    JWT_SECRET: env.JWT_SECRET ?? DEV_JWT_SECRET,
    /** True when the insecure development secret is in use (logged as a warning at startup). */
    USING_DEV_JWT_SECRET: !env.JWT_SECRET,
    SESSION_TTL_SECONDS: env.SESSION_TTL_SECONDS,
    DATABASE_URL: env.DATABASE_URL,
    DB_KEEPALIVE_INTERVAL_MS: env.DB_KEEPALIVE_INTERVAL_MS,
    REDIS_URL: env.REDIS_URL,
    BUSINESS_TIMEZONE: env.BUSINESS_TIMEZONE,
    RUN_WORKERS: env.RUN_WORKERS,
    RATE_LIMIT: {
        LOGIN_MAX: env.LOGIN_RATE_LIMIT_MAX,
        LOGIN_WINDOW_SECONDS: env.LOGIN_RATE_LIMIT_WINDOW_SECONDS,
    },
    PDF: {
        MAX_CONCURRENCY: env.PDF_MAX_CONCURRENCY,
        RENDER_TIMEOUT_MS: env.PDF_RENDER_TIMEOUT_MS,
        CACHE_TTL_SECONDS: env.PDF_CACHE_TTL_SECONDS,
        PUPPETEER_EXECUTABLE_PATH: env.PUPPETEER_EXECUTABLE_PATH,
        CHROMIUM_NO_SANDBOX: env.PDF_CHROMIUM_NO_SANDBOX,
    },
    EMAIL_VERIFICATION: {
        ENABLED: env.EMAIL_VERIFICATION_ENABLED,
        QEV_API_KEY: env.QUICKEMAILVERIFICATION_API_KEY,
        LIST_API_MIN: env.EMAIL_VERIFICATION_LIST_API_MIN,
    },
    AUDIT: {
        EXPORT_DIR: path.resolve(env.AUDIT_EXPORT_DIR ?? path.join(os.tmpdir(), 'nandini-crm', 'audit-exports')),
        DIGEST_DIR: path.resolve(env.AUDIT_DIGEST_DIR ?? path.join('storage', 'audit-digests')),
        /** True when AUDIT_DIGEST_DIR is set (the default folder sits next to the app: fine for development only). */
        DIGEST_DIR_CONFIGURED: Boolean(env.AUDIT_DIGEST_DIR),
        VERIFY_TIMEOUT_MS: env.AUDIT_VERIFY_TIMEOUT_MS,
    },
    COOKIE: {
        NAME: 'token',
        MAX_AGE_MS: env.SESSION_TTL_SECONDS * 1000,
    },
    /** In-app notifications and the morning summary email (src/modules/notifications). */
    NOTIFICATIONS: {
        RETENTION_DAYS: env.NOTIFICATION_RETENTION_DAYS,
        MORNING_SUMMARY_ENABLED: env.MORNING_SUMMARY_ENABLED,
        MORNING_SUMMARY_CRON: env.MORNING_SUMMARY_CRON,
        MORNING_SUMMARY_SKIP_EMPTY: env.MORNING_SUMMARY_SKIP_EMPTY,
    },
    /** Outgoing email (src/services/mail.service.ts). */
    MAIL: {
        ENABLED: env.MAIL_ENABLED,
        SMTP_HOST: env.SMTP_HOST,
        SMTP_PORT: env.SMTP_PORT,
        SMTP_SECURE: env.SMTP_SECURE,
        SMTP_USER: env.SMTP_USER,
        SMTP_PASS: env.SMTP_PASS,
        SMTP_EHLO_NAME: env.SMTP_EHLO_NAME,
        FROM: env.MAIL_FROM,
        /** Base of links in emails, without a trailing slash. */
        APP_PUBLIC_URL: (env.APP_PUBLIC_URL ?? env.CLIENT_ORIGIN).replace(/\/+$/, ''),
        LOG_RETENTION_DAYS: env.EMAIL_LOG_RETENTION_DAYS,
    },
    /** Booking links (Calendar Phase 4). */
    BOOKING: {
        /** BOOKING_SIGNING_KEY; null = derived from JWT_SECRET. */
        SIGNING_KEY: env.BOOKING_SIGNING_KEY ?? null,
    },
    /** Admin › API Integrations and calendar sync (Calendar Phase 2). Client ids / secrets live in the database, sealed. */
    INTEGRATIONS: {
        /** Whether INTEGRATIONS_ENCRYPTION_KEY is set (the ring itself stays inside secretBox.ts). */
        KEY_CONFIGURED: integrationsKeyRing !== null,
        /** Kid new values are sealed with, e.g. `k1`; null without a key. */
        ACTIVE_KEY_ID: integrationsKeyRing?.activeKid ?? null,
        /** Public base URL of the API, no trailing slash; null in production until PUBLIC_API_URL is set. */
        PUBLIC_API_URL: publicApiUrl ?? null,
        /** True when PUBLIC_API_URL came from the environment rather than the localhost default. */
        PUBLIC_API_URL_CONFIGURED: Boolean(env.PUBLIC_API_URL),
        READY_REASON: integrationsReadyReason,
        /** The dev-only `fake` calendar provider is offered (CALENDAR_FAKE_PROVIDER=true outside production). */
        FAKE_PROVIDER: env.CALENDAR_FAKE_PROVIDER && env.NODE_ENV !== 'production',
        /** CALENDAR_FAKE_PROVIDER=true was set in production and is ignored (start-up warning). */
        FAKE_PROVIDER_IGNORED: env.CALENDAR_FAKE_PROVIDER && env.NODE_ENV === 'production',
    },
} as const;
