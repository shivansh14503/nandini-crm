'use client';

import React from 'react';
import { Box } from '@mui/material';
// Raw text inputs show the admin-configured placeholder of the FormField they sit in.
import { ConfiguredTextField as TextField } from '@/components/forms/ConfiguredTextField';
import { useController, useFormContext, useWatch } from 'react-hook-form';

import {
    FormField,
    LockedField,
    fieldSx,
    FormGrid,
    FormGridItem,
    SectionLabel,
    FIELD_MAX_LENGTH,
    RhfTextField,
    RhfUppercaseField,
    RhfPhoneField,
    RhfSelect,
    RhfLookup,
    RhfMultiAutocomplete,
    RhfEmailList,
    RhfDateTimeField,
    ExistingRecordMatches,
    useExistingRecordCheck,
    useLeadSourceDetails,
    PartnerCompanyLookup,
    ReferredByLookup,
} from '@/components/forms';
import { isGstRegistrationType } from '@/config/constants';
import {
    LEAD_SOURCES,
    PRODUCT_CATEGORIES,
    FOLLOWUP_TYPES,
    LEAD_TYPES,
    LEAD_STATUSES,
    LEAD_DESIGNATIONS,
    LEAD_DEPARTMENTS,
    LEAD_REGISTRATION_TYPES,
    LEAD_TURNOVER_RANGES,
    LEAD_EMPLOYEE_RANGES,
    type LeadFormData,
} from '@/types/lead.types';
import { useDropdownOptionsGetter } from '@/hooks/queries/useFormConfigs';
import { OrganizationNameAutocomplete } from '@/components/organizations/OrganizationNameAutocomplete';
import { useOrganizationNameCheck } from '@/components/organizations/useOrganizationNameCheck';
import { useFormMode } from '@/context/FormModeContext';
import { useIsCodedDefaultsHarvest } from '@/context/CodedFieldDefaultsContext';
import { upperCase, useUndoSafeSanitizer } from '@/components/forms/undoSafeInput';
import { CUSTOMER_RESPONSES, FieldGlow, useFollowUpDecision, type FollowUpDecision } from '@/components/forms/FollowUpDecision';
import { FOLLOW_UP_ACTIVITY_HINT, FOLLOW_UP_ACTIVITY_SHORT_HINT, useFollowUpActivitiesOn } from '@/utils/followUpActivities';
import { useLeadRatingConfig } from '@/utils/leadRating';
import { activeOptionValues } from '@/utils/formConfig';
import { Typography } from '@mui/material';
import EventBusyOutlinedIcon from '@mui/icons-material/EventBusyOutlined';

const groupLabelSx = { mb: 2 } as const;
/** Set only by the Convert Lead flow, never picked by hand. */
const CONVERT_ONLY_STATUSES = ['Converted'];

export interface LeadOverviewSectionProps {
    leadId?: string;
    /** Top-right toast of the form (e.g. "previous follow-up has expired"). */
    notify?: (message: string, severity?: 'success' | 'error' | 'info' | 'warning') => void;
    /** Told while the user still owes the next follow-up decision; the form refuses to save until it's made. */
    onDecisionPendingChange?: (pending: boolean) => void;
    /** Told the keep / new decision the save sends. */
    onDecisionChange?: (decision: FollowUpDecision | null) => void;
    /** The saved lead's status and Rating (edit), to tell closing / reopening apart and say which Rating stays. */
    savedStatus?: string;
    savedRating?: string;
}

/** In place of the follow-up while a lead is being closed: none is scheduled and the Rating stays as it is. */
function ClosingNote({ rating }: { rating: string }) {
    return (
        <Box
            sx={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 1,
                alignSelf: 'start',
                mt: 3,
                p: 1.25,
                borderRadius: '8px',
                border: '1px solid var(--mui-palette-border-main)',
                backgroundColor: 'var(--mui-palette-background-subtle)',
            }}
        >
            <EventBusyOutlinedIcon sx={{ fontSize: 18, mt: 0.1, color: 'var(--mui-palette-text-muted)' }} />
            <Typography sx={{ fontSize: '0.78rem', color: 'var(--mui-palette-text-secondary)' }}>
                Closing removes the next follow-up and keeps the Rating{rating ? ` (${rating})` : ''} as it is.
            </Typography>
        </Box>
    );
}

