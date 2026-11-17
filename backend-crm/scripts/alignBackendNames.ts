import { prisma, type TransactionClient } from '../src/config/prisma.js';
import { auditService } from '../src/services/audit.service.js';
import { CACHE_KEYS, cacheService, type CachedEntity } from '../src/services/cache.service.js';
import { lockModuleFields, describeMigration, migrateFieldKey } from '../src/modules/form-configs/fieldKeyRename.js';
import { CRM_MODULES, type CrmModuleKey } from '../src/modules/form-configs/formConfig.defaults.js';
import { categoryKeyForLabel, changeOptionValue, customFieldKey } from '../src/modules/form-configs/formConfig.service.js';

/**
 * One-off clean-up: makes every backend name match the name shown in the UI, as the app now keeps them.
 *
 *  - dropdown options:          stored value := label (records, saved filters and field defaults follow);
 *                               a system option (whose value the code relies on) gets its label set to its value
 *  - admin-created dropdowns:   key := custom_<name>
 *  - custom fields:             key := cf_<label> (record values, saved filters and PDF template paths follow)
 *
 * Built-in fields and dropdowns keep the column / key the code is written against.
 *
 *   npm run align:backend-names            dry run: makes every change in a transaction, reports, rolls back
 *   npm run align:backend-names -- --apply makes the changes
 *
 * Safe to re-run: a name that already matches is left alone. Every change is audited as made by ACTOR.
 */

const ACTOR = 'system:align-backend-names';
const apply = process.argv.includes('--apply');

class DryRun extends Error {}

interface Report {
    lines: string[];
    modules: Set<CrmModuleKey>;
}

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
            throw new Error(`${category.key}: options would share the name(s) ${[...new Set(duplicates)].join(', ')}; rename them in the UI first.`);
        }

        // Pass 1: park every renamed option on a temporary value, so a value another option is about to take is free.
        for (const [index, option] of renamed.entries()) {
            await changeOptionValue(tx, option, `__align_${index}`);
        }
        // Pass 2: each takes its label.
        for (const option of renamed) {
            const parked = await tx.dropdownOption.findUniqueOrThrow({ where: { id: option.id } });
            const note = await changeOptionValue(tx, parked, option.label);
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

/** Admin-created dropdowns whose key isn't custom_<name>. */
async function alignCategoryKeys(tx: TransactionClient, report: Report): Promise<void> {
    const categories = await tx.dropdownCategory.findMany({ where: { deletedAt: null, isSystem: false } });
    for (const category of categories) {
        const key = await categoryKeyForLabel(tx, category, category.label);
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

/** Custom fields whose key isn't cf_<label>. */
async function alignCustomFieldKeys(tx: TransactionClient, report: Report): Promise<void> {
    const fields = await tx.formFieldDefinition.findMany({ where: { isSystem: false }, orderBy: { createdAt: 'asc' } });
    for (const field of fields) {
        const module = field.module as CrmModuleKey;
        if (!(CRM_MODULES as readonly string[]).includes(module)) continue;
        await lockModuleFields(tx, module);
        const key = await customFieldKey(tx, module, field.label, field);
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
    const report: Report = { lines: [], modules: new Set() };
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

    console.log(report.lines.length > 0 ? report.lines.join('\n') : 'Every backend name already matches its UI name.');
    if (!apply) {
        if (report.lines.length > 0) console.log(`\nDry run: nothing was saved. Re-run with --apply to make these ${report.lines.length} change(s).`);
        return;
    }
    if (report.lines.length > 0) {
        await cacheService.invalidatePattern(`${CACHE_KEYS.lookups('form-configs')}*`);
        for (const module of report.modules) await cacheService.invalidateEntityCaches(module as CachedEntity);
        console.log(`\nApplied ${report.lines.length} change(s).`);
    }
}

main()
    .catch((err: unknown) => {
        console.error(err instanceof Error ? err.message : err);
        process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
