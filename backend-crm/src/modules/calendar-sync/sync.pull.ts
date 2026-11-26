import { logger } from '../../config/logger.js';
import { ENV } from '../../config/env.js';
import { prisma, type TransactionClient } from '../../config/prisma.js';
import type { ActivityExternalLink, CalendarConnection, Prisma } from '../../generated/prisma/client.js';
import { runWithAuditOrigin } from '../../services/auditContext.js';
import { cacheService } from '../../services/cache.service.js';
import { isUniqueViolation } from '../../utils/prismaErrors.js';
import { FOLLOW_UP_ORIGIN } from '../activities/activity.access.js';
import { FOLLOW_UP_LOCK_ENTITY, rescheduleRecordFromCalendar, type FollowUpModule } from '../activities/activity.followUp.js';
import type { ActivityRow } from '../activities/activity.mapper.js';
import { PLANNED_STATUS } from '../activities/activity.schedule.js';
import { loadActivityConfig, runActivityPostCommit, WITH_ATTENDEES, type ActivityCommitRow, type ActivityConfig } from '../activities/activity.service.js';
import { applySystemPatch, type SystemActivityFields } from '../activities/activity.system.js';
import type { CalendarSyncSettings } from '../integrations/calendarSyncSettings.js';
import { loadCalendarSettings } from '../integrations/integration.settings.js';
import { lockRecords, runInTransaction } from '../shared/transactions.js';
import { ConnectionUnavailableError, withCalendarAccess } from './calendarAccess.js';
import type { CalendarProvider } from './connection.constants.js';
import { CursorExpiredError, ProviderError, ProviderRateLimitedError } from './providers/http.js';
import { getAdapter } from './providers/registry.js';
import type { CalendarProviderAdapter, CallCtx, ChangePage } from './providers/types.js';
import { attendeeInputsFromProvider, parseHeld } from './sync.attendees.js';
import { classifyInbound, emptyPullCounts, type InboundAction, type PullCounts } from './sync.classify.js';
import {
    FOLLOW_UP_TIME_KEPT_PREFIX,
    LEASE_CALL_HEADROOM_MS,
    MAX_PULL_PAGES,
    PULL_FUTURE_DAYS,
    PULL_HOLD_CURSOR_RUNS,
    PULL_PAST_DAYS,
    syncAuditRoute,
    TOO_LONG_CODE,
    TOO_LONG_MESSAGE,
    VERIFY_MISSING_LIMIT,
    type PullReason,
} from './sync.constants.js';
import { capInboundAttendees, inboundCrmNow, planInbound } from './sync.inbound.js';
import { eventKeyOf, requestedIdFor, syncKeyOf } from './sync.keys.js';
import { MeetingImporter, type ImportOutcome } from './sync.import.js';
import { claimLease, type Lease } from './sync.lease.js';
import type { DirtyLink } from './sync.outbox.js';
import { parseBase, type CrmShape, type ProviderEvent, type ProviderShape, type SyncBase } from './sync.shapes.js';
import { wakePushes } from './sync.wake.js';

/**
 * `pullConnection(connectionId, reason)` (Calendar Phase 2 spec §8.7–§8.11; admin-managed model addendum §8.4; P2-5):
 * brings changes made in one employee's Google Calendar / Outlook back to the CRM.
 *
 * - Only a live row in `ok` pulls (`pending` waits for its health check, `error` for its recovery); every provider
 *   call goes through `withCalendarAccess` (company credentials, a token minted per call, Graph `/users/{mailbox}`),
 *   under the connection's lease (D12: never at the same time as a push of the same calendar) and the audit origin
 *   `job:calendar-sync:<provider>` with the employee as actor (§3.6), whether the worker or the API runs it.
 * - Google: `events.list` on `primary` with the stored sync token; Graph: `calendarView/delta` with the stored delta
 *   link. No cursor (first pull, 410, the nightly Graph re-baseline) = a full sync of now − 7 days … (+ 400 days on
 *   Graph), then §8.11: every synced link of an activity inside the window the listing didn't show is read back
 *   (absence alone never cancels).
 * - Each event is classified (sync.classify.ts) and applied in its own small transaction (record lock for a follow-up
 *   activity, then the activity lock; system write path, audited, never marked for sync). One failing event is logged
 *   by id and counted; the run goes on. The new cursor is stored only after every item was applied (a run with
 *   failures keeps the old cursor and replays, which is harmless; after PULL_HOLD_CURSOR_RUNS such runs it moves on).
 * - Unlinked events (personal appointments, customer meetings made in the calendar) are read in the stream but never
 *   stored or logged (counted only), unless P2-8's import takes them (sync.import.ts, behind the company switch and the
 *   person's `importMeetings`): customer meetings become activities, invitation copies of meetings the CRM holds get
 *   an attendee link, and attendee links bring their person's reply back (spec §13). Events the CRM wrote
 *   whose link was lost are linked again by their private marker (Google) or iCalUID (`syncKey`), for activities this
 *   person owns.
 * - After each page: reminders re-armed and participants notified for the changed activities (no push), the
 *   activities (and lead / opportunity) caches dropped, and links that still have something to send woken.
 */

