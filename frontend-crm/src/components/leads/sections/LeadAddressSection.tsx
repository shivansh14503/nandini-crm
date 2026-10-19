'use client';

import React from 'react';
import {
    Box,
    TextField,
    Typography,
    FormControlLabel,
    Checkbox,
} from '@mui/material';
import PlaceOutlinedIcon from '@mui/icons-material/PlaceOutlined';
import BusinessOutlinedIcon from '@mui/icons-material/BusinessOutlined';

import {
    FormField,
    StyledSelect,
    SectionLabel,
    fieldSx,
} from '../../forms';
import { INDIAN_STATES, COUNTRIES } from '../../organizations/shared/constants';
import type { LeadFormData } from '../../../types/lead.types';

export interface LeadAddressSectionProps {
    form: LeadFormData;
    setField: <K extends keyof LeadFormData>(key: K, value: LeadFormData[K]) => void;
}

export function LeadAddressSection({ form, setField }: LeadAddressSectionProps) {
    const handleCopyToggle = (checked: boolean) => {
        setField('copyAddressFromLeft', checked);
        if (checked) {
            setField('otherAddress', form.primaryAddress || '');
            setField('otherCity', form.primaryCity || '');
            setField('otherState', form.primaryState || '');
            setField('otherPostalCode', form.primaryPostalCode || '');
            setField('otherCountry', form.primaryCountry || 'India');
        }
    };

    return (
        <Box sx={{ p: { xs: 2.5, md: 3.5 } }}>
            {/* Two-column layout for Primary Address & Other Address */}
            <Box
                sx={{
                    display: 'grid',
                    gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' },
                    gap: { xs: 3, md: 4 },
                }}
            >
                {/* ════════════ LEFT COLUMN: PRIMARY ADDRESS ════════════ */}
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <SectionLabel
                        icon={<PlaceOutlinedIcon sx={{ fontSize: 18, color: '#2563eb' }} />}
                        label="PRIMARY ADDRESS"
                        sx={{ mb: 1 }}
                    />

                    {/* Address (textarea) */}
                    <FormField label="Address" hint="Registered or primary premises">
                        <TextField
                            fullWidth
                            multiline
                            minRows={3}
                            maxRows={4}
                            size="small"
                            placeholder="Enter a location"
                            value={form.primaryAddress || ''}
                            onChange={(e) => {
                                const val = e.target.value;
                                setField('primaryAddress', val);
                                if (form.copyAddressFromLeft) {
                                    setField('otherAddress', val);
                                }
                            }}
                            sx={fieldSx}
                        />
                    </FormField>

                    {/* City */}
                    <FormField label="City">
                        <TextField
                            fullWidth
                            size="small"
                            placeholder="e.g. Gurugram / New Delhi"
                            value={form.primaryCity || ''}
                            onChange={(e) => {
                                const val = e.target.value;
                                setField('primaryCity', val);
                                if (form.copyAddressFromLeft) {
                                    setField('otherCity', val);
                                }
                            }}
                            sx={fieldSx}
                        />
                    </FormField>

                    {/* State/Region */}
                    <FormField label="State/Region">
                        <StyledSelect
                            value={form.primaryState || ''}
                            onChange={(v) => {
                                setField('primaryState', v);
                                if (form.copyAddressFromLeft) {
                                    setField('otherState', v);
                                }
                            }}
                            options={INDIAN_STATES}
                            placeholder="Select State / Region"
                        />
                    </FormField>

                    {/* Postal Code */}
                    <FormField label="Postal Code">
                        <TextField
                            fullWidth
                            size="small"
                            placeholder="e.g. 110001"
                            value={form.primaryPostalCode || ''}
                            onChange={(e) => {
                                const val = e.target.value;
                                setField('primaryPostalCode', val);
                                if (form.copyAddressFromLeft) {
                                    setField('otherPostalCode', val);
                                }
                            }}
                            sx={fieldSx}
                        />
                    </FormField>

                    {/* Country */}
                    <FormField label="Country">
                        <StyledSelect
                            value={form.primaryCountry || 'India'}
                            onChange={(v) => {
                                setField('primaryCountry', v);
                                if (form.copyAddressFromLeft) {
                                    setField('otherCountry', v);
                                }
                            }}
                            options={COUNTRIES}
                            placeholder="Select Country"
                        />
                    </FormField>

                    {/* Latitude */}
                    <FormField label="Latitude" hint="GPS coordinate">
                        <TextField
                            fullWidth
                            size="small"
                            placeholder="0.00000000"
                            value={form.primaryLatitude ?? '0.00000000'}
                            onChange={(e) => setField('primaryLatitude', e.target.value)}
                            sx={fieldSx}
                        />
                    </FormField>
                </Box>

                {/* ════════════ RIGHT COLUMN: OTHER ADDRESS ════════════ */}
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <Box
                        sx={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            flexWrap: 'wrap',
                            gap: 1,
                            mb: 1,
                        }}
                    >
                        <SectionLabel
                            icon={<BusinessOutlinedIcon sx={{ fontSize: 18, color: '#64748b' }} />}
                            label="OTHER ADDRESS"
                        />
                        <FormControlLabel
                            control={
                                <Checkbox
                                    size="small"
                                    checked={Boolean(form.copyAddressFromLeft)}
                                    onChange={(e) => handleCopyToggle(e.target.checked)}
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

                    {/* Other Address */}
                    <FormField label="Other Address" hint="Branch, factory, or dispatch location">
                        <TextField
                            fullWidth
                            multiline
                            minRows={3}
                            maxRows={4}
                            size="small"
                            placeholder="Enter branch or factory location"
                            value={form.otherAddress || ''}
                            onChange={(e) => setField('otherAddress', e.target.value)}
                            disabled={form.copyAddressFromLeft}
                            sx={fieldSx}
                        />
                    </FormField>

                    {/* City */}
                    <FormField label="City">
                        <TextField
                            fullWidth
                            size="small"
                            placeholder="Enter city"
                            value={form.otherCity || ''}
                            onChange={(e) => setField('otherCity', e.target.value)}
                            disabled={form.copyAddressFromLeft}
                            sx={fieldSx}
                        />
                    </FormField>

                    {/* State/Region */}
                    <FormField label="State/Region">
                        <StyledSelect
                            value={form.otherState || ''}
                            onChange={(v) => setField('otherState', v)}
                            options={INDIAN_STATES}
                            placeholder="Select State / Region"
                        />
                    </FormField>

                    {/* Postal Code */}
                    <FormField label="Postal Code">
                        <TextField
                            fullWidth
                            size="small"
                            placeholder="Enter PIN code"
                            value={form.otherPostalCode || ''}
                            onChange={(e) => setField('otherPostalCode', e.target.value)}
                            disabled={form.copyAddressFromLeft}
                            sx={fieldSx}
                        />
                    </FormField>

                    {/* Country */}
                    <FormField label="Country">
                        <StyledSelect
                            value={form.otherCountry || 'India'}
                            onChange={(v) => setField('otherCountry', v)}
                            options={COUNTRIES}
                            placeholder="Select Country"
                        />
                    </FormField>

                    {/* Longitude */}
                    <FormField label="Longitude" hint="GPS coordinate">
                        <TextField
                            fullWidth
                            size="small"
                            placeholder="0.00000000"
                            value={form.otherLongitude ?? '0.00000000'}
                            onChange={(e) => setField('otherLongitude', e.target.value)}
                            sx={fieldSx}
                        />
                    </FormField>
                </Box>
            </Box>
        </Box>
    );
}
