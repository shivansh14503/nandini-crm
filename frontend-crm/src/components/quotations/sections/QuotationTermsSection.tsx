'use client';

import React from 'react';
import { FormGrid, FormGridItem, RhfTextField } from '@/components/forms';
import type { QuotationFormData } from '@/types/quotation.types';
import { FIELD_MAX_LENGTH } from '@/config/fieldLimits';

export function QuotationTermsSection() {
    return (
        <FormGrid columns={2}>
            <FormGridItem>
                <RhfTextField<QuotationFormData>
                    name="termsAndConditions"
                    label="Terms and Conditions"
                    multiline
                    maxLength={FIELD_MAX_LENGTH.termsText}
                    placeholder="Enter statutory, payment, and delivery terms..."
                />
            </FormGridItem>
            <FormGridItem>
                <RhfTextField<QuotationFormData>
                    name="notes"
                    label="Internal Notes & Remarks"
                    multiline
                    placeholder="Internal client context, special approvals, or delivery milestones..."
                />
            </FormGridItem>
        </FormGrid>
    );
}
