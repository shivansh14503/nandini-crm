import { FIELD_MAX_LENGTH } from '../../config/fieldLimits.js';
import { prisma, type TransactionClient } from '../../config/prisma.js';
import type { AuthUser } from '../../types/user.types.js';
import type { EntityCodePrefix } from '../../utils/codeGenerator.js';
import { HttpError } from '../../utils/httpError.js';
import { buildAccessScopeWhere, canAccessRecord } from '../shared/accessControl.js';
import { opportunityLabel } from '../shared/opportunityLabel.js';
import { findOrganizationByName } from '../shared/prefetch.js';
import { assertReference } from '../shared/references.js';
import { codeSearchPrefix } from '../shared/searchTerms.js';
import type { ActivityLink, ActivityLinks } from './activity.mapper.js';
import type { ActivityRelatedModule } from './activity.schedule.js';
import type { ActivityInput, LinkTargetsQuery } from './activity.validator.js';

/**
 * The record an activity is related to (any of ACTIVITY_RELATED_MODULES, by module + id, no foreign key) and the
 * organization / contact it rolls up to. One loader per module serves both the "Related To" picker
 * (`GET /link-targets`) and the save (`resolveActivityLinks`), so both show the same code and label.
 */

export const LINK_FORBIDDEN_MESSAGE = "You can't link an activity to a record you don't have access to.";

/** One pickable record (`GET /api/activities/link-targets`). */
export interface LinkTarget {
    module: ActivityRelatedModule;
    id: string;
    /** Record number (LD-0001 …). */
    code: string;
    label: string;
    organizationName: string;
    organizationId?: string;
    contact: string;
    contactId?: string;
    assignedTo: string;
}

/** A target as loaded: the picker's fields plus what the access and reference checks read. */
export interface TargetRow extends LinkTarget {
    isDeleted: boolean;
    createdBy: string;
}

type Db = TransactionClient | typeof prisma;

const base = { id: true, assignedTo: true, createdBy: true, isDeleted: true } as const;
const orgAndContact = { organizationName: true, organizationId: true, contact: true, contactId: true } as const;

const SELECTS = {
    leads: { ...base, leadCode: true, name: true, organizationName: true },
    opportunities: { ...base, ...orgAndContact, opportunityCode: true, opportunityName: true, productCategoryJson: true },
    contacts: { ...base, contactCode: true, name: true, organizationName: true, organizationId: true },
    organizations: { ...base, accountCode: true, organizationName: true },
    quotations: { ...base, ...orgAndContact, quotationCode: true, quotationTitle: true },
    tickets: { ...base, ...orgAndContact, ticketNumber: true, ticketSubject: true },
    contracts: { ...base, ...orgAndContact, contractNumber: true, contractTitle: true },
} as const;

interface Owned {
    id: string;
    assignedTo: string | null;
    createdBy: string;
    isDeleted: boolean;
}

const optionalId = (id: string | null | undefined) => id || undefined;

const target = (
    module: ActivityRelatedModule,
    row: Owned,
    fields: { code: string; label: string; organizationName?: string | null; organizationId?: string | null; contact?: string | null; contactId?: string | null },
): TargetRow => ({
    module,
    id: row.id,
    code: fields.code,
    label: fields.label,
    organizationName: fields.organizationName ?? '',
    organizationId: optionalId(fields.organizationId),
    contact: fields.contact ?? '',
    contactId: optionalId(fields.contactId),
    assignedTo: row.assignedTo ?? '',
    isDeleted: row.isDeleted,
    createdBy: row.createdBy,
});

/**
 * Pure row → target mappers (code, label, organization, contact per module):
 *   leads          leadCode         name                                        organization name only
 *   opportunities  opportunityCode  name ‖ products ‖ organization              organization, contact
 *   contacts       contactCode      name                                        organization, itself
 *   organizations  accountCode      organizationName                            itself
 *   quotations     quotationCode    quotationTitle                              organization, contact
 *   tickets        ticketNumber     ticketSubject ‖ organization                 organization, contact
 *   contracts      contractNumber   contractTitle ‖ organization                organization, contact
 */
