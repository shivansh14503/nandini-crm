import { logger } from '../../config/logger.js';
import {
    CRM_CURRENCY,
    DATE_FORMATS,
    DEFAULT_DISPLAY_FORMATS,
    NUMBER_GROUPINGS,
    TIME_FORMATS,
    type DateFormat,
    type DisplayFormats,
    type NumberGrouping,
    type TimeFormat,
} from './core/displayFormats.js';

/** The single CompanyFormatSettings row. */
export const SETTINGS_ID = 1;

/** The stored row as cached (`updatedAt` as an ISO string so a cached copy and a fresh read look the same). */
export interface CompanyFormatsRow {
    dateFormat: string;
    timeFormat: string;
    numberGrouping: string;
    updatedBy: string | null;
    updatedAt: string;
}

/** GET / PUT / DELETE /api/company-formats (`CompanyFormatsDto` in frontend-crm/src/types/companyFormats.types.ts). */
export interface CompanyFormatsDto {
    dateFormat: DateFormat;
    timeFormat: TimeFormat;
    numberGrouping: NumberGrouping;
    /** false = never saved, or reset: screens keep their pre-company-formats styles. */
    customized: boolean;
    /** The CRM's currency: informational, not a setting. */
    currency: typeof CRM_CURRENCY;
    /** ENV.BUSINESS_TIMEZONE, which every formatted instant is shown in. */
    timeZone: string;
    updatedAt: string | null;
    /** Username of the admin who saved last; null while not customized. */
    updatedBy: string | null;
}

/** Audited fields of a setting (`CompanyFormats` audit entries diff two of these). */
export interface CompanyFormatsSnapshot {
    dateFormat: DateFormat;
    timeFormat: TimeFormat;
    numberGrouping: NumberGrouping;
    customized: boolean;
}

function pick<T extends string>(list: readonly T[], value: string, fallback: T, field: string): T {
    if ((list as readonly string[]).includes(value)) return value as T;
    logger.warn({ field, value }, 'Unknown stored company format; using the default');
    return fallback;
}

/** The formats a stored row means: no row = the defaults, not customized; an unknown stored value = that field's default. */
export function formatsOf(row: Pick<CompanyFormatsRow, 'dateFormat' | 'timeFormat' | 'numberGrouping'> | null): DisplayFormats {
    if (!row) return DEFAULT_DISPLAY_FORMATS;
    return {
        dateFormat: pick(DATE_FORMATS, row.dateFormat, DEFAULT_DISPLAY_FORMATS.dateFormat, 'dateFormat'),
        timeFormat: pick(TIME_FORMATS, row.timeFormat, DEFAULT_DISPLAY_FORMATS.timeFormat, 'timeFormat'),
        numberGrouping: pick(NUMBER_GROUPINGS, row.numberGrouping, DEFAULT_DISPLAY_FORMATS.numberGrouping, 'numberGrouping'),
        customized: true,
    };
}

export function toCompanyFormatsDto(row: CompanyFormatsRow | null, timeZone: string): CompanyFormatsDto {
    const { dateFormat, timeFormat, numberGrouping, customized } = formatsOf(row);
    return {
        dateFormat,
        timeFormat,
        numberGrouping,
        customized,
        currency: CRM_CURRENCY,
        timeZone,
        updatedAt: row?.updatedAt ?? null,
        updatedBy: row?.updatedBy ?? null,
    };
}

export function companyFormatsAuditSnapshot(f: DisplayFormats): CompanyFormatsSnapshot {
    return { dateFormat: f.dateFormat, timeFormat: f.timeFormat, numberGrouping: f.numberGrouping, customized: f.customized };
}
