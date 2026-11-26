import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import { Redis } from 'ioredis';
import { guardedReadThrough, redisGuardStore, unlinkMatching, type GuardStore } from './cache.service.js';

/** In-memory Redis double with the same NX / compare-and-set semantics; `ttls` records each write's TTL. */
function fakeStore() {
    const data = new Map<string, string>();
    const ttls = new Map<string, number>();
    const calls: string[] = [];
    const store: GuardStore = {
        async get(key) {
            calls.push('get');
            return data.get(key) ?? null;
        },
        async put(key, value, ttl, onlyIfAbsent) {
            calls.push(onlyIfAbsent ? 'put-nx' : 'put');
            if (onlyIfAbsent && data.has(key)) return false;
            data.set(key, value);
            ttls.set(key, ttl);
            return true;
        },
        async swap(key, expected, value, ttl) {
            calls.push('swap');
            if (data.get(key) !== expected) return false;
            if (value === null) data.delete(key);
            else {
                data.set(key, value);
                ttls.set(key, ttl);
            }
            return true;
        },
    };
    return { data, ttls, calls, store };
}

/** SCAN / UNLINK over the double's map, two keys per page of the keys present when the scan started. */
function fakeScanClient(data: Map<string, string>) {
    const glob = (pattern: string) => new RegExp(`^${pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`);
    let keys: string[] = [];
    return {
        scan: async (cursor: string, _match: 'MATCH', pattern: string) => {
            if (cursor === '0') keys = [...data.keys()];
            const start = Number(cursor);
            const page = keys.slice(start, start + 2).filter((key) => glob(pattern).test(key));
            return [start + 2 >= keys.length ? '0' : String(start + 2), page] as [string, string[]];
        },
        unlink: async (...keys: string[]) => keys.filter((key) => data.delete(key)).length,
    } as unknown as Parameters<typeof unlinkMatching>[0];
}

/** A promise with its resolve, to hold a source read open while the test acts. */
function deferred<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((r) => (resolve = r));
    return { promise, resolve };
}

const tick = () => new Promise((resolve) => setImmediate(resolve));

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

