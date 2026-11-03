import { z } from 'zod';
import { prisma } from '../../config/prisma.js';
import { CATEGORY_MODULES } from '../form-configs/formConfig.defaults.js';
import type { FormConfigAuditMeta } from '../form-configs/formConfig.service.js';
import { displayTime, displayValue, fieldLabel, isDiff, parseChanges, type AuditEntryDto, type AuditRevisionItem } from './audit.format.js';

/**
 * Form Customization audit trail (GET /api/audit-logs/form-configs/:scope) — who changed which dropdown, option,
 * field or section, when, and with which role. `scope` is a module key, `shared`, or `all`.
 *
 * Entries written since `_meta` was added carry their module / labels / actor role (see `withMeta` in
 * formConfig.service.ts); older ones are resolved from the current rows where those still exist.
 */

/** Route segments that select this trail (any case). */
const ROUTE_NAMES = new Set(['form-configs', 'form-config', 'formconfigs', 'formconfig', 'form-customization']);
const FORM_CONFIG_ENTITY_TYPES = ['DropdownCategory', 'DropdownOption', 'FormField'] as const;
const SCOPES = ['all', ...CATEGORY_MODULES] as const;
type Scope = (typeof SCOPES)[number];

/** Module-scoped trails are filtered in memory; this caps how many rows are scanned for them. */
const MAX_SCANNED_ROWS = 2000;

export function isFormConfigsEntityType(params: unknown): boolean {
    const entityType = (params as { entityType?: unknown } | null)?.entityType;
    return typeof entityType === 'string' && ROUTE_NAMES.has(entityType.trim().toLowerCase());
}

const scopeParamsSchema = z.object({
    entityId: z
        .string()
        .trim()
        .toLowerCase()
        .refine((value): value is Scope => (SCOPES as readonly string[]).includes(value), {
            message: `entityId must be one of: ${SCOPES.join(', ')}.`,
        }),
});

type AuditContext = Partial<FormConfigAuditMeta>;
type Changes = Record<string, unknown>;

interface ParsedRow {
    id: string;
    entityType: string;
    entityId: string;
    action: string;
    changedBy: string;
    createdAt: Date;
    changes: Changes;
    rawChanges: unknown;
}

const str = (value: unknown): string | undefined => (typeof value === 'string' && value.trim() ? value : undefined);

const MODULE_LABELS: Record<string, string> = Object.fromEntries(
    CATEGORY_MODULES.map((key) => [
        key,
        key
            .split('-')
            .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' '),
    ]),
);
const moduleLabel = (module: string | undefined) => (module ? (MODULE_LABELS[module] ?? module) : 'an unknown form');

/** Admin-facing names of form field / dropdown properties. */
const PROP_LABELS: Record<string, string> = {
    isRequired: 'Required',
    isVisibleInForm: 'Visible on Form',
    isVisibleInDrawer: 'Visible in Drawer',
    isActive: 'Status',
    isCoreLocked: 'Core Lock',
    validationRulesJson: 'Validation Rules',
    metaJson: 'Option Settings',
    dropdown: 'Linked Dropdown',
    dropdownCategoryId: 'Linked Dropdown',
    tabKey: 'Tab',
    tabLabel: 'Tab Name',
    sectionKey: 'Section',
    sectionLabel: 'Section Name',
    fieldSize: 'Field Size',
    fieldType: 'Field Type',
    defaultValue: 'Default Value',
    sortOrder: 'Position',
    deletedAt: 'Deleted',
};
const propLabel = (prop: string) => PROP_LABELS[prop] ?? fieldLabel(prop);

function propValue(prop: string, value: unknown): string {
    if (prop === 'isActive' && typeof value === 'boolean') return value ? 'Active' : 'Inactive';
    if (prop === 'module' && typeof value === 'string') return moduleLabel(value);
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    return displayValue(value);
}

const diffsOf = (changes: Changes) =>
    Object.entries(changes).filter((entry): entry is [string, { from: unknown; to: unknown }] => isDiff(entry[1]));

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;

