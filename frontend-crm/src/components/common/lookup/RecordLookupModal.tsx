'use client';

import React from 'react';
import { contactService, organizationService } from '@/services';
import { findCrmUser } from '@/data/mockUsers';
import { getNatureOfCalls } from '@/data/mockNatureOfCalls';
import { getPartnerCompanies, getPartnerContacts } from '@/data/mockPartners';
import type { EntityLookupModalProps, LookupKind, LookupRecordMap } from '@/types/lookup.types';
import { UserLookupModal } from './UserLookupModal';
import { OrganizationLookupModal } from './OrganizationLookupModal';
import { ContactLookupModal } from './ContactLookupModal';
import { NatureOfCallLookupModal, PartnerCompanyLookupModal, PartnerCompanyContactLookupModal } from './PresetLookupModals';

const LOOKUP_MODALS: { [K in LookupKind]: React.ComponentType<EntityLookupModalProps<LookupRecordMap[K]>> } = {
    user: UserLookupModal,
    organization: OrganizationLookupModal,
    contact: ContactLookupModal,
    natureOfCall: NatureOfCallLookupModal,
    partnerCompany: PartnerCompanyLookupModal,
    partnerCompanyContact: PartnerCompanyContactLookupModal,
};

/** Display value written into a lookup field for each kind of record. */
export const LOOKUP_DISPLAY_VALUE: { [K in LookupKind]: (record: LookupRecordMap[K]) => string } = {
    user: (u) => u.username,
    organization: (o) => o.organizationName,
    contact: (c) => c.name,
    natureOfCall: (n) => n.name,
    partnerCompany: (p) => p.companyName,
    partnerCompanyContact: (c) => c.name,
};

const sameText = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** Finds the first record whose label matches `value` exactly (case-insensitive); empty input matches nothing. */
const findByLabel = <T,>(records: T[], label: (r: T) => string, value: string) =>
    value.trim() ? records.find((r) => sameText(label(r), value)) : undefined;

/** Resolves a typed / autocompleted field value back to its record (exact, case-insensitive match). */
export const LOOKUP_FIND_RECORD: { [K in LookupKind]: (value: string) => LookupRecordMap[K] | undefined } = {
    user: (v) => findCrmUser(v),
    organization: (v) => findByLabel(organizationService.getAllSync(), (o) => o.organizationName, v),
    contact: (v) => findByLabel(contactService.getAllSync(), (c) => c.name, v),
    natureOfCall: (v) => findByLabel(getNatureOfCalls(), (n) => n.name, v),
    partnerCompany: (v) => findByLabel(getPartnerCompanies(), (p) => p.companyName, v),
    partnerCompanyContact: (v) => findByLabel(getPartnerContacts(), (c) => c.name, v),
};

export interface RecordLookupModalProps<K extends LookupKind> extends EntityLookupModalProps<LookupRecordMap[K]> {
    kind: K;
}

/** Renders the built-in lookup modal for `kind`. */
export function RecordLookupModal<K extends LookupKind>({ kind, ...props }: RecordLookupModalProps<K>) {
    const Modal: React.ComponentType<EntityLookupModalProps<LookupRecordMap[K]>> = LOOKUP_MODALS[kind];
    return <Modal {...props} />;
}
