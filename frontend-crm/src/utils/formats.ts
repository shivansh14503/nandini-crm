import { useSyncExternalStore } from 'react';
import {
    DEFAULT_DISPLAY_FORMATS,
    formatCount,
    formatDay,
    formatDayWith,
    formatLongDay,
    formatMoney,
    formatNumber,
    formatShortDay,
    formatTime,
    formatWallClock,
    isDisplayFormats,
    type DatePattern,
    type DisplayFormats,
    type TimePattern,
} from '@/lib/display-formats/displayFormats';
import type { CompanyFormatsDto } from '@/types/companyFormats.types';
import { instantToZonedWallClock } from './zonedTime';

/**
 * Company display formats (Admin › Company formats) on screens: the only module screens format dates, times, numbers
 * and amounts through. A module-level store (like services/masterData.store.ts) so table cells, CSV builders and
 * other non-hook code read the same values as components; `useDisplayFormats()` re-renders a component on a change.
 *
 * The store starts from a localStorage snapshot of the last GET (a returning device renders the right formats before
 * the request finishes) and is filled by `loadCompanyFormats()` (services/companyFormats.service.ts, observed by
 * CrmDataBootstrap). While the company has not saved formats (`customized: false`) every adapter renders the call
 * site's own `legacy` pattern, so screens look exactly as they did before. Instants are shown on the business
 * timezone's clock (the API's `BUSINESS_TIMEZONE`).
 */

const STORAGE_KEY = 'crm.companyFormats';
/** The API's default business timezone, used until the first GET (as activityTime's DEFAULT_TIME_ZONE). */
const FALLBACK_TIME_ZONE = 'Asia/Kolkata';

interface FormatsState {
    formats: DisplayFormats;
    timeZone: string;
}

function isTimeZone(value: unknown): value is string {
    if (typeof value !== 'string' || !value) return false;
    try {
        new Intl.DateTimeFormat('en-US', { timeZone: value });
        return true;
    } catch {
        return false;
    }
}

const pickFormats = (f: DisplayFormats): DisplayFormats => ({
    dateFormat: f.dateFormat,
    timeFormat: f.timeFormat,
    numberGrouping: f.numberGrouping,
    customized: f.customized,
});

function readSnapshot(): FormatsState {
    const fallback: FormatsState = { formats: DEFAULT_DISPLAY_FORMATS, timeZone: FALLBACK_TIME_ZONE };
    if (typeof window === 'undefined') return fallback;
    try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (!raw) return fallback;
        const parsed: unknown = JSON.parse(raw);
        const snapshot = parsed as Partial<FormatsState> | null;
        if (!snapshot || !isDisplayFormats(snapshot.formats)) return fallback;
        return { formats: pickFormats(snapshot.formats), timeZone: isTimeZone(snapshot.timeZone) ? snapshot.timeZone : FALLBACK_TIME_ZONE };
    } catch {
        return fallback;
    }
}

function writeSnapshot(next: FormatsState): void {
    if (typeof window === 'undefined') return;
    try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
        // Private mode / blocked storage: the formats still apply for this page view.
    }
}

let state: FormatsState = readSnapshot();
const listeners = new Set<() => void>();

/** The company display formats now in force (defaults, not customized, until loaded). */
export const getDisplayFormats = (): DisplayFormats => state.formats;

/** The business timezone instants are shown in (`Asia/Kolkata` until the first GET). */
export const getBusinessTimeZone = (): string => state.timeZone;

/** Takes the API's settings: updates the store and the device snapshot, and re-renders subscribed components. */
export function setCompanyFormats(dto: Pick<CompanyFormatsDto, 'dateFormat' | 'timeFormat' | 'numberGrouping' | 'customized' | 'timeZone'>): void {
    const formats = pickFormats(dto);
    if (!isDisplayFormats(formats)) return;
    const timeZone = isTimeZone(dto.timeZone) ? dto.timeZone : state.timeZone;
    const current = state.formats;
    const same =
        current.dateFormat === formats.dateFormat &&
        current.timeFormat === formats.timeFormat &&
        current.numberGrouping === formats.numberGrouping &&
        current.customized === formats.customized &&
        state.timeZone === timeZone;
    if (same) return;
    state = { formats, timeZone };
    writeSnapshot(state);
    listeners.forEach((listener) => listener());
}

export function subscribeDisplayFormats(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}

const getServerFormats = () => DEFAULT_DISPLAY_FORMATS;

/** The company display formats; the component re-renders when an admin's change arrives. */
export function useDisplayFormats(): DisplayFormats {
    return useSyncExternalStore(subscribeDisplayFormats, getDisplayFormats, getServerFormats);
}

// ─── Adapters (read the store) ────────────────────────────────────────────────

/** A day (`YYYY-MM-DD`, or the leading day of a longer value) in the company date format; `legacy` while not customized. */
export const fmtDay = (day: string, opts?: { legacy?: DatePattern; weekday?: boolean }): string => formatDay(day, state.formats, opts);

/** `25 Nov` / `Wed 25 Nov` (`Nov 25` for a saved MM/DD/YYYY). */
export const fmtShortDay = (day: string, opts?: { weekday?: boolean }): string => formatShortDay(day, state.formats, opts);

