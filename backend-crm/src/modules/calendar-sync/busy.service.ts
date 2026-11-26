import { createHash } from 'node:crypto';
import { ENV } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { prisma } from '../../config/prisma.js';
import { isRedisReady, redis } from '../../config/redis.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { CACHE_KEYS, cacheService } from '../../services/cache.service.js';
import type { AuthUser } from '../../types/user.types.js';
import { canViewActivity, FOLLOW_UP_ORIGIN } from '../activities/activity.access.js';
import { activityRangeWhere } from '../activities/activity.calendar.js';
import { NOTE_TYPE, PLANNED_STATUS, TASK_TYPE } from '../activities/activity.schedule.js';
import {
    BUSY_BATCH_SIZE,
    BUSY_CACHE_GRID_MINUTES,
    BUSY_CRM_CACHE_SECONDS,
    BUSY_CRM_ROW_CAP,
    BUSY_PROVIDER_CACHE_SECONDS,
    BUSY_PROVIDER_DEADLINE_MS,
    BUSY_PROVIDER_PARALLEL,
    BUSY_PROVIDER_WINDOW_DAYS,
    BUSY_SUGGEST_DAYS,
    BUSY_SUGGEST_STEP_MINUTES,
    BUSY_WORKING_HOURS,
    ZERO_LENGTH_BLOCK_MINUTES,
    type BusyKind,
    type BusyPersonStatus,
    type BusySource,
} from './busy.constants.js';
import { firstCommonFreeSlot, mergeByKind, splitWindows, withoutOwnCopy, type Interval, type KindInterval } from './busy.intervals.js';
import { takeProviderCall } from './busy.rateLimit.js';
import { busyQuerySchema, type BusyQuery } from './busy.validator.js';
import { ConnectionUnavailableError, withCalendarAccess } from './calendarAccess.js';
import { isCalendarProvider, LIVE_CONNECTION_STATUSES, type CalendarProvider } from './connection.constants.js';
import { getAdapter } from './providers/registry.js';
import type { FreeBusyResult, ProviderBusyBlock } from './providers/types.js';

/**
 * Busy times (Calendar Phase 2, P2-6: spec §12, adapted by addendum §8.5): `GET /api/activities/busy`. For each asked
 * person, the union of
 *   1. **CRM activities**: Planned, not Notes or Tasks, as owner or as an invited colleague who hasn't declined, in the
 *      window. Timed → `busy` (a zero-length Email / WhatsApp blocks 15 minutes, as it goes to calendars); all-day →
 *      nothing, except a Site Visit type (option meta `icon: 'visit'`) → `away`. Any colleague's activities count,
 *      whoever asks: the answer carries **times only** (Phase 1 D11 limits who sees activity details, and none are
 *      returned). Cached 30 s per people set and window, dropped by every activity write (guarded read).
 *   2. **Their company calendar** (admin-managed connection, P2-2b), when they have a live row that is `ok` or
 *      `pending`: Google `freeBusy` **impersonating the requester** for all colleagues at once (Workspace's own
 *      free/busy sharing applies); a calendar that comes back with an error is then read **impersonating that
 *      colleague** (the owner decided busy blocks come from colleagues' calendars). Microsoft `getSchedule` on the
 *      requester's mailbox (or, without one, the first colleague's: the app token covers the tenant), the same
 *      per-colleague fallback. Each colleague is also read as themselves when the requester has no usable row
 *      (Google) or the requester's own call is refused for the requester (their token, their mailbox); a call that
 *      fails as a whole for any other reason (timeout, 5xx, 429, the provider off or unhealthy) settles the whole
 *      batch without per-colleague calls. Calls: ≤ 14-day windows, ≤ 5 at once, 5 s each, one try, none started after
 *      the request's 8 s deadline, at most 120 per user per minute. Reads are `readOnly`: a refused call marks no
 *      connection row or provider health. Cached 60 s per person and window (Redis; an in-process memo while Redis is
 *      down).
 * The CRM and provider windows (and cache keys) are widened to the 15-minute grid, so a window moved by a few ms or
 * minutes hits the caches; the answer is clipped back to `[from, to)`.
 * People without a live row (not enrolled, excluded, no company email, provider off) and people whose row is in
 * `error` get CRM activities only and are marked (`status`). A provider failure never fails the request: that person's
 * calendar part is `unavailable` / `error` and the CRM part is still returned.
 *
 * `exclude` (the activity being moved, when the caller may see it) removes its own CRM block, and a calendar block of
 * the owner or an invited colleague with exactly its start and end (its calendar copy) is dropped, so a meeting being
 * moved doesn't block itself; longer blocks around it are other meetings and stay.
 * `suggest` adds the first common free slot of that length (business hours 09:00–19:00, 15-minute grid, up to 7 days,
 * never in the past), computed here only.
 */

