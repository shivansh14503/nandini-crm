import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ZodError } from 'zod';
import { HttpError } from '../../utils/httpError.js';
import {
    addDays,
    auditIdParamSchema,
    auditListQuerySchema,
    buildAuditWhere,
    daysBetween,
    likeLiteral,
    offsetSegments,
    resolveAggregateRange,
    resolveRange,
    zonedDate,
    zonedDayStart,
    zoneOffsetMinutes,
} from './auditAdmin.query.js';

const IST = 'Asia/Kolkata';
const iso = (date: Date | undefined) => date?.toISOString();

describe('business-timezone calendar', () => {
    it('reads UTC offsets, including DST', () => {
        assert.equal(zoneOffsetMinutes(new Date('2026-11-21T10:00:00Z'), IST), 330);
        assert.equal(zoneOffsetMinutes(new Date('2026-07-01T10:00:00Z'), 'Europe/London'), 60);
        assert.equal(zoneOffsetMinutes(new Date('2026-12-01T10:00:00Z'), 'Europe/London'), 0);
    });

    it('finds the UTC instant a business day starts', () => {
        assert.equal(iso(zonedDayStart('2026-11-01', IST)), '2026-10-31T18:30:00.000Z');
        // London moves to BST at 01:00 UTC on 29 March 2026: that day starts on GMT, the next on BST.
        assert.equal(iso(zonedDayStart('2026-03-29', 'Europe/London')), '2026-03-29T00:00:00.000Z');
        assert.equal(iso(zonedDayStart('2026-03-30', 'Europe/London')), '2026-03-29T23:00:00.000Z');
        assert.equal(iso(zonedDayStart('2026-11-02', 'America/New_York')), '2026-11-02T05:00:00.000Z');
    });

    it('dates instants on the business calendar', () => {
        assert.equal(zonedDate(new Date('2026-10-31T18:29:59Z'), IST), '2026-10-31');
        assert.equal(zonedDate(new Date('2026-10-31T18:30:00Z'), IST), '2026-11-01');
    });

    it('walks calendar days', () => {
        assert.equal(addDays('2026-02-28', 1), '2026-03-01');
        assert.equal(addDays('2026-01-01', -1), '2025-12-31');
        assert.deepEqual(daysBetween('2026-12-30', '2027-01-02'), ['2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02']);
        assert.deepEqual(daysBetween('2026-01-02', '2026-01-01'), []);
    });

    it('splits a range where the UTC offset changes', () => {
        const ist = offsetSegments(new Date('2026-10-01T00:00:00Z'), new Date('2026-11-01T00:00:00Z'), IST);
        assert.equal(ist.length, 1);
        assert.equal(ist[0].offsetMinutes, 330);

        const london = offsetSegments(new Date('2026-03-20T00:00:00Z'), new Date('2026-04-05T00:00:00Z'), 'Europe/London');
        assert.deepEqual(
            london.map((s) => [iso(s.start), iso(s.end), s.offsetMinutes]),
            [
                ['2026-03-20T00:00:00.000Z', '2026-03-29T01:00:00.000Z', 0],
                ['2026-03-29T01:00:00.000Z', '2026-04-05T00:00:00.000Z', 60],
            ],
        );
    });
});

describe('resolveRange', () => {
    it('takes whole business days, `to` included', () => {
        const range = resolveRange('2026-11-01', '2026-11-21', IST);
        assert.equal(iso(range.gte), '2026-10-31T18:30:00.000Z');
        assert.equal(iso(range.lt), '2026-11-21T18:30:00.000Z');
    });

    it('takes date-times as instants, `to` included', () => {
        const range = resolveRange('2026-11-21T10:00:00+05:30', '2026-11-21T05:00:00Z', IST);
        assert.equal(iso(range.gte), '2026-11-21T04:30:00.000Z');
        assert.equal(iso(range.lt), '2026-11-21T05:00:00.001Z');
    });

    it('leaves open ends open and refuses a reversed range', () => {
        assert.deepEqual(resolveRange(undefined, undefined, IST), {});
        assert.equal(resolveRange('2026-11-01', undefined, IST).lt, undefined);
        assert.throws(() => resolveRange('2026-11-22', '2026-11-21', IST), (err: unknown) => err instanceof HttpError && err.statusCode === 400);
    });
});

describe('resolveAggregateRange', () => {
    const now = new Date('2026-11-21T06:00:00Z'); // 11:30 IST

    it('defaults to the last 30 business days up to now', () => {
        const range = resolveAggregateRange(undefined, undefined, IST, now);
        assert.equal(iso(range.gte), '2026-10-22T18:30:00.000Z'); // 23 Oct IST: 30 days including today
        assert.equal(iso(range.lt), '2026-11-21T06:00:00.001Z');
    });

    it('takes 30 days before a lone `to`, and refuses more than 366 days', () => {
        const range = resolveAggregateRange(undefined, '2026-06-30', IST, now);
        assert.equal(range.lt.getTime() - range.gte.getTime(), 30 * 24 * 60 * 60 * 1000);
        assert.doesNotThrow(() => resolveAggregateRange('2025-11-21', '2026-11-21', IST, now));
        assert.throws(() => resolveAggregateRange('2025-01-01', '2026-11-21', IST, now), (err: unknown) => err instanceof HttpError && err.statusCode === 400);
    });
});

