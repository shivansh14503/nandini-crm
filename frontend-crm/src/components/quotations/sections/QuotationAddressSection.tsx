'use client';

import React, { useEffect, useMemo, useRef } from 'react';
import { Box, Divider } from '@mui/material';
import { useFormContext, useWatch } from 'react-hook-form';

import {
    SectionLabel,
    RhfTextField,
    RhfLookup,
    RhfAddressSection,
    RhfPhoneField,
    RhfUppercaseField,
    RhfEmailField,
} from '@/components/forms';
import type { QuotationFormData } from '@/types/quotation.types';
import { organizationService, contactService } from '@/services';

const columnSx = { display: 'flex', flexDirection: 'column', gap: 2.2 } as const;

export function QuotationAddressSection() {
    const { control, setValue } = useFormContext<QuotationFormData>();

    const organizationName = useWatch({ control, name: 'organizationName' });
    const contactName = useWatch({ control, name: 'contactName' });

    const prevOrgRef = useRef(organizationName);
    const prevContactRef = useRef(contactName);

    // Organization and Contact options from CRM services
    const orgOptions = useMemo(() => {
        try {
            return organizationService.getAllSync().map((o) => o.organizationName);
        } catch {
            return [];
        }
    }, []);

    const contactOptions = useMemo(() => {
        try {
            return contactService.getAllSync().map((c) => c.name);
        } catch {
            return [];
        }
    }, []);

    // ── When Organization changes, auto-fill mailingName, gstNo & addresses ─────
    useEffect(() => {
        if (!organizationName || organizationName === prevOrgRef.current) return;
        prevOrgRef.current = organizationName;

        try {
            const org = organizationService
                .getAllSync()
                .find(
                    (o) =>
                        o.organizationName.trim().toLowerCase() ===
                        organizationName.trim().toLowerCase()
                );

            if (org) {
                const opts = { shouldDirty: true, shouldValidate: true } as const;
                if (org.mailingName) setValue('mailingName', org.mailingName, opts);
                if (org.gstNumber) setValue('gstNo', org.gstNumber, opts);

                if (org.billingStreet) setValue('billingAddress', org.billingStreet, opts);
                if (org.billingCity) setValue('billingCity', org.billingCity, opts);
                if (org.billingState) setValue('billingState', org.billingState, opts);
                if (org.billingPostalCode) setValue('billingPostalCode', org.billingPostalCode, opts);
                if (org.billingCountry) setValue('billingCountry', org.billingCountry, opts);

                if (org.shippingStreet) setValue('shippingAddress', org.shippingStreet, opts);
                if (org.shippingCity) setValue('shippingCity', org.shippingCity, opts);
                if (org.shippingState) setValue('shippingState', org.shippingState, opts);
                if (org.shippingPostalCode) setValue('shippingPostalCode', org.shippingPostalCode, opts);
                if (org.shippingCountry) setValue('shippingCountry', org.shippingCountry, opts);
            }
        } catch {
            // Ignore lookups if service throws
        }
    }, [organizationName, setValue]);

    // ── When Contact changes, auto-fill mobile & email ──────────────────────────
    useEffect(() => {
        if (!contactName || contactName === prevContactRef.current) return;
        prevContactRef.current = contactName;

        try {
            const contact = contactService
                .getAllSync()
                .find(
                    (c) =>
                        c.name.trim().toLowerCase() === contactName.trim().toLowerCase()
                );

            if (contact) {
                const opts = { shouldDirty: true, shouldValidate: true } as const;
                if (contact.mobile) setValue('contactMobile', contact.mobile, opts);
                const email = contact.emailAddresses?.[0]?.email;
                if (email) setValue('contactEmail', email, opts);
            }
        } catch {
            // Ignore lookup errors
        }
    }, [contactName, setValue]);

    return (
        <Box sx={{ p: { xs: 2.5, md: 3.5 } }}>
            {/* ── Top Section: Organization & Contact Header Grid ── */}
            <SectionLabel label="ACCOUNT & CONTACT CONTEXT" sx={{ mb: 3 }} />

            <Box
                sx={{
                    display: 'grid',
                    gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' },
                    gap: { xs: 2.5, md: 4 },
                    mb: 4,
                }}
            >
                {/* Left Column */}
                <Box sx={columnSx}>
                    <RhfLookup<QuotationFormData>
                        name="organizationName"
                        label="Organization"
                        options={orgOptions}
                        placeholder="Search or enter Organization..."
                        hint="Linked client organization"
                    />

                    <RhfLookup<QuotationFormData>
                        name="contactName"
                        label="Contact"
                        required
                        options={contactOptions}
                        placeholder="Search or enter Contact person..."
                        hint="Primary signatory or quote recipient"
                    />

                    <RhfPhoneField<QuotationFormData>
                        name="contactMobile"
                        label="Contact Mobile No"
                        placeholder="e.g. 9800000000"
                        hint="Recipient direct phone / WhatsApp"
                    />
                </Box>

                {/* Right Column */}
                <Box sx={columnSx}>
                    <RhfTextField<QuotationFormData>
                        name="mailingName"
                        label="Mailing Name"
                        placeholder="Official organization legal name"
                        hint="As displayed on billing documents"
                    />

                    <RhfUppercaseField<QuotationFormData>
                        name="gstNo"
                        label="GST NO"
                        placeholder="e.g. 07AAAAA0000A1Z5"
                        maxLength={15}
                        hint="Client GST Identification Number"
                    />

                    <RhfEmailField<QuotationFormData>
                        name="contactEmail"
                        label="Contact Email Address"
                        placeholder="contact@company.com"
                        hint="Dispatch address for quotation PDF"
                    />
                </Box>
            </Box>

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
