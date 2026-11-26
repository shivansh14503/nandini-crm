/** Holidays (Admin › Holidays). Mirrors backend-crm/src/modules/holidays/holiday.validator.ts. */

/** Status: the same Active / Inactive options Referrals use. Only Active holidays show on the calendar. */
export const HOLIDAY_STATUSES = ['Active', 'Inactive'] as const;
export type HolidayStatus = (typeof HOLIDAY_STATUSES)[number];

export const OCCASION_MAX_LENGTH = 100;

export interface Holiday {
    id: string;
    occasion: string;
    /** `YYYY-MM-DD`. */
    holidayDate: string;
    status: HolidayStatus;
    createdBy: string;
    updatedBy: string | null;
    createdAt: string;
    updatedAt: string;
}

export interface HolidayFormData {
    occasion: string;
    holidayDate: string;
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

/** An active holiday as the calendar shows it. */
export interface CalendarHoliday {
    id: string;
    occasion: string;
    holidayDate: string;
}

export interface HolidayImportRow {
    rowNumber: number;
    values: Partial<Record<'occasion' | 'holidayDate' | 'status', string>>;
}

export type HolidayImportOutcome = 'new' | 'duplicate' | 'error';

export interface HolidayImportRowResult {
    rowNumber: number;
    outcome: HolidayImportOutcome;
    occasion: string;
    holidayDate: string;
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