describe('guardedReadThrough for invalidated lookups, form configs and search', () => {
    const LOOKUP = 'cache:lookups:organizations:50';

    it('holds the placeholder for 90 s by default and for as long as the caller asks', async () => {
        const { ttls, store } = fakeStore();
        let placeholderTtl = 0;
        await guardedReadThrough(store, ready, LOOKUP, 300, async () => {
            placeholderTtl = ttls.get(LOOKUP)!;
            return [];
        });
        assert.equal(placeholderTtl, 90);
        assert.equal(ttls.get(LOOKUP), 300, 'the value gets its own TTL');

        await guardedReadThrough(store, ready, 'cache:search:x', 30, async () => {
            placeholderTtl = ttls.get('cache:search:x')!;
            return {};
        }, { placeholderTtlSeconds: 180 });
        assert.equal(placeholderTtl, 180);
        assert.equal(ttls.get('cache:search:x'), 30);
    });

    it('drops a value read while a pattern invalidation ran: SCAN + UNLINK deletes the placeholder too', async () => {
        const { data, store } = fakeStore();
        data.set('cache:lookups:organizations:200', '[]');
        data.set('cache:lookups:contacts:50', '[]');
        const value = await guardedReadThrough(store, ready, LOOKUP, 300, async () => {
            assert.ok(data.get(LOOKUP)?.startsWith('pending:'));
            // An organization write commits and runs invalidateEntityCaches('organizations').
            await unlinkMatching(fakeScanClient(data), 'cache:lookups:organizations*');
            return [{ id: 'o1', organizationName: 'Before the rename' }];
        });
        assert.deepEqual(value, [{ id: 'o1', organizationName: 'Before the rename' }], 'the caller still gets what it read');
        assert.equal(data.has(LOOKUP), false, 'the pre-write list is not cached');
        assert.equal(data.has('cache:lookups:organizations:200'), false);
        assert.equal(data.get('cache:lookups:contacts:50'), '[]', 'other lookups stay');
    });

    it('never hands a placeholder to concurrent misses: the second reader reads the source, the first caches', async () => {
        const { data, store } = fakeStore();
        const first = deferred<string[]>();
        const a = guardedReadThrough(store, ready, LOOKUP, 300, () => first.promise);
        await tick();
        const b = await guardedReadThrough(store, ready, LOOKUP, 300, async () => ['from b']);
        assert.deepEqual(b, ['from b']);
        assert.ok(data.get(LOOKUP)?.startsWith('pending:'), 'b neither cached nor removed a’s placeholder');
        first.resolve(['from a']);
        assert.deepEqual(await a, ['from a']);
        await tick();
        assert.equal(data.get(LOOKUP), '["from a"]');
    });

    it('does not cache a read that outlived its placeholder', async () => {
        const { data, store } = fakeStore();
        await guardedReadThrough(store, ready, LOOKUP, 300, async () => {
            data.delete(LOOKUP); // the placeholder expired
            data.set(LOOKUP, 'pending:a-later-reader');
            return ['slow'];
        });
        assert.equal(data.get(LOOKUP), 'pending:a-later-reader');

        await guardedReadThrough(store, ready, LOOKUP, 300, async () => {
            data.delete(LOOKUP); // expired, and nobody else is reading
            return ['slow'];
        });
        assert.equal(data.has(LOOKUP), false);
    });

    it('caches null and empty results and serves them as hits; undefined is not cached', async () => {
        const { data, store } = fakeStore();
        let reads = 0;
        assert.equal(await guardedReadThrough(store, ready, 'k:null', 60, async () => (reads++, null)), null);
        assert.equal(await guardedReadThrough(store, ready, 'k:null', 60, async () => (reads++, null)), null);
        assert.deepEqual(await guardedReadThrough(store, ready, 'k:empty', 60, async () => (reads++, [])), []);
        assert.deepEqual(await guardedReadThrough(store, ready, 'k:empty', 60, async () => (reads++, [])), []);
        assert.equal(reads, 2);
        assert.equal(data.get('k:null'), 'null');

        assert.equal(await guardedReadThrough(store, ready, 'k:undef', 60, async () => undefined), undefined);
        await tick();
        assert.equal(data.has('k:undef'), false, 'the placeholder is removed, not left to expire');
    });

    it('round-trips a large payload unchanged', async () => {
        const { store } = fakeStore();
        const big = { categories: Array.from({ length: 5000 }, (_, i) => ({ key: `c${i}`, label: `Category ${i} “quoted” – ünïcode`, options: [i, null, ''] })) };
        assert.deepEqual(await guardedReadThrough(store, ready, 'k:big', 60, async () => big), big);
        assert.deepEqual(await guardedReadThrough(store, ready, 'k:big', 60, async () => ({})), big);
    });

    it('fails open when the placeholder write or the swap fails', async () => {
        const { store } = fakeStore();
        const putFails: GuardStore = { ...store, put: () => Promise.reject(new Error('Connection is closed')) };
        assert.deepEqual(await guardedReadThrough(putFails, ready, LOOKUP, 300, async () => ['a']), ['a']);
        const swapFails: GuardStore = { ...store, swap: () => Promise.reject(new Error('Connection is closed')) };
        assert.deepEqual(await guardedReadThrough(swapFails, ready, LOOKUP, 300, async () => ['b']), ['b']);
        await tick();
    });
});

/**
 * Against a real Redis (the Lua compare-and-set, SET NX / EX, SCAN + UNLINK). Skipped unless REDIS_TEST_URL is set,
 * e.g. `redis-server --port 6390 --save '' &` then `REDIS_TEST_URL=redis://127.0.0.1:6390 npm test`.
 */
