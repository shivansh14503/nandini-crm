'use client';

import React from 'react';
import { Grid } from '@mui/material';
import {
    RhfTextField,
    RhfSelect,
    RhfLookup,
    RhfPhoneField,
    RhfEmailField,
} from '@/components/forms';
import { LEAD_ASSIGNED_USERS } from '@/types/lead.types';
import {
    QUOTATION_STATUSES,
    QUOTATION_PAYMENT_TERMS,
    type QuotationFormData,
} from '@/types/quotation.types';

export function QuotationCustomerSection() {
    return (
        <Grid container spacing={3.5}>
            {/* Left Column: Organization & Contact Association */}
            <Grid size={{ xs: 12, md: 6 }}>
                <RhfTextField<QuotationFormData>
                    name="quotationSubject"
                    label="Quotation Subject"
                    placeholder="e.g. Quotation for TallyPrime Enterprise & Support"
                />
                <RhfTextField<QuotationFormData>
                    name="organizationName"
                    label="Organization Name"
                    required
                    disabled
                    hint="Associated Organization Account"
                />
                <RhfTextField<QuotationFormData>
                    name="contactName"
                    label="Contact Person"
                    required
                    placeholder="e.g. Rajesh Kumar"
                />
                <RhfPhoneField<QuotationFormData>
                    name="contactNumber"
                    label="Contact Phone"
                    placeholder="e.g. 9876543210"
                />
                <RhfEmailField<QuotationFormData>
                    name="emailAddress"
                    label="Contact Email"
                    placeholder="rajesh@example.com"
                />
            </Grid>

            {/* Right Column: Dates, Terms, Status & Assignment */}
            <Grid size={{ xs: 12, md: 6 }}>
                <RhfTextField<QuotationFormData>
                    name="quoteDate"
                    label="Quotation Date"
                    type="date"
                    required
                />
                <RhfTextField<QuotationFormData>
                    name="validUntil"
                    label="Valid Until"
                    type="date"
                    required
                    hint="Default: 30 days validity"
                />
                <RhfSelect<QuotationFormData>
                    name="paymentTerms"
                    label="Payment Terms"
                    required
                    options={QUOTATION_PAYMENT_TERMS}
                    placeholder="Select Payment Terms"
                />
                <RhfSelect<QuotationFormData>
                    name="status"
                    label="Quotation Status"
                    required
                    options={QUOTATION_STATUSES}
                    placeholder="Select Status"
                />
                <RhfLookup<QuotationFormData>
                    name="assignedTo"
                    label="Assigned Representative"
                    required
                    options={LEAD_ASSIGNED_USERS}
                    placeholder="Select assigned sales rep"
                />
            </Grid>
        </Grid>
    );
}
