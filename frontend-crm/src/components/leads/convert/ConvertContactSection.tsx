'use client';

import React, { useMemo, useState } from 'react';
import { Alert, Box } from '@mui/material';
import { useFormContext, useWatch } from 'react-hook-form';

import {
    FormField,
    FormGrid,
    FormGridItem,
    LookupField,
    RhfCheckbox,
    RhfChipGroup,
    RhfEmailList,
    RhfLookup,
    RhfSelect,
    RhfTextField,
    RhfPhoneField,
} from '@/components/forms';
import { matchExistingContact } from '@/services';
import { useContacts } from '@/hooks/queries';
import type { Contact } from '@/types/contact.types';
import {
    COMMUNICATION_TYPES,
    CONTACT_DEPARTMENTS,
    CONTACT_DESIGNATIONS,
} from '@/types/contact.types';
import type { ConvertLeadFormValues } from '@/validations';

type F = ConvertLeadFormValues;

const NO_CONTACTS: Contact[] = [];

/** "Create Contact OR Select Contact" section of the Convert Lead form. */
export function ConvertContactSection() {
    const { setValue, control } = useFormContext<F>();
    const mobile = useWatch({ control, name: 'contactMobile' });
    const existingContactId = useWatch({ control, name: 'existingContactId' });
    const [selected, setSelected] = useState('');

    // Label → contact lookup for the "select existing" picker.
    const { data: contacts = NO_CONTACTS } = useContacts();
    const contactsByLabel = useMemo(() => {
        const map = new Map<string, Contact>();
        contacts.forEach((c) => map.set(`${c.name} (${c.mobile})`, c));
        return map;
    }, [contacts]);

    const handleSelect = (label: string) => {
        setSelected(label);
        const contact = contactsByLabel.get(label);
        if (!contact) {
            setValue('existingContactId', '');
            return;
        }
        const opts = { shouldDirty: true, shouldValidate: true } as const;
        setValue('existingContactId', contact.id, opts);
        setValue('contactName', contact.name, opts);
        setValue('contactMobile', contact.mobile, opts);
        setValue('contactPhone3', contact.phone3 ?? '', opts);
        setValue('contactEmails', contact.emailAddresses, opts);
        setValue('designation', contact.designation ?? '', opts);
        setValue('department', contact.department ?? '', opts);
        setValue('communicationType', contact.communicationType ?? [], opts);
        setValue('isPrimaryContact', contact.isPrimaryContact, opts);
        setValue('doNotCall', contact.doNotCall, opts);
        setValue('contactDescription', contact.description ?? '', opts);
        setValue('contactAssignedTo', contact.assignedTo, opts);
    };

    const duplicate = useMemo(
        () => (mobile ? matchExistingContact(contacts, mobile, existingContactId || undefined) : undefined),
        [contacts, mobile, existingContactId]
    );

    return (
        <>
            <FormField label="Select Existing Contact" size="lg" hint="Optional — leave blank to create new">
                <LookupField
                    value={selected}
                    onChange={handleSelect}
                    options={[...contactsByLabel.keys()]}
                    placeholder="Search existing contacts by name or mobile..."
                />
            </FormField>

            <FormGrid columns={3}>
                <RhfTextField<F> name="contactName" label="Name" required placeholder="Contact person name" />
                <RhfPhoneField<F> name="contactMobile" label="Mobile" required />
                <RhfPhoneField<F> name="contactPhone3" label="Phone 3" placeholder="Alternate phone number" />

                <RhfSelect<F> name="designation" label="Designation" options={CONTACT_DESIGNATIONS} placeholder="Select Designation" />
                <RhfSelect<F> name="department" label="Department" options={CONTACT_DEPARTMENTS} placeholder="Select Department" />
                <RhfLookup<F> name="contactAssignedTo" label="Assigned to" lookupType="user" required placeholder="Select representative" />

                <FormGridItem span={2}>
                    <RhfTextField<F> name="organizationName" label="Organization Name" required disabled hint="Taken from the organization section below" />
                </FormGridItem>

                <FormGridItem span="full">
                    <RhfEmailList name="contactEmails" required />
                </FormGridItem>
                <RhfChipGroup<F> name="communicationType" label="Communication Type" options={COMMUNICATION_TYPES} />
                <FormGridItem span="full">
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', columnGap: 3 }}>
                        <RhfCheckbox<F> name="isPrimaryContact" label="Is Primary Contact" />
                        <RhfCheckbox<F> name="doNotCall" label="Do Not Call (DND)" />
                    </Box>
                </FormGridItem>
                <RhfTextField<F> name="contactDescription" label="Description" multiline minRows={3} placeholder="Notes about this contact..." />
            </FormGrid>

            {duplicate && (
                <Alert severity="warning" sx={{ mt: 2 }}>
                    This Number Already Exists! Existing contact “{duplicate.name}” will be linked instead of creating a duplicate.
                </Alert>
            )}
        </>
    );
}
