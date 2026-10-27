'use client';

import React, { useState } from 'react';
import {
    Box,
    TextField,
    Chip,
    MenuItem,
    Select,
    FormControl,
    InputAdornment,
    Divider,
} from '@mui/material';
import ArticleOutlinedIcon from '@mui/icons-material/ArticleOutlined';
import CalendarTodayOutlinedIcon from '@mui/icons-material/CalendarTodayOutlined';
import AccessTimeOutlinedIcon from '@mui/icons-material/AccessTimeOutlined';
import CheckIcon from '@mui/icons-material/Check';
import ReceiptLongOutlinedIcon from '@mui/icons-material/ReceiptLongOutlined';
import MonetizationOnOutlinedIcon from '@mui/icons-material/MonetizationOnOutlined';

import {
    FormField,
    LookupField,
    StyledSelect,
    SectionLabel,
    fieldSx,
    RhfPhoneField,
    RhfEmailField,
} from '@/components/forms';
import { UserLookupModal } from '@/components/common/lookup';
import type { OpportunityFormData } from '../../../types/opportunity.types';
import {
    OPPORTUNITY_SALES_STAGES,
    OPPORTUNITY_TYPES,
    OPPORTUNITY_COMMISSIONS,
    OPPORTUNITY_DOCUMENT_OPTIONS,
} from '../../../types/opportunity.types';
import {
    PRODUCT_CATEGORIES,
    LEAD_SOURCES,
    FOLLOWUP_TYPES,
} from '../../../types/lead.types';

export interface OpportunityBasicSectionProps {
    form: OpportunityFormData;
    setField: <K extends keyof OpportunityFormData>(key: K, value: OpportunityFormData[K]) => void;
}

