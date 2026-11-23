import { displayTime, parseChanges } from './audit.format.js';

/**
 * How the admin Audit Log shows an entry: the list row (with a one-line summary) and the detail's labelled
 * Field / Before / After table. Pure functions (unit tested in auditAdmin.present.test.ts); field labels come in
 * through a `FieldLabeler` the service builds from the form configuration, so custom fields show their own names.
 */

/** The `AuditLog` columns these functions read (the Prisma model satisfies it). */
export interface AuditRowLike {
    id: bigint;
    createdAt: Date;
    category: string;
    action: string;
    severity: string;
    module: string;
    entityType: string;
    entityId: string;
    entityCode: string | null;
    entityLabel: string | null;
    changedFields: string | null;
    changesJson: string | null;
    changedBy: string;
    actorId: number | null;
    actorRole: string | null;
    source: string | null;
    requestId: string | null;
    sessionId: string | null;
    httpMethod: string | null;
    route: string | null;
    page: string | null;
    ipAddress: string | null;
    userAgent: string | null;
    revertsId: bigint | null;
}

/** Field names and values as an admin reads them, per module (form labels, custom fields included). */
export interface FieldLabeler {
    label(module: string, key: string): string;
    value(module: string, key: string, value: unknown): string;
}

/** `live` / `deleted` (soft-deleted) / `missing` for CRM records; null for everything else (sign-ins, settings). */
export type RecordStatus = 'live' | 'deleted' | 'missing' | null;

export interface PresentContext {
    labeler: FieldLabeler;
    /** Record numbers are shown only for modules with a document series (Settings › Document Series). */
    showsRecordNumber(module: string): boolean;
    recordStatus(entityType: string, entityId: string): RecordStatus;
}

export interface AuditListItem {
    /** BIGINT as a string. Also the paging cursor. */
    id: string;
    createdAt: string;
    /** `12-Oct-2026, 11:15 AM` in the business timezone. */
    time: string;
    category: string;
    action: string;
    actionLabel: string;
    severity: string;
    module: string;
    moduleLabel: string;
    entityType: string;
    entityId: string;
    /** Record number at the time; null unless the module has a document series. */
    entityCode: string | null;
    /** Record name at the time. */
    entityLabel: string | null;
    recordStatus: RecordStatus;
    summary: string;
    /** Keys of the fields an update changed (custom fields as `customFields.<key>`). */
    changedFields: string[];
    changedBy: string;
    actorId: number | null;
    actorRole: string | null;
    source: string | null;
    ipAddress: string | null;
    requestId: string | null;
    /** Screen the change was made from. */
    page: string | null;
    revertsId: string | null;
}

export interface AuditEntryDetail extends AuditListItem {
    sessionId: string | null;
    httpMethod: string | null;
    route: string | null;
    userAgent: string | null;
}

/** One line of the Field / Before / After table. `before` is null for a create, `after` null for a delete. */
export interface AuditFieldRow {
    key: string;
    label: string;
    before: string | null;
    after: string | null;
}

/** Everything else the entry recorded (sign-in IP, refused path, import counts, update reason …). */
export interface AuditDetailRow {
    key: string;
    label: string;
    value: string;
}

// ── Names ────────────────────────────────────────────────────────────────────

/** `salesStage` / `po_number` → `Sales Stage` / `Po Number` (fields without a form label). */
export const humanize = (key: string): string =>
    key
        .replace(/_/g, ' ')
        .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/(^|\s)\S/g, (c) => c.toUpperCase());

const ACTION_LABELS: Record<string, string> = {
    CREATE: 'Created',
    UPDATE: 'Updated',
    DELETE: 'Deleted',
    RESTORE: 'Restored',
    REVERT: 'Undone',
    STATUS_CHANGE: 'Status changed',
    CONVERT: 'Converted',
    FOLLOW_UP: 'Follow-up',
    IMPORT: 'Imported',
    LOGIN: 'Signed in',
    LOGIN_FAILED: 'Failed sign-in',
    LOGOUT: 'Signed out',
    ACCESS_DENIED: 'Access refused',
    SET_DEFAULT: 'Set as default',
    DUPLICATE: 'Duplicated',
    PDF_GENERATED: 'PDF generated',
};
export const actionLabel = (action: string) => ACTION_LABELS[action] ?? humanize(action.toLowerCase());

