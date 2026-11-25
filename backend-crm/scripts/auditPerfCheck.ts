import { performance } from 'node:perf_hooks';
import { prisma } from '../src/config/prisma.js';
import { connectRedis, isRedisReady, redis } from '../src/config/redis.js';
import { Prisma } from '../src/generated/prisma/client.js';
import { auditAdminService } from '../src/modules/audit/auditAdmin.service.js';

/**
 * Performance check of the admin Audit Log API (docs/build-plan.md Phase 11 B): seeds synthetic entries into a
 * SCRATCH database, then times the admin queries against them.
 *
 *   npm run perf:audit                          seed up to 1,000,000 entries over the last 180 days, then time
 *   npm run perf:audit -- --rows 250000 --days 90
 *   npm run perf:audit -- --no-seed             time only
 *
 * AuditLog is an append-only ledger table: seeded rows can never be deleted. The script therefore refuses to run
 * unless the database name contains "scratch" or "perf". Create one, run `npm run db:deploy` against it, then
 * point DATABASE_URL at it for this script only.
 *
 * Target: a 30-day, all-module first page in under 300 ms.
 */

const arg = (name: string, fallback: number) => {
    const index = process.argv.indexOf(`--${name}`);
    const value = index >= 0 ? Number(process.argv[index + 1]) : fallback;
    if (!Number.isInteger(value) || value <= 0) throw new Error(`--${name} must be a positive whole number.`);
    return value;
};
const TARGET_ROWS = arg('rows', 1_000_000);
const SPAN_DAYS = arg('days', 180);
const SEED = !process.argv.includes('--no-seed');
/** Rows per INSERT: well inside the driver's 15 s request timeout, ledger hashing and 9 indexes included. */
const BATCH = 10_000;
const RUNS = 7;
const TARGET_MS = 300;
/** Marks seeded entries, so they're recognizable in the scratch database. */
const SEED_SOURCE = 'JOB';
const SEED_ROUTE = 'job:audit-perf-seed';

async function assertScratchDatabase(): Promise<string> {
    const [{ name }] = await prisma.$queryRaw<{ name: string }[]>`SELECT DB_NAME() AS [name]`;
    if (!/scratch|perf/i.test(name)) {
        throw new Error(`Refusing to seed "${name}": AuditLog is append-only, so seeded rows can never be removed. Use a database whose name contains "scratch" or "perf".`);
    }
    return name;
}

/**
 * Inserts `count` entries in one set-based statement, entry `offset` onwards of `total`, in time order (the
 * clustered key appends, as in production). A realistic mix: ~60 users, 8 CRM modules, 50,000 records; mostly
 * updates and creates, then follow-ups, sign-ins, deletes, failed sign-ins, refused access, imports, settings.
 */
