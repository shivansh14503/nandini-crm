import { mock } from 'node:test';
import { prisma } from '../../../config/prisma.js';
import { auditService, type AuditEntry } from '../../../services/audit.service.js';
import { cacheService } from '../../../services/cache.service.js';
import { formConfigService, type FormConfigsPayload } from '../../form-configs/formConfig.service.js';

/**
 * Test double for the calendar-connection code (oauth, connectionTokens, connection.service): in-memory Users,
 * CalendarConnection, IntegrationProvider and Notification rows behind the Prisma delegates the code uses, a
 * `$transaction` that rolls the rows back when its callback throws, audits / cache / form-config calls captured.
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
}

export interface ConnectionRowState {
    id: string;
    username: string;
    provider: string;
    kind: string;
    accountEmail: string;
    accountId: string;
    tenantId: string | null;
    status: string;
    statusReason: string | null;
    grantedScopes: string;
    clientVersion: number;
    accessTokenEnc: string | null;
    accessTokenExpiresAt: Date | null;
    refreshTokenEnc: string | null;
    refreshTokenExpiresAt: Date | null;
    keyId: string | null;
    tokenVersion: number;
    calendarId: string;
    importMeetings: boolean;
    syncCursor: string | null;
    syncWindowStart: Date | null;
    syncWindowEnd: Date | null;
    fullSyncAt: Date | null;
    backfilledAt: Date | null;
    backfillCount: number | null;
    lastPulledAt: Date | null;
    lastPushedAt: Date | null;
    lastSuccessAt: Date | null;
    lastErrorAt: Date | null;
    lastErrorCode: string | null;
    consecutiveFailures: number;
    leaseId: string | null;
    leaseUntil: Date | null;
    connectedAt: Date;
    disconnectedAt: Date | null;
    disconnectedBy: string | null;
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

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !(value instanceof Date) && !Array.isArray(value);

function valueMatches(actual: unknown, expected: unknown): boolean {
    if (!isObject(expected)) {
        if (actual instanceof Date && expected instanceof Date) return actual.getTime() === expected.getTime();
        if (typeof actual === 'string' && typeof expected === 'string') return actual.toLowerCase() === expected.toLowerCase();
        return actual === expected;
    }
    for (const [op, operand] of Object.entries(expected)) {
        const cmp = (a: unknown) => (a instanceof Date ? a.getTime() : (a as number));
        switch (op) {
            case 'in':
                if (!(operand as unknown[]).some((v) => valueMatches(actual, v))) return false;
                break;
            case 'not':
                if (operand === null ? actual === null || actual === undefined : valueMatches(actual, operand)) return false;
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

export function matchesWhere(row: Record<string, unknown>, where: Where = {}): boolean {
    for (const [key, expected] of Object.entries(where)) {
        if (key === 'OR') {
            if (!(expected as Where[]).some((w) => matchesWhere(row, w))) return false;
            continue;
        }
        if (!valueMatches(row[key], expected)) return false;
    }
    return true;
}

const pick = <T extends Record<string, unknown>>(row: T, select?: Record<string, boolean>) =>
    select ? (Object.fromEntries(Object.keys(select).filter((k) => select[k]).map((k) => [k, row[k]])) as Partial<T>) : { ...row };

export function blankConnection(over: Partial<ConnectionRowState> & Pick<ConnectionRowState, 'id' | 'username' | 'provider' | 'accountId' | 'accountEmail'>, now = new Date()): ConnectionRowState {
    return {
        kind: 'calendar',
        tenantId: null,
        status: 'active',
        statusReason: null,
        grantedScopes: '',
        clientVersion: 1,
        accessTokenEnc: null,
        accessTokenExpiresAt: null,
        refreshTokenEnc: null,
        refreshTokenExpiresAt: null,
        keyId: null,
        tokenVersion: 0,
        calendarId: 'primary',
        importMeetings: false,
        syncCursor: null,
        syncWindowStart: null,
        syncWindowEnd: null,
        fullSyncAt: null,
        backfilledAt: null,
        backfillCount: null,
        lastPulledAt: null,
        lastPushedAt: null,
        lastSuccessAt: null,
        lastErrorAt: null,
        lastErrorCode: null,
        consecutiveFailures: 0,
        leaseId: null,
        leaseUntil: null,
        connectedAt: now,
        disconnectedAt: null,
        disconnectedBy: null,
        createdAt: now,
        updatedAt: now,
        ...over,
    };
}

export interface DoubleState {
    users: UserRow[];
    connections: ConnectionRowState[];
    providers: Map<string, Record<string, unknown>>;
    notifications: NotificationRowState[];
    audits: AuditEntry[];
    /** Application lock keys taken (acquireLocks), in order. */
    locks: string[];
    /** Patterns passed to cacheService.invalidatePattern, in order. */
    cacheInvalidations: string[];
    /**
     * When true, application locks behave like `sp_getapplock` with a transaction owner: a key held by one open
     * transaction makes another wait until the holder commits or rolls back (re-entrant for the holder). Off by default.
     */
    holdLocks: boolean;
    /** Called after a transaction acquires its lock keys (with holdLocks on), so a test can start a concurrent writer. */
    onLocked?: (keys: string[]) => void;
}

