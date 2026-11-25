'use client';

import React from 'react';
import { getNatureOfCalls } from '@/services/masterData.store';
import { getPartnerContacts } from '@/services/masterData.store';
import { useMasterData } from '@/hooks/queries/useMasterData';
import { useOpportunities } from '@/hooks/queries/useOpportunities';
import { useProducts } from '@/hooks/queries/useProducts';
import type { Product } from '@/types/product.types';
import { useDropdownOptions } from '@/hooks/queries/useFormConfigs';
import { useShowRecordNumber } from '@/hooks/queries/useDocumentSeries';
import type { NatureOfCallItem } from '@/types/ticket.types';
import { OPPORTUNITY_SALES_STAGES, type Opportunity } from '@/types/opportunity.types';
import { opportunityLabel } from '@/utils/opportunityLabel';
import type { PartnerCompany, PartnerCompanyContact } from '@/types/partner.types';
import type { EntityLookupModalProps } from '@/types/lookup.types';
import { GenericLookupModal } from './GenericLookupModal';
import {
    NATURE_OF_CALL_LOOKUP_PRESET,
    OPPORTUNITY_LOOKUP_PRESET,
    PARTNER_COMPANY_LOOKUP_PRESET,
    PARTNER_COMPANY_CONTACT_LOOKUP_PRESET,
    PRODUCT_LOOKUP_PRESET,
    type LookupPreset,
} from './lookupConfigs';

/**
 * Builds an entity lookup modal from a preset and a data source. `getLabel` is the value the field
 * stores, used to highlight the currently selected row.
 */
function createPresetLookupModal<T extends { id: string }>(
    preset: LookupPreset<T>,
    getData: () => T[],
    getLabel: (record: T) => string,
    displayName: string
) {
    function PresetLookupModal({ open, onClose, onSelect, selectedValue }: EntityLookupModalProps<T>) {
        // Subscribes to the masters so the list fills in once they load (API mode); getData reads the same store.
        useMasterData();
        const data = getData();
        const selected = selectedValue?.trim().toLowerCase();
        const selectedId = selected ? data.find((r) => getLabel(r).toLowerCase() === selected)?.id : undefined;
        return (
            <GenericLookupModal<T> open={open} onClose={onClose} onSelect={onSelect} data={data} selectedId={selectedId} {...preset} />
        );
    }
    PresetLookupModal.displayName = displayName;
    return PresetLookupModal;
}

export const NatureOfCallLookupModal = createPresetLookupModal<NatureOfCallItem>(
    NATURE_OF_CALL_LOOKUP_PRESET,
    getNatureOfCalls,
    (n) => n.name,
    'NatureOfCallLookupModal'
);

const NO_PARTNER_COMPANIES: PartnerCompany[] = [];

export function PartnerCompanyLookupModal({ open, onClose, onSelect, selectedValue }: EntityLookupModalProps<PartnerCompany>) {
    // Master data arrives after module import, so filter options are built from it here, not in the preset.
    const { partnerCompanies, users } = useMasterData();
    const filterFields = React.useMemo(() => {
        const natures = [...new Set(partnerCompanies.map((p) => p.natureOfPartner).filter(Boolean))].sort();
        const owners = users
            .filter((u) => u.status === 'Active')
            .map((u) => ({ value: u.username, label: u.name || u.username }))
            .sort((a, b) => a.label.localeCompare(b.label));
        return PARTNER_COMPANY_LOOKUP_PRESET.filterFields.map((f) =>
            f.key === 'natureOfPartner'
                ? { ...f, options: natures.map((n) => ({ value: n, label: n })) }
                : f.key === 'assignedTo'
                  ? { ...f, options: owners }
                  : f
        );
    }, [partnerCompanies, users]);

    const selected = selectedValue?.trim().toLowerCase();
    const selectedId = selected ? partnerCompanies.find((p) => p.partnerName.toLowerCase() === selected)?.id : undefined;
    return (
        <GenericLookupModal<PartnerCompany>
            open={open}
            onClose={onClose}
            onSelect={onSelect}
            data={open ? partnerCompanies : NO_PARTNER_COMPANIES}
            selectedId={selectedId}
            {...PARTNER_COMPANY_LOOKUP_PRESET}
            filterFields={filterFields}
        />
    );
}
PartnerCompanyLookupModal.displayName = 'PartnerCompanyLookupModal';

