import { prisma, type TransactionClient } from '../src/config/prisma.js';
import { connectRedis, isRedisReady, redis } from '../src/config/redis.js';
import { auditService } from '../src/services/audit.service.js';
import { HttpError } from '../src/utils/httpError.js';
import { cacheService } from '../src/services/cache.service.js';
import { lockModuleFields, describeMigration, migrateFieldKey } from '../src/modules/form-configs/fieldKeyRename.js';
import { CRM_MODULES, type CrmModuleKey } from '../src/modules/form-configs/formConfig.defaults.js';
import { categoryKeyForLabel, changeOptionValue, customFieldKey, invalidateFormConfigCaches } from '../src/modules/form-configs/formConfig.service.js';

/**
 * One-off clean-up: makes every backend name match the name shown in the UI, as the app now keeps them.
 *
 *  - dropdown options:          stored value := label (records, saved filters and field defaults follow);
 *                               a system option (whose value the code relies on) gets its label set to its value
 *  - builder-added dropdowns:   key := <name> in snake_case
 *  - builder-added fields:      key := <label> in snake_case (record values, saved filters and PDF template paths follow)
 *
 * Built-in fields and dropdowns keep the column / key the code is written against.
 *
 *   npm run align:backend-names            dry run: makes every change in a transaction, reports, rolls back
 *   npm run align:backend-names -- --apply makes the changes
 *
 * Safe to re-run: a name that already matches is left alone. Every change is audited as made by ACTOR.
 * Names that would clash (two fields, dropdowns or options ending up with the same name) are never numbered or
 * guessed: they are listed for an admin to rename one of them in the UI, and left as they are.
 */

const ACTOR = 'system:align-backend-names';
const apply = process.argv.includes('--apply');

class DryRun extends Error {}

interface Report {
    lines: string[];
    /** Names that clash: left unchanged until an admin renames one of them. */
    clashes: string[];
    modules: Set<CrmModuleKey>;
}

/** The clash message of a name the API refuses (HttpError 409), or null for any other error. */
const clashOf = (err: unknown) => (err instanceof HttpError && err.statusCode === 409 ? err.message : null);

const meta = (m: Record<string, string | undefined>) => ({ _meta: { module: 'shared', ...m, actorRole: 'System' } });

/** Options whose stored value differs from their label. Renamed in two passes so swapped names never collide. */
async function alignOptions(tx: TransactionClient, report: Report): Promise<void> {
    const categories = await tx.dropdownCategory.findMany({ where: { deletedAt: null }, include: { options: true } });
    for (const category of categories) {
        const mismatched = category.options.filter((o) => o.value !== o.label);
        if (mismatched.length === 0) continue;

        // System options: the code relies on the value, so the label (what admins see) takes it.
        for (const option of mismatched.filter((o) => o.isSystem)) {
            await tx.dropdownOption.update({ where: { id: option.id }, data: { label: option.value } });
            await auditService.record(tx, {
                entityType: 'DropdownOption',
                entityId: option.id,
                action: 'UPDATE',
                changedBy: ACTOR,
                changes: { label: { from: option.label, to: option.value }, ...meta({ module: category.module, categoryKey: category.key, categoryLabel: category.label, optionLabel: option.value }) },
            });
            report.lines.push(`option  ${category.key}: label '${option.label}' → '${option.value}' (system option: value kept)`);
        }

        const renamed = mismatched.filter((o) => !o.isSystem);
        if (renamed.length === 0) continue;
        // Values are unique per dropdown ignoring case: the target names must be too.
        const finalNames = category.options.map((o) => (o.isSystem ? o.value : o.label).toLowerCase());
        const duplicates = finalNames.filter((n, i) => finalNames.indexOf(n) !== i);
        if (duplicates.length > 0) {
            const names = [...new Set(duplicates)].map((d) => `"${d}"`).join(', ');
            report.clashes.push(`dropdown "${category.label}": more than one option is named ${names}`);
            continue;
        }

        // Pass 1: park every renamed option on a temporary value, so a value another option is about to take is free.
        for (const [index, option] of renamed.entries()) {
            await changeOptionValue(tx, option, `__align_${index}`);
        }
        // Pass 2: each takes its label.
        for (const option of renamed) {
            const parked = await tx.dropdownOption.findUniqueOrThrow({ where: { id: option.id } });
            const note = (await changeOptionValue(tx, parked, option.label))?.note;
            await auditService.record(tx, {
                entityType: 'DropdownOption',
                entityId: option.id,
                action: 'UPDATE',
                changedBy: ACTOR,
                changes: {
                    value: { from: option.value, to: option.label },
                    ...(note ? { reason: note } : {}),
                    ...meta({ module: category.module, categoryKey: category.key, categoryLabel: category.label, optionLabel: option.label }),
                },
            });
            report.lines.push(`option  ${category.key}: value '${option.value}' → '${option.label}'  ${note ?? ''}`.trimEnd());
        }
        const linked = await tx.formFieldDefinition.findMany({ where: { dropdownCategoryId: category.id }, select: { module: true } });
        for (const { module } of linked) if ((CRM_MODULES as readonly string[]).includes(module)) report.modules.add(module as CrmModuleKey);
    }
}

/** How long to wait for Redis before giving up on dropping the caches. */
const REDIS_WAIT_MS = 5_000;

