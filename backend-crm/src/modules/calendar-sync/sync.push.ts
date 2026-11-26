import { ENV } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { prisma, type TransactionClient } from '../../config/prisma.js';
import type { ActivityExternalLink, CalendarConnection } from '../../generated/prisma/client.js';
import { runWithAuditOrigin } from '../../services/auditContext.js';
import { cacheService } from '../../services/cache.service.js';
import { isUniqueViolation } from '../../utils/prismaErrors.js';
import type { ActivityRow } from '../activities/activity.mapper.js';
import { loadActivityConfig, runActivityPostCommit, WITH_ATTENDEES, type ActivityCommitRow, type ActivityConfig } from '../activities/activity.service.js';
import { applySystemPatch, type SystemActivityFields } from '../activities/activity.system.js';
import type { CalendarSyncSettings } from '../integrations/calendarSyncSettings.js';
import { loadCalendarSettings } from '../integrations/integration.settings.js';
import { notify } from '../notifications/notification.producer.js';
import { runInTransaction } from '../shared/transactions.js';
import { ConnectionUnavailableError, withCalendarAccess } from './calendarAccess.js';
import { isLiveStatus, type CalendarProvider } from './connection.constants.js';
import {
    ProviderBadRequestError,
    ProviderConflictError,
    ProviderNotFoundError,
    ProviderPreconditionError,
    ProviderRateLimitedError,
    RequestedIdTakenError,
} from './providers/http.js';
import { getAdapter } from './providers/registry.js';
import type { CalendarProviderAdapter, CallCtx, CreateEventInput } from './providers/types.js';
import { attendeeInputsFromProvider, heldEmailsOf, patchAttendees, resolveAttendeeEmails, skippedWarning, withoutHeld, type ResolvedAttendees } from './sync.attendees.js';
import {
    ERROR_RETRY_MAX_MS,
    ERROR_RETRY_STEP_MS,
    GATED_RETRY_MS,
    LEASE_CALL_HEADROOM_MS,
    MAX_PRECONDITION_LOOPS,
    SYNC_ERROR_CODES,
    syncAuditRoute,
    TRANSIENT_RETRY_HOLD_MS,
    type LinkState,
} from './sync.constants.js';
import { eventKeyOf, requestedIdFor, syncKeyOf } from './sync.keys.js';
import { invitationsOf, type EventContext } from './sync.mapping.google.js';
import { keptFollowUpNote } from './sync.inbound.js';
import { planMerge, systemPatchOf } from './sync.merge.js';
import { syncErrorNotification } from './sync.notifications.js';
import { isCreateEligible, isTypeSyncable } from './sync.outbox.js';
import { planPush, shouldSendUpdates, type PushPlan } from './sync.plan.js';
import { claimLease, type Lease } from './sync.lease.js';
import { allInternal, crmActivityUrl, crmShapeOf, internalDescription, parseBase, peopleOf, type CrmShape, type FieldGroup, type ProviderEvent, type SyncBase } from './sync.shapes.js';

export { parseBase } from './sync.shapes.js';

