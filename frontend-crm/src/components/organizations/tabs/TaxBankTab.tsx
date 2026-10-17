'use client';

import React from 'react';
import {
    Box,
    Typography,
    TextField,
} from '@mui/material';

// Icons
import AccountBalanceOutlinedIcon from '@mui/icons-material/AccountBalanceOutlined';
import ReceiptLongOutlinedIcon from '@mui/icons-material/ReceiptLongOutlined';

import { SectionLabel } from '../shared/SectionLabel';
import { StyledSelect } from '../shared/StyledSelect';
import { REGISTRATION_TYPES, ACCOUNT_TYPES, fieldSx } from '../shared/constants';
import type { OrganizationFormData } from '../../../types/organization.types';

export interface TaxBankTabProps {
    form: OrganizationFormData;
    set: <K extends keyof OrganizationFormData>(key: K, value: OrganizationFormData[K]) => void;
}

export function TaxBankTab({ form, set }: TaxBankTabProps) {
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
                {/* ── LEFT COLUMN: Tax & Bank Left ─────────────────── */}
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
                    <SectionLabel
                        icon={<ReceiptLongOutlinedIcon sx={{ fontSize: 18 }} />}
                        label="Tax Identification & Banking (Part I)"
                    />

                    {/* Registration Type */}
                    <Box>
                        <Typography
                            variant="body2"
                            sx={{ fontWeight: 600, color: '#374151', fontSize: '0.82rem', mb: 0.6 }}
                        >
                            Registration Type <span style={{ color: '#ef4444' }}>*</span>
                        </Typography>
                        <StyledSelect
                            label="Registration Type"
                            placeholder="Select Registration Type"
                            value={form.registrationType || 'Registered'}
                            onChange={(v) => set('registrationType', v)}
                            options={REGISTRATION_TYPES}
                            required
                        />
                    </Box>

                    {/* PAN Number */}
                    <Box>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.6 }}>
                            <Typography
                                variant="body2"
                                sx={{ fontWeight: 600, color: '#374151', fontSize: '0.82rem' }}
                            >
                                PAN Number
                            </Typography>
                            <Typography variant="caption" sx={{ color: '#9ca3af', fontSize: '0.72rem' }}>
                                10-digit Permanent Account Number
                            </Typography>
                        </Box>
                        <TextField
                            fullWidth
                            size="small"
                            placeholder="e.g. ABCDE1234F"
                            value={form.panNumber || ''}
                            onChange={(e) => set('panNumber', e.target.value.toUpperCase())}
                            slotProps={{ htmlInput: { maxLength: 10 } }}
                            sx={fieldSx}
                        />
                    </Box>

                    {/* MSME Regn. Number */}
                    <Box>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.6 }}>
                            <Typography
                                variant="body2"
                                sx={{ fontWeight: 600, color: '#374151', fontSize: '0.82rem' }}
                            >
                                MSME Regn.Number
                            </Typography>
                            <Typography variant="caption" sx={{ color: '#9ca3af', fontSize: '0.72rem' }}>
                                Udyam Registration
                            </Typography>
                        </Box>
                        <TextField
                            fullWidth
                            size="small"
                            placeholder="e.g. UDYAM-DL-01-0012345"
                            value={form.msmeRegnNumber || ''}
                            onChange={(e) => set('msmeRegnNumber', e.target.value.toUpperCase())}
                            sx={fieldSx}
                        />
                    </Box>

                    {/* Account Name */}
                    <Box>
                        <Typography
                            variant="body2"
                            sx={{ fontWeight: 600, color: '#374151', fontSize: '0.82rem', mb: 0.6 }}
                        >
                            Account Name
                        </Typography>
                        <TextField
                            fullWidth
                            size="small"
                            placeholder="e.g. Mohit Traders Pvt Ltd"
                            value={form.accountName || ''}
                            onChange={(e) => set('accountName', e.target.value)}
                            sx={fieldSx}
                        />
                    </Box>

                    {/* Bank Name */}
                    <Box>
                        <Typography
                            variant="body2"
                            sx={{ fontWeight: 600, color: '#374151', fontSize: '0.82rem', mb: 0.6 }}
                        >
                            Bank Name
                        </Typography>
                        <TextField
                            fullWidth
                            size="small"
                            placeholder="e.g. HDFC Bank, ICICI Bank, SBI"
                            value={form.bankName || ''}
                            onChange={(e) => set('bankName', e.target.value)}
                            sx={fieldSx}
                        />
                    </Box>

                    {/* Bank IFSC Code */}
                    <Box>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.6 }}>
                            <Typography
                                variant="body2"
                                sx={{ fontWeight: 600, color: '#374151', fontSize: '0.82rem' }}
                            >
                                Bank IFSC Code
                            </Typography>
                            <Typography variant="caption" sx={{ color: '#9ca3af', fontSize: '0.72rem' }}>
                                11-character code
                            </Typography>
                        </Box>
                        <TextField
                            fullWidth
                            size="small"
                            placeholder="e.g. HDFC0001234"
                            value={form.bankIfscCode || ''}
                            onChange={(e) => set('bankIfscCode', e.target.value.toUpperCase())}
                            slotProps={{ htmlInput: { maxLength: 11 } }}
                            sx={fieldSx}
                        />
                    </Box>
                </Box>

                {/* ── RIGHT COLUMN: Tax & Bank Right ────────────────── */}
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
                    <SectionLabel
                        icon={<AccountBalanceOutlinedIcon sx={{ fontSize: 18 }} />}
                        label="Compliance & Account Details (Part II)"
                    />

                    {/* GST Number */}
                    <Box>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.6 }}>
                            <Typography
                                variant="body2"
                                sx={{ fontWeight: 600, color: '#374151', fontSize: '0.82rem' }}
                            >
                                GST Number <span style={{ color: '#ef4444' }}>*</span>
                            </Typography>
                            <Typography variant="caption" sx={{ color: '#9ca3af', fontSize: '0.72rem' }}>
                                15-character GSTIN
                            </Typography>
                        </Box>
                        <TextField
                            fullWidth
                            size="small"
                            placeholder="e.g. 06AFZFS3757G1Z9"
                            value={form.gstNumber || ''}
                            onChange={(e) => set('gstNumber', e.target.value.toUpperCase())}
                            slotProps={{ htmlInput: { maxLength: 15 } }}
                            sx={fieldSx}
                        />
                    </Box>

                    {/* CIN No */}
                    <Box>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.6 }}>
                            <Typography
                                variant="body2"
                                sx={{ fontWeight: 600, color: '#374151', fontSize: '0.82rem' }}
                            >
                                CIN No
                            </Typography>
                            <Typography variant="caption" sx={{ color: '#9ca3af', fontSize: '0.72rem' }}>
                                Corporate Identification Number
                            </Typography>
                        </Box>
                        <TextField
                            fullWidth
                            size="small"
                            placeholder="e.g. U74999DL2020PTC123456"
                            value={form.cinNo || ''}
                            onChange={(e) => set('cinNo', e.target.value.toUpperCase())}
                            slotProps={{ htmlInput: { maxLength: 21 } }}
                            sx={fieldSx}
                        />
                    </Box>

                    {/* TAN Number */}
                    <Box>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.6 }}>
                            <Typography
                                variant="body2"
                                sx={{ fontWeight: 600, color: '#374151', fontSize: '0.82rem' }}
                            >
                                TAN Number
                            </Typography>
                            <Typography variant="caption" sx={{ color: '#9ca3af', fontSize: '0.72rem' }}>
                                Tax Deduction &amp; Collection Account
                            </Typography>
                        </Box>
                        <TextField
                            fullWidth
                            size="small"
                            placeholder="e.g. DELM12345E"
                            value={form.tanNumber || ''}
                            onChange={(e) => set('tanNumber', e.target.value.toUpperCase())}
                            slotProps={{ htmlInput: { maxLength: 10 } }}
                            sx={fieldSx}
                        />
                    </Box>

                    {/* Account Number */}
                    <Box>
                        <Typography
                            variant="body2"
                            sx={{ fontWeight: 600, color: '#374151', fontSize: '0.82rem', mb: 0.6 }}
                        >
                            Account Number
                        </Typography>
                        <TextField
                            fullWidth
                            size="small"
                            placeholder="e.g. 50200012345678"
                            value={form.accountNumber || ''}
                            onChange={(e) => set('accountNumber', e.target.value)}
                            sx={fieldSx}
                        />
                    </Box>

                    {/* Type Of Account */}
                    <Box>
                        <Typography
                            variant="body2"
                            sx={{ fontWeight: 600, color: '#374151', fontSize: '0.82rem', mb: 0.6 }}
                        >
                            Type Of Account
                        </Typography>
                        <StyledSelect
                            label="Type Of Account"
                            placeholder="Select Type Of Account"
                            value={form.typeOfAccount || ''}
                            onChange={(v) => set('typeOfAccount', v)}
                            options={ACCOUNT_TYPES}
                        />
                    </Box>

                    {/* Bank Address */}
                    <Box>
                        <Typography
                            variant="body2"
                            sx={{ fontWeight: 600, color: '#374151', fontSize: '0.82rem', mb: 0.6 }}
                        >
                            Bank Address
                        </Typography>
                        <TextField
                            fullWidth
                            size="small"
                            placeholder="e.g. Connaught Place Branch, New Delhi - 110001"
                            value={form.bankAddress || ''}
                            onChange={(e) => set('bankAddress', e.target.value)}
                            sx={fieldSx}
                        />
                    </Box>
                </Box>
            </Box>
        </Box>
    );
}