describe('guardedReadThrough against Redis', { skip: process.env.REDIS_TEST_URL ? false : 'REDIS_TEST_URL is not set' }, () => {
    let client: Redis;
    let store: GuardStore;
    const prefix = `test:guard:${randomUUID()}:`;
    const live = () => client.status === 'ready';

    before(async () => {
        client = new Redis(process.env.REDIS_TEST_URL!, { lazyConnect: true, maxRetriesPerRequest: 1 });
        await client.connect();
        store = redisGuardStore(client);
    });
    after(async () => {
        await unlinkMatching(client, `${prefix}*`);
        client.disconnect();
    });

    it('caches through a placeholder and keeps the value TTL', async () => {
        const key = `${prefix}lookups:organizations:50`;
        const value = await guardedReadThrough(store, live, key, 300, async () => {
            assert.match((await client.get(key)) ?? '', /^pending:/);
            const ttl = await client.ttl(key);
            assert.ok(ttl > 170 && ttl <= 180, `placeholder TTL ${ttl}`);
            return [{ id: 'o1' }];
        }, { placeholderTtlSeconds: 180 });
        assert.deepEqual(value, [{ id: 'o1' }]);
        await client.ping(); // the swap was sent first on this connection
        assert.equal(await client.get(key), '[{"id":"o1"}]');
        const ttl = await client.ttl(key);
        assert.ok(ttl > 290 && ttl <= 300, `value TTL ${ttl}`);
    });

    it('does not cache a read overlapped by SCAN + UNLINK, and caches the next one', async () => {
        const key = `${prefix}search:all:1:8`;
        await guardedReadThrough(store, live, key, 30, async () => {
            await unlinkMatching(client, `${prefix}search:*`);
            return { stale: true };
        });
        await client.ping();
        assert.equal(await client.get(key), null);
        assert.deepEqual(await guardedReadThrough(store, live, key, 30, async () => ({ stale: false })), { stale: false });
        await client.ping();
        assert.equal(await client.get(key), '{"stale":false}');
    });

    it('does not cache a read that outlived its placeholder', async () => {
        const key = `${prefix}lookups:form-configs:active`;
        await guardedReadThrough(store, live, key, 3600, async () => {
            await client.pexpire(key, 1);
            await new Promise((resolve) => setTimeout(resolve, 20));
            return { modules: {} };
        });
        await client.ping();
        assert.equal(await client.get(key), null);
    });

    it('gives a concurrent miss the source value, never the placeholder', async () => {
        const key = `${prefix}lookups:partner-companies`;
        const first = deferred<string[]>();
        const a = guardedReadThrough(store, live, key, 3600, () => first.promise);
        while (!(await client.get(key))) await tick();
        assert.deepEqual(await guardedReadThrough(store, live, key, 3600, async () => ['b']), ['b']);
        first.resolve(['a']);
        assert.deepEqual(await a, ['a']);
        await client.ping();
        assert.equal(await client.get(key), '["a"]');
    });

    it('stores null and a 2 MB payload through the Lua swap', async () => {
        const nullKey = `${prefix}null`;
        assert.equal(await guardedReadThrough(store, live, nullKey, 60, async () => null), null);
        await client.ping();
        assert.equal(await client.get(nullKey), 'null');
        assert.equal(await guardedReadThrough(store, live, nullKey, 60, async () => 'not read'), null);

        const bigKey = `${prefix}big`;
        const big = { rows: Array.from({ length: 20_000 }, (_, i) => ({ id: `r${i}`, name: `Row ${i} – “ü”`, note: 'x'.repeat(80) })) };
        await guardedReadThrough(store, live, bigKey, 60, async () => big);
        await client.ping();
        assert.ok(((await client.strlen(bigKey)) as number) > 2_000_000);
        assert.deepEqual(await guardedReadThrough(store, live, bigKey, 60, async () => ({})), big);
    });
});
