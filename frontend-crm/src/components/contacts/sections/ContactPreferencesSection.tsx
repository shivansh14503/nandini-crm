'use client';

import React from 'react';
import { Box, Checkbox, Chip, FormControlLabel, Grid, TextField, Typography } from '@mui/material';
import { FormField, fieldSx } from '../../forms';
import { COMMUNICATION_TYPES } from '../../../types/contact.types';

export interface ContactPreferencesSectionProps {
    communicationType: string[];
    doNotCall: boolean;
    description: string;
    onToggleCommunicationType: (type: string) => void;
    onDoNotCallChange: (checked: boolean) => void;
    onDescriptionChange: (value: string) => void;
}

/**
 * Modular section for communication channel preferences, compliance (DND), and rich notes.
 * Self-contained responsive layout with 2-column preferences and full-width description.
 */
export function ContactPreferencesSection({
    communicationType,
    doNotCall,
    description,
    onToggleCommunicationType,
    onDoNotCallChange,
    onDescriptionChange,
}: ContactPreferencesSectionProps) {
    return (
        <Grid container spacing={3.5}>
            {/* Left: Communication Channel Badges */}
            <Grid size={{ xs: 12, md: 6 }}>
                <FormField label="Communication Type" hint="Select preferred channels">
                    <Box
                        sx={{
                            border: '1px solid #d1d5db',
                            borderRadius: '8px',
                            p: 1.5,
                            backgroundColor: '#fff',
                            display: 'flex',
                            flexWrap: 'wrap',
                            gap: 1,
                        }}
                    >
                        {COMMUNICATION_TYPES.map((type) => {
                            const isSelected = communicationType?.includes(type);
                            return (
                                <Chip
                                    key={type}
                                    label={type}
                                    onClick={() => onToggleCommunicationType(type)}
                                    variant={isSelected ? 'filled' : 'outlined'}
                                    sx={{
                                        fontSize: '0.78rem',
                                        fontWeight: 600,
                                        cursor: 'pointer',
                                        backgroundColor: isSelected ? '#eff6ff' : 'transparent',
                                        color: isSelected ? '#1d4ed8' : '#64748b',
                                        borderColor: isSelected ? '#93c5fd' : '#cbd5e1',
                                        '&:hover': {
                                            backgroundColor: isSelected ? '#dbeafe' : '#f8fafc',
                                        },
                                    }}
                                />
                            );
                        })}
                    </Box>
                </FormField>
            </Grid>

            {/* Right: Do Not Call (DND) Checkbox */}
            <Grid size={{ xs: 12, md: 6 }}>
                <Box sx={{ mb: 2, pt: { xs: 0, md: 3 } }}>
                    <FormControlLabel
                        control={
                            <Checkbox
                                size="small"
                                checked={doNotCall}
                                onChange={(e) => onDoNotCallChange(e.target.checked)}
                                sx={{ color: '#ef4444', '&.Mui-checked': { color: '#ef4444' } }}
                            />
                        }
                        label={
                            <Typography sx={{ fontSize: '0.84rem', fontWeight: 600, color: '#374151' }}>
                                Do Not Call (DND)
                            </Typography>
                        }
                    />
                </Box>
            </Grid>

            {/* Full Width: Notes & Background Description */}
            <Grid size={{ xs: 12 }}>
                <FormField label="Add Description">
                    <TextField
                        fullWidth
                        multiline
                        rows={3}
                        placeholder="Enter additional contact details, background, notes, or special instructions..."
                        value={description}
                        onChange={(e) => onDescriptionChange(e.target.value)}
                        sx={fieldSx}
                    />
                </FormField>
            </Grid>
        </Grid>
    );
}
