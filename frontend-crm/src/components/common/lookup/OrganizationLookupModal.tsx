'use client';

import React, { useMemo } from 'react';
import { useOrganizations } from '@/hooks/queries';
import { useMasterData } from '@/hooks/queries/useMasterData';
import type { ExtendedOrganization } from '@/types/organization.types';
import type { EntityLookupModalProps } from '@/types/lookup.types';
import { GenericLookupModal } from './GenericLookupModal';
import { applyLookupCopy, ORGANIZATION_LOOKUP_PRESET, partnerOrganizationPreset } from './lookupConfigs';
import { useDropdownOptionLabel, useDropdownOptionsGetter } from '@/hooks/queries/useFormConfigs';
import { isPartnerCustomerType } from '@/config/constants';
import { NATURE_OF_PARTNER_OPTIONS } from '@/types/partner.types';
import { splitMulti, type LookupFilterValues } from '@/types/lookup.types';

const NO_ORGANIZATIONS: ExtendedOrganization[] = [];

/** Admin list of a partner's Nature of Partner (shared by partner companies and partner organizations). */
const PARTNER_NATURE_CATEGORY = 'partner_nature';

/** Whether the picker can only offer partner organizations: its Customer Type is locked to Partner. */
const isPartnerOnly = (locked?: LookupFilterValues): boolean => {
    const types = splitMulti(locked?.customerType);
    return types.length > 0 && types.every((t) => isPartnerCustomerType(t));
};

export function OrganizationLookupModal({
    open,
    onClose,
    onSelect,
    selectedValue,
    initialFilterValues,
    lockedFilterValues,
    copy,
}: EntityLookupModalProps<ExtendedOrganization>) {
    // Shared, cache-invalidated query: organizations created elsewhere show up without reopening.
    const { data: organizations = NO_ORGANIZATIONS, isLoading } = useOrganizations();
    // The user directory loads after module import, so "Assigned to" options are built from it here, not in the preset.
    const { users } = useMasterData();
    // Partner organizations only (Customer Type locked to Partner, as for a Partner Company): filter and show their
    // Nature of Partner (the admin's partner_nature list) instead of Nature of Business.
    const partnerOnly = isPartnerOnly(lockedFilterValues);
    const getOptions = useDropdownOptionsGetter();
    const natureOfPartnerLabel = useDropdownOptionLabel(PARTNER_NATURE_CATEGORY);
    // The field's own wording (e.g. "Partner Company Search" for a Partner Company) on top of the preset.
    const preset = useMemo(() => {
        const natureOptions = getOptions(PARTNER_NATURE_CATEGORY, NATURE_OF_PARTNER_OPTIONS).map((v) => ({ value: v, label: natureOfPartnerLabel(v) }));
        const base = partnerOnly ? partnerOrganizationPreset(ORGANIZATION_LOOKUP_PRESET, natureOptions, natureOfPartnerLabel) : ORGANIZATION_LOOKUP_PRESET;
        return applyLookupCopy(base, copy);
    }, [partnerOnly, getOptions, natureOfPartnerLabel, copy]);
    const filterFields = useMemo(() => {
        const userOptions = users
            .map((u) => ({ value: u.username, label: u.name || u.username }))
            .sort((a, b) => a.label.localeCompare(b.label));
        return preset.filterFields.map((f) => (f.key === 'assignedTo' ? { ...f, options: userOptions } : f));
    }, [users, preset]);

    const selectedId = organizations.find((o) => o.organizationName === selectedValue)?.id;
    // Text already typed in the field seeds the name filter; an exact pick just highlights its row instead. The field's
    // own filters apply on top; locked ones (Customer Type = Partner for a Partner Company) can't be changed.
    const typed = selectedId ? '' : (selectedValue ?? '').trim();
    const startFilters = typed || initialFilterValues ? { ...initialFilterValues, ...(typed ? { organizationName: typed } : {}) } : undefined;
    return (
        <GenericLookupModal<ExtendedOrganization>
            open={open}
            onClose={onClose}
            onSelect={onSelect}
            data={open ? organizations : NO_ORGANIZATIONS}
            loading={isLoading}
            selectedId={selectedId}
            {...preset}
            filterFields={filterFields}
            initialFilterValues={startFilters}
            lockedFilterValues={lockedFilterValues}
        />
    );
}
