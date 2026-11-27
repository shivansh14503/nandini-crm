'use client';

import React, { useEffect, useMemo, useRef } from 'react';
import { Box, Divider } from '@mui/material';
import { useFormContext, useWatch } from 'react-hook-form';

import {
    FIELD_MAX_LENGTH,
    FormGrid,
    LockedField,
    LockedInputs,
    PICKED_CONTACT_HINT,
    usePickedContactLocks,
    SectionLabel,
    RhfLookup,
    RhfAddressSection,
    RhfPhoneField,
    RhfUppercaseField,
    RhfEmailField,
} from '@/components/forms';
import type { QuotationFormData } from '@/types/quotation.types';
import { normalizeLegacyStateName } from '@/data/addressMaster';
import { normalizeCountryValue } from '@/utils/address';
import { useContacts, useOrganizations } from '@/hooks/queries';
import { currentContactsFirst, isPickableContact } from '@/components/common/lookup';
import type { ExtendedOrganization } from '@/types/organization.types';
import type { Contact } from '@/types/contact.types';

const NO_ORGANIZATIONS: ExtendedOrganization[] = [];
const NO_CONTACTS: Contact[] = [];

export function QuotationAddressSection() {
    const { control, setValue, getValues, getFieldState } = useFormContext<QuotationFormData>();

    const organizationName = useWatch({ control, name: 'organizationName' });
    const contactName = useWatch({ control, name: 'contact' });

    const prevOrgRef = useRef(organizationName);
    const prevContactRef = useRef(contactName);

    // Organization and Contact options
    const { data: organizations = NO_ORGANIZATIONS } = useOrganizations();
    const { data: contacts = NO_CONTACTS } = useContacts();
    const orgOptions = useMemo(() => organizations.map((o) => o.organizationName), [organizations]);
    // Contacts who left their job aren't offered, as in every contact picker.
    const contactOptions = useMemo(() => contacts.filter(isPickableContact).map((c) => c.name), [contacts]);
    // Number and email filled from a picked contact are locked, as on Convert Lead.
    const contactLocks = usePickedContactLocks<QuotationFormData>(control, contacts, { contact: 'contact', number: 'contactNumber', email: 'contactEmail', organization: 'organizationName' });

    // ── Mailing name always equals the organization name (shown locked below) ─────
    // Dirty only when the user changed the organization, so opening an older quotation whose saved
    // mailing name differs doesn't flag the form as edited.
    useEffect(() => {
        if ((getValues('mailingName') ?? '') === (organizationName ?? '')) return;
        setValue('mailingName', organizationName ?? '', { shouldDirty: getFieldState('organizationName').isDirty });
    }, [organizationName, getValues, getFieldState, setValue]);

    // ── When Organization changes, auto-fill gstNo & addresses ─────
    useEffect(() => {
        if (!organizationName || organizationName === prevOrgRef.current) return;
        prevOrgRef.current = organizationName;

        const org = organizations.find(
            (o) =>
                o.organizationName.trim().toLowerCase() ===
                organizationName.trim().toLowerCase()
        );

        if (org) {
            const opts = { shouldDirty: true, shouldValidate: true } as const;
            if (org.gstNumber) setValue('gstNumber', org.gstNumber, opts);

            // Country is set before state so the state field validates against the right country.
            const billingCountry = normalizeCountryValue(org.billingCountry);
            const shippingCountry = normalizeCountryValue(org.shippingCountry || org.billingCountry);

            const billingStreet = org.billingStreet || org.billingAddress;
            if (billingStreet) setValue('billingAddress', billingStreet, opts);
            setValue('billingCountry', billingCountry, opts);
            if (org.billingState) setValue('billingState', normalizeLegacyStateName(org.billingState, billingCountry), opts);
            if (org.billingCity) setValue('billingCity', org.billingCity, opts);
            if (org.billingPostalCode) setValue('billingPostalCode', org.billingPostalCode, opts);

            const shippingStreet = org.shippingStreet || org.shippingAddress;
            if (shippingStreet) setValue('shippingAddress', shippingStreet, opts);
            setValue('shippingCountry', shippingCountry, opts);
            if (org.shippingState) setValue('shippingState', normalizeLegacyStateName(org.shippingState, shippingCountry), opts);
            if (org.shippingCity) setValue('shippingCity', org.shippingCity, opts);
            if (org.shippingPostalCode) setValue('shippingPostalCode', org.shippingPostalCode, opts);
        }
    }, [organizationName, organizations, setValue]);

    // ── When Contact changes, auto-fill mobile & email ──────────────────────────
    useEffect(() => {
        if (!contactName || contactName === prevContactRef.current) return;
        prevContactRef.current = contactName;

        // A namesake who left their job loses a tie to the contact still in it (the one the suggestions offer).
        const contact = currentContactsFirst(contacts).find(
            (c) =>
                c.name.trim().toLowerCase() === contactName.trim().toLowerCase()
        );

        if (contact) {
            const opts = { shouldDirty: true, shouldValidate: true } as const;
            if (contact.mobile) setValue('contactNumber', contact.mobile, opts);
            const email = contact.emailAddress?.[0]?.email;
            if (email) setValue('contactEmail', email, opts);
        }
    }, [contactName, contacts, setValue]);

    return (
        <Box sx={{ p: { xs: 2.5, md: 3.5 } }}>
            {/* ── Top Section: Organization & Contact Header Grid ── */}
            <SectionLabel label="ACCOUNT & CONTACT CONTEXT" sx={{ mb: 3 }} />

            <FormGrid columns={3} sx={{ mb: 4 }}>
                {/* ── Account ── */}
                <RhfLookup<QuotationFormData>
                    name="organizationName"
                    label="Organization Name"
                    options={orgOptions}
                    placeholder="Search or enter Organization..."
                    hint="Linked client organization"
                />
                <LockedField
                    name="mailingName"
                    label="Mailing Name"
                    value={organizationName ?? ''}
                    hint="As on billing documents • follows Organization"
                />
                <RhfUppercaseField<QuotationFormData>
                    name="gstNumber"
                    label="GST Number"
                    placeholder="e.g. 07AAAAA0000A1Z5"
                    maxLength={FIELD_MAX_LENGTH.gstin}
                    hint="Client GSTIN"
                />

                {/* ── Recipient ── */}
                <RhfLookup<QuotationFormData>
                    name="contact"
                    label="Contact"
                    required
                    options={contactOptions}
                    placeholder="Search or enter Contact..."
                    hint="Signatory / quote recipient"
                    fieldSize="md"
                />
                <LockedInputs locked={contactLocks.number}>
                    <RhfPhoneField<QuotationFormData>
                        name="contactNumber"
                        label="Contact Number"
                        placeholder="e.g. 9800000000"
                        hint={contactLocks.number ? PICKED_CONTACT_HINT : 'Direct phone / WhatsApp'}
                    />
                </LockedInputs>
                <LockedInputs locked={contactLocks.email}>
                    <RhfEmailField<QuotationFormData>
                        name="contactEmail"
                        label="Contact Email"
                        placeholder="contact@company.com"
                        hint={contactLocks.email ? PICKED_CONTACT_HINT : 'Receives the quotation PDF'}
                    />
                </LockedInputs>
            </FormGrid>

            <Divider sx={{ my: 3.5, borderColor: 'var(--mui-palette-border-light)' }} />

            {/* ── Bottom Section: Reusable Billing & Shipping Address Grid ── */}
            <RhfAddressSection<QuotationFormData>
                required
                billingTitle="BILLING ADDRESS"
                shippingTitle="SHIPPING ADDRESS"
                streetLabel="Street"
                shippingStreetLabel="Street"
                copyLabel="Copy address from left"
            />
        </Box>
    );
}

export default QuotationAddressSection;
