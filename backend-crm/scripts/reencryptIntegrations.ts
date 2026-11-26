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
 * Covers IntegrationProvider.secretsEnc only (Google's service account key, Microsoft's / Zoom's client and webhook
 * secrets). Since admin-managed calendar sync (P2-2b) no token is stored anywhere: access tokens live only in process
 * memory, so there is nothing else to re-seal. Exit code 1 when a value can't be opened with any key in the ring (it
 * is left as it is and named by id only; an admin enters that provider's credentials again).
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
        process.exitCode = plan.unreadable.length > 0 ? 1 : 0;
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
