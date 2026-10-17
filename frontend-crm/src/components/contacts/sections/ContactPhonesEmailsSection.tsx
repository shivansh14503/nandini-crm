'use client';

import React from 'react';
import { Box, Button, Grid, TextField, Typography } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import { FormField, EmailRow, fieldSx } from '../../forms';
import type { CorporateEmail } from '../../../types/organization.types';

export interface ContactPhonesEmailsSectionProps {
    phone3: string;
    phone4: string;
    phone5: string;
    emailAddresses: CorporateEmail[];
    onPhone3Change: (value: string) => void;
    onPhone4Change: (value: string) => void;
    onPhone5Change: (value: string) => void;
    onAddEmail: () => void;
    onUpdateEmail: (id: string, updated: CorporateEmail) => void;
    onRemoveEmail: (id: string) => void;
}

/**
 * Modular section for multiple phone numbers and email addresses with verification.
 * Self-contained responsive 2-column grid layout.
 */
export function ContactPhonesEmailsSection({
    phone3,
    phone4,
    phone5,
    emailAddresses,
    onPhone3Change,
    onPhone4Change,
    onPhone5Change,
    onAddEmail,
    onUpdateEmail,
    onRemoveEmail,
}: ContactPhonesEmailsSectionProps) {
    return (
        <Grid container spacing={3.5}>
            {/* Left Column: Phone 3 & Phone 5 */}
            <Grid size={{ xs: 12, md: 6 }}>
                <FormField label="Phone 3">
                    <TextField
                        fullWidth
                        size="small"
                        placeholder="Alternate phone number"
                        value={phone3}
                        onChange={(e) => onPhone3Change(e.target.value)}
                        sx={fieldSx}
                    />
                </FormField>

                <FormField label="Phone 5">
                    <TextField
                        fullWidth
                        size="small"
                        placeholder="Other contact number"
                        value={phone5}
                        onChange={(e) => onPhone5Change(e.target.value)}
                        sx={fieldSx}
                    />
                </FormField>
            </Grid>

            {/* Right Column: Phone 4 & Email Addresses */}
            <Grid size={{ xs: 12, md: 6 }}>
                <FormField label="Phone 4">
                    <TextField
                        fullWidth
                        size="small"
                        placeholder="Direct extension phone"
                        value={phone4}
                        onChange={(e) => onPhone4Change(e.target.value)}
                        sx={fieldSx}
                    />
                </FormField>

                <FormField label="Email Address" required>
                    <Box>
                        <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 1 }}>
                            <Button
                                size="small"
                                variant="outlined"
                                startIcon={<AddIcon sx={{ fontSize: 15 }} />}
                                onClick={onAddEmail}
                                sx={{
                                    fontSize: '0.74rem',
                                    textTransform: 'none',
                                    fontWeight: 600,
                                    borderRadius: '6px',
                                    borderColor: '#cbd5e1',
                                    color: '#1d4ed8',
                                    backgroundColor: '#eff6ff',
                                    height: 28,
                                    px: 1.2,
                                    '&:hover': {
                                        borderColor: '#93c5fd',
                                        backgroundColor: '#dbeafe',
                                    },
                                }}
                            >
                                Add Email
                            </Button>
                        </Box>

                        {emailAddresses.length === 0 ? (
                            <Box
                                sx={{
                                    border: '1px dashed #cbd5e1',
                                    borderRadius: '8px',
                                    p: 2,
                                    textAlign: 'center',
                                    backgroundColor: '#f8fafc',
                                }}
                            >
                                <Typography variant="body2" sx={{ color: '#94a3b8', fontSize: '0.8rem' }}>
                                    No email addresses added yet. Click &quot;Add Email&quot; to configure.
                                </Typography>
                            </Box>
                        ) : (
                            emailAddresses.map((email) => (
                                <EmailRow
                                    key={email.id}
                                    email={email}
                                    onChange={(updated) => onUpdateEmail(email.id, updated)}
                                    onRemove={() => onRemoveEmail(email.id)}
                                />
                            ))
                        )}
                    </Box>
                </FormField>
            </Grid>
        </Grid>
    );
}