export type PullResult =
    | { status: 'skipped'; reason: string }
    /** Another process holds the connection's lease (a push or pull of the same calendar). */
    | { status: 'busy' }
    | { status: 'rate_limited'; retryAfterMs: number }
    /** The provider failed (transient); the next poll tries again. */
    | { status: 'failed'; code: string }
    | { status: 'done'; full: boolean; counts: PullCounts };

export interface PullOptions {
    now?: () => Date;
    /** Force a full sync (admin resync). */
    full?: boolean;
}

/** The lease ran out during a long pull and someone else took it: stop without storing the cursor. */
class LeaseLostError extends Error {
    constructor() {
        super('Calendar connection lease lost');
        this.name = 'LeaseLostError';
    }
}

const DAY_MS = 24 * 60 * 60_000;

/** Runs in a row whose events failed to apply, per connection (in-process; a restart simply replays). */
const heldCursorRuns = new Map<string, number>();
export function resetPullStateForTests(): void {
    heldCursorRuns.clear();
}

const parseInstant = (value: string): Date | null => {
    const ms = Date.parse(value);
    return Number.isNaN(ms) ? null : new Date(ms);
};

const isFollowUpModule = (value: string | null | undefined): value is FollowUpModule => value === 'leads' || value === 'opportunities';

/** The full sync window (§8.7 step 2). */
export function pullWindow(now: Date): { start: Date; end: Date } {
    return { start: new Date(now.getTime() - PULL_PAST_DAYS * DAY_MS), end: new Date(now.getTime() + PULL_FUTURE_DAYS * DAY_MS) };
}

export async function pullConnection(connectionId: string, reason: PullReason, options: PullOptions = {}): Promise<PullResult> {
    const clock = options.now ?? (() => new Date());
    if (!ENV.INTEGRATIONS.SYNC_ENABLED) return { status: 'skipped', reason: 'sync_disabled' };
    const connection = await prisma.calendarConnection.findUnique({ where: { id: connectionId } });
    if (!connection) return { status: 'skipped', reason: 'not_found' };
    // pending: waits for its first health check; error: waits for its recovery; stopped: nothing to pull.
    if (connection.status !== 'ok') return { status: 'skipped', reason: `status_${connection.status}` };
    const user = await prisma.user.findUnique({ where: { username: connection.username }, select: { id: true, isActive: true, isGroupUser: true } });
    if (!user?.isActive || user.isGroupUser) return { status: 'skipped', reason: 'user_inactive' };
    return runWithAuditOrigin({ source: 'JOB', route: syncAuditRoute(connection.provider), actorId: user.id }, async () => {
        const lease = await claimLease(prisma, connection.id, clock());
        if (!lease) return { status: 'busy' } as const;
        try {
            return await new ConnectionPull(connection, reason, clock, options, lease).run();
        } catch (err) {
            if (err instanceof LeaseLostError) {
                logger.warn({ connectionId }, 'Calendar lease lost during a pull; the next poll continues');
                return { status: 'busy' } as const;
            }
            if (err instanceof ConnectionUnavailableError) return { status: 'skipped', reason: err.reason } as const;
            if (err instanceof ProviderRateLimitedError) return { status: 'rate_limited', retryAfterMs: err.retryAfterMs ?? 60_000 } as const;
            if (err instanceof ProviderError) {
                logger.warn({ connectionId, code: err.code, status: err.status }, 'Calendar pull failed; the next poll tries again');
                return { status: 'failed', code: err.code } as const;
            }
            throw err;
        } finally {
            await lease.release().catch((err: Error) => logger.warn({ err: err.message, connectionId }, 'Could not release the calendar lease (it expires on its own)'));
        }
    });
}

/** What one event's apply left for after its commit. */
interface Applied {
    rows: ActivityCommitRow[];
    wake: DirtyLink[];
    records: FollowUpModule[];
    outcome: 'applied' | 'unchanged' | 'deleted' | 'relinked' | 'unsupported' | 'ignored' | 'imported' | 'attended';
}

const NOTHING: Applied = { rows: [], wake: [], records: [], outcome: 'unchanged' };

class ConnectionPull {
    private settings!: CalendarSyncSettings;
    private config!: ActivityConfig;
    /** P2-8: customer meetings and invitation copies (sync.import.ts). */
    private importer!: MeetingImporter;
    private readonly provider: CalendarProvider;
    private readonly adapter: CalendarProviderAdapter;
    private readonly counts = emptyPullCounts();
    private readonly connection: CalendarConnection;
    private readonly reason: PullReason;
    private readonly clock: () => Date;
    private readonly options: PullOptions;
    private readonly lease: Lease;

    constructor(connection: CalendarConnection, reason: PullReason, clock: () => Date, options: PullOptions, lease: Lease) {
        this.connection = connection;
        this.reason = reason;
        this.clock = clock;
        this.options = options;
        this.lease = lease;
        this.provider = connection.provider as CalendarProvider;
        this.adapter = getAdapter(this.provider);
    }

