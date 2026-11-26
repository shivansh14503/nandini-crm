import { randomUUID } from 'node:crypto';
import { logger } from '../../config/logger.js';
import { prisma, type TransactionClient } from '../../config/prisma.js';
import { auditService } from '../../services/audit.service.js';
import { loadCalendarSettings } from '../integrations/integration.settings.js';
import { acquireLocks, runInTransaction } from '../shared/transactions.js';
import { emailDomainOf, isCompanyEmail, normalizeUserEmail } from '../users/userEmail.service.js';
import { checkConnection, type ConnectionRow } from './calendarAccess.js';
import {
    calendarConnectionUserLockKey,
    isCalendarProvider,
    LIVE_CONNECTION_STATUSES,
    type CalendarProvider,
    type EnrolmentSource,
    type NotSyncedReason,
    type StopReason,
} from './connection.constants.js';
import { isFakeProviderEnabled } from './providers/fakeSwitch.js';
import { CREATE_ELIGIBLE_PAST_MS } from './sync.constants.js';
import { enqueueCheck } from './sync.wake.js';
import { loadProviderAccess } from './providers/registry.js';
import { tokenSource } from './tokenSource.js';

/**
 * Automatic enrolment (addendum AC5, AC6, AC10, §4): every active, non-group user whose company email is on a domain an
 * enabled provider serves gets one live CalendarConnection row. Nobody opts in or out; admins choose the provider per
 * domain (on the provider), may override it per person and may exclude a person (CalendarSyncUser).
 *
 *   - `resolveTarget` / `planEnrolment`: the pure rules (table-tested).
 *   - `reconcileUser(username)`: applies the plan for one person in a short transaction under
 *     `calendarConnectionUserLockKey`, after the change that triggered it has committed. Audited
 *     `CalendarConnection ENROL / STOP`.
 *   - `reconcileAll(reason)`: every person whose plan isn't "nothing to do", one `reconcileUser` each.
 *   - `runDueChecks`: health checks of rows that are pending or whose backoff is over.
 * Stopping a row never cancels anything: events already in the calendar stay (Phase-2 rule; deleting them would send
 * cancellations). Stopping also detaches the row's links (P2-3b: `detached`, nothing pushed again) and, from P2-7,
 * stops its watch channel. Re-activating a stopped row re-attaches the detached links of its owner's activities that
 * are still current (dirty again: the push brings their events up to date, or cancels them when the activity was
 * cancelled meanwhile).
 */

// ── Pure rules ────────────────────────────────────────────────────────────────────────────────────────────────

export type NoTargetReason = 'inactive' | 'group' | 'no_email' | 'not_company' | 'no_provider' | 'provider_off' | 'excluded';
export type Target = { provider: CalendarProvider; email: string; source: EnrolmentSource } | { none: NoTargetReason };

export interface TargetUser {
    isActive: boolean;
    isGroupUser: boolean;
    email: string | null;
}
export interface TargetChoice {
    provider: string | null;
    excluded: boolean;
}
export interface TargetProvider {
    key: CalendarProvider;
    enabled: boolean;
    configured: boolean;
    domains: readonly string[];
}

/** Which provider and mailbox a person should sync with (or why none). Pure. */
export function resolveTarget(
    user: TargetUser,
    choice: TargetChoice | null,
    providers: readonly TargetProvider[],
    companyDomains: readonly string[],
    fakeOn: boolean,
): Target {
    if (!user.isActive) return { none: 'inactive' };
    if (user.isGroupUser) return { none: 'group' };
    const email = normalizeUserEmail(user.email);
    if (!email) return { none: 'no_email' };
    if (choice?.excluded) return { none: 'excluded' };
    if (!isCompanyEmail(email, companyDomains)) return { none: 'not_company' };
    const usable = (key: CalendarProvider) => {
        const p = providers.find((x) => x.key === key);
        return Boolean(p && p.enabled && p.configured && (key !== 'fake' || fakeOn));
    };

    const override = choice?.provider && isCalendarProvider(choice.provider) ? choice.provider : null;
    if (override) return usable(override) ? { provider: override, email, source: 'override' } : { none: 'provider_off' };

    const domain = emailDomainOf(email);
    const owner = providers.find((p) => p.key !== 'fake' && p.domains.some((d) => d.toLowerCase() === domain));
    if (owner) return usable(owner.key) ? { provider: owner.key, email, source: 'domain' } : { none: 'provider_off' };
    // The dev-only fake serves every company domain no real provider claims.
    if (fakeOn && usable('fake')) return { provider: 'fake', email, source: 'domain' };
    return { none: 'no_provider' };
}

