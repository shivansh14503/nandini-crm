/** Mirrors backend-crm/src/modules/document-series (GET / PUT /api/document-series). */

export const SERIES_MODULES = ['lead', 'opportunity', 'quotation', 'organization', 'contact', 'ticket', 'product'] as const;
export type SeriesModule = (typeof SERIES_MODULES)[number];

export const SEPARATORS = ['/', '-', '_', '.', ''] as const;
export type Separator = (typeof SEPARATORS)[number];

export const FY_FORMATS = ['YY-YY', 'YYYY-YY', 'YYYY-YYYY', 'YYYY', 'YY'] as const;
export type FyFormat = (typeof FY_FORMATS)[number];

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

export interface FinancialYear {
    startYear: number;
    label: string;
}

export interface DocumentSeriesDto extends SeriesRule {
    module: SeriesModule;
    label: string;
    /** Last number issued in the current period (0 = none yet). */
    lastNumber: number;
    nextCode: string;
    updatedBy: string | null;
    updatedAt: string | null;
}

/** A module without a series: it keeps its original numbering. */
export interface DefaultNumberingDto {
    module: SeriesModule;
    label: string;
    /** Next number under the original numbering, e.g. `LD-0013`. */
    nextCode: string;
    suggestedPrefix: string;
    /** Last number issued this financial year if a series is added now (0 = none yet). */
    seriesLastNumber: number;
}

export interface DocumentSeriesConfig {
    settings: SeriesSettings & { updatedBy: string | null; updatedAt: string | null };
    currentFinancialYear: FinancialYear;
    timeZone: string;
    /** Admin-added series (always include the financial year and restart every year). */
    series: DocumentSeriesDto[];
    defaultNumbering: DefaultNumberingDto[];
}

/** What an admin edits per series. */
export type SeriesInput = Pick<SeriesRule, 'modulePrefix' | 'includeCompanyPrefix' | 'suffix' | 'padLength' | 'startingNumber'>;

export interface SaveDocumentSeriesPayload extends SeriesSettings {
    /** The full list: modules left out go back to their original numbering. */
    series: (SeriesInput & { module: SeriesModule })[];
}
