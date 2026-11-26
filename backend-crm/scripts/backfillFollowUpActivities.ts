import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Follow-up activities backfill (Calendar Phase 2 P2-4, spec §11.6):
 *
 *   npm run followups:backfill -- --dry-run     counts only (writes nothing)
 *   npm run followups:backfill                  creates / re-aligns / cancels follow-up activities
 *   npm run followups:backfill -- --batch=500   records read per query (default 200)
 *
 * Creates the follow-up activity of every open lead / opportunity with a next follow-up that has none (or puts it back
 * in line), and cancels open follow-up activities whose record is closed, deleted or has no follow-up any more. Each
 * record is fixed in its own transaction under the record's lock, so it is safe next to users' saves and the nightly
 * step (00:20, reminders worker), and running it again changes nothing. Audited as `system` (origin
 * job:followup-backfill); nobody is notified. Nothing is written while Admin › API Integrations › "Follow-ups create
 * activities" is off. Run it from backend-crm with the production .env (DATABASE_URL).
 */

export function parseArgs(argv: readonly string[]): { dryRun: boolean; batch?: number } {
    const dryRun = argv.includes('--dry-run');
    const batchArg = argv.find((arg) => arg.startsWith('--batch='));
    const batch = batchArg ? Number(batchArg.slice('--batch='.length)) : undefined;
    return { dryRun, batch: batch && Number.isInteger(batch) && batch > 0 ? batch : undefined };
}

async function main(): Promise<void> {
    const { prisma } = await import('../src/config/prisma.js');
    const { backfillFollowUpActivities } = await import('../src/modules/activities/activity.followUpBackfill.js');
    try {
        const args = parseArgs(process.argv.slice(2));
        const report = await backfillFollowUpActivities(args);
        if (report.switchedOff) console.log('"Follow-ups create activities" is off (Admin › API Integrations): nothing was written.');
        for (const module of ['leads', 'opportunities'] as const) {
            const r = report[module];
            console.log(
                `${module}: ${r.checked} open with a follow-up checked · ${r.missing} without an activity · ${r.misaligned} out of line · ` +
                    `${r.orphaned} activities of closed / deleted records · ${r.fallbackType} with a blank / Task / Note type (→ Call) · ` +
                    `${r.pastSlots} already past (overdue activities)` +
                    (report.dryRun ? ' · dry run, nothing written' : ` · ${r.fixed} fixed · ${r.failed} failed`),
            );
        }
        process.exitCode = report.leads.failed + report.opportunities.failed > 0 ? 1 : 0;
    } finally {
        await prisma.$disconnect();
    }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    main().catch((err: unknown) => {
        console.error(err instanceof Error ? err.message : err);
        process.exitCode = 1;
    });
}
