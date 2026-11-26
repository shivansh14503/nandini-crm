import { logger } from '../../config/logger.js';
import { prisma } from '../../config/prisma.js';
import { secretBox } from '../../services/secretBox.js';
import { notify } from '../notifications/notification.producer.js';
import type { AuthUser } from '../../types/user.types.js';
import { CALENDAR_PROVIDER_LABELS, isCalendarProvider, LIVE_CONNECTION_STATUSES, type CalendarProvider, type NotSyncedReason, type OwnCalendarStatus } from './connection.constants.js';
import { loadEnrolmentContext, NOT_SYNCED_REASON_FOR, reconcileAllQuietly, resolveTarget, runDueChecks } from './enrolment.js';
import { loadProviderAccess } from './providers/registry.js';
import { adminRecipients, userIssuesDigest } from './syncIssue.notifications.js';
import { syncHoursLabel } from './syncHours.js';

/**
 * An employee's own calendar sync, read-only (addendum §5.2), the nightly calendar steps, and
 * `hasActiveCalendarConnection`. Users have no connect or disconnect: their company calendar is enrolled by the admin's
 * set-up (enrolment.ts). Nothing here returns an error code or provider text to the employee.
 */

export interface OwnCalendarDto {
    provider: CalendarProvider;
    providerLabel: string;
    accountEmail: string;
    /** `paused` (derived) = the provider is switched off or its health is `error`. */
    status: OwnCalendarStatus;
    /** When this mailbox was (re-)enrolled. */
    since: string;
    /** max(lastPushedAt, lastPulledAt); null until sync has run. */
    lastSyncedAt: string | null;
}

/** GET /api/calendar-connections. */
export interface OwnCalendarSyncDto {
    /** At least one provider is switched on and usable (a real one also needs the encryption key). */
    ready: boolean;
    /** Null = not synced (see `reason`). */
    calendar: OwnCalendarDto | null;
    reason: NotSyncedReason | null;
    /** When changes made in the calendar come back by themselves (P2-5 poll): office hours and interval. */
    syncHours: { start: string; end: string; everyMinutes: number };
}

const latest = (...dates: (Date | null | undefined)[]): string | null => {
    const times = dates.filter((d): d is Date => d instanceof Date).map((d) => d.getTime());
    return times.length ? new Date(Math.max(...times)).toISOString() : null;
};

export const connectionService = {
    /** The caller's own company calendar (same answer for every role; only the caller's row). */
    async getOwn(user: AuthUser): Promise<OwnCalendarSyncDto> {
        const [account, live, choice, context] = await Promise.all([
            prisma.user.findUnique({ where: { id: user.id }, select: { email: true, isActive: true, isGroupUser: true } }),
            prisma.calendarConnection.findFirst({
                where: { username: user.username, status: { in: [...LIVE_CONNECTION_STATUSES] } },
                select: { provider: true, accountEmail: true, status: true, enrolledAt: true, lastPushedAt: true, lastPulledAt: true },
            }),
            prisma.calendarSyncUser.findUnique({ where: { username: user.username }, select: { provider: true, excluded: true } }),
            loadEnrolmentContext(),
        ]);
        // A real provider needs the encryption key; the dev-only fake has no secrets (as in withCalendarAccess).
        const ready = context.providers.some((p) => p.enabled && p.configured && (p.key === 'fake' ? context.fakeOn : secretBox.ready()));
        const syncHours = syncHoursLabel();
        if (live && isCalendarProvider(live.provider)) {
            const access = await loadProviderAccess(live.provider);
            const paused = !access.enabled || !access.configured || access.healthStatus === 'error';
            return {
                ready,
                calendar: {
                    provider: live.provider,
                    providerLabel: CALENDAR_PROVIDER_LABELS[live.provider],
                    accountEmail: live.accountEmail,
                    status: paused ? 'paused' : (live.status as OwnCalendarStatus),
                    since: live.enrolledAt.toISOString(),
                    lastSyncedAt: latest(live.lastPushedAt, live.lastPulledAt),
                },
                reason: null,
                syncHours,
            };
        }
        const target = account ? resolveTarget(account, choice, context.providers, context.companyDomains, context.fakeOn) : ({ none: 'inactive' } as const);
        // A target without a live row yet: enrolment runs after the admin's save, or tonight.
        return { ready, calendar: null, reason: 'none' in target ? NOT_SYNCED_REASON_FOR[target.none] : null, syncHours };
    },
};

/**
 * Whether a user's company calendar is synced (a live row `ok` or `pending`, and the user still active). The morning
 * email will use it (parked by the owner, spec D29) to leave out its "Add to Google Calendar" links for synced users.
 */
export async function hasActiveCalendarConnection(username: string): Promise<boolean> {
    const [row, user] = await Promise.all([
        prisma.calendarConnection.findFirst({ where: { username, status: { in: ['ok', 'pending'] } }, select: { id: true } }),
        prisma.user.findUnique({ where: { username }, select: { isActive: true } }),
    ]);
    return Boolean(row && user?.isActive);
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Nightly calendar steps, run by the calendar sync worker's `calendar-nightly` job (00:25; P2-2b ran them from the
 * reminders worker's nightly job until P2-3b):
 * reconcile everyone (repairs any missed trigger and stops rows of people who left), run the due health checks, and
 * send admins one digest when someone's calendar went to `error` in the last day.
 */
export async function runCalendarConnectionNightly(now: Date = new Date()): Promise<{ changed: number; checked: number; problems: number }> {
    const reconciled = await reconcileAllQuietly('nightly');
    let checked = 0;
    try {
        checked = (await runDueChecks(now)).checked;
    } catch (err) {
        logger.warn({ err: (err as Error).message }, 'Nightly calendar checks failed');
    }
    let problems = 0;
    try {
        const recent = await prisma.calendarConnection.count({ where: { status: 'error', lastErrorAt: { gt: new Date(now.getTime() - DAY_MS) } } });
        if (recent > 0) {
            problems = await prisma.calendarConnection.count({ where: { status: 'error' } });
            await notify(userIssuesDigest(await adminRecipients(), problems, now));
        }
    } catch (err) {
        logger.warn({ err: (err as Error).message }, 'Nightly calendar problem digest failed');
    }
    return { changed: reconciled?.changed ?? 0, checked, problems };
}