    async run(): Promise<PullResult> {
        [this.settings, this.config] = await Promise.all([loadCalendarSettings(), loadActivityConfig()]);
        this.importer = new MeetingImporter(this.connection, this.settings, this.config, this.clock);
        await this.importer.init();
        const startedAt = this.clock();
        const window = pullWindow(startedAt);
        let full = Boolean(this.options.full) || !this.connection.syncCursor || this.reason === 'rebaseline';
        let cursor: string | null = full ? null : this.connection.syncCursor;
        let pageToken: string | undefined;
        let nextCursor: string | null = null;
        const seen = new Set<string>();

        for (let page = 0; page < MAX_PULL_PAGES; page += 1) {
            let changes: ChangePage;
            try {
                changes = await this.withAccess((ctx) => this.adapter.listChanges(ctx, { cursor, ...(pageToken ? { pageToken } : {}), window }));
            } catch (err) {
                if (err instanceof CursorExpiredError && !full) {
                    // 410: the provider dropped our cursor. Start over with a full sync (relinks and §8.11 happen there).
                    logger.info({ connectionId: this.connection.id }, 'Calendar sync cursor expired; full resync');
                    full = true;
                    cursor = null;
                    pageToken = undefined;
                    seen.clear();
                    page = -1;
                    continue;
                }
                throw err;
            }
            this.counts.pages += 1;
            this.counts.unreadable += changes.unreadable;
            await this.applyPage(changes, seen);
            if (changes.nextPageToken) {
                pageToken = changes.nextPageToken;
                continue;
            }
            nextCursor = changes.nextCursor ?? null;
            break;
        }

        if (full && nextCursor) await this.verifyMissing(seen, window);
        await this.finish(full, nextCursor, window);
        const result = { status: 'done', full, counts: { ...this.counts } } as const;
        const changed = this.counts.applied + this.counts.deleted + this.counts.relinked + this.counts.unsupported + this.counts.imported + this.counts.attended;
        const level = this.counts.failed > 0 ? 'warn' : changed > 0 ? 'info' : 'debug';
        logger[level]({ connectionId: this.connection.id, reason: this.reason, full, ...this.counts }, 'Calendar pull done');
        return result;
    }

    // ── Provider calls ──────────────────────────────────────────────────────────────────────────────────────

    private async holdLease(headroomMs = 0): Promise<void> {
        if (!(await this.lease.keepAlive(this.clock(), headroomMs))) throw new LeaseLostError();
    }

    private async withAccess<T>(fn: (ctx: CallCtx) => Promise<T>): Promise<T> {
        await this.holdLease(LEASE_CALL_HEADROOM_MS);
        return withCalendarAccess(this.connection.id, (ctx) => fn(ctx), { clock: this.clock });
    }

    // ── One page ────────────────────────────────────────────────────────────────────────────────────────────

    private async applyPage(page: ChangePage, seen: Set<string>): Promise<void> {
        const keys = new Map(page.events.map((e) => [e.id, eventKeyOf(e.id)]));
        const removedKeys = page.removedIds.map((id) => eventKeyOf(id));
        const allKeys = [...new Set([...keys.values(), ...removedKeys])];
        const links = allKeys.length
            ? await prisma.activityExternalLink.findMany({ where: { connectionId: this.connection.id, externalEventKey: { in: allKeys } } })
            : [];
        const linkByKey = new Map(links.map((l) => [l.externalEventKey as string, l]));
        const activities = links.length
            ? await prisma.activity.findMany({ where: { id: { in: [...new Set(links.map((l) => l.activityId))] } }, select: { id: true, isDeleted: true, status: true } })
            : [];
        const activityById = new Map(activities.map((a) => [a.id, a as { id: string; isDeleted: boolean; status: string }]));
        const matches = await this.findMatches(page.events.filter((e) => !linkByKey.has(keys.get(e.id) as string)));
        await this.importer.preparePage(page.events.filter((e) => !linkByKey.has(keys.get(e.id) as string) && !matches.has(e.id)));

        const rows: ActivityCommitRow[] = [];
        const wake: DirtyLink[] = [];
        const records = new Set<FollowUpModule>();
        const collect = (applied: Applied) => {
            rows.push(...applied.rows);
            wake.push(...applied.wake);
            for (const r of applied.records) records.add(r);
        };

        for (const event of page.events) {
            const key = keys.get(event.id) as string;
            seen.add(key);
            this.counts.seen += 1;
            const link = linkByKey.get(key) ?? null;
            const activity = link ? (activityById.get(link.activityId) ?? null) : null;
            const action = classifyInbound({ event, link, activity, match: link ? null : (matches.get(event.id) ?? null) });
            collect(await this.applySafely(event, link, action));
        }

        for (const id of page.removedIds) {
            const link = linkByKey.get(eventKeyOf(id));
            if (!link) continue;
            seen.add(eventKeyOf(id));
            collect(await this.readBack(link));
        }

        await this.afterCommit(rows, wake, records);
    }

