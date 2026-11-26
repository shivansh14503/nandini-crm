import { randomUUID } from 'node:crypto';
import { mock } from 'node:test';
import { prisma } from '../../../config/prisma.js';
import type { Activity, ActivityAttendee, ActivityExternalLink, ActivitySeries } from '../../../generated/prisma/client.js';
import { auditService, type AuditEntry } from '../../../services/audit.service.js';
import { cacheService } from '../../../services/cache.service.js';
import { matchesWhere, type ConnectionRowState, type NotificationRowState } from '../../calendar-sync/testing/connectionDouble.js';
import { formConfigService, type FormConfigsPayload } from '../../form-configs/formConfig.service.js';
import type { ActivityRow } from '../activity.mapper.js';

/**
 * Test double for the activity write paths (activity.service.ts, activity.system.ts): in-memory Activity /
 * ActivityAttendee rows plus the Users, Contact, Organization, Lead and Opportunity rows the saves read, behind the Prisma
 * delegates those paths use; a `$transaction` that rolls every row back when its callback throws; application locks,
 * audits, cache invalidations and form-config loads captured. Only the query shapes those paths send are understood
 * (anything else throws, so a new query shape is noticed). Not a test file itself (the runner only loads *.test.ts).
 *
 * Calendar sync (P2-3b): the write hook's outbox and the push engine read and write CalendarConnection,
 * ActivityExternalLink, IntegrationProvider, EntityEmail and Notification rows; those delegates are here too (not
 * recorded in `calls`), rolled back with the activity rows.
 */

export interface UserRow {
    username: string;
    fullName: string;
    isActive: boolean;
    email?: string | null;
    isGroupUser?: boolean;
}

export interface EntityEmailRow {
    id: string;
    email: string;
    contactId: string | null;
    isPrimary: boolean;
    isInvalidBounce: boolean;
    sortOrder: number;
}

export interface ProviderRow {
    provider: string;
    enabled: boolean;
}

export interface ContactRow {
    id: string;
    name: string;
    organizationId: string | null;
    isDeleted: boolean;
}

export interface OrganizationRow {
    id: string;
    organizationName: string;
    isDeleted: boolean;
}

export interface LeadRow {
    id: string;
    leadCode: string;
    name: string;
    organizationName: string | null;
    assignedTo: string | null;
    createdBy: string;
    isDeleted: boolean;
    /** Calendar write-back (P2-5 rescheduleRecordFromCalendar). */
    nextFollowupDate?: Date | null;
    nextFollowupTime?: string | null;
    updatedBy?: string | null;
    /** A Converted lead keeps its follow-up date (rescheduleRecordFromCalendar). */
    status?: string | null;
}

export interface OpportunityRow {
    id: string;
    opportunityCode: string;
    opportunityName: string | null;
    productCategoryJson: string | null;
    organizationName: string;
    organizationId: string | null;
    contact: string;
    contactId: string | null;
    assignedTo: string | null;
    createdBy: string;
    followupType: string | null;
    salesStage: string;
    nextFollowupDate: Date | null;
    nextFollowupTime: string | null;
    isDeleted: boolean;
}

export interface ActivityDoubleState {
    activities: Activity[];
    attendees: ActivityAttendee[];
    users: UserRow[];
    contacts: ContactRow[];
    organizations: OrganizationRow[];
    leads: LeadRow[];
    opportunities: OpportunityRow[];
    audits: AuditEntry[];
    /** Application lock keys taken (acquireLocks), in order, without the `crm:` prefix. */
    locks: string[];
    /** Entities passed to cacheService.invalidateEntityCaches, in order. */
    invalidated: string[];
    /** Every delegate call as `<model>.<method>`, in order (e.g. to prove a check was skipped). */
    calls: string[];
    /** The transaction client of the open `$transaction`, null outside one. */
    openTx: object | null;
    connections: ConnectionRowState[];
    links: ActivityExternalLink[];
    providers: ProviderRow[];
    entityEmails: EntityEmailRow[];
    notifications: NotificationRowState[];
    /** Recurring series (Calendar Phase 4); rolled back with the activity rows. */
    series: ActivitySeries[];
}

type Where = Record<string, unknown>;


