'use client';

import React, { useEffect, useMemo, useRef } from 'react';
import { Box, Divider } from '@mui/material';
import { useFormContext, useWatch } from 'react-hook-form';

import {
    FIELD_MAX_LENGTH,
    FormGrid,
    SectionLabel,
    RhfTextField,
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
import type { ExtendedOrganization } from '@/types/organization.types';
import type { Contact } from '@/types/contact.types';

const NO_ORGANIZATIONS: ExtendedOrganization[] = [];
const NO_CONTACTS: Contact[] = [];

export function QuotationAddressSection() {
    const { control, setValue } = useFormContext<QuotationFormData>();

    const organizationName = useWatch({ control, name: 'organizationName' });
    const contactName = useWatch({ control, name: 'contactName' });

    const prevOrgRef = useRef(organizationName);
    const prevContactRef = useRef(contactName);

    // Organization and Contact options
    const { data: organizations = NO_ORGANIZATIONS } = useOrganizations();
    const { data: contacts = NO_CONTACTS } = useContacts();
    const orgOptions = useMemo(() => organizations.map((o) => o.organizationName), [organizations]);
    const contactOptions = useMemo(() => contacts.map((c) => c.name), [contacts]);

    // ── When Organization changes, auto-fill mailingName, gstNo & addresses ─────
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
            if (org.mailingName) setValue('mailingName', org.mailingName, opts);
            if (org.gstNumber || org.gstNo) setValue('gstNo', org.gstNumber || org.gstNo || '', opts);

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

        const contact = contacts.find(
            (c) =>
                c.name.trim().toLowerCase() === contactName.trim().toLowerCase()
        );

        if (contact) {
            const opts = { shouldDirty: true, shouldValidate: true } as const;
            if (contact.mobile) setValue('contactMobile', contact.mobile, opts);
            const email = contact.emailAddresses?.[0]?.email;
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
                    label="Organization"
                    options={orgOptions}
                    placeholder="Search or enter Organization..."
                    hint="Linked client organization"
                />
                <RhfTextField<QuotationFormData>
                    name="mailingName"
                    label="Mailing Name"
                    placeholder="Official organization legal name"
                    hint="As on billing documents"
                />
                <RhfUppercaseField<QuotationFormData>
                    name="gstNo"
                    label="GST NO"
                    placeholder="e.g. 07AAAAA0000A1Z5"
                    maxLength={FIELD_MAX_LENGTH.gstin}
                    hint="Client GSTIN"
                />

                {/* ── Recipient ── */}
                <RhfLookup<QuotationFormData>
                    name="contactName"
                    label="Contact"
                    required
                    options={contactOptions}
                    placeholder="Search or enter Contact..."
                    hint="Signatory / quote recipient"
                    fieldSize="md"
                />
                <RhfPhoneField<QuotationFormData>
                    name="contactMobile"
                    label="Contact Mobile No"
                    placeholder="e.g. 9800000000"
                    hint="Direct phone / WhatsApp"
                />
                <RhfEmailField<QuotationFormData>
                    name="contactEmail"
                    label="Contact Email Address"
                    placeholder="contact@company.com"
                    hint="Receives the quotation PDF"
                />
            </FormGrid>

            <Divider sx={{ my: 3.5, borderColor: '#f1f5f9' }} />

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
