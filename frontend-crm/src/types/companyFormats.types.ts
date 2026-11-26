/**
 * Mirrors backend-crm/src/modules/company-formats (GET / PUT / DELETE /api/company-formats). The lists and the
 * formatter types come from the generated shared core (lib/display-formats), so both sides accept the same values.
 */

import type { DateFormat, NumberGrouping, TimeFormat } from '@/lib/display-formats/displayFormats';

export {
    CRM_CURRENCY,
    DATE_FORMATS,
    DEFAULT_DISPLAY_FORMATS,
    NUMBER_GROUPINGS,
    NUMBER_GROUPING_LABELS,
    TIME_FORMATS,
    TIME_FORMAT_LABELS,
} from '@/lib/display-formats/displayFormats';
export type { DateFormat, DatePattern, DisplayFormats, NumberGrouping, TimeFormat, TimePattern } from '@/lib/display-formats/displayFormats';

export interface CompanyFormatsDto {
    dateFormat: DateFormat;
    timeFormat: TimeFormat;
    numberGrouping: NumberGrouping;
    /** false = never saved (or reset): screens keep their pre-company-formats styles. */
    customized: boolean;
    /** The CRM's currency: informational and fixed (not a setting). */
    currency: { code: 'INR'; symbol: '₹'; name: 'Indian Rupee'; decimals: 2 };
    /** The business timezone (`BUSINESS_TIMEZONE`): instants are shown on its clock. */
    timeZone: string;
    updatedAt: string | null;
    /** Username of the admin who last saved; null while not customized. */
    updatedBy: string | null;
}

/** PUT body: all three formats (the save replaces the settings). */
export interface SaveCompanyFormatsPayload {
    dateFormat: DateFormat;
    timeFormat: TimeFormat;
    numberGrouping: NumberGrouping;
}