    /** Marker (Google private property) / syncKey matches of unlinked organizer copies, among this person's live activities. */
    private async findMatches(events: readonly ProviderEvent[]): Promise<Map<string, { activityId: string }>> {
        const out = new Map<string, { activityId: string }>();
        const candidates = events.filter((e) => e.isOrganizerCopy && e.status === 'active' && e.eventType === 'default');
        if (candidates.length === 0) return out;
        const owner = this.connection.username.toLowerCase();
        const markers = [...new Set(candidates.map((e) => e.crmActivityId).filter((id): id is string => Boolean(id)))];
        const byMarker = markers.length
            ? await prisma.activity.findMany({ where: { id: { in: markers }, isDeleted: false }, select: { id: true, assignedTo: true } })
            : [];
        const markerOk = new Set(byMarker.filter((a) => a.assignedTo.toLowerCase() === owner).map((a) => a.id));
        const syncKeys = new Map(candidates.filter((e) => e.iCalUid).map((e) => [e.id, syncKeyOf(e.iCalUid)]));
        const keyList = [...new Set(syncKeys.values())];
        const bySyncKey = keyList.length
            ? await prisma.activity.findMany({ where: { syncKey: { in: keyList }, isDeleted: false }, select: { id: true, assignedTo: true, syncKey: true } })
            : [];
        const activityOfKey = new Map(bySyncKey.filter((a) => a.assignedTo.toLowerCase() === owner && a.syncKey).map((a) => [a.syncKey as string, a.id]));
        for (const event of candidates) {
            const marked = event.crmActivityId && markerOk.has(event.crmActivityId) ? event.crmActivityId : null;
            const keyed = syncKeys.has(event.id) ? activityOfKey.get(syncKeys.get(event.id) as string) : undefined;
            const activityId = marked ?? keyed;
            if (activityId) out.set(event.id, { activityId });
        }
        return out;
    }

    /** One event, its failure contained (logged by id, counted); a unique-index refusal is retried once from the start (D45). */
    private async applySafely(event: ProviderEvent, link: ActivityExternalLink | null, action: InboundAction): Promise<Applied> {
        try {
            await this.holdLease();
            const applied = await this.applyAction(event, link, action).catch((err: unknown) => {
                if (!isUniqueViolation(err)) throw err;
                logger.warn({ connectionId: this.connection.id, linkId: link?.id }, 'Unique index refused a calendar change; retrying it once');
                return this.applyAction(event, link, action);
            });
            this.count(applied.outcome);
            return applied;
        } catch (err) {
            if (err instanceof LeaseLostError) throw err;
            this.counts.failed += 1;
            logger.warn({ connectionId: this.connection.id, linkId: link?.id, eventKey: eventKeyOf(event.id), err: (err as Error).message }, 'Could not apply a calendar change');
            return NOTHING;
        }
    }

    private count(outcome: Applied['outcome']): void {
        if (outcome === 'applied') this.counts.applied += 1;
        else if (outcome === 'deleted') this.counts.deleted += 1;
        else if (outcome === 'relinked') this.counts.relinked += 1;
        else if (outcome === 'unsupported') this.counts.unsupported += 1;
        else if (outcome === 'ignored') this.counts.ignored += 1;
        else if (outcome === 'imported') this.counts.imported += 1;
        else if (outcome === 'attended') this.counts.attended += 1;
        else this.counts.skipped += 1;
    }

    private async applyAction(event: ProviderEvent, link: ActivityExternalLink | null, action: InboundAction): Promise<Applied> {
        switch (action.kind) {
            case 'ignore':
                return { ...NOTHING, outcome: 'ignored' };
            case 'unlinked':
                return this.imported(await this.importer.applyUnlinked(event));
            case 'attendee':
                return this.imported(await this.importer.applyAttendeeLink(event, link as ActivityExternalLink));
            case 'skip':
                return NOTHING;
            case 'unsupported':
                return this.markUnsupported(link as ActivityExternalLink, event);
            case 'remoteDelete':
                return this.remoteDelete(link as ActivityExternalLink);
            case 'reconfirm':
                return this.merge(event, (link as ActivityExternalLink).activityId, link, { tooLong: false, reconfirm: true });
            case 'merge':
                return this.merge(event, (link as ActivityExternalLink).activityId, link, { tooLong: action.tooLong });
            case 'relink':
                return this.merge(event, action.activityId, null, { tooLong: action.tooLong, relink: true });
        }
    }

    /** An import / attendee-link result as the page collects it (P2-8). */
    private imported(result: ImportOutcome): Applied {
        if (result.outcome === 'skippedUnlinked') {
            this.counts.skippedUnlinked += 1;
            return { ...NOTHING, outcome: 'ignored' };
        }
        return { ...NOTHING, rows: result.rows, outcome: result.outcome };
    }

    // ── Applying ────────────────────────────────────────────────────────────────────────────────────────────

    /** D19: a repeating series in the calendar. The CRM keeps its fields; nothing more is pushed. */
    private async markUnsupported(link: ActivityExternalLink, event: ProviderEvent): Promise<Applied> {
        await prisma.activityExternalLink.updateMany({
            where: { id: link.id, state: { notIn: ['detached', 'unsupported'] } },
            data: { state: 'unsupported', dirtyAt: null, nextAttemptAt: null, etag: event.etag || null, htmlLink: event.htmlLink ?? link.htmlLink, providerUpdatedAt: parseInstant(event.updated) },
        });
        logger.info({ linkId: link.id }, 'Calendar event became a repeating series; the CRM keeps its activity as it is');
        return { ...NOTHING, outcome: 'unsupported' };
    }

