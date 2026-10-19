'use client';

import React from 'react';
import {
    Box,
    TextField,
    Button,
    Chip,
    Typography,
    MenuItem,
    Select,
    FormControl,
    InputAdornment,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import CalendarTodayOutlinedIcon from '@mui/icons-material/CalendarTodayOutlined';
import AccessTimeOutlinedIcon from '@mui/icons-material/AccessTimeOutlined';
import CheckIcon from '@mui/icons-material/Check';

import {
    FormField,
    LookupField,
    StyledSelect,
    SectionLabel,
    EmailRow,
    fieldSx,
} from '../../forms';
import type { LeadFormData } from '../../../types/lead.types';
import type { CorporateEmail } from '../../../types/organization.types';
import {
    LEAD_SOURCES,
    PRODUCT_CATEGORIES,
    FOLLOWUP_TYPES,
    LEAD_TYPES,
    LEAD_STATUSES,
    LEAD_DESIGNATIONS,
    LEAD_DEPARTMENTS,
    LEAD_REGISTRATION_TYPES,
    LEAD_TURNOVER_RANGES,
    LEAD_EMPLOYEE_RANGES,
    LEAD_ASSIGNED_USERS,
} from '../../../types/lead.types';

export interface LeadOverviewSectionProps {
    form: LeadFormData;
    setField: <K extends keyof LeadFormData>(key: K, value: LeadFormData[K]) => void;
}

export function LeadOverviewSection({ form, setField }: LeadOverviewSectionProps) {
    // ── Email Handlers ──────────────────────────────────────────────────────────
    const handleAddEmail = () => {
        const nextId = `eml-${Date.now()}`;
        const newEmail: CorporateEmail = {
            id: nextId,
            email: '',
            isPrimary: form.emailAddresses.length === 0,
            isOptedOut: false,
            isInvalidBounce: false,
        };
        setField('emailAddresses', [...form.emailAddresses, newEmail]);
    };

    const handleUpdateEmail = (index: number, updated: CorporateEmail) => {
        const next = [...form.emailAddresses];
        if (updated.isPrimary) {
            next.forEach((e, i) => {
                e.isPrimary = i === index;
            });
        }
        next[index] = updated;
        setField('emailAddresses', next);
    };

    const handleRemoveEmail = (index: number) => {
        const next = form.emailAddresses.filter((_, i) => i !== index);
        if (next.length > 0 && !next.some((e) => e.isPrimary)) {
            next[0].isPrimary = true;
        }
        setField('emailAddresses', next);
    };

    // ── Product Category Toggle Handler ─────────────────────────────────────────
    const handleToggleProduct = (product: string) => {
        const current = form.productCategory || [];
        const exists = current.includes(product);
        if (exists) {
            setField(
                'productCategory',
                current.filter((p) => p !== product)
            );
        } else {
            setField('productCategory', [...current, product]);
        }
    };

    return (
        <Box sx={{ p: { xs: 2.5, md: 3.5 } }}>
            {/* Section Header */}
            <SectionLabel label="OVERVIEW" sx={{ mb: 3 }} />

            {/* Two-column layout matching reference screenshot */}
            <Box
                sx={{
                    display: 'grid',
                    gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' },
                    gap: { xs: 2.5, md: 4 },
                }}
            >
                {/* ════════════ LEFT COLUMN ════════════ */}
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    {/* Name:* */}
                    <FormField label="Name" required hint="Contact person name">
                        <TextField
                            fullWidth
                            size="small"
                            placeholder="Enter contact person name"
                            value={form.name}
                            onChange={(e) => setField('name', e.target.value)}
                            sx={fieldSx}
                        />
                    </FormField>

                    {/* Mobile:* */}
                    <FormField label="Mobile" required hint="Primary 10-digit number">
                        <TextField
                            fullWidth
                            size="small"
                            type="tel"
                            placeholder="+91 98000 00000"
                            value={form.mobile}
                            onChange={(e) => setField('mobile', e.target.value)}
                            sx={fieldSx}
                        />
                    </FormField>

                    {/* Email Address Section */}
                    <Box sx={{ mb: 1 }}>
                        <Box
                            sx={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                mb: 1,
                            }}
                        >
                            <Typography sx={{ fontWeight: 600, color: '#374151', fontSize: '0.82rem' }}>
                                Email Address
                            </Typography>
                            <Button
                                size="small"
                                startIcon={<AddIcon sx={{ fontSize: 16 }} />}
                                onClick={handleAddEmail}
                                sx={{
                                    textTransform: 'none',
                                    fontSize: '0.75rem',
                                    fontWeight: 600,
                                    color: '#2563eb',
                                    backgroundColor: '#eff6ff',
                                    px: 1.2,
                                    py: 0.3,
                                    borderRadius: '6px',
                                    border: '1px solid #bfdbfe',
                                    '&:hover': { backgroundColor: '#dbeafe' },
                                }}
                            >
                                Add Email
                            </Button>
                        </Box>

                        {form.emailAddresses.length === 0 ? (
                            <Box
                                sx={{
                                    p: 1.5,
                                    border: '1px dashed #cbd5e1',
                                    borderRadius: '8px',
                                    backgroundColor: '#f8fafc',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                }}
                            >
                                <Typography sx={{ fontSize: '0.78rem', color: '#94a3b8' }}>
                                    No email addresses added yet.
                                </Typography>
                                <Button size="small" onClick={handleAddEmail} sx={{ fontSize: '0.75rem' }}>
                                    + Add Primary Email
                                </Button>
                            </Box>
                        ) : (
                            form.emailAddresses.map((email, idx) => (
                                <EmailRow
                                    key={email.id || idx}
                                    email={email}
                                    onChange={(updated) => handleUpdateEmail(idx, updated)}
                                    onRemove={() => handleRemoveEmail(idx)}
                                />
                            ))
                        )}
                    </Box>

                    {/* Mailing Name */}
                    <FormField label="Mailing Name" hint="As shown on official invoices / letters">
                        <TextField
                            fullWidth
                            size="small"
                            placeholder="Official mailing name"
                            value={form.mailingName || ''}
                            onChange={(e) => setField('mailingName', e.target.value)}
                            sx={fieldSx}
                        />
                    </FormField>

                    {/* Designation */}
                    <FormField label="Designation">
                        <StyledSelect
                            value={form.designation || ''}
                            onChange={(v) => setField('designation', v)}
                            options={LEAD_DESIGNATIONS}
                            placeholder="Select Designation"
                        />
                    </FormField>

                    {/* Lead Source:* */}
                    <FormField label="Lead Source" required>
                        <StyledSelect
                            value={form.leadSource}
                            onChange={(v) => setField('leadSource', v)}
                            options={LEAD_SOURCES}
                            placeholder="Select Lead Source"
                            required
                        />
                    </FormField>

                    {/* Product Category:* (Multi-select pill box) */}
                    <FormField
                        label="Product Category"
                        required
                        hint={`${(form.productCategory || []).length} selected`}
                    >
                        <Box
                            sx={{
                                border: '1px solid #cbd5e1',
                                borderRadius: '8px',
                                p: 1.5,
                                backgroundColor: '#ffffff',
                                minHeight: 90,
                                display: 'flex',
                                flexWrap: 'wrap',
                                gap: 0.8,
                                '&:hover': { borderColor: '#2563eb' },
                            }}
                        >
                            {PRODUCT_CATEGORIES.map((prod) => {
                                const selected = (form.productCategory || []).includes(prod);
                                return (
                                    <Chip
                                        key={prod}
                                        label={prod}
                                        onClick={() => handleToggleProduct(prod)}
                                        icon={
                                            selected ? (
                                                <CheckIcon sx={{ fontSize: '14px !important', color: '#166534 !important' }} />
                                            ) : undefined
                                        }
                                        sx={{
                                            fontSize: '0.78rem',
                                            fontWeight: selected ? 700 : 500,
                                            height: 28,
                                            cursor: 'pointer',
                                            backgroundColor: selected ? '#dcfce7' : '#f1f5f9',
                                            color: selected ? '#15803d' : '#475569',
                                            border: selected ? '1.5px solid #86efac' : '1px solid #e2e8f0',
                                            transition: 'all 0.15s ease',
                                            '&:hover': {
                                                backgroundColor: selected ? '#bbf7d0' : '#e2e8f0',
                                            },
                                        }}
                                    />
                                );
                            })}
                        </Box>
                    </FormField>

                    {/* Followup Type */}
                    <FormField label="Followup Type" hint="Default: Call">
                        <StyledSelect
                            value={form.followupType || 'Call'}
                            onChange={(v) => setField('followupType', v)}
                            options={FOLLOWUP_TYPES}
                            placeholder="Select Followup Type"
                        />
                    </FormField>

                    {/* Add Description:* */}
                    <FormField
                        label="Add Description"
                        required
                        hint="Action item notes / requirement brief"
                    >
                        <TextField
                            fullWidth
                            multiline
                            minRows={3}
                            maxRows={5}
                            size="small"
                            placeholder="Enter specific followup requirement, client demand, or notes..."
                            value={form.addDescription}
                            onChange={(e) => setField('addDescription', e.target.value)}
                            sx={fieldSx}
                        />
                    </FormField>

                    {/* Registration Type */}
                    <FormField label="Registration Type">
                        <StyledSelect
                            value={form.registrationType || ''}
                            onChange={(v) => setField('registrationType', v)}
                            options={LEAD_REGISTRATION_TYPES}
                            placeholder="Select Registration Type"
                        />
                    </FormField>

                    {/* Turnover */}
                    <FormField label="Turnover" hint="Annual turnover bracket">
                        <StyledSelect
                            value={form.turnover || ''}
                            onChange={(v) => setField('turnover', v)}
                            options={LEAD_TURNOVER_RANGES}
                            placeholder="Select Annual Turnover"
                        />
                    </FormField>

                    {/* Assigned to:* */}
                    <FormField label="Assigned to" required hint="Default: mittal.sharma">
                        <LookupField
                            value={form.assignedTo}
                            onChange={(v) => setField('assignedTo', v)}
                            options={LEAD_ASSIGNED_USERS}
                            placeholder="Select Assigned Representative"
                            required
                        />
                    </FormField>
                </Box>

                {/* ════════════ RIGHT COLUMN ════════════ */}
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    {/* Other Phone */}
                    <FormField label="Other Phone" hint="Landline or alternate phone">
                        <TextField
                            fullWidth
                            size="small"
                            type="tel"
                            placeholder="e.g. 011-45678900"
                            value={form.otherPhone || ''}
                            onChange={(e) => setField('otherPhone', e.target.value)}
                            sx={fieldSx}
                        />
                    </FormField>

                    {/* Organization Name */}
                    <FormField label="Organization Name" hint="Company or business firm name">
                        <TextField
                            fullWidth
                            size="small"
                            placeholder="e.g. Acme Industrial Solutions Pvt Ltd"
                            value={form.organizationName || ''}
                            onChange={(e) => setField('organizationName', e.target.value)}
                            sx={fieldSx}
                        />
                    </FormField>

                    {/* Department */}
                    <FormField label="Department">
                        <StyledSelect
                            value={form.department || ''}
                            onChange={(v) => setField('department', v)}
                            options={LEAD_DEPARTMENTS}
                            placeholder="Select Department"
                        />
                    </FormField>

                    {/* Lead Type:* */}
                    <FormField label="Lead Type" required hint="Hot / Warm / Cold urgency">
                        <StyledSelect
                            value={form.leadType}
                            onChange={(v) => setField('leadType', v)}
                            options={LEAD_TYPES}
                            placeholder="Select Lead Urgency"
                            required
                        />
                    </FormField>

                    {/* Status */}
                    <FormField label="Status" hint="Default: New">
                        <StyledSelect
                            value={form.status || 'New'}
                            onChange={(v) => setField('status', v)}
                            options={LEAD_STATUSES}
                            placeholder="Select Status"
                        />
                    </FormField>

                    {/* Next Followup Date:* (Date + Time input) */}
                    <FormField label="Next Followup Date" required hint="Calendar date & scheduled time">
                        <Box sx={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 1.5 }}>
                            <TextField
                                fullWidth
                                size="small"
                                type="date"
                                value={form.nextFollowupDate || ''}
                                onChange={(e) => setField('nextFollowupDate', e.target.value)}
                                slotProps={{
                                    input: {
                                        startAdornment: (
                                            <InputAdornment position="start">
                                                <CalendarTodayOutlinedIcon sx={{ fontSize: 16, color: '#64748b' }} />
                                            </InputAdornment>
                                        ),
                                    },
                                }}
                                sx={fieldSx}
                            />
                            <TextField
                                fullWidth
                                size="small"
                                placeholder="e.g. 11:30 AM"
                                value={form.nextFollowupTime || ''}
                                onChange={(e) => setField('nextFollowupTime', e.target.value)}
                                slotProps={{
                                    input: {
                                        startAdornment: (
                                            <InputAdornment position="start">
                                                <AccessTimeOutlinedIcon sx={{ fontSize: 16, color: '#64748b' }} />
                                            </InputAdornment>
                                        ),
                                    },
                                }}
                                sx={fieldSx}
                            />
                        </Box>
                    </FormField>

                    {/* Description */}
                    <FormField label="Description" hint="General background notes">
                        <TextField
                            fullWidth
                            multiline
                            minRows={3}
                            maxRows={5}
                            size="small"
                            placeholder="Enter background context, client setup, or meeting minutes..."
                            value={form.description || ''}
                            onChange={(e) => setField('description', e.target.value)}
                            sx={fieldSx}
                        />
                    </FormField>

                    {/* No of Employee */}
                    <FormField label="No of Employee">
                        <StyledSelect
                            value={form.noOfEmployee || ''}
                            onChange={(v) => setField('noOfEmployee', v)}
                            options={LEAD_EMPLOYEE_RANGES}
                            placeholder="Select Employee Bracket"
                        />
                    </FormField>

                    {/* Referred By */}
                    <FormField label="Referred By" hint="Referring partner, channel, or employee">
                        <LookupField
                            value={form.referredBy || ''}
                            onChange={(v) => setField('referredBy', v)}
                            placeholder="e.g. Sunil Mehta / Tally Channel Partner"
                        />
                    </FormField>
                </Box>
            </Box>
        </Box>
    );
}
