'use client';

import React, { useEffect, useMemo } from 'react';
import { Alert, Grid } from '@mui/material';
import { useFormContext, useWatch } from 'react-hook-form';

import { RhfLookup, RhfSelect, RhfTextField } from '@/components/forms';
import {
    NATURE_OF_BUSINESS,
    ENTITY_TYPES,
    CUSTOMER_TYPES,
    LEAD_SOURCES as ORG_LEAD_SOURCES,
} from '@/components/organizations/constants';
import { findExistingOrganization, organizationService } from '@/services';
import { LEAD_ASSIGNED_USERS } from '@/types/lead.types';
import type { ConvertLeadFormValues } from '@/validations';

type F = ConvertLeadFormValues;

/** "Create Organization OR Select Organization" section of the Convert Lead form. */
export function ConvertOrganizationSection() {
    const { control, setValue } = useFormContext<F>();
    const organizationName = useWatch({ control, name: 'organizationName' });

    const organizationNames = useMemo(
        () => organizationService.getAllSync().map((o) => o.organizationName),
        []
    );
    const existing = useMemo(() => findExistingOrganization(organizationName), [organizationName]);

    // Link to (and prefill from) an existing organization when the typed name matches one.
    useEffect(() => {
        const opts = { shouldValidate: true } as const;
        if (!existing) {
            setValue('existingOrganizationId', '');
            return;
        }
        setValue('existingOrganizationId', existing.id);
        setValue('mailingName', existing.mailingName ?? '', opts);
        setValue('natureOfBusiness', existing.natureOfBusiness || '', opts);
        setValue('typeOfEntity', existing.typeOfEntity || '', opts);
        setValue('customerType', existing.customerType || '', opts);
        setValue('sourceOfLead', existing.sourceOfLead || '', opts);
        setValue('memberOf', existing.memberOfParentCorp ?? '', opts);
        setValue('organizationDescription', existing.description ?? '', opts);
    }, [existing, setValue]);

    return (
        <>
            {existing && (
                <Alert severity="info" sx={{ mb: 2 }}>
                    Organization “{existing.organizationName}” already exists and will be linked — no duplicate will be created.
                </Alert>
            )}
            <Grid container spacing={3.5}>
                <Grid size={{ xs: 12, md: 6 }}>
                    <RhfLookup<F>
                        name="organizationName"
                        label="Organization Name"
                        required
                        hint="Type a new name or pick an existing organization"
                        options={organizationNames}
                        placeholder="Search or enter organization..."
                    />
                    <RhfTextField<F> name="mailingName" label="Mailing Name" placeholder="Official mailing name" />
                    <RhfSelect<F> name="natureOfBusiness" label="Nature of Business" required options={NATURE_OF_BUSINESS} placeholder="Select Nature of Business" />
                    <RhfSelect<F> name="typeOfEntity" label="Type of Entity" required options={ENTITY_TYPES} placeholder="Select Type of Entity" />
                    <RhfSelect<F> name="customerType" label="Customer Type" required options={CUSTOMER_TYPES} placeholder="Select Customer Type" />
                </Grid>
                <Grid size={{ xs: 12, md: 6 }}>
                    <RhfSelect<F> name="sourceOfLead" label="Source of Lead" options={ORG_LEAD_SOURCES} placeholder="Select Source of Lead" />
                    <RhfTextField<F> name="memberOf" label="Member of" placeholder="Parent corporation" />
                    <RhfTextField<F> name="organizationDescription" label="Description" multiline minRows={3} placeholder="Notes about this organization..." />
                    <RhfLookup<F> name="organizationAssignedTo" label="Assigned to" required options={LEAD_ASSIGNED_USERS} placeholder="Select assigned representative" />
                </Grid>
            </Grid>
        </>
    );
}
