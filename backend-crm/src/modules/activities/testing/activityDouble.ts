import { randomUUID } from 'node:crypto';
import { mock } from 'node:test';
import { prisma } from '../../../config/prisma.js';
import type { Activity, ActivityAttendee } from '../../../generated/prisma/client.js';
import { auditService, type AuditEntry } from '../../../services/audit.service.js';
import { cacheService } from '../../../services/cache.service.js';
import { formConfigService, type FormConfigsPayload } from '../../form-configs/formConfig.service.js';
import type { ActivityRow } from '../activity.mapper.js';

/**
 * Test double for the activity write paths (activity.service.ts, activity.system.ts): in-memory Activity /
 * ActivityAttendee rows plus the Users, Contact, Organization and Lead rows the saves read, behind the Prisma
 * delegates those paths use; a `$transaction` that rolls every row back when its callback throws; application locks,
 * audits, cache invalidations and form-config loads captured. Only the query shapes those paths send are understood
 * (anything else throws, so a new query shape is noticed). Not a test file itself (the runner only loads *.test.ts).
 */

export interface UserRow {
    username: string;
    fullName: string;
    isActive: boolean;
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
}

export interface ActivityDoubleState {
    activities: Activity[];
    attendees: ActivityAttendee[];
    users: UserRow[];
    contacts: ContactRow[];
    organizations: OrganizationRow[];
    leads: LeadRow[];
    audits: AuditEntry[];
    /** Application lock keys taken (acquireLocks), in order, without the `crm:` prefix. */
    locks: string[];
    /** Entities passed to cacheService.invalidateEntityCaches, in order. */
    invalidated: string[];
    /** Every delegate call as `<model>.<method>`, in order (e.g. to prove a check was skipped). */
    calls: string[];
    /** The transaction client of the open `$transaction`, null outside one. */
    openTx: object | null;
}

type Where = Record<string, unknown>;

function matches(row: Record<string, unknown>, where: Where = {}): boolean {
    for (const [key, expected] of Object.entries(where)) {
        const actual = row[key];
        if (expected !== null && typeof expected === 'object' && !(expected instanceof Date)) {
            const ops = expected as Record<string, unknown>;
            for (const [op, operand] of Object.entries(ops)) {
                if (op !== 'in') throw new Error(`activityDouble: unsupported operator ${key}.${op}`);
                if (!(operand as unknown[]).some((value) => same(actual, value))) return false;
            }
            continue;
        }
        if (!same(actual, expected)) return false;
    }
    return true;
}

/** SQL Server's default collation compares text case-insensitively. */
const same = (a: unknown, b: unknown) => (typeof a === 'string' && typeof b === 'string' ? a.toLowerCase() === b.toLowerCase() : a === b);

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
        updatedBy: null,
        createdAt: now,
        updatedAt: now,
        isDeleted: false,
        deletedAt: null,
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

const DELEGATES = ['activity', 'activityAttendee', 'user', 'contact', 'organization', 'lead', '$transaction'] as const;
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
        configs?: FormConfigsPayload;
    } = {},
): ActivityDoubleState {
    const state: ActivityDoubleState = {
        activities: (seed.activities ?? []).map((row) => ({ ...row })),
        attendees: (seed.attendees ?? []).map((row) => ({ ...row })),
        users: (seed.users ?? []).map((row) => ({ ...row })),
        contacts: (seed.contacts ?? []).map((row) => ({ ...row })),
        organizations: (seed.organizations ?? []).map((row) => ({ ...row })),
        leads: (seed.leads ?? []).map((row) => ({ ...row })),
        audits: [],
        locks: [],
        invalidated: [],
        calls: [],
        openTx: null,
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
        row.updatedAt = touch();
    };

    const activity = {
        findFirst: async (args: { where: Where; include?: unknown; select?: Record<string, unknown> }) => {
            call('activity.findFirst');
            const row = state.activities.find((a) => matches(a as unknown as Record<string, unknown>, args.where));
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
        findMany: async (args: { where: Where; include?: unknown; select?: Record<string, unknown> }) => {
            call('activity.findMany');
            return state.activities.filter((a) => matches(a as unknown as Record<string, unknown>, args.where)).map((row) => shape(row, args));
        },
        create: async (args: { data: Record<string, unknown> & { attendees?: { create: Omit<ActivityAttendee, 'id' | 'activityId' | 'createdAt'>[] } }; include?: unknown }) => {
            call('activity.create');
            const { attendees, ...data } = args.data;
            const stamp = touch();
            const row = blankActivity({ id: randomUUID(), createdAt: stamp, updatedAt: stamp, ...(data as Partial<Activity>) } as Activity);
            state.activities.push(row);
            for (const attendee of attendees?.create ?? []) state.attendees.push(blankAttendee({ ...attendee, activityId: row.id }));
            return shape(row, args);
        },
        update: async (args: { where: { id: string }; data: Record<string, unknown>; include?: unknown; select?: Record<string, unknown> }) => {
            call('activity.update');
            const row = state.activities.find((a) => a.id === args.where.id);
            if (!row) throw Object.assign(new Error('Record to update not found'), { code: 'P2025' });
            applyData(row, args.data);
            return shape(row, args);
        },
        updateMany: async (args: { where: Where; data: Record<string, unknown> }) => {
            call('activity.updateMany');
            const rows = state.activities.filter((a) => matches(a as unknown as Record<string, unknown>, args.where));
            for (const row of rows) applyData(row, args.data);
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
            return state.users.filter((u) => matches(u as unknown as Record<string, unknown>, args.where)).map((u) => pick(u, args.select));
        },
        findFirst: async (args: { where: Where; select?: Record<string, unknown> }) => {
            call('user.findFirst');
            const row = state.users.find((u) => matches(u as unknown as Record<string, unknown>, args.where));
            return row ? pick(row, args.select) : null;
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
            return row ? pick(row, args.select) : null;
        },
    };

    const snapshot = () => ({
        activities: state.activities.map((row) => ({ ...row })),
        attendees: state.attendees.map((row) => ({ ...row })),
        audits: [...state.audits],
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

    mock.method(auditService, 'record', async (_tx: unknown, entry: AuditEntry) => {
        state.audits.push(entry);
    });
    mock.method(auditService, 'recordMany', async (_tx: unknown, entries: AuditEntry[]) => {
        state.audits.push(...entries);
    });
    mock.method(cacheService, 'invalidateEntityCaches', async (entity: string) => {
        state.invalidated.push(entity);
    });
    const configs = seed.configs ?? EMPTY_CONFIGS;
    mock.method(formConfigService, 'getAllConfigs', async () => configs);
    return state;
}