async function seedBatch(offset: number, count: number, total: number, start: Date, spanMs: number): Promise<void> {
    const stepMs = spanMs / total;
    await prisma.$executeRaw(Prisma.sql`
        WITH n AS (
            SELECT TOP (${count}) CAST(ROW_NUMBER() OVER (ORDER BY (SELECT NULL)) - 1 + ${offset} AS BIGINT) AS g
            FROM sys.all_objects a CROSS JOIN sys.all_objects b CROSS JOIN sys.all_objects c
        )
        INSERT INTO [dbo].[AuditLog] (
            [createdAt], [category], [action], [severity], [module], [entityType], [entityId], [entityCode], [entityLabel],
            [changedFields], [changesJson], [changedBy], [actorId], [actorRole], [source], [requestId], [httpMethod],
            [route], [page], [ipAddress], [userAgent]
        )
        SELECT
            DATEADD(millisecond, CAST(t.ms % 86400000 AS INT), DATEADD(day, CAST(t.ms / 86400000 AS INT), ${start})),
            CASE WHEN b.k >= 800 AND b.k < 880 OR b.k >= 940 AND b.k < 990 THEN N'SECURITY' WHEN b.k >= 995 THEN N'CONFIG' ELSE N'DATA' END,
            act.[action],
            CASE WHEN act.[action] IN (N'LOGIN_FAILED', N'ACCESS_DENIED') THEN N'WARNING'
                 WHEN act.[action] IN (N'DELETE', N'IMPORT') OR b.k >= 995 THEN N'NOTICE' ELSE N'INFO' END,
            m.[module], m.[entityType],
            CONCAT(N'rec-', (n.g * 13) % 50000),
            CONCAT(N'NIPL/', UPPER(LEFT(m.[module], 1)), N'/26-27/', 1000 + (n.g * 13) % 50000),
            CONCAT(N'Customer ', (n.g * 13) % 50000, N' Pvt Ltd'),
            CASE WHEN act.[action] IN (N'UPDATE', N'FOLLOW_UP', N'STATUS_CHANGE')
                 THEN CHOOSE(1 + CAST(n.g % 5 AS INT), N'|status|', N'|assignedTo|', N'|status|assignedTo|', N'|remarks|', N'|customFields|') END,
            CASE
                WHEN act.[action] IN (N'UPDATE', N'FOLLOW_UP', N'STATUS_CHANGE')
                    THEN CONCAT(N'{"status":{"from":"New","to":"Contacted"},"assignedTo":{"from":"user', n.g % 60, N'","to":"user', (n.g + 1) % 60,
                                N'"},"remarks":{"from":"Called, no answer","to":"Spoke to purchase head, quote requested for ', n.g % 997, N' licences"}}')
                WHEN act.[action] = N'CREATE'
                    THEN CONCAT(N'{"name":"Customer ', (n.g * 13) % 50000, N' Pvt Ltd","mobile":"+9198', RIGHT(CONCAT(N'00000000', n.g), 8),
                                N'","status":"New","assignedTo":"user', n.g % 60, N'","remarks":"', REPLICATE(N'Initial enquiry details. ', 20), N'"}')
                WHEN act.[action] IN (N'LOGIN', N'LOGIN_FAILED') THEN CONCAT(N'{"ip":"10.0.', n.g % 20, N'.', n.g % 250, N'"}')
                WHEN act.[action] = N'ACCESS_DENIED' THEN N'{"method":"GET","path":"/api/document-series","message":"You do not have permission to perform this action"}'
                WHEN act.[action] = N'IMPORT' THEN N'{"entity":"leads","fileName":"leads.xlsx","total":250,"created":248,"failed":2}'
            END,
            CONCAT(N'user', n.g % 60), CAST(1 + n.g % 60 AS INT), CHOOSE(1 + CAST(n.g % 3 AS INT), N'Sales Executive', N'Sales Manager', N'Admin'),
            ${SEED_SOURCE}, CONVERT(NVARCHAR(50), NEWID()), N'PUT', ${SEED_ROUTE}, CONCAT(N'/', m.[module]),
            CONCAT(N'10.0.', n.g % 20, N'.', n.g % 250), N'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/141.0'
        FROM n
        CROSS APPLY (SELECT CAST(n.g * ${stepMs} AS BIGINT) AS ms, CAST((n.g * 31) % 8 AS INT) AS mi) t
        CROSS APPLY (SELECT CAST((n.g * 7919) % 1000 AS INT) AS k) b
        CROSS APPLY (SELECT CASE
            WHEN b.k < 550 THEN N'UPDATE' WHEN b.k < 700 THEN N'CREATE' WHEN b.k < 800 THEN N'FOLLOW_UP' WHEN b.k < 880 THEN N'LOGIN'
            WHEN b.k < 910 THEN N'DELETE' WHEN b.k < 940 THEN N'STATUS_CHANGE' WHEN b.k < 970 THEN N'LOGOUT'
            WHEN b.k < 980 THEN N'LOGIN_FAILED' WHEN b.k < 990 THEN N'ACCESS_DENIED' WHEN b.k < 995 THEN N'IMPORT' ELSE N'UPDATE' END AS [action]) act
        CROSS APPLY (SELECT
            CASE WHEN b.k >= 995 THEN N'form-customization' WHEN act.[action] IN (N'LOGIN', N'LOGIN_FAILED', N'LOGOUT', N'ACCESS_DENIED') THEN N'users'
                 WHEN act.[action] = N'FOLLOW_UP' THEN N'leads'
                 ELSE CHOOSE(1 + t.mi, N'leads', N'opportunities', N'quotations', N'organizations', N'contacts', N'products', N'tickets', N'partner-companies') END AS [module],
            CASE WHEN b.k >= 995 THEN N'FormField' WHEN act.[action] IN (N'LOGIN', N'LOGIN_FAILED', N'LOGOUT', N'ACCESS_DENIED') THEN N'User'
                 WHEN act.[action] = N'FOLLOW_UP' THEN N'Lead' WHEN act.[action] = N'IMPORT' THEN N'Import'
                 ELSE CHOOSE(1 + t.mi, N'Lead', N'Opportunity', N'Quotation', N'Organization', N'Contact', N'Product', N'Ticket', N'PartnerCompany') END AS [entityType]
        ) m
        ORDER BY n.g
        OPTION (MAXDOP 1)`);
}

async function seed(): Promise<void> {
    const existing = await prisma.auditLog.count();
    const missing = TARGET_ROWS - existing;
    if (missing <= 0) {
        console.log(`AuditLog already holds ${existing.toLocaleString('en-IN')} entries; not seeding.`);
        return;
    }
    // A re-run carries on where an interrupted one stopped: entry n of TARGET_ROWS always gets the same place in time.
    // The seed ends now, so "the last 30 days" is a full window of it.
    const spanMs = SPAN_DAYS * 24 * 60 * 60 * 1000;
    const start = new Date(Date.now() - spanMs);
    console.log(`Seeding ${missing.toLocaleString('en-IN')} entries over ${SPAN_DAYS} days…`);
    const began = performance.now();
    for (let offset = existing; offset < TARGET_ROWS; offset += BATCH) {
        await seedBatch(offset, Math.min(BATCH, TARGET_ROWS - offset), TARGET_ROWS, start, spanMs);
        process.stdout.write(`  ${Math.min(offset + BATCH, TARGET_ROWS).toLocaleString('en-IN')}\r`);
    }
    console.log(`\nSeeded in ${((performance.now() - began) / 1000).toFixed(0)} s.`);
    // Fresh statistics, as SQL Server's auto-update would have them after a bulk load.
    await prisma.$executeRawUnsafe('UPDATE STATISTICS [dbo].[AuditLog] WITH FULLSCAN');
}

