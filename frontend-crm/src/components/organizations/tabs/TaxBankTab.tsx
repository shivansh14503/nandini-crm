'use client';

import React from 'react';
import {
    Box,
    TextField,
} from '@mui/material';

// Icons
import AccountBalanceOutlinedIcon from '@mui/icons-material/AccountBalanceOutlined';
import ReceiptLongOutlinedIcon from '@mui/icons-material/ReceiptLongOutlined';

import {
    FormField,
    SectionLabel,
    StyledSelect,
    fieldSx,
} from '@/components/forms';
import { REGISTRATION_TYPES, ACCOUNT_TYPES } from '@/config/constants';
import type { OrganizationFormData } from '@/types/organization.types';

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
                    <FormField label="Registration Type" required sx={{ mb: 0 }}>
                        <StyledSelect
                            label="Registration Type"
                            placeholder="Select Registration Type"
                            value={form.registrationType || 'Registered'}
                            onChange={(v) => set('registrationType', v)}
                            options={REGISTRATION_TYPES}
                            required
                        />
                    </FormField>

                    {/* PAN Number */}
                    <FormField
                        label="PAN Number"
                        hint="10-digit Permanent Account Number"
                        sx={{ mb: 0 }}
                    >
                        <TextField
                            fullWidth
                            size="small"
                            placeholder="e.g. ABCDE1234F"
                            value={form.panNumber || ''}
                            onChange={(e) => set('panNumber', e.target.value.toUpperCase())}
                            slotProps={{ htmlInput: { maxLength: 10 } }}
                            sx={fieldSx}
                        />
                    </FormField>

                    {/* MSME Regn. Number */}
                    <FormField
                        label="MSME Regn.Number"
                        hint="Udyam Registration"
                        sx={{ mb: 0 }}
                    >
                        <TextField
                            fullWidth
                            size="small"
                            placeholder="e.g. UDYAM-DL-01-0012345"
                            value={form.msmeRegnNumber || ''}
                            onChange={(e) => set('msmeRegnNumber', e.target.value.toUpperCase())}
                            sx={fieldSx}
                        />
                    </FormField>

                    {/* Account Name */}
                    <FormField label="Account Name" sx={{ mb: 0 }}>
                        <TextField
                            fullWidth
                            size="small"
                            placeholder="e.g. Mohit Traders Pvt Ltd"
                            value={form.accountName || ''}
                            onChange={(e) => set('accountName', e.target.value)}
                            sx={fieldSx}
                        />
                    </FormField>

                    {/* Bank Name */}
                    <FormField label="Bank Name" sx={{ mb: 0 }}>
                        <TextField
                            fullWidth
                            size="small"
                            placeholder="e.g. HDFC Bank, ICICI Bank, SBI"
                            value={form.bankName || ''}
                            onChange={(e) => set('bankName', e.target.value)}
                            sx={fieldSx}
                        />
                    </FormField>

                    {/* Bank IFSC Code */}
                    <FormField label="Bank IFSC Code" hint="11-character code" sx={{ mb: 0 }}>
                        <TextField
                            fullWidth
                            size="small"
                            placeholder="e.g. HDFC0001234"
                            value={form.bankIfscCode || ''}
                            onChange={(e) => set('bankIfscCode', e.target.value.toUpperCase())}
                            slotProps={{ htmlInput: { maxLength: 11 } }}
                            sx={fieldSx}
                        />
                    </FormField>
                </Box>

                {/* ── RIGHT COLUMN: Tax & Bank Right ────────────────── */}
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
                    <SectionLabel
                        icon={<AccountBalanceOutlinedIcon sx={{ fontSize: 18 }} />}
                        label="Compliance & Account Details (Part II)"
                    />

                    {/* GST Number */}
                    <FormField
                        label="GST Number"
                        required
                        hint="15-character GSTIN"
                        sx={{ mb: 0 }}
                    >
                        <TextField
                            fullWidth
                            size="small"
                            placeholder="e.g. 06AFZFS3757G1Z9"
                            value={form.gstNumber || ''}
                            onChange={(e) => set('gstNumber', e.target.value.toUpperCase())}
                            slotProps={{ htmlInput: { maxLength: 15 } }}
                            sx={fieldSx}
                        />
                    </FormField>

                    {/* CIN No */}
                    <FormField
                        label="CIN No"
                        hint="Corporate Identification Number"
                        sx={{ mb: 0 }}
                    >
                        <TextField
                            fullWidth
                            size="small"
                            placeholder="e.g. U74999DL2020PTC123456"
                            value={form.cinNo || ''}
                            onChange={(e) => set('cinNo', e.target.value.toUpperCase())}
                            slotProps={{ htmlInput: { maxLength: 21 } }}
                            sx={fieldSx}
                        />
                    </FormField>

                    {/* TAN Number */}
                    <FormField
                        label="TAN Number"
                        hint="Tax Deduction & Collection Account"
                        sx={{ mb: 0 }}
                    >
                        <TextField
                            fullWidth
                            size="small"
                            placeholder="e.g. DELM12345E"
                            value={form.tanNumber || ''}
                            onChange={(e) => set('tanNumber', e.target.value.toUpperCase())}
                            slotProps={{ htmlInput: { maxLength: 10 } }}
                            sx={fieldSx}
                        />
                    </FormField>

                    {/* Account Number */}
                    <FormField label="Account Number" sx={{ mb: 0 }}>
                        <TextField
                            fullWidth
                            size="small"
                            placeholder="e.g. 50200012345678"
                            value={form.accountNumber || ''}
                            onChange={(e) => set('accountNumber', e.target.value)}
                            sx={fieldSx}
                        />
                    </FormField>

                    {/* Type Of Account */}
                    <FormField label="Type Of Account" sx={{ mb: 0 }}>
                        <StyledSelect
                            label="Type Of Account"
                            placeholder="Select Type Of Account"
                            value={form.typeOfAccount || ''}
                            onChange={(v) => set('typeOfAccount', v)}
                            options={ACCOUNT_TYPES}
                        />
                    </FormField>

                    {/* Bank Address */}
                    <FormField label="Bank Address" sx={{ mb: 0 }}>
                        <TextField
                            fullWidth
                            size="small"
                            placeholder="e.g. Connaught Place Branch, New Delhi - 110001"
                            value={form.bankAddress || ''}
                            onChange={(e) => set('bankAddress', e.target.value)}
                            sx={fieldSx}
                        />
                    </FormField>
                </Box>
            </Box>
        </Box>
    );
}

