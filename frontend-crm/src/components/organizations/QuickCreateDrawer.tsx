'use client';

import React, { useState } from 'react';
import {
    Drawer,
    Box,
    Typography,
    IconButton,
    TextField,
    Button,
    Grid,
    CircularProgress,
    Alert,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import AddIcon from '@mui/icons-material/Add';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import CheckCircleOutlinedIcon from '@mui/icons-material/CheckCircleOutlined';

import { StyledSelect, StateRegionField, fieldSx } from '@/components/forms';
import { DEFAULT_COUNTRY_CODE } from '@/data/addressMaster';
import { NATURE_OF_BUSINESS, CUSTOMER_TYPES } from './constants';
import type { ExtendedOrganization } from '@/types/organization.types';

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
    billingState: 'Delhi',
    assignedUser: 'mittal.sharma (You)',
    accountStatus: 'Active',
};

export function QuickCreateDrawer({ open, onClose, onSave }: QuickCreateDrawerProps) {
    const [formData, setFormData] = useState(DEFAULT_QUICK_FORM);
    const [verifyingGst, setVerifyingGst] = useState(false);
    const [gstVerified, setGstVerified] = useState(false);
    const [errorMsg, setErrorMsg] = useState('');

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
                            backgroundColor: '#1e3a8a',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: '#60a5fa',
                        }}
                    >
                        <AddIcon fontSize="small" />
                    </Box>
                    <Box>
                        <Typography variant="subtitle1" sx={{ fontWeight: 700, fontSize: '0.98rem', color: '#fff' }}>
                            Quick Create Organization
                        </Typography>
                        <Typography variant="caption" sx={{ color: '#94a3b8', fontSize: '0.74rem' }}>
                            Add an account directly to the master directory
                        </Typography>
                    </Box>
                </Box>
                <IconButton
                    size="small"
                    onClick={onClose}
                    sx={{ color: '#94a3b8', '&:hover': { color: '#fff' } }}
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

                {/* Organization Name * */}
                <Box sx={{ mb: 2.5 }}>
                    <Typography
                        variant="body2"
                        sx={{ fontWeight: 600, color: '#374151', fontSize: '0.82rem', mb: 0.6 }}
                    >
                        Organization Name <span style={{ color: '#ef4444' }}>*</span>
                    </Typography>
                    <TextField
                        fullWidth
                        size="small"
                        placeholder="e.g. Acme Technologies Pvt Ltd"
                        value={formData.organizationName}
                        onChange={(e) => handleChange('organizationName', e.target.value)}
                        sx={fieldSx}
                        autoFocus
                    />
                </Box>

                {/* Nature of Business & Customer Type (2 columns) */}
                <Grid container spacing={2} sx={{ mb: 2.5 }}>
                    <Grid size={{ xs: 12, sm: 6 }}>
                        <Typography
                            variant="body2"
                            sx={{ fontWeight: 600, color: '#374151', fontSize: '0.82rem', mb: 0.6 }}
                        >
                            Nature of Business
                        </Typography>
                        <StyledSelect
                            label="Nature of Business"
                            placeholder="Select Nature"
                            value={formData.natureOfBusiness}
                            onChange={(v) => handleChange('natureOfBusiness', v)}
                            options={NATURE_OF_BUSINESS}
                        />
                    </Grid>
                    <Grid size={{ xs: 12, sm: 6 }}>
                        <Typography
                            variant="body2"
                            sx={{ fontWeight: 600, color: '#374151', fontSize: '0.82rem', mb: 0.6 }}
                        >
                            Customer Type
                        </Typography>
                        <StyledSelect
                            label="Customer Type"
                            placeholder="Select Customer Type"
                            value={formData.customerType}
                            onChange={(v) => handleChange('customerType', v)}
                            options={CUSTOMER_TYPES}
                        />
                    </Grid>
                </Grid>

                {/* GST Number with Verify GST link/button */}
                <Box sx={{ mb: 2.5 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.6 }}>
                        <Typography
                            variant="body2"
                            sx={{ fontWeight: 600, color: '#374151', fontSize: '0.82rem' }}
                        >
                            GST Number
                        </Typography>
                        {gstVerified ? (
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                <CheckCircleOutlinedIcon sx={{ fontSize: 14, color: '#16a34a' }} />
                                <Typography sx={{ fontSize: '0.74rem', color: '#16a34a', fontWeight: 600 }}>
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
                                    color: '#2563eb',
                                    p: 0,
                                    minWidth: 0,
                                    '&:hover': { textDecoration: 'underline', backgroundColor: 'transparent' },
                                }}
                            >
                                {verifyingGst ? <CircularProgress size={12} sx={{ mr: 0.5 }} /> : null}
                                Verify GST
                            </Button>
                        )}
                    </Box>
                    <TextField
                        fullWidth
                        size="small"
                        placeholder="E.G. 07AAAAA0000A1Z5"
                        value={formData.gstNumber}
                        onChange={(e) => handleChange('gstNumber', e.target.value.toUpperCase())}
                        slotProps={{ htmlInput: { maxLength: 15 } }}
                        sx={fieldSx}
                    />
                </Box>

                {/* Billing Street Address */}
                <Box sx={{ mb: 2.5 }}>
                    <Typography
                        variant="body2"
                        sx={{ fontWeight: 600, color: '#374151', fontSize: '0.82rem', mb: 0.6 }}
                    >
                        Billing Street Address
                    </Typography>
                    <TextField
                        fullWidth
                        multiline
                        rows={3}
                        placeholder="Street, Sector, Building, Floor..."
                        value={formData.billingStreet}
                        onChange={(e) => handleChange('billingStreet', e.target.value)}
                        sx={fieldSx}
                    />
                </Box>

                {/* City & State (2 columns) */}
                <Grid container spacing={2} sx={{ mb: 2.5 }}>
                    <Grid size={{ xs: 12, sm: 6 }}>
                        <Typography
                            variant="body2"
                            sx={{ fontWeight: 600, color: '#374151', fontSize: '0.82rem', mb: 0.6 }}
                        >
                            City
                        </Typography>
                        <TextField
                            fullWidth
                            size="small"
                            placeholder="City"
                            value={formData.billingCity}
                            onChange={(e) => handleChange('billingCity', e.target.value)}
                            sx={fieldSx}
                        />
                    </Grid>
                    <Grid size={{ xs: 12, sm: 6 }}>
                        {/* Quick create is India-only; the full address form offers every country. */}
                        <StateRegionField
                            name="billingState"
                            label="State"
                            value={formData.billingState}
                            onChange={(v) => handleChange('billingState', v)}
                            countryValue={DEFAULT_COUNTRY_CODE}
                        />
                    </Grid>
                </Grid>

                {/* Assigned User & Account Status (2 columns) */}
                <Grid container spacing={2} sx={{ mb: 3 }}>
                    <Grid size={{ xs: 12, sm: 6 }}>
                        <Typography
                            variant="body2"
                            sx={{ fontWeight: 600, color: '#374151', fontSize: '0.82rem', mb: 0.6 }}
                        >
                            Assigned User
                        </Typography>
                        <StyledSelect
                            label="Assigned User"
                            placeholder="Select User"
                            value={formData.assignedUser}
                            onChange={(v) => handleChange('assignedUser', v)}
                            options={['mittal.sharma (You)', 'rahul.verma', 'priya.singh', 'amit.patel', 'vikram.seth']}
                        />
                    </Grid>
                    <Grid size={{ xs: 12, sm: 6 }}>
                        <Typography
                            variant="body2"
                            sx={{ fontWeight: 600, color: '#374151', fontSize: '0.82rem', mb: 0.6 }}
                        >
                            Account Status
                        </Typography>
                        <Box
                            sx={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 1,
                                height: 38,
                                px: 1.5,
                                border: '1px solid #d1d5db',
                                borderRadius: '8px',
                                backgroundColor: '#fff',
                            }}
                        >
                            <Box sx={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: '#22c55e' }} />
                            <Typography sx={{ fontSize: '0.82rem', fontWeight: 600, color: '#15803d' }}>
                                Active Account
                            </Typography>
                        </Box>
                    </Grid>
                </Grid>

                {/* Informational Callout matching screenshot */}
                <Box
                    sx={{
                        p: 1.8,
                        borderRadius: '8px',
                        backgroundColor: '#eff6ff',
                        border: '1px solid #bfdbfe',
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: 1.2,
                    }}
                >
                    <InfoOutlinedIcon sx={{ fontSize: 18, color: '#2563eb', mt: 0.2, flexShrink: 0 }} />
                    <Typography sx={{ fontSize: '0.76rem', color: '#1e40af', lineHeight: 1.45 }}>
                        Creating this organization will automatically verify with GSTN and make it accessible across Sales &amp; Invoicing.
                    </Typography>
                </Box>
            </Box>

            {/* ── Sticky Bottom Actions matching screenshot ────────────────────── */}
            <Box
                sx={{
                    px: 3,
                    py: 2,
                    borderTop: '1px solid #e2e8f0',
                    backgroundColor: '#fff',
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
                        color: '#64748b',
                        fontWeight: 600,
                        fontSize: '0.84rem',
                        '&:hover': { backgroundColor: '#f1f5f9' },
                    }}
                >
                    Cancel
                </Button>

                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    <Button
                        variant="contained"
                        onClick={() => handleSave(false)}
                        sx={{
                            background: 'linear-gradient(135deg, #1d4ed8 0%, #2563eb 100%)',
                            color: '#fff',
                            textTransform: 'none',
                            fontWeight: 700,
                            fontSize: '0.82rem',
                            borderRadius: '8px',
                            height: 36,
                            px: 2.2,
                            boxShadow: '0 2px 6px rgba(37,99,235,0.3)',
                            '&:hover': { background: 'linear-gradient(135deg, #1e40af 0%, #1d4ed8 100%)' },
                        }}
                    >
                        Save Organization
                    </Button>
                </Box>
            </Box>
        </Drawer>
    );
}
