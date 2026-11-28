import { ENV } from '../../../config/env.js';
import type { TransactionClient } from '../../../config/prisma.js';
import type { AuthUser } from '../../../types/user.types.js';
import { HttpError } from '../../../utils/httpError.js';
import { wallClockNow } from '../../../utils/mappers.js';
import { assertNotInPast } from '../../../validators/notInPast.js';
import { createContractRecord } from '../../contracts/contract.service.js';
import { contractInputSchema, contractPastChecks } from '../../contracts/contract.validator.js';
import type { ContractDto } from '../../contracts/contract.mapper.js';
import type { ModuleFieldConfig } from '../../form-configs/customFieldValidator.js';
import { opportunityLabel } from '../../shared/opportunityLabel.js';
import { findOrganizationByName, type PrefetchedLookups } from '../../shared/prefetch.js';
import { buildImportPayload } from '../importValues.js';
import { contractDropdownDefaults, contractEndDate, reminderCell, renewalReminderFor, type ContractDropdownDefaults } from './contracts.values.js';
import { onlyMatch } from './quotations.values.js';

/**
 * Bulk import of contracts (POST /api/import/contracts). One spreadsheet row is one contract, made the way Contracts ›
 * New does (ContractForm):
 *
 * - **Organization Name** names a live organization (exact name); **Contact Person** a live contact of that
 *   organization; **Opportunity** (optional) an opportunity by its number (`OPP-0042`) or its exact name. A name that
 *   matches nothing, or several records, fails the row with a message naming the cell. (Only when the organization
 *   comes from an opportunity whose organization is no longer on file are both kept as typed names, unlinked.)
 * - An Opportunity brings what picking it on the form brings: its organization, its contact and (when blank) its Tally
 *   Serial Number. An Opportunity of another organization than the row's fails the row.
 * - Blank cells take what the form pre-fills: Contract Title, Status, Contract Period and Contract Type from the
 *   admin's dropdown defaults (Status else "Not Started"); Contract Manager = the importing user; Start Date = today;
 *   End Date = Start Date + the Contract Period (one year when it names no length); Renewal Reminder = 15 days before
 *   the End Date at 11:00, left blank when that moment has passed.
 *
 * The record is saved with createContractRecord, as the create API does: CTR number, Contract Manager check, links,
 * CREATE audit entry. Imports carry historical data, so a Start / End / Bill Date before today is accepted; a Renewal
 * Reminder Date in the past is refused, as on the form (it would remind nobody). Contracts send no notifications on
 * create, and their renewal reminders are found by the reminder scan, so nothing runs after the commit besides the
 * processor's cache invalidation.
 */

/** Per-import data of a contracts import, loaded once before the row loop. */
export interface ContractImportContext {
    fieldConfig: ModuleFieldConfig;
    lookups: PrefetchedLookups;
    dropdownDefaults: ContractDropdownDefaults;
}

/**
 * The admin's dropdown defaults of the contract form. Read from the cached form configuration, so call it before the
 * row loop, never inside a row's transaction.
 */
export async function loadContractDropdownDefaults(): Promise<ContractDropdownDefaults> {
    const { formConfigService } = await import('../../form-configs/formConfig.service.js');
    return contractDropdownDefaults(await formConfigService.getAllConfigs(true));
}

type CheckRow = (raw: Record<string, unknown>, customFields: Record<string, unknown>) => Record<string, unknown>;

const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');
const firstOf = (...values: unknown[]): string => values.map(text).find(Boolean) ?? '';
const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

const OPPORTUNITY_SELECT = {
    id: true,
    opportunityCode: true,
    opportunityName: true,
    productCategoryJson: true,
    organizationName: true,
    organizationId: true,
    contact: true,
    contactId: true,
    tallySerialNo: true,
} as const;

const CONTACT_SELECT = { id: true, name: true } as const;

/** The live opportunity a row names: by number first, else by its exact name. */
async function findOpportunity(tx: TransactionClient, cell: string) {
    const byCode = await tx.opportunity.findFirst({ where: { opportunityCode: cell, isDeleted: false }, select: OPPORTUNITY_SELECT });
    if (byCode) return byCode;
    const byName = await tx.opportunity.findMany({ where: { opportunityName: cell, isDeleted: false }, select: OPPORTUNITY_SELECT, take: 2 });
    return onlyMatch(byName, { label: 'Opportunity', plural: 'opportunities', hint: 'give its Opportunity number instead.', path: 'opportunity' }, cell);
}

type ImportedOpportunity = Awaited<ReturnType<typeof findOpportunity>>;

interface RowLink {
    id?: string;
    name: string;
}

/**
 * The row's organization: the one it names (must exist), else the opportunity's (linked when it is still live, else
 * kept by name as the create API does). Null when neither gives one.
 */
