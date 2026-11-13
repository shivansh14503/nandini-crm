/**
 * Pure document-number formatting, shared by number generation and the admin page's previews.
 * The frontend mirrors this in frontend-crm/src/utils/documentSeries.ts; keep the two in step.
 *
 *   [company prefix] SEP [module prefix] SEP [financial year] SEP [running number] SEP [suffix]
 *    NIPL            /    L               /    26-27           /    1004
 *
 * Parts that are switched off or blank are left out together with their separator.
 */

/** Modules whose records get a generated number, in the order the admin page lists them. */
export const SERIES_MODULES = ['lead', 'opportunity', 'quotation', 'organization', 'contact', 'ticket', 'product'] as const;
export type SeriesModule = (typeof SERIES_MODULES)[number];

export const SERIES_MODULE_LABELS: Record<SeriesModule, string> = {
    lead: 'Leads',
    opportunity: 'Opportunities',
    quotation: 'Quotations',
    organization: 'Organizations',
    contact: 'Contacts',
    ticket: 'Tickets',
    product: 'Products',
};

/**
 * Each module's original prefix. It is also the module's counter key in `SequenceCounter`, so a module keeps
 * counting from where it was when an admin changes its prefix or format.
 */
export const LEGACY_PREFIX: Record<SeriesModule, string> = {
    lead: 'LD',
    opportunity: 'OPP',
    quotation: 'QT',
    organization: 'ORG',
    contact: 'CON',
    ticket: 'TKT',
    product: 'PRD',
};

export const SEPARATORS = ['/', '-', '_', '.', ''] as const;
export type Separator = (typeof SEPARATORS)[number];

export const FY_FORMATS = ['YY-YY', 'YYYY-YY', 'YYYY-YYYY', 'YYYY', 'YY'] as const;
export type FyFormat = (typeof FY_FORMATS)[number];

/** Generated codes are stored in NVarChar(50) columns. */
export const MAX_CODE_LENGTH = 50;

export interface SeriesSettings {
    companyPrefix: string;
    separator: Separator;
    /** 1-12; 4 = April. */
    fyStartMonth: number;
    fyFormat: FyFormat;
}

export interface SeriesRule {
    modulePrefix: string;
    includeCompanyPrefix: boolean;
    includeFinancialYear: boolean;
    suffix: string;
    padLength: number;
    startingNumber: number;
    resetEachFinancialYear: boolean;
}

/** Common settings until an admin saves the Document Series page. */
export const DEFAULT_SETTINGS: SeriesSettings = { companyPrefix: '', separator: '/', fyStartMonth: 4, fyFormat: 'YY-YY' };

/**
 * Modules an admin hasn't added a series for keep their original numbering (LD-0001, QT-0001, ...), whatever the
 * common settings say, counting on in the module's original counter.
 */
export const LEGACY_SETTINGS: SeriesSettings = { companyPrefix: '', separator: '-', fyStartMonth: 4, fyFormat: 'YY-YY' };

export function legacyRule(module: SeriesModule): SeriesRule {
    return {
        modulePrefix: LEGACY_PREFIX[module],
        includeCompanyPrefix: false,
        includeFinancialYear: false,
        suffix: '',
        padLength: 4,
        startingNumber: 1,
        resetEachFinancialYear: false,
    };
}

/** Prefix offered when an admin adds a module's series (L for leads, as in NIPL/L/26-27/1004). */
export const SUGGESTED_PREFIX: Record<SeriesModule, string> = {
    lead: 'L',
    opportunity: 'OP',
    quotation: 'Q',
    organization: 'ORG',
    contact: 'CON',
    ticket: 'T',
    product: 'P',
};

export interface FinancialYear {
    /** Calendar year the financial year starts in (2026 for FY 2026-27). */
    startYear: number;
    /** Formatted per the settings, e.g. `26-27`. */
    label: string;
}

/** Year and month (1-12) of `date` on the wall clock of `timeZone`. */
function zonedYearMonth(date: Date, timeZone: string): { year: number; month: number } {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: 'numeric' }).formatToParts(date);
    const get = (type: string) => Number(parts.find((part) => part.type === type)?.value);
    return { year: get('year'), month: get('month') };
}

export function formatFinancialYear(startYear: number, fyStartMonth: number, format: FyFormat): string {
    // A January-start financial year is a calendar year: there is no second year to show.
    const endYear = fyStartMonth === 1 ? startYear : startYear + 1;
    const yy = (year: number) => String(year % 100).padStart(2, '0');
    const sameYear = startYear === endYear;
    switch (format) {
        case 'YY-YY':
            return sameYear ? yy(startYear) : `${yy(startYear)}-${yy(endYear)}`;
        case 'YYYY-YY':
            return sameYear ? String(startYear) : `${startYear}-${yy(endYear)}`;
        case 'YYYY-YYYY':
            return sameYear ? String(startYear) : `${startYear}-${endYear}`;
        case 'YYYY':
            return String(startYear);
        case 'YY':
            return yy(startYear);
    }
}

/** The financial year `date` falls in, on the business timezone's calendar. */
export function financialYearOf(date: Date, settings: Pick<SeriesSettings, 'fyStartMonth' | 'fyFormat'>, timeZone: string): FinancialYear {
    const { year, month } = zonedYearMonth(date, timeZone);
    const startYear = month >= settings.fyStartMonth ? year : year - 1;
    return { startYear, label: formatFinancialYear(startYear, settings.fyStartMonth, settings.fyFormat) };
}

/**
 * `SequenceCounter` key: `LD@2026` for an admin-added series (it restarts every financial year, so each FY gets
 * its own counter), `LD` for original numbering. Always <= 10 chars.
 */
export function counterKey(module: SeriesModule, rule: Pick<SeriesRule, 'resetEachFinancialYear'>, fy: FinancialYear): string {
    return rule.resetEachFinancialYear ? `${LEGACY_PREFIX[module]}@${fy.startYear}` : LEGACY_PREFIX[module];
}

/** NIPL + L + 26-27 + 1004 → `NIPL/L/26-27/1004`. */
export function formatDocumentNumber(settings: SeriesSettings, rule: SeriesRule, fy: FinancialYear, value: number): string {
    const parts = [
        rule.includeCompanyPrefix ? settings.companyPrefix : '',
        rule.modulePrefix,
        rule.includeFinancialYear ? fy.label : '',
        String(value).padStart(rule.padLength, '0'),
        rule.suffix,
    ];
    return parts.filter((part) => part.length > 0).join(settings.separator);
}

/** The number the counter hands out next, given the last one issued (0 = none yet). */
export function nextNumber(lastIssued: number, startingNumber: number): number {
    return Math.max(lastIssued + 1, startingNumber);
}