describe('auditListQuerySchema', () => {
    it('takes repeated params and comma lists, normalized and de-duplicated', () => {
        const parsed = auditListQuerySchema.parse({
            module: ['Leads', 'contacts,leads'],
            action: 'update, login_failed',
            category: 'security',
            severity: ['warning'],
            source: 'ui,job',
            entityType: 'partner-companies,Lead',
            user: 'asha',
        });
        assert.deepEqual(parsed.module, ['leads', 'contacts']);
        assert.deepEqual(parsed.action, ['UPDATE', 'LOGIN_FAILED']);
        assert.deepEqual(parsed.category, ['SECURITY']);
        assert.deepEqual(parsed.severity, ['WARNING']);
        assert.deepEqual(parsed.source, ['UI', 'JOB']);
        assert.deepEqual(parsed.entityType, ['PartnerCompany', 'Lead']);
        assert.deepEqual(parsed.user, ['asha']);
    });

    it('treats blanks as absent and falls back to the default page size', () => {
        const parsed = auditListQuerySchema.parse({ entityId: '  ', module: '', cursor: '', limit: '5000' });
        assert.equal(parsed.entityId, undefined);
        assert.equal(parsed.module, undefined);
        assert.equal(parsed.cursor, undefined);
        assert.equal(parsed.limit, 50);
        assert.equal(auditListQuerySchema.parse({ limit: '20' }).limit, 20);
    });

    it('refuses values that would silently widen or break the query', () => {
        for (const query of [
            { category: 'FOO' },
            { source: 'web' },
            { cursor: 'abc' },
            { cursor: '0' },
            { cursor: '9223372036854775808' },
            { from: '2026-02-30' },
            { from: '2026-11-21T10:00' }, // a date-time needs its timezone
            { field: 'name|x' },
            { ip: '10.0.0.1; DROP' },
            { module: 'Leads!' },
        ]) {
            assert.throws(() => auditListQuerySchema.parse(query), ZodError, JSON.stringify(query));
        }
        assert.equal(auditListQuerySchema.parse({ cursor: '9223372036854775807' }).cursor, '9223372036854775807');
    });

    it('validates entry ids', () => {
        assert.equal(auditIdParamSchema.parse({ id: '42' }).id, '42');
        assert.throws(() => auditIdParamSchema.parse({ id: 'facets' }), ZodError);
    });
});

describe('buildAuditWhere', () => {
    it('combines the id range, cursor and date range', () => {
        const where = buildAuditWhere(
            { cursor: '900' },
            { gte: new Date('2026-11-01T00:00:00Z'), lt: new Date('2026-11-02T00:00:00Z') },
            { min: 100n, max: 1000n },
        );
        assert.deepEqual(where.id, { gte: 100n, lte: 899n });
        assert.deepEqual(buildAuditWhere({ cursor: '5000' }, {}, { min: 100n, max: 1000n }).id, { gte: 100n, lte: 1000n });
        assert.deepEqual(buildAuditWhere({ cursor: '900' }, {}).id, { lte: 899n });
        assert.deepEqual(where.createdAt, { gte: new Date('2026-11-01T00:00:00Z'), lt: new Date('2026-11-02T00:00:00Z') });
    });

    it('matches changed fields, custom fields and IP prefixes', () => {
        assert.deepEqual(buildAuditWhere({ field: ['assignedTo'] }, {}).AND, [{ changedFields: { contains: '|assignedTo|' } }]);
        assert.deepEqual(buildAuditWhere({ field: ['customFields.po_number'] }, {}).AND, [
            { changedFields: { contains: '|customFields|' } },
            { changesJson: { contains: '"po[_]number":' } },
        ]);
        assert.deepEqual(buildAuditWhere({ field: ['status', 'customFields.region'] }, {}).AND, [
            {
                OR: [
                    { AND: [{ changedFields: { contains: '|status|' } }] },
                    { AND: [{ changedFields: { contains: '|customFields|' } }, { changesJson: { contains: '"region":' } }] },
                ],
            },
        ]);
        assert.deepEqual(auditListQuerySchema.parse({ field: 'status,customFields.region' }).field, ['status', 'customFields.region']);
        assert.deepEqual(buildAuditWhere({ ip: '192.168.1.*' }, {}).ipAddress, { startsWith: '192.168.1.' });
        assert.equal(buildAuditWhere({ ip: '10.0.0.5' }, {}).ipAddress, '10.0.0.5');
    });

    it('searches free text literally across the readable columns', () => {
        const where = buildAuditWhere({ q: '50%_off' }, {});
        const or = (where.AND as { OR: Record<string, unknown>[] }[])[0].OR;
        assert.deepEqual(or[0], { entityLabel: { contains: '50[%][_]off' } });
        assert.ok(or.some((condition) => 'changesJson' in condition));
        assert.ok(or.some((condition) => condition.entityId === '50%_off'));
    });

    it('adds nothing for empty filters', () => {
        assert.deepEqual(buildAuditWhere({}, {}), {});
        assert.equal(likeLiteral('a[b]'), 'a[[]b]');
    });
});
