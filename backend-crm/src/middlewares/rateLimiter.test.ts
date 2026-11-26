import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import type { NextFunction, Request, Response } from 'express';
import { redis } from '../config/redis.js';
import { createRateLimiter } from './rateLimiter.js';

const req = { ip: '10.0.0.1' } as Request;
function fakeRes() {
    const headers: Record<string, string> = {};
    return { headers, res: { setHeader: (name: string, value: string) => (headers[name] = value) } as unknown as Response };
}

/** Redis that reports `ready` but whose MULTI fails (overloaded, OOM, READONLY): no connection is ever opened. */
const realMulti = redis.multi.bind(redis);
beforeEach(() => {
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
            throw new Error('OOM command not allowed');
        },
    });
});
afterEach(() => {
    delete (redis as unknown as { status?: string }).status;
    (redis as unknown as { multi: typeof realMulti }).multi = realMulti;
});

describe('createRateLimiter when Redis is ready but a command fails', () => {
    it('fails open without a fallback (unchanged default)', async () => {
        const limiter = createRateLimiter({ keyPrefix: 'ratelimit:test', max: 1, windowSeconds: 60 });
        const calls: unknown[] = [];
        await limiter(req, fakeRes().res, ((err?: unknown) => calls.push(err)) as NextFunction);
        assert.deepEqual(calls, [undefined]);
    });

    it('hands the request to the fallback instead of letting it through', async () => {
        let fallbackCalls = 0;
        const limiter = createRateLimiter({
            keyPrefix: 'ratelimit:test',
            max: 1,
            windowSeconds: 60,
            fallback: (_req, _res, next) => {
                fallbackCalls += 1;
                next(new Error('limited locally'));
            },
        });
        const calls: unknown[] = [];
        await limiter(req, fakeRes().res, ((err?: unknown) => calls.push(err)) as NextFunction);
        assert.equal(fallbackCalls, 1);
        assert.equal(calls.length, 1);
        assert.match(String(calls[0]), /limited locally/);
    });
});
