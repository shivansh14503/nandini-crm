'use client';

import React from 'react';
import { getNatureOfCalls } from '@/services/masterData.store';
import { getPartnerContacts } from '@/services/masterData.store';
import { useMasterData } from '@/hooks/queries/useMasterData';
import type { NatureOfCallItem } from '@/types/ticket.types';
import type { PartnerCompany, PartnerCompanyContact } from '@/types/partner.types';
import type { EntityLookupModalProps } from '@/types/lookup.types';
import { GenericLookupModal } from './GenericLookupModal';
import {
    NATURE_OF_CALL_LOOKUP_PRESET,
    PARTNER_COMPANY_LOOKUP_PRESET,
    PARTNER_COMPANY_CONTACT_LOOKUP_PRESET,
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
    const selectedId = selected ? partnerCompanies.find((p) => p.companyName.toLowerCase() === selected)?.id : undefined;
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
