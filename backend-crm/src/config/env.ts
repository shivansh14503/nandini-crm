import 'dotenv/config';
import { z } from 'zod';
import { resolveDatabaseUrl } from './databaseUrl.js';

/** Used only outside production so local dev starts without a secret; production must set JWT_SECRET. */
const DEV_JWT_SECRET = 'dev-only-insecure-jwt-secret-do-not-use-in-production';

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
    REDIS_URL: env.REDIS_URL,
    BUSINESS_TIMEZONE: env.BUSINESS_TIMEZONE,
    RUN_WORKERS: env.RUN_WORKERS,
    RATE_LIMIT: {
        LOGIN_MAX: env.LOGIN_RATE_LIMIT_MAX,
        LOGIN_WINDOW_SECONDS: env.LOGIN_RATE_LIMIT_WINDOW_SECONDS,
    },
    COOKIE: {
        NAME: 'token',
        MAX_AGE_MS: env.SESSION_TTL_SECONDS * 1000,
    },
} as const;
