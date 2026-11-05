'use client';

import React from 'react';
import { Box, Chip, InputAdornment, TextField, Tooltip } from '@mui/material';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import { useFormContext, useWatch } from 'react-hook-form';

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
    RhfChipGroup,
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
import type { ExtendedOrganization } from '@/types/organization.types';
import { useDropdownOptionsGetter } from '@/hooks/queries/useFormConfigs';
import { DEFAULT_COUNTRY_CODE } from '@/data/addressMaster';
import { canonicalizeOrgName } from '@/utils/organizationName';
import { mapOrgEmployeesToLead, mapOrgTurnoverToLead, organizationAddressToLead } from '../organizationPrefill';
import { useLeadExistingCheck } from '../useLeadExistingCheck';
import { useFormMode } from '@/context/FormModeContext';

const groupLabelSx = { mb: 2 } as const;
const touch = { shouldDirty: true, shouldValidate: true } as const;

/** Organization-profile fields: filled from a picked organization, blanked whenever the organization is cleared. */
const ORG_PROFILE_FIELDS = ['registrationType', 'gstNo', 'turnover', 'noOfEmployee'] as const;

/** Address fields reset when a previously auto-filled organization is cleared. */
const ORG_ADDRESS_RESET: Partial<Record<keyof LeadFormData, string | boolean>> = {
    primaryAddress: '',
    primaryCity: '',
    primaryState: '',
    primaryPostalCode: '',
    primaryCountry: DEFAULT_COUNTRY_CODE,
    otherAddress: '',
    otherCity: '',
    otherState: '',
    otherPostalCode: '',
    otherCountry: DEFAULT_COUNTRY_CODE,
    copyAddressFromLeft: false,
};

