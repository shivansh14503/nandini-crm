'use client';

import { useMemo } from 'react';
import { useFormState, useWatch, type Control, type FieldValues, type Path } from 'react-hook-form';
import type { Contact } from '@/types/contact.types';

/** Field names of the contact-derived values a form fills from a picked contact. */
export interface PickedContactFieldNames<T extends FieldValues> {
    contact: Path<T>;
    number?: Path<T>;
    email?: Path<T>;
    organization?: Path<T>;
}

export interface PickedContactLocks {
    /** The CRM contact the Contact field names (at the chosen organization when several share the name). */
    contact?: Contact;
    number: boolean;
    email: boolean;
    organization: boolean;
}

/** Hint shown on a field while it is locked to the picked contact. */
export const PICKED_CONTACT_HINT = 'From the selected contact';

const same = (a: string | undefined, b: string | undefined) => (a ?? '').trim().toLowerCase() === (b ?? '').trim().toLowerCase();
const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '');

/**
 * Which of a form's contact details are locked because they came from the contact picked in its Contact field (the
 * Contact Search popup, or a typed name that matches a contact): the number, email and organization fill in from that
 * contact and can't be edited, as Convert Lead locks the values it takes from the lead. Each unlocks when the contact
 * is cleared or changed to a name that isn't a CRM contact, when the contact has no value for it, or while its value
 * fails validation (so a bad value can still be fixed).
 */
export function usePickedContactLocks<T extends FieldValues>(
    control: Control<T>,
    contacts: readonly Contact[],
    names: PickedContactFieldNames<T>,
): PickedContactLocks {
    const [contactName, number, email, organization] = useWatch({
        control,
        name: [names.contact, names.number ?? names.contact, names.email ?? names.contact, names.organization ?? names.contact] as Path<T>[],
    }) as unknown[];
    const { errors } = useFormState({ control });

    return useMemo(() => {
        const name = text(contactName);
        const org = names.organization ? text(organization) : '';
        const matches = name ? contacts.filter((c) => same(c.name, name)) : [];
        const contact = (org && matches.find((c) => same(c.organizationName, org))) || matches[0];
        const hasError = (field: Path<T> | undefined) => Boolean(field && (errors as Record<string, unknown>)[field]);
        const lock = (field: Path<T> | undefined, value: unknown, fromContact: string | undefined) =>
            Boolean(contact && field && text(value) && text(fromContact) && !hasError(field));
        const contactEmail = contact ? (contact.emailAddress.find((e) => e.isPrimary) ?? contact.emailAddress[0])?.email : undefined;
        return {
            contact,
            number: lock(names.number, number, contact?.mobile),
            email: lock(names.email, email, contactEmail),
            organization: lock(names.organization, organization, contact?.organizationName),
        };
    }, [contacts, contactName, number, email, organization, errors, names.number, names.email, names.organization]);
}
