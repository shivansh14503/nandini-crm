'use client';

import React from 'react';
import { Grid } from '@mui/material';
import { RhfTextField } from '@/components/forms';
import type { QuotationFormData } from '@/types/quotation.types';

export function QuotationTermsSection() {
    return (
        <Grid container spacing={3.5}>
            <Grid size={{ xs: 12, md: 6 }}>
                <RhfTextField<QuotationFormData>
                    name="termsAndConditions"
                    label="Terms and Conditions"
                    multiline
                    minRows={4}
                    placeholder="Enter statutory, payment, and delivery terms..."
                />
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
                <RhfTextField<QuotationFormData>
                    name="notes"
                    label="Internal Notes & Remarks"
                    multiline
                    minRows={4}
                    placeholder="Internal client context, special approvals, or delivery milestones..."
                />
            </Grid>
        </Grid>
    );
}
