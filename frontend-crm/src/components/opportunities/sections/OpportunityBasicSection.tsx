'use client';

import React, { useEffect, useMemo } from 'react';
import { Box, Divider, Typography } from '@mui/material';
import EventBusyOutlinedIcon from '@mui/icons-material/EventBusyOutlined';
import { useFormContext, useWatch } from 'react-hook-form';
import ArticleOutlinedIcon from '@mui/icons-material/ArticleOutlined';
import ReceiptLongOutlinedIcon from '@mui/icons-material/ReceiptLongOutlined';
import MonetizationOnOutlinedIcon from '@mui/icons-material/MonetizationOnOutlined';
import FolderOutlinedIcon from '@mui/icons-material/FolderOutlined';

import {
    FIELD_MAX_LENGTH,
    FormGrid,
    FormGridItem,
    SectionLabel,
    RhfAmountField,
    RhfDateTimeField,
    RhfEmailField,
    RhfFileUpload,
    RhfLookup,
    RhfMultiAutocomplete,
    RhfPhoneField,
    RhfSelect,
    RhfTextField,
    RhfUppercaseField,
    LockedInputs,
    PICKED_CONTACT_HINT,
    usePickedContactLocks,
    useLeadSourceDetails,
    PartnerCompanyLookup,
    ReferredByLookup,
} from '@/components/forms';
import { useContacts, useOrganizations } from '@/hooks/queries';
import { isPickableContact } from '@/components/common/lookup';
import type { Contact } from '@/types/contact.types';
import type { ExtendedOrganization } from '@/types/organization.types';
import type { OpportunityFormData } from '@/types/opportunity.types';
import {
    OPPORTUNITY_SALES_STAGES,
    OPPORTUNITY_TYPES,
    OPPORTUNITY_COMMISSIONS,
    OPPORTUNITY_COMMISSION_TYPES,
    OPPORTUNITY_DOCUMENT_OPTIONS,
    PO_SALES_STAGE,
} from '@/types/opportunity.types';
import { defaultCommissionType, hasCommission } from '@/validations/opportunity.schema';
import {
    PRODUCT_CATEGORIES,
    LEAD_SOURCES,
    FOLLOWUP_TYPES,
} from '@/types/lead.types';
import { useDropdownOptionsGetter } from '@/hooks/queries/useFormConfigs';
import { useFormMode } from '@/context/FormModeContext';
import { useIsCodedDefaultsHarvest } from '@/context/CodedFieldDefaultsContext';
import { CUSTOMER_RESPONSES, FieldGlow, useFollowUpDecision } from '@/components/forms/FollowUpDecision';
import { CLOSED_STAGES, useOpportunityResponseConfig } from '@/utils/opportunityResponseRules';
import { FOLLOW_UP_ACTIVITY_HINT, FOLLOW_UP_ACTIVITY_SHORT_HINT, useFollowUpActivitiesOn } from '@/utils/followUpActivities';

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
    const getOptions = useDropdownOptionsGetter('opportunities');
    const { control, getValues, setValue } = useFormContext<F>();
    const { mode } = useFormMode();
    const isEdit = mode === 'edit';
    const editable = mode !== 'view';
    // Lead Source CA / Reference asks who referred the deal, Partner for the partner organization it came through (as on leads).
    const { needsReferredBy, showReferredBy, showPartnerCompany } = useLeadSourceDetails<F>(
        { leadSource: 'leadSource', referredBy: 'referredBy', partnerCompany: 'partnerCompany' },
        { readOnly: !editable },
    );

    // Sales Stage → the Customer Responses that fit it → keep or reschedule the next follow-up (FollowUpDecision).
    // Closed Won / Lost take neither a response nor a follow-up; a "no follow-up" response (Do Not Contact) clears the
    // follow-up. Same rules on the server (opportunity.followUp.ts); admins set them in Form Builder › Response Rules.
    const responseRules = useOpportunityResponseConfig();
    const stage = useWatch({ control, name: 'salesStage' }) ?? '';
    const response = useWatch({ control, name: 'customerResponse' }) ?? '';
    const closed = editable && CLOSED_STAGES.has(stage);
    const skipsFollowUp = isEdit && !closed && responseRules.noFollowUp(response);
    const followUpActivities = useFollowUpActivitiesOn();
    const { setAnchor: setResponseAnchor, onResponseChange, onSuspendChange, glow: followUpGlow, popper: followUpPopper } = useFollowUpDecision({
        enabled: isEdit,
        notify,
        onPendingChange: onDecisionPendingChange,
        // Cleared again (e.g. a stage change drops it): the saved follow-up comes back. The form still requires one.
        responseOptional: true,
        suspended: closed,
    });
    const stageResponses = responseRules.responseCategory ? responseRules.responsesFor(stage) : CUSTOMER_RESPONSES;
    // A stored response from an older list still reads in view mode.
    const customerResponseOptions = !isEdit && response && !stageResponses.includes(response) ? [...stageResponses, response] : stageResponses;
    const onPickResponse = (next: string, previous: string) => {
        // Do Not Contact: nothing to keep or reschedule, the follow-up goes on save.
        if (responseRules.noFollowUp(next)) onResponseChange('', previous);
        else onResponseChange(next, previous);
    };
    const onStageChange = (next: string, previous: string) => {
        if (!isEdit) return;
        const current = getValues('customerResponse') ?? '';
        if (CLOSED_STAGES.has(next)) {
            if (current) setValue('customerResponse', '', { shouldDirty: true });
            onSuspendChange(true);
            return;
        }
        if (current && !responseRules.allows(current, next)) {
            setValue('customerResponse', '', { shouldDirty: true });
            onResponseChange('', current);
            notify?.(`"${current}" doesn't fit Sales Stage ${next}. Pick a Customer Response for this stage.`, 'info');
        }
        if (CLOSED_STAGES.has(previous)) onSuspendChange(false);
    };
    const productCategory = useWatch({ control, name: 'productCategory' }) ?? [];

    // Organizations and contacts from the CRM (as on the Ticket form). Contact suggestions narrow to the chosen
    // organization's people when it has any on file.
    const { data: organizations = EMPTY_ORGANIZATIONS } = useOrganizations(undefined, { enabled: editable });
    const { data: contacts = EMPTY_CONTACTS } = useContacts(undefined, { enabled: editable });
    const organizationName = useWatch({ control, name: 'organizationName' }) ?? '';
    const commission = useWatch({ control, name: 'commission' });
    const commissionAmount = useWatch({ control, name: 'commissionAmount' });
    const commissionType = useWatch({ control, name: 'commissionType' });
    const showCommissionType = hasCommission({ commission, commissionAmount });
    const showPayeeBank = showCommissionType && commissionType === 'Other';
    // The form builder's hidden copy shows the conditional commission and document fields anyway, so their coded
    // hints / placeholders reach the builder like every other field's.
    const harvest = useIsCodedDefaultsHarvest();
    // Documentation: Add Document Yes asks for the document; Sales Stage PO needs one.
    const salesStage = useWatch({ control, name: 'salesStage' });
    const addDocument = useWatch({ control, name: 'addDocument' });
    const needsDocument = salesStage === PO_SALES_STAGE;
    // Commission Type follows the amount and can't be edited: Self up to ₹1,000, Other above (the API sets it the same way).
    const typeForAmount = showCommissionType ? defaultCommissionType(commissionAmount) : '';
    useEffect(() => {
        if (!editable || !typeForAmount || commissionType === typeForAmount) return;
        setValue('commissionType', typeForAmount, { shouldDirty: true, shouldValidate: Boolean(commissionType) });
    }, [editable, typeForAmount, commissionType, setValue]);
    const organizationNames = useMemo(() => organizations.map((o) => o.organizationName), [organizations]);
    // Contacts who left their job aren't offered (the Contact Search popup's Left Job filter is locked to No).
    const contactNames = useMemo(() => {
        const pickable = contacts.filter(isPickableContact);
        const org = organizationName.trim().toLowerCase();
        const inOrg = org ? pickable.filter((c) => (c.organizationName ?? '').trim().toLowerCase() === org) : [];
        return (inOrg.length > 0 ? inOrg : pickable).map((c) => c.name);
    }, [contacts, organizationName]);

    // Number, email and organization taken from the picked contact are locked (as Convert Lead locks the lead's values).
    const locks = usePickedContactLocks<F>(control, contacts, { contact: 'contact', number: 'contactNumber', email: 'contactEmail', organization: 'organizationName' });

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
    // name, the one at the organization already chosen wins (the suggestions list that organization's people first),
    // unless they left their job: the pickers don't offer them, so they never replace the contact picked.
    const handleContactPicked = (picked: Contact) => {
        const org = getValues('organizationName')?.trim();
        const atOrg = (c: Contact) => isPickableContact(c) && sameName(c.name, picked.name) && sameName(c.organizationName ?? '', org ?? '');
        const contact = (org && contacts.find(atOrg)) || picked;
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
                <LockedInputs locked={locks.organization}>
                    <RhfLookup<F, 'organization'>
                        name="organizationName"
                        label="Organization name"
                        required
                        hint={locks.organization ? PICKED_CONTACT_HINT : 'Client company name'}
                        lookupType="organization"
                        options={organizationNames}
                        onSelectRecord={handleOrganizationPicked}
                        placeholder="Enter legal / trading organization name"
                        maxLength={FIELD_MAX_LENGTH.organizationName}
                    />
                </LockedInputs>

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

                <LockedInputs locked={locks.number}>
                    <RhfPhoneField<F>
                        name="contactNumber"
                        label="Contact Number"
                        hint={locks.number ? PICKED_CONTACT_HINT : 'Mobile / direct phone'}
                        placeholder="e.g. 9800000000"
                    />
                </LockedInputs>

                <LockedInputs locked={locks.email}>
                    <RhfEmailField<F>
                        name="contactEmail"
                        label="Contact Email"
                        hint={locks.email ? PICKED_CONTACT_HINT : 'Official contact email'}
                        placeholder="corporate.contact@company.com"
                    />
                </LockedInputs>

                {/* Lead Source CA / Reference only, and then required (as on the Lead form): an active referral. */}
                {showReferredBy && <ReferredByLookup<F> name="referredBy" idName="referredById" required={needsReferredBy} />}

                {/* Lead Source Partner only, and then required: a partner organization (picker opens on Customer Type = Partner). */}
                {showPartnerCompany && <PartnerCompanyLookup<F> name="partnerCompany" />}

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
                    placeholder="Select Type"
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
                    onValueChange={(next, previous) => {
                        // A PO needs its document: Add Document turns Yes so its fields open.
                        if (next === PO_SALES_STAGE && getValues('addDocument') !== 'Yes') setValue('addDocument', 'Yes', touch);
                        onStageChange(next, previous);
                    }}
                />

                {/* ── Follow-up & ownership ── */}
                <RhfSelect<F>
                    name="followupType"
                    label="Followup Type"
                    hint="Default: Call"
                    options={getOptions('shared_followup_type', FOLLOWUP_TYPES)}
                    placeholder="Select Type"
                />

                {/* Asked on every edit (a new opportunity has no follow-up to report on yet), from the responses that
                    fit the Sales Stage. A closed deal takes none. */}
                {mode !== 'create' && !closed && (
                    <Box ref={setResponseAnchor} sx={{ minWidth: 0, '&& > *': { mb: 0 } }}>
                        <RhfSelect<F>
                            name="customerResponse"
                            label="Customer Response"
                            required={isEdit}
                            hint={isEdit && stage ? `Options for ${stage}` : 'From the last follow-up'}
                            options={customerResponseOptions}
                            placeholder="Select customer response"
                            onValueChange={onPickResponse}
                        />
                    </Box>
                )}

                {closed ? (
                    <FollowUpNote>A closed deal keeps no Customer Response or next follow-up: both are cleared when you save.</FollowUpNote>
                ) : skipsFollowUp ? (
                    <FollowUpNote>{`"${response}" takes no more follow-ups: the next follow-up is removed when you save.`}</FollowUpNote>
                ) : (
                    <FieldGlow active={followUpGlow}>
                        <RhfDateTimeField<F>
                            dateName="nextFollowupDate"
                            timeName="nextFollowupTime"
                            label="Next Followup Date"
                            required
                            hint={followUpActivities ? <span title={FOLLOW_UP_ACTIVITY_HINT}>{FOLLOW_UP_ACTIVITY_SHORT_HINT}</span> : 'Next touchpoint'}
                        />
                    </FieldGlow>
                )}

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
                    hint="9 digits, starts with 7"
                    placeholder="e.g. 765432109"
                    fieldSize="sm"
                    numericOnly
                    maxLength={FIELD_MAX_LENGTH.tallySerialNo}
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
            {/* COMMISSION                                                            */}
            {/* ══════════════════════════════════════════════════════════════════════ */}
            <Divider sx={sectionDividerSx} />
            <SectionLabel
                icon={<MonetizationOnOutlinedIcon sx={{ fontSize: 18 }} />}
                label="Commission"
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
                    fieldSize="sm"
                    onValueChange={(next) => {
                        // No commission, no amount: a value typed before switching back to No isn't kept.
                        if (next !== 'Yes') setValue('commissionAmount', '', { shouldDirty: true, shouldValidate: true });
                    }}
                />

                {(commission === 'Yes' || harvest) && (
                    <RhfAmountField<F>
                        name="commissionAmount"
                        label="Commission Amount"
                        required
                        hint="Commission payable on this deal (₹)"
                        fieldSize="sm"
                    />
                )}

                {/* Set from the amount, never by hand. */}
                {(showCommissionType || harvest) && (
                    <LockedInputs locked>
                        <RhfSelect<F>
                            name="commissionType"
                            label="Commission Type"
                            required
                            hint="Set by the amount: Self up to ₹1,000, Other above"
                            options={getOptions('opportunity_commission_type', OPPORTUNITY_COMMISSION_TYPES)}
                            placeholder="Set by Commission Amount"
                            fieldSize="sm"
                        />
                    </LockedInputs>
                )}
            </FormGrid>

            {/* The commission payee's bank details (Commission Type Other, an amount above ₹1,000): all required. Same fields as on the Organization form. */}
            {(showPayeeBank || harvest) && (
                <FormGrid columns={3} sx={{ mt: 2.5 }}>
                    <RhfTextField<F>
                        name="accountName"
                        required
                        label="Account Name"
                        hint="Payee's account holder name"
                        placeholder="e.g. Rohit Verma"
                        maxLength={FIELD_MAX_LENGTH.organizationName}
                    />
                    <RhfTextField<F>
                        name="accountNo"
                        required
                        label="Account No"
                        placeholder="e.g. 50200012345678"
                        numericOnly
                        maxLength={FIELD_MAX_LENGTH.bankAccount}
                    />
                    <RhfTextField<F>
                        name="bankName"
                        required
                        label="Bank Name"
                        placeholder="e.g. HDFC Bank, ICICI Bank, SBI"
                        maxLength={FIELD_MAX_LENGTH.personName}
                    />
                    <RhfUppercaseField<F> name="ifscCode" label="IFSC Code" required placeholder="e.g. HDFC0001234" maxLength={FIELD_MAX_LENGTH.ifsc} />
                    <RhfUppercaseField<F>
                        name="panNumber"
                        required
                        label="PAN Number"
                        hint="10-character PAN"
                        placeholder="e.g. ABCDE1234F"
                        maxLength={FIELD_MAX_LENGTH.pan}
                    />
                </FormGrid>
            )}

            {/* ══════════════════════════════════════════════════════════════════════ */}
            {/* DOCUMENTATION                                                         */}
            {/* ══════════════════════════════════════════════════════════════════════ */}
            <Divider sx={sectionDividerSx} />
            <SectionLabel
                icon={<FolderOutlinedIcon sx={{ fontSize: 18 }} />}
                label="Documentation"
                sx={{ mb: 2.5 }}
            />
            <FormGrid columns={3}>
                <RhfSelect<F>
                    name="addDocument"
                    label="Add Document"
                    required={needsDocument}
                    hint={needsDocument ? 'Required at Sales Stage PO' : 'Documents / PO attached'}
                    options={getOptions('opportunity_add_document', OPPORTUNITY_DOCUMENT_OPTIONS)}
                    placeholder="Select"
                    fieldSize="sm"
                />

                {(addDocument === 'Yes' || harvest) && (
                    <RhfTextField<F>
                        name="documentNo"
                        label="Document No"
                        hint="PO / document reference"
                        placeholder="e.g. PO-2026-0188"
                        fieldSize="sm"
                        maxLength={FIELD_MAX_LENGTH.shortCode}
                    />
                )}

                {(addDocument === 'Yes' || harvest) && (
                    <RhfTextField<F> name="documentDate" label="Document Date" hint="Date on the document" type="date" fieldSize="sm" allowPastDates />
                )}
            </FormGrid>

            {(addDocument === 'Yes' || harvest) && (
                <FormGrid columns={3} sx={{ mt: 2.5 }}>
                    <RhfFileUpload<F> name="documentFile" label="Upload Doc" module="opportunities" required hint="PDF, image, Word or Excel" />
                </FormGrid>
            )}
        </Box>
    );
}

/** Stands in for the Next Followup Date when the save schedules none (closed deal, Do Not Contact). */
function FollowUpNote({ children }: { children: React.ReactNode }) {
    return (
        <Box
            sx={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 1,
                alignSelf: 'start',
                minWidth: 0,
                mt: 3,
                p: 1.25,
                borderRadius: '8px',
                border: '1px solid var(--mui-palette-border-main)',
                backgroundColor: 'var(--mui-palette-background-subtle)',
            }}
        >
            <EventBusyOutlinedIcon sx={{ fontSize: 18, mt: 0.1, color: 'var(--mui-palette-text-muted)' }} />
            <Typography sx={{ fontSize: '0.78rem', color: 'var(--mui-palette-text-secondary)' }}>{children}</Typography>
        </Box>
    );
}
