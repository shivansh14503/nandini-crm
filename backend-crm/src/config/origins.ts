import { ENV } from './env.js';

/**
 * Which browser origins are the CRM itself. Used by CORS (app.ts). (P2-2's calendar OAuth start also used it; that
 * flow was retired in P2-2b.)
 *
 * LAN_ORIGIN: plain-http localhost / 127.0.0.1 / private 192.168.x.x and 10.x.x.x addresses (the office server and
 * developer machines). Pure, apart from reading CLIENT_ORIGIN.
 */
export const LAN_ORIGIN = /^http:\/\/(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+)(:\d+)?$/;

/**
 * True when `origin` is CLIENT_ORIGIN or matches LAN_ORIGIN. Deliberately stricter than the non-production CORS rule
 * (which allows any origin): a value that passes here is where an OAuth callback may send the browser back to.
 */
export function isAppOrigin(origin: string | null | undefined, clientOrigin: string = ENV.CLIENT_ORIGIN): boolean {
    if (!origin || typeof origin !== 'string') return false;
    return origin === clientOrigin.replace(/\/+$/, '') || LAN_ORIGIN.test(origin);
}
