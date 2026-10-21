'use client';

import React from 'react';
import { Grid } from '@mui/material';

import {
    RhfChipGroup,
    RhfDateTimeField,
    RhfLookup,
    RhfSelect,
    RhfTextField,
} from '@/components/forms';
import { OPPORTUNITY_TYPES } from '@/types/opportunity.types';
import {
    FOLLOWUP_TYPES,
    LEAD_ASSIGNED_USERS,
    LEAD_SOURCES,
    PRODUCT_CATEGORIES,
} from '@/types/lead.types';
import type { ConvertLeadFormValues } from '@/validations';

type F = ConvertLeadFormValues;

const COPY_ACTIVITY_TARGETS = ['Contact', 'Customer', 'Opportunity'];

/** "Create Opportunity" section of the Convert Lead form. */
export function ConvertOpportunitySection() {
    return (
        <Grid container spacing={3.5}>
            <Grid size={{ xs: 12 }}>
                <RhfChipGroup<F> name="productCategory" label="Product Category" required options={PRODUCT_CATEGORIES} />
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
                <RhfTextField<F> name="organizationName" label="Organization Name" required disabled />
                <RhfSelect<F> name="opportunityType" label="Type" required options={OPPORTUNITY_TYPES} placeholder="Select Type" />
                <RhfDateTimeField<F> dateName="nextFollowupDate" timeName="nextFollowupTime" label="Next Followup Date" required />
                <RhfSelect<F> name="followupType" label="Followup Type" options={FOLLOWUP_TYPES} placeholder="Select Followup Type" />
                <RhfTextField<F> name="opportunityDescription" label="Description" multiline minRows={3} placeholder="Opportunity requirement brief..." />
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
                <RhfTextField<F> name="principalCompany" label="Principal Company" placeholder="Principal / OEM company" />
                <RhfLookup<F> name="referredBy" label="Referred By" placeholder="Referring partner or employee" />
                <RhfSelect<F> name="opportunityLeadSource" label="Lead Source" required options={LEAD_SOURCES} placeholder="Select Lead Source" />
                <RhfLookup<F> name="opportunityAssignedTo" label="Assigned to" required options={LEAD_ASSIGNED_USERS} placeholder="Select assigned representative" />
                <RhfChipGroup<F> name="copyActivitiesTo" label="Copy Activities to" options={COPY_ACTIVITY_TARGETS} />
            </Grid>
        </Grid>
    );
}
