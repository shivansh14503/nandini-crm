import type { FinancialYear, FyFormat, SeriesInput, SeriesRule, SeriesSettings } from '@/types/documentSeries.types';

/**
 * Live previews for the Document Series admin page. Mirrors the API's formatter
 * (backend-crm/src/modules/document-series/documentSeries.format.ts), which is what actually issues numbers.
 */

export const MAX_COMPANY_PREFIX = 10;
export const MAX_MODULE_PREFIX = 10;
export const MAX_SUFFIX = 8;
export const MAX_PAD_LENGTH = 8;
export const MAX_STARTING_NUMBER = 99_999_999;

export function formatFinancialYear(startYear: number, fyStartMonth: number, format: FyFormat): string {
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

/** Today's financial year in `timeZone` (the API's business timezone), under draft settings. */
export function financialYearOf(settings: Pick<SeriesSettings, 'fyStartMonth' | 'fyFormat'>, timeZone: string, now = new Date()): FinancialYear {
    let year = now.getFullYear();
    let month = now.getMonth() + 1;
    try {
        const parts = new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: 'numeric' }).formatToParts(now);
        year = Number(parts.find((p) => p.type === 'year')?.value) || year;
        month = Number(parts.find((p) => p.type === 'month')?.value) || month;
    } catch {
        // Unknown timezone in this browser: fall back to local time.
    }
    const startYear = month >= settings.fyStartMonth ? year : year - 1;
    return { startYear, label: formatFinancialYear(startYear, settings.fyStartMonth, settings.fyFormat) };
}

export function formatDocumentNumber(settings: SeriesSettings, rule: SeriesRule, fy: FinancialYear, value: number): string {
    const parts = [
        rule.includeCompanyPrefix ? settings.companyPrefix : '',
        rule.modulePrefix,
        rule.includeFinancialYear ? fy.label : '',
        String(value).padStart(Math.max(1, rule.padLength || 1), '0'),
        rule.suffix,
    ];
    return parts.filter((part) => part.length > 0).join(settings.separator);
}

export const nextNumber = (lastIssued: number, startingNumber: number) => Math.max(lastIssued + 1, startingNumber || 1);

const ALNUM = /^[A-Za-z0-9]*$/;

/** Problems with a draft, keyed `companyPrefix` or `<module>.<field>` (same rules the API enforces). */
export function validateDraft(settings: SeriesSettings, rules: { module: string; label: string; rule: SeriesInput }[]): Record<string, string> {
    const errors: Record<string, string> = {};
    if (!ALNUM.test(settings.companyPrefix)) errors.companyPrefix = 'Letters and digits only.';
    else if (settings.companyPrefix.length > MAX_COMPANY_PREFIX) errors.companyPrefix = `Up to ${MAX_COMPANY_PREFIX} characters.`;

    const seen = new Map<string, string>();
    for (const { module, label, rule } of rules) {
        const prefix = rule.modulePrefix.trim();
        if (!prefix) errors[`${module}.modulePrefix`] = 'Required.';
        else if (!ALNUM.test(prefix)) errors[`${module}.modulePrefix`] = 'Letters and digits only.';
        else if (!/^[A-Za-z]/.test(prefix)) errors[`${module}.modulePrefix`] = 'Must start with a letter.';
        else if (prefix.length > MAX_MODULE_PREFIX) errors[`${module}.modulePrefix`] = `Up to ${MAX_MODULE_PREFIX} characters.`;
        else if (seen.has(prefix.toUpperCase())) errors[`${module}.modulePrefix`] = `Already used by ${seen.get(prefix.toUpperCase())}.`;
        if (prefix) seen.set(prefix.toUpperCase(), label);

        if (!ALNUM.test(rule.suffix)) errors[`${module}.suffix`] = 'Letters and digits only.';
        else if (rule.suffix.length > MAX_SUFFIX) errors[`${module}.suffix`] = `Up to ${MAX_SUFFIX} characters.`;

        if (!Number.isInteger(rule.padLength) || rule.padLength < 1 || rule.padLength > MAX_PAD_LENGTH) errors[`${module}.padLength`] = `1 to ${MAX_PAD_LENGTH}.`;
        if (!Number.isInteger(rule.startingNumber) || rule.startingNumber < 1 || rule.startingNumber > MAX_STARTING_NUMBER) {
            errors[`${module}.startingNumber`] = `1 to ${MAX_STARTING_NUMBER.toLocaleString('en-IN')}.`;
        }
        if (rule.includeCompanyPrefix && !settings.companyPrefix) errors[`${module}.includeCompanyPrefix`] = 'Set a company prefix first.';
    }
    return errors;
}
