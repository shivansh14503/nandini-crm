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
    | 'Activity'
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
    /** Company-wide display formats (Admin › Company formats); one entity, id `company-formats`, action UPDATE. */
    | 'CompanyFormats'
    /** A company holiday (Admin › Holidays). */
    | 'Holiday'
    | 'City'
    /** A provider's company set-up on Admin › API Integrations (Google, Microsoft 365, Zoom); id = provider key. */
    | 'IntegrationProvider'
    /** An employee's company calendar sync row (Calendar Phase 2 P2-2b): ENROL / STOP (P2-2's CONNECT / DISCONNECT remain in history). */
    | 'CalendarConnection'
    /** An admin's calendar choice for one person (Admin › API Integrations › People): provider override, exclusion. */
    | 'CalendarSyncUser'
    /** A public booking page of one employee (Calendar Phase 4, booking-links); CREATE / UPDATE (turned off = UPDATE). */
    | 'BookingLink'
    /**
     * One employee's email logging (Calendar Phase 4, Admin › API Integrations › People): the admin's switch (CREATE /
     * UPDATE `{ username, mode: { from, to } }`) and purges of their logged emails (PURGE `{ username, copies, emails }`).
     */
    | 'LoggedEmailMailbox'
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
    /**
     * An invited colleague replied to an activity (diff of its attendees). Not an UPDATE: the update path can't set a
     * colleague's reply, so it isn't undoable.
     */
    | 'RSVP'
    /**
     * An activity's owner sent the calendar invitations that were held for them (Calendar Phase 2 P2-3c, D41):
     * `{ provider, privateCopy, guests }`, counts only. Not an UPDATE: the activity row doesn't change, and it can't
     * be undone (the invitations have been mailed).
     */
    | 'SEND_INVITES'
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
    | 'LEDGER_VERIFY'
    /** A user changed their own password (My Profile); `changes` holds only `passwordChangedAt`, never a password. */
    | 'PASSWORD_CHANGE'
    /**
     * An admin reset a user's password (Admin › Users); `changes` holds only `{ passwordChangeRequired: true,
     * generated }`, never a password. Written before the user's sessions are signed out, so it holds no session count.
     */
    | 'PASSWORD_RESET'
    /** A user signed out one of their other sessions (`scope: 'one'`, `sessionId`) or all of them (`scope: 'others'`). */
    | 'SESSION_REVOKE'
    /** A person's company calendar started syncing (enrolled or re-enrolled by the admin-managed set-up, P2-2b). */
    | 'ENROL'
    /** A person's calendar sync stopped (excluded, left, email or provider changed, provider removed); events stay. */
    | 'STOP'
    /** P2-2 (retired): an employee connected their own calendar. Kept so older audit entries still type-check. */
    | 'CONNECT'
    /** P2-2 (retired): an employee's own calendar connection was ended. */
    | 'DISCONNECT'
    /**
     * An admin's "Test connection" acted as one person on their company calendar (P2-2b): `{ asUsername, ok, code,
     * userStep }`, never a token. SECURITY: the CRM signed in as someone else.
     */
    | 'TEST_AS_USER'
    /** An admin deleted a person's logged emails (Calendar Phase 4 email logging): counts only. */
    | 'PURGE';

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
    Activity: 'activities',
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
    CompanyFormats: 'company-formats',
    Holiday: 'holidays',
    City: 'cities',
    IntegrationProvider: 'admin-integrations',
    CalendarConnection: 'calendar',
    CalendarSyncUser: 'admin-integrations',
    BookingLink: 'booking-links',
    LoggedEmailMailbox: 'admin-integrations',
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
    'CompanyFormats',
    'Holiday',
    'City',
    'IntegrationProvider',
    'CalendarSyncUser',
    'LoggedEmailMailbox',
]);

const SECURITY_ACTIONS: ReadonlySet<AuditAction> = new Set([
    'LOGIN',
    'LOGIN_FAILED',
    'LOGOUT',
    'ACCESS_DENIED',
    'EXPORT',
    'LEDGER_VERIFY',
    'PASSWORD_CHANGE',
    'PASSWORD_RESET',
    'SESSION_REVOKE',
    'ENROL',
    'STOP',
    'CONNECT',
    'DISCONNECT',
    'TEST_AS_USER',
]);

