'use client';

import React from 'react';
import { contactService, organizationService } from '@/services';
import { findCrmUser } from '@/data/mockUsers';
import type { EntityLookupModalProps, LookupKind, LookupRecordMap } from '@/types/lookup.types';
import { UserLookupModal } from './UserLookupModal';
import { OrganizationLookupModal } from './OrganizationLookupModal';
import { ContactLookupModal } from './ContactLookupModal';

const LOOKUP_MODALS: { [K in LookupKind]: React.ComponentType<EntityLookupModalProps<LookupRecordMap[K]>> } = {
    user: UserLookupModal,
    organization: OrganizationLookupModal,
    contact: ContactLookupModal,
};

/** Display value written into a lookup field for each kind of record. */
export const LOOKUP_DISPLAY_VALUE: { [K in LookupKind]: (record: LookupRecordMap[K]) => string } = {
    user: (u) => u.username,
    organization: (o) => o.organizationName,
    contact: (c) => c.name,
};

const sameText = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** Resolves a typed / autocompleted field value back to its record (exact, case-insensitive match). */
export const LOOKUP_FIND_RECORD: { [K in LookupKind]: (value: string) => LookupRecordMap[K] | undefined } = {
    user: (v) => findCrmUser(v),
    organization: (v) => (v.trim() ? organizationService.getAllSync().find((o) => sameText(o.organizationName, v)) : undefined),
    contact: (v) => (v.trim() ? contactService.getAllSync().find((c) => sameText(c.name, v)) : undefined),
};

export interface RecordLookupModalProps<K extends LookupKind> extends EntityLookupModalProps<LookupRecordMap[K]> {
    kind: K;
}

/** Renders the built-in lookup modal for `kind` (user / organization / contact). */
export function RecordLookupModal<K extends LookupKind>({ kind, ...props }: RecordLookupModalProps<K>) {
    const Modal: React.ComponentType<EntityLookupModalProps<LookupRecordMap[K]>> = LOOKUP_MODALS[kind];
    return <Modal {...props} />;
}
