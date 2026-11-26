import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { keyIdOf, open, seal, SecretBoxError, type KeyRing } from '../src/services/secretBox.js';

/**
 * Re-seals every stored integration secret with the active key of INTEGRATIONS_ENCRYPTION_KEY, after a key rotation:
 *
 *   1. Put the new key first and keep the old one:   INTEGRATIONS_ENCRYPTION_KEY=k2:<new>,k1:<old>   (API and worker)
 *   2. Restart, then run:                            npm run integrations:reencrypt -- --dry-run   (counts only)
 *                                                    npm run integrations:reencrypt
 *   3. When it reports 0 rows left on the old key, drop it from the env value and restart again.
 *
 * Covers IntegrationProvider.secretsEnc and CalendarConnection.accessTokenEnc / refreshTokenEnc (in batches of 100;
 * each connection row is rewritten only while its tokenVersion is unchanged, so a concurrent token refresh, which
 * seals with the active key anyway, wins). Exit code 1 when a value can't be opened with any key in the ring (it is
 * left as it is and named by id only; the employee reconnects).
 */

export interface SealedRow {
    /** Row id, e.g. the provider key. */
    id: string;
    /** AAD the value was sealed with. */
    aad: string;
    sealed: string;
}

export interface ReencryptPlan {
    /** Rows to rewrite: `sealed` is the new value. */
    updates: { id: string; sealed: string; fromKid: string }[];
    alreadyCurrent: number;
    unreadable: { id: string; reason: string }[];
    /** Rows per key id before the run. */
    byKid: Record<string, number>;
}

/** Pure: what a run would rewrite. */
export function planReencrypt(rows: readonly SealedRow[], ring: KeyRing): ReencryptPlan {
    const plan: ReencryptPlan = { updates: [], alreadyCurrent: 0, unreadable: [], byKid: {} };
    for (const row of rows) {
        let kid: string;
        try {
            kid = keyIdOf(row.sealed);
        } catch {
            plan.unreadable.push({ id: row.id, reason: 'not a sealed value' });
            continue;
        }
        plan.byKid[kid] = (plan.byKid[kid] ?? 0) + 1;
        if (kid === ring.activeKid) {
            plan.alreadyCurrent += 1;
            continue;
        }
        try {
            plan.updates.push({ id: row.id, sealed: seal(ring, open(ring, row.sealed, row.aad), row.aad), fromKid: kid });
        } catch (err) {
            plan.unreadable.push({ id: row.id, reason: err instanceof SecretBoxError ? err.code : 'error' });
        }
    }
    return plan;
}

export interface ConnectionTokenRow {
    id: string;
    tokenVersion: number;
    accessTokenEnc: string | null;
    refreshTokenEnc: string | null;
}

export const connectionTokenAad = (id: string, field: 'accessToken' | 'refreshToken') => `CalendarConnection:${id}:${field}`;

export interface ConnectionReencryptPlan {
    /** Rows to rewrite: only the fields that change are set. */
    updates: { id: string; tokenVersion: number; accessTokenEnc?: string; refreshTokenEnc?: string }[];
    alreadyCurrent: number;
    unreadable: { id: string; reason: string }[];
    byKid: Record<string, number>;
}

/** Pure: the CalendarConnection token values a run would re-seal (both columns of a row in one update). */
export function planConnectionReencrypt(rows: readonly ConnectionTokenRow[], ring: KeyRing): ConnectionReencryptPlan {
    const values: SealedRow[] = [];
    for (const row of rows) {
        if (row.accessTokenEnc) values.push({ id: `${row.id}|accessToken`, aad: connectionTokenAad(row.id, 'accessToken'), sealed: row.accessTokenEnc });
        if (row.refreshTokenEnc) values.push({ id: `${row.id}|refreshToken`, aad: connectionTokenAad(row.id, 'refreshToken'), sealed: row.refreshTokenEnc });
    }
    const plan = planReencrypt(values, ring);
    const byRow = new Map<string, ConnectionReencryptPlan['updates'][number]>();
    const versions = new Map(rows.map((row) => [row.id, row.tokenVersion]));
    for (const update of plan.updates) {
        const [id, field] = update.id.split('|') as [string, 'accessToken' | 'refreshToken'];
        const entry = byRow.get(id) ?? { id, tokenVersion: versions.get(id) ?? 0 };
        if (field === 'accessToken') entry.accessTokenEnc = update.sealed;
        else entry.refreshTokenEnc = update.sealed;
        byRow.set(id, entry);
    }
    return { updates: [...byRow.values()], alreadyCurrent: plan.alreadyCurrent, unreadable: plan.unreadable, byKid: plan.byKid };
}