/**
 * `pushLink(linkId)` (Calendar Phase 2 spec §8.6; admin-managed model: addendum §8): makes one calendar copy match its
 * activity. Runs under the connection's lease and the audit origin `job:calendar-sync:<provider>` (actor = the
 * connection's user), whether the worker or the API (Redis down) calls it. Every provider call goes through
 * `withCalendarAccess` (company credentials, a token minted per call, Graph `/users/{mailbox}`). Steps:
 *
 * 1. Leave when the link is clean (an older job for an already-pushed version) or the kill switch is off. Gates: a
 *    `stopped` row detaches the link without a provider call; a row in `error` (a user-level problem), an inactive
 *    user, a provider that is off or unhealthy → skipped, the link stays dirty and waits 15 minutes
 *    (`nextAttemptAt`); it pushes once the row recovers (due checks, then the outbox sweep / `enrolled` job).
 * 2. Resolve the attendees (§8.10) minus held ones (D41; none on a private copy), build the description (D15: only
 *    while everyone on the event is internal), `planPush`.
 * 3. cancel / detach / create / patch / noop; a 412 merges the calendar's change into the CRM (sync.merge.ts) and
 *    retries with the new etag (≤ 3 loops); a 404 on patch is the calendar's deletion (§8.9).
 * 4. Success clears `dirtyAt` with compare-and-set: an edit that landed meanwhile keeps the link dirty (its job is
 *    queued), only the provider's answer (etag, base) is stored.
 *
 * Errors: user- / app-level failures are classified by `withCalendarAccess` (row → `error` / provider health → `error`
 * with the admins told) and the push is skipped; 400-class → link `error`, not retried until the next edit / nightly,
 * one `calendar_sync_error` to the owner; rate limit → `rate_limited` (the job delays itself); anything else (a
 * persistent 401 included) is thrown for BullMQ's backoff, the link put back 10 minutes so the sweep doesn't start a
 * second retry chain (`markPushExhausted` after the last attempt). A link whose event is gone (`cancelled`,
 * `removed_remote`) keeps that state through an error, so the next try still restores instead of patching.
 *
 * Lease (D12): checked (and extended when less than LEASE_CALL_HEADROOM_MS is left) before every provider call; a
 * push that lost it stops without storing anything and answers `busy` (the job moves itself back).
 */

export type PushResult =
    /** Nothing to do: the link is gone or already clean. */
    | { status: 'clean' }
    /** A gate said no (kill switch, row in error, provider off / unhealthy, user inactive): the link stays dirty. */
    | { status: 'skipped'; reason: string }
    /** Another process holds the connection's lease. */
    | { status: 'busy' }
    | { status: 'rate_limited'; retryAfterMs: number }
    | { status: 'done'; action: PushPlan['action']; state: LinkState; stillDirty: boolean };

export interface PushOptions {
    now?: () => Date;
    /** Retry / Add again: a `removed_remote` link is created again (P2-3c). */
    force?: boolean;
}

/** The lease ran out during a long push and another job took it (D12): stop without storing anything. */
class LeaseLostError extends Error {
    constructor() {
        super('Calendar connection lease lost');
        this.name = 'LeaseLostError';
    }
}

/** States that say the link's event is gone; an error never overwrites them (the plan restores from them). */
const EVENT_GONE_STATES: ReadonlySet<string> = new Set<LinkState>(['cancelled', 'removed_remote']);

/** A lead / opportunity follow-up activity (P2-4: schedule, type, status, owner and related record follow the record). */
const isFollowUp = (activity: Pick<ActivityRow, 'origin'>) => activity.origin === 'followup';

const parseInstant = (value: string): Date | null => {
    const ms = Date.parse(value);
    return Number.isNaN(ms) ? null : new Date(ms);
};

export async function pushLink(linkId: string, options: PushOptions = {}): Promise<PushResult> {
    const clock = options.now ?? (() => new Date());
    if (!ENV.INTEGRATIONS.SYNC_ENABLED) return { status: 'skipped', reason: 'sync_disabled' };
    const head = await prisma.activityExternalLink.findUnique({ where: { id: linkId }, select: { connectionId: true, provider: true, dirtyAt: true } });
    if (!head?.dirtyAt) return { status: 'clean' };
    const connection = await prisma.calendarConnection.findUnique({ where: { id: head.connectionId } });
    if (!connection) return { status: 'clean' };
    const user = await prisma.user.findUnique({ where: { username: connection.username }, select: { id: true, isActive: true, isGroupUser: true } });
    const live = isLiveStatus(connection.status);
    // D43: an inactive user's row does nothing (links stay dirty until the nightly reconcile stops the row and detaches
    // them). A row in error waits for its health check to succeed.
    if (live && (!user?.isActive || user.isGroupUser)) return gated(linkId, head.dirtyAt, 'user_inactive', clock());
    if (connection.status === 'error') return gated(linkId, head.dirtyAt, 'connection_error', clock());
    return runWithAuditOrigin({ source: 'JOB', route: syncAuditRoute(head.provider), actorId: user?.id }, () => pushWithLease(linkId, head.dirtyAt as Date, connection, clock, options));
}

