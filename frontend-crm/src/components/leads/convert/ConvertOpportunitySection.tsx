'use client';

import React from 'react';

import { ConvertRecordSections } from './ConvertRecordSections';
import {
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
import { CONVERT_FIELD_NAMES, type ConvertLeadFormValues } from '@/validations';
import { FormConfigProvider } from '@/context/FormConfigContext';
import { useDropdownOptionsGetter } from '@/hooks/queries/useFormConfigs';

type F = ConvertLeadFormValues;

/** "Create Opportunity" section of the Convert Lead form. */
export function ConvertOpportunitySection() {
    const getOptions = useDropdownOptionsGetter();
    // The fields follow the Opportunity form's configuration (Form Builder).
    return (
        <FormConfigProvider module="opportunities" fieldNames={CONVERT_FIELD_NAMES.opportunities} borrowed>
            {/* The Opportunity form's own fields, sections, order and widths (see ConvertRecordSections). */}
            <ConvertRecordSections
                module="opportunities"
                fields={{
                    organizationName: <RhfTextField<F> name="organizationName" label="Organization name" required disabled hint="Taken from the organization section above" />,
                    referredBy: <RhfLookup<F> name="referredBy" label="Referred By" hint="Partner, agent, or client" placeholder="Referred by partner or person..." />,
                    type: (
                        <RhfSelect<F> name="opportunityType" label="Type" required hint="Nature of deal" options={getOptions('opportunity_type', OPPORTUNITY_TYPES)} placeholder="Select Opportunity Type" />
                    ),
                    leadSource: (
                        <RhfSelect<F> name="opportunityLeadSource" label="Lead Source" required options={getOptions('shared_lead_source', LEAD_SOURCES)} placeholder="Select Lead Source" />
                    ),
                    followupType: (
                        <RhfSelect<F> name="followupType" label="Followup Type" hint="Default: Call" options={getOptions('shared_followup_type', FOLLOWUP_TYPES)} placeholder="Select Type" />
                    ),
                    nextFollowupDate: <RhfDateTimeField<F> dateName="nextFollowupDate" timeName="nextFollowupTime" label="Next Followup Date" required hint="Next touchpoint" />,
                    assignedTo: <RhfLookup<F> name="opportunityAssignedTo" label="Assigned to" lookupType="user" required hint="Account executive" placeholder="Assign to user..." />,
                    productCategory: (
                        <RhfMultiAutocomplete<F>
                            name="productCategory"
                            label="Product Category"
                            required
                            options={getOptions('shared_product_category', PRODUCT_CATEGORIES)}
                            placeholder="Search and select products..."
                        />
                    ),
                    remarks: (
                        <RhfTextField<F>
                            name="opportunityDescription"
                            label="Remarks"
                            required
                            hint="Stage summary & action items"
                            multiline
                            minRows={4}
                            maxRows={8}
                            placeholder="Provide current milestone details or immediate actions..."
                        />
                    ),
                }}
            />
        </FormConfigProvider>
    );
}