const CONNECTION_BATCH = 100;

async function main(): Promise<void> {
    const dryRun = process.argv.includes('--dry-run');
    const [{ ENV }, { parseKeyRing }, { prisma }] = await Promise.all([
        import('../src/config/env.js'),
        import('../src/services/secretBox.js'),
        import('../src/config/prisma.js'),
    ]);
    const ring = parseKeyRing(process.env.INTEGRATIONS_ENCRYPTION_KEY);
    if (!ring || !ENV.INTEGRATIONS.KEY_CONFIGURED) {
        console.error('INTEGRATIONS_ENCRYPTION_KEY is not set: nothing can be re-encrypted.');
        process.exit(1);
    }
    try {
        const providers = await prisma.integrationProvider.findMany({ where: { secretsEnc: { not: null } }, select: { provider: true, secretsEnc: true } });
        const plan = planReencrypt(
            providers.map((p) => ({ id: p.provider, aad: `IntegrationProvider:${p.provider}:secrets`, sealed: p.secretsEnc! })),
            ring,
        );
        console.log(`IntegrationProvider: ${providers.length} sealed row(s) by key ${JSON.stringify(plan.byKid)}; active key ${ring.activeKid}.`);
        console.log(`  ${plan.updates.length} to re-seal, ${plan.alreadyCurrent} already on ${ring.activeKid}, ${plan.unreadable.length} unreadable.`);
        for (const row of plan.unreadable) console.log(`  unreadable: ${row.id} (${row.reason})`);
        if (!dryRun) {
            for (const update of plan.updates) {
                // Only rewrite a row still holding the value that was read (a concurrent admin save wins).
                const before = providers.find((p) => p.provider === update.id)!.secretsEnc;
                const result = await prisma.integrationProvider.updateMany({
                    where: { provider: update.id, secretsEnc: before },
                    data: { secretsEnc: update.sealed, keyId: ring.activeKid },
                });
                console.log(`  ${update.id}: ${result.count === 1 ? `re-sealed (${update.fromKid} → ${ring.activeKid})` : 'changed meanwhile, skipped'}`);
            }
        } else {
            console.log('Dry run: nothing written.');
        }

        // CalendarConnection tokens, 100 rows at a time.
        let cursor: string | undefined;
        const totals: ConnectionReencryptPlan = { updates: [], alreadyCurrent: 0, unreadable: [], byKid: {} };
        let rewritten = 0;
        let skipped = 0;
        for (;;) {
            const rows: ConnectionTokenRow[] = await prisma.calendarConnection.findMany({
                where: { OR: [{ accessTokenEnc: { not: null } }, { refreshTokenEnc: { not: null } }] },
                select: { id: true, tokenVersion: true, accessTokenEnc: true, refreshTokenEnc: true },
                orderBy: { id: 'asc' },
                take: CONNECTION_BATCH,
                ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
            });
            if (rows.length === 0) break;
            cursor = rows[rows.length - 1].id;
            const batch = planConnectionReencrypt(rows, ring);
            totals.alreadyCurrent += batch.alreadyCurrent;
            totals.unreadable.push(...batch.unreadable);
            for (const [kid, count] of Object.entries(batch.byKid)) totals.byKid[kid] = (totals.byKid[kid] ?? 0) + count;
            totals.updates.push(...batch.updates);
            if (dryRun) continue;
            for (const update of batch.updates) {
                const { id, tokenVersion, ...sealed } = update;
                const result = await prisma.calendarConnection.updateMany({
                    // Not on a row disconnected meanwhile (its tokens were nulled without a tokenVersion change).
                    where: { id, tokenVersion, status: { not: 'disconnected' } },
                    data: { ...sealed, keyId: ring.activeKid },
                });
                if (result.count === 1) rewritten += 1;
                else skipped += 1;
            }
        }
        console.log(`CalendarConnection: sealed token values by key ${JSON.stringify(totals.byKid)}.`);
        console.log(`  ${totals.updates.length} row(s) to re-seal, ${totals.alreadyCurrent} value(s) already on ${ring.activeKid}, ${totals.unreadable.length} unreadable.`);
        for (const row of totals.unreadable) console.log(`  unreadable: ${row.id} (${row.reason})`);
        if (!dryRun) console.log(`  ${rewritten} re-sealed, ${skipped} refreshed meanwhile (already on the active key), skipped.`);

        process.exitCode = plan.unreadable.length > 0 || totals.unreadable.length > 0 ? 1 : 0;
    } finally {
        await prisma.$disconnect();
    }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    main().catch((err: Error) => {
        console.error(`Re-encrypt failed: ${err.message}`);
        process.exit(1);
    });
}