const MODULE_LABELS: Record<string, string> = {
    'pdf-templates': 'PDF Templates',
    'form-customization': 'Form Customization',
    'document-series': 'Document Series',
};
/** `partner-companies` → `Partner Companies`. */
export const moduleLabel = (key: string) => MODULE_LABELS[key] ?? humanize(key.replace(/-/g, ' '));

export const CATEGORY_LABELS: Record<string, string> = { DATA: 'Data', CONFIG: 'Configuration', SECURITY: 'Security' };
export const SEVERITY_LABELS: Record<string, string> = { INFO: 'Info', NOTICE: 'Notice', WARNING: 'Warning', CRITICAL: 'Critical' };
export const SOURCE_LABELS: Record<string, string> = { UI: 'Web app', API: 'API', IMPORT: 'Import', JOB: 'Background job' };

/** Keys that aren't form fields but show up in entries. */
export const COMMON_LABELS: Record<string, string> = {
    isDeleted: 'Deleted',
    reason: 'Reason',
    ip: 'IP Address',
    method: 'Method',
    path: 'Path',
    message: 'Message',
    entity: 'Module',
    fileName: 'File',
    total: 'Rows',
    created: 'Created',
    failed: 'Failed',
    templateId: 'Template Id',
    templateName: 'Template',
    templateVersion: 'Template Version',
    bytes: 'Size (bytes)',
    cached: 'From Cache',
    followUp: 'Follow-up',
    reordered: 'Reordered',
    reset: 'Reset to Defaults',
};

// ── Values ───────────────────────────────────────────────────────────────────

const MAX_CELL = 1000;
const clip = (value: string) => (value.length > MAX_CELL ? `${value.slice(0, MAX_CELL - 1)}…` : value);

const asObject = (value: unknown): Record<string, unknown> | undefined =>
    value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;

/**
 * A stored `{ from, to }` pair. JSON drops an `undefined` side, so a value that was added (or removed) is stored as
 * `{ to }` (or `{ from }`): any object holding only these keys is one.
 */
export function isDiff(value: unknown): value is { from?: unknown; to?: unknown } {
    const object = asObject(value);
    if (!object) return false;
    const keys = Object.keys(object);
    return keys.length > 0 && keys.length <= 2 && keys.every((key) => key === 'from' || key === 'to');
}

/** An item of a list value (email list, line items) by its name-like key. */
function itemText(item: unknown): string {
    const object = asObject(item);
    if (!object) return String(item);
    const named = ['email', 'name', 'label', 'value', 'productName', 'title'].map((key) => object[key]).find((v) => typeof v === 'string' && v);
    return typeof named === 'string' ? named : JSON.stringify(item);
}

/** A stored value as text: `—` for empty, Yes / No, lists joined, `{ from, to }` as `A → B`. */
export function cellValue(value: unknown): string {
    if (value === null || value === undefined || value === '') return '—';
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    if (Array.isArray(value)) return value.length === 0 ? '—' : clip(value.map((item) => (item !== null && typeof item === 'object' ? itemText(item) : String(item))).join(', '));
    if (typeof value === 'object') {
        if (isDiff(value)) return `${cellValue(value.from)} → ${cellValue(value.to)}`;
        return Object.keys(value).length === 0 ? '—' : clip(JSON.stringify(value));
    }
    return clip(String(value));
}

const isEmpty = (value: unknown) =>
    value === null ||
    value === undefined ||
    value === '' ||
    (Array.isArray(value) && value.length === 0) ||
    (asObject(value) !== undefined && Object.keys(value as object).length === 0);

// ── Changes ──────────────────────────────────────────────────────────────────

/** Actions whose changes are a `{ field: { from, to } }` diff (auditCatalog DIFF_ACTIONS). */
const DIFF_ACTIONS = new Set(['UPDATE', 'STATUS_CHANGE', 'FOLLOW_UP', 'CONVERT', 'REVERT']);
/** Actions whose changes are a snapshot of the record: after a create, before a delete. */
const SNAPSHOT_AFTER = new Set(['CREATE', 'DUPLICATE', 'RESTORE']);
const SNAPSHOT_BEFORE = new Set(['DELETE']);
/** Keys describing the entry, not a field (`_meta` labels are already in the entry's columns). */
const META_KEYS = new Set(['_meta']);
/** Snapshot keys that only repeat the entry's own columns or change on every write. */
const SNAPSHOT_SKIP = new Set(['id', 'createdAt', 'updatedAt', 'createdBy', 'updatedBy', 'isDeleted', 'deletedAt', 'isRecentlyViewed', 'isMyAccount']);
const CUSTOM = 'customFields';

