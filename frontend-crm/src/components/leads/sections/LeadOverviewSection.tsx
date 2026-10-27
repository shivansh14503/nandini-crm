'use client';

import React from 'react';
import { Box } from '@mui/material';

import {
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

const columnSx = { display: 'flex', flexDirection: 'column', gap: 2 } as const;

/** Overview tab of the Lead form. Must be rendered inside a `FormProvider<LeadFormData>`. */
export function LeadOverviewSection() {
    return (
        <Box sx={{ p: { xs: 2.5, md: 3.5 } }}>
            <SectionLabel label="OVERVIEW" sx={{ mb: 3 }} />

            <Box
                sx={{
                    display: 'grid',
                    gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' },
                    gap: { xs: 2.5, md: 4 },
                }}
            >
                <Box sx={columnSx}>
                    <RhfTextField<LeadFormData> name="name" label="Name" required hint="Contact person name" placeholder="Enter contact person name" />
                    <RhfPhoneField<LeadFormData> name="mobile" label="Mobile" required hint="Primary 10-digit number" />
                    <RhfEmailList />
                    <RhfTextField<LeadFormData> name="mailingName" label="Mailing Name" hint="As shown on official invoices / letters" placeholder="Official mailing name" />
                    <RhfSelect<LeadFormData> name="designation" label="Designation" options={LEAD_DESIGNATIONS} placeholder="Select Designation" />
                    <RhfSelect<LeadFormData> name="leadSource" label="Lead Source" required options={LEAD_SOURCES} placeholder="Select Lead Source" />
                    <RhfChipGroup<LeadFormData> name="productCategory" label="Product Category" required options={PRODUCT_CATEGORIES} />
                    <RhfSelect<LeadFormData> name="followupType" label="Followup Type" hint="Default: Call" options={FOLLOWUP_TYPES} placeholder="Select Followup Type" />
                    <RhfTextField<LeadFormData> name="addDescription" label="Add Description" required hint="Action item notes / requirement brief" multiline minRows={3} maxRows={5} placeholder="Enter specific followup requirement, client demand, or notes..." />
                    <RhfSelect<LeadFormData> name="registrationType" label="Registration Type" options={LEAD_REGISTRATION_TYPES} placeholder="Select Registration Type" />
                    <RhfSelect<LeadFormData> name="turnover" label="Turnover" hint="Annual turnover bracket" options={LEAD_TURNOVER_RANGES} placeholder="Select Annual Turnover" />
                    <RhfLookup<LeadFormData> name="assignedTo" label="Assigned to" lookupType="user" required hint="Default: mittal.sharma" options={LEAD_ASSIGNED_USERS} placeholder="Select Assigned Representative" />
                </Box>

                <Box sx={columnSx}>
                    <RhfPhoneField<LeadFormData> name="otherPhone" label="Other Phone" hint="Landline or alternate phone" placeholder="e.g. 0114567890" />
                    <RhfTextField<LeadFormData> name="organizationName" label="Organization Name" hint="Company or business firm name" placeholder="e.g. Acme Industrial Solutions Pvt Ltd" />
                    <RhfSelect<LeadFormData> name="department" label="Department" options={LEAD_DEPARTMENTS} placeholder="Select Department" />
                    <RhfSelect<LeadFormData> name="leadType" label="Lead Type" required hint="Hot / Warm / Cold urgency" options={LEAD_TYPES} placeholder="Select Lead Urgency" />
                    <RhfSelect<LeadFormData> name="status" label="Status" hint="Default: New" options={LEAD_STATUSES} placeholder="Select Status" />
                    <RhfDateTimeField<LeadFormData> dateName="nextFollowupDate" timeName="nextFollowupTime" label="Next Followup Date" required hint="Calendar date & scheduled time" />
                    <RhfTextField<LeadFormData> name="description" label="Description" hint="General background notes" multiline minRows={3} maxRows={5} placeholder="Enter background context, client setup, or meeting minutes..." />
                    <RhfSelect<LeadFormData> name="noOfEmployee" label="No of Employee" options={LEAD_EMPLOYEE_RANGES} placeholder="Select Employee Bracket" />
                    <RhfLookup<LeadFormData> name="referredBy" label="Referred By" hint="Referring partner, channel, or employee" placeholder="e.g. Sunil Mehta / Tally Channel Partner" />
                </Box>
            </Box>
        </Box>
    );
}