/**
 * The provider whose people a person belongs to, whether or not it is switched on (provider card counts, e.g. who is
 * excluded): their override, else the real provider that claims their domain, else the dev-only fake while it is on.
 * Null when the email isn't a company email or no provider claims it. Pure.
 */
export function providerServing(email: string | null, overrideProvider: string | null, context: EnrolmentContext): CalendarProvider | null {
    const normalized = normalizeUserEmail(email);
    if (!normalized || !isCompanyEmail(normalized, context.companyDomains)) return null;
    if (overrideProvider && isCalendarProvider(overrideProvider)) return overrideProvider;
    const domain = emailDomainOf(normalized);
    const owner = context.providers.find((p) => p.key !== 'fake' && p.domains.some((d) => d.toLowerCase() === domain));
    if (owner) return owner.key;
    const fake = context.providers.find((p) => p.key === 'fake');
    return context.fakeOn && fake?.enabled ? 'fake' : null;
}

/** The stop reason of a row whose person has no target any more. */
export const STOP_REASON_FOR: Readonly<Record<NoTargetReason, StopReason>> = {
    excluded: 'excluded',
    inactive: 'user_inactive',
    group: 'user_inactive',
    no_email: 'no_email',
    not_company: 'no_email',
    provider_off: 'provider_removed',
    no_provider: 'provider_removed',
};

/** What the employee and the People table are told (inactive / group keep their own words). */
export const NOT_SYNCED_REASON_FOR: Readonly<Record<NoTargetReason, NotSyncedReason>> = {
    excluded: 'excluded',
    inactive: 'inactive',
    group: 'group',
    no_email: 'no_email',
    not_company: 'not_company',
    provider_off: 'no_provider',
    no_provider: 'no_provider',
};

export type PlanRow = Pick<ConnectionRow, 'id' | 'provider' | 'accountEmail' | 'status' | 'statusReason' | 'source'>;

export type EnrolmentPlan =
    | { action: 'none' }
    | { action: 'create' }
    | { action: 'reactivate'; id: string }
    | { action: 'stop'; id: string; reason: StopReason }
    | { action: 'replace'; stopId: string; reason: StopReason; then: 'create' | { reactivate: string } };

/**
 * The change one person needs. `reusable` = their stopped rows with the target's provider and mailbox, newest first;
 * a row stopped as `oauth_retired` (P2-2's OAuth rows) is never reactivated. Pure.
 */
export function planEnrolment(live: PlanRow | null, reusable: readonly PlanRow[], target: Target): EnrolmentPlan {
    if ('none' in target) return live ? { action: 'stop', id: live.id, reason: STOP_REASON_FOR[target.none] } : { action: 'none' };
    const sameIdentity = (row: PlanRow) => row.provider === target.provider && row.accountEmail.toLowerCase() === target.email;
    if (live && sameIdentity(live)) return { action: 'none' };
    const old = reusable.find((row) => row.status === 'stopped' && row.statusReason !== 'oauth_retired' && sameIdentity(row));
    const then: 'create' | { reactivate: string } = old ? { reactivate: old.id } : 'create';
    if (!live) return old ? { action: 'reactivate', id: old.id } : { action: 'create' };
    const reason: StopReason = live.provider !== target.provider ? 'provider_changed' : 'email_changed';
    return { action: 'replace', stopId: live.id, reason, then };
}

