'use client';

import React from 'react';
import {
    FormGrid,
    RhfTextField,
    RhfSelect,
    RhfLookup,
    RhfPhoneField,
    RhfEmailField,
} from '@/components/forms';
import {
    QUOTATION_STATUSES,
    QUOTATION_PAYMENT_TERMS,
    type QuotationFormData,
} from '@/types/quotation.types';

export function QuotationCustomerSection() {
    return (
        <FormGrid columns={3}>
            {/* ── Organization & contact ── */}
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
                hint="Associated account"
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

            {/* ── Dates, terms, status & assignment ── */}
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
                hint="Default: 30 days"
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
                lookupType="user"
                placeholder="Select sales rep"
                fieldSize="md"
            />
        </FormGrid>
    );
}
