'use client';

import React, { useMemo } from 'react';
import type { FieldPath, FieldValues } from 'react-hook-form';
import { RhfLookup } from './rhf';
import { useOrganizations } from '@/hooks/queries';
import { isPartnerCustomerType, PARTNER_CUSTOMER_TYPE } from '@/config/constants';
import type { LookupCopy, LookupFilterValues } from '@/types/lookup.types';

/** The organization picker shows partner organizations only: its Customer Type filter is locked to Partner. */
const PARTNER_FILTERS: LookupFilterValues = { customerType: PARTNER_CUSTOMER_TYPE };

/** The picker reads as a partner company search (its Customer Type column is dropped: every row is a Partner). */
const PARTNER_COPY: LookupCopy = {
    title: 'Partner Company Search',
    subtitle: 'Select a partner company. Click a row to choose it.',
    emptyMessage: 'No partner companies found matching search criteria',
    recordLabel: { one: 'partner company', other: 'partner companies' },
    filters: { organizationName: { label: 'Partner Company Name', placeholder: 'Type partner company name...' } },
    columns: { organizationName: 'Partner Company', customerType: null },
};

export interface PartnerCompanyLookupProps<T extends FieldValues> {
    name: FieldPath<T>;
    required?: boolean;
}

/**
 * Partner Company of a lead or opportunity whose Lead Source is Partner: an organization picked from the organization
 * picker, worded as a Partner Company Search and with Customer Type locked to Partner, as the Organization form's Partner Company field did. Typing suggests partner organizations only; the name is stored (uppercase).
 */
export function PartnerCompanyLookup<T extends FieldValues>({ name, required = true }: PartnerCompanyLookupProps<T>) {
    const { data: organizations } = useOrganizations();
    const partnerNames = useMemo(() => {
        const seen = new Set<string>();
        return (organizations ?? [])
            .filter((o) => isPartnerCustomerType(o.customerType))
            .map((o) => o.organizationName)
            .filter((n) => {
                const key = n?.trim().toLowerCase();
                if (!key || seen.has(key)) return false;
                seen.add(key);
                return true;
            });
    }, [organizations]);

    return (
        <RhfLookup<T, 'organization'>
            name={name}
            label="Partner Company"
            lookupType="organization"
            required={required}
            hint="Organization with Customer Type Partner"
            placeholder="Search or select partner company..."
            options={partnerNames}
            lockedLookupFilters={PARTNER_FILTERS}
            lookupCopy={PARTNER_COPY}
        />
    );
}