// ── Applying it ───────────────────────────────────────────────────────────────────────────────────────────────

export interface EnrolmentContext {
    providers: TargetProvider[];
    companyDomains: string[];
    fakeOn: boolean;
}

/** Providers and company domains as enrolment reads them (60 s credentials cache; the settings come from config). */
export async function loadEnrolmentContext(): Promise<EnrolmentContext> {
    const [google, microsoft, fake, settings] = await Promise.all([loadProviderAccess('google'), loadProviderAccess('microsoft'), loadProviderAccess('fake'), loadCalendarSettings()]);
    return {
        providers: [google, microsoft, fake].map((p) => ({ key: p.provider, enabled: p.enabled, configured: p.configured, domains: p.domains })),
        companyDomains: settings.companyDomains,
        fakeOn: isFakeProviderEnabled(),
    };
}

/** The in-process check (Redis down, or tests). */
const checkInProcess = (connectionId: string) =>
    setImmediate(() => {
        void checkConnection(connectionId);
    });

/**
 * Runs a health check of a newly enrolled row after its transaction commits: a `check` job on the calendar queue
 * (P2-3b), in-process when Redis is down. Never throws.
 */
let scheduleCheck: (connectionId: string) => void = (connectionId) => {
    void enqueueCheck(connectionId)
        .then((jobId) => {
            if (jobId === null) checkInProcess(connectionId);
        })
        .catch(() => checkInProcess(connectionId));
};
/** Tests: capture (or run) the checks reconcile schedules; null = the default in-process scheduler. */
export function setCheckSchedulerForTests(scheduler: ((connectionId: string) => void) | null): void {
    scheduleCheck =
        scheduler ?? checkInProcess;
}

export interface ReconcileResult {
    action: EnrolmentPlan['action'];
    /** The live row after the change (created / reactivated). */
    connectionId?: string;
    stopReason?: StopReason;
}

const STOP_DATA = (reason: StopReason, by: string, now: Date) => ({
    status: 'stopped',
    statusReason: reason,
    stoppedAt: now,
    stoppedBy: by,
    leaseId: null,
    leaseUntil: null,
    nextCheckAt: null,
});

async function stopRow(tx: TransactionClient, row: PlanRow & { username: string }, reason: StopReason, by: string, now: Date): Promise<void> {
    await tx.calendarConnection.update({ where: { id: row.id }, data: STOP_DATA(reason, by, now) });
    // Its links do nothing from now on (events stay in the calendar); P2-7 stops its watch channel here too.
    await tx.activityExternalLink.updateMany({ where: { connectionId: row.id, state: { not: 'detached' } }, data: { state: 'detached', dirtyAt: null, nextAttemptAt: null } });
    await auditService.record(tx, {
        entityType: 'CalendarConnection',
        entityId: row.id,
        action: 'STOP',
        changedBy: by,
        changes: { username: row.username, provider: row.provider, accountEmail: row.accountEmail, reason, by },
    });
}

async function startRow(
    tx: TransactionClient,
    username: string,
    target: Extract<Target, { provider: CalendarProvider }>,
    reactivate: string | null,
    by: string,
    reason: string,
    now: Date,
): Promise<string> {
    const common = {
        status: 'pending',
        statusReason: null,
        source: target.source,
        enrolledAt: now,
        stoppedAt: null,
        stoppedBy: null,
        consecutiveFailures: 0,
        lastErrorCode: null,
        lastErrorMessage: null,
        nextCheckAt: null,
    };
    let id: string;
    if (reactivate) {
        id = reactivate;
        await tx.calendarConnection.update({ where: { id }, data: common });
        await reattachLinks(tx, id, username, now);
    } else {
        id = randomUUID();
        await tx.calendarConnection.create({
            data: { id, username, provider: target.provider, accountEmail: target.email, calendarId: target.provider === 'microsoft' ? '' : 'primary', ...common },
        });
    }
    await auditService.record(tx, {
        entityType: 'CalendarConnection',
        entityId: id,
        action: 'ENROL',
        changedBy: by,
        changes: { username, provider: target.provider, accountEmail: target.email, source: target.source, trigger: reason, ...(reactivate ? { reactivated: true } : {}) },
    });
    return id;
}