async function findOrganization(tx: TransactionClient, cell: string, opportunity: ImportedOpportunity | null, lookups: PrefetchedLookups): Promise<RowLink | null> {
    if (cell) {
        const found = await findOrganizationByName(tx, cell, lookups);
        const org = onlyMatch(found ? [found] : [], { label: 'Organization', plural: 'organizations', hint: '', path: 'organizationName' }, cell);
        if (opportunity && !opportunityInOrganization(opportunity, { id: org.id, name: org.organizationName })) {
            const message = `Opportunity '${opportunityLabel(opportunity)}' belongs to organization '${opportunity.organizationName}', not '${org.organizationName}'.`;
            throw HttpError.badRequest(message, [{ path: ['opportunity'], message }]);
        }
        return { id: org.id, name: org.organizationName };
    }
    if (!opportunity?.organizationName) return null;
    if (opportunity.organizationId) {
        const linked = await tx.organization.findFirst({ where: { id: opportunity.organizationId, isDeleted: false }, select: { id: true, organizationName: true } });
        if (linked) return { id: linked.id, name: linked.organizationName };
    }
    return { name: opportunity.organizationName };
}

/** Whether the opportunity is on file under `org`: by id when it has one, else by name (as the form decides). */
const opportunityInOrganization = (opportunity: ImportedOpportunity, org: { id: string; name: string }) =>
    opportunity.organizationId ? opportunity.organizationId === org.id : sameName(opportunity.organizationName, org.name);

/**
 * The row's contact: the one it names, among the organization's live contacts when the organization is on file (any
 * live contact otherwise), else the opportunity's. Null when neither gives one.
 */
async function findContact(tx: TransactionClient, cell: string, opportunity: ImportedOpportunity | null, organization: RowLink | null): Promise<RowLink | null> {
    if (cell) {
        // Without an organization on file a contact name is too ambiguous to link (as the create API decides).
        if (!organization?.id) return { name: cell };
        const matches = await tx.contact.findMany({ where: { name: cell, isDeleted: false, organizationId: organization.id }, select: CONTACT_SELECT, take: 2 });
        if (matches.length === 0) {
            const message = `Contact '${cell}' was not found at organization '${organization.name}'.`;
            throw HttpError.badRequest(message, [{ path: ['contact'], message }]);
        }
        const contact = onlyMatch(matches, { label: 'Contact', plural: 'contacts', hint: 'link the contact on the contract after the import.', path: 'contact' }, cell);
        return { id: contact.id, name: contact.name };
    }
    if (!opportunity?.contact) return null;
    if (opportunity.contactId) {
        const linked = await tx.contact.findFirst({ where: { id: opportunity.contactId, isDeleted: false }, select: CONTACT_SELECT });
        if (linked) return { id: linked.id, name: linked.name };
    }
    return { name: opportunity.contact };
}

/**
 * Reads a contracts import row and returns its write. Cells that can't be read fail here; the linked records are
 * looked up inside the write, where the row is checked against the creation form's rules and saved with
 * createContractRecord.
 */
export function buildContractImportRow(
    values: Record<string, string>,
    user: AuthUser,
    ctx: ContractImportContext,
    checkRow: CheckRow,
): (tx: TransactionClient) => Promise<ContractDto> {
    const { payload, customFields } = buildImportPayload(ctx.fieldConfig, values);
    const defaults = ctx.dropdownDefaults;
    const now = wallClockNow(ENV.BUSINESS_TIMEZONE).toISOString().slice(0, 16);

    // The term the form fills in: Start today, End after the period, Reminder 15 days before the End.
    const startDate = firstOf(payload.startDate) || now.slice(0, 10);
    const contractPeriod = firstOf(payload.contractPeriod, defaults.contractPeriod);
    const endDate = firstOf(payload.endDate) || contractEndDate(startDate, contractPeriod);
    const renewalReminderDate = reminderCell(payload.renewalReminderDate) || renewalReminderFor(endDate, now);
    const contractType = Array.isArray(payload.contractType) && payload.contractType.length ? payload.contractType : defaults.contractType;

    return async (tx) => {
        const opportunityCell = text(payload.opportunity);
        const opportunity = opportunityCell ? await findOpportunity(tx, opportunityCell) : null;
        const organization = await findOrganization(tx, text(payload.organizationName), opportunity, ctx.lookups);
        const contact = await findContact(tx, text(payload.contact), opportunity, organization);

        const raw: Record<string, unknown> = {
            ...payload,
            contractTitle: firstOf(payload.contractTitle, defaults.contractTitle),
            status: firstOf(payload.status, defaults.status),
            assignedTo: firstOf(payload.assignedTo, user.username),
            organizationName: organization?.name ?? '',
            organizationId: organization?.id,
            contact: contact?.name ?? '',
            contactId: contact?.id,
            opportunity: opportunity ? opportunityLabel(opportunity) : undefined,
            opportunityId: opportunity?.id,
            tallySerialNo: firstOf(payload.tallySerialNo, opportunity?.tallySerialNo) || undefined,
            startDate,
            endDate: endDate || undefined,
            contractPeriod: contractPeriod || undefined,
            renewalReminderDate: renewalReminderDate || undefined,
            contractType,
            customFields,
        };
        const input = contractInputSchema.parse(raw);
        input.customFields = checkRow(raw, customFields);
        // Historical Start / End / Bill Dates are fine; a reminder can't be set in the past.
        assertNotInPast(contractPastChecks(input).filter((check) => check.path === 'renewalReminderDate'));
        return createContractRecord(tx, input, user, ctx.lookups);
    };
}
