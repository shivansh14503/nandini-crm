'use client';

import React from 'react';
import { findCrmUser } from '@/services/masterData.store';
import { useMasterData } from '@/hooks/queries/useMasterData';
import type { CrmUser } from '@/types/user.types';
import type { EntityLookupModalProps } from '@/types/lookup.types';
import { GenericLookupModal } from './GenericLookupModal';
import { USER_LOOKUP_PRESET } from './lookupConfigs';

/** "User Search" picker matching the legacy CRM popup (Group User / Status / Department filters). */
export function UserLookupModal({ open, onClose, onSelect, selectedValue }: EntityLookupModalProps<CrmUser>) {
    const { users } = useMasterData();
    return (
        <GenericLookupModal<CrmUser>
            open={open}
            onClose={onClose}
            onSelect={onSelect}
            data={users}
            selectedId={findCrmUser(selectedValue)?.id}
            {...USER_LOOKUP_PRESET}
        />
    );
}
