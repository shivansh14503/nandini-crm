'use client';

import React from 'react';
import {
    findCrmUser,
    getNatureOfCalls,
    getPartnerCompanies,
    getPartnerContacts,
} from '@/services/masterData.store';
import type { Contact } from '@/types/contact.types';
import type { Opportunity } from '@/types/opportunity.types';
import type { EntityLookupModalProps, LookupKind, LookupRecordMap } from '@/types/lookup.types';
import type { ExtendedOrganization } from '@/types/organization.types';
import type { Referral } from '@/types/referral.types';
import { canonicalizeOrgName } from '@/utils/organizationName';
import { opportunityLabel } from '@/utils/opportunityLabel';
import { UserLookupModal } from './UserLookupModal';
import { OrganizationLookupModal } from './OrganizationLookupModal';
import { ContactLookupModal } from './ContactLookupModal';
import {
    NatureOfCallLookupModal,
    OpportunityLookupModal,
    PartnerCompanyLookupModal,
    PartnerCompanyContactLookupModal,
    ReferralLookupModal,
} from './PresetLookupModals';

const LOOKUP_MODALS: { [K in LookupKind]: React.ComponentType<EntityLookupModalProps<LookupRecordMap[K]>> } = {
    user: UserLookupModal,
    organization: OrganizationLookupModal,
    contact: ContactLookupModal,
    opportunity: OpportunityLookupModal,
    natureOfCall: NatureOfCallLookupModal,
    partnerCompany: PartnerCompanyLookupModal,
    partnerCompanyContact: PartnerCompanyContactLookupModal,
    referral: ReferralLookupModal,
};

/** Display value written into a lookup field for each kind of record. */
export const LOOKUP_DISPLAY_VALUE: { [K in LookupKind]: (record: LookupRecordMap[K]) => string } = {
    user: (u) => u.username,
    organization: (o) => o.organizationName,
    contact: (c) => c.name,
    opportunity: opportunityLabel,
    natureOfCall: (n) => n.name,
    partnerCompany: (p) => p.partnerName,
    partnerCompanyContact: (c) => c.name,
    referral: (r) => r.name,
};

const sameText = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** Finds the first record whose label matches `value` exactly (case-insensitive); empty input matches nothing. */
const findByLabel = <T,>(records: T[], label: (r: T) => string, value: string) =>
    value.trim() ? records.find((r) => sameText(label(r), value)) : undefined;

const findByCanonicalOrgName = (organizations: ExtendedOrganization[], value: string) => {
    const canonical = canonicalizeOrgName(value);
    return canonical ? organizations.find((o) => canonicalizeOrgName(o.organizationName) === canonical) : undefined;
};

export interface LookupRecordPools {
    organizations?: ExtendedOrganization[];
    contacts?: Contact[];
    opportunities?: Opportunity[];
    /** Active referrals (see useActiveReferrals). */
    referrals?: Referral[];
}

/** Resolves a typed / autocompleted field value back to its record (exact, case-insensitive match). */
export function findLookupRecord<K extends LookupKind>(
    kind: K,
    value: string,
    pools: LookupRecordPools = {}
): LookupRecordMap[K] | undefined {
    switch (kind) {
        case 'user':
            return findCrmUser(value) as LookupRecordMap[K] | undefined;
        case 'organization':
            // Exact name first, else the same legal name written differently ("ABC Private Limited" → "ABC Pvt Ltd").
            return (findByLabel(pools.organizations ?? [], (o) => o.organizationName, value) ??
                findByCanonicalOrgName(pools.organizations ?? [], value)) as LookupRecordMap[K] | undefined;
        case 'contact':
            return findByLabel(pools.contacts ?? [], (c) => c.name, value) as LookupRecordMap[K] | undefined;
        case 'opportunity':
            return findByLabel(pools.opportunities ?? [], opportunityLabel, value) as LookupRecordMap[K] | undefined;
        case 'natureOfCall':
            return findByLabel(getNatureOfCalls(), (n) => n.name, value) as LookupRecordMap[K] | undefined;
        case 'partnerCompany':
            return findByLabel(getPartnerCompanies(), (p) => p.partnerName, value) as LookupRecordMap[K] | undefined;
        case 'partnerCompanyContact':
            return findByLabel(getPartnerContacts(), (c) => c.name, value) as LookupRecordMap[K] | undefined;
        case 'referral':
            return findByLabel(pools.referrals ?? [], (r) => r.name, value) as LookupRecordMap[K] | undefined;
    }
}

export interface RecordLookupModalProps<K extends LookupKind> extends EntityLookupModalProps<LookupRecordMap[K]> {
    kind: K;
}

/** Renders the built-in lookup modal for `kind`. */
export function RecordLookupModal<K extends LookupKind>({ kind, ...props }: RecordLookupModalProps<K>) {
    const Modal: React.ComponentType<EntityLookupModalProps<LookupRecordMap[K]>> = LOOKUP_MODALS[kind];
    return <Modal {...props} />;
}
