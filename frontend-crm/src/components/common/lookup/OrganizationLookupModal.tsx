'use client';

import React from 'react';
import { useOrganizations } from '@/hooks/queries';
import type { ExtendedOrganization } from '@/types/organization.types';
import type { EntityLookupModalProps } from '@/types/lookup.types';
import { GenericLookupModal } from './GenericLookupModal';
import { ORGANIZATION_LOOKUP_PRESET } from './lookupConfigs';

const NO_ORGANIZATIONS: ExtendedOrganization[] = [];

export function OrganizationLookupModal({ open, onClose, onSelect, selectedValue }: EntityLookupModalProps<ExtendedOrganization>) {
    // Shared, cache-invalidated query: organizations created elsewhere show up without reopening.
    const { data: organizations = NO_ORGANIZATIONS, isLoading } = useOrganizations();
    const selectedId = organizations.find((o) => o.organizationName === selectedValue)?.id;
    return (
        <GenericLookupModal<ExtendedOrganization>
            open={open}
            onClose={onClose}
            onSelect={onSelect}
            data={open ? organizations : NO_ORGANIZATIONS}
            loading={isLoading}
            selectedId={selectedId}
            {...ORGANIZATION_LOOKUP_PRESET}
        />
    );
}