/** A skipped push: the link stays dirty and the sweep leaves it alone for 15 minutes (the `enrolled` job doesn't wait). */
async function gated(linkId: string, dirtyAt: Date, reason: string, now: Date, waitMs: number = GATED_RETRY_MS): Promise<PushResult> {
    await prisma.activityExternalLink.updateMany({ where: { id: linkId, dirtyAt }, data: { nextAttemptAt: new Date(now.getTime() + waitMs) } });
    return { status: 'skipped', reason };
}

async function pushWithLease(linkId: string, dirtyAt: Date, connection: CalendarConnection, clock: () => Date, options: PushOptions): Promise<PushResult> {
    const lease = await claimLease(prisma, connection.id, clock());
    if (!lease) return { status: 'busy' };
    try {
        return await new LinkPush(linkId, connection, clock, options, lease).run();
    } catch (err) {
        if (err instanceof LeaseLostError) {
            logger.warn({ linkId, connectionId: connection.id }, 'Calendar lease lost during a push; moved back');
            return { status: 'busy' };
        }
        // The row went to error / the provider is off or unhealthy (withCalendarAccess classified and recorded it).
        if (err instanceof ConnectionUnavailableError) return gated(linkId, dirtyAt, err.reason, clock());
        if (err instanceof ProviderRateLimitedError) {
            const retryAfterMs = err.retryAfterMs ?? 60_000;
            await prisma.activityExternalLink.updateMany({ where: { id: linkId, dirtyAt }, data: { nextAttemptAt: new Date(clock().getTime() + retryAfterMs) } });
            return { status: 'rate_limited', retryAfterMs };
        }
        // BullMQ owns the retry now: the sweep leaves the link alone meanwhile (markPushExhausted sets the long wait).
        await prisma.activityExternalLink
            .updateMany({ where: { id: linkId, dirtyAt }, data: { nextAttemptAt: new Date(clock().getTime() + TRANSIENT_RETRY_HOLD_MS) } })
            .catch((holdErr: Error) => logger.warn({ err: holdErr.message, linkId }, 'Could not put a failed calendar push back'));
        throw err;
    } finally {
        await lease.release().catch((err: Error) => logger.warn({ err: err.message, connectionId: connection.id }, 'Could not release the calendar lease (it expires on its own)'));
    }
}

/** What one round of a push knows about its link and activity. */
interface Round {
    link: ActivityExternalLink;
    activity: ActivityRow;
    base: SyncBase | null;
    resolved: ResolvedAttendees;
    crmNow: CrmShape;
    plan: PushPlan;
}

class LinkPush {
    private settings!: CalendarSyncSettings;
    private config!: ActivityConfig;
    private readonly provider: CalendarProvider;
    private readonly adapter: CalendarProviderAdapter;
    private readonly linkId: string;
    private readonly connection: CalendarConnection;
    private readonly clock: () => Date;
    private readonly options: PushOptions;
    private readonly lease: Lease;

    constructor(linkId: string, connection: CalendarConnection, clock: () => Date, options: PushOptions, lease: Lease) {
        this.linkId = linkId;
        this.connection = connection;
        this.clock = clock;
        this.options = options;
        this.lease = lease;
        this.provider = connection.provider as CalendarProvider;
        this.adapter = getAdapter(this.provider);
    }