function readMeta(changes: Changes): AuditContext | null {
    const meta = changes._meta;
    if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return null;
    const m = meta as Record<string, unknown>;
    return {
        module: str(m.module),
        categoryKey: str(m.categoryKey),
        categoryLabel: str(m.categoryLabel),
        fieldKey: str(m.fieldKey),
        fieldLabel: str(m.fieldLabel),
        optionLabel: str(m.optionLabel),
        sectionKey: str(m.sectionKey),
        actorRole: str(m.actorRole),
    };
}

/** `leads:company_info` (section rename) / `leads` (reorder, reset) → the module part, when it is a known one. */
function moduleFromEntityId(entityId: string): string | undefined {
    const head = entityId.split(':')[0];
    return MODULE_LABELS[head] ? head : undefined;
}

/** Context for entries written before `_meta` existed, looked up from the rows that still exist. */
async function resolveLegacyContexts(rows: ParsedRow[]): Promise<Map<string, AuditContext>> {
    const legacy = rows.filter((row) => !readMeta(row.changes));
    const categoryIds = new Set<string>();
    const categoryKeys = new Set<string>();
    const optionIds = new Set<string>();
    const fieldIds = new Set<string>();
    for (const row of legacy) {
        if (row.entityType === 'DropdownCategory') categoryIds.add(row.entityId);
        if (row.entityType === 'DropdownOption') {
            optionIds.add(row.entityId);
            const categoryId = str(row.changes.categoryId);
            const categoryKey = str(row.changes.category);
            if (categoryId) categoryIds.add(categoryId);
            if (categoryKey) categoryKeys.add(categoryKey);
        }
        if (row.entityType === 'FormField' && !moduleFromEntityId(row.entityId)) fieldIds.add(row.entityId);
    }

    const options = optionIds.size
        ? await prisma.dropdownOption.findMany({ where: { id: { in: [...optionIds] } }, select: { id: true, categoryId: true, label: true } })
        : [];
    for (const option of options) categoryIds.add(option.categoryId);
    const categories =
        categoryIds.size || categoryKeys.size
            ? await prisma.dropdownCategory.findMany({
                  where: { OR: [{ id: { in: [...categoryIds] } }, { key: { in: [...categoryKeys] } }] },
                  select: { id: true, key: true, label: true, module: true },
              })
            : [];
    const fields = fieldIds.size
        ? await prisma.formFieldDefinition.findMany({ where: { id: { in: [...fieldIds] } }, select: { id: true, module: true, fieldKey: true, label: true } })
        : [];

    const categoryById = new Map(categories.map((c) => [c.id, c]));
    const categoryByKey = new Map(categories.map((c) => [c.key, c]));
    const optionById = new Map(options.map((o) => [o.id, o]));
    const fieldById = new Map(fields.map((f) => [f.id, f]));

    const contexts = new Map<string, AuditContext>();
    for (const row of legacy) {
        const c = row.changes;
        if (row.entityType === 'DropdownCategory') {
            const category = categoryById.get(row.entityId);
            contexts.set(row.id, {
                module: str(c.module) ?? category?.module,
                categoryKey: str(c.key) ?? category?.key,
                categoryLabel: str(c.label) ?? category?.label,
            });
        } else if (row.entityType === 'DropdownOption') {
            const option = optionById.get(row.entityId);
            const categoryId = str(c.categoryId) ?? option?.categoryId;
            const categoryKey = str(c.category);
            const category = (categoryId && categoryById.get(categoryId)) || (categoryKey && categoryByKey.get(categoryKey)) || undefined;
            contexts.set(row.id, {
                module: category?.module,
                categoryKey: category?.key ?? categoryKey,
                categoryLabel: category?.label ?? categoryKey,
                optionLabel: str(c.label) ?? option?.label,
            });
        } else {
            const module = moduleFromEntityId(row.entityId);
            const field = module ? undefined : fieldById.get(row.entityId);
            contexts.set(row.id, {
                module: module ?? str(c.module) ?? field?.module,
                fieldKey: str(c.fieldKey) ?? field?.fieldKey,
                fieldLabel: str(c.label) ?? field?.label,
                sectionKey: module && row.entityId.includes(':') ? row.entityId.slice(row.entityId.indexOf(':') + 1) : undefined,
            });
        }
    }
    return contexts;
}

