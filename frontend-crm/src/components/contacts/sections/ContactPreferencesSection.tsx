'use client';

import React from 'react';
import { Grid } from '@mui/material';
import { RhfCheckbox, RhfChipGroup, RhfTextField } from '@/components/forms';
import { COMMUNICATION_TYPES, type ContactFormData } from '../../../types/contact.types';

/**
 * Communication channel preferences, compliance (DND) and notes.
 * Must be rendered inside a `FormProvider<ContactFormData>`.
 */
export function ContactPreferencesSection() {
    return (
        <Grid container spacing={3.5}>
            <Grid size={{ xs: 12, md: 6 }}>
                <RhfChipGroup<ContactFormData> name="communicationType" label="Communication Type" hint="Select preferred channels" options={COMMUNICATION_TYPES} />
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
                <RhfCheckbox<ContactFormData> name="doNotCall" label="Do Not Call (DND)" />
            </Grid>
            <Grid size={{ xs: 12 }}>
                <RhfTextField<ContactFormData>
                    name="description"
                    label="Add Description"
                    multiline
                    minRows={3}
                    placeholder="Enter additional contact details, background, notes, or special instructions..."
                />
            </Grid>
        </Grid>
    );
}
