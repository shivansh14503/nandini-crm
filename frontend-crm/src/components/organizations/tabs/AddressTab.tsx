'use client';

import React from 'react';
import { Box, Typography, TextField, FormControlLabel, Checkbox } from '@mui/material';

// Icons
import PlaceOutlinedIcon from '@mui/icons-material/PlaceOutlined';
import LocalShippingOutlinedIcon from '@mui/icons-material/LocalShippingOutlined';

import {
    FormField,
    ReadOnlyField,
    SectionLabel,
    fieldSx,
    CountrySelectField,
    StateRegionField,
    CityAutocompleteField,
    PostalCodeField,
    shouldResetStateForCountry,
    countryIso2OrDefault,
} from '@/components/forms';
import { getSubdivisionsByCountry } from '@/data/addressMaster';
import { formatAddressLine } from '@/utils/address';
import type { OrganizationFormData } from '@/types/organization.types';
import { useFormMode } from '@/context/FormModeContext';

export interface AddressTabProps {
    form: OrganizationFormData;
    set: <K extends keyof OrganizationFormData>(key: K, value: OrganizationFormData[K]) => void;
    handleCopyAddressToggle: (checked: boolean) => void;
}

type Side = 'billing' | 'shipping';

/** Field keys per column; street is stored in both `*Street` and `*Address`, which the form keeps in sync. */
const KEYS = {
    billing: {
        street: 'billingStreet',
        address: 'billingAddress',
        country: 'billingCountry',
        state: 'billingState',
        city: 'billingCity',
        postalCode: 'billingPostalCode',
    },
    shipping: {
        street: 'shippingStreet',
        address: 'shippingAddress',
        country: 'shippingCountry',
        state: 'shippingState',
        city: 'shippingCity',
        postalCode: 'shippingPostalCode',
    },
} as const satisfies Record<Side, Record<string, keyof OrganizationFormData>>;

export function AddressTab({ form, set, handleCopyAddressToggle }: AddressTabProps) {
    const isView = useFormMode().mode === 'view';
    const copying = Boolean(form.copyAddressFromBilling);

    const setStreet = (side: Side, value: string) => {
        set(KEYS[side].street, value);
        set(KEYS[side].address, value);
    };

    // Changing country clears a state that doesn't belong to the new country.
    const setCountry = (side: Side, iso2: string) => {
        set(KEYS[side].country, iso2);
        if (shouldResetStateForCountry(form[KEYS[side].state], iso2)) set(KEYS[side].state, '');
    };

    const renderColumn = (side: Side) => {
        const k = KEYS[side];
        const isBilling = side === 'billing';
        const locked = !isBilling && copying;
        const country = form[k.country] || '';
        const hasStates = getSubdivisionsByCountry(countryIso2OrDefault(country)).length > 0;

        return (
            <>
                <CountrySelectField
                    name={k.country}
                    value={country}
                    onChange={(iso2) => setCountry(side, iso2)}
                    required={isBilling}
                    disabled={locked}
                />

                <StateRegionField
                    name={k.state}
                    value={form[k.state] || ''}
                    onChange={(v) => set(k.state, v)}
                    countryValue={country}
                    required={isBilling && hasStates}
                    disabled={locked}
                />

                <CityAutocompleteField
                    name={k.city}
                    value={form[k.city] || ''}
                    onChange={(v) => set(k.city, v)}
                    countryValue={country}
                    required={isBilling}
                    disabled={locked}
                />

                <FormField
                    name={k.address}
                    label="Street"
                    required={isBilling}
                    hint={isBilling ? 'Registered office location' : 'Dispatch & delivery location'}
                    sx={{ mb: 0 }}
                >
                    <TextField
                        fullWidth
                        multiline
                        minRows={3}
                        maxRows={5}
                        size="small"
                        placeholder={isBilling ? 'Enter a location' : 'Enter delivery location'}
                        value={form[k.street] || form[k.address] || ''}
                        onChange={(e) => setStreet(side, e.target.value)}
                        disabled={locked}
                        sx={fieldSx}
                    />
                </FormField>

                <PostalCodeField
                    name={k.postalCode}
                    value={form[k.postalCode] || ''}
                    onChange={(v) => set(k.postalCode, v)}
                    countryValue={country}
                    required={isBilling}
                    disabled={locked}
                />
            </>
        );
    };

    if (isView) {
        const line = (side: Side) => {
            const k = KEYS[side];
            return formatAddressLine({
                street: form[k.street] || form[k.address],
                city: form[k.city],
                state: form[k.state],
                postalCode: form[k.postalCode],
                country: form[k.country],
            });
        };
        const billing = line('billing');
        const shipping = line('shipping');
        return (
            <Box sx={{ p: { xs: 2.5, md: 3.5 }, display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 3.5 }}>
                {billing && (
                    <Box>
                        <SectionLabel icon={<PlaceOutlinedIcon sx={{ fontSize: 18 }} />} label="Billing Address" />
                        <ReadOnlyField label="Address" value={billing} copyable />
                    </Box>
                )}
                {shipping && (
                    <Box>
                        <SectionLabel icon={<LocalShippingOutlinedIcon sx={{ fontSize: 18 }} />} label="Shipping Address" />
                        <ReadOnlyField label="Address" value={shipping} copyable />
                    </Box>
                )}
            </Box>
        );
    }

    return (
        <Box sx={{ p: { xs: 2.5, md: 3.5 } }}>
            <Box
                sx={{
                    display: 'grid',
                    gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' },
                    gap: 3.5,
                }}
            >
                {/* ── LEFT COLUMN: Billing Address ─────────────────── */}
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
                    <SectionLabel icon={<PlaceOutlinedIcon sx={{ fontSize: 18 }} />} label="Billing Address" />
                    {renderColumn('billing')}
                    <FormField name="billingLatitude" label="Latitude" hint="Geo coordinate" sx={{ mb: 0 }}>
                        <TextField
                            fullWidth
                            size="small"
                            placeholder="0.00000000"
                            value={form.billingLatitude ?? '0.00000000'}
                            onChange={(e) => set('billingLatitude', e.target.value)}
                            sx={fieldSx}
                        />
                    </FormField>
                </Box>

                {/* ── RIGHT COLUMN: Shipping Address ────────────────── */}
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
                    <Box
                        sx={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            flexWrap: 'wrap',
                            gap: 1,
                        }}
                    >
                        <SectionLabel icon={<LocalShippingOutlinedIcon sx={{ fontSize: 18 }} />} label="Shipping Address" />
                        {!isView && (
                            <FormControlLabel
                                control={
                                    <Checkbox
                                        size="small"
                                        checked={copying}
                                        onChange={(e) => handleCopyAddressToggle(e.target.checked)}
                                        sx={{ color: '#2563EB', '&.Mui-checked': { color: '#2563EB' }, p: 0.5 }}
                                    />
                                }
                                label={
                                    <Typography sx={{ fontSize: '0.78rem', color: '#374151', fontWeight: 600 }}>
                                        Copy address from left
                                    </Typography>
                                }
                                sx={{ m: 0 }}
                            />
                        )}
                    </Box>
                    {renderColumn('shipping')}
                    <FormField name="shippingLongitude" label="Longitude" hint="Geo coordinate" sx={{ mb: 0 }}>
                        <TextField
                            fullWidth
                            size="small"
                            placeholder="0.00000000"
                            value={form.shippingLongitude ?? '0.00000000'}
                            onChange={(e) => set('shippingLongitude', e.target.value)}
                            sx={fieldSx}
                        />
                    </FormField>
                </Box>
            </Box>
        </Box>
    );
}
