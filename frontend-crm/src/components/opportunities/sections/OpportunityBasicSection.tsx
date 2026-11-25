'use client';

import React, { useMemo } from 'react';
import { Box, Divider } from '@mui/material';
import { useFormContext, useWatch } from 'react-hook-form';
import ArticleOutlinedIcon from '@mui/icons-material/ArticleOutlined';
import ReceiptLongOutlinedIcon from '@mui/icons-material/ReceiptLongOutlined';
import MonetizationOnOutlinedIcon from '@mui/icons-material/MonetizationOnOutlined';

import {
    FIELD_MAX_LENGTH,
    FormGrid,
    FormGridItem,
    SectionLabel,
    RhfDateTimeField,
    RhfEmailField,
    RhfLookup,
    RhfMultiAutocomplete,
    RhfPhoneField,
    RhfSelect,
    RhfTextField,
} from '@/components/forms';
import { useContacts, useOrganizations } from '@/hooks/queries';
import type { Contact } from '@/types/contact.types';
import type { ExtendedOrganization } from '@/types/organization.types';
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
import { useFormMode } from '@/context/FormModeContext';
import { CUSTOMER_RESPONSE_CATEGORY, CUSTOMER_RESPONSES, FieldGlow, useFollowUpDecision } from '@/components/forms/FollowUpDecision';

type F = OpportunityFormData;

export interface OpportunityBasicSectionProps {
    /** Top-right toast of the form (e.g. "previous follow-up has expired"). */
    notify?: (message: string, severity?: 'success' | 'error' | 'info' | 'warning') => void;
    /** Told while the user still owes the next follow-up decision; the form refuses to save until it's made. */
    onDecisionPendingChange?: (pending: boolean) => void;
}

const sectionDividerSx = { my: 3.5, borderColor: 'var(--mui-palette-border-light)' } as const;

// Stable fallbacks while the lists load, so memoized suggestions don't recompute every render.
const EMPTY_ORGANIZATIONS: ExtendedOrganization[] = [];
const EMPTY_CONTACTS: Contact[] = [];

const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
const primaryEmail = (c: Contact) => (c.emailAddress.find((e) => e.isPrimary) ?? c.emailAddress[0])?.email ?? '';

/**
 * BASIC tab of the Opportunity form, built from the shared React Hook Form fields (as the Lead, Ticket and Convert
 * Lead forms are), so every field shows its own error and the lookups search the CRM's own records.
 * Must be rendered inside a `FormProvider<OpportunityFormData>`.
 */
