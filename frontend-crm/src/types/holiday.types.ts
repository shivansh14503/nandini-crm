/** Holidays (Admin › Holidays). Mirrors backend-crm/src/modules/holidays/holiday.validator.ts. */

/** Status: the same Active / Inactive options Referrals use. Only Active holidays show on the calendar. */
export const HOLIDAY_STATUSES = ['Active', 'Inactive'] as const;
export type HolidayStatus = (typeof HOLIDAY_STATUSES)[number];

export const OCCASION_MAX_LENGTH = 100;

export interface Holiday {
    id: string;
    occasion: string;
    /** `YYYY-MM-DD`; `MM-DD` when the holiday repeats every year. */
    holidayDate: string;
    /** Falls on the same day and month every year (29 Feb shows on 28 Feb in other years). */
    repeatsYearly: boolean;
    status: HolidayStatus;
    createdBy: string;
    updatedBy: string | null;
    createdAt: string;
    updatedAt: string;
}

export interface HolidayFormData {
    occasion: string;
    /** `YYYY-MM-DD`, or `MM-DD` with `repeatsYearly`. */
    holidayDate: string;
    repeatsYearly: boolean;
    status: HolidayStatus;
}

export type HolidaySortField = 'holidayDate' | 'occasion' | 'status' | 'updatedAt';

export interface HolidayListParams {
    page: number;
    limit: number;
    search?: string;
    year?: number;
    status?: HolidayStatus;
    sortBy: HolidaySortField;
    sortOrder: 'asc' | 'desc';
}

export interface HolidayListResult {
    data: Holiday[];
    total: number;
    page: number;
    limit: number;
    /** Years with holidays (and the current year), newest first. */
    years: number[];
}

export type HolidayBulkAction = 'activate' | 'deactivate' | 'delete';

/** An active holiday on one day, as the calendar shows it. */
export interface CalendarHoliday {
    /** Unique per day: a yearly holiday's id is `<id>@<year>`. */
    id: string;
    occasion: string;
    /** `YYYY-MM-DD`: the day it falls on. */
    holidayDate: string;
    repeatsYearly: boolean;
}

export interface HolidayImportRow {
    rowNumber: number;
    values: Partial<Record<'occasion' | 'holidayDate' | 'repeatsYearly' | 'status', string>>;
}

export type HolidayImportOutcome = 'new' | 'duplicate' | 'error';

export interface HolidayImportRowResult {
    rowNumber: number;
    outcome: HolidayImportOutcome;
    occasion: string;
    holidayDate: string;
    repeatsYearly: boolean;
    status: string;
    messages: string[];
}

export interface HolidayImportResult {
    dryRun: boolean;
    total: number;
    created: number;
    duplicates: number;
    failed: number;
    rows: HolidayImportRowResult[];
}
