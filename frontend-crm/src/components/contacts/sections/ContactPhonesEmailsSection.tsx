'use client';

import React from 'react';
import { Grid } from '@mui/material';
import { RhfPhoneField, RhfEmailList } from '@/components/forms';
import type { ContactFormData } from '../../../types/contact.types';

/**
 * Alternate phone numbers (stacked on the left) and email addresses (right).
 * Must be rendered inside a `FormProvider<ContactFormData>`.
 */
export function ContactPhonesEmailsSection() {
    return (
        <Grid container spacing={3.5}>
            <Grid size={{ xs: 12, md: 6 }}>
                <RhfPhoneField<ContactFormData> name="phone3" label="Phone 3" placeholder="Alternate direct number" />
                <RhfPhoneField<ContactFormData> name="phone4" label="Phone 4" placeholder="Office extension / direct desk" />
                <RhfPhoneField<ContactFormData> name="phone5" label="Phone 5" placeholder="Additional mobile / helpline" />
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
                <RhfEmailList required />
            </Grid>
        </Grid>
    );
}