export const TARGET_MAPPERS = {
    leads: (row: Owned & { leadCode: string; name: string; organizationName: string | null }) =>
        target('leads', row, { code: row.leadCode, label: row.name, organizationName: row.organizationName }),
    opportunities: (
        row: Owned & {
            opportunityCode: string;
            opportunityName: string | null;
            productCategoryJson: string | null;
            organizationName: string;
            organizationId: string | null;
            contact: string;
            contactId: string | null;
        },
    ) =>
        // A nameless opportunity's label lists its products, which can exceed `Activity.relatedTo` (NVARCHAR(200)).
        target('opportunities', row, { ...row, code: row.opportunityCode, label: opportunityLabel(row, FIELD_MAX_LENGTH.title) }),
    contacts: (row: Owned & { contactCode: string; name: string; organizationName: string; organizationId: string | null }) =>
        target('contacts', row, { ...row, code: row.contactCode, label: row.name, contact: row.name, contactId: row.id }),
    organizations: (row: Owned & { accountCode: string; organizationName: string }) =>
        target('organizations', row, { code: row.accountCode, label: row.organizationName, organizationName: row.organizationName, organizationId: row.id }),
    quotations: (
        row: Owned & { quotationCode: string; quotationTitle: string; organizationName: string | null; organizationId: string | null; contact: string; contactId: string | null },
    ) => target('quotations', row, { ...row, code: row.quotationCode, label: row.quotationTitle }),
    tickets: (
        row: Owned & { ticketNumber: string; ticketSubject: string | null; organizationName: string; organizationId: string | null; contact: string; contactId: string | null },
    ) => target('tickets', row, { ...row, code: row.ticketNumber, label: row.ticketSubject || row.organizationName }),
    contracts: (
        row: Owned & { contractNumber: string; contractTitle: string; organizationName: string; organizationId: string | null; contact: string; contactId: string | null },
    ) => target('contracts', row, { ...row, code: row.contractNumber, label: row.contractTitle || row.organizationName }),
} satisfies Record<ActivityRelatedModule, (row: never) => TargetRow>;

/** Text search over a module's code and name columns: a code-shaped term is a prefix match on the code only. */
function searchWhere(term: string | undefined, prefix: EntityCodePrefix, codeColumn: string, columns: readonly string[]): Record<string, unknown> {
    if (!term) return {};
    const code = codeSearchPrefix(term, prefix);
    if (code) return { [codeColumn]: { startsWith: code } };
    return { OR: [codeColumn, ...columns].map((column) => ({ [column]: { contains: term } })) };
}

interface Loader {
    /** Singular name in messages ("The selected lead does not exist."). */
    label: string;
    find(db: Db, id: string): Promise<TargetRow | null>;
    /** Live records the user can access, most recently changed first. */
    search(db: Db, user: AuthUser, term: string | undefined, take: number): Promise<TargetRow[]>;
}

const listArgs = (user: AuthUser, search: Record<string, unknown>, take: number) => ({
    where: { isDeleted: false, AND: [buildAccessScopeWhere(user, 'assignedTo'), search] },
    orderBy: [{ updatedAt: 'desc' as const }, { id: 'asc' as const }],
    take,
});

