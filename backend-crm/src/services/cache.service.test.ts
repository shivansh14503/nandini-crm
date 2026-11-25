import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { guardedReadThrough, type GuardStore } from './cache.service.js';

/** In-memory Redis double with the same NX / compare-and-set semantics. */
function fakeStore() {
    const data = new Map<string, string>();
    const calls: string[] = [];
    const store: GuardStore = {
        async get(key) {
            calls.push('get');
            return data.get(key) ?? null;
        },
        async put(key, value, _ttl, onlyIfAbsent) {
            calls.push(onlyIfAbsent ? 'put-nx' : 'put');
            if (onlyIfAbsent && data.has(key)) return false;
            data.set(key, value);
            return true;
        },
        async swap(key, expected, value) {
            calls.push('swap');
            if (data.get(key) !== expected) return false;
            if (value === null) data.delete(key);
            else data.set(key, value);
            return true;
        },
    };
    return { data, calls, store };
}

const KEY = 'cache:notifications:unread:palak';
const ready = () => true;

describe('guardedReadThrough', () => {
    it('caches a value read on a miss and serves it from the cache next time', async () => {
        const { data, store } = fakeStore();
        let reads = 0;
        const fetcher = async () => ++reads;
        assert.equal(await guardedReadThrough(store, ready, KEY, 60, fetcher), 1);
        assert.equal(data.get(KEY), '1');
        assert.equal(await guardedReadThrough(store, ready, KEY, 60, fetcher), 1);
        assert.equal(reads, 1);
    });

    it('does not cache a value an invalidation made stale while it was being read', async () => {
        const { data, store } = fakeStore();
        // The source says 0; a writer commits a notification and drops the key before the reader writes back.
        const value = await guardedReadThrough(store, ready, KEY, 60, async () => {
            data.delete(KEY);
            return 0;
        });
        assert.equal(value, 0);
        assert.equal(data.has(KEY), false, 'the stale 0 is not cached');
        assert.equal(await guardedReadThrough(store, ready, KEY, 60, async () => 1), 1);
        assert.equal(data.get(KEY), '1');
    });

    it('reads the source without caching while another read holds the placeholder', async () => {
        const { data, store } = fakeStore();
        data.set(KEY, 'pending:other');
        assert.equal(await guardedReadThrough(store, ready, KEY, 60, async () => 4), 4);
        assert.equal(data.get(KEY), 'pending:other');
    });

    it('refresh reads the source whatever is cached and caches that', async () => {
        const { data, calls, store } = fakeStore();
        data.set(KEY, '7');
        assert.equal(await guardedReadThrough(store, ready, KEY, 60, async () => 2, { refresh: true }), 2);
        assert.equal(data.get(KEY), '2');
        assert.equal(calls.includes('get'), false);
    });

    it('refresh loses to an invalidation too', async () => {
        const { data, store } = fakeStore();
        data.set(KEY, '7');
        await guardedReadThrough(
            store,
            ready,
            KEY,
            60,
            async () => {
                data.delete(KEY);
                return 0;
            },
            { refresh: true },
        );
        assert.equal(data.has(KEY), false);
    });

    it('removes its placeholder when the source read fails', async () => {
        const { data, store } = fakeStore();
        await assert.rejects(
            guardedReadThrough(store, ready, KEY, 60, async () => {
                throw new Error('database unavailable');
            }),
            /database unavailable/,
        );
        assert.equal(data.has(KEY), false);
    });

    it('reads the source when Redis is down or failing', async () => {
        const { calls, store } = fakeStore();
        assert.equal(await guardedReadThrough(store, () => false, KEY, 60, async () => 3), 3);
        assert.deepEqual(calls, []);

        const failing: GuardStore = { ...store, get: async () => Promise.reject(new Error('Connection is closed')) };
        assert.equal(await guardedReadThrough(failing, ready, KEY, 60, async () => 5), 5);
    });
});
