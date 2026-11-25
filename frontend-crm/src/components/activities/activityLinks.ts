import { ROUTES } from '@/config/constants';
import { ACTIVITY_RELATED_MODULE_LABELS, isActivityRelatedModule, type ActivityLinkTarget, type ActivityRelatedModule } from '@/types/activity.types';
import type { RecordActivitiesContext } from '@/components/common/Drawer/types';
import { opportunityLabel } from '@/utils/opportunityLabel';

const DETAIL_ROUTES: Readonly<Record<ActivityRelatedModule, (id: string) => string>> = {
    leads: ROUTES.LEAD_DETAIL,
    opportunities: ROUTES.OPPORTUNITY_DETAIL,
    contacts: ROUTES.CONTACT_DETAIL,
    organizations: ROUTES.ORGANIZATION_DETAIL,
    quotations: ROUTES.QUOTATION_DETAIL,
    tickets: ROUTES.TICKET_DETAIL,
    contracts: ROUTES.CONTRACT_DETAIL,
};

const EDIT_ROUTES: Readonly<Record<ActivityRelatedModule, (id: string) => string>> = {
    leads: ROUTES.LEAD_EDIT,
    opportunities: ROUTES.OPPORTUNITY_EDIT,
    contacts: ROUTES.CONTACT_EDIT,
    organizations: ROUTES.ORGANIZATION_EDIT,
    quotations: ROUTES.QUOTATION_EDIT,
    tickets: ROUTES.TICKET_EDIT,
    contracts: ROUTES.CONTRACT_EDIT,
};

/** Full page of an activity's related record ('' when the module isn't one an activity links to). */
export function relatedRecordHref(module: string | null | undefined, id: string | null | undefined): string {
    return isActivityRelatedModule(module) && id ? DETAIL_ROUTES[module](id) : '';
}

/** Edit page of a related record. */
export function relatedRecordEditHref(module: ActivityRelatedModule, id: string): string {
    return EDIT_ROUTES[module](id);
}

/** `Lead` / `Opportunity` … for a related module ('' for none). */
export const relatedModuleLabel = (module: string | null | undefined): string =>
    isActivityRelatedModule(module) ? ACTIVITY_RELATED_MODULE_LABELS[module] : '';

/** What `/activities/new` reads from its query string to prefill a new activity. */
export interface NewActivityQuery {
    type?: string;
    relatedModule?: ActivityRelatedModule | '';
    relatedId?: string;
    /** Business wall clock (`YYYY-MM-DDTHH:mm`) or, all-day, the first day. */
    start?: string;
    /** Business wall clock or, all-day, the last day (inclusive). */
    end?: string;
    allDay?: boolean;
}

/** `/activities/new?type=…&relatedModule=…&relatedId=…&start=…&end=…&allDay=1` (empty values left out). */
export function newActivityHref(query: NewActivityQuery = {}): string {
    const params = new URLSearchParams();
    if (query.type) params.set('type', query.type);
    if (query.relatedModule && query.relatedId) {
        params.set('relatedModule', query.relatedModule);
        params.set('relatedId', query.relatedId);
    }
    if (query.start) params.set('start', query.start);
    if (query.end) params.set('end', query.end);
    if (query.allDay) params.set('allDay', '1');
    const search = params.toString();
    return search ? `${ROUTES.ACTIVITY_NEW}?${search}` : ROUTES.ACTIVITY_NEW;
}

type AnyRecord = Record<string, unknown> & { id: string };

const text = (value: unknown) => (typeof value === 'string' ? value : '');

/**
 * A record as an activity links to it (code, label, organization, contact), worked out as the API does
 * (backend-crm modules/activities activity.links.ts), so a prefilled Related To reads like a picked one.
 */
export function toLinkTarget(module: ActivityRelatedModule, record: AnyRecord): ActivityLinkTarget {
    const base = {
        module,
        id: record.id,
        organizationName: text(record.organizationName),
        organizationId: text(record.organizationId) || undefined,
        contact: text(record.contact),
        contactId: text(record.contactId) || undefined,
        assignedTo: text(record.assignedTo),
    };
    switch (module) {
        case 'leads':
            return { ...base, code: text(record.leadCode), label: text(record.name), contact: '', contactId: undefined };
        case 'opportunities':
            return {
                ...base,
                code: text(record.opportunityCode),
                label: opportunityLabel(record as unknown as Parameters<typeof opportunityLabel>[0]),
            };
        case 'contacts':
            return { ...base, code: text(record.contactCode), label: text(record.name), contact: text(record.name), contactId: record.id };
        case 'organizations':
            return { ...base, code: text(record.accountCode), label: text(record.organizationName), organizationId: record.id, contact: '', contactId: undefined };
        case 'quotations':
            return { ...base, code: text(record.quotationCode), label: text(record.quotationTitle) };
        case 'tickets':
            return { ...base, code: text(record.ticketNumber), label: text(record.ticketSubject) || text(record.organizationName) };
        case 'contracts':
            return { ...base, code: text(record.contractNumber), label: text(record.contractTitle) || text(record.organizationName) };
    }
}

/**
 * A record drawer's Activities tab context (`<EntityDetailDrawer activities={…}>`): the record as an activity links to
 * it, plus a lead's or opportunity's current next follow-up.
 */
export function recordActivitiesContext(module: ActivityRelatedModule, row: { id: string }): RecordActivitiesContext {
    const record = row as unknown as AnyRecord;
    const t = toLinkTarget(module, record);
    const date = text(record.nextFollowupDate).slice(0, 10);
    return {
        module,
        id: record.id,
        label: t.label,
        code: t.code || undefined,
        organizationId: t.organizationId,
        organizationName: t.organizationName || undefined,
        contactId: t.contactId,
        contact: t.contact || undefined,
        ...((module === 'leads' || module === 'opportunities') &&
            date && {
                nextFollowUp: {
                    date,
                    time: text(record.nextFollowupTime) || undefined,
                    type: text(record.followupType) || undefined,
                    editHref: relatedRecordEditHref(module, record.id),
                },
            }),
    };
}