/** Actions whose `changes` are a `{ field: { from, to } }` diff. */
const DIFF_ACTIONS: ReadonlySet<AuditAction> = new Set(['UPDATE', 'STATUS_CHANGE', 'FOLLOW_UP', 'CONVERT', 'REVERT', 'EMAIL_CHECK', 'RSVP']);

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
 * INFO: everyday creates, edits, sign-ins. NOTICE: deletes, restores, undo, conversions, imports, any admin setting,
 * password changes and admin resets, and sessions signed out from My Profile.
 * WARNING: failed sign-ins and refused access. CRITICAL is reserved for integrity alarms.
 */
export function severityFor(action: AuditAction, category: AuditCategory): AuditSeverity {
    if (action === 'LOGIN_FAILED' || action === 'ACCESS_DENIED') return 'WARNING';
    if (['DELETE', 'RESTORE', 'REVERT', 'CONVERT', 'IMPORT', 'EXPORT', 'PASSWORD_CHANGE', 'PASSWORD_RESET', 'SESSION_REVOKE', 'ENROL', 'STOP', 'CONNECT', 'DISCONNECT', 'TEST_AS_USER', 'PURGE'].includes(action) || category === 'CONFIG') {
        return 'NOTICE';
    }
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

/**
 * Keys whose values are never written to the audit log, at any depth: a whole-key list (any case, snake_case token
 * keys included) plus a case-sensitive camelCase suffix rule, so `clientSecret`, `webhookSecret`, `accessTokenEnc`
 * and the like are caught without a substring rule (which would hide admin custom fields such as `hotProspect`,
 * "otp" inside) and without listing `code` (which would hide record codes such as LD-0012 in every diff).
 */
const SENSITIVE_KEY_EXACT =
    /^(password|passwordHash|newPassword|currentPassword|token|accessToken|refreshToken|idToken|secret|secrets|secretsEnc|clientSecret|webhookSecret|apiKey|otp|codeVerifier|syncCursor|access_token|refresh_token|id_token|client_secret|code_verifier|serviceAccountKey|privateKey|private_key|assertion)$/i;
const SENSITIVE_KEY_SUFFIX = /(Secret|Secrets|Token|Password)(Enc)?$/;
export const isSensitiveKey = (key: string): boolean => SENSITIVE_KEY_EXACT.test(key) || SENSITIVE_KEY_SUFFIX.test(key);
export const REDACTED = '[redacted]';

/** Copy of `value` with sensitive keys replaced by `[redacted]` (diff `{ from, to }` pairs included). */
export function redact<T>(value: T, depth = 0): T {
    if (depth > 8 || value === null || typeof value !== 'object') return value;
    if (Array.isArray(value)) return value.map((item) => redact(item, depth + 1)) as T;
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
        out[key] = isSensitiveKey(key) ? REDACTED : redact(item, depth + 1);
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

/** Names of the providers on Admin › API Integrations (integration.constants.ts has the same list). */
const INTEGRATION_PROVIDER_LABELS: Record<string, string> = { google: 'Google Workspace', microsoft: 'Microsoft 365', zoom: 'Zoom' };

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
        case 'Activity':
            return pick('subject');
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
        case 'CompanyFormats':
            return 'Company Formats';
        case 'Holiday':
            return pick('occasion');
        case 'IntegrationProvider':
            return INTEGRATION_PROVIDER_LABELS[entityId] ?? entityId;
        case 'CalendarConnection':
            return pick('accountEmail');
        case 'CalendarSyncUser':
        case 'LoggedEmailMailbox':
            return pick('username') ?? entityId;
        case 'BookingLink':
            return pick('title');
        case 'Import':
        case 'RecordFile':
        case 'PdfAsset':
        case 'AuditExport':
            return pick('fileName');
        default:
            return pick('name', 'label');
    }
}
