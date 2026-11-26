import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { after, afterEach, before, describe, it, mock } from 'node:test';
import express from 'express';
import { errorHandler, notFoundHandler } from '../../middlewares/errorHandler.js';
import { bookingDeps } from './bookingLink.public.js';
import publicBookingRouter from './bookingLink.public.routes.js';
import { BookingRateLimitError, resetLocalBookingLimits } from './bookingLink.rateLimit.js';

/**
 * The public router over HTTP (no Redis: the in-process rate limit counts): no sign-in, the response headers, one 404
 * for a malformed slug and a missing link, and the 16 KB body limit.
 */

let server: Server;
let base = '';

before(async () => {
    const app = express();
    app.use('/api/public/booking', publicBookingRouter);
    app.use(notFoundHandler);
    app.use(errorHandler);
    server = app.listen(0);
    await new Promise<void>((resolve) => server.once('listening', () => resolve()));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/public/booking`;
});

after(() => new Promise<void>((resolve) => server.close(() => resolve())));

afterEach(() => {
    mock.restoreAll();
    resetLocalBookingLimits();
});

describe('public booking routes', () => {
    it('answer without a session, never cached or indexed', async () => {
        mock.method(bookingDeps, 'loadBookingSettings', async () => ({ enabled: true, whoCanCreate: 'everyone' }));
        mock.method(bookingDeps, 'findPublicLink', async () => null);
        const res = await fetch(`${base}/priya-demo-abcdefgh`);
        assert.equal(res.status, 404);
        assert.equal(res.headers.get('cache-control'), 'no-store');
        assert.equal(res.headers.get('x-robots-tag'), 'noindex, nofollow');
    });

    it('a malformed slug and a missing link get the same 404, the malformed one without any lookup', async () => {
        const lookups = mock.method(bookingDeps, 'findPublicLink', async () => null);
        mock.method(bookingDeps, 'loadBookingSettings', async () => ({ enabled: true, whoCanCreate: 'everyone' }));
        const missing = await fetch(`${base}/priya-demo-abcdefgh`);
        const malformed = await fetch(`${base}/${encodeURIComponent('Robert\'); DROP TABLE--')}`);
        assert.equal(missing.status, 404);
        assert.equal(malformed.status, 404);
        const [a, b] = [(await missing.json()) as { message: string }, (await malformed.json()) as { message: string }];
        assert.equal(a.message, b.message);
        assert.equal(lookups.mock.callCount(), 1, 'only the well-formed slug was looked up');
    });

    it('the switch off is the same 404 as a missing link', async () => {
        mock.method(bookingDeps, 'loadBookingSettings', async () => ({ enabled: false, whoCanCreate: 'everyone' }));
        const lookups = mock.method(bookingDeps, 'findPublicLink', async () => null);
        const res = await fetch(`${base}/priya-demo-abcdefgh/slots`);
        assert.equal(res.status, 404);
        assert.equal(lookups.mock.callCount(), 0);
    });

    it('refuses bodies over 16 KB', async () => {
        const res = await fetch(`${base}/priya-demo-abcdefgh/book`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: 'x', name: 'a', email: 'a@b.co', message: 'x'.repeat(20_000) }),
        });
        assert.equal(res.status, 413);
    });

    it('a per-link limit from the service answers 429 with Retry-After', async () => {
        mock.method(bookingDeps, 'loadBookingSettings', async () => {
            throw new BookingRateLimitError(42);
        });
        const res = await fetch(`${base}/priya-demo-abcdefgh/slots`);
        assert.equal(res.status, 429);
        assert.equal(res.headers.get('retry-after'), '42');
        assert.equal(((await res.json()) as { code?: string }).code, 'RATE_LIMITED');
    });

    it('rate limits page views per IP (in process without Redis)', async () => {
        mock.method(bookingDeps, 'loadBookingSettings', async () => ({ enabled: true, whoCanCreate: 'everyone' }));
        mock.method(bookingDeps, 'findPublicLink', async () => null);
        const statuses: number[] = [];
        for (let i = 0; i < 61; i += 1) statuses.push((await fetch(`${base}/priya-demo-abcdefgh`)).status);
        assert.ok(statuses.slice(0, 60).every((s) => s === 404));
        assert.equal(statuses[60], 429);
    });
});
