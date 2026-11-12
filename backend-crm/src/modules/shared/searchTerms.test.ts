import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { TransactionClient } from '../../config/prisma.js';
import { findOrganizationByName, prefetchOrganizationsByName } from './prefetch.js';
import { codeSearchPrefix, detectEntityCode, gstSearchPrefix, phoneSearch, phoneVariants, phoneWhere } from './searchTerms.js';

describe('entity code search', () => {
    it('recognizes every generated code prefix, case-insensitively', () => {
        for (const prefix of ['ORG', 'CON', 'LD', 'OPP', 'QT', 'PRD', 'TKT'] as const) {
            assert.deepEqual(detectEntityCode(` ${prefix.toLowerCase()}-0042 `), { prefix, code: `${prefix}-0042` });
        }
    });

    it('only prefix-matches the requested entity', () => {
        assert.equal(codeSearchPrefix('ORG-12', 'ORG'), 'ORG-12');
        assert.equal(codeSearchPrefix('CON-12', 'ORG'), null);
    });

    it('ignores text that merely contains a code-like part', () => {
        for (const term of ['ORG-', 'ORG-12a', 'my ORG-12', 'ORGX-12', 'LEAD-12']) assert.equal(detectEntityCode(term), null, term);
    });
});

describe('phone search', () => {
    it('matches a complete number on all its stored forms', () => {
        const search = phoneSearch('+91 98112 34567');
        assert.equal(search?.kind, 'exact');
        assert.deepEqual(new Set(search?.kind === 'exact' ? search.variants : []), new Set(['+919811234567', '919811234567', '9811234567']));
        assert.deepEqual(phoneSearch('9811234567'), phoneSearch('+919811234567'));
    });

    it('falls back to a digit substring for partial numbers', () => {
        assert.deepEqual(phoneSearch('98112-34'), { kind: 'partial', digits: '9811234' });
    });

    it('ignores short numbers and non-numeric text', () => {
        for (const term of ['123456', 'Mehta', '98112 abc', '110001']) assert.equal(phoneSearch(term), null, term);
    });

    it('builds one clause per phone column', () => {
        assert.deepEqual(phoneWhere({ kind: 'partial', digits: '9811234' }, ['mobile', 'officePhone']), [
            { mobile: { contains: '9811234' } },
            { officePhone: { contains: '9811234' } },
        ]);
    });

    it('keeps the variants the lead duplicate check relies on', () => {
        assert.deepEqual(new Set(phoneVariants('09811234567')), new Set(['+919811234567', '919811234567', '9811234567']));
    });
});

describe('GSTIN search', () => {
    it('prefix-matches a GSTIN start or a full GSTIN, uppercased', () => {
        assert.equal(gstSearchPrefix('27aaacr'), '27AAACR');
        assert.equal(gstSearchPrefix('27AAACR5055K1Z5'), '27AAACR5055K1Z5');
    });

    it('ignores names, codes and too-short text', () => {
        for (const term of ['27AAAC', 'Reliance', 'ORG-0001', '27AAACR5055K1Z5X']) assert.equal(gstSearchPrefix(term), null, term);
    });
});

describe('prefetched organization lookups', () => {
    function fakeClient(live: { id: string; organizationName: string }[]) {
        const calls: { in?: string[]; name?: string }[] = [];
        const client = {
            organization: {
                async findMany(args: { where: { organizationName: { in: string[] } } }) {
                    calls.push({ in: args.where.organizationName.in });
                    const wanted = new Set(args.where.organizationName.in.map((n) => n.toLowerCase()));
                    return live.filter((o) => wanted.has(o.organizationName.toLowerCase()));
                },
                async findFirst(args: { where: { organizationName: string } }) {
                    calls.push({ name: args.where.organizationName });
                    return live.find((o) => o.organizationName.toLowerCase() === args.where.organizationName.toLowerCase()) ?? null;
                },
            },
        } as unknown as TransactionClient;
        return { client, calls };
    }

    it('reads distinct names once, in chunks below the SQL Server parameter limit', async () => {
        const names = Array.from({ length: 2500 }, (_, i) => `Org ${i}`);
        const { client, calls } = fakeClient([{ id: '1', organizationName: 'Org 7' }]);
        const map = await prefetchOrganizationsByName(client, [...names, 'Org 7', ' org 7 ', '', null, undefined]);
        assert.deepEqual(calls.map((c) => c.in?.length), [1000, 1000, 501]);
        assert.deepEqual(map.get('org 7'), { id: '1', organizationName: 'Org 7' });
    });

    it('answers from the prefetched map, and queries on a miss', async () => {
        const { client, calls } = fakeClient([{ id: '2', organizationName: 'Created Later' }]);
        const organizationsByName = new Map([['acme', { id: '1', organizationName: 'Acme' }]]);
        assert.deepEqual(await findOrganizationByName(client, ' ACME ', { organizationsByName }), { id: '1', organizationName: 'Acme' });
        assert.equal(calls.length, 0);
        assert.deepEqual(await findOrganizationByName(client, 'Created Later', { organizationsByName }), { id: '2', organizationName: 'Created Later' });
        assert.equal(calls.length, 1);
        assert.equal(await findOrganizationByName(client, '  ', { organizationsByName }), null);
    });
});