/** A module's trail also shows changes to `shared` dropdowns, which every module's forms use. */
function inScope(row: ParsedRow, ctx: AuditContext, scope: Scope): boolean {
    if (scope === 'all') return true;
    if (row.entityId === scope || row.entityId.startsWith(`${scope}:`)) return true;
    const modules = new Set<string>();
    if (ctx.module) modules.add(ctx.module);
    const moduleChange = row.changes.module;
    if (typeof moduleChange === 'string') modules.add(moduleChange);
    if (isDiff(moduleChange)) {
        if (typeof moduleChange.from === 'string') modules.add(moduleChange.from);
        if (typeof moduleChange.to === 'string') modules.add(moduleChange.to);
    }
    return modules.has(scope) || modules.has('shared');
}

type Base = Pick<AuditRevisionItem, 'author' | 'time'>;

function categoryRevisions(row: ParsedRow, ctx: AuditContext, base: Base): AuditRevisionItem[] {
    const c = row.changes;
    const label = ctx.categoryLabel ?? ctx.categoryKey ?? 'Unnamed';
    const note = str(c.reason);
    switch (row.action) {
        case 'CREATE': {
            const options = Array.isArray(c.options) ? c.options : [];
            return [{ ...base, tag: 'Created', title: `Dropdown "${label}" created (${moduleLabel(ctx.module)})`, to: options.length ? displayValue(options) : undefined }];
        }
        case 'DELETE': {
            const removed = Array.isArray(c.removedFields) ? c.removedFields.length : 0;
            const hidden = Array.isArray(c.hiddenFields) ? c.hiddenFields.length : 0;
            const impact = [removed ? `${plural(removed, 'custom field')} removed` : '', hidden ? `${plural(hidden, 'built-in field')} unlinked and hidden` : '']
                .filter(Boolean)
                .join(', ');
            return [{ ...base, tag: 'Deleted', title: `Dropdown "${label}" deleted (${moduleLabel(ctx.module)})`, note: note ?? (impact || undefined) }];
        }
        default: {
            if (typeof c.reordered === 'number') {
                return [{ ...base, tag: 'Reordered', title: `Dropdown "${label}" options reordered`, note: plural(c.reordered, 'option') }];
            }
            const items = diffsOf(c).map(([prop, diff]) => ({
                ...base,
                tag: 'Updated',
                title: `Dropdown "${label}" — ${propLabel(prop)} updated`,
                from: propValue(prop, diff.from),
                to: propValue(prop, diff.to),
                note,
            }));
            return items.length ? items : [{ ...base, tag: 'Updated', title: `Dropdown "${label}" updated`, note }];
        }
    }
}

function optionRevisions(row: ParsedRow, ctx: AuditContext, base: Base): AuditRevisionItem[] {
    const c = row.changes;
    const label = ctx.optionLabel ?? str(c.value) ?? 'Unnamed';
    const where = ctx.categoryLabel ? ` "${ctx.categoryLabel}"` : ' a dropdown';
    if (row.action === 'CREATE' || (row.action === 'STATUS_CHANGE' && c.restored === true)) {
        const restored = c.restored === true;
        return [{ ...base, tag: restored ? 'Restored' : 'Created', title: `Option "${label}" ${restored ? 'restored' : 'added'} in${where}`, to: str(c.value) }];
    }
    if (row.action === 'DELETE') {
        return [{ ...base, tag: 'Deleted', title: `Option "${label}" deleted from${where}`, from: str(c.value) }];
    }
    const items = diffsOf(c).map(([prop, diff]): AuditRevisionItem => {
        if (prop === 'isActive') {
            const active = diff.to === true;
            return {
                ...base,
                tag: active ? 'Restored' : 'Archived',
                title: `Option "${label}" ${active ? 'restored' : 'archived'} in${where}`,
                from: active ? 'Archived' : 'Active',
                to: active ? 'Active' : 'Archived',
            };
        }
        if (prop === 'label' || prop === 'value') {
            return { ...base, tag: 'Updated', title: `Option updated in${where}`, from: propValue(prop, diff.from), to: propValue(prop, diff.to), note: `${propLabel(prop)} changed` };
        }
        return { ...base, tag: 'Updated', title: `Option "${label}" — ${propLabel(prop)} updated in${where}`, from: propValue(prop, diff.from), to: propValue(prop, diff.to) };
    });
    return items.length ? items : [{ ...base, tag: 'Updated', title: `Option "${label}" updated in${where}` }];
}