    async run(): Promise<PushResult> {
        [this.settings, this.config] = await Promise.all([loadCalendarSettings(), loadActivityConfig()]);
        for (let loop = 0; ; loop += 1) {
            await this.holdLease();
            const round = await this.load();
            if (!round) return { status: 'clean' };
            try {
                return await this.act(round);
            } catch (err) {
                if (err instanceof ProviderPreconditionError) {
                    if (loop + 1 >= MAX_PRECONDITION_LOOPS) {
                        logger.warn({ linkId: this.linkId, loops: loop + 1 }, 'Calendar event keeps changing under the push; giving up for now');
                        return this.fail(round, SYNC_ERROR_CODES.conflictLoop, null);
                    }
                    const merged = await this.mergeAfterPrecondition(round);
                    if (merged) return merged;
                    continue;
                }
                if (err instanceof ProviderNotFoundError && round.plan.action === 'patch') return this.remoteDeletion(round);
                if (err instanceof ProviderBadRequestError || err instanceof ProviderConflictError) {
                    return this.fail(round, err.code, err instanceof ProviderBadRequestError ? err.providerMessage : null);
                }
                throw err;
            }
        }
    }

    // ── Loading and planning ────────────────────────────────────────────────────────────────────────────────

    private async load(): Promise<Round | null> {
        const link = await prisma.activityExternalLink.findUnique({ where: { id: this.linkId } });
        if (!link?.dirtyAt) return null;
        const activity = (await prisma.activity.findUnique({ where: { id: link.activityId }, include: WITH_ATTENDEES })) as ActivityRow | null;
        if (!activity) return null;
        const now = this.clock();
        const owner = activity.assignedTo;
        const base = parseBase(link.baseJson);
        const resolved = await resolveAttendeeEmails(prisma, activity.attendees, owner, this.connection.accountEmail);
        const invited = link.invites === 'withhold' ? {} : withoutHeld(resolved.attendees, heldEmailsOf(link.heldAttendeesJson, activity.attendees, resolved.emailOf));
        // D15: the internal text only while everyone on the event (after this push) is a company address.
        const onEvent = base && link.externalEventId ? peopleOf(patchAttendees(base.provider.attendees, base.crm.attendees, invited)) : invited;
        const description = allInternal(Object.keys(onEvent), this.settings.companyDomains)
            ? internalDescription({ followupType: activity.followupType, relatedCode: activity.relatedCode, activityId: activity.id, appUrl: ENV.MAIL.APP_PUBLIC_URL })
            : '';
        const crmNow = crmShapeOf(activity, invited, description);
        const plan = planPush({
            activity: { isDeleted: activity.isDeleted, status: activity.status, hasSchedule: Boolean(activity.startAt), externalOrganizer: activity.externalOrganizer },
            link: { state: link.state, externalEventId: link.externalEventId, base },
            ownersConnection: this.connection.username.toLowerCase() === owner.toLowerCase(),
            connectionLive: isLiveStatus(this.connection.status),
            createEligible: isCreateEligible(activity, this.config, now),
            typeSyncable: isTypeSyncable(activity.followupType, this.config),
            crmNow,
            force: this.options.force,
        });
        return { link, activity, base, resolved, crmNow, plan };
    }

    /** The lease still ours, with room for one more provider call (D12); throws LeaseLostError otherwise. */
    private async holdLease(): Promise<void> {
        if (!(await this.lease.keepAlive(this.clock(), LEASE_CALL_HEADROOM_MS))) throw new LeaseLostError();
    }

    /** One provider call through `withCalendarAccess` (gates, a minted token, one retry after a 401, failure classification). */
    private async withToken<T>(fn: (ctx: CallCtx) => Promise<T>): Promise<T> {
        await this.holdLease();
        return withCalendarAccess(this.connection.id, (ctx) => fn(ctx), { clock: this.clock });
    }

    /** Zone of a patched event: Google keeps the event's own display zone; Graph all-day midnights use the activity's. */
    private patchZone(round: Round): string {
        if (this.provider === 'microsoft') return round.activity.timeZone;
        return round.base?.provider.when.timeZone || round.activity.timeZone;
    }

