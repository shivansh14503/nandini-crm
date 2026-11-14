'use client';

import React, { useState } from 'react';
import {
    Drawer,
    Box,
    Typography,
    IconButton,
    TextField,
    Button,
    CircularProgress,
    Alert,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import AddIcon from '@mui/icons-material/Add';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import CheckCircleOutlinedIcon from '@mui/icons-material/CheckCircleOutlined';

import {
    FIELD_MAX_LENGTH,
    FormField,
    FormGrid,
    FormGridItem,
    StyledSelect,
    StateRegionField,
    CityAutocompleteField,
    fieldSx,
} from '@/components/forms';
import { FormModeProvider } from '@/context/FormModeContext';
import { DEFAULT_COUNTRY_CODE } from '@/data/addressMaster';
import { NATURE_OF_BUSINESS, CUSTOMER_TYPES } from './constants';
import type { ExtendedOrganization } from '@/types/organization.types';
import { useDropdownOptionsGetter } from '@/hooks/queries/useFormConfigs';
import { OrganizationNameAutocomplete } from './OrganizationNameAutocomplete';
import { useOrganizationNameCheck } from './useOrganizationNameCheck';
import { upperCase, useUndoSafeSanitizer } from '@/components/forms/undoSafeInput';

export interface QuickCreateDrawerProps {
    open: boolean;
    onClose: () => void;
    onSave: (newOrg: ExtendedOrganization, addAnother?: boolean) => void;
}

const DEFAULT_QUICK_FORM = {
    organizationName: '',
    natureOfBusiness: 'Distributor / Trading / Wholesale',
    customerType: 'End User',
    gstNumber: '',
    billingStreet: '',
    billingCity: '',
    billingState: '',
    assignedUser: '',
    accountStatus: 'Active',
};

export function QuickCreateDrawer({ open, onClose, onSave }: QuickCreateDrawerProps) {
    const getOptions = useDropdownOptionsGetter();
    const [formData, setFormData] = useState(DEFAULT_QUICK_FORM);
    // Uppercase GSTIN as it's typed / pasted, keeping Ctrl+Z working.
    const gstInputRef = useUndoSafeSanitizer(upperCase);
    const [verifyingGst, setVerifyingGst] = useState(false);
    const [gstVerified, setGstVerified] = useState(false);
    const [errorMsg, setErrorMsg] = useState('');
    const nameCheck = useOrganizationNameCheck({ name: formData.organizationName, enabled: open });

    const handleChange = (field: string, value: string) => {
        setFormData((prev) => ({ ...prev, [field]: value }));
        if (field === 'gstNumber') {
            setGstVerified(false);
        }
        if (errorMsg) setErrorMsg('');
    };

    const handleVerifyGst = () => {
        if (!formData.gstNumber) {
            setErrorMsg('Please enter a GST number to verify.');
            return;
        }
        setVerifyingGst(true);
        setTimeout(() => {
            setVerifyingGst(false);
            setGstVerified(true);
        }, 600);
    };

    const handleSave = (addAnother = false) => {
        if (!formData.organizationName.trim()) {
            setErrorMsg('Organization Name is required.');
            return;
        }
        // Same name, or the same legal name written differently ("ABC Private Limited" vs "ABC Pvt Ltd").
        if (nameCheck.duplicate) {
            setErrorMsg(nameCheck.duplicate.message);
            return;
        }

        const newOrg: ExtendedOrganization = {
            id: `org-${Date.now()}`,
            accountCode: `ORG-${Math.floor(10000 + Math.random() * 90000)}`,
            organizationName: formData.organizationName.trim(),
            mailingName: formData.organizationName.trim(),
            natureOfBusiness: formData.natureOfBusiness as ExtendedOrganization['natureOfBusiness'],
            customerType: formData.customerType as ExtendedOrganization['customerType'],
            accountStatus: formData.accountStatus as ExtendedOrganization['accountStatus'],
            typeOfEntity: 'Private Limited',
            sapCodeTallyId: `TALLY-${formData.organizationName.slice(0, 3).toUpperCase()}-${Math.floor(10 + Math.random() * 90)}`,
            showroomBranchCode: 'DEL-HQ',
            sourceOfLead: 'Direct Customer',
            memberOfParentCorp: '',
            numberOfEmployees: '21 To 50',
            annualTurnover: '5 crore to 10 crore',
            description: 'Quick created enterprise account.',
            accountVerified: true,
            provideSupport: 'Yes',
            billingStreet: formData.billingStreet,
            billingCity: formData.billingCity,
            billingState: formData.billingState,
            billingPostalCode: '110001',
            billingCountry: DEFAULT_COUNTRY_CODE,
            registrationType: 'Registered',
            gstNumber: formData.gstNumber.toUpperCase(),
            panNumber: formData.gstNumber ? formData.gstNumber.substring(2, 12).toUpperCase() : '',
            assignedUser: formData.assignedUser,
            isRecentlyViewed: true,
            isMyAccount: true,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            createdBy: 'mittal.sharma',
        };

        onSave(newOrg, addAnother);

        if (addAnother) {
            setFormData(DEFAULT_QUICK_FORM);
            setGstVerified(false);
        } else {
            onClose();
        }
    };

    return (
        <Drawer
            anchor="right"
            open={open}
            onClose={onClose}
            slotProps={{
                paper: {
                    sx: {
                        width: { xs: '100vw', sm: 540, md: 580 },
                        display: 'flex',
                        flexDirection: 'column',
                        boxShadow: '-4px 0 24px rgba(0,0,0,0.15)',
                    },
                },
            }}
        >
            {/* ── Dark Header matching screenshot ────────────────────────────── */}
            <Box
                sx={{
                    backgroundColor: '#0f172a',
                    color: '#fff',
                    px: 3,
                    py: 2.2,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                }}
            >
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    <Box
                        sx={{
                            width: 32,
                            height: 32,
                            borderRadius: '8px',
                            backgroundColor: 'var(--crm-fill-blue-900)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: 'var(--crm-text-blue-400)',
                        }}
                    >
                        <AddIcon fontSize="small" />
                    </Box>
                    <Box>
                        <Typography variant="subtitle1" sx={{ fontWeight: 700, fontSize: '0.98rem', color: '#fff' }}>
                            Quick Create Organization
                        </Typography>
                        <Typography variant="caption" sx={{ color: 'var(--mui-palette-text-muted)', fontSize: '0.74rem' }}>
                            Add an account directly to the master directory
                        </Typography>
                    </Box>
                </Box>
                <IconButton
                    size="small"
                    onClick={onClose}
                    sx={{ color: 'var(--mui-palette-text-muted)', '&:hover': { color: '#fff' } }}
                >
                    <CloseIcon fontSize="small" />
                </IconButton>
            </Box>

            {/* ── Drawer Body ─────────────────────────────────────────────────── */}
            <Box sx={{ p: 3, flex: 1, overflowY: 'auto' }}>
                {errorMsg && (
                    <Alert severity="error" sx={{ mb: 2.5, borderRadius: '8px', fontSize: '0.82rem' }}>
                        {errorMsg}
                    </Alert>
                )}

                {/* Quick create is always a fresh record, even if opened from a page rendered in view mode. */}
                <FormModeProvider mode="create">
                    <FormGrid columns={{ sm: 2 }} sx={{ mb: 3 }}>
                        <FormGridItem span="full">
                            <FormField name="organizationName" label="Organization Name" required size="lg">
                                <OrganizationNameAutocomplete
                                    value={formData.organizationName}
                                    onChange={(v) => handleChange('organizationName', v)}
                                    onBlur={nameCheck.checkNow}
                                    placeholder="e.g. Acme Technologies Pvt Ltd"
                                    error={Boolean(nameCheck.duplicate)}
                                    helperText={nameCheck.duplicate?.message}
                                    checking={nameCheck.checking}
                                    verified={Boolean(formData.organizationName.trim()) && nameCheck.checked && !nameCheck.duplicate}
                                    suggestions={nameCheck.suggestions}
                                    autoFocus
                                />
                            </FormField>
                        </FormGridItem>

                        <FormField name="natureOfBusiness" label="Nature of Business" size="md">
                            <StyledSelect
                                label="Nature of Business"
                                placeholder="Select Nature"
                                value={formData.natureOfBusiness}
                                onChange={(v) => handleChange('natureOfBusiness', v)}
                                options={getOptions('org_nature_of_business', NATURE_OF_BUSINESS)}
                            />
                        </FormField>

                        <FormField name="customerType" label="Customer Type" size="sm">
                            <StyledSelect
                                label="Customer Type"
                                placeholder="Select Type"
                                value={formData.customerType}
                                onChange={(v) => handleChange('customerType', v)}
                                options={getOptions('org_customer_type', CUSTOMER_TYPES)}
                            />
                        </FormField>

                        <FormGridItem span="full">
                            <FormField
                                name="gstNumber"
                                label="GST Number"
                                size="sm"
                                hint={
                                    gstVerified ? (
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                            <CheckCircleOutlinedIcon sx={{ fontSize: 14, color: 'var(--mui-palette-success-main)' }} />
                                            <Typography sx={{ fontSize: '0.74rem', color: 'var(--mui-palette-success-main)', fontWeight: 600 }}>
                                                GSTIN Verified
                                            </Typography>
                                        </Box>
                                    ) : (
                                        <Button
                                            size="small"
                                            onClick={handleVerifyGst}
                                            disabled={verifyingGst}
                                            sx={{
                                                fontSize: '0.74rem',
                                                fontWeight: 700,
                                                textTransform: 'none',
                                                color: 'var(--crm-text-blue-600)',
                                                p: 0,
                                                minWidth: 0,
                                                '&:hover': { textDecoration: 'underline', backgroundColor: 'transparent' },
                                            }}
                                        >
                                            {verifyingGst ? <CircularProgress size={12} sx={{ mr: 0.5 }} /> : null}
                                            Verify GST
                                        </Button>
                                    )
                                }
                            >
                                <TextField
                                    fullWidth
                                    size="small"
                                    placeholder="E.G. 07AAAAA0000A1Z5"
                                    value={formData.gstNumber}
                                    onChange={(e) => handleChange('gstNumber', e.target.value.toUpperCase())}
                                    inputRef={gstInputRef}
                                    slotProps={{ htmlInput: { maxLength: FIELD_MAX_LENGTH.gstin } }}
                                    sx={fieldSx}
                                />
                            </FormField>
                        </FormGridItem>

                        <FormField name="billingStreet" label="Billing Street Address" size="full">
                            <TextField
                                fullWidth
                                multiline
                                rows={3}
                                placeholder="Street, Sector, Building, Floor..."
                                value={formData.billingStreet}
                                onChange={(e) => handleChange('billingStreet', e.target.value)}
                                slotProps={{ htmlInput: { maxLength: FIELD_MAX_LENGTH.address } }}
                                sx={fieldSx}
                            />
                        </FormField>

                        {/* Same city control as the full address forms: suggestions + dropdown arrow, free text allowed. */}
                        <CityAutocompleteField
                            name="billingCity"
                            label="City"
                            value={formData.billingCity}
                            onChange={(v) => handleChange('billingCity', v)}
                            countryValue={DEFAULT_COUNTRY_CODE}
                        />

                        {/* Quick create is India-only; the full address form offers every country. */}
                        <StateRegionField
                            name="billingState"
                            label="State"
                            value={formData.billingState}
                            onChange={(v) => handleChange('billingState', v)}
                            countryValue={DEFAULT_COUNTRY_CODE}
                        />

                        <FormField name="assignedUser" label="Assigned User" size="md">
                            <StyledSelect
                                label="Assigned User"
                                placeholder="Select User"
                                value={formData.assignedUser}
                                onChange={(v) => handleChange('assignedUser', v)}
                                options={['mittal.sharma (You)', 'rahul.verma', 'priya.singh', 'amit.patel', 'vikram.seth']}
                            />
                        </FormField>

                        <FormField name="accountStatus" label="Account Status" size="sm">
                            <Box
                                sx={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 1,
                                    height: 38,
                                    px: 1.5,
                                    border: '1px solid var(--crm-gray-300)',
                                    borderRadius: '8px',
                                    backgroundColor: 'var(--mui-palette-background-paper)',
                                }}
                            >
                                <Box sx={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: '#22c55e' }} />
                                <Typography sx={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--crm-green-700)' }}>
                                    Active Account
                                </Typography>
                            </Box>
                        </FormField>
                    </FormGrid>
                </FormModeProvider>

                {/* Informational Callout matching screenshot */}
                <Box
                    sx={{
                        p: 1.8,
                        borderRadius: '8px',
                        backgroundColor: 'var(--mui-palette-primary-soft)',
                        border: '1px solid var(--mui-palette-primary-softBorder)',
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: 1.2,
                    }}
                >
                    <InfoOutlinedIcon sx={{ fontSize: 18, color: 'var(--crm-text-blue-600)', mt: 0.2, flexShrink: 0 }} />
                    <Typography sx={{ fontSize: '0.76rem', color: 'var(--crm-text-blue-800)', lineHeight: 1.45 }}>
                        Creating this organization will automatically verify with GSTN and make it accessible across Sales &amp; Invoicing.
                    </Typography>
                </Box>
            </Box>

            {/* ── Sticky Bottom Actions matching screenshot ────────────────────── */}
            <Box
                sx={{
                    px: 3,
                    py: 2,
                    borderTop: '1px solid var(--mui-palette-border-main)',
                    backgroundColor: 'var(--mui-palette-background-paper)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 1.5,
                }}
            >
                <Button
                    variant="text"
                    onClick={onClose}
                    sx={{
                        textTransform: 'none',
                        color: 'var(--mui-palette-text-secondary)',
                        fontWeight: 600,
                        fontSize: '0.84rem',
                        '&:hover': { backgroundColor: 'var(--mui-palette-background-hover)' },
                    }}
                >
                    Cancel
                </Button>

                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    <Button
                        variant="contained"
                        onClick={() => handleSave(false)}
                        sx={{
                            background: 'linear-gradient(135deg, var(--crm-fill-blue-700) 0%, var(--crm-fill-blue-600) 100%)',
                            color: '#fff',
                            textTransform: 'none',
                            fontWeight: 700,
                            fontSize: '0.82rem',
                            borderRadius: '8px',
                            height: 36,
                            px: 2.2,
                            boxShadow: '0 2px 6px rgb(var(--crm-accent-rgb) / 0.3)',
                            '&:hover': { background: 'linear-gradient(135deg, var(--crm-fill-blue-800) 0%, var(--crm-fill-blue-700) 100%)' },
                        }}
                    >
                        Save Organization
                    </Button>
                </Box>
            </Box>
        </Drawer>
    );
}