interface LinkedOrganization {
    id: string;
    organizationName: string;
}

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

    // The organization whose details were last auto-filled into the form (drives the hint and the clear reset).
    const [linkedOrg, setLinkedOrg] = React.useState<LinkedOrganization | null>(null);
    const organizationName = useWatch({ control, name: 'organizationName' }) ?? '';
    const stillLinked = Boolean(linkedOrg) && canonicalizeOrgName(organizationName) === canonicalizeOrgName(linkedOrg?.organizationName ?? '');

    const handleOrganizationSelected = (org: ExtendedOrganization) => {
        // Typing on past an exact match (e.g. adding a trailing ".") re-matches the same record: don't re-fill
        // over anything the user changed since.
        if (stillLinked && linkedOrg?.id === org.id) return;

        // Always overwrite (blank when the organization has no / an unmappable value): switching organizations
        // must not leave the previous one's brackets behind.
        const nextRegType = org.registrationType || '';
        setValue('registrationType', nextRegType, touch);
        setValue('gstNo', nextRegType === 'Registered' ? (org.gstNo || org.gstNumber || '').toUpperCase() : '', touch);
        setValue('turnover', mapOrgTurnoverToLead(org.annualTurnover, turnoverOptions) ?? '', touch);
        setValue('noOfEmployee', mapOrgEmployeesToLead(org.numberOfEmployees, employeeOptions) ?? '', touch);

        if (org.sourceOfLead && leadSourceOptions.includes(org.sourceOfLead)) setValue('leadSource', org.sourceOfLead, touch);
        if (org.assignedUser) setValue('assignedTo', org.assignedUser, touch);
        const partner = org.partnerCompanies?.[0] || org.partnerCompany;
        if (partner && !getValues('referredBy')?.trim()) setValue('referredBy', partner, touch);
        if (org.description && !getValues('description')?.trim()) setValue('description', org.description, touch);

        // Always overwrite the address: switching organizations must replace the previous one's.
        for (const [key, value] of Object.entries(organizationAddressToLead(org))) {
            setValue(key as keyof LeadFormData, value, touch);
        }
        setLinkedOrg({ id: org.id, organizationName: org.organizationName });
    };

    const handleOrganizationCleared = () => {
        // These describe the organization itself, so they go with it — also on a saved lead opened for editing.
        for (const key of ORG_PROFILE_FIELDS) setValue(key, '', touch);
        // The address is only undone when an organization filled it in; a lead for a new company keeps the
        // address the user typed.
        if (!linkedOrg) return;
        for (const [key, value] of Object.entries(ORG_ADDRESS_RESET)) {
            setValue(key as keyof LeadFormData, value, touch);
        }
        setLinkedOrg(null);
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
                    <FormGridItem span="full">
                        <RhfEmailList emailNotices={emailNotices} />
                    </FormGridItem>
                </FormGrid>
            </Box>

            {/* ── Organization ── */}
            <Box>
                <SectionLabel label="ORGANIZATION" sx={groupLabelSx} />
                <FormGrid columns={3}>
                    <RhfLookup<LeadFormData, 'organization'>
                        name="organizationName"
                        label="Organization Name"
                        hint={
                            stillLinked && linkedOrg ? (
                                <Chip
                                    size="small"
                                    label="Details & address auto-filled"
                                    sx={{ height: 20, fontSize: '0.68rem', fontWeight: 700, color: '#1e40af', backgroundColor: '#e0e7ff' }}
                                />
                            ) : (
                                'Pick existing or type new company'
                            )
                        }
                        placeholder="Search or enter organization..."
                        lookupType="organization"
                        onSelectRecord={handleOrganizationSelected}
                        onClearRecord={handleOrganizationCleared}
                    />
                    {/* Mailing Name (always equals Organization Name) */}
                    <FormField name="mailingName" label="Mailing Name" hint="Follows Organization Name">
                        <TextField
                            fullWidth
                            size="small"
                            value={organizationName}
                            placeholder="Same as organization name"
                            sx={{ ...fieldSx, '& .MuiOutlinedInput-root': { backgroundColor: '#f8fafc', color: '#475569' } }}
                            slotProps={{
                                htmlInput: { readOnly: true, tabIndex: -1, 'aria-readonly': true },
                                input: {
                                    endAdornment: (
                                        <InputAdornment position="end">
                                            <LockOutlinedIcon sx={{ fontSize: 16, color: '#94a3b8' }} />
                                        </InputAdornment>
                                    ),
                                },
                            }}
                        />
                    </FormField>
                    <RhfSelect<LeadFormData> name="registrationType" label="Registration Type" options={LEAD_REGISTRATION_TYPES} placeholder="Select Type" />
                    {isRegistered ? (
                        <RhfUppercaseField<LeadFormData>
                            name="gstNo"
                            label="GST Number"
                            required
                            disabled={false}
                            hint="15-character GSTIN"
                            placeholder="e.g. 06AFZFS3757G1Z9"
                            maxLength={FIELD_MAX_LENGTH.gstin}
                        />
                    ) : (
                        <Tooltip
                            title={
                                registrationType
                                    ? `GST Number is disabled because Registration Type is '${registrationType}'. Select 'Registered' to enter a GST Number.`
                                    : "Select 'Registered' in Registration Type to enable GST Number."
                            }
                            arrow
                            placement="top"
                        >
                            {/* A span wrapper lets the tooltip fire on hover even though the input is disabled. */}
                            <Box component="span" sx={{ display: 'block' }}>
                                <RhfUppercaseField<LeadFormData>
                                    name="gstNo"
                                    label="GST Number"
                                    required={false}
                                    disabled
                                    placeholder={registrationType ? `Not applicable (${registrationType})` : "Select 'Registered' to enter GSTIN"}
                                    maxLength={FIELD_MAX_LENGTH.gstin}
                                />
                            </Box>
                        </Tooltip>
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
                    <RhfLookup<LeadFormData> name="referredBy" label="Referred By" hint="Partner, channel or employee" placeholder="e.g. Sunil Mehta / Tally Partner" />
                    <RhfSelect<LeadFormData> name="followupType" label="Followup Type" hint="Default: Call" options={FOLLOWUP_TYPES} placeholder="Select Type" />
                    <RhfDateTimeField<LeadFormData> dateName="nextFollowupDate" timeName="nextFollowupTime" label="Next Followup Date" required hint="Date & time" />
                    <RhfLookup<LeadFormData> name="assignedTo" label="Assigned to" lookupType="user" required hint="Default: mittal.sharma" placeholder="Select Representative" />
                    <RhfChipGroup<LeadFormData> name="productCategory" label="Product Category" required options={PRODUCT_CATEGORIES} />
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
