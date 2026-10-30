'use client';

import React from 'react';
import { getNatureOfCalls } from '@/services/masterData.store';
import { getPartnerCompanies, getPartnerContacts } from '@/services/masterData.store';
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

export const PartnerCompanyLookupModal = createPresetLookupModal<PartnerCompany>(
    PARTNER_COMPANY_LOOKUP_PRESET,
    getPartnerCompanies,
    (p) => p.companyName,
    'PartnerCompanyLookupModal'
);

export const PartnerCompanyContactLookupModal = createPresetLookupModal<PartnerCompanyContact>(
    PARTNER_COMPANY_CONTACT_LOOKUP_PRESET,
    getPartnerContacts,
    (c) => c.name,
    'PartnerCompanyContactLookupModal'
);