/**
 * Prisma `where` matching (the connection double's: equality case-insensitive on text, instants by time, `in` / `not`
 * / `notIn` / `gt(e)` / `lt(e)`, `OR` / `AND`; anything else throws, so a new query shape is noticed).
 */
function matches(row: Record<string, unknown>, where: Where = {}): boolean {
    return matchesWhere(row, where);
}

/** SQL Server's default collation compares text case-insensitively; instants compare by time. */
const same = (a: unknown, b: unknown) =>
    typeof a === 'string' && typeof b === 'string' ? a.toLowerCase() === b.toLowerCase() : a instanceof Date && b instanceof Date ? a.getTime() === b.getTime() : a === b;

const pick = <T extends object>(row: T, select?: Record<string, unknown>): Partial<T> =>
    select ? (Object.fromEntries(Object.keys(select).filter((key) => select[key]).map((key) => [key, (row as Record<string, unknown>)[key]])) as Partial<T>) : { ...row };

/** A stored activity with every column defaulted as the database would. */
export function blankActivity(over: Partial<Activity> & Pick<Activity, 'id' | 'subject' | 'assignedTo' | 'createdBy'>): Activity {
    const now = new Date('2026-11-20T00:00:00.000Z');
    return {
        followupType: 'Meeting',
        status: 'Planned',
        relatedModule: null,
        relatedId: null,
        relatedTo: null,
        relatedCode: null,
        organizationName: null,
        organizationId: null,
        contact: null,
        contactId: null,
        startAt: null,
        endAt: null,
        allDay: false,
        timeZone: 'Asia/Kolkata',
        location: null,
        reminder: null,
        remindAt: null,
        reminderSentAt: null,
        customerResponse: null,
        remarks: null,
        completedAt: null,
        completedBy: null,
        revision: 0,
        customDataJson: null,
        origin: 'crm',
        iCalUid: null,
        syncKey: null,
        organizerEmail: null,
        organizerName: null,
        externalOrganizer: false,
        externalUpdatedAt: null,
        seriesId: null,
        originalStartAt: null,
        seriesIndex: null,
        seriesException: false,
        conferenceProvider: null,
        conferenceState: null,
        conferenceJoinUrl: null,
        conferenceId: null,
        conferenceError: null,
        conferenceRequest: 0,
        updatedBy: null,
        createdAt: now,
        updatedAt: now,
        isDeleted: false,
        deletedAt: null,
        ...over,
    };
}

/** A stored calendar link with every column defaulted as the database would. */
export function blankLink(over: Partial<ActivityExternalLink> & Pick<ActivityExternalLink, 'activityId' | 'connectionId' | 'provider' | 'requestedId'>): ActivityExternalLink {
    const now = new Date('2026-11-20T00:00:00.000Z');
    return {
        id: randomUUID(),
        role: 'organizer',
        state: 'pending',
        invites: 'send',
        heldAttendeesJson: null,
        generation: 0,
        externalEventId: null,
        externalEventKey: null,
        iCalUid: null,
        etag: null,
        htmlLink: null,
        providerUpdatedAt: null,
        baseJson: null,
        crmSyncedAt: null,
        dirtyAt: null,
        nextAttemptAt: null,
        attempts: 0,
        lastErrorCode: null,
        lastErrorMessage: null,
        lastWarning: null,
        lastConflictAt: null,
        lastSyncedAt: null,
        createdAt: now,
        updatedAt: now,
        ...over,
    };
}

export function blankAttendee(over: Partial<ActivityAttendee> & Pick<ActivityAttendee, 'activityId' | 'kind' | 'name'>): ActivityAttendee {
    return {
        id: randomUUID(),
        username: null,
        contactId: null,
        email: null,
        responseStatus: 'needsAction',
        respondedAt: null,
        sortOrder: 0,
        createdAt: new Date('2026-11-20T00:00:00.000Z'),
        ...over,
    };
}

const DELEGATES = [
    'activity',
    'activityAttendee',
    'user',
    'contact',
    'organization',
    'lead',
    'opportunity',
    'calendarConnection',
    'activityExternalLink',
    'integrationProvider',
    'entityEmail',
    'notification',
    'userPreference',
    'activitySeries',
    'auditLog',
    '$transaction',
] as const;
const realDelegates = new Map<string, unknown>();