export interface BusyBlockDto {
    start: string;
    end: string;
    kind: BusyKind;
}

export interface BusyPersonDto {
    /** As stored (the request's spelling for an unknown name). */
    username: string;
    name: string;
    /** The provider of their live calendar row; null without one. */
    provider: CalendarProvider | null;
    status: BusyPersonStatus;
    sources: BusySource[];
    busy: BusyBlockDto[];
}

export interface BusyTimesDto {
    timeZone: string;
    from: string;
    to: string;
    generatedAt: string;
    people: BusyPersonDto[];
    /** Only when `suggest` was sent: the first common free slot, or null when none fits. */
    suggestion?: { start: string; end: string } | null;
}

type LiveRow = { id: string; username: string; provider: string; accountEmail: string; status: string };

interface Person {
    requested: string;
    key: string;
    username: string;
    name: string;
    known: boolean;
    row: LiveRow | null;
}

const key = (name: string) => name.trim().toLowerCase();
const MINUTE = 60_000;

// ── Who ──────────────────────────────────────────────────────────────────────

async function loadPeople(names: readonly string[], requester: string): Promise<{ people: Person[]; requesterRows: LiveRow[] }> {
    const [users, rows] = await Promise.all([
        prisma.user.findMany({ where: { username: { in: [...names] } }, select: { username: true, fullName: true, isActive: true, isGroupUser: true } }),
        prisma.calendarConnection.findMany({
            where: { username: { in: [...new Set([...names, requester])] }, status: { in: [...LIVE_CONNECTION_STATUSES] } },
            select: { id: true, username: true, provider: true, accountEmail: true, status: true },
        }),
    ]);
    const userOf = new Map(users.map((u) => [key(u.username), u]));
    const rowOf = new Map(rows.map((r) => [key(r.username), r]));
    const people = names.map((requested): Person => {
        const user = userOf.get(key(requested));
        const known = Boolean(user && user.isActive && !user.isGroupUser);
        return {
            requested,
            key: key(requested),
            username: user?.username ?? requested,
            name: (user?.fullName || '').trim() || user?.username || requested,
            known,
            row: known ? (rowOf.get(key(requested)) ?? null) : null,
        };
    });
    return { people, requesterRows: rows.filter((r) => key(r.username) === key(requester)) };
}

// ── CRM part ─────────────────────────────────────────────────────────────────

interface CrmBlock extends KindInterval {
    id: string;
}

/** What an activity row needs to become a block. */
export interface BusyActivityRow {
    id: string;
    followupType: string;
    startAt: Date | null;
    endAt: Date | null;
    allDay: boolean;
}

/**
 * The block an activity occupies, or null: timed → busy (zero length → 15 minutes); all-day → away for a Site Visit
 * type, else nothing (untimed follow-ups become all-day activities and must not mark people busy all day). Pure.
 */
export function activityBusyBlock(row: BusyActivityRow, awayTypes: ReadonlySet<string>): KindInterval | null {
    if (!row.startAt) return null;
    const start = row.startAt.getTime();
    if (row.allDay) {
        if (!awayTypes.has(row.followupType)) return null;
        const end = row.endAt && row.endAt.getTime() > start ? row.endAt.getTime() : start + 24 * 60 * MINUTE;
        return { start, end, kind: 'away' };
    }
    const end = row.endAt && row.endAt.getTime() > start ? row.endAt.getTime() : start + ZERO_LENGTH_BLOCK_MINUTES * MINUTE;
    return { start, end, kind: 'busy' };
}

