'use client';

import React, { useEffect, useMemo, useRef } from 'react';
import { Alert } from '@mui/material';
import { useFormContext, useWatch } from 'react-hook-form';

import { LockedField, RhfLookup, RhfSelect, RhfTextField } from '@/components/forms';
import { ConvertRecordSections } from './ConvertRecordSections';
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
import { useDropdownOptionsGetter, useFormConfigs } from '@/hooks/queries/useFormConfigs';
import { extraValuesFrom } from '@/utils/convertLeadFields';

const NO_ORGANIZATIONS: ExtendedOrganization[] = [];

type F = ConvertLeadFormValues;

/** What an existing organization supplies (and the lead's own values refill if the name stops matching one). */
const ORGANIZATION_FIELDS = [
    'natureOfBusiness',
    'typeOfEntity',
    'customerType',
    'leadSource',
    'memberOf',
    'organizationDescription',
] as const satisfies readonly (keyof F)[];

/**
 * "Create Organization OR Select Organization" section of the Convert Lead form. The fields follow the Organization
 * form's configuration (Form Builder). Naming an existing organization (typed or picked) links it as it is: its
 * details are filled in and shown read-only, and only the name stays editable. Clearing the name of a linked
 * organization brings back the lead's own organization details.
 */
export function ConvertOrganizationSection() {
    const getOptions = useDropdownOptionsGetter();
    const configs = useFormConfigs();
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
                const extras = { ...defaults.extraFields?.organizations };
                // A trade name that was the lead's organization name follows the name now in the field.
                if (extras.tradeName === defaults.organizationName) extras.tradeName = getValues('organizationName') ?? '';
                setValue('extraFields.organizations', extras, { shouldDirty: true });
            }
            return;
        }
        wasLinked.current = true;
        setValue('existingOrganizationId', existing.id);
        setValue('natureOfBusiness', existing.natureOfBusiness || '', opts);
        setValue('typeOfEntity', existing.typeOfEntity || '', opts);
        setValue('customerType', existing.customerType || '', opts);
        // An organization without a source of its own takes the lead's Lead Source.
        setValue('leadSource', existing.leadSource || getValues('opportunityLeadSource') || '', opts);
        setValue('memberOf', existing.memberOf ?? '', opts);
        setValue('organizationDescription', existing.addDescriptionAndScope ?? '', opts);
        // The other fields an admin put on Convert Lead show the organization's own values (a blank trade name is its
        // name, as the Organization form shows it).
        const extras = extraValuesFrom(configs, 'organizations', existing as unknown as Record<string, unknown>);
        if ('tradeName' in extras) extras.tradeName = existing.tradeName || existing.organizationName;
        setValue('extraFields.organizations', extras, opts);
    }, [existing, defaultValues, setValue, getValues, configs]);

    // Trade Name starts as the organization name and follows it while the two match, as on the Organization form.
    // A linked organization shows its own trade name (above).
    const previousName = useRef<string | null>(null);
    useEffect(() => {
        const name = organizationName ?? '';
        const previous = previousName.current;
        previousName.current = name;
        if (existing || previous === null || previous === name) return;
        const tradeName = getValues('extraFields.organizations.tradeName');
        if (typeof tradeName === 'string' && (tradeName === '' || tradeName === previous)) {
            setValue('extraFields.organizations.tradeName', name, { shouldDirty: true });
        }
    }, [organizationName, existing, getValues, setValue]);

    /**
     * A linked organization was removed (name cleared with [X] or deleted): back to the organization the lead brought,
     * name included, as when a selected contact is cleared. The effect above then refills the rest from the lead. If the
     * lead's own name is the organization just removed, the name stays empty, since that name would only link it again.
     */
    const releaseOrganization = () => {
        if (!existing) return;
        const leadName = ((defaultValues ?? {}) as Partial<F>).organizationName ?? '';
        const relinks = matchExistingOrganization(organizations, leadName)?.id === existing.id;
        setValue('organizationName', relinks ? '' : leadName, { shouldDirty: true });
    };

    return (
        <>
            {existing && (
                <Alert severity="info" sx={{ mb: 2 }}>
                    Organization “{existing.organizationName}” already exists and will be linked as it is — no duplicate will be created, and its
                    details can’t be edited here.
                    {organizationName?.trim().toLowerCase() !== existing.organizationName.trim().toLowerCase() &&
                        ` You typed “${organizationName.trim()}”, which is the same legal name written differently.`}
                    {' '}Clear the name to go back to the lead’s organization details, or change it to create a new organization instead.
                </Alert>
            )}
            <FormConfigProvider module="organizations" fieldNames={CONVERT_FIELD_NAMES.organizations} borrowed>
                <FormModeProvider mode={existing ? 'view' : 'create'}>
                    {/* The Organization form's own fields, sections, order and widths (see ConvertRecordSections). */}
                    <ConvertRecordSections
                        module="organizations"
                        fields={{
                            // The name is what selects the organization, so it stays editable.
                            organizationName: (
                                <FormModeProvider mode="create">
                                    <RhfLookup<F>
                                        name="organizationName"
                                        label="Organization Name"
                                        required
                                        hint="New name or pick existing"
                                        options={organizationNames}
                                        placeholder="Search or enter organization..."
                                        lookupType="organization"
                                        onClearRecord={releaseOrganization}
                                    />
                                </FormModeProvider>
                            ),
                            mailingName: (
                                <LockedField name="mailingName" label="Mailing Name" hint="Printed on tax invoices • follows Organization Name" value={organizationName ?? ''} />
                            ),
                            natureOfBusiness: (
                                <RhfSelect<F> name="natureOfBusiness" label="Nature of Business" required options={getOptions('org_nature_of_business', NATURE_OF_BUSINESS)} placeholder="Select Nature of Business" />
                            ),
                            typeOfEntity: (
                                <RhfSelect<F> name="typeOfEntity" label="Type of Entity" required options={getOptions('org_type_of_entity', ENTITY_TYPES)} placeholder="Select Type of Entity" />
                            ),
                            customerType: (
                                <RhfSelect<F> name="customerType" label="Customer Type" required options={getOptions('org_customer_type', CUSTOMER_TYPES)} placeholder="Select Customer Type" />
                            ),
                            leadSource: (
                                <RhfSelect<F> name="leadSource" label="Lead Source" options={getOptions('shared_lead_source', ORG_LEAD_SOURCES)} placeholder="Select Lead Source" />
                            ),
                            memberOf: <RhfTextField<F> name="memberOf" label="Member of (Parent Corporation)" placeholder="e.g. Apex Holdings Conglomerate Ltd." />,
                            addDescriptionAndScope: (
                                <RhfTextField<F> name="organizationDescription" label="Add Description & Scope" multiline minRows={3} placeholder="Notes about this organization..." />
                            ),
                        }}
                    />
                </FormModeProvider>
            </FormConfigProvider>
        </>
    );
}
