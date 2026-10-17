'use client';

import React from 'react';
import {
    Box,
    Typography,
    TextField,
    Button,
    Chip,
    Switch,
    FormControl,
    Select,
    MenuItem,
    InputAdornment,
    IconButton,
    Avatar,
} from '@mui/material';

// Icons
import AddIcon from '@mui/icons-material/Add';
import EmailIcon from '@mui/icons-material/Email';
import VerifiedIcon from '@mui/icons-material/Verified';
import SwapHorizIcon from '@mui/icons-material/SwapHoriz';
import MenuBookIcon from '@mui/icons-material/MenuBook';
import SearchIcon from '@mui/icons-material/Search';
import LinkOffIcon from '@mui/icons-material/LinkOff';
import PersonOutlinedIcon from '@mui/icons-material/PersonOutlined';
import ContactPageOutlinedIcon from '@mui/icons-material/ContactPageOutlined';

import { SectionLabel } from '../shared/SectionLabel';
import { StyledSelect } from '../shared/StyledSelect';
import { EmailRow } from '../shared/EmailRow';
import {
    NATURE_OF_BUSINESS,
    ACCOUNT_STATUSES,
    ENTITY_TYPES,
    CUSTOMER_TYPES,
    ANNUAL_TURNOVERS,
    EMPLOYEE_COUNTS,
    LEAD_SOURCES,
    fieldSx,
} from '../shared/constants';

import type {
    OrganizationFormData,
    CorporateEmail,
    NatureOfBusiness,
    AccountStatus,
    TypeOfEntity,
    CustomerType,
    AnnualTurnover,
    NumberOfEmployees,
    SourceOfLead,
} from '../../../types/organization.types';

export interface OverviewTabProps {
    form: OrganizationFormData;
    set: <K extends keyof OrganizationFormData>(key: K, value: OrganizationFormData[K]) => void;
    addEmail: () => void;
    updateEmail: (id: string, updated: CorporateEmail) => void;
    removeEmail: (id: string) => void;
}

