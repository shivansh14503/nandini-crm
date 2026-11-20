'use client';

import React from 'react';
import {
    Box,
} from '@mui/material';
// Raw text inputs show the admin-configured placeholder of the FormField they sit in.
import { ConfiguredTextField as TextField } from '@/components/forms/ConfiguredTextField';

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
import { ACCOUNT_TYPES, REGISTRATION_TYPES, isGstRegistrationType } from '@/config/constants';
import type { OrganizationFormData } from '@/types/organization.types';

export interface TaxBankTabProps {
    form: OrganizationFormData;
    set: <K extends keyof OrganizationFormData>(key: K, value: OrganizationFormData[K]) => void;
}

function TaxBankTabInner({ form, set }: TaxBankTabProps) {
    const { control, setValue } = useFormContext<OrganizationFormData>();
    const registrationType = useWatch({ control, name: 'registrationType' }) ?? form?.registrationType ?? '';
    const gstNumber = useWatch({ control, name: 'gstNumber' }) ?? form?.gstNumber ?? '';

    // Synchronize registrationType changes
    React.useEffect(() => {
        if (set && registrationType) {
            set('registrationType', registrationType);
        }
        // Only 'Registered' / SEZ carry a GSTIN (the API drops it for every other type), so the field hides and clears.
        if (registrationType && !isGstRegistrationType(registrationType)) {
            setValue('gstNumber', '', { shouldValidate: true });
            if (set) {
                set('gstNumber', '');
            }
        }
    }, [registrationType, setValue, set]);

    // Synchronize gstNumber changes with external set callback if provided
    React.useEffect(() => {
        if (set && gstNumber !== undefined) {
            set('gstNumber', gstNumber);
        }
    }, [gstNumber, set]);

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
                        options={REGISTRATION_TYPES}
                        required
                        placeholder="Select Registration Type"
                    />

                    {isGstRegistrationType(registrationType) && (
                        <RhfUppercaseField<OrganizationFormData>
                            name="gstNumber"
                            label="GST Number"
                            required
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

                    <FormField name="accountNo" label="Account No" size="md">
                        <TextField
                            fullWidth
                            size="small"
                            placeholder="e.g. 50200012345678"
                            value={form.accountNo || ''}
                            onChange={(e) => set('accountNo', e.target.value)}
                            sx={fieldSx}
                            slotProps={{ htmlInput: { maxLength: FIELD_MAX_LENGTH.bankAccount, inputMode: 'numeric' } }}
                        />
                    </FormField>

                    <RhfUppercaseField<OrganizationFormData>
                        name="ifscCode"
                        label="IFSC Code"
                        hint="11-character code"
                        placeholder="e.g. HDFC0001234"
                        maxLength={FIELD_MAX_LENGTH.ifsc}
                        onChange={(e) => set('ifscCode', e.target.value)}
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
            registrationType: defaultValues?.registrationType || 'Registered',
            gstNumber: defaultValues?.gstNumber || '',
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

