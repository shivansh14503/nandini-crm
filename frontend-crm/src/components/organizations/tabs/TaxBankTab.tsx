'use client';

import React from 'react';
import {
    Box,
    TextField,
} from '@mui/material';

// Icons
import AccountBalanceOutlinedIcon from '@mui/icons-material/AccountBalanceOutlined';
import ReceiptLongOutlinedIcon from '@mui/icons-material/ReceiptLongOutlined';

import { useFormContext, useWatch, FormProvider, useForm } from 'react-hook-form';

import {
    FormField,
    SectionLabel,
    StyledSelect,
    fieldSx,
    RhfSelect,
    RhfTextField,
} from '@/components/forms';
import { REGISTRATION_TYPES, ACCOUNT_TYPES } from '@/config/constants';
import type { OrganizationFormData } from '@/types/organization.types';

export interface TaxBankTabProps {
    form: OrganizationFormData;
    set: <K extends keyof OrganizationFormData>(key: K, value: OrganizationFormData[K]) => void;
}

function TaxBankTabInner({ form, set }: TaxBankTabProps) {
    const { control, setValue } = useFormContext<OrganizationFormData>();
    const registrationType = (useWatch({ control, name: 'registrationType' }) ?? form?.registrationType ?? 'Registered') as 'Registered' | 'Unregistered';
    const gstNo = useWatch({ control, name: 'gstNo' }) ?? form?.gstNo ?? form?.gstNumber ?? '';

    // Synchronize registrationType changes
    React.useEffect(() => {
        if (set && registrationType) {
            set('registrationType', registrationType);
        }
        if (registrationType === 'Unregistered') {
            setValue('gstNo', '', { shouldValidate: true });
            if (set) {
                set('gstNo', '');
                set('gstNumber', '');
            }
        }
    }, [registrationType, setValue, set]);

    // Synchronize gstNo changes with external set callback if provided
    React.useEffect(() => {
        if (set && gstNo !== undefined) {
            set('gstNo', gstNo);
            set('gstNumber', gstNo);
        }
    }, [gstNo, set]);

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
                    <RhfSelect<OrganizationFormData>
                        name="registrationType"
                        label="Registration Type"
                        options={['Registered', 'Unregistered']}
                        required
                        placeholder="Select Registration Type"
                    />

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
                    {registrationType === 'Registered' && (
                        <RhfTextField<OrganizationFormData>
                            name="gstNo"
                            label="GST Number"
                            required={registrationType === 'Registered'}
                            hint="15-character GSTIN"
                            placeholder="e.g. 06AFZFS3757G1Z9"
                            slotProps={{ htmlInput: { maxLength: 15 } }}
                        />
                    )}

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

function FallbackTaxBankProvider({
    children,
    defaultValues,
}: {
    children: React.ReactNode;
    defaultValues?: OrganizationFormData;
}) {
    const methods = useForm<OrganizationFormData>({
        defaultValues: {
            registrationType: (defaultValues?.registrationType as 'Registered' | 'Unregistered') || 'Registered',
            gstNo: defaultValues?.gstNo || defaultValues?.gstNumber || '',
            ...defaultValues,
        },
    });
    return <FormProvider {...methods}>{children}</FormProvider>;
}

export function TaxBankTab(props: TaxBankTabProps) {
    const existing = useFormContext<OrganizationFormData>();
    if (existing) {
        return <TaxBankTabInner {...props} />;
    }
    return (
        <FallbackTaxBankProvider defaultValues={props.form}>
            <TaxBankTabInner {...props} />
        </FallbackTaxBankProvider>
    );
}

