/**
 * What every audit entry is about: its module, category and severity, the fields an update changed, and the
 * redaction of values that must never be stored. Pure functions (unit tested in auditCatalog.test.ts); the same
 * mapping backfilled the rows written before these columns existed (migration 20261121200000_audit_ledger).
 */

export type AuditEntityType =
    | 'Organization'
    | 'Contact'
    | 'Lead'
    | 'Opportunity'
    | 'Quotation'
    | 'Product'
    | 'Ticket'
    | 'Contract'
    /** A file uploaded to a record field (an opportunity's Upload Doc); `changes.module` is its module. */
    | 'RecordFile'
    | 'PartnerCompany'
    | 'Referral'
    | 'User'
    | 'Import'
    | 'DropdownCategory'
    | 'DropdownOption'
    | 'FormField'
    | 'ModuleSetting'
    | 'Scorecard'
    | 'DrawerLayout'
    | 'DrawerPiece'
    | 'PdfTemplate'
    | 'PdfAsset'
    | 'PdfSavedItem'
    | 'DocumentSeries'
    | 'City'
    /** An export of the audit log itself (Admin › Audit Log). */
    | 'AuditExport'
    /** The audit log's SQL Server ledger (integrity checks). */
    | 'AuditLedger';

export type AuditAction =
    | 'CREATE'
    | 'UPDATE'
    | 'DELETE'
    /** A deleted record brought back. */
    | 'RESTORE'
    /** A change undone from the audit log (`revertsId` points at it). */
    | 'REVERT'
    | 'STATUS_CHANGE'
    | 'CONVERT'
    /** A lead follow-up: the field diff plus a `followUp` block (lead.followUp.ts FollowUpSummary). */
    | 'FOLLOW_UP'
    /** An email check changed an address's result on a record (email-verification/emailCheckAudit.ts). */
    | 'EMAIL_CHECK'
    | 'IMPORT'
    | 'LOGIN'
    | 'LOGIN_FAILED'
    | 'LOGOUT'
    /** A signed-in user was refused (403) by a role or record-access check. */
    | 'ACCESS_DENIED'
    | 'SET_DEFAULT'
    | 'DUPLICATE'
    | 'PDF_GENERATED'
    /** Entries of the audit log exported to a file. */
    | 'EXPORT'
    /** The ledger was checked for tampering ("Verify integrity"); CRITICAL when it failed. */
    | 'LEDGER_VERIFY';

/** DATA = a CRM record changed; CONFIG = an admin setting changed; SECURITY = sign-ins and refused access. */
export type AuditCategory = 'DATA' | 'CONFIG' | 'SECURITY';
export type AuditSeverity = 'INFO' | 'NOTICE' | 'WARNING' | 'CRITICAL';

/** App area each entity belongs to: a CRM module key, or an admin area. */
const MODULE_BY_ENTITY: Record<AuditEntityType, string> = {
    Organization: 'organizations',
    Contact: 'contacts',
    Lead: 'leads',
    Opportunity: 'opportunities',
    Quotation: 'quotations',
    Product: 'products',
    Ticket: 'tickets',
    Contract: 'contracts',
    RecordFile: 'files',
    PartnerCompany: 'partner-companies',
    Referral: 'referrals',
    User: 'users',
    Import: 'imports',
    DropdownCategory: 'form-customization',
    DropdownOption: 'form-customization',
    FormField: 'form-customization',
    ModuleSetting: 'form-customization',
    Scorecard: 'list-scorecards',
    DrawerLayout: 'form-customization',
    DrawerPiece: 'form-customization',
    PdfTemplate: 'pdf-templates',
    PdfAsset: 'pdf-templates',
    PdfSavedItem: 'pdf-templates',
    DocumentSeries: 'document-series',
    City: 'cities',
    AuditExport: 'audit-log',
    AuditLedger: 'audit-log',
};

const CONFIG_ENTITIES: ReadonlySet<AuditEntityType> = new Set([
    'DropdownCategory',
    'DropdownOption',
    'FormField',
    'ModuleSetting',
    'Scorecard',
    'DrawerLayout',
    'DrawerPiece',
    'PdfTemplate',
    'PdfAsset',
    'PdfSavedItem',
    'DocumentSeries',
    'City',
]);

const SECURITY_ACTIONS: ReadonlySet<AuditAction> = new Set(['LOGIN', 'LOGIN_FAILED', 'LOGOUT', 'ACCESS_DENIED', 'EXPORT', 'LEDGER_VERIFY']);

/** Actions whose `changes` are a `{ field: { from, to } }` diff. */
const DIFF_ACTIONS: ReadonlySet<AuditAction> = new Set(['UPDATE', 'STATUS_CHANGE', 'FOLLOW_UP', 'CONVERT', 'REVERT', 'EMAIL_CHECK']);

/** Keys inside a diff that describe the entry rather than a changed field. */
const NON_FIELD_KEYS = new Set(['_meta', 'followUp']);

const asObject = (value: unknown): Record<string, unknown> | undefined =>
    value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;

export function moduleFor(entityType: AuditEntityType, changes?: unknown): string {
    // An import belongs to the module it filled (`leads`, `contacts` …).
    if (entityType === 'Import' || entityType === 'RecordFile') {
        const entity = asObject(changes)?.entity;
        if (typeof entity === 'string' && entity) return entity;
    }
    return MODULE_BY_ENTITY[entityType] ?? entityType.toLowerCase();
}

export function categoryFor(entityType: AuditEntityType, action: AuditAction): AuditCategory {
    if (SECURITY_ACTIONS.has(action)) return 'SECURITY';
    return CONFIG_ENTITIES.has(entityType) ? 'CONFIG' : 'DATA';
}

