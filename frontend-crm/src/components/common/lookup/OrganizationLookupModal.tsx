'use client';

import React, { useMemo } from 'react';
import { organizationService } from '@/services';
import type { ExtendedOrganization } from '@/types/organization.types';
import type { EntityLookupModalProps } from '@/types/lookup.types';
import { GenericLookupModal } from './GenericLookupModal';
import { ORGANIZATION_LOOKUP_PRESET } from './lookupConfigs';

export function OrganizationLookupModal({ open, onClose, onSelect, selectedValue }: EntityLookupModalProps<ExtendedOrganization>) {
    // Re-read on every open so newly created organizations show up.
    const organizations = useMemo(() => (open ? organizationService.getAllSync() : []), [open]);
    const selectedId = organizations.find((o) => o.organizationName === selectedValue)?.id;
    return (
        <GenericLookupModal<ExtendedOrganization>
            open={open}
            onClose={onClose}
            onSelect={onSelect}
            data={organizations}
            selectedId={selectedId}
            {...ORGANIZATION_LOOKUP_PRESET}
        />
    );
}
