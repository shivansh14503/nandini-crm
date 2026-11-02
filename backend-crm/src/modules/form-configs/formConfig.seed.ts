import { prisma } from '../../config/prisma.js';
import type { TransactionClient } from '../../config/prisma.js';
import { logger } from '../../config/logger.js';
import { CACHE_KEYS, cacheService } from '../../services/cache.service.js';
import { DEFAULT_CATEGORIES, DEFAULT_FIELDS, sectionKeyFromLabel, type DefaultOption } from './formConfig.defaults.js';

const toOption = (option: string | DefaultOption): DefaultOption => (typeof option === 'string' ? { value: option } : option);

/**
 * Inserts any default dropdown category / option / built-in field that is missing, without touching what an
 * admin has customized (labels, order, archived options, visibility, …). Safe to run on every start-up.
 *
 * Integrity rules are re-asserted on existing rows, because the API depends on them:
 *  • default system options stay system + active (e.g. lead 'Converted');
 *  • built-in fields stay system, and core-locked ones stay visible, active and (if required) required.
 */
export async function ensureFormConfigsSeeded(): Promise<void> {
    let changed = 0;

    // ── Categories & options ──
    const existingCategories = await prisma.dropdownCategory.findMany({ include: { options: true } });
    const categoriesByKey = new Map(existingCategories.map((c) => [c.key, c]));

    for (const def of DEFAULT_CATEGORIES) {
        let category = categoriesByKey.get(def.key);
        if (!category) {
            const created = await prisma.dropdownCategory.create({
                data: { key: def.key, label: def.label, module: def.module, description: def.description ?? null, isSystem: true },
            });
            category = { ...created, options: [] };
            categoriesByKey.set(def.key, category);
            changed++;
        }
        // Deleted by an admin: the tombstone keeps it from being recreated; leave it (and its options) alone.
        if (category.deletedAt) continue;

        const existingValues = new Map(category.options.map((o) => [o.value, o]));
        const maxSort = category.options.reduce((max, o) => Math.max(max, o.sortOrder), 0);
        const isNewCategory = category.options.length === 0;
        // A brand-new category gets every default option. An existing one only gets missing *system* options back:
        // non-system defaults the admin permanently deleted must not resurrect on the next start-up.
        const missing = def.options
            .map(toOption)
            .filter((o) => !existingValues.has(o.value) && (isNewCategory || o.isSystem));
        if (missing.length > 0) {
            // A brand-new category takes the default order; options added to an existing one go last.
            const base = isNewCategory ? 0 : maxSort;
            await prisma.dropdownOption.createMany({
                data: missing.map((o, index) => ({
                    categoryId: category.id,
                    value: o.value,
                    label: o.label ?? o.value,
                    metaJson: o.meta ? JSON.stringify(o.meta) : null,
                    sortOrder: base + (index + 1) * 10,
                    isSystem: Boolean(o.isSystem),
                    isActive: true,
                })),
            });
            changed += missing.length;
        }

        const systemValues = def.options.map(toOption).filter((o) => o.isSystem).map((o) => o.value);
        const drifted = category.options.filter((o) => systemValues.includes(o.value) && (!o.isSystem || !o.isActive));
        if (drifted.length > 0) {
            await prisma.dropdownOption.updateMany({ where: { id: { in: drifted.map((o) => o.id) } }, data: { isSystem: true, isActive: true } });
            changed += drifted.length;
        }
    }

    // ── Built-in fields ──
    const existingFields = await prisma.formFieldDefinition.findMany({ where: { isSystem: true } });
    const fieldsByKey = new Map(existingFields.map((f) => [`${f.module}:${f.fieldKey}`, f]));
    const toInsert = DEFAULT_FIELDS.filter((f) => !fieldsByKey.has(`${f.module}:${f.fieldKey}`));
    /** Id of a default dropdown unless an admin deleted it. */
    const liveCategoryId = (key: string | undefined) => {
        const category = key ? categoriesByKey.get(key) : undefined;
        return category && !category.deletedAt ? category.id : null;
    };

    if (toInsert.length > 0) {
        const existingModules = new Set(existingFields.map((f) => f.module));
        // Insert and placement succeed or fail together, so a failed start-up retries both next time.
        await prisma.$transaction(
            async (tx) => {
                // A custom field could only clash on (module, fieldKey) if it lacked the cf_ prefix, which the API prevents.
                await tx.formFieldDefinition.createMany({
                    data: toInsert.map((f) => ({
                module: f.module,
                fieldKey: f.fieldKey,
                label: f.label,
                fieldType: f.fieldType,
                tabKey: f.tabKey,
                sectionKey: sectionKeyFromLabel(f.sectionLabel),
                sectionLabel: f.sectionLabel,
                sortOrder: f.sortOrder,
                isRequired: f.isRequired,
                isCoreLocked: f.isCoreLocked,
                isSystem: true,
                isActive: true,
                isVisibleInDrawer: true,
                dropdownCategoryId: liveCategoryId(f.dropdownCategoryKey),
                // A new built-in field whose default dropdown an admin deleted starts hidden (no options to offer).
                isVisibleInForm: !f.dropdownCategoryKey || Boolean(liveCategoryId(f.dropdownCategoryKey)),
                    })),
                });

                // Fields added to a module that already had a configuration (new defaults in a release) would collide
                // with the admin's numbering: slot each in after its section (or tab), keeping the admin's order.
                for (const module of new Set(toInsert.map((f) => f.module))) {
                    if (!existingModules.has(module)) continue;
                    const added = toInsert.filter((f) => f.module === module).map((f) => f.fieldKey);
                    await placeNewFields(tx, module, added);
                }
            },
            { timeout: 120_000, maxWait: 20_000 },
        );
        changed += toInsert.length;
    }

    for (const def of DEFAULT_FIELDS) {
        const row = fieldsByKey.get(`${def.module}:${def.fieldKey}`);
        if (!row) continue;
        const needsLockFix =
            row.isCoreLocked !== def.isCoreLocked ||
            !row.isActive ||
            (def.isCoreLocked && (!row.isVisibleInForm || (def.isRequired && !row.isRequired)));
        if (!needsLockFix) continue;
        await prisma.formFieldDefinition.update({
            where: { id: row.id },
            data: {
                isCoreLocked: def.isCoreLocked,
                isActive: true,
                ...(def.isCoreLocked ? { isVisibleInForm: true, ...(def.isRequired ? { isRequired: true } : {}) } : {}),
            },
        });
        changed++;
    }

    if (changed > 0) {
        await cacheService.invalidatePattern(`${CACHE_KEYS.lookups('form-configs')}*`);
        logger.info({ changed }, 'Form & dropdown configuration defaults seeded');
    }
}

