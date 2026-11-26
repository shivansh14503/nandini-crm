import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import type { NextFunction, Request, Response } from 'express';
import { redis } from '../../config/redis.js';
import { testLimiter } from './integration.routes.js';

/** Redis reports `ready` but every MULTI fails: the connection test must still be limited (in memory). */
const realMulti = redis.multi.bind(redis);
before(() => {
    Object.defineProperty(redis, 'status', { value: 'ready', configurable: true });
    (redis as unknown as { multi: () => unknown }).multi = () => ({
        set() {
            return this;
        },
        incr() {
            return this;
        },
        ttl() {
            return this;
        },
        exec: async () => {
            throw new Error('READONLY You can\'t write against a read only replica.');
        },
    });
});
after(() => {
    delete (redis as unknown as { status?: string }).status;
    (redis as unknown as { multi: typeof realMulti }).multi = realMulti;
});

describe('POST /providers/:provider/test limiter', () => {
    it('falls back to the in-memory limit (6 / min) when Redis is ready but cannot count', async () => {
        const req = { user: { id: 'limiter-test-admin' } } as unknown as Request;
        const headers: Record<string, string> = {};
        const res = { setHeader: (name: string, value: string) => (headers[name] = value) } as unknown as Response;
        const outcomes: unknown[] = [];
        for (let i = 0; i < 7; i++) {
            await testLimiter(req, res, ((err?: unknown) => outcomes.push(err)) as NextFunction);
        }
        assert.deepEqual(outcomes.slice(0, 6), [undefined, undefined, undefined, undefined, undefined, undefined]);
        assert.equal((outcomes[6] as { statusCode?: number }).statusCode, 429);
        assert.equal((outcomes[6] as { code?: string }).code, 'RATE_LIMITED');
        assert.ok(Number(headers['Retry-After']) >= 1);
    });
});
