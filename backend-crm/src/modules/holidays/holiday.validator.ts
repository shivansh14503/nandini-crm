import { z } from 'zod';
import { enumWithDefault, isCalendarDate, optionalText, requiredDate, requiredText } from '../../validators/common.js';

/** Status options: the same Active / Inactive pair (and labels) Referrals use. Only Active holidays reach the calendar. */
export const HOLIDAY_STATUSES = ['Active', 'Inactive'] as const;
export type HolidayStatus = (typeof HOLIDAY_STATUSES)[number];
export const ACTIVE_HOLIDAY_STATUS: HolidayStatus = 'Active';

export const OCCASION_MAX_LENGTH = 100;
/** Years the API accepts for a holiday (and the year filter). */
export const MIN_HOLIDAY_YEAR = 2000;
export const MAX_HOLIDAY_YEAR = 2100;
export const MAX_HOLIDAY_IMPORT_ROWS = 1000;
/**
 * A holiday that repeats every year is stored on its day and month in this (leap) year, so 29 Feb fits. It is below
 * MIN_HOLIDAY_YEAR, so no one-off holiday can share its date, and the API never shows it: it reports `MM-DD`.
 */
export const YEARLY_ANCHOR_YEAR = 1904;
/** The calendar asks for at most this many days at once (a month grid is 42). */
export const MAX_CALENDAR_RANGE_DAYS = 400;

const inYearRange = (day: string) => {
    const year = Number(day.slice(0, 4));
    return year >= MIN_HOLIDAY_YEAR && year <= MAX_HOLIDAY_YEAR;
};

/** Accepts the option in any letter case ('public' → 'Public'), so imported sheets needn't match exactly. */
const caseInsensitive = <const T extends readonly string[]>(values: T) => (value: unknown) => {
    if (typeof value !== 'string') return value;
    const trimmed = value.trim();
    return values.find((option) => option.toLowerCase() === trimmed.toLowerCase()) ?? trimmed;
};

const MONTH_DAY_PATTERN = /^\d{2}-\d{2}$/;

/** `MM-DD` that is a day of some year (29 Feb included). */
export const isMonthDay = (value: string): boolean => MONTH_DAY_PATTERN.test(value) && isCalendarDate(`2000-${value}`);

const isLeapYear = (year: number) => (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;

/** The day a yearly holiday (`MM-DD`) falls on in `year`: 29 Feb is kept on 28 Feb in other years. */
export const yearlyDateIn = (monthDay: string, year: number): string =>
    `${String(year).padStart(4, '0')}-${monthDay === '02-29' && !isLeapYear(year) ? '02-28' : monthDay}`;

/** Yes / No cells and flags: true, false, or undefined when blank. Anything else is left for the schema to refuse. */
export function readYesNo(value: unknown): unknown {
    if (typeof value === 'boolean' || value === undefined || value === null) return value ?? undefined;
    const text = String(value).trim().toLowerCase();
    if (!text) return undefined;
    if (['yes', 'y', 'true', '1', 'yearly', 'every year', 'annual', 'annually'].includes(text)) return true;
    if (['no', 'n', 'false', '0', 'once', 'one-off', 'one off'].includes(text)) return false;
    return value;
}

export const holidayInputSchema = z
    .object({
        occasion: requiredText('Occasion', OCCASION_MAX_LENGTH).transform((value) => value.replace(/\s+/g, ' ')),
        /** `YYYY-MM-DD`; for a yearly holiday `MM-DD` (a full date is accepted too, and its year dropped). */
        holidayDate: z.preprocess((value) => (typeof value === 'string' ? value.trim() : value ?? ''), z.string({ error: 'Holiday Date is required.' }).min(1, { message: 'Holiday Date is required.' })),
        repeatsYearly: z.preprocess(readYesNo, z.boolean({ error: 'Repeats Every Year must be Yes or No.' }).optional()).transform((value) => value ?? false),
        status: z.preprocess(caseInsensitive(HOLIDAY_STATUSES), enumWithDefault('Status', HOLIDAY_STATUSES, ACTIVE_HOLIDAY_STATUS)),
    })
    .transform((value, ctx) => {
        const raw = value.holidayDate;
        const issue = (message: string) => {
            ctx.addIssue({ code: 'custom', message, path: ['holidayDate'] });
            return z.NEVER;
        };
        if (value.repeatsYearly) {
            const monthDay = isCalendarDate(raw.slice(0, 10)) ? raw.slice(5, 10) : raw;
            if (!isMonthDay(monthDay)) return issue('Holiday Date must be a day and month (MM-DD) for a holiday that repeats every year.');
            return { ...value, holidayDate: monthDay };
        }
        const day = raw.slice(0, 10);
        if (!isCalendarDate(day)) return issue('Holiday Date must be a valid date (YYYY-MM-DD).');
        if (!inYearRange(day)) return issue(`Holiday Date must be between ${MIN_HOLIDAY_YEAR} and ${MAX_HOLIDAY_YEAR}.`);
        return { ...value, holidayDate: day };
    });
export type HolidayInput = z.infer<typeof holidayInputSchema>;

export const HOLIDAY_SORT_FIELDS = ['holidayDate', 'occasion', 'status', 'updatedAt'] as const;
export type HolidaySortField = (typeof HOLIDAY_SORT_FIELDS)[number];

export const holidayListQuerySchema = z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(200).default(50),
    search: optionalText('Search', 100),
    year: z.coerce.number().int().min(MIN_HOLIDAY_YEAR).max(MAX_HOLIDAY_YEAR).optional(),
    status: z.enum(HOLIDAY_STATUSES).optional(),
    sortBy: z.enum(HOLIDAY_SORT_FIELDS).default('holidayDate'),
    sortOrder: z.enum(['asc', 'desc']).default('desc'),
});
export type HolidayListQuery = z.infer<typeof holidayListQuerySchema>;

