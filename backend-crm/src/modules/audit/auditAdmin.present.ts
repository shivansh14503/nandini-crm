import { DEFAULT_DISPLAY_FORMATS, formatCount, formatDay, formatNumber, formatWallClock, type DisplayFormats } from '../company-formats/core/displayFormats.js';
import { displayTime, isDiff, parseChanges } from './audit.format.js';

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
    /** Company display formats for dates, amounts and counts in the texts; missing = the defaults (not customized). */
    formats?: DisplayFormats;
}

/**
 * How `cellValue` shows a stored value. Until an admin saves company formats (`customized: false`, or no formats) a
 * value is shown as stored, as before company formats existed. Once saved, `YYYY-MM-DD` days, `YYYY-MM-DDTHH:mm`
 * wall clocks and ISO instants (business timezone) follow the company date / time formats, and amounts the company
 * digit grouping.
 */
export interface ValueFormat {
    formats?: DisplayFormats;
    /** The field's form type when it is an amount: a stored number can't tell money from a year or a count. */
    kind?: 'amount';
}

/** `live` / `deleted` (soft-deleted) / `missing` for CRM records; null for everything else (sign-ins, settings). */
export type RecordStatus = 'live' | 'deleted' | 'missing' | null;

export interface PresentContext {
    labeler: FieldLabeler;
    /** Record numbers are shown only for modules with a document series (Settings › Document Series). */
    showsRecordNumber(module: string): boolean;
    recordStatus(entityType: string, entityId: string): RecordStatus;
    /** Company display formats for `time`; missing = the defaults (exports always pass them, so their column never changes). */
    formats?: DisplayFormats;
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
    EMAIL_CHECK: 'Email checked',
    RSVP: 'Replied',
    IMPORT: 'Imported',
    LOGIN: 'Signed in',
    LOGIN_FAILED: 'Failed sign-in',
    LOGOUT: 'Signed out',
    ACCESS_DENIED: 'Access refused',
    SET_DEFAULT: 'Set as default',
    DUPLICATE: 'Duplicated',
    PDF_GENERATED: 'PDF generated',
    EXPORT: 'Exported',
    LEDGER_VERIFY: 'Integrity check',
    PASSWORD_CHANGE: 'Password changed',
    PASSWORD_RESET: 'Password reset',
    SESSION_REVOKE: 'Session signed out',
    ENROL: 'Calendar sync started',
    STOP: 'Calendar sync stopped',
    CONNECT: 'Connected',
    DISCONNECT: 'Disconnected',
    TEST_AS_USER: 'Calendar test as a person',
};
export const actionLabel = (action: string) => ACTION_LABELS[action] ?? humanize(action.toLowerCase());

const MODULE_LABELS: Record<string, string> = {
    'pdf-templates': 'PDF Templates',
    'form-customization': 'Form Customization',
    'document-series': 'Document Series',
    'company-formats': 'Company Formats',
    'list-scorecards': 'List Scorecards',
    'audit-log': 'Audit Log',
    'admin-integrations': 'API Integrations',
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
    verificationStatus: 'Email Check Result',
    email: 'Email Address',
    runId: 'Bulk Check',
    reordered: 'Reordered',
    reset: 'Reset to Defaults',
    secretChanged: 'Secret Changed',
    secretCleared: 'Secret Removed',
    webhookSecretChanged: 'Webhook Secret Changed',
    clientSecretExpiresOn: 'Secret Expires On',
    clientVersion: 'App Version',
};

// ── Values ───────────────────────────────────────────────────────────────────

const MAX_CELL = 1000;
const clip = (value: string) => (value.length > MAX_CELL ? `${value.slice(0, MAX_CELL - 1)}…` : value);

const asObject = (value: unknown): Record<string, unknown> | undefined =>
    value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;