/**
 * A re-activated row: its detached organizer links of activities the user still owns, not deleted and ending after
 * now − 1 day, become dirty again (the outbox sweep pushes them once the row is checked). Older ones stay detached.
 */
async function reattachLinks(tx: TransactionClient, connectionId: string, username: string, now: Date): Promise<number> {
    const detached = await tx.activityExternalLink.findMany({ where: { connectionId, state: 'detached', role: 'organizer' }, select: { id: true, activityId: true } });
    if (detached.length === 0) return 0;
    const current = await tx.activity.findMany({
        where: { id: { in: detached.map((l) => l.activityId) }, assignedTo: username, isDeleted: false, endAt: { gt: new Date(now.getTime() - CREATE_ELIGIBLE_PAST_MS) } },
        select: { id: true },
    });
    const ids = new Set(current.map((a) => a.id));
    const linkIds = detached.filter((l) => ids.has(l.activityId)).map((l) => l.id);
    if (linkIds.length === 0) return 0;
    const { count } = await tx.activityExternalLink.updateMany({
        where: { id: { in: linkIds }, state: 'detached' },
        data: { state: 'pending', dirtyAt: now, attempts: 0, nextAttemptAt: null },
    });
    return count;
}

const LIVE = { in: [...LIVE_CONNECTION_STATUSES] };

export interface ReconcileOptions {
    /** Who caused it (an admin's username), else 'system'. */
    actor?: string;
    /** Preloaded providers / domains (reconcileAll reads them once). */
    context?: EnrolmentContext;
    now?: Date;
}

type TxOutcome = ReconcileResult & { conflictWith?: string };

/**
 * Applies the plan for one person (see the file header). Runs after the triggering change has committed; never inside
 * another transaction. A unique-index clash is never caught inside the transaction (D45): another live row on the same
 * mailbox is detected before the insert, its owner is reconciled first (outside this transaction), then this person
 * once more.
 */