export const HOLIDAY_BULK_ACTIONS = ['activate', 'deactivate', 'delete'] as const;
export type HolidayBulkAction = (typeof HOLIDAY_BULK_ACTIONS)[number];

export const holidayBulkSchema = z.object({
    action: z.enum(HOLIDAY_BULK_ACTIONS, { error: `action must be one of: ${HOLIDAY_BULK_ACTIONS.join(', ')}.` }),
    ids: z
        .array(z.string().trim().min(1).max(50), { error: 'ids must be an array of holiday ids.' })
        .min(1, { message: 'Select at least one holiday.' })
        .max(500, { message: 'At most 500 holidays can be changed at once.' })
        .transform((ids) => [...new Set(ids)]),
});

const importCell = z
    .union([z.string(), z.number(), z.null()])
    .transform((value) => (value === null ? '' : String(value).trim()))
    .pipe(z.string().max(200, { message: 'Cells cannot exceed 200 characters.' }));

/** `POST /import`: the import wizard's mapped rows. `dryRun` only checks them (the wizard's preview step). */
export const holidayImportSchema = z.object({
    rows: z
        .array(
            z.object({
                rowNumber: z.coerce.number().int().min(1),
                values: z.object({
                    occasion: importCell.optional(),
                    holidayDate: importCell.optional(),
                    repeatsYearly: importCell.optional(),
                    status: importCell.optional(),
                }),
            }),
            { error: 'rows must be an array.' },
        )
        .min(1, { message: 'There are no rows to import.' })
        .max(MAX_HOLIDAY_IMPORT_ROWS, { message: `At most ${MAX_HOLIDAY_IMPORT_ROWS} holidays can be imported at once.` }),
    fileName: optionalText('File name', 255),
    dryRun: z.boolean().default(false),
});
export type HolidayImportBody = z.infer<typeof holidayImportSchema>;

/** `GET /calendar?from=YYYY-MM-DD&to=YYYY-MM-DD` (inclusive days). */
export const holidayCalendarQuerySchema = z
    .object({ from: requiredDate('From'), to: requiredDate('To') })
    .refine((q) => q.from <= q.to, { message: 'From must be on or before To.', path: ['to'] })
    .refine((q) => (Date.parse(q.to) - Date.parse(q.from)) / 86_400_000 <= MAX_CALENDAR_RANGE_DAYS, {
        message: `Ask for at most ${MAX_CALENDAR_RANGE_DAYS} days at once.`,
        path: ['to'],
    });