export function OpportunityBasicSection({ notify, onDecisionPendingChange }: OpportunityBasicSectionProps) {
    const getOptions = useDropdownOptionsGetter();
    const { control, getValues, setValue } = useFormContext<F>();
    const { mode } = useFormMode();
    const isEdit = mode === 'edit';
    const editable = mode !== 'view';

    // Customer Response → keep or reschedule the next follow-up (see FollowUpDecision).
    const { setAnchor: setResponseAnchor, onResponseChange, glow: followUpGlow, popper: followUpPopper } = useFollowUpDecision({
        enabled: isEdit,
        notify,
        onPendingChange: onDecisionPendingChange,
    });
    const customerResponseOptions = getOptions(CUSTOMER_RESPONSE_CATEGORY, CUSTOMER_RESPONSES);
    const productCategory = useWatch({ control, name: 'productCategory' }) ?? [];

    // Organizations and contacts from the CRM (as on the Ticket form). Contact suggestions narrow to the chosen
    // organization's people when it has any on file.
    const { data: organizations = EMPTY_ORGANIZATIONS } = useOrganizations(undefined, { enabled: editable });
    const { data: contacts = EMPTY_CONTACTS } = useContacts(undefined, { enabled: editable });
    const organizationName = useWatch({ control, name: 'organizationName' }) ?? '';
    const organizationNames = useMemo(() => organizations.map((o) => o.organizationName), [organizations]);
    const contactNames = useMemo(() => {
        const org = organizationName.trim().toLowerCase();
        const inOrg = org ? contacts.filter((c) => (c.organizationName ?? '').trim().toLowerCase() === org) : [];
        return (inOrg.length > 0 ? inOrg : contacts).map((c) => c.name);
    }, [contacts, organizationName]);

    const touch = { shouldDirty: true, shouldValidate: true } as const;

    const clearContactFields = () => {
        setValue('contact', '', { shouldDirty: true });
        setValue('contactNumber', '', touch);
        setValue('contactEmail', '', touch);
    };

    // A contact who belongs to a different organization no longer applies.
    const handleOrganizationPicked = (org: ExtendedOrganization) => {
        const currentContact = getValues('contact')?.trim();
        if (!currentContact) return;
        const match = contacts.find((c) => sameName(c.name, currentContact));
        if (match?.organizationName && !sameName(match.organizationName, org.organizationName)) clearContactFields();
    };

    // Picking a contact fills in their number, email and organization. When people at several companies share the
    // name, the one at the organization already chosen wins (the suggestions only list that organization's people).
    const handleContactPicked = (picked: Contact) => {
        const org = getValues('organizationName')?.trim();
        const contact = (org && contacts.find((c) => sameName(c.name, picked.name) && sameName(c.organizationName ?? '', org))) || picked;
        setValue('contactNumber', contact.mobile || '', touch);
        setValue('contactEmail', primaryEmail(contact), touch);
        if (contact.organizationName) setValue('organizationName', contact.organizationName, touch);
    };

    const handleContactCleared = () => {
        setValue('contactNumber', '', touch);
        setValue('contactEmail', '', touch);
    };

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
                <RhfLookup<F, 'organization'>
                    name="organizationName"
                    label="Organization name"
                    required
                    hint="Client company name"
                    lookupType="organization"
                    options={organizationNames}
                    onSelectRecord={handleOrganizationPicked}
                    placeholder="Enter legal / trading organization name"
                    maxLength={FIELD_MAX_LENGTH.organizationName}
                />

                <RhfLookup<F, 'contact'>
                    name="contact"
                    label="Contact"
                    required
                    hint="Primary decision maker"
                    lookupType="contact"
                    options={contactNames}
                    onSelectRecord={handleContactPicked}
                    onClearRecord={handleContactCleared}
                    placeholder="Type or select contact..."
                    maxLength={FIELD_MAX_LENGTH.personName}
                />

                <RhfPhoneField<F>
                    name="contactNumber"
                    label="Contact Number"
                    required
                    hint="Mobile / direct phone"
                    placeholder="e.g. 9800000000"
                />

                <RhfEmailField<F>
                    name="contactEmail"
                    label="Contact Email"
                    hint="Official contact email"
                    placeholder="corporate.contact@company.com"
                />

                {/* Picks from the CRM's contacts (as on the Lead form); a partner or campaign can still be typed, as typed. */}
                <RhfLookup<F, 'contact'>
                    name="referredBy"
                    label="Referred By"
                    hint="Partner, agent, or client"
                    lookupType="contact"
                    placeholder="Referred by partner or person..."
                    nameCase={false}
                    maxLength={FIELD_MAX_LENGTH.organizationName}
                />

                {/* Starts empty. Picks the CRM user who brought the deal in (stored by username, like Assigned to); an outside referrer can still be typed. */}
                <RhfLookup<F, 'user'>
                    name="leadGivenBy"
                    label="Lead Given By"
                    required
                    hint="Referrer or internal sponsor"
                    lookupType="user"
                    freeText
                    placeholder="Internal sponsor or external referrer..."
                    maxLength={FIELD_MAX_LENGTH.organizationName}
                />

                {/* ── Pipeline ── */}
                <RhfSelect<F>
                    name="type"
                    label="Type"
                    required
                    hint="Nature of deal"
                    options={getOptions('opportunity_type', OPPORTUNITY_TYPES)}
                    placeholder="Select Opportunity Type"
                />

                <RhfSelect<F>
                    name="leadSource"
                    label="Lead Source"
                    required
                    options={getOptions('shared_lead_source', LEAD_SOURCES)}
                    placeholder="Select Lead Source"
                />

                <RhfSelect<F>
                    name="salesStage"
                    label="Sales Stage"
                    required
                    hint="Pipeline phase"
                    options={getOptions('opportunity_sales_stage', OPPORTUNITY_SALES_STAGES)}
                    placeholder="Select Sales Stage"
                />

                {/* ── Follow-up & ownership ── */}
                <RhfSelect<F>
                    name="followupType"
                    label="Followup Type"
                    hint="Default: Call"
                    options={getOptions('shared_followup_type', FOLLOWUP_TYPES)}
                    placeholder="Select Type"
                />

                {/* Asked on every edit (a new opportunity has no follow-up to report on yet). */}
                {mode !== 'create' && (
                    <Box ref={setResponseAnchor} sx={{ minWidth: 0, '&& > *': { mb: 0 } }}>
                        <RhfSelect<F>
                            name="customerResponse"
                            label="Customer Response"
                            required={isEdit}
                            hint="From the last follow-up"
                            options={customerResponseOptions}
                            placeholder="Select customer response"
                            onValueChange={onResponseChange}
                        />
                    </Box>
                )}

                <FieldGlow active={followUpGlow}>
                    <RhfDateTimeField<F>
                        dateName="nextFollowupDate"
                        timeName="nextFollowupTime"
                        label="Next Followup Date"
                        required
                        hint="Next touchpoint"
                    />
                </FieldGlow>

                <RhfLookup<F, 'user'>
                    name="assignedTo"
                    label="Assigned to"
                    required
                    hint="Account executive"
                    lookupType="user"
                    placeholder="Assign to user..."
                />

                {followUpPopper}

                {/* Product Category (multi-select chips, full row) */}
                <RhfMultiAutocomplete<F>
                    name="productCategory"
                    label="Product Category"
                    required
                    hint={`${productCategory.length} category selected`}
                    options={getOptions('shared_product_category', PRODUCT_CATEGORIES)}
                    placeholder="Search and select products..."
                />
            </FormGrid>

            {/* ── Notes: full width ── */}
            <FormGrid columns={1} sx={{ mt: 2.5 }}>
                <FormGridItem>
                    <RhfTextField<F>
                        name="remarks"
                        label="Remarks"
                        required
                        hint="Stage summary & action items"
                        multiline
                        minRows={4}
                        maxRows={8}
                        placeholder="Provide current milestone details or immediate actions..."
                        maxLength={FIELD_MAX_LENGTH.longText}
                    />
                </FormGridItem>
            </FormGrid>

            {/* ══════════════════════════════════════════════════════════════════════ */}
            {/* BILLING DETAILS                                                       */}
            {/* ══════════════════════════════════════════════════════════════════════ */}
            <Divider sx={sectionDividerSx} />
            <SectionLabel
                icon={<ReceiptLongOutlinedIcon sx={{ fontSize: 18 }} />}
                label="Billing Details"
                sx={{ mb: 2.5 }}
            />
            <FormGrid columns={3}>
                <RhfTextField<F>
                    name="tallySerialNo"
                    label="Tally Serial No"
                    hint="Optional serial number"
                    placeholder="e.g. 765432109"
                    fieldSize="sm"
                    maxLength={FIELD_MAX_LENGTH.shortCode}
                />

                <RhfTextField<F>
                    name="invoiceNo"
                    label="Invoice No"
                    hint="Reference number"
                    placeholder="e.g. INV-2026-0982"
                    fieldSize="sm"
                    maxLength={FIELD_MAX_LENGTH.shortCode}
                />

                <RhfTextField<F>
                    name="invoiceDate"
                    label="Invoice Date"
                    hint="Billing issue date"
                    type="date"
                    fieldSize="sm"
                />
            </FormGrid>

            {/* ══════════════════════════════════════════════════════════════════════ */}
            {/* COMMISSION & DOCUMENTATION                                            */}
            {/* ══════════════════════════════════════════════════════════════════════ */}
            <Divider sx={sectionDividerSx} />
            <SectionLabel
                icon={<MonetizationOnOutlinedIcon sx={{ fontSize: 18 }} />}
                label="Commission & Documentation"
                sx={{ mb: 2.5 }}
            />
            <FormGrid columns={3}>
                <RhfSelect<F>
                    name="commission"
                    label="Commission"
                    required
                    hint="Sales / partner commission"
                    options={getOptions('opportunity_commission', OPPORTUNITY_COMMISSIONS)}
                    placeholder="Select Commission"
                />

                <RhfSelect<F>
                    name="addDocument"
                    label="Add Document"
                    hint="Documents / PO attached"
                    options={getOptions('opportunity_add_document', OPPORTUNITY_DOCUMENT_OPTIONS)}
                    placeholder="Select"
                    fieldSize="sm"
                />
            </FormGrid>
        </Box>
    );
}