/** Followup Types that mark people away when all-day (option meta `icon: 'visit'`, the seeded Site Visit). */
async function loadAwayTypes(): Promise<Set<string>> {
    const { loadActivityConfig } = await import('../activities/activity.service.js');
    const config = await loadActivityConfig();
    return new Set((config.followupTypes?.options ?? []).filter((option) => option.meta?.icon === 'visit').map((option) => option.value));
}

/** The CRM activities query (exported for tests): see the file header. */
export function busyActivityWhere(usernames: readonly string[], from: Date, to: Date, followUpActivities: boolean): Prisma.ActivityWhereInput {
    const and: Prisma.ActivityWhereInput[] = [
        { isDeleted: false },
        { status: PLANNED_STATUS },
        { followupType: { notIn: [NOTE_TYPE, TASK_TYPE] } },
        {
            OR: [
                { assignedTo: { in: [...usernames] } },
                { attendees: { some: { kind: 'user', username: { in: [...usernames] }, responseStatus: { not: 'declined' } } } },
            ],
        },
        activityRangeWhere(from, to),
    ];
    // The company switch off (D44): follow-up activities are left out everywhere, here too.
    if (!followUpActivities) and.push({ origin: { not: FOLLOW_UP_ORIGIN } });
    return { AND: and };
}

const BUSY_ACTIVITY_SELECT = {
    id: true,
    followupType: true,
    startAt: true,
    endAt: true,
    allDay: true,
    assignedTo: true,
    attendees: { where: { kind: 'user' }, select: { username: true, responseStatus: true } },
} as const;

/** Per lower-cased username, the CRM blocks of `usernames` in the window (with activity ids, for `exclude`). */
async function loadCrmBlocks(usernames: readonly string[], from: Date, to: Date): Promise<Record<string, CrmBlock[]>> {
    if (usernames.length === 0) return {};
    const sorted = [...new Set(usernames.map(key))].sort();
    const peopleHash = createHash('sha256').update(sorted.join('\n')).digest('hex').slice(0, 24);
    return cacheService.getOrSetGuarded(CACHE_KEYS.activityBusy(peopleHash, from.getTime(), to.getTime()), BUSY_CRM_CACHE_SECONDS, async () => {
        const { loadCalendarSettings } = await import('../integrations/integration.settings.js');
        const [awayTypes, settings] = await Promise.all([loadAwayTypes(), loadCalendarSettings()]);
        const rows = await prisma.activity.findMany({
            where: busyActivityWhere(sorted, from, to, settings.followUpActivities),
            select: BUSY_ACTIVITY_SELECT,
            orderBy: [{ startAt: 'asc' }, { id: 'asc' }],
            take: BUSY_CRM_ROW_CAP,
        });
        if (rows.length >= BUSY_CRM_ROW_CAP) logger.warn({ people: sorted.length, cap: BUSY_CRM_ROW_CAP }, 'Busy times: CRM activities cut at the cap');
        const wanted = new Set(sorted);
        const out: Record<string, CrmBlock[]> = {};
        for (const row of rows) {
            const block = activityBusyBlock(row, awayTypes);
            if (!block) continue;
            const holders = new Set<string>();
            if (wanted.has(key(row.assignedTo))) holders.add(key(row.assignedTo));
            for (const attendee of row.attendees) {
                if (attendee.username && attendee.responseStatus !== 'declined' && wanted.has(key(attendee.username))) holders.add(key(attendee.username));
            }
            for (const holder of holders) (out[holder] ??= []).push({ ...block, id: row.id });
        }
        return out;
    });
}

// ── Calendar part ────────────────────────────────────────────────────────────

type ProviderOutcome = { status: 'ok'; intervals: KindInterval[] } | { status: Exclude<BusyPersonStatus, 'ok' | 'unknown'> };

/** Cached provider part: `[startMs, endMs, kind]` triples. */
type CachedBusy = [number, number, BusyKind][];

