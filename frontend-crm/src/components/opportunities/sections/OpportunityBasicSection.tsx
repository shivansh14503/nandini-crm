'use client';

import React, { useState } from 'react';
import {
    Box,
    Divider,
    FormHelperText,
} from '@mui/material';
// Raw text inputs show the admin-configured placeholder of the FormField they sit in.
import { ConfiguredTextField as TextField } from '@/components/forms/ConfiguredTextField';
import ArticleOutlinedIcon from '@mui/icons-material/ArticleOutlined';
import ReceiptLongOutlinedIcon from '@mui/icons-material/ReceiptLongOutlined';
import MonetizationOnOutlinedIcon from '@mui/icons-material/MonetizationOnOutlined';

import {
    FIELD_MAX_LENGTH,
    FormField,
    FormGrid,
    FormGridItem,
    LookupField,
    LOOKUP_FIELD_SIZE,
    StyledSelect,
    SectionLabel,
    fieldSx,
    resolveOptionsFieldSize,
    RhfPhoneField,
    RhfEmailField,
} from '@/components/forms';
import { UserLookupModal } from '@/components/common/lookup';
import { DATE_TIME_COLUMNS, TimePicker } from '@/components/forms/TimePicker';
import { upperCase, useUndoSafeSanitizer } from '@/components/forms/undoSafeInput';
import { formatPersonName } from '@/utils/personName';
import { MultiAutocompleteInput, MultiSelectChips } from '@/components/forms/rhf/RhfMultiAutocomplete';
import { localToday } from '@/utils/pastDates';
import type { OpportunityFormData } from '@/types/opportunity.types';
import {
    OPPORTUNITY_SALES_STAGES,
    OPPORTUNITY_TYPES,
    OPPORTUNITY_COMMISSIONS,
    OPPORTUNITY_DOCUMENT_OPTIONS,
} from '@/types/opportunity.types';
import {
    PRODUCT_CATEGORIES,
    LEAD_SOURCES,
    FOLLOWUP_TYPES,
} from '@/types/lead.types';
import { useDropdownOptionsGetter } from '@/hooks/queries/useFormConfigs';
import { useFormState } from 'react-hook-form';
import { useFormMode } from '@/context/FormModeContext';
import { CUSTOMER_RESPONSE_CATEGORY, CUSTOMER_RESPONSES, FieldGlow, useFollowUpDecision } from '@/components/forms/FollowUpDecision';

export interface OpportunityBasicSectionProps {
    form: OpportunityFormData;
    setField: <K extends keyof OpportunityFormData>(key: K, value: OpportunityFormData[K]) => void;
    /** Top-right toast of the form (e.g. "previous follow-up has expired"). */
    notify?: (message: string, severity?: 'success' | 'error' | 'info' | 'warning') => void;
    /** Told while the user still owes the next follow-up decision; the form refuses to save until it's made. */
    onDecisionPendingChange?: (pending: boolean) => void;
}

