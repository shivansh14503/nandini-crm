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
    FIELD_MAX_LENGTH,
    FormField,
    FormGrid,
    SectionLabel,
    StyledSelect,
    fieldSx,
    RhfSelect,
    RhfUppercaseField,
} from '@/components/forms';
import { ACCOUNT_TYPES } from '@/config/constants';
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
        <Box sx={{ p: { xs: 2.5, md: 3.5 }, display: 'flex', flexDirection: 'column', gap: 3.5 }}>
            {/* ── Tax identifiers: short, fixed-length codes sit three to a row ── */}
            <Box>
                <SectionLabel
                    icon={<ReceiptLongOutlinedIcon sx={{ fontSize: 18 }} />}
                    label="Tax Identification & Compliance"
                    sx={{ mb: 2 }}
                />
                <FormGrid columns={3}>
                    <RhfSelect<OrganizationFormData>
                        name="registrationType"
                        label="Registration Type"
                        options={['Registered', 'Unregistered']}
                        required
                        placeholder="Select Registration Type"
                    />

                    {registrationType === 'Registered' && (
                        <RhfUppercaseField<OrganizationFormData>
                            name="gstNo"
                            label="GST Number"
                            required={registrationType === 'Registered'}
                            hint="15-character GSTIN"
                            placeholder="e.g. 06AFZFS3757G1Z9"
                            maxLength={FIELD_MAX_LENGTH.gstin}
                        />
                    )}

                    <RhfUppercaseField<OrganizationFormData>
                        name="panNumber"
                        label="PAN Number"
                        hint="10-character PAN"
                        placeholder="e.g. ABCDE1234F"
                        maxLength={FIELD_MAX_LENGTH.pan}
                        onChange={(e) => set('panNumber', e.target.value)}
                    />

                    <RhfUppercaseField<OrganizationFormData>
                        name="tanNumber"
                        label="TAN Number"
                        hint="Tax Deduction Account"
                        placeholder="e.g. DELM12345E"
                        maxLength={FIELD_MAX_LENGTH.tan}
                        onChange={(e) => set('tanNumber', e.target.value)}
                    />

                    <RhfUppercaseField<OrganizationFormData>
                        name="cinNo"
                        label="CIN No"
                        hint="Corporate Identification No."
                        placeholder="e.g. U74999DL2020PTC123456"
                        maxLength={FIELD_MAX_LENGTH.cin}
                        onChange={(e) => set('cinNo', e.target.value)}
                    />

                    <RhfUppercaseField<OrganizationFormData>
                        name="msmeRegnNumber"
                        label="MSME Regn. Number"
                        hint="Udyam Registration"
                        placeholder="e.g. UDYAM-DL-01-0012345"
                        maxLength={FIELD_MAX_LENGTH.msme}
                        onChange={(e) => set('msmeRegnNumber', e.target.value)}
                    />
                </FormGrid>
            </Box>

            {/* ── Bank account ── */}
            <Box>
                <SectionLabel
                    icon={<AccountBalanceOutlinedIcon sx={{ fontSize: 18 }} />}
                    label="Bank Account Details"
                    sx={{ mb: 2 }}
                />
                <FormGrid columns={3}>
                    <FormField name="accountName" label="Account Name" size="lg">
                        <TextField
                            fullWidth
                            size="small"
                            placeholder="e.g. Mohit Traders Pvt Ltd"
                            value={form.accountName || ''}
                            onChange={(e) => set('accountName', e.target.value)}
                            sx={fieldSx}
                            slotProps={{ htmlInput: { maxLength: FIELD_MAX_LENGTH.organizationName } }}
                        />
                    </FormField>

                    <FormField name="bankName" label="Bank Name" size="md">
                        <TextField
                            fullWidth
                            size="small"
                            placeholder="e.g. HDFC Bank, ICICI Bank, SBI"
                            value={form.bankName || ''}
                            onChange={(e) => set('bankName', e.target.value)}
                            sx={fieldSx}
                            slotProps={{ htmlInput: { maxLength: FIELD_MAX_LENGTH.personName } }}
                        />
                    </FormField>

                    <FormField name="typeOfAccount" label="Type Of Account" size="sm">
                        <StyledSelect
                            label="Type Of Account"
                            placeholder="Select Type"
                            value={form.typeOfAccount || ''}
                            onChange={(v) => set('typeOfAccount', v)}
                            options={ACCOUNT_TYPES}
                        />
                    </FormField>

                    <FormField name="accountNumber" label="Account Number" size="md">
                        <TextField
                            fullWidth
                            size="small"
                            placeholder="e.g. 50200012345678"
                            value={form.accountNumber || ''}
                            onChange={(e) => set('accountNumber', e.target.value)}
                            sx={fieldSx}
                            slotProps={{ htmlInput: { maxLength: FIELD_MAX_LENGTH.bankAccount, inputMode: 'numeric' } }}
                        />
                    </FormField>

                    <RhfUppercaseField<OrganizationFormData>
                        name="bankIfscCode"
                        label="Bank IFSC Code"
                        hint="11-character code"
                        placeholder="e.g. HDFC0001234"
                        maxLength={FIELD_MAX_LENGTH.ifsc}
                        onChange={(e) => set('bankIfscCode', e.target.value)}
                    />

                    <FormField name="bankAddress" label="Bank Address" size="lg">
                        <TextField
                            fullWidth
                            size="small"
                            placeholder="e.g. Connaught Place Branch, New Delhi - 110001"
                            value={form.bankAddress || ''}
                            onChange={(e) => set('bankAddress', e.target.value)}
                            sx={fieldSx}
                            slotProps={{ htmlInput: { maxLength: FIELD_MAX_LENGTH.address } }}
                        />
                    </FormField>
                </FormGrid>
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

