'use client';

import React from 'react';
import { findCrmUser } from '@/services/masterData.store';
import { useMasterData } from '@/hooks/queries/useMasterData';
import type { CrmUser } from '@/types/user.types';
import type { EntityLookupModalProps } from '@/types/lookup.types';
import { GenericLookupModal } from './GenericLookupModal';
import { USER_LOOKUP_PRESET } from './lookupConfigs';

/** "User Search" picker (Group User / Department filters). Lists active users only. */
export function UserLookupModal({ open, onClose, onSelect, selectedValue }: EntityLookupModalProps<CrmUser>) {
    const { users } = useMasterData();
    const activeUsers = React.useMemo(() => users.filter((u) => u.status === 'Active'), [users]);
    return (
        <GenericLookupModal<CrmUser>
            open={open}
            onClose={onClose}
            onSelect={onSelect}
            data={activeUsers}
            selectedId={findCrmUser(selectedValue)?.id}
            {...USER_LOOKUP_PRESET}
        />
    );
}