export const RELATED_LOADERS: Record<ActivityRelatedModule, Loader> = {
    leads: {
        label: 'lead',
        async find(db, id) {
            const row = await db.lead.findUnique({ where: { id }, select: SELECTS.leads });
            return row && TARGET_MAPPERS.leads(row);
        },
        async search(db, user, term, take) {
            const rows = await db.lead.findMany({
                ...listArgs(user, searchWhere(term, 'LD', 'leadCode', ['name', 'organizationName']), take),
                select: SELECTS.leads,
            });
            return rows.map(TARGET_MAPPERS.leads);
        },
    },
    opportunities: {
        label: 'opportunity',
        async find(db, id) {
            const row = await db.opportunity.findUnique({ where: { id }, select: SELECTS.opportunities });
            return row && TARGET_MAPPERS.opportunities(row);
        },
        async search(db, user, term, take) {
            const rows = await db.opportunity.findMany({
                ...listArgs(user, searchWhere(term, 'OPP', 'opportunityCode', ['opportunityName', 'organizationName', 'contact']), take),
                select: SELECTS.opportunities,
            });
            return rows.map(TARGET_MAPPERS.opportunities);
        },
    },
    contacts: {
        label: 'contact',
        async find(db, id) {
            const row = await db.contact.findUnique({ where: { id }, select: SELECTS.contacts });
            return row && TARGET_MAPPERS.contacts(row);
        },
        async search(db, user, term, take) {
            const rows = await db.contact.findMany({
                ...listArgs(user, searchWhere(term, 'CON', 'contactCode', ['name', 'organizationName']), take),
                select: SELECTS.contacts,
            });
            return rows.map(TARGET_MAPPERS.contacts);
        },
    },
    organizations: {
        label: 'organization',
        async find(db, id) {
            const row = await db.organization.findUnique({ where: { id }, select: SELECTS.organizations });
            return row && TARGET_MAPPERS.organizations(row);
        },
        async search(db, user, term, take) {
            const rows = await db.organization.findMany({
                ...listArgs(user, searchWhere(term, 'ORG', 'accountCode', ['organizationName']), take),
                select: SELECTS.organizations,
            });
            return rows.map(TARGET_MAPPERS.organizations);
        },
    },
    quotations: {
        label: 'quotation',
        async find(db, id) {
            const row = await db.quotation.findUnique({ where: { id }, select: SELECTS.quotations });
            return row && TARGET_MAPPERS.quotations(row);
        },
        async search(db, user, term, take) {
            const rows = await db.quotation.findMany({
                ...listArgs(user, searchWhere(term, 'QT', 'quotationCode', ['quotationTitle', 'organizationName', 'contact']), take),
                select: SELECTS.quotations,
            });
            return rows.map(TARGET_MAPPERS.quotations);
        },
    },
    tickets: {
        label: 'ticket',
        async find(db, id) {
            const row = await db.ticket.findUnique({ where: { id }, select: SELECTS.tickets });
            return row && TARGET_MAPPERS.tickets(row);
        },
        async search(db, user, term, take) {
            const rows = await db.ticket.findMany({
                ...listArgs(user, searchWhere(term, 'TKT', 'ticketNumber', ['ticketSubject', 'organizationName', 'contact']), take),
                select: SELECTS.tickets,
            });
            return rows.map(TARGET_MAPPERS.tickets);
        },
    },
    contracts: {
        label: 'contract',
        async find(db, id) {
            const row = await db.contract.findUnique({ where: { id }, select: SELECTS.contracts });
            return row && TARGET_MAPPERS.contracts(row);
        },
        async search(db, user, term, take) {
            const rows = await db.contract.findMany({
                ...listArgs(user, searchWhere(term, 'CTR', 'contractNumber', ['contractTitle', 'organizationName', 'contact']), take),
                select: SELECTS.contracts,
            });
            return rows.map(TARGET_MAPPERS.contracts);
        },
    },
};

/** The picker's shape: a target without the fields only the checks read. */
export function toLinkTarget({ isDeleted: _deleted, createdBy: _createdBy, ...target }: TargetRow): LinkTarget {
    return target;
}

/** `GET /api/activities/link-targets`: live records of one module the caller can access, matching `search`. */
export async function linkTargets(query: LinkTargetsQuery, user: AuthUser): Promise<LinkTarget[]> {
    const rows = await RELATED_LOADERS[query.module].search(prisma, user, query.search || undefined, query.limit);
    return rows.map(toLinkTarget);
}

/** The stored links of an activity being updated. */
export interface PreviousLinks {
    relatedModule: string | null;
    relatedId: string | null;
    relatedTo: string | null;
    relatedCode: string | null;
    organizationId: string | null;
    contactId: string | null;
}

/** Whether the input links another record than the stored one (always true on create when a record is picked). */
export function relatedChanged(input: Pick<ActivityInput, 'relatedModule' | 'relatedId'>, previous: Pick<PreviousLinks, 'relatedModule' | 'relatedId'> | undefined): boolean {
    return (input.relatedModule ?? null) !== (previous?.relatedModule ?? null) || (input.relatedId ?? null) !== (previous?.relatedId ?? null);
}

