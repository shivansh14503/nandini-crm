import type { SeriesModule } from '@/types/documentSeries.types';

/**
 * Record fields that hold a document-series number, by the module whose series issues it. A module's numbers are
 * shown only once an admin adds its series (see `useShowRecordNumber`), so these fields are dropped from
 * generic tables and detail lists until then.
 */
export const NUMBER_FIELD_MODULE: Readonly<Record<string, SeriesModule>> = {
    leadCode: 'lead',
    leadNumber: 'lead',
    opportunityCode: 'opportunity',
    oppNumber: 'opportunity',
    quotationCode: 'quotation',
    accountCode: 'organization',
    contactCode: 'contact',
    ticketNumber: 'ticket',
    productCode: 'product',
};

/** False for a number field whose module has no admin-added series. */
export function isShownField(field: string, showNumber: (module: SeriesModule) => boolean): boolean {
    const owner = NUMBER_FIELD_MODULE[field];
    return !owner || showNumber(owner);
}
