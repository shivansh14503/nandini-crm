import { mock } from 'node:test';
import { randomBytes } from 'node:crypto';
import { prisma } from '../../../config/prisma.js';
import { configureSecretBox, parseKeyRing, secretBox } from '../../../services/secretBox.js';
import { auditService, type AuditEntry } from '../../../services/audit.service.js';
import { cacheService } from '../../../services/cache.service.js';
import { formConfigService, type FormConfigsPayload } from '../../form-configs/formConfig.service.js';
import { dropProviderCredentialsCache } from '../../integrations/integration.service.js';
import { serviceAccountKeyJson, TEST_CLIENT_ID } from './serviceAccountKey.js';

/**
 * Test double for admin-managed calendar sync (enrolment, calendarAccess, connection.service, the People API): in-memory
 * Users, CalendarConnection, CalendarSyncUser, IntegrationProvider and Notification rows behind the Prisma delegates the
 * code uses, a `$transaction` that rolls the rows back when its callback throws, audits / cache / form-config calls
 * captured. The live-row unique indexes (one live row per user, one per provider + mailbox) are enforced on create.
 * Only the `where` shapes these modules send are understood (anything else throws, so a new query shape is noticed).
 * Not a test file itself (the runner only loads *.test.ts).
 */

export interface UserRow {
    id: number;
    username: string;
    fullName: string;
    email: string | null;
    isActive: boolean;
    isGroupUser: boolean;
    role?: string;
    department?: string | null;
}

export interface ConnectionRowState {
    id: string;
    username: string;
    provider: string;
    accountEmail: string;
    status: string;
    statusReason: string | null;
    source: string;
    calendarId: string;
    syncCursor: string | null;
    syncWindowStart: Date | null;
    syncWindowEnd: Date | null;
    fullSyncAt: Date | null;
    backfilledAt: Date | null;
    backfillCount: number | null;
    lastPulledAt: Date | null;
    lastPushedAt: Date | null;
    lastSuccessAt: Date | null;
    lastCheckedAt: Date | null;
    nextCheckAt: Date | null;
    lastErrorAt: Date | null;
    lastErrorCode: string | null;
    lastErrorMessage: string | null;
    consecutiveFailures: number;
    leaseId: string | null;
    leaseUntil: Date | null;
    enrolledAt: Date;
    stoppedAt: Date | null;
    stoppedBy: string | null;
    createdAt: Date;
    updatedAt: Date;
}

export interface SyncUserRowState {
    username: string;
    provider: string | null;
    excluded: boolean;
    note: string | null;
    importMeetings: boolean;
    updatedBy: string;
    createdAt: Date;
    updatedAt: Date;
}

export interface NotificationRowState {
    username: string;
    kind: string;
    title: string;
    entityModule: string | null;
    entityId: string | null;
    dedupeKey: string;
}

type Where = Record<string, unknown>;
type Row = Record<string, unknown>;

const LIVE = ['pending', 'ok', 'error'];

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !(value instanceof Date) && !Array.isArray(value);

function valueMatches(actual: unknown, expected: unknown): boolean {
    if (!isObject(expected)) {
        if (actual instanceof Date && expected instanceof Date) return actual.getTime() === expected.getTime();
        if (typeof actual === 'string' && typeof expected === 'string') return actual.toLowerCase() === expected.toLowerCase();
        if (expected === null) return actual === null || actual === undefined;
        return actual === expected;
    }
    for (const [op, operand] of Object.entries(expected)) {
        const cmp = (a: unknown) => (a instanceof Date ? a.getTime() : (a as number));
        switch (op) {
            case 'in':
                if (!(operand as unknown[]).some((v) => valueMatches(actual, v))) return false;
                break;
            case 'not':
                if (valueMatches(actual, operand)) return false;
                break;
            case 'gt':
                if (actual === null || actual === undefined || !(cmp(actual) > cmp(operand))) return false;
                break;
            case 'lte':
                if (actual === null || actual === undefined || !(cmp(actual) <= cmp(operand))) return false;
                break;
            default:
                throw new Error(`connectionDouble: unsupported operator ${op}`);
        }
    }
    return true;
}

