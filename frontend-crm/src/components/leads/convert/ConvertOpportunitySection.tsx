'use client';

import React, { useEffect } from 'react';
import { Alert } from '@mui/material';
import { useFormContext, useWatch, type Path } from 'react-hook-form';

import { ConvertRecordSections } from './ConvertRecordSections';
import {
    RhfMultiAutocomplete,
    RhfDateTimeField,
    RhfLookup,
    RhfSelect,
    RhfTextField,
    useLeadSourceDetails,
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
import { NATURE_OF_PARTNER_OPTIONS } from '@/types/partner.types';

type F = ConvertLeadFormValues;

/** The section's own inputs (organization name belongs to the organization section). */
const OPPORTUNITY_INPUTS = [
    ...Object.values(CONVERT_FIELD_NAMES.opportunities).filter((name) => name !== 'organizationName'),
    'nextFollowupTime',
    'extraFields.opportunities',
] as const satisfies readonly Path<F>[];

/** "Create Opportunity" section of the Convert Lead form; collapses to a note when no opportunity is created. */
export function ConvertOpportunitySection() {
    const getOptions = useDropdownOptionsGetter();
    const { control, resetField } = useFormContext<F>();
    const createOpportunity = useWatch({ control, name: 'createOpportunity' });
    // The opportunity's Lead Source asks for Referred By (CA, Reference) or a Nature of Partner (Partner), as on its form.
    const { needsReferredBy, showReferredBy, showNatureOfPartner } = useLeadSourceDetails<F>({
        leadSource: 'opportunityLeadSource',
        referredBy: 'referredBy',
        natureOfPartner: 'opportunityNatureOfPartner',
    });

    // Skipped: back to the values taken from the lead, so a hidden field (e.g. a past follow-up date) can't block saving.
    useEffect(() => {
        if (!createOpportunity) for (const name of OPPORTUNITY_INPUTS) resetField(name);
    }, [createOpportunity, resetField]);

    if (!createOpportunity) {
        return (
            <Alert severity="info" sx={{ mt: 1 }}>
                No opportunity will be created. The lead is converted into the contact and organization above only.
            </Alert>
        );
    }

    // The fields follow the Opportunity form's configuration (Form Builder).
    return (
        <FormConfigProvider module="opportunities" fieldNames={CONVERT_FIELD_NAMES.opportunities} borrowed>
            {/* The Opportunity form's own fields, sections, order and widths (see ConvertRecordSections). */}
            <ConvertRecordSections
                module="opportunities"
                fields={{
                    organizationName: <RhfTextField<F> name="organizationName" label="Organization name" required disabled hint="Taken from the organization section above" />,
                    // Lead Source CA / Reference only, and then required.
                    referredBy: showReferredBy ? (
                        <RhfLookup<F> name="referredBy" label="Referred By" required={needsReferredBy} hint="Partner, agent, or client" placeholder="Referred by partner or person..." />
                    ) : null,
                    // Lead Source Partner only, and then required.
                    natureOfPartner: showNatureOfPartner ? (
                        <RhfSelect<F>
                            name="opportunityNatureOfPartner"
                            label="Nature of Partner"
                            required
                            options={getOptions('partner_nature', [...NATURE_OF_PARTNER_OPTIONS])}
                            placeholder="Select Nature of Partner"
                        />
                    ) : null,
                    type: (
                        <RhfSelect<F> name="type" label="Type" required hint="Nature of deal" options={getOptions('opportunity_type', OPPORTUNITY_TYPES)} placeholder="Select Type" />
                    ),
                    leadSource: (
                        <RhfSelect<F> name="opportunityLeadSource" label="Lead Source" required options={getOptions('shared_lead_source', LEAD_SOURCES)} placeholder="Select Lead Source" />
                    ),
                    followupType: (
                        <RhfSelect<F> name="followupType" label="Followup Type" hint="Default: Call" options={getOptions('shared_followup_type', FOLLOWUP_TYPES)} placeholder="Select Type" />
                    ),
                    nextFollowupDate: <RhfDateTimeField<F> dateName="nextFollowupDate" timeName="nextFollowupTime" label="Next Followup Date" required hint="Next touchpoint" />,
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
