'use client';

import React, { useMemo } from 'react';
import { Grid } from '@mui/material';
import { RhfTextField, RhfLookup } from '@/components/forms';
import { organizationService } from '@/services';
import type { ContactFormData } from '../../../types/contact.types';

/**
 * Basic contact identity & organization association.
 * Must be rendered inside a `FormProvider<ContactFormData>`.
 */
export function ContactBasicInfoSection() {
    const organizationNames = useMemo(
        () => organizationService.getAllSync().map((o) => o.organizationName),
        []
    );

    return (
        <Grid container spacing={3.5}>
            <Grid size={{ xs: 12, md: 6 }}>
                <RhfTextField<ContactFormData> name="name" label="Name" required placeholder="e.g. Rajesh Kumar" />
                <RhfTextField<ContactFormData> name="mobile" label="Mobile" required type="tel" hint="Primary 10-digit mobile number" placeholder="e.g. 9876543210" />
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
                <RhfLookup<ContactFormData>
                    name="organizationName"
                    label="Organization Name"
                    required
                    hint="Parent company / account"
                    options={organizationNames}
                    placeholder="Search or select organization..."
                />
                <RhfTextField<ContactFormData> name="officePhone" label="Office Phone" type="tel" placeholder="e.g. 0112345678" />
            </Grid>
        </Grid>
    );
}