function fieldRevisions(row: ParsedRow, ctx: AuditContext, base: Base): AuditRevisionItem[] {
    const c = row.changes;
    const module = moduleLabel(ctx.module);
    const label = ctx.fieldLabel ?? ctx.fieldKey ?? 'Unnamed';
    const note = str(c.reason);
    switch (row.action) {
        case 'CREATE':
            return [{ ...base, tag: 'Created', title: `Custom field "${label}" (${str(c.fieldType) ?? 'field'}) added to ${module}`, to: ctx.fieldKey ?? str(c.fieldKey) }];
        case 'DELETE':
            return [{ ...base, tag: 'Deleted', title: `Custom field "${label}" deleted from ${module}`, from: ctx.fieldKey ?? str(c.fieldKey), note }];
        default: {
            if (typeof c.reordered === 'number') {
                return [{ ...base, tag: 'Reordered', title: `Fields reordered on ${module}`, note: plural(c.reordered, 'field') }];
            }
            if (c.reset === true) {
                return [{ ...base, tag: 'Reset', title: `Built-in fields reset to defaults on ${module}` }];
            }
            if (row.entityId.includes(':') && typeof c.sectionLabel === 'string') {
                return [{ ...base, tag: 'Updated', title: `Section renamed on ${module}`, to: c.sectionLabel }];
            }
            const items = diffsOf(c).map(([prop, diff]) => ({
                ...base,
                tag: 'Updated',
                title: `Field "${label}" (${module}) — ${propLabel(prop)} updated`,
                from: propValue(prop, diff.from),
                to: propValue(prop, diff.to),
                note,
            }));
            return items.length ? items : [{ ...base, tag: 'Updated', title: `Field "${label}" (${module}) updated`, note }];
        }
    }
}

function toRevisions(row: ParsedRow, ctx: AuditContext, author: string): AuditRevisionItem[] {
    const base: Base = { author, time: displayTime(row.createdAt) };
    if (row.entityType === 'DropdownCategory') return categoryRevisions(row, ctx, base);
    if (row.entityType === 'DropdownOption') return optionRevisions(row, ctx, base);
    return fieldRevisions(row, ctx, base);
}

export const formConfigAuditService = {
    async forScope(params: unknown, limit: number) {
        const { entityId: scope } = scopeParamsSchema.parse(params);

        const rows = await prisma.auditLog.findMany({
            where: { entityType: { in: [...FORM_CONFIG_ENTITY_TYPES] } },
            orderBy: { createdAt: 'desc' },
            take: scope === 'all' ? limit : Math.min(limit * 10, MAX_SCANNED_ROWS),
        });
        const parsed: ParsedRow[] = rows.map((row) => {
            const rawChanges = parseChanges(row.changesJson);
            const changes = rawChanges && typeof rawChanges === 'object' && !Array.isArray(rawChanges) ? (rawChanges as Changes) : {};
            return { ...row, changes, rawChanges };
        });

        const legacy = await resolveLegacyContexts(parsed);
        const contextOf = (row: ParsedRow): AuditContext => readMeta(row.changes) ?? legacy.get(row.id) ?? {};
        const scoped = parsed.filter((row) => inScope(row, contextOf(row), scope)).slice(0, limit);

        // Role at the time of the change when recorded, else the admin's current role.
        const needRoles = [...new Set(scoped.filter((row) => !contextOf(row).actorRole).map((row) => row.changedBy))];
        const users = needRoles.length
            ? await prisma.user.findMany({ where: { username: { in: needRoles } }, select: { username: true, role: true } })
            : [];
        const roles = new Map(users.map((u) => [u.username, u.role]));
        const authorOf = (row: ParsedRow) => {
            const role = contextOf(row).actorRole ?? roles.get(row.changedBy);
            return role ? `${row.changedBy} (${role})` : row.changedBy;
        };

        const entries: AuditEntryDto[] = scoped.map((row) => ({
            id: row.id,
            action: row.action,
            changedBy: row.changedBy,
            createdAt: row.createdAt.toISOString(),
            changes: row.rawChanges,
        }));

        return {
            entityType: 'form-configs',
            entityId: scope,
            entries,
            revisions: scoped.flatMap((row) => toRevisions(row, contextOf(row), authorOf(row))),
        };
    },
};