export interface DiffEntry {
    key: string;
    from: unknown;
    to: unknown;
}

/** The field diffs of an entry; a `customFields` diff becomes one entry per custom field that changed. */
export function expandDiff(changes: unknown): DiffEntry[] {
    const object = asObject(changes);
    if (!object) return [];
    const out: DiffEntry[] = [];
    for (const [key, value] of Object.entries(object)) {
        if (META_KEYS.has(key) || !isDiff(value)) continue;
        const from = asObject(value.from);
        const to = asObject(value.to);
        if (key === CUSTOM && (from || to || value.from === null || value.to === null)) {
            const before = from ?? {};
            const after = to ?? {};
            for (const field of new Set([...Object.keys(before), ...Object.keys(after)])) {
                if (JSON.stringify(before[field]) !== JSON.stringify(after[field])) out.push({ key: `${CUSTOM}.${field}`, from: before[field], to: after[field] });
            }
            continue;
        }
        out.push({ key, from: value.from, to: value.to });
    }
    return out;
}

/** Non-empty fields of a record snapshot (custom fields one by one). */
export function snapshotEntries(changes: unknown): { key: string; value: unknown }[] {
    const object = asObject(changes);
    if (!object) return [];
    const out: { key: string; value: unknown }[] = [];
    for (const [key, value] of Object.entries(object)) {
        if (META_KEYS.has(key) || SNAPSHOT_SKIP.has(key) || isEmpty(value)) continue;
        const custom = key === CUSTOM ? asObject(value) : undefined;
        if (custom) {
            for (const [field, fieldValue] of Object.entries(custom)) if (!isEmpty(fieldValue)) out.push({ key: `${CUSTOM}.${field}`, value: fieldValue });
            continue;
        }
        out.push({ key, value });
    }
    return out;
}

/** The labelled Field / Before / After table of an entry (empty for sign-ins, imports and other events). */
export function fieldRows(action: string, module: string, changes: unknown, labeler: FieldLabeler): AuditFieldRow[] {
    if (DIFF_ACTIONS.has(action)) {
        return expandDiff(changes).map(({ key, from, to }) => ({
            key,
            label: labeler.label(module, key),
            before: labeler.value(module, key, from),
            after: labeler.value(module, key, to),
        }));
    }
    const after = SNAPSHOT_AFTER.has(action);
    if (!after && !SNAPSHOT_BEFORE.has(action)) return [];
    return snapshotEntries(changes).map(({ key, value }) => {
        const text = labeler.value(module, key, value);
        return { key, label: labeler.label(module, key), before: after ? null : text, after: after ? text : null };
    });
}

/** What the entry recorded besides field changes; a nested block (a follow-up) one line per part. */
export function detailRows(action: string, module: string, changes: unknown, labeler: FieldLabeler): AuditDetailRow[] {
    const object = asObject(changes);
    if (!object) return changes === null || changes === undefined ? [] : [{ key: 'changes', label: 'Details', value: cellValue(changes) }];
    if (SNAPSHOT_AFTER.has(action) || SNAPSHOT_BEFORE.has(action)) return [];
    const diff = DIFF_ACTIONS.has(action);
    const rows: AuditDetailRow[] = [];
    for (const [key, value] of Object.entries(object)) {
        if (META_KEYS.has(key) || (diff && isDiff(value))) continue;
        const label = COMMON_LABELS[key] ?? labeler.label(module, key);
        const nested = asObject(value);
        if (nested && !isDiff(nested)) {
            for (const [part, partValue] of Object.entries(nested)) {
                if (!isEmpty(partValue)) rows.push({ key: `${key}.${part}`, label: `${label} › ${humanize(part)}`, value: cellValue(partValue) });
            }
            continue;
        }
        rows.push({ key, label, value: labeler.value(module, key, value) });
    }
    return rows;
}

