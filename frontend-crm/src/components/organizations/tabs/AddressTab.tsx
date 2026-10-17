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

import { SectionLabel } from '../shared/SectionLabel';
import { StyledSelect } from '../shared/StyledSelect';
import { INDIAN_STATES, COUNTRIES, fieldSx } from '../shared/constants';
import type { OrganizationFormData } from '../../../types/organization.types';

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
                    <Box>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.6 }}>
                            <Typography
                                variant="body2"
                                sx={{ fontWeight: 600, color: '#374151', fontSize: '0.82rem' }}
                            >
                                Street <span style={{ color: '#ef4444' }}>*</span>
                            </Typography>
                            <Typography variant="caption" sx={{ color: '#9ca3af', fontSize: '0.72rem' }}>
                                Registered office location
                            </Typography>
                        </Box>
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
                    </Box>

                    {/* City */}
                    <Box>
                        <Typography
                            variant="body2"
                            sx={{ fontWeight: 600, color: '#374151', fontSize: '0.82rem', mb: 0.6 }}
                        >
                            City <span style={{ color: '#ef4444' }}>*</span>
                        </Typography>
                        <TextField
                            fullWidth
                            size="small"
                            placeholder="Enter city"
                            value={form.billingCity || ''}
                            onChange={(e) => set('billingCity', e.target.value)}
                            sx={fieldSx}
                        />
                    </Box>

                    {/* State/Region */}
                    <Box>
                        <Typography
                            variant="body2"
                            sx={{ fontWeight: 600, color: '#374151', fontSize: '0.82rem', mb: 0.6 }}
                        >
                            State/Region <span style={{ color: '#ef4444' }}>*</span>
                        </Typography>
                        <StyledSelect
                            label="State/Region"
                            placeholder="Select State/Region"
                            value={form.billingState || ''}
                            onChange={(v) => set('billingState', v)}
                            options={INDIAN_STATES}
                            required
                        />
                    </Box>

                    {/* Postal Code */}
                    <Box>
                        <Typography
                            variant="body2"
                            sx={{ fontWeight: 600, color: '#374151', fontSize: '0.82rem', mb: 0.6 }}
                        >
                            Postal Code <span style={{ color: '#ef4444' }}>*</span>
                        </Typography>
                        <TextField
                            fullWidth
                            size="small"
                            placeholder="Enter postal code"
                            value={form.billingPostalCode || ''}
                            onChange={(e) => set('billingPostalCode', e.target.value)}
                            sx={fieldSx}
                        />
                    </Box>

                    {/* Country */}
                    <Box>
                        <Typography
                            variant="body2"
                            sx={{ fontWeight: 600, color: '#374151', fontSize: '0.82rem', mb: 0.6 }}
                        >
                            Country
                        </Typography>
                        <StyledSelect
                            label="Country"
                            placeholder="Select Country"
                            value={form.billingCountry || 'India'}
                            onChange={(v) => set('billingCountry', v)}
                            options={COUNTRIES}
                        />
                    </Box>

                    {/* Latitude */}
                    <Box>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.6 }}>
                            <Typography
                                variant="body2"
                                sx={{ fontWeight: 600, color: '#374151', fontSize: '0.82rem' }}
                            >
                                Latitude
                            </Typography>
                            <Typography variant="caption" sx={{ color: '#9ca3af', fontSize: '0.72rem' }}>
                                Geo coordinate
                            </Typography>
                        </Box>
                        <TextField
                            fullWidth
                            size="small"
                            placeholder="0.00000000"
                            value={form.billingLatitude ?? '0.00000000'}
                            onChange={(e) => set('billingLatitude', e.target.value)}
                            sx={fieldSx}
                        />
                    </Box>
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
                    </Box>

                    {/* Street */}
                    <Box>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.6 }}>
                            <Typography
                                variant="body2"
                                sx={{ fontWeight: 600, color: '#374151', fontSize: '0.82rem' }}
                            >
                                Street
                            </Typography>
                            <Typography variant="caption" sx={{ color: '#9ca3af', fontSize: '0.72rem' }}>
                                Dispatch &amp; delivery location
                            </Typography>
                        </Box>
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
                    </Box>

                    {/* City */}
                    <Box>
                        <Typography
                            variant="body2"
                            sx={{ fontWeight: 600, color: '#374151', fontSize: '0.82rem', mb: 0.6 }}
                        >
                            City
                        </Typography>
                        <TextField
                            fullWidth
                            size="small"
                            placeholder="Enter city"
                            value={form.shippingCity || ''}
                            onChange={(e) => set('shippingCity', e.target.value)}
                            disabled={form.copyAddressFromBilling}
                            sx={fieldSx}
                        />
                    </Box>

                    {/* State/Region */}
                    <Box>
                        <Typography
                            variant="body2"
                            sx={{ fontWeight: 600, color: '#374151', fontSize: '0.82rem', mb: 0.6 }}
                        >
                            State/Region
                        </Typography>
                        <StyledSelect
                            label="State/Region"
                            placeholder="Select State/Region"
                            value={form.shippingState || ''}
                            onChange={(v) => set('shippingState', v)}
                            options={INDIAN_STATES}
                        />
                    </Box>

                    {/* Postal Code */}
                    <Box>
                        <Typography
                            variant="body2"
                            sx={{ fontWeight: 600, color: '#374151', fontSize: '0.82rem', mb: 0.6 }}
                        >
                            Postal Code
                        </Typography>
                        <TextField
                            fullWidth
                            size="small"
                            placeholder="Enter postal code"
                            value={form.shippingPostalCode || ''}
                            onChange={(e) => set('shippingPostalCode', e.target.value)}
                            disabled={form.copyAddressFromBilling}
                            sx={fieldSx}
                        />
                    </Box>

                    {/* Country */}
                    <Box>
                        <Typography
                            variant="body2"
                            sx={{ fontWeight: 600, color: '#374151', fontSize: '0.82rem', mb: 0.6 }}
                        >
                            Country
                        </Typography>
                        <StyledSelect
                            label="Country"
                            placeholder="Select Country"
                            value={form.shippingCountry || 'India'}
                            onChange={(v) => set('shippingCountry', v)}
                            options={COUNTRIES}
                        />
                    </Box>

                    {/* Longitude */}
                    <Box>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.6 }}>
                            <Typography
                                variant="body2"
                                sx={{ fontWeight: 600, color: '#374151', fontSize: '0.82rem' }}
                            >
                                Longitude
                            </Typography>
                            <Typography variant="caption" sx={{ color: '#9ca3af', fontSize: '0.72rem' }}>
                                Geo coordinate
                            </Typography>
                        </Box>
                        <TextField
                            fullWidth
                            size="small"
                            placeholder="0.00000000"
                            value={form.shippingLongitude ?? '0.00000000'}
                            onChange={(e) => set('shippingLongitude', e.target.value)}
                            sx={fieldSx}
                        />
                    </Box>
                </Box>
            </Box>
        </Box>
    );
}
