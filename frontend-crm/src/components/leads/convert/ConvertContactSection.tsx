'use client';

import React, { useMemo, useState } from 'react';
import { Alert, Button, Link } from '@mui/material';
import { ROUTES } from '@/config/constants';
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
import { FormConfigProvider } from '@/context/FormConfigContext';
import { FormModeProvider } from '@/context/FormModeContext';
import { matchExistingContact } from '@/services';
import { useContacts } from '@/hooks/queries';
import type { Contact } from '@/types/contact.types';
import {
    COMMUNICATION_TYPES,
    CONTACT_DEPARTMENTS,
    CONTACT_DESIGNATIONS,
} from '@/types/contact.types';
import { CONVERT_FIELD_NAMES, type ConvertLeadFormValues } from '@/validations';
import { useDropdownOptionsGetter } from '@/hooks/queries/useFormConfigs';

type F = ConvertLeadFormValues;

const NO_CONTACTS: Contact[] = [];

/** Everything an existing contact supplies (and that the lead's own values refill when the selection is cleared). */
const CONTACT_FIELDS = [
    'contactName',
    'contactMobile',
    'contactPhone3',
    'contactEmails',
    'designation',
    'department',
    'communicationType',
    'isPrimaryContact',
    'doNotCall',
    'contactDescription',
    'contactAssignedTo',
] as const satisfies readonly (keyof F)[];

const contactLabel = (c: Contact) => `${c.name} (${c.mobile})`;

/**
 * "Create Contact OR Select Contact" section of the Convert Lead form. The fields follow the Contact form's
 * configuration (Form Builder). With an existing contact selected they show its details as saved, not editable:
 * conversion links that contact as it is.
 */
export function ConvertContactSection() {
    const getOptions = useDropdownOptionsGetter();
    const { setValue, control, formState } = useFormContext<F>();
    const mobile = useWatch({ control, name: 'contactMobile' });
    const existingContactId = useWatch({ control, name: 'existingContactId' });
    const [typed, setTyped] = useState('');

    // Label → contact lookup for the "select existing" picker.
    const { data: contacts = NO_CONTACTS } = useContacts();
    const contactsByLabel = useMemo(() => new Map(contacts.map((c) => [contactLabel(c), c] as const)), [contacts]);
    const selectedContact = useMemo(
        () => (existingContactId ? contacts.find((c) => c.id === existingContactId) : undefined),
        [contacts, existingContactId]
    );
    const locked = Boolean(existingContactId);

    const selectContact = (contact: Contact) => {
        const opts = { shouldDirty: true, shouldValidate: true } as const;
        setTyped(contactLabel(contact));
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

    /** Selection cleared: back to creating a contact from the lead's details. */
    const releaseContact = () => {
        const defaults = (formState.defaultValues ?? {}) as Partial<F>;
        setValue('existingContactId', '');
        for (const field of CONTACT_FIELDS) setValue(field, defaults[field] as never, { shouldDirty: true });
    };

    const handleSelect = (label: string) => {
        setTyped(label);
        const contact = contactsByLabel.get(label);
        if (contact) selectContact(contact);
        else if (existingContactId) releaseContact();
    };

    // The contact the API would link by mobile number when none is selected.
    const duplicate = useMemo(
        () => (!locked && mobile ? matchExistingContact(contacts, mobile) : undefined),
        [contacts, mobile, locked]
    );

    return (
        <>
            <FormField label="Select Existing Contact" size="lg" hint="Optional — leave blank to create new">
                <LookupField
                    value={selectedContact ? contactLabel(selectedContact) : typed}
                    onChange={handleSelect}
                    options={[...contactsByLabel.keys()]}
                    placeholder="Search existing contacts by name or mobile..."
                />
            </FormField>

            {locked && (
                <Alert severity="info" sx={{ mb: 2 }}>
                    {selectedContact ? <>Existing contact “{selectedContact.name}” is selected</> : 'An existing contact is selected'}
                    {' '}and will be linked as it is, so its details can’t be edited here. Clear the selection above to create a new contact instead.
                </Alert>
            )}

            <FormConfigProvider module="contacts" fieldNames={CONVERT_FIELD_NAMES.contacts} borrowed>
                <FormModeProvider mode={locked ? 'view' : 'create'}>
                    <FormGrid columns={3}>
                        <RhfTextField<F> name="contactName" label="Name" required personName placeholder="Contact person name" />
                        <RhfPhoneField<F> name="contactMobile" label="Mobile" required />
                        <RhfPhoneField<F> name="contactPhone3" label="Phone 3" placeholder="Alternate phone number" />

                        <RhfSelect<F> name="designation" label="Designation" options={getOptions('contact_designation', CONTACT_DESIGNATIONS)} placeholder="Select Designation" />
                        <RhfSelect<F> name="department" label="Department" options={getOptions('contact_department', CONTACT_DEPARTMENTS)} placeholder="Select Department" />
                        <RhfLookup<F> name="contactAssignedTo" label="Assigned to" lookupType="user" required placeholder="Select representative" />

                        <FormGridItem span={2}>
                            <RhfTextField<F> name="organizationName" label="Organization Name" required disabled hint="Taken from the organization section below" />
                        </FormGridItem>
                        <RhfCheckbox<F> name="isPrimaryContact" label="Is Primary Contact" alignWithInputs />

                        <FormGridItem span="full">
                            <RhfEmailList name="contactEmails" />
                        </FormGridItem>
                        <RhfChipGroup<F> name="communicationType" label="Communication Type" options={getOptions('contact_communication_type', COMMUNICATION_TYPES)} />
                        <RhfCheckbox<F> name="doNotCall" label="Do Not Call (DND)" alignWithInputs />
                        <RhfTextField<F> name="contactDescription" label="Description" multiline minRows={3} placeholder="Notes about this contact..." />
                    </FormGrid>
                </FormModeProvider>
            </FormConfigProvider>

            {duplicate && (
                <Alert
                    severity="warning"
                    sx={{ mt: 2 }}
                    action={
                        <Button color="inherit" size="small" onClick={() => selectContact(duplicate)} sx={{ fontWeight: 700 }}>
                            Use this contact
                        </Button>
                    }
                >
                    This Number Already Exists! Existing contact “
                    <Link
                        href={ROUTES.CONTACT_DETAIL(duplicate.id)}
                        target="_blank"
                        rel="noopener"
                        title="View contact (new tab)"
                        sx={{ fontWeight: 700, color: 'inherit', textDecorationColor: 'currentColor' }}
                    >
                        {duplicate.name}
                    </Link>
                    ” will be linked instead of creating a duplicate.
                </Alert>
            )}
        </>
    );
}
