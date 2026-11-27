import { prisma } from '../../config/prisma.js';
import { logger } from '../../config/logger.js';
import { RATING_RULE_META_KEY } from '../leads/lead.rating.js';
import { NO_FOLLOW_UP_META_KEY, OPPORTUNITY_STAGES_META_KEY } from '../opportunities/opportunity.followUp.js';
import { CUSTOMER_RESPONSE_CATEGORY_KEYS, DEFAULT_CATEGORIES, LEGACY_CUSTOMER_RESPONSE_CATEGORY_KEY } from './formConfig.defaults.js';

type SplitModule = keyof typeof CUSTOMER_RESPONSE_CATEGORY_KEYS;

/** Option meta keys only one module reads; the other lists drop them when the shared list is split. */
const MODULE_ONLY_META: Record<SplitModule, readonly string[]> = {
    leads: [OPPORTUNITY_STAGES_META_KEY, NO_FOLLOW_UP_META_KEY],
    opportunities: [RATING_RULE_META_KEY],
    activities: [RATING_RULE_META_KEY, OPPORTUNITY_STAGES_META_KEY, NO_FOLLOW_UP_META_KEY],
};

/**
 * The option meta a module's own list keeps: leads keep the Rating rule, opportunities the Sales Stages and the
 * "No follow-up" switch, activities none of them. Other (free-form) meta keys stay. Null when nothing is left.
 */
export function metaForModule(metaJson: string | null, module: SplitModule): string | null {
    if (!metaJson) return null;
    let meta: unknown;
    try {
        meta = JSON.parse(metaJson);
    } catch {
        return metaJson;
    }
    if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return metaJson;
    const kept = Object.fromEntries(Object.entries(meta).filter(([key]) => !MODULE_ONLY_META[module].includes(key)));
    return Object.keys(kept).length > 0 ? JSON.stringify(kept) : null;
}

const description = (key: string) => DEFAULT_CATEGORIES.find((c) => c.key === key)?.description ?? null;

/**
 * One-time split of the old shared Customer Response list (`shared_customer_response`, used by Leads, Opportunities
 * and Activities) into one list per module, so each module's Customer Response is configured on its own in the Form
 * Builder. Runs at start-up before the defaults are seeded (so those don't create empty-of-history default lists):
 *
 *  - Leads and Opportunities each get a copy of the list as the admin left it (values, labels, order, active,
 *    default and system flags), keeping only the meta that module reads; their built-in field is relinked to it.
 *    Record values need no change: every record keeps its own column, and the option values are the same.
 *  - The old row itself becomes the Activities list (same id, so anything else linked to it stays linked).
 *
 * Idempotent: once the old key is gone nothing happens. A module whose new list already exists is skipped.
 */
export async function splitLegacyCustomerResponse(): Promise<number> {
    const legacy = await prisma.dropdownCategory.findUnique({ where: { key: LEGACY_CUSTOMER_RESPONSE_CATEGORY_KEY }, include: { options: true } });
    if (!legacy) return 0;

    let changed = 0;
    await prisma.$transaction(
        async (tx) => {
            const targets = await tx.dropdownCategory.findMany({
                where: { key: { in: Object.values(CUSTOMER_RESPONSE_CATEGORY_KEYS) } },
                select: { id: true, key: true, deletedAt: true, _count: { select: { fields: true } } },
            });
            /**
             * A row already holding a new key that isn't this split's result frees the key: e.g. the tombstone of the
             * short-lived leads-only `lead_customer_response` (migration 20261125220000_shared_customer_response
             * folded it into the shared list and deleted it). Unused → removed; still used by a field → renamed.
             */
            const freeKey = async (target: (typeof targets)[number]) => {
                if (target._count.fields === 0) await tx.dropdownCategory.delete({ where: { id: target.id } });
                else await tx.dropdownCategory.update({ where: { id: target.id }, data: { key: `${target.key}_old_${target.id.slice(0, 8)}`, isSystem: false } });
            };

            for (const module of ['leads', 'opportunities'] as const) {
                const key = CUSTOMER_RESPONSE_CATEGORY_KEYS[module];
                const target = targets.find((t) => t.key === key);
                if (target) {
                    const linked = await tx.formFieldDefinition.count({ where: { module, fieldKey: 'customerResponse', isSystem: true, dropdownCategoryId: target.id } });
                    // Already split (the module's field uses its own list): nothing to do.
                    if (linked > 0 && !target.deletedAt) continue;
                    await freeKey(target);
                }
                const created = await tx.dropdownCategory.create({
                    data: {
                        key,
                        label: legacy.label,
                        module,
                        description: description(key),
                        isSystem: true,
                        // An admin-deleted shared list stays deleted for both modules.
                        deletedAt: legacy.deletedAt,
                    },
                });
                if (legacy.options.length > 0) {
                    await tx.dropdownOption.createMany({
                        data: legacy.options.map((o) => ({
                            categoryId: created.id,
                            value: o.value,
                            label: o.label,
                            metaJson: metaForModule(o.metaJson, module),
                            sortOrder: o.sortOrder,
                            isActive: o.isActive,
                            isSystem: o.isSystem,
                            isDefault: o.isDefault,
                        })),
                    });
                }
                const relinked = await tx.formFieldDefinition.updateMany({
                    where: { module, fieldKey: 'customerResponse', isSystem: true, dropdownCategoryId: legacy.id },
                    data: { dropdownCategoryId: created.id },
                });
                changed += 1 + legacy.options.length + relinked.count;
            }

            // The old row becomes the Activities list (its options lose the lead / opportunity meta).
            const activitiesKey = CUSTOMER_RESPONSE_CATEGORY_KEYS.activities;
            const activitiesTarget = targets.find((t) => t.key === activitiesKey);
            if (activitiesTarget?.deletedAt) await freeKey(activitiesTarget);
            if (activitiesTarget && !activitiesTarget.deletedAt) {
                // Already there (e.g. a half-run split): the old row only keeps fields an admin linked to it.
                await tx.dropdownCategory.update({ where: { id: legacy.id }, data: { key: `${LEGACY_CUSTOMER_RESPONSE_CATEGORY_KEY}_old_${legacy.id.slice(0, 8)}`, isSystem: false } });
            } else {
                await tx.dropdownCategory.update({
                    where: { id: legacy.id },
                    data: { key: activitiesKey, module: 'activities', description: description(activitiesKey) },
                });
                for (const option of legacy.options) {
                    const metaJson = metaForModule(option.metaJson, 'activities');
                    if (metaJson !== option.metaJson) await tx.dropdownOption.update({ where: { id: option.id }, data: { metaJson } });
                }
            }
            changed++;
        },
        { timeout: 60_000, maxWait: 20_000 },
    );
    logger.info({ changed }, 'Customer Response split into one list per module (Leads, Opportunities, Activities)');
    return changed;
}
