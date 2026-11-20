'use client';

import React, { useEffect, useMemo, useRef } from 'react';
import { Alert } from '@mui/material';
import { useFormContext, useWatch } from 'react-hook-form';

import { FormGrid, LockedField, RhfLookup, RhfSelect, RhfTextField } from '@/components/forms';
import { FormConfigProvider } from '@/context/FormConfigContext';
import { FormModeProvider } from '@/context/FormModeContext';
import {
    NATURE_OF_BUSINESS,
    ENTITY_TYPES,
    CUSTOMER_TYPES,
    LEAD_SOURCES as ORG_LEAD_SOURCES,
} from '@/components/organizations/constants';
import { matchExistingOrganization } from '@/services';
import { useOrganizations } from '@/hooks/queries';
import type { ExtendedOrganization } from '@/types/organization.types';
import { CONVERT_FIELD_NAMES, type ConvertLeadFormValues } from '@/validations';
import { useDropdownOptionsGetter } from '@/hooks/queries/useFormConfigs';

const NO_ORGANIZATIONS: ExtendedOrganization[] = [];

type F = ConvertLeadFormValues;

/** What an existing organization supplies (and the lead's own values refill if the name stops matching one). */
const ORGANIZATION_FIELDS = [
    'natureOfBusiness',
    'typeOfEntity',
    'customerType',
    'sourceOfLead',
    'memberOf',
    'organizationDescription',
    'organizationAssignedTo',
] as const satisfies readonly (keyof F)[];

/**
 * "Create Organization OR Select Organization" section of the Convert Lead form. The fields follow the Organization
 * form's configuration (Form Builder). Naming an existing organization (typed or picked) links it as it is: its
 * details are filled in and shown read-only, and only the name stays editable.
 */
export function ConvertOrganizationSection() {
    const getOptions = useDropdownOptionsGetter();
    const { control, setValue, getValues, formState } = useFormContext<F>();
    const organizationName = useWatch({ control, name: 'organizationName' });

    const { data: organizations = NO_ORGANIZATIONS } = useOrganizations();
    const organizationNames = useMemo(() => organizations.map((o) => o.organizationName), [organizations]);
    const existing = useMemo(
        () => matchExistingOrganization(organizations, organizationName),
        [organizationName, organizations]
    );

    // Mailing name always equals the organization name (shown locked below).
    useEffect(() => {
        if ((getValues('mailingName') ?? '') !== (organizationName ?? '')) setValue('mailingName', organizationName ?? '');
    }, [organizationName, getValues, setValue]);

    // Link to (and prefill from) an existing organization when the typed name matches one; when the name stops
    // matching, the lead's own details come back so nothing of the other organization is left behind.
    const wasLinked = useRef(false);
    const defaultValues = formState.defaultValues;
    useEffect(() => {
        const opts = { shouldValidate: true } as const;
        if (!existing) {
            setValue('existingOrganizationId', '');
            if (wasLinked.current) {
                wasLinked.current = false;
                const defaults = (defaultValues ?? {}) as Partial<F>;
                for (const field of ORGANIZATION_FIELDS) setValue(field, defaults[field] as never, { shouldDirty: true });
            }
            return;
        }
        wasLinked.current = true;
        setValue('existingOrganizationId', existing.id);
        setValue('natureOfBusiness', existing.natureOfBusiness || '', opts);
        setValue('typeOfEntity', existing.typeOfEntity || '', opts);
        setValue('customerType', existing.customerType || '', opts);
        // An organization without a source of its own takes the lead's Lead Source.
        setValue('sourceOfLead', existing.sourceOfLead || getValues('opportunityLeadSource') || '', opts);
        setValue('memberOf', existing.memberOfParentCorp ?? '', opts);
        setValue('organizationDescription', existing.description ?? '', opts);
        if (existing.assignedUser) setValue('organizationAssignedTo', existing.assignedUser, opts);
    }, [existing, defaultValues, setValue, getValues]);

    return (
        <>
            {existing && (
                <Alert severity="info" sx={{ mb: 2 }}>
                    Organization “{existing.organizationName}” already exists and will be linked as it is — no duplicate will be created, and its
                    details can’t be edited here.
                    {organizationName?.trim().toLowerCase() !== existing.organizationName.trim().toLowerCase() &&
                        ` You typed “${organizationName.trim()}”, which is the same legal name written differently.`}
                    {' '}Change the name to create a new organization instead.
                </Alert>
            )}
            <FormConfigProvider module="organizations" fieldNames={CONVERT_FIELD_NAMES.organizations} borrowed>
                <FormModeProvider mode={existing ? 'view' : 'create'}>
                    <FormGrid columns={3}>
                        {/* The name is what selects the organization, so it stays editable. */}
                        <FormModeProvider mode="create">
                            <RhfLookup<F>
                                name="organizationName"
                                label="Organization Name"
                                required
                                hint="New name or pick existing"
                                options={organizationNames}
                                placeholder="Search or enter organization..."
                                lookupType="organization"
                            />
                        </FormModeProvider>
                        <LockedField name="mailingName" label="Mailing Name" hint="Follows Organization Name" value={organizationName ?? ''} />
                        <RhfTextField<F> name="memberOf" label="Member of" placeholder="Parent corporation" />

                        <RhfSelect<F> name="natureOfBusiness" label="Nature of Business" required options={getOptions('org_nature_of_business', NATURE_OF_BUSINESS)} placeholder="Select Nature of Business" />
                        <RhfSelect<F> name="typeOfEntity" label="Type of Entity" required options={getOptions('org_type_of_entity', ENTITY_TYPES)} placeholder="Select Type of Entity" />
                        <RhfSelect<F> name="customerType" label="Customer Type" required options={getOptions('org_customer_type', CUSTOMER_TYPES)} placeholder="Select Customer Type" />

                        <RhfSelect<F> name="sourceOfLead" label="Lead Source" options={getOptions('shared_lead_source', ORG_LEAD_SOURCES)} placeholder="Select Lead Source" />
                        <RhfLookup<F> name="organizationAssignedTo" label="Assigned to" lookupType="user" required placeholder="Select representative" />

                        <RhfTextField<F> name="organizationDescription" label="Description" multiline minRows={3} placeholder="Notes about this organization..." />
                    </FormGrid>
                </FormModeProvider>
            </FormConfigProvider>
        </>
    );
}