    private eventContext(activity: ActivityRow): EventContext {
        return {
            activityId: activity.id,
            timeZone: activity.timeZone,
            visibility: this.settings.eventVisibility,
            crmUrl: crmActivityUrl(ENV.MAIL.APP_PUBLIC_URL, activity.id),
            crmLabel: activity.relatedCode ? `Nandini CRM · ${activity.relatedCode}` : 'Nandini CRM',
        };
    }

    // ── Actions ─────────────────────────────────────────────────────────────────────────────────────────────

    private async act(round: Round): Promise<PushResult> {
        const { plan, link } = round;
        // P2-5: a follow-up's "keeps a time" note (sync.inbound.ts) survives the push that re-times the event.
        const warning =
            skippedWarning(round.resolved.skipped) ??
            keptFollowUpNote(link.lastWarning, round.activity.externalUpdatedAt, this.clock(), { base: round.base?.crm.when, crmNow: round.crmNow.when });
        switch (plan.action) {
            case 'noop':
                return this.settle(round, plan.state, { lastWarning: warning });
            case 'detach':
                return this.settle(round, 'detached', {});
            case 'cancel': {
                const guests = Object.keys(peopleOf(round.base?.provider.attendees ?? {})).length > 0;
                await this.withToken((ctx) => this.adapter.cancelEvent(ctx, link.externalEventId as string, { sendUpdates: link.invites === 'send' && guests }));
                const result = await this.settle(round, 'cancelled', { baseJson: null, etag: null, lastErrorCode: null, lastErrorMessage: null, lastSyncedAt: this.clock() });
                await this.touchConnection();
                return result;
            }
            case 'create':
                return this.create(round, plan, warning);
            case 'patch':
                return this.patch(round, plan.groups, warning);
        }
    }

    private async create(round: Round, plan: Extract<PushPlan, { action: 'create' }>, warning: string | null): Promise<PushResult> {
        const { link, activity, crmNow } = round;
        let generation = link.generation;
        let requestedId = link.requestedId;
        const bump = () => {
            generation += 1;
            requestedId = requestedIdFor(activity.id, link.connectionId, generation);
        };
        if (plan.newGeneration) bump();
        const input = (id: string): CreateEventInput => ({
            crm: crmNow,
            event: this.eventContext(activity),
            requestedId: id,
            attendees: invitationsOf(crmNow),
            sendUpdates: link.invites === 'send' && Object.keys(crmNow.attendees).length > 0,
        });

        const event = await this.withToken(async (ctx) => {
            if (plan.restore && link.externalEventId) {
                // Google brings our deleted copy back under its id [U]; otherwise (or on Graph) a new generation.
                const restored = this.adapter.undeleteEvent ? await this.adapter.undeleteEvent(ctx, link.externalEventId, input(link.externalEventId)) : null;
                if (restored) return restored;
                bump();
                await this.holdLease();
            }
            try {
                return await this.adapter.createEvent(ctx, input(requestedId));
            } catch (err) {
                if (!(err instanceof RequestedIdTakenError)) throw err;
                bump();
                await this.holdLease();
                return this.adapter.createEvent(ctx, input(requestedId));
            }
        });
        if (event.recurring) return this.settle(round, 'unsupported', {});

        const data = {
            ...this.eventColumns(event),
            externalEventId: event.id,
            externalEventKey: eventKeyOf(event.id),
            iCalUid: event.iCalUid || null,
            generation,
            requestedId,
            baseJson: JSON.stringify({ crm: crmNow, provider: event.shape } satisfies SyncBase),
            crmSyncedAt: activity.updatedAt,
            lastWarning: warning,
        };
        const store = (withSyncKey: boolean) =>
            runInTransaction(async (tx) => {
                const result = await this.settle(round, 'synced', data, tx);
                if (event.iCalUid) await this.writeActivityIdentity(tx, activity.id, event.iCalUid, withSyncKey);
                await tx.calendarConnection.update({ where: { id: this.connection.id }, data: { lastPushedAt: this.clock() } });
                return result;
            });
        try {
            return await store(true);
        } catch (err) {
            // D45: never caught inside the transaction. Another activity already holds this event's UID (two calendars
            // holding the same meeting): the link is stored without claiming the identity; P2-5's relink sorts it out.
            if (!isUniqueViolation(err)) throw err;
            logger.warn({ linkId: link.id, activityId: activity.id }, 'Calendar event UID already belongs to another activity; stored without it');
            return store(false);
        }
    }