const memo = new Map<string, { value: CachedBusy; until: number }>();
const MEMO_MAX = 1_000;

/** Tests: forget the in-process memo (and put the provider deadline back). */
export function resetBusyMemo(): void {
    memo.clear();
    deadlineMs = BUSY_PROVIDER_DEADLINE_MS;
}

let deadlineMs = BUSY_PROVIDER_DEADLINE_MS;
/** Tests: a shorter provider deadline. */
export function setBusyDeadlineForTests(ms: number): void {
    deadlineMs = ms;
}

async function readCached(keys: readonly string[], now: number): Promise<(CachedBusy | null)[]> {
    if (keys.length === 0) return [];
    if (isRedisReady()) {
        try {
            const values = await redis.mget(...keys);
            return values.map((value) => (value ? (JSON.parse(value) as CachedBusy) : null));
        } catch (err) {
            logger.warn({ err: (err as Error).message }, 'Busy times cache read failed; asking the providers');
            return keys.map(() => null);
        }
    }
    return keys.map((k) => {
        const hit = memo.get(k);
        return hit && hit.until > now ? hit.value : null;
    });
}

function writeCached(entries: [string, CachedBusy][], now: number): void {
    if (entries.length === 0) return;
    if (isRedisReady()) {
        const pipeline = redis.multi();
        for (const [k, value] of entries) pipeline.set(k, JSON.stringify(value), 'EX', BUSY_PROVIDER_CACHE_SECONDS);
        pipeline.exec().catch((err: Error) => logger.warn({ err: err.message }, 'Busy times cache write failed'));
        return;
    }
    if (memo.size + entries.length > MEMO_MAX) {
        for (const [k, hit] of memo) if (hit.until <= now) memo.delete(k);
        if (memo.size + entries.length > MEMO_MAX) memo.clear();
    }
    for (const [k, value] of entries) memo.set(k, { value, until: now + BUSY_PROVIDER_CACHE_SECONDS * 1000 });
}

/** At most `n` calls at once. */
function limiter(n: number) {
    let active = 0;
    const queue: (() => void)[] = [];
    return async <T>(fn: () => Promise<T>): Promise<T> => {
        if (active >= n) await new Promise<void>((resolve) => queue.push(resolve));
        active += 1;
        try {
            return await fn();
        } finally {
            active -= 1;
            queue.shift()?.();
        }
    };
}

/** Why a calendar call couldn't be made or failed, as a person status. */
export function outcomeOfError(err: unknown): Exclude<BusyPersonStatus, 'ok' | 'unknown'> {
    if (err instanceof ConnectionUnavailableError) {
        if (err.reason === 'provider_disabled' || err.reason === 'not_active' || err.reason === 'not_found' || err.reason === 'user_inactive') return 'not_connected';
        return 'error';
    }
    return 'unavailable';
}

/**
 * A failure of the requester's whole call that is the requester's own (their row, their token, their mailbox
 * refused): reading each colleague as themselves may work. Anything else (a timeout, 5xx, 429, the provider off,
 * unhealthy or without its key, the request's budget or deadline) would fail the same way per colleague, so the batch
 * settles without more calls (addendum §8.5 falls back per colleague only for calendars that come back with errors).
 */
export function requesterSpecific(err: unknown): boolean {
    if (!(err instanceof ConnectionUnavailableError)) return false;
    if (err.reason === 'call_refused') return err.failure?.level === 'user';
    return err.reason === 'user_error' || err.reason === 'user_inactive' || err.reason === 'not_active' || err.reason === 'not_found';
}

/** The request ran out of provider calls (per-user budget) or time (deadline): the rest are `unavailable`. */
class BusyLimitError extends Error {
    constructor(reason: 'budget' | 'deadline') {
        super(`Busy times provider ${reason} reached`);
        this.name = 'BusyLimitError';
    }
}

/** At most `parallel` calls at once, none after `deadline`, each taking one call of `userKey`'s budget. */
function guardedRunner(parallel: number, deadline: number, userKey: string) {
    const run = limiter(parallel);
    return <T>(fn: () => Promise<T>): Promise<T> =>
        run(async () => {
            if (Date.now() >= deadline) throw new BusyLimitError('deadline');
            if (!(await takeProviderCall(userKey))) throw new BusyLimitError('budget');
            return fn();
        });
}
type Runner = ReturnType<typeof guardedRunner>;