/** An item of a list value (email list, line items) by its name-like key. */
function itemText(item: unknown): string {
    const object = asObject(item);
    if (!object) return String(item);
    const named = ['email', 'name', 'label', 'value', 'productName', 'title'].map((key) => object[key]).find((v) => typeof v === 'string' && v);
    return typeof named === 'string' ? named : JSON.stringify(item);
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const WALL_CLOCK = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
const INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/;
const DECIMAL = /^-?\d+(?:\.\d+)?$/;

/** A stored scalar as text: as stored until formats are saved; then days, date-times and amounts in the company formats. */
function scalarText(value: unknown, { formats, kind }: ValueFormat): string {
    const raw = String(value);
    if (!formats?.customized) return raw;
    if (kind === 'amount') {
        const amount = typeof value === 'number' ? value : typeof value === 'string' && DECIMAL.test(value.trim()) ? Number(value) : NaN;
        // 1,25,000 / 1,25,000.50: no currency symbol (opportunities and quotations keep their own currency).
        if (Number.isFinite(amount)) return formatNumber(amount, formats, { minDecimals: Number.isInteger(amount) ? 0 : 2, maxDecimals: 2 });
    }
    if (typeof value !== 'string') return raw;
    if (DAY.test(value)) return formatDay(value, formats);
    if (WALL_CLOCK.test(value)) return formatWallClock(value, formats);
    if (INSTANT.test(value)) {
        const instant = new Date(value);
        if (!Number.isNaN(instant.getTime())) return displayTime(instant, formats);
    }
    return raw;
}

/**
 * A stored value as text: `—` for empty, Yes / No, lists joined, `{ from, to }` as `A → B`. Dates and amounts follow
 * the company formats once saved (`format`); until then every value reads as stored.
 */
export function cellValue(value: unknown, format: ValueFormat = {}): string {
    if (value === null || value === undefined || value === '') return '—';
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    if (Array.isArray(value)) return value.length === 0 ? '—' : clip(value.map((item) => (item !== null && typeof item === 'object' ? itemText(item) : scalarText(item, format))).join(', '));
    if (typeof value === 'object') {
        if (isDiff(value)) return `${cellValue(value.from, format)} → ${cellValue(value.to, format)}`;
        return Object.keys(value).length === 0 ? '—' : clip(JSON.stringify(value));
    }
    return clip(scalarText(value, format));
}

/** Stored codes shown by name: email check results (email-verification/emailCheckAudit.ts). */
const VALUE_NAMES: Readonly<Record<string, Readonly<Record<string, string>>>> = {
    verificationStatus: { valid: 'Valid', risky: 'Risky', invalid: 'Invalid', undecided: 'Undecided', unchecked: 'Not checked' },
};

/** `cellValue`, with the stored codes of known keys (an email check result) by name. */
export function namedValue(key: string, value: unknown, format: ValueFormat = {}): string {
    const names = VALUE_NAMES[key];
    return names && typeof value === 'string' && names[value] ? names[value] : cellValue(value, format);
}

const isEmpty = (value: unknown) =>
    value === null ||
    value === undefined ||
    value === '' ||
    (Array.isArray(value) && value.length === 0) ||
    (asObject(value) !== undefined && Object.keys(value as object).length === 0);

// ── Changes ──────────────────────────────────────────────────────────────────

/** Actions whose changes are a `{ field: { from, to } }` diff (auditCatalog DIFF_ACTIONS). */
const DIFF_ACTIONS = new Set(['UPDATE', 'STATUS_CHANGE', 'FOLLOW_UP', 'CONVERT', 'REVERT', 'EMAIL_CHECK', 'RSVP']);
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
    if (!object) return changes === null || changes === undefined ? [] : [{ key: 'changes', label: 'Details', value: cellValue(changes, { formats: labeler.formats }) }];
    if (SNAPSHOT_AFTER.has(action) || SNAPSHOT_BEFORE.has(action)) return [];
    const diff = DIFF_ACTIONS.has(action);
    const rows: AuditDetailRow[] = [];
    for (const [key, value] of Object.entries(object)) {
        if (META_KEYS.has(key) || (diff && isDiff(value))) continue;
        const label = COMMON_LABELS[key] ?? labeler.label(module, key);
        const nested = asObject(value);
        if (nested && !isDiff(nested)) {
            for (const [part, partValue] of Object.entries(nested)) {
                if (!isEmpty(partValue)) rows.push({ key: `${key}.${part}`, label: `${label} › ${humanize(part)}`, value: cellValue(partValue, { formats: labeler.formats }) });
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
    // An email check result (an EMAIL_CHECK, or the admin's "accept" as an UPDATE): "Email checked: a@b.in · Not checked → Invalid".
    if (typeof c.email === 'string' && isDiff(c.verificationStatus)) {
        const verb = c.reason === 'admin_accepted' ? 'Email accepted' : 'Email checked';
        const result = c.verificationStatus as { from?: unknown; to?: unknown };
        const format = { formats: labeler.formats };
        return `${verb}: ${c.email} · ${namedValue('verificationStatus', result.from, format)} → ${namedValue('verificationStatus', result.to, format)}`;
    }
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
        case 'RSVP':
            return 'Replied to invitation';
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
        case 'RESTORE':
            return 'Restored';
        case 'EXPORT': {
            const rows = count(c.rowCount);
            const format = text(c.format)?.toUpperCase();
            // A row count (a whole number): 12,345 in the company grouping (Indian, as before, until formats are saved).
            return `Exported ${rows !== undefined ? `${formatCount(rows, labeler.formats ?? DEFAULT_DISPLAY_FORMATS)} ` : ''}entr${rows === 1 ? 'y' : 'ies'}${format ? ` to ${format}` : ''}`;
        }
        case 'PASSWORD_CHANGE':
            return 'Changed their password';
        case 'PASSWORD_RESET':
            return `Reset the password${c.generated === true ? ' (temporary password)' : ''}`;
        case 'SESSION_REVOKE': {
            if (c.scope !== 'others') return 'Signed out one of their other sessions';
            const signedOut = count(c.signedOutSessions);
            return signedOut !== undefined
                ? `Signed out of ${signedOut} other session${signedOut === 1 ? '' : 's'}`
                : 'Signed out of all other sessions';
        }
        case 'LEDGER_VERIFY':
            if (c.result === 'verified') return `Integrity verified: ${text(c.message) ?? 'no changes found'}`;
            if (c.result === 'error') return `Integrity check could not run: ${text(c.message) ?? 'see details'}`;
            return `Integrity check FAILED: ${text(c.message) ?? 'see details'}`;
        default:
            return actionLabel(action);
    }
}

// ── DTOs ─────────────────────────────────────────────────────────────────────

/** Keys of the fields a diff changed, read from the changes so custom fields are spelled out (`customFields.po_number`). */
function changedFieldKeys(action: string, changes: unknown): string[] {
    return DIFF_ACTIONS.has(action) ? expandDiff(changes).map(({ key }) => key) : [];
}

export function toListItem(row: AuditRowLike, ctx: PresentContext, changes: unknown = parseChanges(row.changesJson)): AuditListItem {
    return {
        id: String(row.id),
        createdAt: row.createdAt.toISOString(),
        time: displayTime(row.createdAt, ctx.formats),
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