/**
 * Pure: the organization / contact an activity takes from its related record. Explicit ids in the input win (the
 * service validates them); otherwise a newly picked record fills them; otherwise the typed names stay.
 */
export function linksFromTarget(
    input: Partial<Pick<ActivityInput, 'organizationId' | 'organizationName' | 'contactId' | 'contact'>>,
    picked: LinkTarget | null,
): { organization: ActivityLink | null; contact: ActivityLink | null } {
    const organization =
        !input.organizationId && picked?.organizationName ? { id: picked.organizationId ?? null, name: picked.organizationName } : null;
    const contact = !input.contactId && picked?.contact ? { id: picked.contactId ?? null, name: picked.contact } : null;
    return { organization, contact };
}

/**
 * Resolves the related record and the organization / contact links of a save, inside its transaction.
 *  • A newly picked record must exist, be live and be one the user can access (403 otherwise); its code and label
 *    are stored. An unchanged one is only re-read, to refresh its label (no access check, deleted is fine).
 *  • Organization / contact: explicit ids must reference existing records (`assertReference`); without them a newly
 *    picked record fills them; otherwise the typed organization name links to the live organization of that name
 *    and the contact name to a live contact of it, as on contracts.
 */
export async function resolveActivityLinks(tx: TransactionClient, input: ActivityInput, previous: PreviousLinks | undefined, user: AuthUser): Promise<ActivityLinks> {
    const changed = relatedChanged(input, previous);
    let related: Pick<ActivityLinks, 'relatedModule' | 'relatedId' | 'relatedTo' | 'relatedCode'> = {
        relatedModule: null,
        relatedId: null,
        relatedTo: '',
        relatedCode: '',
    };
    let picked: TargetRow | null = null;
    if (input.relatedModule && input.relatedId) {
        const loader = RELATED_LOADERS[input.relatedModule];
        const found = await loader.find(tx, input.relatedId);
        if (changed) {
            assertReference(found, input.relatedId, undefined, loader.label, 'relatedTo');
            if (!canAccessRecord(user, found)) throw HttpError.forbidden(LINK_FORBIDDEN_MESSAGE);
            picked = found;
        }
        related = found
            ? { relatedModule: input.relatedModule, relatedId: found.id, relatedTo: found.label, relatedCode: found.code }
            : { relatedModule: input.relatedModule, relatedId: input.relatedId, relatedTo: input.relatedTo ?? previous?.relatedTo ?? '', relatedCode: previous?.relatedCode ?? '' };
    }

    const fromTarget = linksFromTarget(input, picked);
    const orgSelect = { id: true, organizationName: true, isDeleted: true } as const;
    let organization: ActivityLink;
    if (input.organizationId) {
        const org = await tx.organization.findUnique({ where: { id: input.organizationId }, select: orgSelect });
        assertReference(org, input.organizationId, previous?.organizationId, 'organization', 'organizationName');
        organization = { id: org.id, name: org.organizationName };
    } else if (fromTarget.organization?.id) {
        organization = fromTarget.organization;
    } else {
        // A lead has an organization name but no link: link it like a typed name.
        const name = fromTarget.organization?.name ?? input.organizationName;
        const org = await findOrganizationByName(tx, name);
        organization = org ? { id: org.id, name: org.organizationName } : { id: null, name: name ?? '' };
    }

    const contactSelect = { id: true, name: true, isDeleted: true } as const;
    let contact: ActivityLink;
    if (input.contactId) {
        const found = await tx.contact.findUnique({ where: { id: input.contactId }, select: contactSelect });
        assertReference(found, input.contactId, previous?.contactId, 'contact', 'contact');
        contact = { id: found.id, name: found.name };
    } else if (fromTarget.contact) {
        contact = fromTarget.contact;
    } else if (organization.id && input.contact) {
        const found = await tx.contact.findFirst({ where: { name: input.contact, organizationId: organization.id, isDeleted: false }, select: contactSelect });
        contact = found ? { id: found.id, name: found.name } : { id: null, name: input.contact };
    } else {
        // Without an organization a contact name is too ambiguous to link.
        contact = { id: null, name: input.contact ?? '' };
    }

    return { ...related, organization, contact };
}