const usable = (row: LiveRow | null): row is LiveRow => Boolean(row && (row.status === 'ok' || row.status === 'pending'));

/**
 * Free/busy of `emails` read as the person of `rowId`, over every window; one entry per email (an error in any window
 * makes that email's whole entry an error). Throws when a call fails as a whole.
 */
async function readAs(
    rowId: string,
    provider: CalendarProvider,
    emails: readonly string[],
    windows: readonly Interval[],
    run: Runner,
): Promise<Map<string, FreeBusyResult>> {
    // readOnly: a refused read marks no row and no provider health (only checks and sync jobs do).
    const parts = await Promise.all(
        windows.map((w) =>
            run(() =>
                withCalendarAccess(rowId, (ctx) => getAdapter(provider).freeBusy(ctx, { emails, start: new Date(w.start), end: new Date(w.end) }), {
                    readOnly: true,
                }),
            ),
        ),
    );
    const out = new Map<string, FreeBusyResult>();
    for (const email of emails) {
        const blocks: ProviderBusyBlock[] = [];
        let error: string | null = null;
        for (const part of parts) {
            const result = part.get(email) ?? { error: 'missing' };
            if ('error' in result) error ??= result.error;
            else blocks.push(...result.busy);
        }
        out.set(email, error ? { error } : { busy: blocks });
    }
    return out;
}

const toIntervals = (result: { busy: ProviderBusyBlock[] }): KindInterval[] => result.busy.map((b) => ({ start: b.start.getTime(), end: b.end.getTime(), kind: b.kind }));

/**
 * The calendar part of `targets` (people with a usable live row), by lower-cased username. Never longer than the
 * deadline (plus a cache read): people still unread then are `unavailable`.
 */
