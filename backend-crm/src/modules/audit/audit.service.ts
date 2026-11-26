import { z } from 'zod';
import { prisma } from '../../config/prisma.js';
import type { AuditEntityType } from '../../services/audit.service.js';
import type { AuthUser } from '../../types/user.types.js';
import { HttpError } from '../../utils/httpError.js';
import { FORM_CONFIG_ADMIN_ROLES } from '../form-configs/formConfig.routes.js';
import { canViewActivity } from '../activities/activity.access.js';
import { assertRecordAccess } from '../shared/accessControl.js';
import { displayTime, displayValue, fieldLabel, isDiff, parseChanges, type AuditEntryDto, type AuditRevisionItem } from './audit.format.js';
import { formConfigAuditService, isFormConfigsEntityType } from './formConfigAudit.service.js';

export type { AuditEntryDto, AuditRevisionItem } from './audit.format.js';

const ADMIN_ROLES = new Set<string>(FORM_CONFIG_ADMIN_ROLES.map((role) => role.toLowerCase()));
export const isAuditAdmin = (user: AuthUser): boolean => ADMIN_ROLES.has(user.role.toLowerCase());

type OwnerColumns = { assignedTo: string | null; createdBy: string | null } | null;
const OWNER_SELECT = { assignedTo: true, createdBy: true } as const;

/**
 * Row-scoped entities: a record's trail follows the record's own access rule (global role, assignee or creator).
 * Soft-deleted records are included, so an owner can still read why their record went away.
 */
const ROW_SCOPED_OWNERS: Partial<Record<AuditEntityType, (id: string) => Promise<OwnerColumns>>> = {
    Organization: (id) => prisma.organization.findUnique({ where: { id }, select: OWNER_SELECT }),
    Contact: (id) => prisma.contact.findUnique({ where: { id }, select: OWNER_SELECT }),
    Lead: (id) => prisma.lead.findUnique({ where: { id }, select: OWNER_SELECT }),
    Opportunity: (id) => prisma.opportunity.findUnique({ where: { id }, select: OWNER_SELECT }),
    Quotation: (id) => prisma.quotation.findUnique({ where: { id }, select: OWNER_SELECT }),
    Ticket: (id) => prisma.ticket.findUnique({ where: { id }, select: OWNER_SELECT }),
    Contract: (id) => prisma.contract.findUnique({ where: { id }, select: OWNER_SELECT }),
};

/** Admin-area trails (sign-ins carry IP addresses; templates are admin-managed). A user may read their own. */
const ADMIN_ONLY: ReadonlySet<AuditEntityType> = new Set(['User', 'PdfTemplate', 'Scorecard']);

/**
 * Who may read one record's trail. Admins read every trail. Otherwise: row-scoped records need access to the
 * record (activities: also their invited colleagues), admin-area trails are admin-only (a user's own User trail
 * excepted), and products / partner companies / referrals stay readable by any signed-in user, like the records
 * themselves.
 */
async function assertCanReadTrail(user: AuthUser, entityType: AuditEntityType, entityId: string): Promise<void> {
    if (isAuditAdmin(user)) return;
    if (ADMIN_ONLY.has(entityType)) {
        if (entityType === 'User' && entityId === String(user.id)) return;
        throw HttpError.forbidden();
    }
    if (entityType === 'Activity') {
        // Activities extend the rule with their invited colleagues (activity.access.ts).
        const activity = await prisma.activity.findUnique({
            where: { id: entityId },
            select: { ...OWNER_SELECT, attendees: { select: { username: true } } },
        });
        if (!activity) throw HttpError.notFound('Record not found');
        if (!canViewActivity(user, activity)) throw HttpError.forbidden('You do not have permission to access or modify this record.');
        return;
    }
    const loadOwner = ROW_SCOPED_OWNERS[entityType];
    if (!loadOwner) return;
    const record = await loadOwner(entityId);
    if (!record) throw HttpError.notFound('Record not found');
    assertRecordAccess(user, record);
}