export function matchesWhere(row: Row, where: Where = {}): boolean {
    for (const [key, expected] of Object.entries(where)) {
        if (key === 'OR') {
            if (!(expected as Where[]).some((w) => matchesWhere(row, w))) return false;
            continue;
        }
        if (key === 'AND') {
            if (!(expected as Where[]).every((w) => matchesWhere(row, w))) return false;
            continue;
        }
        if (!valueMatches(row[key], expected)) return false;
    }
    return true;
}

const pick = <T extends Row>(row: T, select?: Record<string, boolean>) =>
    select ? (Object.fromEntries(Object.keys(select).filter((k) => select[k]).map((k) => [k, row[k]])) as Partial<T>) : { ...row };

function sortRows<T extends Row>(rows: T[], orderBy?: unknown): T[] {
    const orders = (Array.isArray(orderBy) ? orderBy : orderBy ? [orderBy] : []) as Record<string, 'asc' | 'desc'>[];
    return [...rows].sort((a, b) => {
        for (const order of orders) {
            const [key, dir] = Object.entries(order)[0];
            const av = a[key];
            const bv = b[key];
            const x = av instanceof Date ? av.getTime() : av === null || av === undefined ? -Infinity : (av as string | number);
            const y = bv instanceof Date ? bv.getTime() : bv === null || bv === undefined ? -Infinity : (bv as string | number);
            if (x === y) continue;
            return (x < y ? -1 : 1) * (dir === 'desc' ? -1 : 1);
        }
        return 0;
    });
}

interface ManyArgs {
    where?: Where;
    select?: Record<string, boolean>;
    orderBy?: unknown;
    take?: number;
    skip?: number;
    cursor?: Record<string, unknown>;
}

function findManyOf<T extends Row>(all: T[], { where = {}, select, orderBy, take, skip, cursor }: ManyArgs = {}): Partial<T>[] {
    let rows = sortRows(all.filter((r) => matchesWhere(r, where)), orderBy);
    if (cursor) {
        const [key, value] = Object.entries(cursor)[0];
        const at = rows.findIndex((r) => r[key] === value);
        rows = at < 0 ? [] : rows.slice(at);
    }
    if (skip) rows = rows.slice(skip);
    if (take !== undefined) rows = rows.slice(0, take);
    return rows.map((r) => pick(r, select));
}

export function blankConnection(over: Partial<ConnectionRowState> & Pick<ConnectionRowState, 'id' | 'username' | 'provider' | 'accountEmail'>, now = new Date()): ConnectionRowState {
    return {
        status: 'pending',
        statusReason: null,
        source: 'domain',
        calendarId: 'primary',
        syncCursor: null,
        syncWindowStart: null,
        syncWindowEnd: null,
        fullSyncAt: null,
        backfilledAt: null,
        backfillCount: null,
        lastPulledAt: null,
        lastPushedAt: null,
        lastSuccessAt: null,
        lastCheckedAt: null,
        nextCheckAt: null,
        lastErrorAt: null,
        lastErrorCode: null,
        lastErrorMessage: null,
        consecutiveFailures: 0,
        leaseId: null,
        leaseUntil: null,
        enrolledAt: now,
        stoppedAt: null,
        stoppedBy: null,
        createdAt: now,
        updatedAt: now,
        ...over,
    };
}

export interface DoubleState {
    users: UserRow[];
    connections: ConnectionRowState[];
    syncUsers: SyncUserRowState[];
    providers: Map<string, Row>;
    notifications: NotificationRowState[];
    audits: AuditEntry[];
    /** Application lock keys taken (acquireLocks), in order. */
    locks: string[];
    /** Patterns passed to cacheService.invalidatePattern, in order. */
    cacheInvalidations: string[];
    /** Form-config payload served to loadCalendarSettings (company domains live in moduleSettings.activities.calendarSync). */
    configs: FormConfigsPayload;
}

const DELEGATES = ['user', 'calendarConnection', 'calendarSyncUser', 'integrationProvider', 'notification', 'userPreference', '$transaction'] as const;
const realDelegates = new Map<string, unknown>();

function stub(name: (typeof DELEGATES)[number], fake: unknown): void {
    const client = prisma as unknown as Record<string, unknown>;
    if (!realDelegates.has(name)) realDelegates.set(name, client[name]);
    Object.defineProperty(client, name, { value: fake, configurable: true, writable: true });
}

