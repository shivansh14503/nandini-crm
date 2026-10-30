import { logger } from '../../config/logger.js';

const INTERVAL_MS = 60_000;

/** Workers emit an error per reconnect attempt while Redis is down; log at most once a minute per worker. */
export function throttledLogger(): (detail: string, message: string) => void {
    let last = 0;
    return (detail, message) => {
        const now = Date.now();
        if (now - last < INTERVAL_MS) return;
        last = now;
        logger.warn({ err: detail }, message);
    };
}