export async function reconcileUser(username: string, reason: string, options: ReconcileOptions = {}, retried = false): Promise<ReconcileResult> {
    const context = options.context ?? (await loadEnrolmentContext());
    const by = options.actor ?? 'system';
    const now = options.now ?? new Date();

    const outcome = await runInTransaction(async (tx): Promise<TxOutcome> => {
        await acquireLocks(tx, [calendarConnectionUserLockKey(username)]);
        const [user, choice, live] = await Promise.all([
            tx.user.findUnique({ where: { username }, select: { username: true, isActive: true, isGroupUser: true, email: true } }),
            tx.calendarSyncUser.findUnique({ where: { username }, select: { provider: true, excluded: true } }),
            tx.calendarConnection.findFirst({ where: { username, status: LIVE }, select: { id: true, username: true, provider: true, accountEmail: true, status: true, statusReason: true, source: true } }),
        ]);
        const target: Target = user ? resolveTarget(user, choice, context.providers, context.companyDomains, context.fakeOn) : { none: 'inactive' };
        const reusable =
            'provider' in target
                ? await tx.calendarConnection.findMany({
                      where: { username, provider: target.provider, accountEmail: target.email, status: 'stopped' },
                      select: { id: true, provider: true, accountEmail: true, status: true, statusReason: true, source: true },
                      orderBy: { stoppedAt: 'desc' },
                  })
                : [];
        const plan = planEnrolment(live, reusable, target);
        const owner = user?.username ?? username;

        if (plan.action === 'none') {
            // Same identity: keep the row, only the recorded source follows an override added or removed.
            if (live && 'provider' in target && live.source !== target.source) await tx.calendarConnection.update({ where: { id: live.id }, data: { source: target.source } });
            return { action: 'none', ...(live ? { connectionId: live.id } : {}) };
        }
        if (plan.action === 'stop') {
            await stopRow(tx, live!, plan.reason, by, now);
            return { action: 'stop', stopReason: plan.reason };
        }
        const start = target as Extract<Target, { provider: CalendarProvider }>;
        const reactivate = plan.action === 'reactivate' ? plan.id : plan.action === 'replace' && typeof plan.then === 'object' ? plan.then.reactivate : null;
        // Another person's live row on this mailbox (their email changed or they left, not reconciled yet).
        const holder = await tx.calendarConnection.findFirst({
            where: { provider: start.provider, accountEmail: start.email, status: LIVE, username: { not: owner } },
            select: { username: true },
        });
        if (holder) return { action: 'none', conflictWith: holder.username };
        if (plan.action === 'replace') await stopRow(tx, live!, plan.reason, by, now);
        const id = await startRow(tx, owner, start, reactivate, by, reason, now);
        return { action: plan.action, connectionId: id, ...(plan.action === 'replace' ? { stopReason: plan.reason } : {}) };
    });

    if (outcome.conflictWith) {
        if (retried) {
            logger.warn({ username, holder: outcome.conflictWith }, 'Calendar enrolment skipped: another person still holds this mailbox');
            return { action: 'none' };
        }
        await reconcileUser(outcome.conflictWith, reason, { ...options, context }, true);
        return reconcileUser(username, reason, { ...options, context }, true);
    }
    if (outcome.connectionId && outcome.action !== 'none' && outcome.action !== 'stop') {
        // A new identity: drop any grant or remembered error of that subject, then check it.
        const row = await prisma.calendarConnection.findUnique({ where: { id: outcome.connectionId }, select: { provider: true, accountEmail: true } });
        if (row && isCalendarProvider(row.provider)) tokenSource.invalidate(row.provider, row.accountEmail);
        scheduleCheck(outcome.connectionId);
    }
    if (outcome.action !== 'none') logger.info({ username, action: outcome.action, reason, stopReason: outcome.stopReason }, 'Calendar enrolment changed');
    return { action: outcome.action, ...(outcome.connectionId ? { connectionId: outcome.connectionId } : {}), ...(outcome.stopReason ? { stopReason: outcome.stopReason } : {}) };
}

/** `reconcileUser` that logs instead of throwing (call sites after a commit: the nightly run repairs a miss). */
export async function reconcileUserQuietly(username: string, reason: string, options: ReconcileOptions = {}): Promise<void> {
    try {
        await reconcileUser(username, reason, options);
    } catch (err) {
        logger.warn({ username, reason, err: (err as Error).message }, 'Calendar enrolment failed (the nightly run retries)');
    }
}

export interface ReconcileAllResult {
    checked: number;
    changed: number;
    failed: number;
}

const PAGE = 200;

/**
 * Every person whose plan isn't "nothing to do": active non-group users (200 per page) plus the owners of live rows
 * (inactive, group or deleted users, whose rows stop). The plan is computed from bulk reads first; only people with a
 * change get a transaction, where `reconcileUser` reads everything again under the lock.
 */