export function OpportunityBasicSection({ form, setField }: OpportunityBasicSectionProps) {
    const [userLookupOpen, setUserLookupOpen] = useState(false);

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
            {/* ══════════════════════════════════════════════════════════════════════ */}
            {/* PRIMARY OPPORTUNITY DETAILS (2 COLUMNS)                              */}
            {/* ══════════════════════════════════════════════════════════════════════ */}
            <SectionLabel
                icon={<ArticleOutlinedIcon sx={{ fontSize: 18 }} />}
                label="Primary Opportunity Details"
                sx={{ mb: 2.5 }}
            />
            <Box
                sx={{
                    display: 'grid',
                    gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' },
                    gap: { xs: 2.5, md: 4 },
                    mb: 4,
                }}
            >
                {/* ════════════ LEFT COLUMN ════════════ */}
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
                    {/* Product Category:* (Multi-select) */}
                    <FormField
                        label="Product Category"
                        required
                        viewValue={
                            (form.productCategory || []).length > 0 ? (
                                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
                                    {(form.productCategory || []).map((prod) => (
                                        <Chip
                                            key={prod}
                                            label={prod}
                                            size="small"
                                            sx={{ fontSize: '0.76rem', fontWeight: 600, cursor: 'default', color: '#1d4ed8', backgroundColor: '#eff6ff' }}
                                        />
                                    ))}
                                </Box>
                            ) : null
                        }
                        hint={`${(form.productCategory || []).length} category selected`}
                    >
                        <Box
                            sx={{
                                border: '1px solid #cbd5e1',
                                borderRadius: '8px',
                                p: 1.5,
                                backgroundColor: '#ffffff',
                                minHeight: 92,
                                display: 'flex',
                                flexWrap: 'wrap',
                                gap: 0.8,
                                transition: 'border-color 0.15s ease',
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
                                            backgroundColor: selected ? '#dcfce7' : '#f8fafc',
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

                    {/* Contact:* */}
                    <FormField label="Contact" required hint="Primary decision maker or technical sponsor">
                        <LookupField
                            value={form.contactName}
                            onChange={(val) => setField('contactName', val)}
                            placeholder="Type or select contact..."
                            options={[
                                'Vikram Singhania',
                                'Neha Mehta',
                                'Rohit Bansal',
                                'Priya Nair',
                                'Sunil Aggarwal',
                                'Rajesh Gupta',
                                'Amit Patel',
                                'Pooja Verma',
                            ]}
                            required
                        />
                    </FormField>

                    {/* Contact Number:* */}
                    <RhfPhoneField<OpportunityFormData>
                        name="contactNumber"
                        label="Contact Number"
                        required
                        hint="Mobile / direct work phone"
                        placeholder="e.g. 9800000000"
                        onChange={(e) => setField('contactNumber', e.target.value)}
                    />

                    {/* Referred By */}
                    <FormField label="Referred By" hint="Referring partner, agent, or client">
                        <LookupField
                            value={form.referredBy || ''}
                            onChange={(val) => setField('referredBy', val)}
                            placeholder="Referred by partner or person..."
                            options={[
                                'Shree Associates',
                                'Apex Tally Partners',
                                'Chartered Financials Ltd',
                                'Global Tech Network',
                                'Direct Partner Network',
                            ]}
                        />
                    </FormField>

                    {/* Type:* */}
                    <FormField label="Type" required hint="Nature of deal">
                        <StyledSelect
                            value={form.type}
                            onChange={(v) => setField('type', v)}
                            options={OPPORTUNITY_TYPES}
                            placeholder="Select Opportunity Type"
                            required
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

                    {/* Next Followup Date & Time:* */}
                    <FormField label="Next Followup Date" required hint="Scheduled review or next touchpoint">
                        <Box sx={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 1.5 }}>
                            <TextField
                                fullWidth
                                size="small"
                                type="date"
                                value={form.nextFollowupDate}
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
                            <FormControl size="small" fullWidth sx={fieldSx}>
                                <Select
                                    value={form.nextFollowupTime || '11:00 AM'}
                                    onChange={(e) => setField('nextFollowupTime', e.target.value)}
                                    startAdornment={
                                        <InputAdornment position="start">
                                            <AccessTimeOutlinedIcon sx={{ fontSize: 16, color: '#64748b' }} />
                                        </InputAdornment>
                                    }
                                >
                                    <MenuItem value="09:30 AM">09:30 AM</MenuItem>
                                    <MenuItem value="10:00 AM">10:00 AM</MenuItem>
                                    <MenuItem value="11:00 AM">11:00 AM</MenuItem>
                                    <MenuItem value="12:00 PM">12:00 PM</MenuItem>
                                    <MenuItem value="02:30 PM">02:30 PM</MenuItem>
                                    <MenuItem value="03:30 PM">03:30 PM</MenuItem>
                                    <MenuItem value="04:30 PM">04:30 PM</MenuItem>
                                    <MenuItem value="05:30 PM">05:30 PM</MenuItem>
                                </Select>
                            </FormControl>
                        </Box>
                    </FormField>

                    {/* Add Description:* */}
                    <FormField
                        label="Add Description"
                        required
                        hint="Current stage summary & action item checklist"
                    >
                        <TextField
                            fullWidth
                            size="small"
                            multiline
                            rows={3}
                            placeholder="Provide current milestone details or immediate actions..."
                            value={form.addDescription}
                            onChange={(e) => setField('addDescription', e.target.value)}
                            sx={fieldSx}
                        />
                    </FormField>

                    {/* Assigned to:* */}
                    <FormField label="Assigned to" required hint="Account executive handling this deal">
                        <LookupField
                            value={form.assignedTo}
                            onChange={(val) => setField('assignedTo', val)}
                            placeholder="Assign to user..."
                            options={[
                                'mittal.sharma',
                                'rajesh.kumar',
                                'anil.verma',
                                'deepak.joshi',
                                'amit.tandon',
                            ]}
                            onLookupClick={() => setUserLookupOpen(true)}
                            required
                        />
                        <UserLookupModal
                            open={userLookupOpen}
                            onClose={() => setUserLookupOpen(false)}
                            onSelect={(user) => setField('assignedTo', user.username)}
                            selectedValue={form.assignedTo}
                        />
                    </FormField>
                </Box>

                {/* ════════════ RIGHT COLUMN ════════════ */}
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
                    {/* Organization name:* */}
                    <FormField label="Organization name" required hint="Client enterprise or company name">
                        <TextField
                            fullWidth
                            size="small"
                            placeholder="Enter legal / trading organization name"
                            value={form.organizationName}
                            onChange={(e) => setField('organizationName', e.target.value)}
                            sx={fieldSx}
                        />
                    </FormField>

                    {/* Email Address */}
                    <RhfEmailField<OpportunityFormData>
                        name="emailAddress"
                        label="Email Address"
                        hint="Official contact email"
                        placeholder="corporate.contact@company.com"
                        onChange={(e) => setField('emailAddress', e.target.value)}
                    />

                    {/* Sales Stage:* (Default Qualification) */}
                    <FormField label="Sales Stage" required hint="Current pipeline phase">
                        <StyledSelect
                            value={form.salesStage || 'Qualification'}
                            onChange={(v) => setField('salesStage', v)}
                            options={OPPORTUNITY_SALES_STAGES}
                            placeholder="Select Sales Stage"
                            required
                        />
                    </FormField>

                    {/* Lead Given By:* */}
                    <FormField label="Lead Given By" required hint="Original referrer or internal lead sponsor">
                        <LookupField
                            value={form.leadGivenBy}
                            onChange={(val) => setField('leadGivenBy', val)}
                            placeholder="Internal sponsor or external referrer..."
                            options={[
                                'Direct Inbound Marketing',
                                'Mittal Sharma',
                                'Rajesh Kumar',
                                'Channel Partner Delhi-NCR',
                                'Tally Sales Promotion Event',
                            ]}
                            required
                        />
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

                    {/* Description */}
                    <FormField
                        label="Description"
                        hint="Comprehensive opportunity background & scope"
                    >
                        <TextField
                            fullWidth
                            size="small"
                            multiline
                            rows={7}
                            placeholder="Enter background scope, requirements, current challenges, and business justification..."
                            value={form.description || ''}
                            onChange={(e) => setField('description', e.target.value)}
                            sx={fieldSx}
                        />
                    </FormField>
                </Box>
            </Box>

            {/* ══════════════════════════════════════════════════════════════════════ */}
            {/* BILLING DETAILS                                                       */}
            {/* ══════════════════════════════════════════════════════════════════════ */}
            <Divider sx={{ my: 3.5, borderColor: '#f1f5f9' }} />
            <SectionLabel
                icon={<ReceiptLongOutlinedIcon sx={{ fontSize: 18 }} />}
                label="Billing Details"
                sx={{ mb: 2.5 }}
            />
            <Box
                sx={{
                    display: 'grid',
                    gridTemplateColumns: { xs: '1fr', md: '1fr 1fr 1fr' },
                    gap: 2.5,
                }}
            >
                {/* Tally Serial No */}
                <FormField label="Tally Serial No" hint="Optional customer serial number">
                    <TextField
                        fullWidth
                        size="small"
                        placeholder="e.g. 765432109"
                        value={form.tallySerialNo || ''}
                        onChange={(e) => setField('tallySerialNo', e.target.value)}
                        sx={fieldSx}
                    />
                </FormField>

                {/* Invoice No */}
                <FormField label="Invoice No" hint="Reference invoice number">
                    <TextField
                        fullWidth
                        size="small"
                        placeholder="e.g. INV-2026-0982"
                        value={form.invoiceNo || ''}
                        onChange={(e) => setField('invoiceNo', e.target.value)}
                        sx={fieldSx}
                    />
                </FormField>

                {/* Invoice Date */}
                <FormField label="Invoice Date" hint="Date of billing issue">
                    <TextField
                        fullWidth
                        size="small"
                        type="date"
                        value={form.invoiceDate || ''}
                        onChange={(e) => setField('invoiceDate', e.target.value)}
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
                </FormField>
            </Box>

            {/* ══════════════════════════════════════════════════════════════════════ */}
            {/* COMMISSION & DOCUMENTATION                                            */}
            {/* ══════════════════════════════════════════════════════════════════════ */}
            <Divider sx={{ my: 3.5, borderColor: '#f1f5f9' }} />
            <SectionLabel
                icon={<MonetizationOnOutlinedIcon sx={{ fontSize: 18 }} />}
                label="Commission & Documentation"
                sx={{ mb: 2.5 }}
            />
            <Box
                sx={{
                    display: 'grid',
                    gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' },
                    gap: 2.5,
                }}
            >
                <FormField label="Commission" required hint="Applicable sales or partner commission">
                    <StyledSelect
                        value={form.commission}
                        onChange={(v) => setField('commission', v)}
                        options={OPPORTUNITY_COMMISSIONS}
                        placeholder="Select Commission"
                        required
                    />
                </FormField>

                <FormField label="Add Document" hint="Specify if supporting documents/purchase order attached">
                    <StyledSelect
                        value={form.addDocument || 'No'}
                        onChange={(v) => setField('addDocument', v)}
                        options={OPPORTUNITY_DOCUMENT_OPTIONS}
                        placeholder="Select Document Requirement"
                    />
                </FormField>
            </Box>
        </Box>
    );
}