/**
 * Places newly inserted built-in fields (`fieldKeys`, in default order) of a module: each goes after the last
 * field of its tab + section, else of its tab, else at the end (as the API's placeField does); then the module is
 * renumbered 10, 20, … Computed in memory so only rows whose number changes are written.
 */
async function placeNewFields(tx: TransactionClient, module: string, fieldKeys: string[]): Promise<void> {
    const all = await tx.formFieldDefinition.findMany({
        where: { module },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        select: { id: true, fieldKey: true, isSystem: true, tabKey: true, sectionKey: true, sortOrder: true },
    });
    const isNew = (f: (typeof all)[number]) => f.isSystem && fieldKeys.includes(f.fieldKey);
    const ordered = all.filter((f) => !isNew(f));
    for (const key of fieldKeys) {
        const field = all.find((f) => f.isSystem && f.fieldKey === key);
        if (!field) continue;
        const lastIndex = (match: (f: (typeof all)[number]) => boolean) => ordered.reduce((idx, f, i) => (match(f) ? i : idx), -1);
        let at = lastIndex((f) => f.tabKey === field.tabKey && f.sectionKey === field.sectionKey);
        if (at < 0) at = lastIndex((f) => f.tabKey === field.tabKey);
        if (at < 0) ordered.push(field);
        else ordered.splice(at + 1, 0, field);
    }
    for (const [index, field] of ordered.entries()) {
        const sortOrder = (index + 1) * 10;
        if (field.sortOrder !== sortOrder) await tx.formFieldDefinition.update({ where: { id: field.id }, data: { sortOrder } });
    }
}

/** Start-up wrapper: a seeding failure (e.g. a concurrent instance inserted first) must not stop the API. */
export async function seedFormConfigsSafely(): Promise<void> {
    try {
        await ensureFormConfigsSeeded();
    } catch (err) {
        logger.warn({ err: (err as Error).message }, 'Form configuration seeding skipped');
    }
}