    /**
     * §8.9: deleted in the calendar. The activity becomes Cancelled (deletion wins over unsent CRM edits) and the link
     * `cancelled`; a Completed activity or a lead / opportunity follow-up activity stays as it is and its link becomes
     * `removed_remote` ("Add again", or the record's next slot change, creates it again).
     */
    private async remoteDelete(link: ActivityExternalLink): Promise<Applied> {
        const now = this.clock();
        return runInTransaction(async (tx) => {
            await lockRecords(tx, 'activity', [link.activityId]);
            const activity = await tx.activity.findUnique({ where: { id: link.activityId }, select: { id: true, status: true, origin: true, isDeleted: true } });
            const current = await tx.activityExternalLink.findUnique({ where: { id: link.id } });
            if (!activity || !current || current.state === 'detached' || current.state === 'unsupported' || current.state === 'cancelled') return NOTHING;
            if (activity.isDeleted) {
                await tx.activityExternalLink.updateMany({ where: { id: link.id }, data: { state: 'cancelled', baseJson: null, etag: null, dirtyAt: null, nextAttemptAt: null } });
                return { ...NOTHING, outcome: 'deleted' };
            }
            if (activity.status === 'Completed' || activity.origin === FOLLOW_UP_ORIGIN) {
                await tx.activityExternalLink.updateMany({ where: { id: link.id }, data: { state: 'removed_remote', etag: null, lastErrorCode: null, lastErrorMessage: null } });
                return { ...NOTHING, outcome: 'deleted' };
            }
            const rows: ActivityCommitRow[] = [];
            if (activity.status !== 'Cancelled') {
                const written = await applySystemPatch(tx, activity.id, { status: 'Cancelled' }, this.connection.username, now, { activityConfig: this.config, markSync: false, notify: true });
                await this.stampExternal(tx, activity.id, written.after.updatedAt, now);
                rows.push(written);
            }
            await tx.activityExternalLink.updateMany({
                where: { id: link.id },
                data: { state: 'cancelled', baseJson: null, etag: null, dirtyAt: null, nextAttemptAt: null, lastErrorCode: null, lastErrorMessage: null },
            });
            return { ...NOTHING, rows, outcome: 'deleted' };
        });
    }

    /** The record's open follow-up activity is this one: Planned, live, and the one a record lookup finds (§11.5). */
    private async isOpenFollowUp(tx: TransactionClient, activity: ActivityRow): Promise<boolean> {
        if (activity.status !== PLANNED_STATUS) return false;
        const open = await tx.activity.findFirst({
            where: { origin: FOLLOW_UP_ORIGIN, status: PLANNED_STATUS, isDeleted: false, relatedModule: activity.relatedModule, relatedId: activity.relatedId },
            select: { id: true },
        });
        return open?.id === activity.id;
    }

    /** `Activity.externalUpdatedAt` ("Updated from Google Calendar 10:42"), written with `updatedAt` kept (§4.4). */
    private async stampExternal(tx: TransactionClient, activityId: string, updatedAt: Date, now: Date): Promise<void> {
        await tx.activity.updateMany({ where: { id: activityId, updatedAt }, data: { externalUpdatedAt: now, updatedAt } });
    }