/**
 * INFO: everyday creates, edits, sign-ins. NOTICE: deletes, restores, undo, conversions, imports and any admin setting.
 * WARNING: failed sign-ins and refused access. CRITICAL is reserved for integrity alarms.
 */
export function severityFor(action: AuditAction, category: AuditCategory): AuditSeverity {
    if (action === 'LOGIN_FAILED' || action === 'ACCESS_DENIED') return 'WARNING';
    if (['DELETE', 'RESTORE', 'REVERT', 'CONVERT', 'IMPORT', 'EXPORT'].includes(action) || category === 'CONFIG') return 'NOTICE';
    return 'INFO';
}

/**
 * A `{ from, to }` pair. JSON drops an `undefined` side, so a value that was added (or removed) arrives as `{ to }`
 * (or `{ from }`): any object holding only these keys is one. Same rule as `isDiff` in modules/audit/audit.format.ts.
 */
const isDiffValue = (value: unknown): boolean => {
    const object = asObject(value);
    if (!object) return false;
    const keys = Object.keys(object);
    return keys.length > 0 && keys.length <= 2 && keys.every((key) => key === 'from' || key === 'to');
};

/** `|status|assignedTo|` for a diff (in the diff's own order), null for every other action. Max 1,000 chars. */
export function changedFieldsOf(action: AuditAction, changes: unknown): string | null {
    if (!DIFF_ACTIONS.has(action)) return null;
    const object = asObject(changes);
    if (!object) return null;
    const fields = Object.keys(object).filter((key) => !NON_FIELD_KEYS.has(key) && isDiffValue(object[key]));
    if (fields.length === 0) return null;
    let joined = '|';
    for (const field of fields) {
        if (joined.length + field.length + 1 > 1000) break;
        joined += `${field}|`;
    }
    return joined.length > 1 ? joined : null;
}

/** Keys whose values are never written to the audit log, at any depth. */
const SENSITIVE_KEY = /^(password|passwordHash|newPassword|currentPassword|token|accessToken|refreshToken|secret|apiKey|otp)$/i;
export const REDACTED = '[redacted]';

/** Copy of `value` with sensitive keys replaced by `[redacted]` (diff `{ from, to }` pairs included). */
export function redact<T>(value: T, depth = 0): T {
    if (depth > 8 || value === null || typeof value !== 'object') return value;
    if (Array.isArray(value)) return value.map((item) => redact(item, depth + 1)) as T;
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
        out[key] = SENSITIVE_KEY.test(key) ? REDACTED : redact(item, depth + 1);
    }
    return out as T;
}

/** Display name of a module key (`partner-companies` → `Partner Companies`), as used in entry labels. */
export function moduleTitle(key: string | undefined | null): string | undefined {
    if (!key) return undefined;
    if (key === 'shared') return 'Shared';
    return key
        .split('-')
        .filter(Boolean)
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
}

const text = (value: unknown): string | undefined => (typeof value === 'string' && value.trim() ? value.trim() : undefined);
const joinLabel = (...parts: (string | undefined)[]) => parts.filter(Boolean).join(' › ') || undefined;

/** A string field of the snapshot, or the new value of a `{ from, to }` diff of it. */
function snapshotValue(changes: Record<string, unknown>, key: string): string | undefined {
    const value = changes[key];
    if (value && typeof value === 'object' && 'to' in value) return text((value as { to: unknown }).to);
    return text(value);
}

/** Label from the entry itself: the record snapshot, `_meta` labels (Form Customization), or the id for settings. */
export function labelFromChanges(entityType: AuditEntityType, entityId: string, changes: unknown): string | undefined {
    const c = (changes && typeof changes === 'object' && !Array.isArray(changes) ? changes : {}) as Record<string, unknown>;
    const meta = (c._meta && typeof c._meta === 'object' ? c._meta : {}) as Record<string, unknown>;
    const pick = (...keys: string[]) => keys.map((key) => snapshotValue(c, key)).find(Boolean);
    switch (entityType) {
        case 'Organization':
            return pick('organizationName');
        case 'Contact':
        case 'Lead':
        case 'Referral':
            return pick('name');
        case 'Opportunity':
            return pick('opportunityName', 'organizationName');
        case 'Quotation':
            return pick('quotationTitle');
        case 'Ticket':
            return pick('ticketSubject', 'organizationName');
        case 'Contract':
            return pick('contractTitle', 'organizationName');
        case 'Product':
            return pick('productName');
        case 'PartnerCompany':
            return pick('partnerName');
        case 'City':
            return pick('cityName');
        case 'DropdownCategory':
            return text(meta.categoryLabel) ?? pick('label');
        case 'DropdownOption':
            return joinLabel(text(meta.categoryLabel), text(meta.optionLabel) ?? pick('label'));
        case 'FormField': {
            // A field ("Leads › Phone 3"), or the whole form for reorder / reset entries (entityId = module key).
            const module = moduleTitle(text(meta.module) ?? entityId);
            const field = text(meta.fieldLabel) ?? pick('label');
            return field ? joinLabel(module, field) : module && `${module} form`;
        }
        case 'Scorecard':
            return `${moduleTitle(entityId) ?? entityId} scorecard`;
        case 'DrawerLayout':
            return `${moduleTitle(entityId) ?? entityId} drawer layout`;
        case 'DrawerPiece':
            return joinLabel('Drawer pieces', pick('name'));
        case 'ModuleSetting':
            return entityId;
        case 'DocumentSeries':
            return 'Document Series';
        case 'Import':
        case 'RecordFile':
        case 'PdfAsset':
        case 'AuditExport':
            return pick('fileName');
        default:
            return pick('name', 'label');
    }
}
