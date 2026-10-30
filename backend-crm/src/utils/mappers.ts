import type { Prisma } from '../generated/prisma/client.js';

/**
 * Helpers for translating between Prisma rows and the frontend's DTO shapes, where optional text is ''
 * rather than null, dates are ISO strings and arrays are real arrays.
 */

/** null/undefined → '' (frontend form fields are plain strings). */
export const text = (value: string | null | undefined): string => value ?? '';

/** Blank / undefined → null for storage. */
export const nullable = (value: string | null | undefined): string | null => {
    const trimmed = value?.trim();
    return trimmed ? trimmed : null;
};

export const toIso = (value: Date): string => value.toISOString();

export const toIsoOrUndefined = (value: Date | null | undefined): string | undefined => (value ? value.toISOString() : undefined);

/** `@db.Date` column → `YYYY-MM-DD` ('' when null). */
export const toDateOnly = (value: Date | null | undefined): string => (value ? value.toISOString().slice(0, 10) : '');

/** `YYYY-MM-DD` (or full ISO) → Date at UTC midnight for `@db.Date` columns. */
export function fromDateOnly(value: string): Date {
    const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00.000Z` : value);
    if (Number.isNaN(date.getTime())) throw new Error(`Invalid date: ${value}`);
    return date;
}

export const decimalToString = (value: Prisma.Decimal | null | undefined): string => (value ? value.toString() : '');

export const decimalToNumber = (value: Prisma.Decimal | null | undefined): number => (value ? value.toNumber() : 0);

/** Parses a JSON string[] column; malformed or non-string entries are dropped rather than failing the read. */
export function parseStringArray(json: string | null | undefined): string[] {
    if (!json) return [];
    try {
        const parsed: unknown = JSON.parse(json);
        return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
    } catch {
        return [];
    }
}

/** Trims, drops blanks and de-duplicates before storing a string[] as JSON. */
export function stringifyStringArray(values: readonly string[] | undefined): string {
    const unique = [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];
    return JSON.stringify(unique);
}

// ── Wall-clock date-times (`YYYY-MM-DDTHH:mm`, no timezone) ────────────────────
// Stored as if UTC so the value entered round-trips exactly, independent of the server's timezone.

export const fromWallClock = (value: string): Date => new Date(`${value}:00.000Z`);

export const toWallClock = (value: Date): string => value.toISOString().slice(0, 16);

/** The current wall-clock time in `timeZone`, encoded the same way as `fromWallClock`. */
export function wallClockNow(timeZone: string): Date {
    const parts = Object.fromEntries(
        new Intl.DateTimeFormat('en-CA', {
            timeZone,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            hourCycle: 'h23',
        })
            .formatToParts(new Date())
            .map((part) => [part.type, part.value]),
    );
    return fromWallClock(`${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`);
}

/** Start of the window for `createdWithinDays` filters. */
export const daysAgo = (days: number): Date => new Date(Date.now() - days * 24 * 60 * 60 * 1000);