const DELEGATES = ['user', 'calendarConnection', 'integrationProvider', 'notification', '$transaction'] as const;
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
}

export function installConnectionDouble(seed: { users?: UserRow[]; connections?: ConnectionRowState[]; providers?: Record<string, unknown>[]; configs?: FormConfigsPayload } = {}): DoubleState {
    const state: DoubleState = {
        users: (seed.users ?? []).map((u) => ({ ...u })),
        connections: (seed.connections ?? []).map((c) => ({ ...c })),
        providers: new Map((seed.providers ?? []).map((p) => [String(p.provider), { ...p }])),
        notifications: [],
        audits: [],
        locks: [],
        cacheInvalidations: [],
        holdLocks: false,
    };

    const user = {
        findUnique: async ({ where, select }: { where: { id?: number; username?: string }; select?: Record<string, boolean> }) => {
            const row = state.users.find((u) => (where.id !== undefined ? u.id === where.id : u.username.toLowerCase() === String(where.username).toLowerCase()));
            return row ? pick(row as unknown as Record<string, unknown>, select) : null;
        },
        findFirst: async ({ where, select }: { where: Where; select?: Record<string, boolean> }) => {
            const row = state.users.find((u) => matchesWhere(u as unknown as Record<string, unknown>, where));
            return row ? pick(row as unknown as Record<string, unknown>, select) : null;
        },
        findMany: async ({ where = {}, select }: { where?: Where; select?: Record<string, boolean> } = {}) =>
            state.users.filter((u) => matchesWhere(u as unknown as Record<string, unknown>, where)).map((u) => pick(u as unknown as Record<string, unknown>, select)),
        update: async ({ where, data, select }: { where: { id: number }; data: Partial<UserRow>; select?: Record<string, boolean> }) => {
            const row = state.users.find((u) => u.id === where.id);
            if (!row) throw new Error('user not found');
            Object.assign(row, data);
            return pick(row as unknown as Record<string, unknown>, select);
        },
    };

    const sortRows = (rows: ConnectionRowState[], orderBy?: unknown) => {
        const orders = (Array.isArray(orderBy) ? orderBy : orderBy ? [orderBy] : []) as Record<string, 'asc' | 'desc'>[];
        return [...rows].sort((a, b) => {
            for (const order of orders) {
                const [key, dir] = Object.entries(order)[0];
                const av = a[key as keyof ConnectionRowState] as unknown;
                const bv = b[key as keyof ConnectionRowState] as unknown;
                const x = av instanceof Date ? av.getTime() : (av as string | number);
                const y = bv instanceof Date ? bv.getTime() : (bv as string | number);
                if (x === y) continue;
                return (x < y ? -1 : 1) * (dir === 'desc' ? -1 : 1);
            }
            return 0;
        });
    };

    let clock = 0;
    const touch = () => new Date(Date.UTC(2026, 10, 26, 6, 0, 0) + ++clock);

    const calendarConnection = {
        findUnique: async ({ where, select }: { where: { id: string }; select?: Record<string, boolean> }) => {
            const row = state.connections.find((c) => c.id === where.id);
            return row ? pick(row as unknown as Record<string, unknown>, select) : null;
        },
        findFirst: async ({ where, select, orderBy }: { where: Where; select?: Record<string, boolean>; orderBy?: unknown }) => {
            const row = sortRows(state.connections.filter((c) => matchesWhere(c as unknown as Record<string, unknown>, where)), orderBy)[0];
            return row ? pick(row as unknown as Record<string, unknown>, select) : null;
        },
        findMany: async ({ where = {}, select, orderBy, take }: { where?: Where; select?: Record<string, boolean>; orderBy?: unknown; take?: number } = {}) =>
            sortRows(state.connections.filter((c) => matchesWhere(c as unknown as Record<string, unknown>, where)), orderBy)
                .slice(0, take ?? undefined)
                .map((c) => pick(c as unknown as Record<string, unknown>, select)),
        create: async ({ data }: { data: Partial<ConnectionRowState> & Pick<ConnectionRowState, 'id' | 'username' | 'provider' | 'accountId' | 'accountEmail'> }) => {
            const unique = state.connections.find(
                (c) =>
                    ['active', 'reauth_required', 'error'].includes(c.status) &&
                    ((c.username === data.username && c.kind === (data.kind ?? 'calendar')) || (c.provider === data.provider && c.accountId === data.accountId)),
            );
            if (unique && ['active', 'reauth_required', 'error'].includes(data.status ?? 'active')) {
                throw Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
            }
            const row = blankConnection({ ...data, updatedAt: touch() } as ConnectionRowState);
            state.connections.push(row);
            return { ...row };
        },
        update: async ({ where, data }: { where: { id: string }; data: Partial<ConnectionRowState> }) => {
            const row = state.connections.find((c) => c.id === where.id);
            if (!row) throw Object.assign(new Error('Record not found'), { code: 'P2025' });
            Object.assign(row, data, { updatedAt: touch() });
            return { ...row };
        },
        updateMany: async ({ where, data }: { where: Where; data: Partial<ConnectionRowState> }) => {
            const rows = state.connections.filter((c) => matchesWhere(c as unknown as Record<string, unknown>, where));
            for (const row of rows) Object.assign(row, data, { updatedAt: touch() });
            return { count: rows.length };
        },
    };

    const integrationProvider = {
        findUnique: async ({ where }: { where: { provider: string } }) => {
            const row = state.providers.get(where.provider);
            return row ? { ...row } : null;
        },
        findMany: async () => [...state.providers.values()].map((p) => ({ ...p })),
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

    /** Held application locks (holdLocks): key → the holding transaction and a promise settled when it ends. */
    const held = new Map<string, { owner: object; release: Promise<void> }>();
    const takeSnapshot = () => ({
        users: state.users.map((u) => ({ ...u })),
        connections: state.connections.map((c) => ({ ...c })),
        audits: [...state.audits],
    });

    const transactionClient = (owner: object, tx: { snapshot: ReturnType<typeof takeSnapshot>; locked: boolean; done: Promise<void> }) => ({
        user,
        calendarConnection,
        integrationProvider,
        notification,
        $queryRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
            void strings;
            // acquireLocks passes its keys as one JSON array of `crm:<key>` resources.
            const keys: string[] = [];
            for (const value of values) {
                if (typeof value !== 'string' || !value.startsWith('[')) continue;
                for (const key of JSON.parse(value) as string[]) keys.push(key.replace(/^crm:/, ''));
            }
            state.locks.push(...keys);
            if (state.holdLocks && keys.length > 0) {
                for (const key of keys) {
                    for (let holder = held.get(key); holder && holder.owner !== owner; holder = held.get(key)) await holder.release;
                    held.set(key, { owner, release: tx.done });
                }
                // Both code paths lock before they write: what this transaction rolls back to is the state it locked on.
                if (!tx.locked) tx.snapshot = takeSnapshot();
                tx.locked = true;
                state.onLocked?.(keys);
            }
            return [{ result: 0 }];
        },
    });

    stub('$transaction', async (fn: (tx: unknown) => Promise<unknown>) => {
        const owner = {};
        let release = () => undefined as void;
        const done = new Promise<void>((resolve) => {
            release = resolve;
        });
        const tx = { snapshot: takeSnapshot(), locked: false, done };
        try {
            return await fn(transactionClient(owner, tx));
        } catch (err) {
            state.users = tx.snapshot.users;
            state.connections = tx.snapshot.connections;
            state.audits = tx.snapshot.audits;
            throw err;
        } finally {
            for (const [key, holder] of held) if (holder.owner === owner) held.delete(key);
            release();
        }
    });
    stub('user', user);
    stub('calendarConnection', calendarConnection);
    stub('integrationProvider', integrationProvider);
    stub('notification', notification);

    mock.method(auditService, 'record', async (_tx: unknown, entry: AuditEntry) => {
        state.audits.push(entry);
    });
    mock.method(cacheService, 'invalidate', async () => undefined);
    mock.method(cacheService, 'invalidatePattern', async (pattern: string) => {
        state.cacheInvalidations.push(pattern);
    });
    const configs = seed.configs ?? ({ categories: [], fieldsByModule: {}, moduleTabs: {}, moduleSettings: {} } as unknown as FormConfigsPayload);
    mock.method(formConfigService, 'getAllConfigs', async () => configs);
    return state;
}