/** Route segment (plural or singular, any case) → stored entity type. */
const ENTITY_TYPES: Record<string, AuditEntityType> = {
    organization: 'Organization',
    organizations: 'Organization',
    contact: 'Contact',
    contacts: 'Contact',
    lead: 'Lead',
    leads: 'Lead',
    opportunity: 'Opportunity',
    opportunities: 'Opportunity',
    quotation: 'Quotation',
    quotations: 'Quotation',
    product: 'Product',
    products: 'Product',
    ticket: 'Ticket',
    tickets: 'Ticket',
    contract: 'Contract',
    contracts: 'Contract',
    activity: 'Activity',
    activities: 'Activity',
    'partner-company': 'PartnerCompany',
    'partner-companies': 'PartnerCompany',
    partnercompany: 'PartnerCompany',
    partnercompanies: 'PartnerCompany',
    referral: 'Referral',
    referrals: 'Referral',
    user: 'User',
    users: 'User',
    'pdf-template': 'PdfTemplate',
    'pdf-templates': 'PdfTemplate',
    /** Admin › List Scorecards: the id is a module key. */
    scorecard: 'Scorecard',
    scorecards: 'Scorecard',
};

export const auditParamsSchema = z.object({
    entityType: z
        .string()
        .trim()
        .transform((value) => ENTITY_TYPES[value.toLowerCase()])
        .refine((value): value is AuditEntityType => Boolean(value), {
            message: `entityType must be one of: ${[...new Set(Object.values(ENTITY_TYPES))].join(', ')}, form-configs.`,
        }),
    entityId: z.string().trim().min(1).max(50),
});

export const auditQuerySchema = z.object({
    limit: z.coerce.number().int().min(1).max(500).catch(100).default(100),
});

const ACTION_TITLES: Record<string, { title: string; tag: string }> = {
    CREATE: { title: 'Record created', tag: 'Created' },
    DELETE: { title: 'Record deleted', tag: 'Deleted' },
    CONVERT: { title: 'Lead converted', tag: 'Converted' },
    IMPORT: { title: 'Imported', tag: 'Imported' },
    LOGIN: { title: 'Signed in', tag: 'Login' },
    LOGIN_FAILED: { title: 'Failed sign-in attempt', tag: 'Security' },
    LOGOUT: { title: 'Signed out', tag: 'Logout' },
    ACCESS_DENIED: { title: 'Access refused', tag: 'Security' },
    RESTORE: { title: 'Record restored', tag: 'Restored' },
    SET_DEFAULT: { title: 'Set as default template', tag: 'Default' },
    DUPLICATE: { title: 'Duplicated', tag: 'Created' },
    PDF_GENERATED: { title: 'PDF generated', tag: 'PDF' },
    PASSWORD_CHANGE: { title: 'Password changed', tag: 'Security' },
    SESSION_REVOKE: { title: 'Session signed out', tag: 'Security' },
};

const EMAIL_RESULT_LABELS: Record<string, string> = {
    valid: 'Valid',
    risky: 'Risky',
    invalid: 'Invalid',
    undecided: 'Undecided',
    unchecked: 'Not checked',
};
const emailResultLabel = (value: unknown) => EMAIL_RESULT_LABELS[String(value)] ?? displayValue(value);