async function loadProviderBusy(
    targets: readonly Person[],
    requesterRows: readonly LiveRow[],
    from: Date,
    to: Date,
    userKey: string,
): Promise<Map<string, ProviderOutcome>> {
    const out = new Map<string, ProviderOutcome>();
    const now = Date.now();
    const cacheKeys = targets.map((p) => CACHE_KEYS.calendarBusy(p.username, from.getTime(), to.getTime()));
    const cached = await readCached(cacheKeys, now);
    const misses: Person[] = [];
    targets.forEach((person, i) => {
        const hit = cached[i];
        if (hit) out.set(person.key, { status: 'ok', intervals: hit.map(([start, end, kind]) => ({ start, end, kind })) });
        else misses.push(person);
    });
    if (misses.length === 0) return out;

    const windows = splitWindows(from.getTime(), to.getTime(), BUSY_PROVIDER_WINDOW_DAYS);
    const deadline = now + deadlineMs;
    const run = guardedRunner(BUSY_PROVIDER_PARALLEL, deadline, userKey);
    const fresh: [string, CachedBusy][] = [];
    let closed = false;
    const settle = (person: Person, outcome: ProviderOutcome) => {
        if (closed || out.has(person.key)) return;
        out.set(person.key, outcome);
        if (outcome.status === 'ok') fresh.push([CACHE_KEYS.calendarBusy(person.username, from.getTime(), to.getTime()), outcome.intervals.map((i) => [i.start, i.end, i.kind])]);
    };

    const providers = [...new Set(misses.map((p) => p.row!.provider))].filter(isCalendarProvider);
    const work = Promise.all(
        providers.map(async (provider) => {
            const group = misses.filter((p) => p.row!.provider === provider);
            const emailOf = (p: Person) => p.row!.accountEmail.toLowerCase();
            const requesterRow = requesterRows.find((r) => r.provider === provider && usable(r)) ?? null;
            // Microsoft: any mailbox in the tenant can ask (the app token covers them all); Google: only the requester
            // (another colleague's impersonation would apply that colleague's sharing, not the requester's).
            const actor = requesterRow ?? (provider === 'microsoft' ? group[0].row : null);
            const pending = new Set(group);
            const failedRows = new Map<string, Exclude<BusyPersonStatus, 'ok' | 'unknown'>>();

            if (actor) {
                const size = BUSY_BATCH_SIZE[provider];
                const batches: Person[][] = [];
                for (let i = 0; i < group.length; i += size) batches.push(group.slice(i, i + size));
                await Promise.all(
                    batches.map(async (batch) => {
                        try {
                            const results = await readAs(actor.id, provider, batch.map(emailOf), windows, run);
                            for (const person of batch) {
                                const result = results.get(emailOf(person));
                                if (result && 'busy' in result) {
                                    settle(person, { status: 'ok', intervals: toIntervals(result) });
                                    pending.delete(person);
                                }
                            }
                        } catch (err) {
                            const outcome = outcomeOfError(err);
                            failedRows.set(actor.id, outcome);
                            const reason = err instanceof ConnectionUnavailableError ? err.reason : (err as Error).name;
                            if (requesterSpecific(err)) {
                                logger.info({ provider, reason }, 'Busy times: requester call refused; reading each calendar as its owner');
                            } else {
                                // Transient (timeout, 5xx, 429), provider-wide, or out of budget / time: per-colleague
                                // calls would fail the same way and load a provider that is already struggling.
                                logger.info({ provider, reason }, 'Busy times: requester call failed; calendar part unavailable for the batch');
                                for (const person of batch) {
                                    settle(person, { status: outcome });
                                    pending.delete(person);
                                }
                            }
                        }
                    }),
                );
            }

            // Per colleague, as that colleague (calendars the requester couldn't read, or no requester row).
            await Promise.all(
                [...pending].map(async (person) => {
                    const failed = failedRows.get(person.row!.id);
                    if (failed) return settle(person, { status: failed });
                    try {
                        const results = await readAs(person.row!.id, provider, [emailOf(person)], windows, run);
                        const result = results.get(emailOf(person));
                        settle(person, result && 'busy' in result ? { status: 'ok', intervals: toIntervals(result) } : { status: 'unavailable' });
                    } catch (err) {
                        settle(person, { status: outcomeOfError(err) });
                    }
                }),
            );
        }),
    );
    // The deadline also bounds calls already running (each has its own 5 s timeout; their answers are dropped).
    let timer: NodeJS.Timeout | undefined;
    const expired = new Promise<void>((resolve) => {
        timer = setTimeout(resolve, Math.max(0, deadline - Date.now())); // cleared below once the work is done
    });
    try {
        await Promise.race([work, expired]);
    } finally {
        clearTimeout(timer);
    }
    closed = true;
    for (const person of misses) if (!out.has(person.key)) out.set(person.key, { status: 'unavailable' });
    writeCached(fresh, now);
    return out;
}

// ── Exclude ──────────────────────────────────────────────────────────────────

interface Excluded {
    id: string;
    window: Interval;
    holders: Set<string>;
}

async function loadExcluded(id: string | undefined, user: AuthUser): Promise<Excluded | null> {
    if (!id) return null;
    const row = await prisma.activity.findFirst({
        where: { id, isDeleted: false },
        select: { id: true, followupType: true, startAt: true, endAt: true, allDay: true, assignedTo: true, createdBy: true, attendees: { select: { kind: true, username: true, responseStatus: true } } },
    });
    // Only an activity the caller may see: otherwise comparing answers with and without it would reveal its times.
    if (!row || !canViewActivity(user, row)) return null;
    const block = activityBusyBlock(row, new Set([row.followupType]));
    if (!block) return null;
    const holders = new Set<string>([key(row.assignedTo)]);
    for (const attendee of row.attendees) if (attendee.kind === 'user' && attendee.username) holders.add(key(attendee.username));
    return { id: row.id, window: { start: block.start, end: block.end }, holders };
}

// ── The answer ───────────────────────────────────────────────────────────────

