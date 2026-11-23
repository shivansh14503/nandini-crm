import { useMemo } from 'react';
import type { DrawerLayoutModule } from '@/lib/drawer-layout';
import { usePaginatedContacts } from '@/hooks/queries/useContacts';
import { usePaginatedLeads } from '@/hooks/queries/useLeads';
import { usePaginatedOpportunities } from '@/hooks/queries/useOpportunities';
import { usePaginatedOrganizations } from '@/hooks/queries/useOrganizations';
import { usePaginatedPartnerCompanies } from '@/hooks/queries/usePartnerCompanies';
import { usePaginatedProducts } from '@/hooks/queries/useProducts';
import { usePaginatedQuotations } from '@/hooks/queries/useQuotations';
import { usePaginatedTickets } from '@/hooks/queries/useTickets';

type AnyRecord = Record<string, unknown>;

/** The 25 most recent records of the module, to preview the drawer with (one page; only the module's list loads). */
export function usePreviewRecords(module: DrawerLayoutModule): AnyRecord[] {
    const page = { page: 1, limit: 25 };
    const on = (m: DrawerLayoutModule) => ({ enabled: module === m });
    const lists: Record<DrawerLayoutModule, { data?: { data?: unknown[] } }> = {
        leads: usePaginatedLeads(page, on('leads')),
        contacts: usePaginatedContacts(page, on('contacts')),
        organizations: usePaginatedOrganizations(page, on('organizations')),
        opportunities: usePaginatedOpportunities(page, on('opportunities')),
        quotations: usePaginatedQuotations(page, on('quotations')),
        products: usePaginatedProducts(page, on('products')),
        tickets: usePaginatedTickets(page, on('tickets')),
        'partner-companies': usePaginatedPartnerCompanies(page, on('partner-companies')),
    };
    const rows = lists[module].data?.data;
    return useMemo(() => (rows ?? []) as AnyRecord[], [rows]);
}

/** Each module's record number, shown next to the record's title in the preview picker. */
const NUMBER_FIELD: Partial<Record<DrawerLayoutModule, string>> = {
    leads: 'leadCode',
    contacts: 'contactCode',
    organizations: 'accountCode',
    opportunities: 'opportunityCode',
    quotations: 'quotationCode',
    products: 'productCode',
    tickets: 'ticketNumber',
};

/** "Rohan Sharma · LD-00042" for the picker. */
export function previewRecordLabel(module: DrawerLayoutModule, record: AnyRecord, titleField: string): string {
    const text = (key: string | undefined) => (key && typeof record[key] === 'string' ? String(record[key]).trim() : '');
    return [text(titleField), text(NUMBER_FIELD[module])].filter(Boolean).join(' · ') || String(record.id);
}