export function OverviewTab({
    form,
    set,
    addEmail,
    updateEmail,
    removeEmail,
}: OverviewTabProps) {
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
                {/* ── LEFT COLUMN ──────────────────────────────────── */}
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
                    {/* Organization Name */}
                    <Box>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.6 }}>
                            <Typography
                                variant="body2"
                                sx={{ fontWeight: 600, color: '#374151', fontSize: '0.82rem' }}
                            >
                                Organization Name <span style={{ color: '#ef4444' }}>*</span>
                            </Typography>
                            <Typography variant="caption" sx={{ color: '#9ca3af', fontSize: '0.72rem' }}>
                                As per official registration
                            </Typography>
                        </Box>
                        <TextField
                            fullWidth
                            size="small"
                            placeholder="e.g. Mohit Traders Pvt Ltd"
                            value={form.organizationName}
                            onChange={(e) => set('organizationName', e.target.value)}
                            sx={fieldSx}
                            slotProps={{
                                input: {
                                    endAdornment: form.organizationName ? (
                                        <InputAdornment position="end">
                                            <VerifiedIcon sx={{ fontSize: 18, color: '#16a34a' }} />
                                        </InputAdornment>
                                    ) : undefined,
                                },
                                htmlInput: { maxLength: 200 },
                            }}
                        />
                    </Box>

                    {/* Nature of Business */}
                    <Box>
                        <Typography
                            variant="body2"
                            sx={{ fontWeight: 600, color: '#374151', fontSize: '0.82rem', mb: 0.6 }}
                        >
                            Nature of Business <span style={{ color: '#ef4444' }}>*</span>
                        </Typography>
                        <StyledSelect
                            label="Nature of Business"
                            placeholder="Select Nature of Business"
                            value={form.natureOfBusiness}
                            onChange={(v) => set('natureOfBusiness', v as NatureOfBusiness)}
                            options={NATURE_OF_BUSINESS}
                            required
                        />
                    </Box>

                    {/* Account Status */}
                    <Box>
                        <Box
                            sx={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                mb: 0.6,
                                alignItems: 'center',
                            }}
                        >
                            <Typography
                                variant="body2"
                                sx={{ fontWeight: 600, color: '#374151', fontSize: '0.82rem' }}
                            >
                                Account Status
                            </Typography>
                            {form.accountStatus === 'Active' && (
                                <Chip
                                    label="● Active Commercial"
                                    size="small"
                                    sx={{
                                        fontSize: '0.7rem',
                                        height: 20,
                                        backgroundColor: '#dcfce7',
                                        color: '#16a34a',
                                        fontWeight: 700,
                                    }}
                                />
                            )}
                        </Box>
                        <StyledSelect
                            label="Account Status"
                            placeholder="Select Account Status"
                            value={form.accountStatus}
                            onChange={(v) => set('accountStatus', v as AccountStatus)}
                            options={ACCOUNT_STATUSES}
                        />
                    </Box>

                    {/* SAP Code / Tally ID */}
                    <Box>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.6 }}>
                            <Typography
                                variant="body2"
                                sx={{ fontWeight: 600, color: '#374151', fontSize: '0.82rem' }}
                            >
                                SAP Code / Tally ID
                            </Typography>
                            <Typography variant="caption" sx={{ color: '#9ca3af', fontSize: '0.72rem' }}>
                                ERP Master Ledger Code
                            </Typography>
                        </Box>
                        <TextField
                            fullWidth
                            size="small"
                            placeholder="e.g. SAP-ND-4891"
                            value={form.sapCodeTallyId}
                            onChange={(e) => set('sapCodeTallyId', e.target.value)}
                            sx={fieldSx}
                            slotProps={{
                                input: {
                                    endAdornment: (
                                        <InputAdornment position="end">
                                            <SwapHorizIcon sx={{ fontSize: 18, color: '#94a3b8' }} />
                                        </InputAdornment>
                                    ),
                                },
                            }}
                        />
                    </Box>

                    {/* Source of Lead */}
                    <Box>
                        <Typography
                            variant="body2"
                            sx={{ fontWeight: 600, color: '#374151', fontSize: '0.82rem', mb: 0.6 }}
                        >
                            Source of Lead
                        </Typography>
                        <StyledSelect
                            label="Source of Lead"
                            placeholder="Select Source of Lead"
                            value={form.sourceOfLead}
                            onChange={(v) => set('sourceOfLead', v as SourceOfLead)}
                            options={LEAD_SOURCES}
                        />
                    </Box>

                    {/* Corporate Emails */}
                    <Box>
                        <Box
                            sx={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                mb: 1.5,
                            }}
                        >
                            <SectionLabel
                                icon={<EmailIcon sx={{ fontSize: 18 }} />}
                                label="Corporate Email Addresses"
                            />
                            <Button
                                size="small"
                                startIcon={<AddIcon fontSize="small" />}
                                onClick={addEmail}
                                sx={{
                                    fontSize: '0.78rem',
                                    textTransform: 'none',
                                    fontWeight: 600,
                                    color: '#2563EB',
                                    border: '1px dashed #93c5fd',
                                    borderRadius: '6px',
                                    px: 1.5,
                                    py: 0.4,
                                    '&:hover': {
                                        backgroundColor: '#eff6ff',
                                        border: '1px dashed #2563EB',
                                    },
                                }}
                            >
                                Add Email
                            </Button>
                        </Box>
                        {form.corporateEmails.length === 0 && (
                            <Box
                                sx={{
                                    textAlign: 'center',
                                    py: 2.5,
                                    color: '#9ca3af',
                                    fontSize: '0.8rem',
                                    border: '1px dashed #e5e7eb',
                                    borderRadius: '8px',
                                }}
                            >
                                No email addresses added yet
                            </Box>
                        )}
                        {form.corporateEmails.map((email) => (
                            <EmailRow
                                key={email.id}
                                email={email}
                                onChange={(updated) => updateEmail(email.id, updated)}
                                onRemove={() => removeEmail(email.id)}
                            />
                        ))}
                    </Box>

                    {/* Annual Turnover */}
                    <Box>
                        <Typography
                            variant="body2"
                            sx={{ fontWeight: 600, color: '#374151', fontSize: '0.82rem', mb: 0.6 }}
                        >
                            Annual Turnover
                        </Typography>
                        <StyledSelect
                            label="Annual Turnover"
                            placeholder="Select Annual Turnover"
                            value={form.annualTurnover}
                            onChange={(v) => set('annualTurnover', v as AnnualTurnover)}
                            options={ANNUAL_TURNOVERS}
                        />
                    </Box>

                    {/* Description */}
                    <Box>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.6 }}>
                            <Typography
                                variant="body2"
                                sx={{ fontWeight: 600, color: '#374151', fontSize: '0.82rem' }}
                            >
                                Add Description &amp; Scope
                            </Typography>
                            <Typography variant="caption" sx={{ color: '#9ca3af', fontSize: '0.72rem' }}>
                                {form.description.length} / 1000
                            </Typography>
                        </Box>
                        <TextField
                            fullWidth
                            multiline
                            minRows={4}
                            maxRows={8}
                            size="small"
                            placeholder="Describe the organization's scope, activities, and key details..."
                            value={form.description}
                            onChange={(e) => set('description', e.target.value.slice(0, 1000))}
                            sx={fieldSx}
                        />
                    </Box>
                </Box>

                {/* ── RIGHT COLUMN ─────────────────────────────────── */}
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
                    {/* ── Account Verified & Provide Support Card ── */}
                    <Box
                        sx={{
                            display: 'flex',
                            alignItems: 'center',
                            p: 1.75,
                            border: '1px solid #e2e8f0',
                            borderRadius: '10px',
                            backgroundColor: '#f8fafc',
                            gap: 2,
                        }}
                    >
                        {/* Left: Account Verified */}
                        <Box
                            sx={{
                                flex: 1,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                pr: 2,
                                borderRight: '1px solid #e2e8f0',
                            }}
                        >
                            <Box>
                                <Typography
                                    sx={{
                                        fontWeight: 700,
                                        color: '#1e293b',
                                        fontSize: '0.82rem',
                                        lineHeight: 1.3,
                                    }}
                                >
                                    Account Verified
                                </Typography>
                                <Typography sx={{ color: '#94a3b8', fontSize: '0.72rem' }}>
                                    KYC &amp; MSME validated
                                </Typography>
                            </Box>
                            <Switch
                                checked={form.accountVerified}
                                onChange={(e) => set('accountVerified', e.target.checked)}
                                sx={{
                                    width: 44,
                                    height: 24,
                                    p: 0,
                                    '& .MuiSwitch-switchBase': {
                                        p: '2px',
                                        '&.Mui-checked': {
                                            transform: 'translateX(20px)',
                                            color: '#fff',
                                            '& + .MuiSwitch-track': {
                                                backgroundColor: '#16a34a',
                                                opacity: 1,
                                                border: 0,
                                            },
                                        },
                                    },
                                    '& .MuiSwitch-thumb': {
                                        width: 20,
                                        height: 20,
                                        boxShadow: '0 1px 2px rgba(0,0,0,0.2)',
                                    },
                                    '& .MuiSwitch-track': {
                                        borderRadius: 12,
                                        backgroundColor: '#cbd5e1',
                                        opacity: 1,
                                    },
                                }}
                            />
                        </Box>

                        {/* Right: Provide Support */}
                        <Box
                            sx={{
                                flex: 1,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                pl: 1,
                            }}
                        >
                            <Box>
                                <Typography
                                    sx={{
                                        fontWeight: 700,
                                        color: '#1e293b',
                                        fontSize: '0.82rem',
                                        lineHeight: 1.3,
                                    }}
                                >
                                    Provide Support
                                </Typography>
                                <Typography sx={{ color: '#94a3b8', fontSize: '0.72rem' }}>
                                    Active AMC entitlement
                                </Typography>
                            </Box>
                            <FormControl size="small" sx={{ minWidth: 84 }}>
                                <Select
                                    value={form.provideSupport}
                                    onChange={(e) =>
                                        set('provideSupport', e.target.value as 'Yes' | 'No')
                                    }
                                    sx={{
                                        fontSize: '0.82rem',
                                        borderRadius: '8px',
                                        backgroundColor: '#fff',
                                        height: 34,
                                        '& .MuiOutlinedInput-notchedOutline': {
                                            borderColor: '#cbd5e1',
                                        },
                                        '&:hover .MuiOutlinedInput-notchedOutline': {
                                            borderColor: '#94a3b8',
                                        },
                                    }}
                                >
                                    <MenuItem value="Yes" sx={{ fontSize: '0.82rem' }}>
                                        Yes
                                    </MenuItem>
                                    <MenuItem value="No" sx={{ fontSize: '0.82rem' }}>
                                        No
                                    </MenuItem>
                                </Select>
                            </FormControl>
                        </Box>
                    </Box>

                    {/* Mailing Name */}
                    <Box>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.6 }}>
                            <Typography
                                variant="body2"
                                sx={{ fontWeight: 600, color: '#374151', fontSize: '0.82rem' }}
                            >
                                Mailing Name
                            </Typography>
                            <Typography variant="caption" sx={{ color: '#9ca3af', fontSize: '0.72rem' }}>
                                Printed on tax invoices
                            </Typography>
                        </Box>
                        <TextField
                            fullWidth
                            size="small"
                            placeholder="e.g. Mohit Traders Private Limited, Delhi"
                            value={form.mailingName}
                            onChange={(e) => set('mailingName', e.target.value)}
                            sx={fieldSx}
                        />
                    </Box>

                    {/* Type of Entity */}
                    <Box>
                        <Typography
                            variant="body2"
                            sx={{ fontWeight: 600, color: '#374151', fontSize: '0.82rem', mb: 0.6 }}
                        >
                            Type of Entity <span style={{ color: '#ef4444' }}>*</span>
                        </Typography>
                        <StyledSelect
                            label="Type of Entity"
                            placeholder="Select Type of Entity"
                            value={form.typeOfEntity}
                            onChange={(v) => set('typeOfEntity', v as TypeOfEntity)}
                            options={ENTITY_TYPES}
                            required
                        />
                    </Box>

                    {/* Customer Type */}
                    <Box>
                        <Typography
                            variant="body2"
                            sx={{ fontWeight: 600, color: '#374151', fontSize: '0.82rem', mb: 0.6 }}
                        >
                            Customer Type <span style={{ color: '#ef4444' }}>*</span>
                        </Typography>
                        <StyledSelect
                            label="Customer Type"
                            placeholder="Select Customer Type"
                            value={form.customerType}
                            onChange={(v) => set('customerType', v as CustomerType)}
                            options={CUSTOMER_TYPES}
                            required
                        />
                    </Box>

                    {/* Showroom / Branch Code */}
                    <Box>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.6 }}>
                            <Typography
                                variant="body2"
                                sx={{ fontWeight: 600, color: '#374151', fontSize: '0.82rem' }}
                            >
                                Showroom / Branch Code
                            </Typography>
                            <Typography variant="caption" sx={{ color: '#9ca3af', fontSize: '0.72rem' }}>
                                Store Location ID
                            </Typography>
                        </Box>
                        <TextField
                            fullWidth
                            size="small"
                            placeholder="e.g. DEL-NORTH-04"
                            value={form.showroomBranchCode}
                            onChange={(e) => set('showroomBranchCode', e.target.value)}
                            sx={fieldSx}
                        />
                    </Box>

                    {/* Member of (Parent Corporation) */}
                    <Box>
                        <Typography
                            variant="body2"
                            sx={{ fontWeight: 600, color: '#374151', fontSize: '0.82rem', mb: 0.6 }}
                        >
                            Member of (Parent Corporation)
                        </Typography>
                        <TextField
                            fullWidth
                            size="small"
                            placeholder="e.g. Apex Holdings Conglomerate Ltd."
                            value={form.memberOfParentCorp}
                            onChange={(e) => set('memberOfParentCorp', e.target.value)}
                            sx={fieldSx}
                            slotProps={{
                                input: {
                                    endAdornment: (
                                        <InputAdornment position="end" sx={{ gap: 0.5 }}>
                                            <IconButton size="small" sx={{ color: '#94a3b8' }}>
                                                <MenuBookIcon sx={{ fontSize: 18 }} />
                                            </IconButton>
                                            <IconButton size="small" sx={{ color: '#94a3b8' }}>
                                                <SearchIcon sx={{ fontSize: 18 }} />
                                            </IconButton>
                                            <IconButton size="small" sx={{ color: '#94a3b8' }}>
                                                <LinkOffIcon sx={{ fontSize: 18 }} />
                                            </IconButton>
                                        </InputAdornment>
                                    ),
                                },
                            }}
                        />
                    </Box>

                    {/* Number of Employees */}
                    <Box>
                        <Typography
                            variant="body2"
                            sx={{ fontWeight: 600, color: '#374151', fontSize: '0.82rem', mb: 0.6 }}
                        >
                            Number of Employees
                        </Typography>
                        <StyledSelect
                            label="Number of Employees"
                            placeholder="Select Number of Employees"
                            value={form.numberOfEmployees}
                            onChange={(v) => set('numberOfEmployees', v as NumberOfEmployees)}
                            options={EMPLOYEE_COUNTS}
                        />
                    </Box>

                    {/* Assigned to (Account Executive) */}
                    <Box>
                        <Typography
                            variant="body2"
                            sx={{ fontWeight: 600, color: '#374151', fontSize: '0.82rem', mb: 0.6 }}
                        >
                            Assigned to (Account Executive) <span style={{ color: '#ef4444' }}>*</span>
                        </Typography>
                        <Box
                            sx={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                p: 1.5,
                                border: '1px solid #e2e8f0',
                                borderRadius: '8px',
                                backgroundColor: '#fff',
                            }}
                        >
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                                <Avatar
                                    sx={{
                                        width: 32,
                                        height: 32,
                                        fontSize: '0.78rem',
                                        fontWeight: 700,
                                        backgroundColor: '#1d4ed8',
                                    }}
                                >
                                    MS
                                </Avatar>
                                <Box>
                                    <Typography
                                        sx={{
                                            fontSize: '0.84rem',
                                            fontWeight: 600,
                                            color: '#1e293b',
                                            lineHeight: 1.2,
                                        }}
                                    >
                                        mittal.sharma
                                    </Typography>
                                    <Typography sx={{ fontSize: '0.72rem', color: '#64748b' }}>
                                        Senior Sales Specialist • North Region
                                    </Typography>
                                </Box>
                            </Box>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                <Chip
                                    label="Primary Rep"
                                    size="small"
                                    variant="outlined"
                                    sx={{
                                        fontSize: '0.7rem',
                                        height: 22,
                                        borderColor: '#cbd5e1',
                                        color: '#475569',
                                        backgroundColor: '#f8fafc',
                                    }}
                                />
                                <IconButton size="small" sx={{ color: '#94a3b8' }}>
                                    <PersonOutlinedIcon sx={{ fontSize: 18 }} />
                                </IconButton>
                                <IconButton size="small" sx={{ color: '#94a3b8' }}>
                                    <ContactPageOutlinedIcon sx={{ fontSize: 18 }} />
                                </IconButton>
                            </Box>
                        </Box>
                    </Box>
                </Box>
            </Box>
        </Box>
    );
}