    /**
     * Merge (and relink / reconfirm) of one organizer copy in one transaction: the record lock first for a follow-up
     * activity (lead / opportunity saves take it before the activity's), then the activity lock; the activity and link
     * are re-read under the locks, so a CRM save that landed meanwhile is merged rather than overwritten.
     */
    private async merge(
        event: ProviderEvent,
        activityId: string,
        link: ActivityExternalLink | null,
        mode: { tooLong: boolean; relink?: boolean; reconfirm?: boolean },
    ): Promise<Applied> {
        const head = await prisma.activity.findUnique({ where: { id: activityId }, select: { relatedModule: true, relatedId: true, origin: true } });
        if (!head) return NOTHING;
        const followUpRecord = head.origin === FOLLOW_UP_ORIGIN && isFollowUpModule(head.relatedModule) && Boolean(head.relatedId);
        const now = this.clock();

        return runInTransaction(async (tx) => {
            if (followUpRecord) await lockRecords(tx, FOLLOW_UP_LOCK_ENTITY[head.relatedModule as FollowUpModule], [head.relatedId as string]);
            await lockRecords(tx, 'activity', [activityId]);
            const activity = (await tx.activity.findUnique({ where: { id: activityId }, include: WITH_ATTENDEES })) as ActivityRow | null;
            if (!activity || activity.isDeleted) return NOTHING;
            // §11.5: only the record's open follow-up activity (Planned) moves with the calendar and writes back. An
            // older one (Completed when a response was recorded) keeps its time: its event never moves from the CRM
            // again (completion never moves an event), and a calendar move of it changes neither it nor the record.
            const followUp = followUpRecord && (await this.isOpenFollowUp(tx, activity));

            let current: ActivityExternalLink | null;
            if (mode.relink) {
                current = await tx.activityExternalLink.findFirst({ where: { activityId, connectionId: this.connection.id } });
                // Linked to another event already (a different copy of the meeting): leave it.
                if (current?.externalEventId && current.externalEventId !== event.id && !['detached', 'cancelled'].includes(current.state)) return { ...NOTHING, outcome: 'ignored' };
                const holder = await tx.activityExternalLink.findFirst({ where: { connectionId: this.connection.id, externalEventKey: eventKeyOf(event.id) } });
                if (holder && holder.id !== current?.id) return { ...NOTHING, outcome: 'ignored' };
            } else {
                current = await tx.activityExternalLink.findUnique({ where: { id: (link as ActivityExternalLink).id } });
                if (!current || current.externalEventId !== event.id) return NOTHING;
                if (['detached', 'unsupported', 'removed_remote'].includes(current.state)) return { ...NOTHING, outcome: 'ignored' };
                if (mode.reconfirm ? current.state !== 'cancelled' : current.state === 'cancelled') return { ...NOTHING, outcome: 'ignored' };
                if (!mode.reconfirm && current.etag && current.etag === event.etag) return NOTHING;
            }

            const linkLike = { invites: current?.invites ?? 'send', heldAttendeesJson: current?.heldAttendeesJson ?? null, externalEventId: mode.relink ? null : event.id };
            const storedBase = mode.relink || mode.reconfirm ? null : parseBase(current?.baseJson);
            const { resolved, crmNow } = await inboundCrmNow(tx, activity, linkLike, storedBase, this.connection.accountEmail, this.settings.companyDomains);
            const invites = mode.relink && !current ? (Object.keys(crmNow.attendees).every((email) => email in event.shape.attendees) ? 'send' : 'withhold') : linkLike.invites;
            const relinkCrmNow = invites === 'withhold' ? { ...crmNow, attendees: {} } : crmNow;
            // Reconfirm: the calendar holds the meeting again, as the organizer left it: its fields win.
            const base: SyncBase | null = mode.reconfirm ? { crm: crmNow, provider: providerShapeOf(crmNow, event.shape) } : storedBase;
            const plan = planInbound({
                base,
                crmNow: mode.relink ? relinkCrmNow : crmNow,
                event,
                crmChangedAt: activity.updatedAt,
                invitesSent: invites === 'send',
                followUp,
                tooLong: mode.tooLong,
                keepCrmWhen: followUpRecord && !followUp,
                activity,
                companyDomains: this.settings.companyDomains,
            });

            const patch: Partial<SystemActivityFields> = { ...plan.patch };
            if (mode.reconfirm && activity.status === 'Cancelled') patch.status = 'Planned';
            if (plan.applyAttendees) {
                const target = { ...plan.merge.merged.attendees };
                // Held guests (D41) aren't on the event but stay in the CRM.
                for (const email of parseHeld(current?.heldAttendeesJson)) if (!(email in target) && resolved.attendees[email]) target[email] = resolved.attendees[email];
                const inputs = await attendeeInputsFromProvider(tx, activity.attendees, resolved.emailOf, target, activity.assignedTo);
                const capped = await capInboundAttendees(tx, inputs, activity.attendees, resolved.emailOf);
                if (capped.kept) {
                    // §8.10: guests past the 50 cap stay on the provider only. The agreed CRM side lists just the
                    // addresses the CRM holds, so the push keeps the others on the event and the next pull doesn't
                    // read them as removed in the CRM.
                    const kept = capped.kept;
                    plan.merge.base.crm.attendees = Object.fromEntries(Object.entries(plan.merge.base.crm.attendees).filter(([email]) => kept.has(email)));
                }
                if (!capped.unchanged) patch.attendees = capped.inputs;
            }

            const records: FollowUpModule[] = [];
            if (plan.followUp && followUp) {
                const written = await rescheduleRecordFromCalendar(tx, head.relatedModule as FollowUpModule, head.relatedId as string, plan.followUp.when, this.connection.username);
                if (written.changed) records.push(head.relatedModule as FollowUpModule);
            }

            const rows: ActivityCommitRow[] = [];
            // P2-8: the organizer's own copy linked at last: the meeting is theirs (two-way, unlocked) from now on.
            const upgrade = Boolean(mode.relink && activity.externalOrganizer);
            if (Object.keys(patch).length > 0 || upgrade) {
                const written = await applySystemPatch(tx, activityId, patch, this.connection.username, now, {
                    activityConfig: this.config,
                    markSync: false,
                    notify: true,
                    ...(upgrade ? { rowData: { externalOrganizer: false } } : {}),
                });
                await this.stampExternal(tx, activityId, written.after.updatedAt, now);
                rows.push(written);
            }

            const wake: DirtyLink[] = [];
            const dirty = plan.markDirty || Boolean(current?.dirtyAt);
            const tooLongNow = mode.tooLong;
            // The follow-up time note stays until the calendar moves the activity again.
            const clearNote = !plan.note && Boolean(current?.lastWarning?.startsWith(FOLLOW_UP_TIME_KEPT_PREFIX)) && plan.merge.apply.includes('when');
            const data: Prisma.ActivityExternalLinkUncheckedUpdateManyInput = {
                etag: event.etag || null,
                providerUpdatedAt: parseInstant(event.updated),
                htmlLink: event.htmlLink ?? current?.htmlLink ?? null,
                baseJson: JSON.stringify(plan.merge.base),
                crmSyncedAt: rows[0]?.after.updatedAt ?? activity.updatedAt,
                ...(plan.merge.conflicts.length > 0 ? { lastConflictAt: now } : {}),
                ...(tooLongNow
                    ? { lastErrorCode: TOO_LONG_CODE, lastErrorMessage: TOO_LONG_MESSAGE }
                    : current?.lastErrorCode === TOO_LONG_CODE
                      ? { lastErrorCode: null, lastErrorMessage: null }
                      : {}),
                ...(plan.note ? { lastWarning: plan.note } : clearNote ? { lastWarning: null } : {}),
            };
            if (plan.merge.conflicts.length > 0) logger.info({ linkId: current?.id, groups: plan.merge.conflicts }, 'Calendar and CRM both changed the event; merged');

            if (mode.relink) {
                const identity = {
                    externalEventId: event.id,
                    externalEventKey: eventKeyOf(event.id),
                    iCalUid: event.iCalUid || null,
                    role: 'organizer',
                    lastSyncedAt: now,
                };
                if (current) {
                    await tx.activityExternalLink.updateMany({
                        where: { id: current.id },
                        data: { ...data, ...identity, state: dirty ? 'pending' : 'synced', ...(plan.markDirty && !current.dirtyAt ? { dirtyAt: now, nextAttemptAt: null } : {}) },
                    });
                    if (plan.markDirty && !current.dirtyAt) wake.push({ id: current.id, dirtyAt: now });
                } else {
                    const created = await tx.activityExternalLink.create({
                        data: {
                            ...(data as Omit<Prisma.ActivityExternalLinkUncheckedCreateInput, 'activityId' | 'connectionId' | 'provider' | 'requestedId'>),
                            ...identity,
                            activityId,
                            connectionId: this.connection.id,
                            provider: this.provider,
                            requestedId: requestedIdFor(activityId, this.connection.id, 0),
                            invites,
                            state: plan.markDirty ? 'pending' : 'synced',
                            ...(plan.markDirty ? { dirtyAt: now } : {}),
                        },
                        select: { id: true },
                    });
                    if (plan.markDirty) wake.push({ id: created.id, dirtyAt: now });
                }
                if (event.iCalUid) await this.claimIdentity(tx, activityId, event.iCalUid);
                logger.info({ activityId, connectionId: this.connection.id }, 'Calendar event linked again to its CRM activity');
            } else {
                const target = current as ActivityExternalLink;
                const state = mode.reconfirm ? (dirty ? 'pending' : 'synced') : target.state;
                await tx.activityExternalLink.updateMany({
                    where: { id: target.id },
                    data: { ...data, state, ...(plan.markDirty && !target.dirtyAt ? { dirtyAt: now, state: 'pending', nextAttemptAt: null } : {}) },
                });
                if (plan.markDirty && !target.dirtyAt) wake.push({ id: target.id, dirtyAt: now });
            }

            const outcome: Applied['outcome'] = mode.relink ? 'relinked' : rows.length > 0 || records.length > 0 ? 'applied' : 'unchanged';
            return { rows, wake, records, outcome };
        });
    }

