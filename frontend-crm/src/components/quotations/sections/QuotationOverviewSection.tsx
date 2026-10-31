'use client';

import React, { useEffect, useMemo, useRef } from 'react';
import { Box } from '@mui/material';
import { useFormContext, useWatch } from 'react-hook-form';

import {
    FIELD_MAX_LENGTH,
    FormGrid,
    FormGridItem,
    SectionLabel,
    RhfTextField,
    RhfSelect,
    RhfLookup,
} from '@/components/forms';
import {
    QUOTE_STAGES,
    QUOTE_COMPANIES,
    QUOTE_VALIDATION_PERIODS,
    QUOTE_TERMS_TEMPLATES,
    QUOTE_PAYMENT_TERMS,
    QUOTE_PREPARED_FOR_OPTIONS,
    TERMS_TEMPLATE_DESCRIPTIONS,
    PAYMENT_TERMS_DESCRIPTIONS,
    type QuotationFormData,
} from '@/types/quotation.types';

/** Select + its description stacked in one grid cell. */
const termsColumnSx = { display: 'flex', flexDirection: 'column', gap: 2.5 } as const;

export function QuotationOverviewSection() {
    const { control, setValue, getValues } = useFormContext<QuotationFormData>();

    const quotationDate = useWatch({ control, name: 'quotationDate' });
    const validationPeriod = useWatch({ control, name: 'validationPeriod' });
    const termsAndCondition = useWatch({ control, name: 'termsAndCondition' });
    const paymentTerms = useWatch({ control, name: 'paymentTerms' });
    const organizationName = useWatch({ control, name: 'organizationName' });
    const contactName = useWatch({ control, name: 'contactName' });

    // Track previous values so we only overwrite descriptions when user changes the dropdown selection
    const prevTermsRef = useRef(termsAndCondition);
    const prevPaymentTermsRef = useRef(paymentTerms);

    // ── Auto-calculate validUntil from quotationDate + validationPeriod ──────────
    useEffect(() => {
        if (!quotationDate) return;
        const days = parseInt(validationPeriod || '30', 10) || 30;
        const baseDate = new Date(quotationDate);
        if (isNaN(baseDate.getTime())) return;

        baseDate.setDate(baseDate.getDate() + days);
        const yyyy = baseDate.getFullYear();
        const mm = String(baseDate.getMonth() + 1).padStart(2, '0');
        const dd = String(baseDate.getDate()).padStart(2, '0');
        const computedDate = `${yyyy}-${mm}-${dd}`;

        if (getValues('validUntil') !== computedDate) {
            setValue('validUntil', computedDate, {
                shouldDirty: true,
                shouldValidate: true,
            });
        }
    }, [quotationDate, validationPeriod, getValues, setValue]);

    // ── Auto-populate Terms & Conditions Description template ────────────────────
    useEffect(() => {
        if (termsAndCondition && termsAndCondition !== prevTermsRef.current) {
            const template = TERMS_TEMPLATE_DESCRIPTIONS[termsAndCondition];
            if (template) {
                setValue('termsAndConditionDescription', template, {
                    shouldDirty: true,
                    shouldValidate: true,
                });
            }
            prevTermsRef.current = termsAndCondition;
        }
    }, [termsAndCondition, setValue]);

    // ── Auto-populate Payment Terms Description template ─────────────────────────
    useEffect(() => {
        if (paymentTerms && paymentTerms !== prevPaymentTermsRef.current) {
            const template = PAYMENT_TERMS_DESCRIPTIONS[paymentTerms];
            if (template) {
                setValue('paymentTermsDescription', template, {
                    shouldDirty: true,
                    shouldValidate: true,
                });
            }
            prevPaymentTermsRef.current = paymentTerms;
        }
    }, [paymentTerms, setValue]);

    // ── Dynamic Prepared For Options ─────────────────────────────────────────────
    const preparedForOptions = useMemo(() => {
        const set = new Set<string>(QUOTE_PREPARED_FOR_OPTIONS);
        if (contactName) set.add(contactName);
        if (organizationName) set.add(organizationName);
        return Array.from(set);
    }, [contactName, organizationName]);

    return (
        <Box sx={{ p: { xs: 2.5, md: 3.5 } }}>
            <SectionLabel label="OVERVIEW" sx={{ mb: 3 }} />

            <FormGrid columns={3}>
                {/* ── Identity ── */}
                <RhfTextField<QuotationFormData>
                    name="quotationTitle"
                    label="Quotation Title"
                    required
                    placeholder="e.g. B-Softwares Enterprise Deal"
                    hint="Primary quote identifier"
                />
                <RhfTextField<QuotationFormData>
                    name="opportunityName"
                    label="Opportunity"
                    required
                    disabled
                    hint="Parent Opportunity"
                />
                <RhfSelect<QuotationFormData>
                    name="company"
                    label="Company"
                    required
                    options={QUOTE_COMPANIES}
                    placeholder="Select Issuing Company"
                    hint="Default: Nandini Infosystems"
                />

                {/* ── Validity: date + period → valid until ── */}
                <RhfTextField<QuotationFormData>
                    name="quotationDate"
                    label="Quotation Date"
                    type="date"
                    required
                    slotProps={{ inputLabel: { shrink: true } }}
                />
                <RhfSelect<QuotationFormData>
                    name="validationPeriod"
                    label="Validation Period"
                    required
                    options={QUOTE_VALIDATION_PERIODS}
                    placeholder="Select Period"
                    hint="Default: 30 Days"
                />
                <RhfTextField<QuotationFormData>
                    name="validUntil"
                    label="Valid Until"
                    type="date"
                    required
                    slotProps={{ inputLabel: { shrink: true } }}
                    hint="Date + validation period"
                />

                {/* ── Workflow ── */}
                <RhfSelect<QuotationFormData>
                    name="quoteStage"
                    label="Quote Stage"
                    required
                    options={QUOTE_STAGES}
                    placeholder="Select Quote Stage"
                    hint="Default: Draft"
                />
                <RhfSelect<QuotationFormData>
                    name="preparedFor"
                    label="Prepared For"
                    required
                    options={preparedForOptions}
                    placeholder="Select Target Entity"
                    hint="Recipient role or linked entity"
                />
                <RhfLookup<QuotationFormData>
                    name="assignedTo"
                    label="Assigned to"
                    required
                    lookupType="user"
                    placeholder="Select Representative"
                    hint="Managing representative"
                    fieldSize="md"
                />
                <RhfTextField<QuotationFormData>
                    name="otherRef"
                    label="Other Ref."
                    placeholder="External PO, tender, or inquiry ref..."
                    fieldSize="md"
                    maxLength={FIELD_MAX_LENGTH.shortText}
                />
            </FormGrid>

            {/* ── Terms: each template picker sits directly above the description it fills ── */}
            <FormGrid columns={2} sx={{ mt: 3 }}>
                <FormGridItem sx={termsColumnSx}>
                    <RhfSelect<QuotationFormData>
                        name="termsAndCondition"
                        label="Terms & Condition"
                        required
                        options={QUOTE_TERMS_TEMPLATES}
                        placeholder="Select Terms Template"
                        hint="Fills the description below"
                    />
                    <RhfTextField<QuotationFormData>
                        name="termsAndConditionDescription"
                        label="Terms & Condition Description"
                        multiline
                        minRows={3}
                        maxRows={6}
                        placeholder="Detailed terms, commercial conditions, and delivery clauses..."
                    />
                </FormGridItem>
                <FormGridItem sx={termsColumnSx}>
                    <RhfSelect<QuotationFormData>
                        name="paymentTerms"
                        label="Payment Terms"
                        required
                        options={QUOTE_PAYMENT_TERMS}
                        placeholder="Select Payment Terms"
                        hint="Fills the description below"
                    />
                    <RhfTextField<QuotationFormData>
                        name="paymentTermsDescription"
                        label="Payment Terms Description"
                        multiline
                        minRows={3}
                        maxRows={6}
                        placeholder="Milestone schedule, advance % and delivery breakdown..."
                    />
                </FormGridItem>
                <RhfTextField<QuotationFormData>
                    name="remarks"
                    label="Remarks"
                    multiline
                    minRows={3}
                    maxRows={5}
                    placeholder="Internal or customer-facing quotation remarks..."
                />
            </FormGrid>
        </Box>
    );
}

export default QuotationOverviewSection;