async function time(label: string, fn: () => Promise<unknown>): Promise<{ label: string; median: number; max: number }> {
    await fn(); // warm-up: plan compile, buffer pool
    const samples: number[] = [];
    for (let i = 0; i < RUNS; i++) {
        const began = performance.now();
        await fn();
        samples.push(performance.now() - began);
    }
    samples.sort((a, b) => a - b);
    return { label, median: samples[Math.floor(samples.length / 2)], max: samples[samples.length - 1] };
}

async function main(): Promise<void> {
    const database = await assertScratchDatabase();
    connectRedis();
    await new Promise((resolve) => setTimeout(resolve, 1500));
    if (SEED) await seed();

    const total = await prisma.auditLog.count();
    const day = (offset: number) => new Date(Date.now() + offset * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const last30 = { from: day(-29), to: day(0) };
    const inWindow = await prisma.auditLog.count({ where: { createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } } });
    const firstPage = await auditAdminService.list(last30);
    // A cursor near the old end of the window: keyset paging costs the same on page 1 and page 3,000.
    const oldest = await prisma.auditLog.findFirst({ where: { createdAt: { gte: new Date(Date.now() - 29 * 24 * 60 * 60 * 1000) } }, orderBy: { id: 'asc' }, select: { id: true } });
    const deepCursor = String((oldest?.id ?? 1000n) + 1000n);
    const someId = firstPage.items[0]?.id ?? '1';

    console.log(`\nDatabase ${database}: ${total.toLocaleString('en-IN')} entries, ${inWindow.toLocaleString('en-IN')} in the last 30 days. Redis: ${isRedisReady() ? 'on' : 'off'}.\n`);
    const results = [
        await time('List, 30 days, all modules, first page (50)', () => auditAdminService.list(last30)),
        await time('List, 30 days, page near the end of the window', () => auditAdminService.list({ ...last30, cursor: deepCursor })),
        await time('List, 30 days, 200 per page', () => auditAdminService.list({ ...last30, limit: '200' })),
        await time('List, 30 days, module = opportunities', () => auditAdminService.list({ ...last30, module: 'opportunities' })),
        await time('List, 30 days, one user', () => auditAdminService.list({ ...last30, user: 'user7' })),
        await time('List, 30 days, Security category', () => auditAdminService.list({ ...last30, category: 'SECURITY' })),
        await time('List, 30 days, failed sign-ins', () => auditAdminService.list({ ...last30, action: 'LOGIN_FAILED' })),
        await time('List, 30 days, field = assignedTo', () => auditAdminService.list({ ...last30, field: 'assignedTo' })),
        await time('List, one record (all time)', () => auditAdminService.list({ entityType: 'Lead', entityId: 'rec-1234' })),
        await time('List, 30 days, free text (common)', () => auditAdminService.list({ ...last30, q: 'Customer 12' })),
        await time('List, 30 days, free text (no match: full window)', () => auditAdminService.list({ ...last30, q: 'zz-no-such-text' })),
        await time('List, all time, first page (no dates)', () => auditAdminService.list({})),
        await time('Entry detail', () => auditAdminService.get({ id: someId })),
        await time('Facets, 30 days', () => auditAdminService.facets(last30)),
        await time('Stats, 30 days', () => auditAdminService.stats(last30)),
        await time('Users tab, 30 days', () => auditAdminService.users(last30)),
        await time('Users tab, 366 days', () => auditAdminService.users({ from: day(-365), to: day(0) })),
    ];

    const width = Math.max(...results.map((r) => r.label.length));
    console.log(`${'Query'.padEnd(width)}  median    max   (ms, ${RUNS} warm runs)`);
    for (const r of results) console.log(`${r.label.padEnd(width)}  ${r.median.toFixed(0).padStart(6)} ${r.max.toFixed(0).padStart(6)}`);
    const headline = results[0];
    console.log(`\n30-day all-module first page: ${headline.median.toFixed(0)} ms median (target < ${TARGET_MS} ms) → ${headline.median < TARGET_MS ? 'PASS' : 'FAIL'}`);
    if (headline.median >= TARGET_MS) process.exitCode = 1;
}

main()
    .catch((err: Error) => {
        console.error(err.message);
        process.exitCode = 1;
    })
    .finally(async () => {
        await prisma.$disconnect();
        redis.disconnect();
    });
