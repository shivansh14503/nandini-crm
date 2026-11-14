'use client';

import React from 'react';

import {
    FormGrid,
    RhfChipGroup,
    RhfMultiAutocomplete,
    RhfDateTimeField,
    RhfLookup,
    RhfSelect,
    RhfTextField,
} from '@/components/forms';
import { OPPORTUNITY_TYPES } from '@/types/opportunity.types';
import {
    FOLLOWUP_TYPES,
    LEAD_SOURCES,
    PRODUCT_CATEGORIES,
} from '@/types/lead.types';
import type { ConvertLeadFormValues } from '@/validations';
import { useDropdownOptionsGetter } from '@/hooks/queries/useFormConfigs';

type F = ConvertLeadFormValues;

const COPY_ACTIVITY_TARGETS = ['Contact', 'Customer', 'Opportunity'];

/** "Create Opportunity" section of the Convert Lead form. */
export function ConvertOpportunitySection() {
    const getOptions = useDropdownOptionsGetter();
    return (
        <FormGrid columns={3}>
            <RhfMultiAutocomplete<F> name="productCategory" label="Product Category" required options={getOptions('shared_product_category', PRODUCT_CATEGORIES)} placeholder="Search and select products..." />

            <RhfTextField<F> name="organizationName" label="Organization Name" required disabled />
            <RhfTextField<F> name="principalCompany" label="Principal Company" placeholder="Principal / OEM company" />
            <RhfLookup<F> name="referredBy" label="Referred By" placeholder="Referring partner or employee" />

            <RhfSelect<F> name="opportunityType" label="Type" required options={getOptions('opportunity_type', OPPORTUNITY_TYPES)} placeholder="Select Type" />
            <RhfSelect<F> name="opportunityLeadSource" label="Lead Source" required options={getOptions('shared_lead_source', LEAD_SOURCES)} placeholder="Select Lead Source" />
            <RhfLookup<F> name="opportunityAssignedTo" label="Assigned to" lookupType="user" required placeholder="Select representative" />

            <RhfDateTimeField<F> dateName="nextFollowupDate" timeName="nextFollowupTime" label="Next Followup Date" required />
            <RhfSelect<F> name="followupType" label="Followup Type" options={getOptions('shared_followup_type', FOLLOWUP_TYPES)} placeholder="Select Type" />

            <RhfChipGroup<F> name="copyActivitiesTo" label="Copy Activities to" options={COPY_ACTIVITY_TARGETS} />
            <RhfTextField<F> name="opportunityDescription" label="Description" multiline minRows={3} placeholder="Opportunity requirement brief..." />
        </FormGrid>
    );
}
