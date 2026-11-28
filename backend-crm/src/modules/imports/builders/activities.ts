import { ENV } from '../../../config/env.js';
import type { TransactionClient } from '../../../config/prisma.js';
import type { Prisma } from '../../../generated/prisma/client.js';
import type { AuthUser } from '../../../types/user.types.js';
import { HttpError } from '../../../utils/httpError.js';
import { assertVideoMeetingAllowed } from '../../activities/activity.conference.js';
import { RELATED_LOADERS, type TargetRow } from '../../activities/activity.links.js';
import type { ActivityRelatedModule } from '../../activities/activity.schedule.js';
import { crmWriter, insertActivityRow, parseCrmCreate, type ActivityCommitRow, type ActivityConfig } from '../../activities/activity.service.js';
import type { ModuleFieldConfig } from '../../form-configs/customFieldValidator.js';
import { buildAccessScopeWhere } from '../../shared/accessControl.js';
import { findOrganizationByName, type PrefetchedLookups } from '../../shared/prefetch.js';
import { buildImportPayload } from '../importValues.js';
import {
    ACTIVITY_IMPORT_ONLY_KEYS,
    activityImportSchedule,
    activityImportStatus,
    defaultFollowupType,
    parseDurationMinutes,
    relatedModuleOf,
} from './activities.values.js';
import { onlyMatch } from './quotations.values.js';

/**
 * Bulk import of activities (POST /api/import/activities). One spreadsheet row is one activity, made the way
 * Activities › New does (ActivityForm, `POST /api/activities`):
 *
 * - Every importable field of the activity form (Form Builder configuration, custom fields included): Followup Type,
 *   Subject, Status, Assigned to, Related To, Organization Name, Contact, Start, End, All Day, Reminder, Location,
 *   Customer Response, Remarks. Video meeting and Attendees are not imported (importValues.ts NOT_IMPORTABLE_FIELDS),
 *   nor are recurring series.
 * - Two import-only cells: **Related To Type** (Lead, Opportunity, Contact, Organization, Quotation, Ticket, Contract)
 *   and **Duration (minutes)** (a timed activity's length when End is blank; else the Followup Type's default).
 * - **Related To** names a live record of that type by its number (`OPP-0042`, or the Document Series format) or its
 *   exact name (lead / contact name, opportunity name, organization name, quotation title, ticket subject, contract
 *   title), among the records the importer may view. The type may be left blank when the cell is a record number in
 *   the default `PREFIX-0001` form (`OPP-0042` → Opportunity); a number in a custom Document Series format is found
 *   only with its type, since the type can't be told from it.
 *   The record brings its organization and contact, as picking it on the form does: blank Organization Name / Contact
 *   cells take them, so a required field is met by the record.
 * - **Organization Name** names a live organization (exact name); **Contact** a live contact of the row's (or the
 *   related record's) organization. A name that matches nothing, or several records, fails the row. Without any
 *   organization a contact is kept as typed, unlinked (as the create API does).
 * - Blank cells (ACTIVITY_IMPORT_DEFAULTS in activities.values.ts): Followup Type = the dropdown's default option;
 *   Status = Planned, or Completed when the Start has passed; Assigned to = the importing user. All Day Yes, or a Start
 *   without a time, makes an all-day activity.
 *
 * Each row runs the create path's checks (`parseCrmCreate`: request schema, the admin's form rules, schedule, Planned
 * not in the past; then the video meeting rule) and is saved with `insertActivityRow` and the CRM writer, as
 * `activityService.create` does: owner check, related record access, links, reminder, CREATE audit entry, the calendar
 * write hook. Its write returns the committed row as `followUpRows` with `notify: false`, so the processor's
 * `afterFollowUpCommit` arms the reminders, wakes the calendar push and invalidates the activity caches after the rows,
 * without telling owners about each imported activity. Custom dates before today are accepted (historical data).
 */

/** Per-import data of an activities import, loaded once before the row loop. */
export interface ActivityImportContext {
    fieldConfig: ModuleFieldConfig;
    lookups: PrefetchedLookups;
    /** The activity configuration (`loadActivityConfig`): field rules and the Followup Type durations. */
    activityConfig: ActivityConfig;
}