/** Puts the real delegates back and restores mocks (call in afterEach). */
export function restoreConnectionDouble(): void {
    for (const [name, real] of realDelegates) Object.defineProperty(prisma, name, { value: real, configurable: true, writable: true });
    realDelegates.clear();
    mock.restoreAll();
    dropProviderCredentialsCache();
}

/** A form-config payload whose calendar settings name these company domains. */
export function configsWithDomains(companyDomains: string[]): FormConfigsPayload {
    return {
        categories: [],
        fieldsByModule: {},
        moduleTabs: {},
        moduleSettings: { activities: { calendarSync: { companyDomains } } },
    } as unknown as FormConfigsPayload;
}

/** A fresh encryption key ring (tests call configureSecretBox(null) afterwards). */
export function useTestSecretBox(): void {
    configureSecretBox(parseKeyRing(`k1:${randomBytes(32).toString('base64')}`));
}

/** An IntegrationProvider row for Google with a sealed test service account key (needs useTestSecretBox first). */
export function googleProviderRow(over: Row & { domains?: string[] } = {}): Row {
    const { domains = ['nandiniinfosys.com'], ...rest } = over;
    return {
        provider: 'google',
        enabled: true,
        clientId: TEST_CLIENT_ID,
        secretsEnc: secretBox.seal(JSON.stringify({ serviceAccountKey: serviceAccountKeyJson() }), 'IntegrationProvider:google:secrets'),
        keyId: secretBox.activeKid(),
        secretHintsJson: null,
        settingsJson: JSON.stringify({ domains }),
        clientVersion: 1,
        healthStatus: 'unknown',
        healthCode: null,
        healthAt: null,
        ...rest,
    };
}

/** An IntegrationProvider row for Microsoft with a sealed client secret (needs useTestSecretBox first). */
export function microsoftProviderRow(over: Row & { domains?: string[]; tenantId?: string } = {}): Row {
    const { domains = ['nandiniinfosys.com'], tenantId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', ...rest } = over;
    return {
        provider: 'microsoft',
        enabled: true,
        clientId: '11111111-2222-3333-4444-555555555555',
        secretsEnc: secretBox.seal(JSON.stringify({ clientSecret: 'test-client-secret-value' }), 'IntegrationProvider:microsoft:secrets'),
        keyId: secretBox.activeKid(),
        secretHintsJson: null,
        settingsJson: JSON.stringify({ tenantId, domains }),
        clientVersion: 1,
        healthStatus: 'unknown',
        healthCode: null,
        healthAt: null,
        ...rest,
    };
}

export const P2002 = () => Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });

export function installConnectionDouble(
    seed: { users?: UserRow[]; connections?: ConnectionRowState[]; syncUsers?: Partial<SyncUserRowState>[]; providers?: Row[]; configs?: FormConfigsPayload } = {},
): DoubleState {
    dropProviderCredentialsCache();
    const state: DoubleState = {
        users: (seed.users ?? []).map((u) => ({ ...u })),
        connections: (seed.connections ?? []).map((c) => ({ ...c })),
        syncUsers: (seed.syncUsers ?? []).map((s) => ({
            provider: null,
            excluded: false,
            note: null,
            importMeetings: false,
            updatedBy: 'admin',
            createdAt: new Date(0),
            updatedAt: new Date(0),
            ...s,
            username: String(s.username),
        })),
        providers: new Map((seed.providers ?? []).map((p) => [String(p.provider), { healthStatus: 'unknown', healthCode: null, healthAt: null, clientVersion: 1, ...p }])),
        notifications: [],
        audits: [],
        locks: [],
        cacheInvalidations: [],
        configs: seed.configs ?? configsWithDomains(['nandiniinfosys.com']),
    };

    let clock = 0;
    const touch = () => new Date(Date.UTC(2026, 10, 26, 6, 0, 0) + ++clock);

    const user = {
        findUnique: async ({ where, select }: { where: { id?: number; username?: string }; select?: Record<string, boolean> }) => {
            const row = state.users.find((u) => (where.id !== undefined ? u.id === where.id : u.username.toLowerCase() === String(where.username).toLowerCase()));
            return row ? pick(row as unknown as Row, select) : null;
        },
        findFirst: async ({ where, select }: { where: Where; select?: Record<string, boolean> }) => {
            const row = state.users.find((u) => matchesWhere(u as unknown as Row, where));
            return row ? pick(row as unknown as Row, select) : null;
        },
        findMany: async (args: ManyArgs = {}) => findManyOf(state.users as unknown as Row[], args),
        update: async ({ where, data, select }: { where: { id: number }; data: Partial<UserRow>; select?: Record<string, boolean> }) => {
            const row = state.users.find((u) => u.id === where.id);
            if (!row) throw new Error('user not found');
            Object.assign(row, data);
            return pick(row as unknown as Row, select);
        },
    };

    const clash = (row: Pick<ConnectionRowState, 'id' | 'username' | 'provider' | 'accountEmail' | 'status'>) =>
        LIVE.includes(row.status) &&
        state.connections.some(
            (c) =>
                c.id !== row.id &&
                LIVE.includes(c.status) &&
                (c.username.toLowerCase() === row.username.toLowerCase() || (c.provider === row.provider && c.accountEmail.toLowerCase() === row.accountEmail.toLowerCase())),
        );

    const calendarConnection = {
        findUnique: async ({ where, select }: { where: { id: string }; select?: Record<string, boolean> }) => {
            const row = state.connections.find((c) => c.id === where.id);
            return row ? pick(row as unknown as Row, select) : null;
        },
        findFirst: async ({ where, select, orderBy }: { where: Where; select?: Record<string, boolean>; orderBy?: unknown }) =>
            findManyOf(state.connections as unknown as Row[], { where, select, orderBy, take: 1 })[0] ?? null,
        findMany: async (args: ManyArgs = {}) => findManyOf(state.connections as unknown as Row[], args),
        count: async ({ where = {} }: { where?: Where } = {}) => state.connections.filter((c) => matchesWhere(c as unknown as Row, where)).length,
        create: async ({ data }: { data: Partial<ConnectionRowState> & Pick<ConnectionRowState, 'id' | 'username' | 'provider' | 'accountEmail'> }) => {
            const row = blankConnection({ ...data, updatedAt: touch() } as ConnectionRowState);
            if (clash(row)) throw P2002();
            state.connections.push(row);
            return { ...row };
        },
        update: async ({ where, data }: { where: { id: string }; data: Partial<ConnectionRowState> }) => {
            const row = state.connections.find((c) => c.id === where.id);
            if (!row) throw Object.assign(new Error('Record not found'), { code: 'P2025' });
            if (clash({ ...row, ...data })) throw P2002();
            Object.assign(row, data, { updatedAt: touch() });
            return { ...row };
        },
        updateMany: async ({ where, data }: { where: Where; data: Partial<ConnectionRowState> }) => {
            const rows = state.connections.filter((c) => matchesWhere(c as unknown as Row, where));
            for (const row of rows) Object.assign(row, data, { updatedAt: touch() });
            return { count: rows.length };
        },
    };

    const findSyncUser = (username: string) => state.syncUsers.find((s) => s.username.toLowerCase() === username.toLowerCase());
    const calendarSyncUser = {
        findUnique: async ({ where, select }: { where: { username: string }; select?: Record<string, boolean> }) => {
            const row = findSyncUser(where.username);
            return row ? pick(row as unknown as Row, select) : null;
        },
        findMany: async (args: ManyArgs = {}) => findManyOf(state.syncUsers as unknown as Row[], args),
        upsert: async ({ where, create, update }: { where: { username: string }; create: Partial<SyncUserRowState>; update: Partial<SyncUserRowState> }) => {
            const row = findSyncUser(where.username);
            if (row) {
                Object.assign(row, update, { updatedAt: touch() });
                return { ...row };
            }
            const created: SyncUserRowState = { provider: null, excluded: false, note: null, importMeetings: false, updatedBy: 'system', createdAt: touch(), updatedAt: touch(), ...create, username: where.username };
            state.syncUsers.push(created);
            return { ...created };
        },
        deleteMany: async ({ where }: { where: Where }) => {
            const before = state.syncUsers.length;
            state.syncUsers = state.syncUsers.filter((s) => !matchesWhere(s as unknown as Row, where));
            return { count: before - state.syncUsers.length };
        },
        delete: async ({ where }: { where: { username: string } }) => {
            const row = findSyncUser(where.username);
            if (!row) throw Object.assign(new Error('Record not found'), { code: 'P2025' });
            state.syncUsers = state.syncUsers.filter((s) => s !== row);
            return { ...row };
        },
    };

    const integrationProvider = {
        findUnique: async ({ where, select }: { where: { provider: string }; select?: Record<string, boolean> }) => {
            const row = state.providers.get(where.provider);
            return row ? pick(row, select) : null;
        },
        findMany: async (args: ManyArgs = {}) => findManyOf([...state.providers.values()], args),
        upsert: async ({ where, create, update }: { where: { provider: string }; create: Row; update: Row }) => {
            const existing = state.providers.get(where.provider);
            const row: Row = existing
                ? { ...existing, ...update, updatedAt: touch() }
                : { enabled: false, clientId: null, secretsEnc: null, keyId: null, secretHintsJson: null, settingsJson: null, clientVersion: 1, lastTestAt: null, lastTestOk: null, lastTestMessage: null, healthStatus: 'unknown', healthCode: null, healthAt: null, updatedBy: null, createdAt: touch(), updatedAt: touch(), ...create };
            state.providers.set(where.provider, row);
            return { ...row };
        },
        update: async ({ where, data }: { where: { provider: string }; data: Row }) => {
            const existing = state.providers.get(where.provider);
            if (!existing) throw Object.assign(new Error('Record not found'), { code: 'P2025' });
            Object.assign(existing, data, { updatedAt: touch() });
            return { ...existing };
        },
        updateMany: async ({ where, data }: { where: Where; data: Row }) => {
            const rows = [...state.providers.values()].filter((p) => matchesWhere(p, where));
            for (const row of rows) Object.assign(row, data);
            return { count: rows.length };
        },
    };

    const notification = {
        findMany: async ({ where }: { where: { dedupeKey: { in: string[] } } }) =>
            state.notifications.filter((n) => where.dedupeKey.in.some((k) => k.toLowerCase() === n.dedupeKey.toLowerCase())).map((n) => ({ dedupeKey: n.dedupeKey })),
        createMany: async ({ data }: { data: NotificationRowState[] }) => {
            state.notifications.push(...data.map((d) => ({ username: d.username, kind: d.kind, title: d.title, entityModule: d.entityModule, entityId: d.entityId, dedupeKey: d.dedupeKey })));
            return { count: data.length };
        },
        create: async ({ data }: { data: NotificationRowState }) => {
            state.notifications.push({ ...data });
            return data;
        },
    };

    const takeSnapshot = () => ({
        users: state.users.map((u) => ({ ...u })),
        connections: state.connections.map((c) => ({ ...c })),
        syncUsers: state.syncUsers.map((s) => ({ ...s })),
        audits: [...state.audits],
    });

    const transactionClient = () => ({
        user,
        calendarConnection,
        calendarSyncUser,
        integrationProvider,
        notification,
        $queryRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
            void strings;
            // acquireLocks passes its keys as one JSON array of `crm:<key>` resources.
            for (const value of values) {
                if (typeof value !== 'string' || !value.startsWith('[')) continue;
                for (const key of JSON.parse(value) as string[]) state.locks.push(key.replace(/^crm:/, ''));
            }
            return [{ result: 0 }];
        },
    });

    stub('$transaction', async (fn: (tx: unknown) => Promise<unknown>) => {
        const snapshot = takeSnapshot();
        try {
            return await fn(transactionClient());
        } catch (err) {
            state.users = snapshot.users;
            state.connections = snapshot.connections;
            state.syncUsers = snapshot.syncUsers;
            state.audits = snapshot.audits;
            throw err;
        }
    });
    stub('user', user);
    stub('calendarConnection', calendarConnection);
    stub('calendarSyncUser', calendarSyncUser);
    stub('integrationProvider', integrationProvider);
    stub('notification', notification);
    stub('userPreference', { findMany: async () => [] });

    mock.method(auditService, 'record', async (_tx: unknown, entry: AuditEntry) => {
        state.audits.push(entry);
    });
    mock.method(cacheService, 'invalidate', async () => undefined);
    mock.method(cacheService, 'invalidatePattern', async (pattern: string) => {
        state.cacheInvalidations.push(pattern);
    });
    mock.method(formConfigService, 'getAllConfigs', async () => state.configs);
    return state;
}