    /** Relink: `Activity.iCalUid / syncKey` when no other activity holds that event's identity (pre-read, D45). */
    private async claimIdentity(tx: TransactionClient, activityId: string, iCalUid: string): Promise<void> {
        const syncKey = syncKeyOf(iCalUid);
        const holder = await tx.activity.findFirst({ where: { syncKey }, select: { id: true } });
        const current = await tx.activity.findUnique({ where: { id: activityId }, select: { updatedAt: true, syncKey: true } });
        if (!current) return;
        const claim = !holder || holder.id === activityId;
        if (current.syncKey === syncKey) return;
        await tx.activity.updateMany({
            where: { id: activityId, updatedAt: current.updatedAt },
            data: { iCalUid, ...(claim ? { syncKey } : {}), updatedAt: current.updatedAt },
        });
    }

    /** Graph `@removed` / a synced link the full listing didn't show: read it back; gone → deletion, found → a change. */
    private async readBack(link: ActivityExternalLink): Promise<Applied> {
        if (!link.externalEventId || ['detached', 'unsupported', 'removed_remote', 'cancelled'].includes(link.state)) return NOTHING;
        let event: ProviderEvent | null;
        try {
            event = await this.withAccess((ctx) => this.adapter.getEvent(ctx, link.externalEventId as string));
        } catch (err) {
            if (err instanceof LeaseLostError || err instanceof ConnectionUnavailableError || err instanceof ProviderRateLimitedError) throw err;
            this.counts.failed += 1;
            logger.warn({ linkId: link.id, err: (err as Error).message }, 'Could not read a calendar event back');
            return NOTHING;
        }
        const activity = await prisma.activity.findUnique({ where: { id: link.activityId }, select: { isDeleted: true, status: true } });
        if (!event) {
            // An invitation copy that's gone is that person's copy only (sync.import.ts), never a deletion of the meeting.
            if (link.role === 'attendee') return this.applySafely({ ...placeholderEvent(link), isOrganizerCopy: false }, link, { kind: 'attendee' });
            const applied = activity && !activity.isDeleted ? await this.applySafely({ ...placeholderEvent(link), status: 'cancelled' }, link, { kind: 'remoteDelete' }) : NOTHING;
            return applied;
        }
        return this.applySafely(event, link, classifyInbound({ event, link, activity: activity ?? null, match: null }));
    }