const iso = (ms: number) => new Date(ms).toISOString();
const GRID_MS = BUSY_CACHE_GRID_MINUTES * MINUTE;
/** `[from, to)` widened to the cache grid (from down, to up; epoch-aligned, so whole quarter hours in any zone). */
export function gridWindow(from: Date, to: Date): { from: Date; to: Date } {
    return { from: new Date(Math.floor(from.getTime() / GRID_MS) * GRID_MS), to: new Date(Math.ceil(to.getTime() / GRID_MS) * GRID_MS) };
}

/** Options of a server-side caller (booking links). */
export interface BusyTimesOptions {
    /**
     * Whose per-minute provider-call budget the calendar reads take (default `user:<id>` of the requester). Booking links
     * pass `booking:<linkId>`, so visitors of one public page share one budget (BUSY_PROVIDER_CALL_BUDGET).
     */
    budgetKey?: string;
}

export async function busyTimes(query: BusyQuery, user: AuthUser, now: Date = new Date(), opts: BusyTimesOptions = {}): Promise<BusyTimesDto> {
    const from = new Date(query.from);
    const to = new Date(query.to);
    const { people, requesterRows } = await loadPeople(query.users, user.username);
    const known = people.filter((p) => p.known);
    const targets = known.filter((p) => usable(p.row));
    // Read (and cache) on the grid; every block is clipped back to [from, to) below.
    const wide = gridWindow(from, to);

    const [crm, calendars, excluded] = await Promise.all([
        loadCrmBlocks(
            known.map((p) => p.username),
            wide.from,
            wide.to,
        ),
        loadProviderBusy(targets, requesterRows, wide.from, wide.to, opts.budgetKey ?? `user:${user.id}`),
        loadExcluded(query.exclude, user),
    ]);

    const result: BusyPersonDto[] = people.map((person) => {
        if (!person.known) return { username: person.requested, name: person.requested, provider: null, status: 'unknown', sources: [], busy: [] };
        const provider = person.row && isCalendarProvider(person.row.provider) ? person.row.provider : null;
        let blocks: KindInterval[] = (crm[person.key] ?? []).filter((b) => b.id !== excluded?.id).map(({ start, end, kind }) => ({ start, end, kind }));
        const sources: BusySource[] = ['crm'];
        let status: BusyPersonStatus;
        if (!person.row) status = 'not_connected';
        else if (!usable(person.row)) status = 'error';
        else {
            const outcome = calendars.get(person.key) ?? { status: 'unavailable' as const };
            status = outcome.status;
            if (outcome.status === 'ok') {
                sources.push(provider!);
                const own = excluded && excluded.holders.has(person.key) ? withoutOwnCopy(outcome.intervals, excluded.window) : outcome.intervals;
                blocks = blocks.concat(own);
            }
        }
        const busy = mergeByKind(blocks, from.getTime(), to.getTime()).map((b) => ({ start: iso(b.start), end: iso(b.end), kind: b.kind }));
        return { username: person.username, name: person.name, provider, status, sources, busy };
    });

    const answer: BusyTimesDto = { timeZone: ENV.BUSINESS_TIMEZONE, from: from.toISOString(), to: to.toISOString(), generatedAt: now.toISOString(), people: result };
    if (query.suggest !== undefined) {
        const slot = firstCommonFreeSlot(
            result.filter((p) => p.status !== 'unknown').map((p) => p.busy.map((b) => ({ start: Date.parse(b.start), end: Date.parse(b.end) }))),
            {
                from: new Date(Math.max(from.getTime(), now.getTime())),
                to,
                durationMinutes: query.suggest,
                workingHours: BUSY_WORKING_HOURS,
                tz: ENV.BUSINESS_TIMEZONE,
                stepMinutes: BUSY_SUGGEST_STEP_MINUTES,
                days: BUSY_SUGGEST_DAYS,
            },
        );
        answer.suggestion = slot ? { start: slot.start.toISOString(), end: slot.end.toISOString() } : null;
    }
    return answer;
}

export const busyService = {
    /** `GET /api/activities/busy` (validated here: 400 VALIDATION_ERROR). */
    async busy(query: unknown, user: AuthUser): Promise<BusyTimesDto> {
        return busyTimes(busyQuerySchema.parse(query ?? {}), user);
    },
};