    /** `Activity.iCalUid / syncKey`, written with `updatedAt` matched and kept, so it never looks like a user edit (§4.4). */
    private async writeActivityIdentity(tx: TransactionClient, activityId: string, iCalUid: string, withSyncKey: boolean): Promise<void> {
        for (let attempt = 0; attempt < 3; attempt += 1) {
            const current = await tx.activity.findUnique({ where: { id: activityId }, select: { updatedAt: true } });
            if (!current) return;
            const { count } = await tx.activity.updateMany({
                where: { id: activityId, updatedAt: current.updatedAt },
                data: { iCalUid, ...(withSyncKey ? { syncKey: syncKeyOf(iCalUid) } : {}), updatedAt: current.updatedAt },
            });
            if (count === 1) return;
        }
    }

    private async patch(round: Round, planned: readonly FieldGroup[], warning: string | null): Promise<PushResult> {
        const { link, base, crmNow, activity } = round;
        // Graph has no reminder on patch (§8.6): a reminder-only change is agreed without a call.
        const groups = this.provider === 'microsoft' ? planned.filter((g) => g !== 'reminder') : planned;
        if (groups.length === 0) {
            return this.settle(round, 'synced', { baseJson: JSON.stringify({ crm: crmNow, provider: base?.provider ?? null }), crmSyncedAt: activity.updatedAt, lastWarning: warning });
        }
        const attendees = base ? patchAttendees(base.provider.attendees, base.crm.attendees, crmNow.attendees) : invitationsOf(crmNow);
        const guests = Object.keys(peopleOf(attendees)).length > 0 || Object.keys(peopleOf(base?.provider.attendees ?? {})).length > 0;
        const event = await this.withToken((ctx) =>
            this.adapter.patchEvent(ctx, link.externalEventId as string, {
                groups,
                crm: crmNow,
                timeZone: this.patchZone(round),
                ...(groups.includes('attendees') ? { attendees } : {}),
                ...(groups.includes('description') ? { description: crmNow.description } : {}),
                ...(link.etag ? { etag: link.etag } : {}),
                sendUpdates: shouldSendUpdates(groups, link.invites, guests),
            }),
        );
        if (event.recurring) return this.settle(round, 'unsupported', this.eventColumns(event));
        const result = await this.settle(round, 'synced', {
            ...this.eventColumns(event),
            baseJson: JSON.stringify({ crm: crmNow, provider: event.shape } satisfies SyncBase),
            crmSyncedAt: activity.updatedAt,
            lastWarning: warning,
        });
        await this.touchConnection();
        return result;
    }

    private eventColumns(event: ProviderEvent) {
        return {
            etag: event.etag || null,
            htmlLink: event.htmlLink ?? null,
            providerUpdatedAt: parseInstant(event.updated),
            lastSyncedAt: this.clock(),
            lastErrorCode: null,
            lastErrorMessage: null,
        };
    }

    private async touchConnection(): Promise<void> {
        await prisma.calendarConnection.updateMany({ where: { id: this.connection.id }, data: { lastPushedAt: this.clock() } });
    }

    // ── The calendar changed under us ───────────────────────────────────────────────────────────────────────