export function OpportunityBasicSection({ form, setField, notify, onDecisionPendingChange }: OpportunityBasicSectionProps) {
    const getOptions = useDropdownOptionsGetter();
    const { mode } = useFormMode();
    const isEdit = mode === 'edit';
    // Customer Response → keep or reschedule the next follow-up (see FollowUpDecision).
    const { setAnchor: setResponseAnchor, onResponseChange, glow: followUpGlow, popper: followUpPopper } = useFollowUpDecision({ enabled: isEdit, notify, onPendingChange: onDecisionPendingChange });
    const customerResponseOptions = getOptions(CUSTOMER_RESPONSE_CATEGORY, CUSTOMER_RESPONSES);
    const { errors } = useFormState<OpportunityFormData>();
    const customerResponseError = errors.customerResponse?.message;
    const followUpDateError = errors.nextFollowupDate?.message ?? errors.nextFollowupTime?.message;
    const [userLookupOpen, setUserLookupOpen] = useState(false);
    // Organization names are stored uppercase.
    const orgNameInputRef = useUndoSafeSanitizer(upperCase);

    return (
        <Box sx={{ p: { xs: 2.5, md: 3.5 } }}>
            {/* ══════════════════════════════════════════════════════════════════════ */}
            {/* PRIMARY OPPORTUNITY DETAILS                                           */}
            {/* ══════════════════════════════════════════════════════════════════════ */}
            <SectionLabel
                icon={<ArticleOutlinedIcon sx={{ fontSize: 18 }} />}
                label="Primary Opportunity Details"
                sx={{ mb: 2.5 }}
            />
            <FormGrid columns={3}>
                {/* ── Customer ── */}
                <FormField name="organizationName" label="Organization name" required hint="Client company name">
                    <TextField
                        fullWidth
                        size="small"
                        placeholder="Enter legal / trading organization name"
                        value={form.organizationName}
                        inputRef={orgNameInputRef}
                        onChange={(e) => setField('organizationName', e.target.value.toUpperCase())}
                        sx={fieldSx}
                        slotProps={{ htmlInput: { maxLength: FIELD_MAX_LENGTH.organizationName } }}
                    />
                </FormField>

                <FormField name="contact" label="Contact" required size={LOOKUP_FIELD_SIZE} fit={null} hint="Primary decision maker">
                    <LookupField
                        value={form.contact}
                        onChange={(val) => setField('contact', val)}
                        formatValue={formatPersonName}
                        placeholder="Type or select contact..."
                        options={[
                            'Vikram Singhania',
                            'Neha Mehta',
                            'Rohit Bansal',
                            'Priya Nair',
                            'Sunil Aggarwal',
                            'Rajesh Gupta',
                            'Amit Patel',
                            'Pooja Verma',
                        ]}
                        required
                    />
                </FormField>

                <RhfPhoneField<OpportunityFormData>
                    name="contactNumber"
                    label="Contact Number"
                    required
                    hint="Mobile / direct phone"
                    placeholder="e.g. 9800000000"
                    onChange={(e) => setField('contactNumber', e.target.value)}
                />

                <RhfEmailField<OpportunityFormData>
                    name="contactEmail"
                    label="Contact Email"
                    hint="Official contact email"
                    placeholder="corporate.contact@company.com"
                    onChange={(e) => setField('contactEmail', e.target.value)}
                />

                <FormField name="referredBy" label="Referred By" size={LOOKUP_FIELD_SIZE} fit={null} hint="Partner, agent, or client">
                    <LookupField
                        value={form.referredBy || ''}
                        onChange={(val) => setField('referredBy', val)}
                        placeholder="Referred by partner or person..."
                        options={[
                            'Shree Associates',
                            'Apex Tally Partners',
                            'Chartered Financials Ltd',
                            'Global Tech Network',
                            'Direct Partner Network',
                        ]}
                    />
                </FormField>

                <FormField name="leadGivenBy" label="Lead Given By" size={LOOKUP_FIELD_SIZE} fit={null} required hint="Referrer or internal sponsor">
                    <LookupField
                        value={form.leadGivenBy}
                        onChange={(val) => setField('leadGivenBy', val)}
                        placeholder="Internal sponsor or external referrer..."
                        options={[
                            'Direct Inbound Marketing',
                            'Mittal Sharma',
                            'Rajesh Kumar',
                            'Channel Partner Delhi-NCR',
                            'Tally Sales Promotion Event',
                        ]}
                        required
                    />
                </FormField>

                {/* ── Pipeline ── */}
                <FormField name="type" label="Type" required size={resolveOptionsFieldSize(OPPORTUNITY_TYPES)} hint="Nature of deal">
                    <StyledSelect
                        value={form.type}
                        onChange={(v) => setField('type', v)}
                        options={OPPORTUNITY_TYPES}
                        placeholder="Select Opportunity Type"
                        required
                    />
                </FormField>

                <FormField name="leadSource" label="Lead Source" required size={resolveOptionsFieldSize(LEAD_SOURCES)}>
                    <StyledSelect
                        value={form.leadSource}
                        onChange={(v) => setField('leadSource', v)}
                        options={LEAD_SOURCES}
                        placeholder="Select Lead Source"
                        required
                    />
                </FormField>

                <FormField name="salesStage" label="Sales Stage" required size={resolveOptionsFieldSize(OPPORTUNITY_SALES_STAGES)} hint="Pipeline phase">
                    <StyledSelect
                        value={form.salesStage || 'Qualification'}
                        onChange={(v) => setField('salesStage', v)}
                        options={OPPORTUNITY_SALES_STAGES}
                        placeholder="Select Sales Stage"
                        required
                    />
                </FormField>

                {/* ── Follow-up & ownership ── */}
                <FormField name="followupType" label="Followup Type" size={resolveOptionsFieldSize(FOLLOWUP_TYPES)} hint="Default: Call">
                    <StyledSelect
                        value={form.followupType || 'Call'}
                        onChange={(v) => setField('followupType', v)}
                        options={FOLLOWUP_TYPES}
                        placeholder="Select Type"
                    />
                </FormField>

                {/* Asked on every edit (a new opportunity has no follow-up to report on yet). */}
                {mode !== 'create' && (
                    <Box ref={setResponseAnchor} sx={{ minWidth: 0, '&& > *': { mb: 0 } }}>
                        <FormField name="customerResponse" label="Customer Response" required={isEdit} size={resolveOptionsFieldSize(customerResponseOptions)} hint="From the last follow-up">
                            <StyledSelect
                                value={form.customerResponse || ''}
                                onChange={(v) => {
                                    const previous = form.customerResponse || '';
                                    setField('customerResponse', v);
                                    onResponseChange(v, previous);
                                }}
                                options={customerResponseOptions}
                                placeholder="Select customer response"
                            />
                            {customerResponseError && (
                                <FormHelperText error sx={{ mx: 1.75 }}>
                                    {customerResponseError}
                                </FormHelperText>
                            )}
                        </FormField>
                    </Box>
                )}

                <FieldGlow active={followUpGlow}>
                <FormField name="nextFollowupDate" label="Next Followup Date" required size="md" hint="Next touchpoint">
                    <Box sx={{ display: 'grid', gridTemplateColumns: DATE_TIME_COLUMNS, gap: 1 }}>
                        <TextField
                            fullWidth
                            size="small"
                            type="date"
                            value={form.nextFollowupDate}
                            onChange={(e) => setField('nextFollowupDate', e.target.value)}
                            slotProps={{ htmlInput: { min: localToday() } }}
                            sx={fieldSx}
                        />
                        <TimePicker
                            value={form.nextFollowupTime || ''}
                            onChange={(value) => setField('nextFollowupTime', value)}
                            date={form.nextFollowupDate}
                            ariaLabel="Next followup time"
                        />
                    </Box>
                    {followUpDateError && <FormHelperText error>{followUpDateError}</FormHelperText>}
                </FormField>
                </FieldGlow>

                <FormField name="assignedTo" label="Assigned to" required size={LOOKUP_FIELD_SIZE} fit={null} hint="Account executive">
                    <LookupField
                        value={form.assignedTo}
                        onChange={(val) => setField('assignedTo', val)}
                        placeholder="Assign to user..."
                        options={[
                            'mittal.sharma',
                            'rajesh.kumar',
                            'anil.verma',
                            'deepak.joshi',
                            'amit.tandon',
                        ]}
                        onLookupClick={() => setUserLookupOpen(true)}
                        required
                    />
                    <UserLookupModal
                        open={userLookupOpen}
                        onClose={() => setUserLookupOpen(false)}
                        onSelect={(user) => setField('assignedTo', user.username)}
                        selectedValue={form.assignedTo}
                    />
                </FormField>

                {followUpPopper}

                {/* Product Category:* (Multi-select chips, full row) */}
                <FormField
                    name="productCategory"
                    label="Product Category"
                    required
                    size="full"
                    viewValue={
                        (form.productCategory || []).length > 0 ? <MultiSelectChips values={form.productCategory || []} /> : null
                    }
                    hint={`${(form.productCategory || []).length} category selected`}
                >
                    <MultiAutocompleteInput
                        value={form.productCategory || []}
                        onChange={(next) => setField('productCategory', next)}
                        options={getOptions('shared_product_category', PRODUCT_CATEGORIES)}
                        placeholder="Search and select products..."
                    />
                </FormField>
            </FormGrid>

            {/* ── Notes: full width ── */}
            <FormGrid columns={1} sx={{ mt: 2.5 }}>
                <FormGridItem>
                    <FormField name="remarks" label="Remarks" required size="full" hint="Stage summary & action items">
                        <TextField
                            fullWidth
                            size="small"
                            multiline
                            minRows={4}
                            maxRows={8}
                            placeholder="Provide current milestone details or immediate actions..."
                            value={form.remarks}
                            onChange={(e) => setField('remarks', e.target.value)}
                            sx={fieldSx}
                            slotProps={{ htmlInput: { maxLength: FIELD_MAX_LENGTH.longText } }}
                        />
                    </FormField>
                </FormGridItem>
            </FormGrid>

            {/* ══════════════════════════════════════════════════════════════════════ */}
            {/* BILLING DETAILS                                                       */}
            {/* ══════════════════════════════════════════════════════════════════════ */}
            <Divider sx={{ my: 3.5, borderColor: 'var(--mui-palette-border-light)' }} />
            <SectionLabel
                icon={<ReceiptLongOutlinedIcon sx={{ fontSize: 18 }} />}
                label="Billing Details"
                sx={{ mb: 2.5 }}
            />
            <FormGrid columns={3}>
                <FormField name="tallySerialNo" label="Tally Serial No" size="sm" hint="Optional serial number">
                    <TextField
                        fullWidth
                        size="small"
                        placeholder="e.g. 765432109"
                        value={form.tallySerialNo || ''}
                        onChange={(e) => setField('tallySerialNo', e.target.value)}
                        sx={fieldSx}
                        slotProps={{ htmlInput: { maxLength: FIELD_MAX_LENGTH.shortCode } }}
                    />
                </FormField>

                <FormField name="invoiceNo" label="Invoice No" size="sm" hint="Reference number">
                    <TextField
                        fullWidth
                        size="small"
                        placeholder="e.g. INV-2026-0982"
                        value={form.invoiceNo || ''}
                        onChange={(e) => setField('invoiceNo', e.target.value)}
                        sx={fieldSx}
                        slotProps={{ htmlInput: { maxLength: FIELD_MAX_LENGTH.shortCode } }}
                    />
                </FormField>

                <FormField name="invoiceDate" label="Invoice Date" size="sm" hint="Billing issue date">
                    <TextField
                        fullWidth
                        size="small"
                        type="date"
                        value={form.invoiceDate || ''}
                        onChange={(e) => setField('invoiceDate', e.target.value)}
                        slotProps={{ htmlInput: { min: localToday() } }}
                        sx={fieldSx}
                    />
                </FormField>
            </FormGrid>

            {/* ══════════════════════════════════════════════════════════════════════ */}
            {/* COMMISSION & DOCUMENTATION                                            */}
            {/* ══════════════════════════════════════════════════════════════════════ */}
            <Divider sx={{ my: 3.5, borderColor: 'var(--mui-palette-border-light)' }} />
            <SectionLabel
                icon={<MonetizationOnOutlinedIcon sx={{ fontSize: 18 }} />}
                label="Commission & Documentation"
                sx={{ mb: 2.5 }}
            />
            <FormGrid columns={3}>
                <FormField name="commission" label="Commission" required size={resolveOptionsFieldSize(OPPORTUNITY_COMMISSIONS)} hint="Sales / partner commission">
                    <StyledSelect
                        value={form.commission}
                        onChange={(v) => setField('commission', v)}
                        options={OPPORTUNITY_COMMISSIONS}
                        placeholder="Select Commission"
                        required
                    />
                </FormField>

                <FormField name="addDocument" label="Add Document" size="sm" hint="Documents / PO attached">
                    <StyledSelect
                        value={form.addDocument || 'No'}
                        onChange={(v) => setField('addDocument', v)}
                        options={OPPORTUNITY_DOCUMENT_OPTIONS}
                        placeholder="Select"
                    />
                </FormField>
            </FormGrid>
        </Box>
    );
}
