'use client';

import React from 'react';
import { Box, InputAdornment, TextField } from '@mui/material';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import { useController, useFormContext, useWatch } from 'react-hook-form';

import {
    FormField,
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
} from '@/components/forms';
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
import { useLeadExistingCheck } from '../useLeadExistingCheck';
import { useFormMode } from '@/context/FormModeContext';

const groupLabelSx = { mb: 2 } as const;

/** Overview tab of the Lead form. Must be rendered inside a `FormProvider<LeadFormData>`. */
export function LeadOverviewSection({ leadId }: { leadId?: string } = {}) {
    const getOptions = useDropdownOptionsGetter();
    const { control, setValue, getValues, getFieldState } = useFormContext<LeadFormData>();
    const { mode } = useFormMode();

    // Informational only: tells the user the mobile / email is already in the CRM; never blocks the save.
    const mobile = useWatch({ control, name: 'mobile' });
    const emailAddresses = useWatch({ control, name: 'emailAddresses' });
    const { mobileMatch, emailMatches } = useLeadExistingCheck({ mobile, emailAddresses, leadId, enabled: mode !== 'view' });
    const mobileNotice = mobileMatch
        ? `Already exists in CRM (${mobileMatch.entityType}: ${mobileMatch.name}${mobileMatch.organizationName ? `, ${mobileMatch.organizationName}` : ''})`
        : undefined;
    const emailNotices = React.useMemo(
        () =>
            Object.fromEntries(
                Object.entries(emailMatches).map(([email, match]) => [
                    email,
                    `"${email}" already exists in CRM (${match.entityType}: ${match.name})`,
                ])
            ),
        [emailMatches]
    );
    const turnoverOptions = getOptions('lead_turnover', LEAD_TURNOVER_RANGES);
    const employeeOptions = getOptions('lead_employee_range', LEAD_EMPLOYEE_RANGES);
    const leadSourceOptions = getOptions('shared_lead_source', LEAD_SOURCES);

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
    const handleOrgNameChange = (val: string) => {
        const tradeNameFollows = !tradeName || tradeName === organizationName;
        orgNameField.onChange(val);
        if (tradeNameFollows) setValue('tradeName', val, { shouldValidate: true, shouldDirty: true });
    };

    // GSTIN only applies to 'Registered' leads: clear it whenever another type (or none) is chosen.
    const registrationType = useWatch({ control, name: 'registrationType' }) ?? '';
    const isRegistered = registrationType === 'Registered';
    React.useEffect(() => {
        if (!isRegistered && getValues('gstNo')) {
            setValue('gstNo', '', { shouldValidate: true });
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
                    <RhfTextField<LeadFormData> name="name" label="Name" required hint="Contact person name" placeholder="Enter contact person name" />
                    <RhfPhoneField<LeadFormData> name="mobile" label="Mobile" required hint="Primary number" notice={mobileNotice} />
                    <RhfPhoneField<LeadFormData> name="otherPhone" label="Other Phone" hint="Landline / alternate" placeholder="e.g. 0114567890" />
                    <RhfSelect<LeadFormData> name="designation" label="Designation" options={LEAD_DESIGNATIONS} placeholder="Select Designation" />
                    <RhfSelect<LeadFormData> name="department" label="Department" options={LEAD_DEPARTMENTS} placeholder="Select Department" />
                    <RhfEmailList name="emailAddresses" emailNotices={emailNotices} />
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
                            onChange={(e) => setValue('tradeName', e.target.value, { shouldValidate: true, shouldDirty: true })}
                            sx={fieldSx}
                            slotProps={{ htmlInput: { maxLength: FIELD_MAX_LENGTH.organizationName } }}
                        />
                    </FormField>
                    {/* Mailing Name (always equals Organization Name) */}
                    <FormField name="mailingName" label="Mailing Name" hint="Follows Organization Name">
                        <TextField
                            fullWidth
                            size="small"
                            value={organizationName}
                            placeholder="Same as organization name"
                            // Layered on fieldSx (not spread over it) so the input keeps the standard size and font.
                            sx={[fieldSx, { '& .MuiOutlinedInput-root': { backgroundColor: 'var(--mui-palette-background-subtle)', color: 'var(--crm-slate-600)' } }]}
                            slotProps={{
                                htmlInput: { readOnly: true, tabIndex: -1, 'aria-readonly': true },
                                input: {
                                    endAdornment: (
                                        <InputAdornment position="end">
                                            <LockOutlinedIcon sx={{ fontSize: 16, color: 'var(--mui-palette-text-muted)' }} />
                                        </InputAdornment>
                                    ),
                                },
                            }}
                        />
                    </FormField>
                    <RhfSelect<LeadFormData> name="registrationType" label="Registration Type" options={LEAD_REGISTRATION_TYPES} placeholder="Select Type" />
                    {/* GSTIN only exists for registered businesses, so the field only appears for 'Registered'. */}
                    {isRegistered && (
                        <RhfUppercaseField<LeadFormData>
                            name="gstNo"
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
                    <RhfSelect<LeadFormData> name="leadType" label="Lead Type" required hint="Urgency" options={LEAD_TYPES} />
                    <RhfSelect<LeadFormData> name="status" label="Status" hint="Default: New" options={LEAD_STATUSES} placeholder="Select Status" />
                    {/* Picks from the CRM's contacts (Contact Search popup); a name can still be typed. */}
                    <RhfLookup<LeadFormData, 'contact'>
                        name="referredBy"
                        label="Referred By"
                        lookupType="contact"
                        hint="Contact who referred the lead"
                        placeholder="Search or select contact..."
                    />
                    <RhfSelect<LeadFormData> name="followupType" label="Followup Type" hint="Default: Call" options={FOLLOWUP_TYPES} placeholder="Select Type" />
                    <RhfDateTimeField<LeadFormData> dateName="nextFollowupDate" timeName="nextFollowupTime" label="Next Followup Date" required hint="Date & time" />
                    <RhfLookup<LeadFormData> name="assignedTo" label="Assigned to" lookupType="user" required placeholder="Select Representative" />
                    <RhfMultiAutocomplete<LeadFormData> name="productCategory" label="Product Category" required options={PRODUCT_CATEGORIES} placeholder="Search and select products..." />
                </FormGrid>
            </Box>

            {/* ── Notes: two textareas side by side ── */}
            <FormGrid columns={2}>
                <FormGridItem>
                    <RhfTextField<LeadFormData> name="addDescription" label="Add Description" required hint="Action items / requirement brief" multiline minRows={3} maxRows={5} placeholder="Enter specific followup requirement, client demand, or notes..." />
                </FormGridItem>
                <FormGridItem>
                    <RhfTextField<LeadFormData> name="description" label="Description" hint="General background notes" multiline minRows={3} maxRows={5} placeholder="Enter background context, client setup, or meeting minutes..." />
                </FormGridItem>
            </FormGrid>
        </Box>
    );
}