/** Overview tab of the Lead form. Must be rendered inside a `FormProvider<LeadFormData>`. */
export function LeadOverviewSection({ leadId, notify, onDecisionPendingChange, onDecisionChange, savedStatus = '', savedRating = '' }: LeadOverviewSectionProps = {}) {
    const getOptions = useDropdownOptionsGetter();
    const { control, setValue, getValues, getFieldState } = useFormContext<LeadFormData>();
    const { mode } = useFormMode();
    const isEdit = mode === 'edit';

    // An edit with a Customer Response records a follow-up (and re-rates the lead); without one it changes details
    // only. A closing status ("Closes the lead" in Form Builder) schedules no follow-up and keeps the Rating.
    const { closingStatuses, responseCategory } = useLeadRatingConfig();
    const status = useWatch({ control, name: 'status' }) ?? '';
    const response = useWatch({ control, name: 'customerResponse' }) ?? '';
    const closing = isEdit && closingStatuses.has(status);
    const wasClosed = closingStatuses.has(savedStatus);
    const responseRequired = isEdit && (closing ? !wasClosed : wasClosed);

    // Customer Response → keep or reschedule the next follow-up (see FollowUpDecision).
    const { setAnchor: setResponseAnchor, onResponseChange, onSuspendChange, glow: followUpGlow, popper: followUpPopper } = useFollowUpDecision({
        enabled: isEdit,
        notify,
        onPendingChange: onDecisionPendingChange,
        onDecisionChange,
        responseOptional: true,
        suspended: closing,
    });
    // The list the leads field is linked to (its options carry the Rating rules), not a hard-coded key.
    const customerResponseOptions = activeOptionValues(responseCategory, CUSTOMER_RESPONSES);
    const followUpLocked = isEdit && !response.trim();
    const followUpActivities = useFollowUpActivitiesOn();

    // Informational only: lists (and links to) the records that already use the mobile / email; never blocks the save.
    const mobile = useWatch({ control, name: 'mobile' });
    const emailAddress = useWatch({ control, name: 'emailAddress' });
    const { mobileMatches, emailMatches } = useExistingRecordCheck({
        mobile,
        emailAddress,
        excludeId: leadId,
        owner: 'lead',
        enabled: mode !== 'view',
    });
    const mobileNotice = mobileMatches.length > 0 ? <ExistingRecordMatches matches={mobileMatches} title="Mobile already in CRM" /> : undefined;
    const emailNotices = React.useMemo(
        () =>
            Object.fromEntries(
                Object.entries(emailMatches).map(([email, matches]) => [
                    email,
                    <ExistingRecordMatches key={email} matches={matches} title="Email already in CRM" />,
                ])
            ),
        [emailMatches]
    );
    const turnoverOptions = getOptions('lead_turnover', LEAD_TURNOVER_RANGES);
    const employeeOptions = getOptions('lead_employee_range', LEAD_EMPLOYEE_RANGES);
    const leadSourceOptions = getOptions('shared_lead_source', LEAD_SOURCES);
    // Lead Source CA / Reference asks who referred the lead, Partner for the partner organization it came through.
    const { needsReferredBy, showReferredBy, showPartnerCompany } = useLeadSourceDetails<LeadFormData>(
        { leadSource: 'leadSource', referredBy: 'referredBy', partnerCompany: 'partnerCompany' },
        { readOnly: mode === 'view' },
    );

    // Organization name: same live check + "already in CRM" dropdown as the organization form. Informational
    // only here — a lead for a company that already exists is valid, so a match never blocks the save.
    const { field: orgNameField, fieldState: orgNameState } = useController({ control, name: 'organizationName' });
    const organizationName = orgNameField.value ?? '';
    const nameCheck = useOrganizationNameCheck({ name: organizationName, enabled: mode !== 'view' });
    const orgNameHelper = orgNameState.error?.message ?? (nameCheck.duplicate ? (
        <Box component="span" sx={{ color: 'var(--crm-amber-700)', fontWeight: 600 }}>
            {nameCheck.duplicate.message}
        </Box>
    ) : undefined);

    // Trade name keeps following the organization name until the user gives it a value of its own (as on organizations).
    const tradeName = useWatch({ control, name: 'tradeName' }) ?? '';
    // Trade names are stored uppercase, like organization names.
    const tradeNameSanitizerRef = useUndoSafeSanitizer(upperCase);
    const handleOrgNameChange = (val: string) => {
        const tradeNameFollows = !tradeName || tradeName === organizationName;
        orgNameField.onChange(val);
        if (tradeNameFollows) setValue('tradeName', val, { shouldValidate: true, shouldDirty: true });
    };

    // GSTIN only applies to 'Registered' / SEZ leads: clear it whenever another type (or none) is chosen.
    const registrationType = useWatch({ control, name: 'registrationType' }) ?? '';
    const isRegistered = isGstRegistrationType(registrationType);
    // The form builder's hidden copy shows GST Number anyway, so its coded hint reaches the builder.
    const harvest = useIsCodedDefaultsHarvest();
    React.useEffect(() => {
        if (!isRegistered && getValues('gstNumber')) {
            setValue('gstNumber', '', { shouldValidate: true });
        }
    }, [isRegistered, getValues, setValue]);

    // Mailing name always equals the organization name (read-only below; the API enforces the same).
    // Dirty only when the user changed the name, so loading a legacy lead with a different saved value
    // doesn't flag the form as edited.
    React.useEffect(() => {
        if ((getValues('mailingName') ?? '') === organizationName) return;
        setValue('mailingName', organizationName, { shouldDirty: getFieldState('organizationName').isDirty });
    }, [organizationName, getFieldState, getValues, setValue]);

    return (
        <Box sx={{ p: { xs: 2.5, md: 3.5 }, display: 'flex', flexDirection: 'column', gap: 3.5 }}>
            {/* ── Contact person ── */}
            <Box>
                <SectionLabel label="CONTACT PERSON" sx={groupLabelSx} />
                <FormGrid columns={3}>
                    <RhfTextField<LeadFormData> name="name" label="Name" required personName hint="Contact person name" placeholder="Enter contact person name" />
                    <RhfPhoneField<LeadFormData> name="mobile" label="Mobile" required hint="Primary number" notice={mobileNotice} />
                    <RhfPhoneField<LeadFormData> name="otherPhone" label="Other Phone" hint="Landline / alternate" placeholder="e.g. 0114567890" />
                    <RhfSelect<LeadFormData> name="designation" label="Designation" options={LEAD_DESIGNATIONS} placeholder="Select Designation" />
                    <RhfSelect<LeadFormData> name="department" label="Department" options={LEAD_DEPARTMENTS} placeholder="Select Department" />
                    <RhfEmailList name="emailAddress" emailNotices={emailNotices} />
                </FormGrid>
            </Box>

            {/* ── Organization ── */}
            <Box>
                <SectionLabel label="ORGANIZATION" sx={groupLabelSx} />
                <FormGrid columns={3}>
                    <FormField name="organizationName" label="Organization Name" hint="Company the lead belongs to">
                        <OrganizationNameAutocomplete
                            value={organizationName}
                            onChange={handleOrgNameChange}
                            onBlur={() => {
                                orgNameField.onBlur();
                                // Check right away instead of waiting out the debounce.
                                nameCheck.checkNow();
                            }}
                            placeholder="Enter organization name..."
                            error={Boolean(orgNameState.error)}
                            helperText={orgNameHelper}
                            checking={nameCheck.checking}
                            verified={Boolean(organizationName.trim()) && !orgNameState.error && !nameCheck.duplicate}
                            suggestions={nameCheck.suggestions}
                        />
                    </FormField>
                    <FormField name="tradeName" label="Trade Name" hint="Defaults to the organization name">
                        <TextField
                            fullWidth
                            size="small"
                            placeholder="e.g. Mohit Traders"
                            value={tradeName}
                            inputRef={tradeNameSanitizerRef}
                            onChange={(e) => setValue('tradeName', e.target.value.toUpperCase(), { shouldValidate: true, shouldDirty: true })}
                            sx={fieldSx}
                            slotProps={{ htmlInput: { maxLength: FIELD_MAX_LENGTH.organizationName } }}
                        />
                    </FormField>
                    {/* Mailing Name (always equals Organization Name) */}
                    <LockedField name="mailingName" label="Mailing Name" hint="Follows Organization Name" value={organizationName} placeholder="Same as organization name" />
                    <RhfSelect<LeadFormData> name="registrationType" label="Registration Type" options={LEAD_REGISTRATION_TYPES} placeholder="Select Type" />
                    {/* GSTIN only exists for registered businesses, so the field only appears for 'Registered' / SEZ. */}
                    {(isRegistered || harvest) && (
                        <RhfUppercaseField<LeadFormData>
                            name="gstNumber"
                            label="GST Number"
                            required
                            hint="15-character GSTIN"
                            placeholder="e.g. 06AFZFS3757G1Z9"
                            maxLength={FIELD_MAX_LENGTH.gstin}
                        />
                    )}
                    <RhfSelect<LeadFormData> name="turnover" label="Turnover" hint="Annual bracket" options={turnoverOptions} placeholder="Select Turnover" />
                    <RhfSelect<LeadFormData> name="noOfEmployee" label="No of Employee" options={employeeOptions} placeholder="Select Employee Bracket" />
                </FormGrid>
            </Box>

            {/* ── Pipeline & follow-up ── */}
            <Box>
                <SectionLabel label="PIPELINE & FOLLOW-UP" sx={groupLabelSx} />
                <FormGrid columns={3}>
                    <RhfSelect<LeadFormData> name="leadSource" label="Lead Source" required options={leadSourceOptions} placeholder="Select Lead Source" />
                    <RhfSelect<LeadFormData> name="leadType" label="Lead Type" required options={LEAD_TYPES} placeholder="Select Lead Type" />
                    <RhfSelect<LeadFormData>
                        name="status"
                        label="Status"
                        hint="Default: New"
                        options={LEAD_STATUSES}
                        disabledOptions={CONVERT_ONLY_STATUSES}
                        placeholder="Select Status"
                        // Into or out of a closing status: drop or ask again the follow-up question.
                        onValueChange={(next, previous) => {
                            if (isEdit && closingStatuses.has(next) !== closingStatuses.has(previous)) onSuspendChange(closingStatuses.has(next));
                        }}
                    />
                    {/* Lead Source CA / Reference only, and then required: an active referral (Referral Search popup). */}
                    {showReferredBy && <ReferredByLookup<LeadFormData> name="referredBy" idName="referredById" required={needsReferredBy} />}
                    {/* Lead Source Partner only, and then required: a partner organization, picked from the organization
                        picker opened on Customer Type = Partner. */}
                    {showPartnerCompany && <PartnerCompanyLookup<LeadFormData> name="partnerCompany" />}
                    <RhfSelect<LeadFormData> name="followupType" label="Followup Type" hint="Default: Call" options={FOLLOWUP_TYPES} placeholder="Select Type" />
                    {/* Picked to record a follow-up (a new lead has none to report on yet); left empty, the edit
                        changes details only. Starts its own row so it sits beside the Next Followup Date it decides. */}
                    {mode !== 'create' && (
                        <Box ref={setResponseAnchor} sx={{ minWidth: 0, gridColumnStart: 1, '&& > *': { mb: 0 } }}>
                            <RhfSelect<LeadFormData>
                                name="customerResponse"
                                label="Customer Response"
                                required={responseRequired}
                                hint={!isEdit ? 'From the last follow-up' : closing ? 'Why the lead is closed' : 'Leave empty to change details only'}
                                options={customerResponseOptions}
                                placeholder="Select customer response"
                                onValueChange={onResponseChange}
                            />
                        </Box>
                    )}
                    {closing ? (
                        <ClosingNote rating={savedRating} />
                    ) : (
                        <FieldGlow active={followUpGlow}>
                            <RhfDateTimeField<LeadFormData>
                                dateName="nextFollowupDate"
                                timeName="nextFollowupTime"
                                label="Next Followup Date"
                                required
                                disabled={followUpLocked}
                                hint={
                                    followUpLocked ? (
                                        'Pick a Customer Response to change it'
                                    ) : followUpActivities ? (
                                        <span title={FOLLOW_UP_ACTIVITY_HINT}>{FOLLOW_UP_ACTIVITY_SHORT_HINT}</span>
                                    ) : (
                                        'Date & time'
                                    )
                                }
                            />
                        </FieldGlow>
                    )}
                    <RhfLookup<LeadFormData> name="assignedTo" label="Assigned to" lookupType="user" required placeholder="Select Representative" />
                    <RhfMultiAutocomplete<LeadFormData> name="productCategory" label="Product Category" required options={PRODUCT_CATEGORIES} placeholder="Search and select products..." />
                </FormGrid>
            </Box>

            {followUpPopper}

            {/* ── Notes: full width ── */}
            <FormGrid columns={1}>
                <FormGridItem>
                    {/* Remarks go with a recorded follow-up, so a details-only edit doesn't ask for them. */}
                    <RhfTextField<LeadFormData> name="remarks" label="Remarks" required={!isEdit || Boolean(response.trim())} hint="Action items / requirement brief" multiline minRows={3} maxRows={5} placeholder="Enter specific followup requirement, client demand, or notes..." />
                </FormGridItem>
            </FormGrid>
        </Box>
    );
}