    /** §8.11: after a full listing, synced links inside the window it didn't show are read back (never cancelled on absence). */
    private async verifyMissing(seen: ReadonlySet<string>, window: { start: Date; end: Date }): Promise<void> {
        const links = await prisma.activityExternalLink.findMany({ where: { connectionId: this.connection.id, role: 'organizer', state: 'synced' } });
        const unseen = links.filter((l) => l.externalEventKey && !seen.has(l.externalEventKey));
        if (unseen.length === 0) return;
        const activities = await prisma.activity.findMany({ where: { id: { in: unseen.map((l) => l.activityId) }, isDeleted: false }, select: { id: true, startAt: true } });
        const inside = new Set(
            activities.filter((a) => a.startAt && a.startAt.getTime() >= window.start.getTime() && a.startAt.getTime() <= window.end.getTime()).map((a) => a.id),
        );
        const rows: ActivityCommitRow[] = [];
        const wake: DirtyLink[] = [];
        const records = new Set<FollowUpModule>();
        for (const link of unseen.filter((l) => inside.has(l.activityId)).slice(0, VERIFY_MISSING_LIMIT)) {
            this.counts.verified += 1;
            const applied = await this.readBack(link);
            rows.push(...applied.rows);
            wake.push(...applied.wake);
            for (const r of applied.records) records.add(r);
        }
        await this.afterCommit(rows, wake, records);
    }

    // ── Finishing ───────────────────────────────────────────────────────────────────────────────────────────

    private async afterCommit(rows: ActivityCommitRow[], wake: DirtyLink[], records: ReadonlySet<FollowUpModule>): Promise<void> {
        try {
            if (rows.length > 0 || records.size > 0) await cacheService.invalidateEntityCaches('activities');
            for (const module of records) await cacheService.invalidateEntityCaches(module);
            if (rows.length > 0) await runActivityPostCommit(rows, this.connection.username, { skipPush: true });
            if (wake.length > 0) await wakePushes(wake);
        } catch (err) {
            logger.warn({ connectionId: this.connection.id, err: (err as Error).message }, 'Calendar pull post-commit step failed (the sweeps cover it)');
        }
    }

    /** Cursor (only when every item applied, or after PULL_HOLD_CURSOR_RUNS runs with failures), bookkeeping. */
    private async finish(full: boolean, nextCursor: string | null, window: { start: Date; end: Date }): Promise<void> {
        const now = this.clock();
        const id = this.connection.id;
        let saveCursor = nextCursor !== null;
        if (nextCursor && this.counts.failed > 0) {
            const runs = (heldCursorRuns.get(id) ?? 0) + 1;
            if (runs < PULL_HOLD_CURSOR_RUNS) {
                heldCursorRuns.set(id, runs);
                saveCursor = false;
                logger.warn({ connectionId: id, failed: this.counts.failed, runs }, 'Calendar pull kept its cursor (some changes failed); the next pull replays them');
            } else {
                heldCursorRuns.delete(id);
                logger.warn({ connectionId: id, failed: this.counts.failed }, 'Calendar pull moved on past changes that keep failing');
            }
        } else if (saveCursor) heldCursorRuns.delete(id);
        if (!nextCursor) logger.warn({ connectionId: id, pages: this.counts.pages }, 'Calendar pull ended without a cursor; the next pull continues from the old one');

        await prisma.calendarConnection.updateMany({
            where: { id },
            data: {
                lastPulledAt: now,
                lastSuccessAt: now,
                ...(saveCursor ? { syncCursor: nextCursor } : {}),
                ...(saveCursor && full ? { syncWindowStart: window.start, syncWindowEnd: window.end, ...(this.connection.fullSyncAt ? {} : { fullSyncAt: now }) } : {}),
            },
        });
    }
}

/** A provider shape equal to the CRM's (reconfirm base: every group the calendar differs in counts as its change). */
function providerShapeOf(crm: CrmShape, provider: ProviderShape): ProviderShape {
    return {
        subject: crm.subject,
        when: { ...crm.when },
        location: crm.location,
        status: 'active',
        attendees: Object.fromEntries(Object.entries(crm.attendees).map(([email, a]) => [email, { response: a.response, optional: false, resource: false }])),
        reminderMinutes: provider.reminderMinutes,
        description: provider.description,
        organizerEmail: provider.organizerEmail,
    };
}

/** A deleted event as the classifier needs it (only the id and status matter). */
function placeholderEvent(link: ActivityExternalLink): ProviderEvent {
    return {
        id: link.externalEventId as string,
        iCalUid: link.iCalUid ?? '',
        etag: '',
        updated: '',
        status: 'cancelled',
        isOrganizerCopy: true,
        organizerEmail: '',
        shape: {
            subject: '',
            when: { allDay: false, start: '', end: '' },
            location: '',
            status: 'cancelled',
            attendees: {},
            reminderMinutes: null,
            description: '',
            organizerEmail: '',
        },
        recurring: false,
        eventType: 'default',
        isPrivate: false,
    };
}
