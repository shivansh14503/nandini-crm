'use client';

import React from 'react';
import { Grid } from '@mui/material';
import { RhfTextField } from '@/components/forms';
import type { ContactFormData } from '../../../types/contact.types';

/**
 * Free-text description / notes.
 * Must be rendered inside a `FormProvider<ContactFormData>`.
 */
export function ContactPreferencesSection() {
    return (
        <Grid container spacing={3.5}>
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