/**
 * Drops the caches the renames made stale (form configs, and the lookups, search results and dashboards of the
 * modules whose records changed), so running API processes stop serving the old names. The shared Redis client
 * connects lazily (only the API, the worker and the seed connect it), so connect it first; otherwise every
 * invalidation would be skipped as "Redis not ready". Returns false when Redis could not be reached.
 */
async function dropCaches(modules: Set<CrmModuleKey>): Promise<boolean> {
    connectRedis();
    for (let waited = 0; !isRedisReady() && waited < REDIS_WAIT_MS; waited += 100) await new Promise((r) => setTimeout(r, 100));
    if (!isRedisReady()) return false;
    await invalidateFormConfigCaches();
    for (const module of modules) await cacheService.invalidateEntityCaches(module);
    return true;
}

/** Builder-added dropdowns whose key isn't their name in snake_case. */
async function alignCategoryKeys(tx: TransactionClient, report: Report): Promise<void> {
    const categories = await tx.dropdownCategory.findMany({ where: { deletedAt: null, isSystem: false } });
    for (const category of categories) {
        let key: string;
        try {
            key = await categoryKeyForLabel(tx, category, category.label);
        } catch (err) {
            const clash = clashOf(err);
            if (!clash) throw err;
            report.clashes.push(`dropdown: ${clash}`);
            continue;
        }
        if (key === category.key) continue;
        await tx.dropdownCategory.update({ where: { id: category.id }, data: { key } });
        await auditService.record(tx, {
            entityType: 'DropdownCategory',
            entityId: category.id,
            action: 'UPDATE',
            changedBy: ACTOR,
            changes: { key: { from: category.key, to: key }, ...meta({ module: category.module, categoryKey: key, categoryLabel: category.label }) },
        });
        report.lines.push(`dropdown '${category.label}': key ${category.key} → ${key}`);
    }
}

/** Builder-added fields whose key isn't their label in snake_case. */
async function alignCustomFieldKeys(tx: TransactionClient, report: Report): Promise<void> {
    const fields = await tx.formFieldDefinition.findMany({ where: { isSystem: false }, orderBy: { createdAt: 'asc' } });
    for (const field of fields) {
        const module = field.module as CrmModuleKey;
        if (!(CRM_MODULES as readonly string[]).includes(module)) continue;
        await lockModuleFields(tx, module);
        let key: string;
        try {
            key = await customFieldKey(tx, module, field.label, field);
        } catch (err) {
            const clash = clashOf(err);
            if (!clash) throw err;
            report.clashes.push(`field (${module}): ${clash}`);
            continue;
        }
        if (key === field.fieldKey) continue;
        const note = describeMigration(await migrateFieldKey(tx, module, field.fieldKey, key));
        await tx.formFieldDefinition.update({ where: { id: field.id }, data: { fieldKey: key } });
        await auditService.record(tx, {
            entityType: 'FormField',
            entityId: field.id,
            action: 'UPDATE',
            changedBy: ACTOR,
            changes: { fieldKey: { from: field.fieldKey, to: key }, reason: note, ...meta({ module, fieldKey: key, fieldLabel: field.label }) },
        });
        report.lines.push(`field   ${module} '${field.label}': key ${field.fieldKey} → ${key}  ${note}`);
        report.modules.add(module);
    }
}

async function main(): Promise<void> {
    const report: Report = { lines: [], clashes: [], modules: new Set() };
    try {
        await prisma.$transaction(
            async (tx) => {
                await alignOptions(tx, report);
                await alignCategoryKeys(tx, report);
                await alignCustomFieldKeys(tx, report);
                if (!apply) throw new DryRun();
            },
            { timeout: 10 * 60_000, maxWait: 30_000 },
        );
    } catch (err) {
        if (!(err instanceof DryRun)) throw err;
    }

    console.log(
        report.lines.length > 0
            ? report.lines.join('\n')
            : report.clashes.length > 0
              ? 'Nothing to rename apart from the clashes below.'
              : 'Every backend name already matches its UI name.',
    );
    if (report.clashes.length > 0) {
        const list = report.clashes.map((c) => `  - ${c}`).join('\n');
        console.log(`\nClashes (left unchanged; rename one of each in the UI, then run this again):\n${list}`);
        process.exitCode = 2;
    }
    if (!apply) {
        if (report.lines.length > 0) console.log(`\nDry run: nothing was saved. Re-run with --apply to make these ${report.lines.length} change(s).`);
        return;
    }
    if (report.lines.length > 0) {
        console.log(`\nApplied ${report.lines.length} change(s).`);
        if (!(await dropCaches(report.modules))) {
            console.warn(
                'Redis could not be reached, so cached form configs, lookups and search results were not dropped: restart the API ' +
                    '(or wait up to an hour for the cached form configs to expire) so it stops showing the old names.',
            );
        }
    }
}

main()
    .catch((err: unknown) => {
        console.error(err instanceof Error ? err.message : err);
        process.exitCode = 1;
    })
    .finally(async () => {
        // disconnect(), not quit(): with Redis unreachable the client is mid-reconnect, quit() never settles, and its
        // retry timers would keep the process alive (as in prisma/seed.ts).
        redis.disconnect();
        await prisma.$disconnect();
    });
