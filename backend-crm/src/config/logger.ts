import { pino } from 'pino';
import { ENV } from './env.js';

/**
 * Paths pino replaces with `[REDACTED]`: credentials and auth headers, and (Admin › API Integrations, calendar sync)
 * OAuth tokens, client secrets, PKCE verifiers, sealed secrets, provider sync cursors and the Google channel token
 * header. Exported for logger.test.ts. Request URLs are masked separately (utils/redactUrl.ts, app.ts serializer).
 */
export const LOG_REDACT_PATHS: readonly string[] = [
    'password',
    '*.password',
    'passwordHash',
    '*.passwordHash',
    'req.headers.authorization',
    'req.headers.cookie',
    'res.headers["set-cookie"]',
    'req.headers["x-goog-channel-token"]',
    'accessToken',
    '*.accessToken',
    'refreshToken',
    '*.refreshToken',
    '*.access_token',
    '*.refresh_token',
    '*.id_token',
    'clientSecret',
    '*.clientSecret',
    '*.client_secret',
    '*.code_verifier',
    '*.secrets',
    '*.secretsEnc',
    '*.syncCursor',
];

export const LOG_REDACT_CENSOR = '[REDACTED]';

/**
 * Application logger. Pretty-printed in development (pino-pretty is a dev dependency), structured JSON
 * in production. Credentials and auth headers are redacted wherever they appear.
 */
export const logger = pino({
    level: ENV.LOG_LEVEL,
    redact: { paths: [...LOG_REDACT_PATHS], censor: LOG_REDACT_CENSOR },
    ...(ENV.IS_PRODUCTION
        ? {}
        : { transport: { target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:HH:MM:ss', ignore: 'pid,hostname' } } }),
});
