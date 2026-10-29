'use client';

import React from 'react';
import { Box } from '@mui/material';

import {
    FormGrid,
    FormGridItem,
    SectionLabel,
    RhfTextField,
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
    LEAD_ASSIGNED_USERS,
    type LeadFormData,
} from '@/types/lead.types';

const groupLabelSx = { mb: 2 } as const;

/** Overview tab of the Lead form. Must be rendered inside a `FormProvider<LeadFormData>`. */
export function LeadOverviewSection() {
    return (
        <Box sx={{ p: { xs: 2.5, md: 3.5 }, display: 'flex', flexDirection: 'column', gap: 3.5 }}>
            {/* ── Contact person ── */}
            <Box>
                <SectionLabel label="CONTACT PERSON" sx={groupLabelSx} />
                <FormGrid columns={3}>
                    <RhfTextField<LeadFormData> name="name" label="Name" required hint="Contact person name" placeholder="Enter contact person name" />
                    <RhfPhoneField<LeadFormData> name="mobile" label="Mobile" required hint="Primary 10-digit number" />
                    <RhfPhoneField<LeadFormData> name="otherPhone" label="Other Phone" hint="Landline / alternate" placeholder="e.g. 0114567890" />
                    <RhfSelect<LeadFormData> name="designation" label="Designation" options={LEAD_DESIGNATIONS} placeholder="Select Designation" />
                    <RhfSelect<LeadFormData> name="department" label="Department" options={LEAD_DEPARTMENTS} placeholder="Select Department" />
                    <FormGridItem span="full">
                        <RhfEmailList />
                    </FormGridItem>
                </FormGrid>
            </Box>

            {/* ── Organization ── */}
            <Box>
                <SectionLabel label="ORGANIZATION" sx={groupLabelSx} />
                <FormGrid columns={3}>
                    <RhfTextField<LeadFormData> name="organizationName" label="Organization Name" hint="Company or firm name" placeholder="e.g. Acme Industrial Solutions Pvt Ltd" />
                    <RhfTextField<LeadFormData> name="mailingName" label="Mailing Name" hint="As on official invoices" placeholder="Official mailing name" />
                    <RhfSelect<LeadFormData> name="registrationType" label="Registration Type" options={LEAD_REGISTRATION_TYPES} placeholder="Select Type" />
                    <RhfSelect<LeadFormData> name="turnover" label="Turnover" hint="Annual bracket" options={LEAD_TURNOVER_RANGES} placeholder="Select Turnover" />
                    <RhfSelect<LeadFormData> name="noOfEmployee" label="No of Employee" options={LEAD_EMPLOYEE_RANGES} placeholder="Select Employee Bracket" />
                </FormGrid>
            </Box>

            {/* ── Pipeline & follow-up ── */}
            <Box>
                <SectionLabel label="PIPELINE & FOLLOW-UP" sx={groupLabelSx} />
                <FormGrid columns={3}>
                    <RhfSelect<LeadFormData> name="leadSource" label="Lead Source" required options={LEAD_SOURCES} placeholder="Select Lead Source" />
                    <RhfSelect<LeadFormData> name="leadType" label="Lead Type" required hint="Urgency" options={LEAD_TYPES} />
                    <RhfSelect<LeadFormData> name="status" label="Status" hint="Default: New" options={LEAD_STATUSES} placeholder="Select Status" />
                    <RhfLookup<LeadFormData> name="referredBy" label="Referred By" hint="Partner, channel or employee" placeholder="e.g. Sunil Mehta / Tally Partner" />
                    <RhfSelect<LeadFormData> name="followupType" label="Followup Type" hint="Default: Call" options={FOLLOWUP_TYPES} placeholder="Select Type" />
                    <RhfDateTimeField<LeadFormData> dateName="nextFollowupDate" timeName="nextFollowupTime" label="Next Followup Date" required hint="Date & time" />
                    <RhfLookup<LeadFormData> name="assignedTo" label="Assigned to" lookupType="user" required hint="Default: mittal.sharma" options={LEAD_ASSIGNED_USERS} placeholder="Select Representative" />
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
