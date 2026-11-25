'use client';

import React, { useMemo } from 'react';
import { useOrganizations } from '@/hooks/queries';
import { useMasterData } from '@/hooks/queries/useMasterData';
import type { ExtendedOrganization } from '@/types/organization.types';
import type { EntityLookupModalProps } from '@/types/lookup.types';
import { GenericLookupModal } from './GenericLookupModal';
import { ORGANIZATION_LOOKUP_PRESET } from './lookupConfigs';

const NO_ORGANIZATIONS: ExtendedOrganization[] = [];

export function OrganizationLookupModal({
    open,
    onClose,
    onSelect,
    selectedValue,
    initialFilterValues,
    lockedFilterValues,
}: EntityLookupModalProps<ExtendedOrganization>) {
    // Shared, cache-invalidated query: organizations created elsewhere show up without reopening.
    const { data: organizations = NO_ORGANIZATIONS, isLoading } = useOrganizations();
    // The user directory loads after module import, so "Assigned to" options are built from it here, not in the preset.
    const { users } = useMasterData();
    const filterFields = useMemo(() => {
        const userOptions = users
            .map((u) => ({ value: u.username, label: u.name || u.username }))
            .sort((a, b) => a.label.localeCompare(b.label));
        return ORGANIZATION_LOOKUP_PRESET.filterFields.map((f) => (f.key === 'assignedTo' ? { ...f, options: userOptions } : f));
    }, [users]);

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
            {...ORGANIZATION_LOOKUP_PRESET}
            filterFields={filterFields}
            initialFilterValues={startFilters}
            lockedFilterValues={lockedFilterValues}
        />
    );
}
