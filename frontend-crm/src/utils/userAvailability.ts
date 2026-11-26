'use client';

import { useEffect, useState } from 'react';
import { formatDayLabel, useBusinessClock } from '@/components/activities/activityTime';
import type { CrmUser } from '@/types/user.types';
import { isOutOfOfficeOn } from './notificationPreferences';
import { addDays, zonedDayOf, zonedStartOfDay } from './zonedTime';

/**
 * Whether a colleague is away: out of office (their own dates, My Profile › Notifications) or on leave (the admin's
 * switch, Admin › Users). Pickers label away users; they don't hide them, and bell notifications keep arriving.
 */

/** A label for a user who is away today, and its tooltip. */
export interface UserAwayStatus {
    label: string;
    title: string;
}

/** `2026-12-05` → `5 Dec`, or `5 Dec 2026` when `day` isn't in `today`'s year. */
export function shortDayLabel(day: string, today: string): string {
    return formatDayLabel(day, { weekday: false, withYear: day.slice(0, 4) !== today.slice(0, 4) });
}

/** `1 Dec – 5 Dec 2026`, or `28 Dec 2026 – 3 Jan 2027` across a year end; one day reads `5 Dec 2026`. */
export function formatDayRange(from: string, to: string): string {
    const last = formatDayLabel(to, { weekday: false, withYear: true });
    if (from === to) return last;
    return `${formatDayLabel(from, { weekday: false, withYear: from.slice(0, 4) !== to.slice(0, 4) })} – ${last}`;
}

/**
 * "Out of office until 5 Dec" (its message, or "Out of office", as the tooltip) when today is in the user's range,
 * else "On leave" when an admin marked them so, else null. Out of office comes first: it carries the return date.
 */
export function userAwayStatus(user: Pick<CrmUser, 'onLeave' | 'outOfOffice'> | null | undefined, today: string): UserAwayStatus | null {
    if (!user) return null;
    const ooo = user.outOfOffice;
    if (ooo && isOutOfOfficeOn(ooo, today)) {
        return { label: `Out of office until ${shortDayLabel(ooo.to, today)}`, title: ooo.message?.trim() || 'Out of office' };
    }
    if (user.onLeave) return { label: 'On leave', title: 'Marked as on leave by an admin.' };
    return null;
}

/**
 * Today (`YYYY-MM-DD`) on the business-timezone calendar, from the server-synced business clock. Worked out on every
 * render, and a timer set for the next business midnight (plus a check when the tab becomes visible again) re-renders
 * the caller, so a page left open overnight moves to the new day by itself. The meta query is never refetched on its
 * own (`staleTime: Infinity`), so the clock object alone can't be relied on to change.
 */
export function useBusinessToday(): string {
    const clock = useBusinessClock();
    const [, setTick] = useState(0);
    const today = zonedDayOf(clock.now(), clock.timeZone);

    useEffect(() => {
        const bump = () => setTick((n) => n + 1);
        const nextMidnight = zonedStartOfDay(addDays(today, 1), clock.timeZone).getTime();
        // A second past midnight, so the new day has started on the business clock when the timer fires.
        const timer = window.setTimeout(bump, Math.max(nextMidnight - clock.now().getTime(), 0) + 1000);
        const onVisible = () => {
            if (document.visibilityState === 'visible' && zonedDayOf(clock.now(), clock.timeZone) !== today) bump();
        };
        document.addEventListener('visibilitychange', onVisible);
        return () => {
            window.clearTimeout(timer);
            document.removeEventListener('visibilitychange', onVisible);
        };
    }, [clock, today]);

    return today;
}
