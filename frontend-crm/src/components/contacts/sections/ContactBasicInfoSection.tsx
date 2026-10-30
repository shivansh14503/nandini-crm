'use client';

import React, { useMemo } from 'react';
import { useFormContext } from 'react-hook-form';
import { FormGrid, FormGridItem, RhfTextField, RhfPhoneField, RhfLookup, RhfCheckbox, RhfSelect } from '@/components/forms';
import { useOrganizations } from '@/hooks/queries';
import type { ContactFormData } from '@/types/contact.types';
import type { ExtendedOrganization } from '@/types/organization.types';

const NO_ORGANIZATIONS: ExtendedOrganization[] = [];

/**
 * Basic contact identity & organization association, plus primary-contact and left-job status.
 * Must be rendered inside a `FormProvider<ContactFormData>`.
 */
export function ContactBasicInfoSection() {
    const { setValue } = useFormContext<ContactFormData>();
    const { data: organizations = NO_ORGANIZATIONS } = useOrganizations();
    const organizationNames = useMemo(() => organizations.map((o) => o.organizationName), [organizations]);

    return (
        <FormGrid columns={3}>
            <RhfTextField<ContactFormData> name="name" label="Name" required placeholder="e.g. Rajesh Kumar" />
            <RhfPhoneField<ContactFormData> name="mobile" label="Mobile" required hint="Primary mobile" placeholder="e.g. 9876543210" />
            <RhfPhoneField<ContactFormData> name="officePhone" label="Office Phone" placeholder="e.g. 0112345678" />

            <FormGridItem span={2}>
                <RhfLookup<ContactFormData>
                    name="organizationName"
                    label="Organization Name"
                    required
                    hint="Parent company / account"
                    options={organizationNames}
                    placeholder="Search or select organization..."
                    lookupType="organization"
                    onSelectRecord={(org) => setValue('organizationId', org.id, { shouldDirty: true })}
                    onClearRecord={() => setValue('organizationId', '', { shouldDirty: true })}
                />
            </FormGridItem>
            <RhfSelect<ContactFormData> name="leftJob" label="Left Job" options={['No', 'Yes']} placeholder="Select" />

            <FormGridItem span="full">
                <RhfCheckbox<ContactFormData> name="isPrimaryContact" label="Is Primary Contact" />
            </FormGridItem>
        </FormGrid>
    );
}