export async function reconcileAll(reason: string, options: Omit<ReconcileOptions, 'context'> = {}): Promise<ReconcileAllResult> {
    const context = await loadEnrolmentContext();
    const result: ReconcileAllResult = { checked: 0, changed: 0, failed: 0 };
    const seen = new Set<string>();

    const visit = async (users: { username: string; isActive: boolean; isGroupUser: boolean; email: string | null }[]) => {
        if (users.length === 0) return;
        const names = users.map((u) => u.username);
        const [choices, lives] = await Promise.all([
            prisma.calendarSyncUser.findMany({ where: { username: { in: names } }, select: { username: true, provider: true, excluded: true } }),
            prisma.calendarConnection.findMany({ where: { username: { in: names }, status: LIVE }, select: { id: true, username: true, provider: true, accountEmail: true, status: true, statusReason: true, source: true } }),
        ]);
        const choiceOf = new Map(choices.map((c) => [c.username.toLowerCase(), c]));
        const liveOf = new Map(lives.map((l) => [l.username.toLowerCase(), l]));
        for (const user of users) {
            const key = user.username.toLowerCase();
            seen.add(key);
            result.checked += 1;
            const live = liveOf.get(key) ?? null;
            const target = resolveTarget(user, choiceOf.get(key) ?? null, context.providers, context.companyDomains, context.fakeOn);
            // Without the stopped rows a reactivation reads as a create: either way it is a change, so it is applied.
            const plan = planEnrolment(live, [], target);
            const sourceDrift = plan.action === 'none' && live && 'provider' in target && live.source !== target.source;
            if (plan.action === 'none' && !sourceDrift) continue;
            try {
                const done = await reconcileUser(user.username, reason, { ...options, context });
                if (done.action !== 'none') result.changed += 1;
            } catch (err) {
                result.failed += 1;
                logger.warn({ username: user.username, reason, err: (err as Error).message }, 'Calendar enrolment failed (the nightly run retries)');
            }
        }
    };

    let cursor: number | undefined;
    for (;;) {
        const page = await prisma.user.findMany({
            where: { isActive: true, isGroupUser: false },
            select: { id: true, username: true, isActive: true, isGroupUser: true, email: true },
            orderBy: { id: 'asc' },
            take: PAGE,
            ...(cursor !== undefined ? { cursor: { id: cursor }, skip: 1 } : {}),
        });
        if (page.length === 0) break;
        cursor = page[page.length - 1].id;
        await visit(page);
        if (page.length < PAGE) break;
    }

    // Live rows of people not visited above: inactive, group logins, or users that no longer exist.
    const orphans = await prisma.calendarConnection.findMany({ where: { status: LIVE }, select: { username: true } });
    const leftover = [...new Set(orphans.map((o) => o.username).filter((u) => !seen.has(u.toLowerCase())))];
    for (const username of leftover) {
        result.checked += 1;
        try {
            const done = await reconcileUser(username, reason, { ...options, context });
            if (done.action !== 'none') result.changed += 1;
        } catch (err) {
            result.failed += 1;
            logger.warn({ username, reason, err: (err as Error).message }, 'Calendar enrolment failed (the nightly run retries)');
        }
    }
    if (result.changed > 0 || result.failed > 0) logger.info({ reason, ...result }, 'Calendar enrolment reconciled');
    return result;
}

/** `reconcileAll` that logs instead of throwing. */
export async function reconcileAllQuietly(reason: string, options: Omit<ReconcileOptions, 'context'> = {}): Promise<ReconcileAllResult | null> {
    try {
        return await reconcileAll(reason, options);
    } catch (err) {
        logger.warn({ reason, err: (err as Error).message }, 'Calendar enrolment reconcile failed (the nightly run retries)');
        return null;
    }
}

const DUE_CHECK_LIMIT = 200;

/** Health checks of rows that wait for their first check, or whose error backoff is over (nightly; the calendar worker's poll tick enqueues them as `check` jobs, `dueCheckIds`). */
export async function runDueChecks(now: Date = new Date()): Promise<{ checked: number; ok: number }> {
    const due = await dueCheckIds(now);
    let ok = 0;
    for (const id of due) if ((await checkConnection(id, () => now)) === 'ok') ok += 1;
    return { checked: due.length, ok };
}

/** Rows due a health check: pending ones, and rows in error whose backoff is over (oldest enrolment first). */
export async function dueCheckIds(now: Date = new Date(), limit: number = DUE_CHECK_LIMIT): Promise<string[]> {
    const due = await prisma.calendarConnection.findMany({
        where: { OR: [{ status: 'pending' }, { status: 'error', nextCheckAt: { lte: now } }] },
        select: { id: true },
        orderBy: { enrolledAt: 'asc' },
        take: limit,
    });
    return due.map((row) => row.id);
}