/** `Thursday, 26 November 2026` (`Thursday, November 26, 2026` for a saved MM/DD/YYYY). */
export const fmtLongDay = (day: string): string => formatLongDay(day, state.formats);

/** Minutes, `HH:mm`, a wall clock or a 12-hour text in the company time format; `legacy` while not customized. */
export const fmtTime = (value: number | string, opts?: { legacy?: TimePattern }): string => formatTime(value, state.formats, opts);

/** A `YYYY-MM-DDTHH:mm` wall clock as date + time; anything else comes back unchanged. */
export const fmtWallClock = (wall: string, opts?: { legacyDate?: DatePattern; legacyTime?: TimePattern; weekday?: boolean; separator?: string }): string =>
    formatWallClock(wall, state.formats, opts);

function wallClockOf(value: string | Date | null | undefined, timeZone: string): string | null {
    if (!value) return null;
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    try {
        return instantToZonedWallClock(date, timeZone);
    } catch {
        return null;
    }
}

/**
 * An instant (ISO timestamp) as date + time on the business clock: `24-Oct-2026, 1:07 PM`. Missing or invalid → ''.
 * The legacy patterns apply while not customized (the date's default legacy is DD-MMM-YYYY).
 */
export function fmtInstant(iso: string | Date | null | undefined, opts?: { legacyDate?: DatePattern; legacyTime?: TimePattern; weekday?: boolean }): string {
    const wall = wallClockOf(iso, state.timeZone);
    return wall ? formatWallClock(wall, state.formats, opts) : '';
}

/** `12,34,567.89` / `1,234,567.89` (0–2 decimals unless given). Non-finite → ''. */
export const fmtNumber = (value: number, opts?: { minDecimals?: number; maxDecimals?: number }): string => formatNumber(value, state.formats, opts);

/** A whole-number count in the company grouping. Non-finite → ''. */
export const fmtCount = (value: number): string => formatCount(value, state.formats);

/** An amount in rupees (`₹12,34,567.50`); 2 decimals unless given. Non-finite → ''. */
export const fmtMoney = (value: number, opts?: { minDecimals?: number; maxDecimals?: number; currencyCode?: string }): string =>
    formatMoney(value, state.formats, opts);

// ─── Exports (pinned) ─────────────────────────────────────────────────────────
// Spreadsheet exports keep one fixed format whatever the company setting, so files read by other tools never change.

/** Export cell of an instant: `24-Oct-2026, 01:07 PM` on the business clock. Missing or invalid → ''. */
export function fmtExportDateTime(iso: string | Date | null | undefined): string {
    const wall = wallClockOf(iso, state.timeZone);
    return wall ? formatWallClock(wall, DEFAULT_DISPLAY_FORMATS, { legacyTime: 'hh:mm A' }) : '';
}

/** Export cell of a day: `28-Nov-2026`; anything that isn't a day comes back unchanged. */
export const fmtExportDay = (day: string): string => formatDay(day, DEFAULT_DISPLAY_FORMATS);

// ─── Instants as days, yearly days ────────────────────────────────────────────

/** An instant (ISO timestamp) as a `YYYY-MM-DDTHH:mm` wall clock on the business clock; missing or invalid → null. */
export const businessWallClock = (iso: string | Date | null | undefined): string | null => wallClockOf(iso, state.timeZone);

/** The business-clock day of an instant in the company date format (`legacy` while not customized). Missing or invalid → ''. */
export function fmtInstantDay(iso: string | Date | null | undefined, opts?: { legacy?: DatePattern; weekday?: boolean }): string {
    const wall = wallClockOf(iso, state.timeZone);
    return wall ? formatDay(wall.slice(0, 10), state.formats, opts) : '';
}

/**
 * A day that repeats every year (`MM-DD`, e.g. a yearly holiday) in the company date format without its year:
 * `08-15` → `15-Aug` (today's style while not customized), `15 Aug`, `15/08`, `15-08`, `08/15` or `08-15`.
 * Anything that isn't a real month and day (29 Feb counts) comes back unchanged.
 */
export function fmtYearlyDay(monthDay: string): string {
    if (!/^\d{2}-\d{2}$/.test(monthDay)) return monthDay;
    const dateFormat = state.formats.customized ? state.formats.dateFormat : DEFAULT_DISPLAY_FORMATS.dateFormat;
    // The pattern without its year token and that token's separator: DD-MMM-YYYY → DD-MMM, YYYY-MM-DD → MM-DD.
    const pattern = dateFormat.replace(/^YYYY[-/ ]|[-/ ]YYYY$/, '') as DatePattern;
    const day = `2000-${monthDay}`; // a leap year, so 02-29 is a real day
    const text = formatDayWith(day, pattern);
    return text === day ? monthDay : text;
}

/**
 * A stored day shown as stored (`2026-11-28`, e.g. a list's raw follow-up date) until the company formats are saved,
 * then in the company date format. Anything that isn't a day stays as it is.
 */
export const fmtDayOrRaw = (value: string | null | undefined): string => (!value ? '' : state.formats.customized ? formatDay(value, state.formats) : value);

/**
 * A stored time shown as stored (`04:15 PM`, `14:30`) until the company formats are saved, then in the company time
 * format. Anything that isn't a readable time stays as it is.
 */
export const fmtTimeOrRaw = (value: string | null | undefined): string => (!value ? '' : state.formats.customized ? formatTime(value, state.formats) : value);
