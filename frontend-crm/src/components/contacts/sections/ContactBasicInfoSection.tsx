'use client';

import React, { useMemo } from 'react';
import { useFormContext } from 'react-hook-form';
import { FormGrid, FormGridItem, RhfTextField, RhfPhoneField, RhfLookup, RhfCheckbox, RhfSelect } from '@/components/forms';
import { organizationService } from '@/services';
import type { ContactFormData } from '../../../types/contact.types';

/**
 * Basic contact identity & organization association, plus primary-contact and left-job status.
 * Must be rendered inside a `FormProvider<ContactFormData>`.
 */
export function ContactBasicInfoSection() {
    const { setValue } = useFormContext<ContactFormData>();
    const organizationNames = useMemo(
        () => organizationService.getAllSync().map((o) => o.organizationName),
        []
    );

    return (
        <FormGrid columns={3}>
            <RhfTextField<ContactFormData> name="name" label="Name" required placeholder="e.g. Rajesh Kumar" />
            <RhfPhoneField<ContactFormData> name="mobile" label="Mobile" required hint="Primary 10-digit mobile" placeholder="e.g. 9876543210" />
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
