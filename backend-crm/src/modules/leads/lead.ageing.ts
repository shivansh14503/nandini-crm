import { logger } from '../../config/logger.js';
import { prisma } from '../../config/prisma.js';
import { auditService } from '../../services/audit.service.js';
import { runWithAuditOrigin } from '../../services/auditContext.js';
import { cacheService } from '../../services/cache.service.js';
import { toDateOnly } from '../../utils/mappers.js';
import { businessToday } from '../../validators/notInPast.js';
import { ageingFromColumns, rateAgeing } from './lead.rating.js';

/** Author of the history entries the nightly job writes. */
export const AGEING_ACTOR = 'system';

const BATCH = 200;

export interface AgeingRunResult {
    checked: number;
    changed: number;
}

/**
 * Re-rates the live leads ageing under a "Days since response" rule (Hot → Warm → Cold by the limits they started
 * with, docs/lead-rating-rules.md). Only leads whose Rating changes are written, each with a history entry by
 * `system`. Safe to run twice at once or after a missed night: a lead is only written while its Rating is still the
 * one this run read, so two runs never record the same change twice.
 * Its audit entries are tagged source JOB, route `job:lead-rating-ageing`, one request id per run.
 */
export function ageLeadRatings(today: string = businessToday()): Promise<AgeingRunResult> {
    return runWithAuditOrigin({ source: 'JOB', route: 'job:lead-rating-ageing' }, () => ageLeads(today));
}

async function ageLeads(today: string): Promise<AgeingRunResult> {
    let checked = 0;
    let changed = 0;
    let cursor: string | undefined;

    for (;;) {
        const rows = await prisma.lead.findMany({
            where: { isDeleted: false, ratingAgeingFrom: { not: null }, ...(cursor ? { id: { gt: cursor } } : {}) },
            select: { id: true, rating: true, ratingReason: true, ratingAgeingFrom: true, ratingAgeingJson: true },
            orderBy: { id: 'asc' },
            take: BATCH,
        });
        if (rows.length === 0) break;
        cursor = rows[rows.length - 1].id;

        for (const row of rows) {
            checked++;
            const snapshot = ageingFromColumns(toDateOnly(row.ratingAgeingFrom), row.ratingAgeingJson);
            if (!snapshot) continue;
            const next = rateAgeing(snapshot, today);
            if (next.rating === row.rating) continue;

            const wrote = await prisma.$transaction(async (tx) => {
                const { count } = await tx.lead.updateMany({
                    where: { id: row.id, rating: row.rating, isDeleted: false, ratingAgeingFrom: { not: null } },
                    data: { rating: next.rating, ratingReason: next.reason },
                });
                if (count === 0) return false;
                await auditService.record(tx, {
                    entityType: 'Lead',
                    entityId: row.id,
                    action: 'UPDATE',
                    changedBy: AGEING_ACTOR,
                    changes: {
                        rating: { from: row.rating ?? '', to: next.rating },
                        ...(row.ratingReason !== next.reason ? { ratingReason: { from: row.ratingReason ?? '', to: next.reason } } : {}),
                        reason: 'Rating aged overnight',
                    },
                });
                return true;
            });
            if (wrote) changed++;
        }
        if (rows.length < BATCH) break;
    }

    if (changed > 0) await cacheService.invalidateEntityCaches('leads');
    logger.info({ today, checked, changed }, 'Lead Rating ageing run finished');
    return { checked, changed };
}