const text = (value: unknown): string | undefined => (typeof value === 'string' && value.trim() ? value.trim() : undefined);
const count = (value: unknown): number | undefined => (typeof value === 'number' && Number.isFinite(value) ? value : undefined);

/** `Status, Assigned To, Rating +2 more`. */
function listOf(labels: string[]): string {
    if (labels.length <= 3) return labels.join(', ');
    return `${labels.slice(0, 3).join(', ')} +${labels.length - 3} more`;
}

/** The list's one-line summary of an entry. */
export function summarize(action: string, module: string, changes: unknown, labeler: FieldLabeler): string {
    const c = asObject(changes) ?? {};
    const fields = [...new Set(expandDiff(changes).map(({ key }) => labeler.label(module, key)))];
    switch (action) {
        case 'UPDATE':
        case 'STATUS_CHANGE':
            if (fields.length > 0) return `Changed ${listOf(fields)}`;
            if (typeof c.reordered === 'number') return `Reordered ${c.reordered} item${c.reordered === 1 ? '' : 's'}`;
            if (c.reset === true) return 'Reset to defaults';
            return 'Updated';
        case 'FOLLOW_UP':
            return fields.length > 0 ? `Follow-up recorded: ${listOf(fields)}` : 'Follow-up recorded';
        case 'CONVERT':
            return 'Lead converted';
        case 'REVERT':
            return fields.length > 0 ? `Undid change to ${listOf(fields)}` : 'Change undone';
        case 'IMPORT': {
            const created = count(c.created);
            const total = count(c.total);
            const rows = created !== undefined && total !== undefined ? `${created} of ${total} rows` : total !== undefined ? `${total} rows` : 'rows';
            const file = text(c.fileName);
            return `Imported ${rows}${file ? ` from ${file}` : ''}`;
        }
        case 'LOGIN_FAILED': {
            const reason = text(c.reason);
            return reason ? `Failed sign-in: ${reason}` : 'Failed sign-in';
        }
        case 'ACCESS_DENIED': {
            const target = [text(c.method), text(c.path)].filter(Boolean).join(' ');
            return target ? `Access refused: ${target}` : 'Access refused';
        }
        case 'PDF_GENERATED': {
            const template = text(c.templateName);
            return template ? `PDF generated (${template})` : 'PDF generated';
        }
        default:
            return actionLabel(action);
    }
}

// ── DTOs ─────────────────────────────────────────────────────────────────────

/**
 * Keys of the fields a diff changed, custom fields spelled out (`customFields.po_number`). Read from the changes
 * rather than the stored `changedFields` filter column, which leaves out one-sided pairs (`{ to }`).
 */
function changedFieldKeys(action: string, changes: unknown): string[] {
    return DIFF_ACTIONS.has(action) ? expandDiff(changes).map(({ key }) => key) : [];
}

export function toListItem(row: AuditRowLike, ctx: PresentContext, changes: unknown = parseChanges(row.changesJson)): AuditListItem {
    return {
        id: String(row.id),
        createdAt: row.createdAt.toISOString(),
        time: displayTime(row.createdAt),
        category: row.category,
        action: row.action,
        actionLabel: actionLabel(row.action),
        severity: row.severity,
        module: row.module,
        moduleLabel: moduleLabel(row.module),
        entityType: row.entityType,
        entityId: row.entityId,
        entityCode: row.entityCode && ctx.showsRecordNumber(row.module) ? row.entityCode : null,
        entityLabel: row.entityLabel,
        recordStatus: ctx.recordStatus(row.entityType, row.entityId),
        summary: summarize(row.action, row.module, changes, ctx.labeler),
        changedFields: changedFieldKeys(row.action, changes),
        changedBy: row.changedBy,
        actorId: row.actorId,
        actorRole: row.actorRole,
        source: row.source,
        ipAddress: row.ipAddress,
        requestId: row.requestId,
        page: row.page,
        revertsId: row.revertsId === null ? null : String(row.revertsId),
    };
}

export function toEntryDetail(row: AuditRowLike, ctx: PresentContext, changes: unknown): AuditEntryDetail {
    return {
        ...toListItem(row, ctx, changes),
        sessionId: row.sessionId,
        httpMethod: row.httpMethod,
        route: row.route,
        userAgent: row.userAgent,
    };
}