/** What an activity row's write returns: the committed activity, for the processor's post-commit pass. */
export interface ActivityImportWrite {
    followUpRows: ActivityCommitRow[];
}

const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

/** Number and name columns a Related To cell is matched against, per module. */
const RELATED_COLUMNS: Readonly<Record<ActivityRelatedModule, { code: string; name: string; plural: string }>> = {
    leads: { code: 'leadCode', name: 'name', plural: 'leads' },
    opportunities: { code: 'opportunityCode', name: 'opportunityName', plural: 'opportunities' },
    contacts: { code: 'contactCode', name: 'name', plural: 'contacts' },
    organizations: { code: 'accountCode', name: 'organizationName', plural: 'organizations' },
    quotations: { code: 'quotationCode', name: 'quotationTitle', plural: 'quotations' },
    tickets: { code: 'ticketNumber', name: 'ticketSubject', plural: 'tickets' },
    contracts: { code: 'contractNumber', name: 'contractTitle', plural: 'contracts' },
};

/** Ids of up to two live records of `module` matching `where`. */
function findIds(tx: TransactionClient, module: ActivityRelatedModule, where: Record<string, unknown>): Promise<{ id: string }[]> {
    const args = { where: { ...where, isDeleted: false }, select: { id: true }, take: 2 } as const;
    switch (module) {
        case 'leads':
            return tx.lead.findMany({ ...args, where: args.where as Prisma.LeadWhereInput });
        case 'opportunities':
            return tx.opportunity.findMany({ ...args, where: args.where as Prisma.OpportunityWhereInput });
        case 'contacts':
            return tx.contact.findMany({ ...args, where: args.where as Prisma.ContactWhereInput });
        case 'organizations':
            return tx.organization.findMany({ ...args, where: args.where as Prisma.OrganizationWhereInput });
        case 'quotations':
            return tx.quotation.findMany({ ...args, where: args.where as Prisma.QuotationWhereInput });
        case 'tickets':
            return tx.ticket.findMany({ ...args, where: args.where as Prisma.TicketWhereInput });
        case 'contracts':
            return tx.contract.findMany({ ...args, where: args.where as Prisma.ContractWhereInput });
    }
}

/**
 * The live record a Related To cell names: by number first (any record; the save refuses one the importer may not
 * view), else by exact name among the records the importer may view, as the form's picker lists them.
 */
async function findRelated(tx: TransactionClient, user: AuthUser, module: ActivityRelatedModule, cell: string): Promise<TargetRow> {
    const columns = RELATED_COLUMNS[module];
    const loader = RELATED_LOADERS[module];
    const label = loader.label.charAt(0).toUpperCase() + loader.label.slice(1);
    const byCode = await findIds(tx, module, { [columns.code]: cell });
    const matches = byCode.length === 1 ? byCode : await findIds(tx, module, { [columns.name]: cell, AND: [buildAccessScopeWhere(user, 'assignedTo', module, 'view')] });
    const { id } = onlyMatch(matches, { label, plural: columns.plural, hint: `give its ${label} number instead.`, path: 'relatedTo' }, cell);
    const found = await loader.find(tx, id);
    if (!found) throw HttpError.badRequest(`${label} '${cell}' was not found.`, [{ path: ['relatedTo'], message: `${label} '${cell}' was not found.` }]);
    return found;
}

/** The live contact named `cell` at the organization `organization`. */
async function findContact(tx: TransactionClient, cell: string, organization: { id: string; name: string }) {
    const matches = await tx.contact.findMany({ where: { name: cell, organizationId: organization.id, isDeleted: false }, select: { id: true, name: true }, take: 2 });
    if (matches.length === 0) {
        const message = `Contact '${cell}' was not found at organization '${organization.name}'.`;
        throw HttpError.badRequest(message, [{ path: ['contact'], message }]);
    }
    return onlyMatch(matches, { label: 'Contact', plural: 'contacts', hint: 'link the contact on the activity after the import.', path: 'contact' }, cell);
}

