'use client';

import React from 'react';
import {
    Box,
    Typography,
    TextField,
    FormControlLabel,
    Checkbox,
} from '@mui/material';

// Icons
import PlaceOutlinedIcon from '@mui/icons-material/PlaceOutlined';
import LocalShippingOutlinedIcon from '@mui/icons-material/LocalShippingOutlined';

import {
    FormField,
    SectionLabel,
    StyledSelect,
    fieldSx,
} from '@/components/forms';
import { INDIAN_STATES, COUNTRIES } from '@/config/constants';
import type { OrganizationFormData } from '@/types/organization.types';
import { useFormMode } from '@/context/FormModeContext';

export interface AddressTabProps {
    form: OrganizationFormData;
    set: <K extends keyof OrganizationFormData>(key: K, value: OrganizationFormData[K]) => void;
    handleCopyAddressToggle: (checked: boolean) => void;
}

export function AddressTab({
    form,
    set,
    handleCopyAddressToggle,
}: AddressTabProps) {
    const isView = useFormMode().mode === 'view';
    return (
        <Box sx={{ p: { xs: 2.5, md: 3.5 } }}>
            {/* ── Two-column grid ───────────────────────────────── */}
            <Box
                sx={{
                    display: 'grid',
                    gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' },
                    gap: 3.5,
                }}
            >
                {/* ── LEFT COLUMN: Billing Address ─────────────────── */}
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
                    <SectionLabel
                        icon={<PlaceOutlinedIcon sx={{ fontSize: 18 }} />}
                        label="Billing Address"
                    />

                    {/* Street */}
                    <FormField
                        name="billingAddress"
                        label="Street"
                        required
                        hint="Registered office location"
                        sx={{ mb: 0 }}
                    >
                        <TextField
                            fullWidth
                            multiline
                            minRows={3}
                            maxRows={5}
                            size="small"
                            placeholder="Enter a location"
                            value={form.billingStreet || ''}
                            onChange={(e) => set('billingStreet', e.target.value)}
                            sx={fieldSx}
                        />
                    </FormField>

                    {/* City */}
                    <FormField name="billingCity" label="City" required sx={{ mb: 0 }}>
                        <TextField
                            fullWidth
                            size="small"
                            placeholder="Enter city"
                            value={form.billingCity || ''}
                            onChange={(e) => set('billingCity', e.target.value)}
                            sx={fieldSx}
                        />
                    </FormField>

                    {/* State/Region */}
                    <FormField name="billingState" label="State/Region" required sx={{ mb: 0 }}>
                        <StyledSelect
                            label="State/Region"
                            placeholder="Select State/Region"
                            value={form.billingState || ''}
                            onChange={(v) => set('billingState', v)}
                            options={INDIAN_STATES}
                            required
                        />
                    </FormField>

                    {/* Postal Code */}
                    <FormField name="billingPostalCode" label="Postal Code" required sx={{ mb: 0 }}>
                        <TextField
                            fullWidth
                            size="small"
                            placeholder="Enter postal code"
                            value={form.billingPostalCode || ''}
                            onChange={(e) => set('billingPostalCode', e.target.value)}
                            sx={fieldSx}
                        />
                    </FormField>

                    {/* Country */}
                    <FormField name="billingCountry" label="Country" sx={{ mb: 0 }}>
                        <StyledSelect
                            label="Country"
                            placeholder="Select Country"
                            value={form.billingCountry || 'India'}
                            onChange={(v) => set('billingCountry', v)}
                            options={COUNTRIES}
                        />
                    </FormField>

                    {/* Latitude */}
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
                        <SectionLabel
                            icon={<LocalShippingOutlinedIcon sx={{ fontSize: 18 }} />}
                            label="Shipping Address"
                        />
                        {!isView && (
                        <FormControlLabel
                            control={
                                <Checkbox
                                    size="small"
                                    checked={Boolean(form.copyAddressFromBilling)}
                                    onChange={(e) => handleCopyAddressToggle(e.target.checked)}
                                    sx={{
                                        color: '#2563EB',
                                        '&.Mui-checked': { color: '#2563EB' },
                                        p: 0.5,
                                    }}
                                />
                            }
                            label={
                                <Typography
                                    sx={{
                                        fontSize: '0.78rem',
                                        color: '#374151',
                                        fontWeight: 600,
                                    }}
                                >
                                    Copy address from left
                                </Typography>
                            }
                            sx={{ m: 0 }}
                        />
                        )}
                    </Box>

                    {/* Street */}
                    <FormField
                        name="shippingAddress"
                        label="Street"
                        hint="Dispatch & delivery location"
                        sx={{ mb: 0 }}
                    >
                        <TextField
                            fullWidth
                            multiline
                            minRows={3}
                            maxRows={5}
                            size="small"
                            placeholder="Enter delivery location"
                            value={form.shippingStreet || ''}
                            onChange={(e) => set('shippingStreet', e.target.value)}
                            disabled={form.copyAddressFromBilling}
                            sx={fieldSx}
                        />
                    </FormField>

                    {/* City */}
                    <FormField name="shippingCity" label="City" sx={{ mb: 0 }}>
                        <TextField
                            fullWidth
                            size="small"
                            placeholder="Enter city"
                            value={form.shippingCity || ''}
                            onChange={(e) => set('shippingCity', e.target.value)}
                            disabled={form.copyAddressFromBilling}
                            sx={fieldSx}
                        />
                    </FormField>

                    {/* State/Region */}
                    <FormField name="shippingState" label="State/Region" sx={{ mb: 0 }}>
                        <StyledSelect
                            label="State/Region"
                            placeholder="Select State/Region"
                            value={form.shippingState || ''}
                            onChange={(v) => set('shippingState', v)}
                            options={INDIAN_STATES}
                            disabled={Boolean(form.copyAddressFromBilling)}
                        />
                    </FormField>

                    {/* Postal Code */}
                    <FormField name="shippingPostalCode" label="Postal Code" sx={{ mb: 0 }}>
                        <TextField
                            fullWidth
                            size="small"
                            placeholder="Enter postal code"
                            value={form.shippingPostalCode || ''}
                            onChange={(e) => set('shippingPostalCode', e.target.value)}
                            disabled={form.copyAddressFromBilling}
                            sx={fieldSx}
                        />
                    </FormField>

                    {/* Country */}
                    <FormField name="shippingCountry" label="Country" sx={{ mb: 0 }}>
                        <StyledSelect
                            label="Country"
                            placeholder="Select Country"
                            value={form.shippingCountry || 'India'}
                            onChange={(v) => set('shippingCountry', v)}
                            options={COUNTRIES}
                            disabled={Boolean(form.copyAddressFromBilling)}
                        />
                    </FormField>

                    {/* Longitude */}
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