/** One timeline item per changed field for updates; one item for every other action. */
function toRevisions(entry: AuditEntryDto, time: string): AuditRevisionItem[] {
    const base = { author: entry.changedBy, time };
    const changes = (entry.changes ?? {}) as Record<string, unknown>;

    // An email check result (emailCheckAudit.ts): "Email checked: a@b.com · Not checked → Invalid".
    if (typeof changes.email === 'string' && isDiff(changes.verificationStatus)) {
        const accepted = changes.reason === 'admin_accepted';
        return [
            {
                ...base,
                title: `${accepted ? 'Email accepted' : 'Email checked'}: ${changes.email}`,
                from: emailResultLabel(changes.verificationStatus.from),
                to: emailResultLabel(changes.verificationStatus.to),
                note: !accepted && typeof changes.reason === 'string' ? fieldLabel(changes.reason.replace(/_/g, ' ')) : undefined,
                tag: 'Email check',
            },
        ];
    }

    if (entry.action === 'UPDATE' || entry.action === 'STATUS_CHANGE' || entry.action === 'FOLLOW_UP') {
        const note = typeof changes.reason === 'string' ? changes.reason : undefined;
        if (entry.action === 'FOLLOW_UP') {
            // The `followUp` block isn't a field diff: the record's Follow-up History panel reads it.
            const items = Object.entries(changes)
                .filter(([, value]) => isDiff(value))
                .map(([field, value]) => {
                    const diff = value as { from: unknown; to: unknown };
                    return { ...base, title: `${fieldLabel(field)} updated`, from: displayValue(diff.from), to: displayValue(diff.to), tag: 'Follow-up' };
                });
            return items.length > 0 ? items : [{ ...base, title: 'Follow-up recorded', tag: 'Follow-up' }];
        }
        const items = Object.entries(changes)
            .filter(([, value]) => isDiff(value))
            .map(([field, value]) => {
                const diff = value as { from: unknown; to: unknown };
                return { ...base, title: `${fieldLabel(field)} updated`, from: displayValue(diff.from), to: displayValue(diff.to), tag: 'Updated', note };
            });
        return items.length > 0 ? items : [{ ...base, title: 'Record updated', tag: 'Updated', note }];
    }

    if (entry.action === 'RSVP') {
        // An invited colleague's reply: the attendee list before / after (activity.service.ts respond).
        const items = Object.entries(changes)
            .filter(([, value]) => isDiff(value))
            .map(([field, value]) => {
                const diff = value as { from: unknown; to: unknown };
                return { ...base, title: `${fieldLabel(field)} updated`, from: displayValue(diff.from), to: displayValue(diff.to), tag: 'Reply' };
            });
        return items.length > 0 ? items : [{ ...base, title: 'Replied to invitation', tag: 'Reply' }];
    }

    const known = ACTION_TITLES[entry.action] ?? { title: entry.action, tag: entry.action };
    if (entry.action === 'CONVERT' && isDiff(changes.status)) {
        return [{ ...base, ...known, from: displayValue(changes.status.from), to: displayValue(changes.status.to) }];
    }
    if (entry.action === 'PDF_GENERATED' && typeof changes.templateName === 'string') {
        return [{ ...base, ...known, note: `Template: ${changes.templateName}` }];
    }
    if (entry.action === 'SESSION_REVOKE') {
        const signedOut = typeof changes.signedOutSessions === 'number' ? changes.signedOutSessions : undefined;
        const note =
            changes.scope === 'others'
                ? `All other sessions${signedOut !== undefined ? ` (${signedOut})` : ''}`
                : 'One other session';
        return [{ ...base, ...known, note }];
    }
    return [{ ...base, ...known }];
}

export const auditLogService = {
    /**
     * Newest first: raw entries plus timeline items ready for `AuditTrailTimeline`.
     * `form-configs` is the Form Customization trail: `entityId` is a module key, `shared`, or `all`.
     */
    async forEntity(params: unknown, query: unknown, user: AuthUser) {
        const { limit } = auditQuerySchema.parse(query ?? {});
        if (isFormConfigsEntityType(params)) {
            if (!isAuditAdmin(user)) throw HttpError.forbidden();
            return formConfigAuditService.forScope(params, limit);
        }

        const { entityType, entityId } = auditParamsSchema.parse(params);
        await assertCanReadTrail(user, entityType, entityId);
        const rows = await prisma.auditLog.findMany({
            where: { entityType, entityId },
            // id is write order; served by the (entityType, entityId, id) index.
            orderBy: { id: 'desc' },
            take: limit,
        });

        const entries: AuditEntryDto[] = rows.map((row) => ({
            id: String(row.id),
            action: row.action,
            changedBy: row.changedBy,
            createdAt: row.createdAt.toISOString(),
            changes: parseChanges(row.changesJson),
        }));

        return {
            entityType,
            entityId,
            entries,
            revisions: entries.flatMap((entry, index) => toRevisions(entry, displayTime(rows[index].createdAt))),
        };
    },
};