/**
 * Reads an activities import row and returns its write. Cells that can't be read (an unknown option, a bad date or
 * duration, an unknown Related To Type) fail here; the linked records are looked up inside the write, where the row is
 * checked with the create API's rules and saved.
 */
export function buildActivityImportRow(
    values: Record<string, string>,
    user: AuthUser,
    ctx: ActivityImportContext,
): (tx: TransactionClient) => Promise<ActivityImportWrite> {
    const timeZone = ENV.BUSINESS_TIMEZONE;
    const config = ctx.activityConfig;
    const { payload, customFields } = buildImportPayload(ctx.fieldConfig, values);
    const followupType = text(payload.followupType) || defaultFollowupType(config.followupTypes);
    const duration = parseDurationMinutes(values[ACTIVITY_IMPORT_ONLY_KEYS.durationMinutes]);
    const schedule = activityImportSchedule(payload, followupType, duration, timeZone);
    const status = activityImportStatus(payload.status, schedule, new Date(), timeZone);
    const relatedCell = text(payload.relatedTo);
    const relatedModule = relatedModuleOf(values[ACTIVITY_IMPORT_ONLY_KEYS.relatedModule], relatedCell);
    const organizationCell = text(payload.organizationName);
    const contactCell = text(payload.contact);
    const body: Record<string, unknown> = {
        ...payload,
        followupType,
        status,
        assignedTo: text(payload.assignedTo) || user.username,
        // An all-day row sends its days only; a timed row its instants only (never the cells' wall clocks).
        allDay: schedule.allDay,
        startAt: schedule.startAt,
        endAt: schedule.endAt,
        startDay: schedule.startDay,
        endDay: schedule.endDay,
        relatedTo: undefined,
        organizationName: undefined,
        contact: undefined,
        customFields,
    };

    return async (tx) => {
        const related = relatedModule ? await findRelated(tx, user, relatedModule, relatedCell) : null;
        let organization: { id: string; name: string } | null = null;
        if (organizationCell) {
            const found = await findOrganizationByName(tx, organizationCell, ctx.lookups);
            const org = onlyMatch(found ? [found] : [], { label: 'Organization', plural: 'organizations', hint: '', path: 'organizationName' }, organizationCell);
            organization = { id: org.id, name: org.organizationName };
        }
        // A contact is looked up at the row's organization, else at the related record's (which the save links).
        const contactOrg = organization ?? (related?.organizationId ? { id: related.organizationId, name: related.organizationName } : null);
        const contact = contactCell && contactOrg ? await findContact(tx, contactCell, contactOrg) : null;
        // Blank Organization Name / Contact cells take the related record's, as picking it on the form pre-fills them,
        // so a required field is met by the record (its contact only while the row keeps the record's organization).
        const relatedOrg = !organization && related?.organizationName ? { organizationId: related.organizationId, organizationName: related.organizationName } : {};
        const sameOrg = !organization || (related?.organizationId !== undefined && organization.id === related.organizationId);
        const relatedContact = !contactCell && sameOrg && related?.contact ? { contactId: related.contactId, contact: related.contact } : {};

        const { input, schedule: stored, now } = parseCrmCreate(
            {
                ...body,
                ...(related ? { relatedModule, relatedId: related.id, relatedTo: related.label } : {}),
                ...relatedOrg,
                ...relatedContact,
                ...(organization ? { organizationId: organization.id, organizationName: organization.name } : {}),
                // A contact named without any organization is kept as typed (the create API leaves it unlinked).
                ...(contact ? { contactId: contact.id, contact: contact.name } : contactCell ? { contact: contactCell } : {}),
            },
            config,
            { allowPastDates: true },
        );
        await assertVideoMeetingAllowed(tx, { ...input, assignedTo: input.assignedTo || user.username }, null, config);
        const row = await insertActivityRow(tx, input, stored, crmWriter(user, config), now);
        return { followUpRows: [{ before: null, after: row, notify: false }] };
    };
}
