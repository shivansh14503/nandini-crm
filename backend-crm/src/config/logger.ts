import { pino } from 'pino';
import { ENV } from './env.js';

/**
 * Application logger. Pretty-printed in development (pino-pretty is a dev dependency), structured JSON
 * in production. Credentials and auth headers are redacted wherever they appear.
 */
export const logger = pino({
    level: ENV.LOG_LEVEL,
    redact: {
        paths: [
            'password',
            '*.password',
            'passwordHash',
            '*.passwordHash',
            'req.headers.authorization',
            'req.headers.cookie',
            'res.headers["set-cookie"]',
        ],
        censor: '[REDACTED]',
    },
    ...(ENV.IS_PRODUCTION
        ? {}
        : { transport: { target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:HH:MM:ss', ignore: 'pid,hostname' } } }),
});