function stub(name: (typeof DELEGATES)[number], fake: unknown): void {
    const client = prisma as unknown as Record<string, unknown>;
    if (!realDelegates.has(name)) realDelegates.set(name, client[name]);
    Object.defineProperty(client, name, { value: fake, configurable: true, writable: true });
}

/** Puts the real delegates back and restores mocks (call in afterEach). */
export function restoreActivityDouble(): void {
    for (const [name, real] of realDelegates) Object.defineProperty(prisma, name, { value: real, configurable: true, writable: true });
    realDelegates.clear();
    mock.restoreAll();
}

/** An empty form configuration (no admin fields, no Followup Type list): the module defaults. */
export const EMPTY_CONFIGS = { categories: [], fieldsByModule: {}, moduleTabs: {}, moduleSettings: {} } as unknown as FormConfigsPayload;

export function installActivityDouble(
    seed: {
        activities?: Activity[];
        attendees?: ActivityAttendee[];
        users?: UserRow[];
        contacts?: ContactRow[];
        organizations?: OrganizationRow[];
        leads?: LeadRow[];
        opportunities?: OpportunityRow[];
        configs?: FormConfigsPayload;
        connections?: ConnectionRowState[];
        links?: ActivityExternalLink[];
        providers?: ProviderRow[];
        entityEmails?: EntityEmailRow[];
        series?: ActivitySeries[];
    } = {},
): ActivityDoubleState {
    const state: ActivityDoubleState = {
        activities: (seed.activities ?? []).map((row) => ({ ...row })),
        attendees: (seed.attendees ?? []).map((row) => ({ ...row })),
        users: (seed.users ?? []).map((row) => ({ ...row })),
        contacts: (seed.contacts ?? []).map((row) => ({ ...row })),
        organizations: (seed.organizations ?? []).map((row) => ({ ...row })),
        leads: (seed.leads ?? []).map((row) => ({ ...row })),
        opportunities: (seed.opportunities ?? []).map((row) => ({ ...row })),
        audits: [],
        locks: [],
        invalidated: [],
        calls: [],
        openTx: null,
        connections: (seed.connections ?? []).map((row) => ({ ...row })),
        links: (seed.links ?? []).map((row) => ({ ...row })),
        providers: (seed.providers ?? []).map((row) => ({ ...row })),
        entityEmails: (seed.entityEmails ?? []).map((row) => ({ ...row })),
        notifications: [],
        series: (seed.series ?? []).map((row) => ({ ...row })),
    };

    let clock = 0;
    const touch = () => new Date(Date.UTC(2026, 10, 26, 6, 0, 0) + ++clock);
    const call = (name: string) => state.calls.push(name);

    const withAttendees = (row: Activity): ActivityRow => ({
        ...row,
        attendees: state.attendees
            .filter((attendee) => attendee.activityId === row.id)
            .sort((a, b) => a.sortOrder - b.sortOrder)
            .map((attendee) => ({ ...attendee })),
    });
    const shape = (row: Activity, args: { include?: unknown; select?: Record<string, unknown> }) =>
        args.include ? withAttendees(row) : args.select ? pick(row, args.select) : { ...row };

    /** Applies a Prisma update `data` (incl. `{ increment }`) to a stored row. */
    const applyData = (row: Activity, data: Record<string, unknown>) => {
        for (const [key, value] of Object.entries(data)) {
            if (value !== null && typeof value === 'object' && !(value instanceof Date) && 'increment' in value) {
                (row as unknown as Record<string, number>)[key] += (value as { increment: number }).increment;
            } else {
                (row as unknown as Record<string, unknown>)[key] = value;
            }
        }
        // Like Prisma's @updatedAt: an explicit value wins (the calendar engine keeps updatedAt on its own writes).
        if (!('updatedAt' in data)) row.updatedAt = touch();
    };

    /** Activity `where` plus the `externalLinks: { none | some }` relation filter (Calendar Phase 4's window queries), also inside OR / AND. */
    const matchesActivity = (row: Activity, where: Where = {}): boolean => {
        const { externalLinks, OR, AND, ...rest } = where as Where & { externalLinks?: { none?: Where; some?: Where }; OR?: Where[]; AND?: Where[] };
        // OR / AND branches may carry the relation filter too (sync.conference.ts's stale sweep).
        if (OR && !OR.some((branch) => matchesActivity(row, branch))) return false;
        if (AND && !AND.every((branch) => matchesActivity(row, branch))) return false;
        if (!matches(row as unknown as Record<string, unknown>, rest)) return false;
        if (!externalLinks) return true;
        const own = state.links.filter((l) => l.activityId === row.id);
        if (externalLinks.none) return !own.some((l) => matchesWhere(rec(l), externalLinks.none));
        if (externalLinks.some) return own.some((l) => matchesWhere(rec(l), externalLinks.some));
        return true;
    };
    /** UX_Activity_seriesOccurrence: UNIQUE (seriesId, originalStartAt) WHERE seriesId IS NOT NULL, deleted rows included. */
    const assertSeriesSlotsUnique = () => {
        const seen = new Set<string>();
        for (const a of state.activities) {
            if (!a.seriesId) continue;
            const key = `${a.seriesId}|${a.originalStartAt?.getTime() ?? 'null'}`;
            if (seen.has(key)) throw Object.assign(new Error('Unique constraint failed on UX_Activity_seriesOccurrence'), { code: 'P2002' });
            seen.add(key);
        }
    };

    const activity = {
        findFirst: async (args: { where: Where; include?: unknown; select?: Record<string, unknown> }) => {
            call('activity.findFirst');
            const row = state.activities.find((a) => matchesActivity(a, args.where));
            return row ? shape(row, args) : null;
        },
        findUnique: async (args: { where: { id: string }; include?: unknown; select?: Record<string, unknown> }) => {
            call('activity.findUnique');
            const row = state.activities.find((a) => a.id === args.where.id);
            return row ? shape(row, args) : null;
        },
        findUniqueOrThrow: async (args: { where: { id: string }; include?: unknown }) => {
            call('activity.findUniqueOrThrow');
            const row = state.activities.find((a) => a.id === args.where.id);
            if (!row) throw Object.assign(new Error('No record found'), { code: 'P2025' });
            return shape(row, args);
        },
        findMany: async (args: { where: Where; include?: unknown; select?: Record<string, unknown>; orderBy?: unknown; take?: number }) => {
            call('activity.findMany');
            return orderRows(
                state.activities.filter((a) => matchesActivity(a, args.where)),
                args.orderBy,
            )
                .slice(0, args.take ?? undefined)
                .map((row) => shape(row, args));
        },
        create: async (args: { data: Record<string, unknown> & { attendees?: { create: Omit<ActivityAttendee, 'id' | 'activityId' | 'createdAt'>[] } }; include?: unknown }) => {
            call('activity.create');
            const { attendees, ...data } = args.data;
            const stamp = touch();
            const row = blankActivity({ id: randomUUID(), createdAt: stamp, updatedAt: stamp, ...(data as Partial<Activity>) } as Activity);
            // UX_Activity_seriesOccurrence (filtered unique, soft-deleted rows included).
            if (row.seriesId && state.activities.some((a) => a.seriesId === row.seriesId && a.originalStartAt?.getTime() === row.originalStartAt?.getTime())) {
                throw Object.assign(new Error('Unique constraint failed on UX_Activity_seriesOccurrence'), { code: 'P2002' });
            }
            state.activities.push(row);
            for (const attendee of attendees?.create ?? []) state.attendees.push(blankAttendee({ ...attendee, activityId: row.id }));
            return shape(row, args);
        },
        update: async (args: { where: { id: string }; data: Record<string, unknown>; include?: unknown; select?: Record<string, unknown> }) => {
            call('activity.update');
            const row = state.activities.find((a) => a.id === args.where.id);
            if (!row) throw Object.assign(new Error('Record to update not found'), { code: 'P2025' });
            applyData(row, args.data);
            assertSeriesSlotsUnique();
            return shape(row, args);
        },
        updateMany: async (args: { where: Where; data: Record<string, unknown> }) => {
            call('activity.updateMany');
            const rows = state.activities.filter((a) => matches(a as unknown as Record<string, unknown>, args.where));
            for (const row of rows) applyData(row, args.data);
            assertSeriesSlotsUnique();
            return { count: rows.length };
        },
    };

    const activityAttendee = {
        deleteMany: async (args: { where: { id: { in: string[] }; activityId: string } }) => {
            call('activityAttendee.deleteMany');
            const before = state.attendees.length;
            state.attendees = state.attendees.filter((a) => !(args.where.id.in.includes(a.id) && a.activityId === args.where.activityId));
            return { count: before - state.attendees.length };
        },
        update: async (args: { where: { id: string }; data: Partial<ActivityAttendee> }) => {
            call('activityAttendee.update');
            const row = state.attendees.find((a) => a.id === args.where.id);
            if (!row) throw Object.assign(new Error('Record to update not found'), { code: 'P2025' });
            Object.assign(row, args.data);
            return { ...row };
        },
        createMany: async (args: { data: (Omit<ActivityAttendee, 'id' | 'createdAt'> & { activityId: string })[] }) => {
            call('activityAttendee.createMany');
            for (const data of args.data) state.attendees.push(blankAttendee(data));
            return { count: args.data.length };
        },
    };

    const user = {
        findMany: async (args: { where: Where; select?: Record<string, unknown> }) => {
            call('user.findMany');
            return state.users
                .map((u) => ({ isGroupUser: false, ...u }))
                .filter((u) => matches(u as unknown as Record<string, unknown>, args.where))
                .map((u) => pick(u, args.select));
        },
        findFirst: async (args: { where: Where; select?: Record<string, unknown> }) => {
            call('user.findFirst');
            const row = state.users.find((u) => matches(u as unknown as Record<string, unknown>, args.where));
            return row ? pick(row, args.select) : null;
        },
        /** Calendar sync only (the owner's active / group flags); not recorded. */
        findUnique: async (args: { where: { username: string }; select?: Record<string, unknown> }) => {
            const row = state.users.find((u) => same(u.username, args.where.username));
            return row ? pick({ email: null, isGroupUser: false, ...row }, args.select) : null;
        },
    };

    const contact = {
        findMany: async (args: { where: Where; select?: Record<string, unknown> }) => {
            call('contact.findMany');
            return state.contacts.filter((c) => matches(c as unknown as Record<string, unknown>, args.where)).map((c) => pick(c, args.select));
        },
        findUnique: async (args: { where: { id: string }; select?: Record<string, unknown> }) => {
            call('contact.findUnique');
            const row = state.contacts.find((c) => c.id === args.where.id);
            return row ? pick(row, args.select) : null;
        },
        findFirst: async (args: { where: Where; select?: Record<string, unknown> }) => {
            call('contact.findFirst');
            const row = state.contacts.find((c) => matches(c as unknown as Record<string, unknown>, args.where));
            return row ? pick(row, args.select) : null;
        },
    };

    const organization = {
        findUnique: async (args: { where: { id: string }; select?: Record<string, unknown> }) => {
            call('organization.findUnique');
            const row = state.organizations.find((o) => o.id === args.where.id);
            return row ? pick(row, args.select) : null;
        },
        findFirst: async (args: { where: Where; select?: Record<string, unknown> }) => {
            call('organization.findFirst');
            const row = state.organizations.find((o) => matches(o as unknown as Record<string, unknown>, args.where));
            return row ? pick(row, args.select) : null;
        },
    };

    const lead = {
        findUnique: async (args: { where: { id: string }; select?: Record<string, unknown> }) => {
            call('lead.findUnique');
            const row = state.leads.find((l) => l.id === args.where.id);
            return row ? pick({ nextFollowupDate: null, nextFollowupTime: null, ...row }, args.select) : null;
        },
        update: async (args: { where: { id: string }; data: Partial<LeadRow> }) => {
            call('lead.update');
            const row = state.leads.find((l) => l.id === args.where.id);
            if (!row) throw Object.assign(new Error('Record to update not found'), { code: 'P2025' });
            Object.assign(row, args.data);
            return { ...row };
        },
    };

    const opportunity = {
        findUnique: async (args: { where: { id: string }; select?: Record<string, unknown> }) => {
            call('opportunity.findUnique');
            const row = state.opportunities.find((o) => o.id === args.where.id);
            return row ? pick(row, args.select) : null;
        },
        findMany: async (args: { where: Where; select?: Record<string, unknown> }) => {
            call('opportunity.findMany');
            return state.opportunities.filter((o) => matches(o as unknown as Record<string, unknown>, args.where)).map((o) => pick(o, args.select));
        },
        update: async (args: { where: { id: string }; data: Partial<OpportunityRow> }) => {
            call('opportunity.update');
            const row = state.opportunities.find((o) => o.id === args.where.id);
            if (!row) throw Object.assign(new Error('Record to update not found'), { code: 'P2025' });
            Object.assign(row, args.data);
            return { ...row };
        },
    };

    // ── Calendar sync delegates (not recorded in `calls`) ──
    const rec = (row: object) => row as unknown as Record<string, unknown>;
    const orderRows = <T extends object>(rows: T[], orderBy?: unknown): T[] => {
        const orders = (Array.isArray(orderBy) ? orderBy : orderBy ? [orderBy] : []) as Record<string, 'asc' | 'desc'>[];
        return [...rows].sort((a, b) => {
            for (const order of orders) {
                const [key, dir] = Object.entries(order)[0];
                const av = rec(a)[key];
                const bv = rec(b)[key];
                const x = av instanceof Date ? av.getTime() : (av as string | number | null);
                const y = bv instanceof Date ? bv.getTime() : (bv as string | number | null);
                if (x === y) continue;
                if (x === null || x === undefined) return dir === 'desc' ? 1 : -1;
                if (y === null || y === undefined) return dir === 'desc' ? -1 : 1;
                return (x < y ? -1 : 1) * (dir === 'desc' ? -1 : 1);
            }
            return 0;
        });
    };
    type FindArgs = { where?: Where; select?: Record<string, unknown>; orderBy?: unknown; take?: number };
    const findAll = <T extends object>(rows: T[], args: FindArgs = {}) =>
        orderRows(
            rows.filter((r) => matchesWhere(rec(r), args.where)),
            args.orderBy,
        )
            .slice(0, args.take ?? undefined)
            .map((r) => pick(r, args.select));

    const calendarConnection = {
        findFirst: async (args: FindArgs) => findAll(state.connections, { ...args, take: 1 })[0] ?? null,
        findUnique: async (args: { where: { id: string }; select?: Record<string, unknown> }) => {
            const row = state.connections.find((c) => c.id === args.where.id);
            return row ? pick(row, args.select) : null;
        },
        findMany: async (args: FindArgs = {}) => findAll(state.connections, args),
        count: async (args: FindArgs = {}) => state.connections.filter((c) => matchesWhere(rec(c), args.where)).length,
        update: async (args: { where: { id: string }; data: Partial<ConnectionRowState> }) => {
            const row = state.connections.find((c) => c.id === args.where.id);
            if (!row) throw Object.assign(new Error('Record to update not found'), { code: 'P2025' });
            Object.assign(row, args.data, { updatedAt: touch() });
            return { ...row };
        },
        updateMany: async (args: { where: Where; data: Partial<ConnectionRowState> }) => {
            const rows = state.connections.filter((c) => matchesWhere(rec(c), args.where));
            for (const row of rows) Object.assign(row, args.data, { updatedAt: touch() });
            return { count: rows.length };
        },
    };

    const applyLinkData = (row: ActivityExternalLink, data: Record<string, unknown>) => {
        for (const [key, value] of Object.entries(data)) {
            if (value !== null && typeof value === 'object' && !(value instanceof Date) && 'increment' in value) {
                (rec(row) as Record<string, number>)[key] += (value as { increment: number }).increment;
            } else {
                rec(row)[key] = value;
            }
        }
        row.updatedAt = touch();
    };
    const activityExternalLink = {
        findMany: async (args: FindArgs = {}) => findAll(state.links, args),
        findFirst: async (args: FindArgs = {}) => findAll(state.links, { ...args, take: 1 })[0] ?? null,
        findUnique: async (args: { where: { id: string }; select?: Record<string, unknown> }) => {
            const row = state.links.find((l) => l.id === args.where.id);
            return row ? pick(row, args.select) : null;
        },
        count: async (args: FindArgs = {}) => state.links.filter((l) => matchesWhere(rec(l), args.where)).length,
        create: async (args: { data: Partial<ActivityExternalLink> & Pick<ActivityExternalLink, 'activityId' | 'connectionId' | 'provider' | 'requestedId'>; select?: Record<string, unknown> }) => {
            if (state.links.some((l) => l.activityId === args.data.activityId && l.connectionId === args.data.connectionId)) {
                throw Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
            }
            const stamp = touch();
            const row = blankLink({ createdAt: stamp, updatedAt: stamp, ...args.data });
            state.links.push(row);
            return pick(row, args.select);
        },
        update: async (args: { where: { id: string }; data: Record<string, unknown>; select?: Record<string, unknown> }) => {
            const row = state.links.find((l) => l.id === args.where.id);
            if (!row) throw Object.assign(new Error('Record to update not found'), { code: 'P2025' });
            applyLinkData(row, args.data);
            return pick(row, args.select);
        },
        updateMany: async (args: { where: Where; data: Record<string, unknown> }) => {
            const rows = state.links.filter((l) => matchesWhere(rec(l), args.where));
            for (const row of rows) applyLinkData(row, args.data);
            return { count: rows.length };
        },
    };

    const integrationProvider = {
        findUnique: async (args: { where: { provider: string }; select?: Record<string, unknown> }) => {
            const row = state.providers.find((p) => p.provider === args.where.provider);
            return row ? pick(row, args.select) : null;
        },
        findMany: async (args: FindArgs = {}) => findAll(state.providers, args),
    };

    const entityEmail = {
        findMany: async (args: FindArgs = {}) => findAll(state.entityEmails, args),
    };

    const notification = {
        findMany: async (args: { where: { dedupeKey: { in: string[] } } }) =>
            state.notifications.filter((n) => args.where.dedupeKey.in.some((k) => same(k, n.dedupeKey))).map((n) => ({ dedupeKey: n.dedupeKey })),
        createMany: async (args: { data: NotificationRowState[] }) => {
            state.notifications.push(...args.data.map((d) => ({ ...d })));
            return { count: args.data.length };
        },
        create: async (args: { data: NotificationRowState }) => {
            state.notifications.push({ ...args.data });
            return args.data;
        },
    };
    const userPreference = { findMany: async () => [] };

    // ── Recurring series (Calendar Phase 4) ──
    const blankSeries = (data: Partial<ActivitySeries>): ActivitySeries => {
        const stamp = touch();
        return {
            id: randomUUID(),
            assignedTo: '',
            frequency: 'weekly',
            interval: 1,
            weekdays: null,
            monthlyMode: null,
            monthDay: null,
            setPos: null,
            setWeekday: null,
            untilDay: null,
            count: null,
            startDay: '2026-12-01',
            startTime: null,
            allDay: false,
            durationMinutes: 30,
            spanDays: 1,
            timeZone: 'Asia/Kolkata',
            templateJson: '{}',
            materializedThrough: null,
            endedAt: null,
            splitFromId: null,
            revision: 0,
            createdBy: 'system',
            updatedBy: null,
            createdAt: stamp,
            updatedAt: stamp,
            isDeleted: false,
            deletedAt: null,
            ...data,
        };
    };
    const activitySeries = {
        create: async (args: { data: Partial<ActivitySeries> }) => {
            call('activitySeries.create');
            const row = blankSeries(args.data);
            state.series.push(row);
            return { ...row };
        },
        update: async (args: { where: { id: string }; data: Record<string, unknown> }) => {
            call('activitySeries.update');
            const row = state.series.find((s) => s.id === args.where.id);
            if (!row) throw Object.assign(new Error('Record to update not found'), { code: 'P2025' });
            for (const [key, value] of Object.entries(args.data)) {
                if (value !== null && typeof value === 'object' && !(value instanceof Date) && 'increment' in value) {
                    (rec(row) as Record<string, number>)[key] += (value as { increment: number }).increment;
                } else rec(row)[key] = value;
            }
            row.updatedAt = touch();
            return { ...row };
        },
        findFirst: async (args: FindArgs = {}) => {
            call('activitySeries.findFirst');
            return findAll(state.series, { ...args, take: 1 })[0] ?? null;
        },
        findMany: async (args: FindArgs = {}) => {
            call('activitySeries.findMany');
            return findAll(state.series, args);
        },
    };

    // Audit entries as the AuditLog table holds them (id in write order, createdAt from the double's clock), for the
    // nightly window mark's "last CRM write" read.
    const auditStamps = new WeakMap<AuditEntry, { id: number; createdAt: Date }>();
    let auditId = 0;
    const stampAudit = (entry: AuditEntry) => auditStamps.set(entry, { id: ++auditId, createdAt: touch() });
    const auditLog = {
        findMany: async (args: { where?: Where; orderBy?: unknown; select?: Record<string, unknown>; take?: number } = {}) => {
            call('auditLog.findMany');
            const rows = state.audits.map((entry) => ({ ...(entry as unknown as Record<string, unknown>), ...(auditStamps.get(entry) ?? { id: 0, createdAt: new Date(0) }) }));
            const desc = JSON.stringify(args.orderBy ?? '').includes('desc');
            return rows
                .filter((row) => matches(row, args.where))
                .sort((a, b) => (desc ? b.id - a.id : a.id - b.id))
                .slice(0, args.take ?? undefined)
                .map((row) => pick(row, args.select));
        },
    };

    const snapshot = () => ({
        activities: state.activities.map((row) => ({ ...row })),
        attendees: state.attendees.map((row) => ({ ...row })),
        audits: [...state.audits],
        connections: state.connections.map((row) => ({ ...row })),
        links: state.links.map((row) => ({ ...row })),
        series: state.series.map((row) => ({ ...row })),
    });

    stub('$transaction', async (fn: (tx: unknown) => Promise<unknown>) => {
        if (state.openTx) throw new Error('activityDouble: nested $transaction');
        const saved = snapshot();
        const tx = {
            activity,
            activityAttendee,
            user,
            contact,
            organization,
            lead,
            opportunity,
            calendarConnection,
            activityExternalLink,
            integrationProvider,
            entityEmail,
            notification,
            userPreference,
            activitySeries,
            auditLog,
            $queryRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
                void strings;
                // acquireLocks passes its keys as one JSON array of `crm:<key>` resources.
                for (const value of values) {
                    if (typeof value !== 'string' || !value.startsWith('[')) continue;
                    for (const key of JSON.parse(value) as string[]) state.locks.push(key.replace(/^crm:/, ''));
                }
                return [{ result: 0 }];
            },
        };
        state.openTx = tx;
        try {
            return await fn(tx);
        } catch (err) {
            state.activities = saved.activities;
            state.attendees = saved.attendees;
            state.audits = saved.audits;
            state.connections = saved.connections;
            state.links = saved.links;
            state.series = saved.series;
            throw err;
        } finally {
            state.openTx = null;
        }
    });
    stub('activity', activity);
    stub('activityAttendee', activityAttendee);
    stub('user', user);
    stub('contact', contact);
    stub('organization', organization);
    stub('lead', lead);
    stub('opportunity', opportunity);
    stub('calendarConnection', calendarConnection);
    stub('activityExternalLink', activityExternalLink);
    stub('integrationProvider', integrationProvider);
    stub('entityEmail', entityEmail);
    stub('notification', notification);
    stub('userPreference', userPreference);
    stub('activitySeries', activitySeries);
    stub('auditLog', auditLog);

    mock.method(auditService, 'record', async (_tx: unknown, entry: AuditEntry) => {
        stampAudit(entry);
        state.audits.push(entry);
    });
    mock.method(auditService, 'recordMany', async (_tx: unknown, entries: AuditEntry[]) => {
        entries.forEach(stampAudit);
        state.audits.push(...entries);
    });
    mock.method(cacheService, 'invalidateEntityCaches', async (entity: string) => {
        state.invalidated.push(entity);
    });
    const configs = seed.configs ?? EMPTY_CONFIGS;
    mock.method(formConfigService, 'getAllConfigs', async () => configs);
    return state;
}