    /** 412: read the event, merge its changes into the CRM, store the new etag / base; null = push again. */
    private async mergeAfterPrecondition(round: Round): Promise<PushResult | null> {
        const { link, activity, crmNow } = round;
        const event = await this.withToken((ctx) => this.adapter.getEvent(ctx, link.externalEventId as string));
        if (!event || event.status === 'cancelled') return this.remoteDeletion(round);
        if (event.recurring) return this.settle(round, 'unsupported', this.eventColumns(event));
        const base: SyncBase = round.base ?? { crm: crmNow, provider: event.shape };
        const merge = planMerge(
            base,
            crmNow,
            event.shape,
            { crmChangedAt: activity.updatedAt, providerChangedAt: parseInstant(event.updated) },
            // A follow-up activity's slot follows its lead / opportunity (P2-4): the CRM's slot is pushed back. Taking
            // the calendar's move onto the record is P2-5 (`rescheduleRecordFromCalendar`).
            { withAttendees: link.invites === 'send', crmOnly: isFollowUp(activity) ? ['when'] : [] },
        );
        if (merge.conflicts.length > 0) logger.info({ linkId: link.id, groups: merge.conflicts }, 'Calendar and CRM both changed the event; merged');

        if (merge.apply.length > 0) {
            const patch: Partial<SystemActivityFields> = systemPatchOf(merge);
            if (merge.apply.includes('attendees')) {
                // Held guests (D41) aren't on the event but stay in the CRM.
                const target = { ...merge.merged.attendees };
                for (const email of heldEmailsOf(link.heldAttendeesJson, activity.attendees, round.resolved.emailOf)) if (!(email in target) && round.resolved.attendees[email]) target[email] = round.resolved.attendees[email];
                patch.attendees = await attendeeInputsFromProvider(prisma, activity.attendees, round.resolved.emailOf, target, activity.assignedTo);
            }
            if (Object.keys(patch).length > 0) await this.applyInbound(activity.id, patch);
        }
        await prisma.activityExternalLink.updateMany({
            where: { id: link.id },
            data: {
                etag: event.etag || null,
                providerUpdatedAt: parseInstant(event.updated),
                baseJson: JSON.stringify(merge.base),
                ...(merge.conflicts.length > 0 ? { lastConflictAt: this.clock() } : {}),
            },
        });
        return null;
    }

    /** A calendar change written to the activity (system write path, not marked for sync: the link is already dirty). */
    private async applyInbound(activityId: string, patch: Partial<SystemActivityFields>): Promise<ActivityCommitRow> {
        const now = this.clock();
        const row = await runInTransaction(async (tx) => {
            const written = await applySystemPatch(tx, activityId, patch, this.connection.username, now, { activityConfig: this.config, markSync: false, notify: true });
            await tx.activity.updateMany({ where: { id: activityId, updatedAt: written.after.updatedAt }, data: { externalUpdatedAt: now, updatedAt: written.after.updatedAt } });
            return written;
        });
        await cacheService.invalidateEntityCaches('activities');
        await runActivityPostCommit([row], this.connection.username, { skipPush: true });
        return row;
    }

    /**
     * The event was deleted in the calendar (§8.9): the activity becomes Cancelled (deletion wins over unsent CRM
     * edits) and the link `cancelled`. A Completed activity, or a lead / opportunity follow-up activity (its status
     * follows the record), stays as it is and its link becomes `removed_remote` (created again on a new slot).
     */
    private async remoteDeletion(round: Round): Promise<PushResult> {
        if (round.activity.status === 'Completed' || isFollowUp(round.activity)) {
            return this.settle(round, 'removed_remote', { etag: null });
        }
        await this.applyInbound(round.activity.id, { status: 'Cancelled' });
        return this.settle(round, 'cancelled', { baseJson: null, etag: null });
    }

    // ── Outcome ─────────────────────────────────────────────────────────────────────────────────────────────