// ── Import dates ─────────────────────────────────────────────────────────────

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const pad = (n: number) => String(n).padStart(2, '0');
const fullYear = (y: string) => (y.length === 2 ? 2000 + Number(y) : Number(y));

/** A day from its parts, or null when it isn't on the calendar (31/02/2026). */
function dayOf(year: number, month: number, day: number): string | null {
    const iso = `${String(year).padStart(4, '0')}-${pad(month)}-${pad(day)}`;
    return isCalendarDate(iso) ? iso : null;
}

/**
 * The date a spreadsheet cell holds, as `YYYY-MM-DD`, or null. Numeric dates are read day first, as written in India:
 * `2026-08-15`, `15/08/2026`, `15-08-2026`, `15.08.26`, `15 Aug 2026`, `15-Aug-26`, `Aug 15, 2026`, `15 August 2026`.
 * The import preview reads rows through this too (a dry run), so preview and import never disagree.
 */
export function parseImportDate(raw: string | undefined | null): string | null {
    const value = (raw ?? '').trim().replace(/\s+/g, ' ');
    if (!value) return null;

    let m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ].*)?$/.exec(value);
    if (m) return dayOf(Number(m[1]), Number(m[2]), Number(m[3]));

    m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/.exec(value);
    if (m) return dayOf(fullYear(m[3]), Number(m[2]), Number(m[1]));

    m = /^(\d{1,2})(?:st|nd|rd|th)?[ -]([A-Za-z]{3,9})\.?,?[ -](\d{2}|\d{4})$/.exec(value);
    if (m) {
        const month = MONTHS.indexOf(m[2].slice(0, 3).toLowerCase());
        return month < 0 ? null : dayOf(fullYear(m[3]), month + 1, Number(m[1]));
    }

    m = /^([A-Za-z]{3,9})\.? (\d{1,2})(?:st|nd|rd|th)?,? (\d{4})$/.exec(value);
    if (m) {
        const month = MONTHS.indexOf(m[1].slice(0, 3).toLowerCase());
        return month < 0 ? null : dayOf(Number(m[3]), month + 1, Number(m[2]));
    }
    return null;
}

/**
 * A day and month without a year, as `MM-DD`, or null: `26/01`, `26-01`, `26.01`, `26 Jan`, `26-Jan`, `Jan 26`,
 * `26th January`. Day first, like `parseImportDate`. A row with such a date is a holiday that repeats every year.
 */
export function parseImportMonthDay(raw: string | undefined | null): string | null {
    const value = (raw ?? '').trim().replace(/\s+/g, ' ');
    if (!value) return null;
    const monthDay = (month: number, day: number) => {
        const md = `${pad(month)}-${pad(day)}`;
        return month >= 1 && month <= 12 && isMonthDay(md) ? md : null;
    };

    let m = /^(\d{1,2})[/.-](\d{1,2})$/.exec(value);
    if (m) return monthDay(Number(m[2]), Number(m[1]));

    m = /^(\d{1,2})(?:st|nd|rd|th)?[ -]([A-Za-z]{3,9})\.?$/.exec(value);
    if (m) {
        const month = MONTHS.indexOf(m[2].slice(0, 3).toLowerCase());
        return month < 0 ? null : monthDay(month + 1, Number(m[1]));
    }

    m = /^([A-Za-z]{3,9})\.? (\d{1,2})(?:st|nd|rd|th)?$/.exec(value);
    if (m) {
        const month = MONTHS.indexOf(m[1].slice(0, 3).toLowerCase());
        return month < 0 ? null : monthDay(month + 1, Number(m[2]));
    }
    return null;
}

/** Same holiday = same day and same occasion, ignoring letter case and extra spaces (as the unique index does). */
export const holidayKey = (holidayDate: string, occasion: string) => `${holidayDate}|${occasion.trim().replace(/\s+/g, ' ').toLowerCase()}`;