export const PartnerCompanyContactLookupModal = createPresetLookupModal<PartnerCompanyContact>(
    PARTNER_COMPANY_CONTACT_LOOKUP_PRESET,
    getPartnerContacts,
    (c) => c.name,
    'PartnerCompanyContactLookupModal'
);

const NO_OPPORTUNITIES: Opportunity[] = [];

export function OpportunityLookupModal({ open, onClose, onSelect, selectedValue, initialFilterValues }: EntityLookupModalProps<Opportunity>) {
    // Shared, cache-invalidated query: opportunities created elsewhere show up without reopening.
    const { data: opportunities, isLoading } = useOpportunities(undefined, { enabled: open });
    const stages = useDropdownOptions('opportunity_sales_stage', OPPORTUNITY_SALES_STAGES);
    const { users } = useMasterData();
    const showNumber = useShowRecordNumber()('opportunity');

    // Sales stages and owners load after module import, so their options are built here, not in the preset.
    const filterFields = React.useMemo(() => {
        const owners = users
            .filter((u) => u.status === 'Active')
            .map((u) => ({ value: u.username, label: u.name || u.username }))
            .sort((a, b) => a.label.localeCompare(b.label));
        return OPPORTUNITY_LOOKUP_PRESET.filterFields.map((f) =>
            f.key === 'salesStage'
                ? { ...f, options: stages.map((s) => ({ value: s, label: s })) }
                : f.key === 'assignedTo'
                  ? { ...f, options: owners }
                  : f
        );
    }, [stages, users]);

    // Numbers stay hidden (and unsearchable) until an admin adds the opportunity series, like everywhere else.
    const columns = React.useMemo(
        () => (showNumber ? OPPORTUNITY_LOOKUP_PRESET.columns : OPPORTUNITY_LOOKUP_PRESET.columns.filter((c) => c.id !== 'opportunityCode')),
        [showNumber]
    );
    const searchPredicate = React.useMemo<typeof OPPORTUNITY_LOOKUP_PRESET.searchPredicate>(
        () =>
            showNumber
                ? OPPORTUNITY_LOOKUP_PRESET.searchPredicate
                : (o, f, q) => OPPORTUNITY_LOOKUP_PRESET.searchPredicate({ ...o, opportunityCode: '' }, f, q),
        [showNumber]
    );

    const rows = opportunities ?? NO_OPPORTUNITIES;
    const selected = selectedValue?.trim().toLowerCase();
    const selectedId = selected ? rows.find((o) => opportunityLabel(o).trim().toLowerCase() === selected)?.id : undefined;
    return (
        <GenericLookupModal<Opportunity>
            open={open}
            onClose={onClose}
            onSelect={onSelect}
            data={open ? rows : NO_OPPORTUNITIES}
            loading={open && isLoading}
            selectedId={selectedId}
            {...OPPORTUNITY_LOOKUP_PRESET}
            columns={columns}
            searchPredicate={searchPredicate}
            filterFields={filterFields}
            initialFilterValues={initialFilterValues}
        />
    );
}

const NO_PRODUCTS: Product[] = [];

/** The product catalog (active products) for picking a line item's product. */
export function ProductLookupModal({ open, onClose, onSelect, selectedValue }: EntityLookupModalProps<Product>) {
    // Shared, cache-invalidated query: products added elsewhere show up without reopening.
    const { data, isLoading } = useProducts(undefined, { enabled: open });
    const products = React.useMemo(() => (data ?? NO_PRODUCTS).filter((p) => p.isActive !== false), [data]);
    const filterFields = React.useMemo(() => {
        const categories = [...new Set(products.map((p) => p.category).filter(Boolean))].sort((a, b) => a.localeCompare(b));
        return PRODUCT_LOOKUP_PRESET.filterFields.map((f) => (f.key === 'category' ? { ...f, options: categories.map((c) => ({ value: c, label: c })) } : f));
    }, [products]);

    const selected = selectedValue?.trim().toLowerCase();
    const selectedId = selected ? products.find((p) => p.productName.trim().toLowerCase() === selected)?.id : undefined;
    return (
        <GenericLookupModal<Product>
            open={open}
            onClose={onClose}
            onSelect={onSelect}
            data={open ? products : NO_PRODUCTS}
            loading={open && isLoading}
            selectedId={selectedId}
            {...PRODUCT_LOOKUP_PRESET}
            filterFields={filterFields}
        />
    );
}