    /** 400-class answer: `error`, not retried until the next edit / nightly / Retry; the owner is told once a day. */
    private async fail(round: Round, code: string, message: string | null): Promise<PushResult> {
        const result = await this.settle(round, 'error', { lastErrorCode: code.slice(0, 100), lastErrorMessage: message ? message.slice(0, 300) : null });
        const { activity } = round;
        try {
            await notify([syncErrorNotification({ activityId: activity.id, owner: activity.assignedTo, subject: activity.subject, provider: this.provider, now: this.clock() })]);
        } catch (err) {
            logger.warn({ err: (err as Error).message, linkId: round.link.id }, 'Could not notify the owner about a calendar sync error');
        }
        logger.warn({ linkId: round.link.id, code }, 'Calendar refused a push');
        return result;
    }

    /**
     * Stores the outcome and clears `dirtyAt` with compare-and-set. When an edit landed during the call (dirtyAt moved),
     * only the provider's answer is stored and the link stays dirty (its own job is queued); provider-truth states
     * (cancelled, removed_remote, unsupported, detached) are stored either way. An error on a link whose event is gone
     * keeps `cancelled` / `removed_remote` (the error code says what failed). When the row was stopped during the call
     * (stopRow detached the link and cleared dirtyAt), the link stays `detached` and only the provider's answer (event
     * id, etag, base) is kept, so a re-attach patches the right event.
     */
    private async settle(round: Round, outcome: LinkState, data: Record<string, unknown>, db: Pick<TransactionClient, 'activityExternalLink'> = prisma): Promise<PushResult> {
        const { link } = round;
        const state: LinkState = outcome === 'error' && EVENT_GONE_STATES.has(link.state) ? (link.state as LinkState) : outcome;
        const columns = outcome !== 'error' && EVENT_GONE_STATES.has(state) ? { lastErrorCode: null, lastErrorMessage: null, ...data } : data;
        const { count } = await db.activityExternalLink.updateMany({
            where: { id: link.id, dirtyAt: link.dirtyAt },
            data: { ...columns, state, dirtyAt: null, nextAttemptAt: null, attempts: 0 },
        });
        if (count === 1) return { status: 'done', action: round.plan.action, state, stillDirty: false };
        const kept: LinkState = state === 'synced' || state === 'error' ? 'pending' : state;
        const { count: dirty } = await db.activityExternalLink.updateMany({
            where: { id: link.id, dirtyAt: { not: null }, state: { not: 'detached' } },
            data: { ...columns, state: kept },
        });
        if (dirty === 1) return { status: 'done', action: round.plan.action, state: kept, stillDirty: true };
        await db.activityExternalLink.updateMany({ where: { id: link.id, state: 'detached' }, data: columns });
        return { status: 'done', action: round.plan.action, state: 'detached', stillDirty: false };
    }
}

/**
 * After BullMQ's last attempt at a transient failure (§8.6 step 8): `error`, still dirty, next try in
 * min(15 min × attempts, 6 h) (the outbox sweep honours `nextAttemptAt`). A link whose event is gone (`cancelled`,
 * `removed_remote`) keeps its state, so the next try restores the event instead of patching one that no longer exists.
 */
export async function markPushExhausted(linkId: string, now: Date = new Date()): Promise<void> {
    const link = await prisma.activityExternalLink.findUnique({ where: { id: linkId }, select: { attempts: true, dirtyAt: true, state: true } });
    if (!link?.dirtyAt || link.state === 'detached') return;
    const attempts = link.attempts + 1;
    await prisma.activityExternalLink.updateMany({
        where: { id: linkId, dirtyAt: link.dirtyAt },
        data: {
            ...(EVENT_GONE_STATES.has(link.state) ? {} : { state: 'error' }),
            attempts,
            lastErrorCode: SYNC_ERROR_CODES.retriesExhausted,
            nextAttemptAt: new Date(now.getTime() + Math.min(ERROR_RETRY_STEP_MS * attempts, ERROR_RETRY_MAX_MS)),
        },
    });
}
