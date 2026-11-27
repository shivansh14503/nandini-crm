import { z } from 'zod';
import { GRAPH_API } from '../../integrations/integration.constants.js';
import { BUSY_PROVIDER_TIMEOUT_MS } from '../busy.constants.js';
import { graphStatusKind } from '../busy.intervals.js';
import type { AdapterOptions } from './google.js';
import { graphChangeOps } from './graphChanges.js';
import { graphEventOps } from './graphEvents.js';
import { graphRsvpOps } from './graphRsvp.js';
import { graphWatchOps } from './graphWatch.js';
import { providerFetch } from './http.js';
import type { CalendarProviderAdapter, CallCtx, FreeBusyRequest, FreeBusyResult, ProviderBusyBlock } from './types.js';

/**
 * Microsoft Graph for one employee's mailbox with the tenant-wide app token (addendum AC2): every call goes to
 * `/users/{mailbox}/…` (`/me` has no meaning app-only). The event operations of the push engine (P2-3b) live in
 * graphEvents.ts and build their URLs with `graphUserUrl(ctx.mailbox)`; the pull's delta reads (P2-5) in graphChanges.ts.
 */

export const graphUserUrl = (mailbox: string) => `${GRAPH_API}/users/${encodeURIComponent(mailbox)}`;

const graphDateTimeSchema = z.object({ dateTime: z.string(), timeZone: z.string().optional() });
const scheduleSchema = z.object({
    scheduleId: z.string(),
    scheduleItems: z.array(z.object({ status: z.string().optional(), start: graphDateTimeSchema, end: graphDateTimeSchema })).optional(),
    error: z.object({ responseCode: z.string().optional(), message: z.string().optional() }).nullish(),
});
const getScheduleSchema = z.object({ value: z.array(scheduleSchema) });
export type GraphSchedule = z.infer<typeof scheduleSchema>;

/** UTC wall clock `2026-11-26T09:00:00` (Graph's `dateTimeTimeZone`, no offset). */
const utcWallClock = (date: Date) => date.toISOString().slice(0, 19);

/**
 * A Graph `dateTimeTimeZone` asked for in UTC (`Prefer: outlook.timezone="UTC"`) → instant. Graph writes 7 fraction
 * digits and no offset; anything not in UTC is unreadable here (null). Pure.
 */
export function graphUtcInstant(value: { dateTime: string; timeZone?: string }): Date | null {
    const zone = (value.timeZone ?? 'UTC').trim().toLowerCase();
    if (!['utc', 'etc/utc', 'coordinated universal time'].includes(zone)) return null;
    const match = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?)(\.\d+)?(Z)?$/.exec(value.dateTime.trim());
    if (!match) return null;
    const ms = match[2] ? match[2].slice(0, 4).padEnd(4, '0') : '';
    const date = new Date(`${match[1]}${ms}Z`);
    return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * One schedule of a `getSchedule` answer → blocks (status lower-cased first: `busy`, `tentative`, `oof` → away;
 * `free`, `workingElsewhere`, `unknown` dropped), or its error code. Subjects and locations are never read. Pure.
 */
export function graphScheduleResult(schedule: GraphSchedule | undefined): FreeBusyResult {
    if (!schedule) return { error: 'missing' };
    if (schedule.error) return { error: (schedule.error.responseCode || 'error').slice(0, 50) };
    const busy: ProviderBusyBlock[] = [];
    for (const item of schedule.scheduleItems ?? []) {
        const kind = graphStatusKind(item.status);
        const start = graphUtcInstant(item.start);
        const end = graphUtcInstant(item.end);
        if (kind && start && end && end > start) busy.push({ start, end, kind });
    }
    return { busy };
}

export function createMicrosoftAdapter(options: AdapterOptions = {}): CalendarProviderAdapter {
    const fetchImpl = options.fetchImpl;
    return {
        key: 'microsoft',

        async probeCalendar(ctx: CallCtx): Promise<void> {
            await providerFetch(
                { method: 'GET', url: `${graphUserUrl(ctx.mailbox)}/events?$top=1&$select=id`, headers: { Authorization: `Bearer ${ctx.accessToken}` }, provider: 'microsoft', operation: 'probe' },
                { fetchImpl, attempts: 2 },
            );
        },

        /**
         * `POST /users/{mailbox}/calendar/getSchedule` with the app token (`Calendars.ReadBasic`+, application):
         * `schedules` = the colleagues' emails (≤ 20), 15-minute view, times asked and answered in UTC.
         */
        async freeBusy(ctx: CallCtx, request: FreeBusyRequest): Promise<Map<string, FreeBusyResult>> {
            const emails = [...new Set(request.emails.map((e) => e.toLowerCase()))];
            const { json } = await providerFetch(
                {
                    method: 'POST',
                    url: `${graphUserUrl(ctx.mailbox)}/calendar/getSchedule`,
                    headers: { Authorization: `Bearer ${ctx.accessToken}`, Prefer: 'outlook.timezone="UTC"' },
                    body: JSON.stringify({
                        schedules: emails,
                        startTime: { dateTime: utcWallClock(request.start), timeZone: 'UTC' },
                        endTime: { dateTime: utcWallClock(request.end), timeZone: 'UTC' },
                        availabilityViewInterval: 15,
                    }),
                    provider: 'microsoft',
                    operation: 'getschedule',
                },
                { fetchImpl, attempts: 1, timeoutMs: BUSY_PROVIDER_TIMEOUT_MS, schema: getScheduleSchema },
            );
            const schedules = new Map(json.value.map((schedule) => [schedule.scheduleId.toLowerCase(), schedule]));
            return new Map(emails.map((email) => [email, graphScheduleResult(schedules.get(email))]));
        },

        ...graphEventOps(fetchImpl),
        ...graphChangeOps(fetchImpl),
        ...graphWatchOps(fetchImpl),
        ...graphRsvpOps(fetchImpl),
    };
}
