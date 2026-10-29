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
    FIELD_MAX_LENGTH,
    FormField,
    FormGrid,
    FormGridItem,
    LookupField,
    StyledSelect,
    SectionLabel,
    fieldSx,
    resolveOptionsFieldSize,
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

const calendarAdornment = {
    input: {
        startAdornment: (
            <InputAdornment position="start">
                <CalendarTodayOutlinedIcon sx={{ fontSize: 16, color: '#64748b' }} />
            </InputAdornment>
        ),
    },
};

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
            {/* PRIMARY OPPORTUNITY DETAILS                                           */}
            {/* ══════════════════════════════════════════════════════════════════════ */}
            <SectionLabel
                icon={<ArticleOutlinedIcon sx={{ fontSize: 18 }} />}
                label="Primary Opportunity Details"
                sx={{ mb: 2.5 }}
            />
            <FormGrid columns={3}>
                {/* ── Customer ── */}
                <FormField name="organizationName" label="Organization name" required hint="Client company name">
                    <TextField
                        fullWidth
                        size="small"
                        placeholder="Enter legal / trading organization name"
                        value={form.organizationName}
                        onChange={(e) => setField('organizationName', e.target.value)}
                        sx={fieldSx}
                        slotProps={{ htmlInput: { maxLength: FIELD_MAX_LENGTH.organizationName } }}
                    />
                </FormField>

                <FormField name="contactName" label="Contact" required hint="Primary decision maker">
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

                <RhfPhoneField<OpportunityFormData>
                    name="contactNumber"
                    label="Contact Number"
                    required
                    hint="Mobile / direct phone"
                    placeholder="e.g. 9800000000"
                    onChange={(e) => setField('contactNumber', e.target.value)}
                />

                <RhfEmailField<OpportunityFormData>
                    name="emailAddress"
                    label="Email Address"
                    hint="Official contact email"
                    placeholder="corporate.contact@company.com"
                    onChange={(e) => setField('emailAddress', e.target.value)}
                />

                <FormField name="referredBy" label="Referred By" size="lg" hint="Partner, agent, or client">
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

                <FormField name="leadGivenBy" label="Lead Given By" size="lg" required hint="Referrer or internal sponsor">
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

                {/* ── Pipeline ── */}
                <FormField name="type" label="Type" required size={resolveOptionsFieldSize(OPPORTUNITY_TYPES)} hint="Nature of deal">
                    <StyledSelect
                        value={form.type}
                        onChange={(v) => setField('type', v)}
                        options={OPPORTUNITY_TYPES}
                        placeholder="Select Opportunity Type"
                        required
                    />
                </FormField>

                <FormField name="leadSource" label="Lead Source" required size={resolveOptionsFieldSize(LEAD_SOURCES)}>
                    <StyledSelect
                        value={form.leadSource}
                        onChange={(v) => setField('leadSource', v)}
                        options={LEAD_SOURCES}
                        placeholder="Select Lead Source"
                        required
                    />
                </FormField>

                <FormField name="salesStage" label="Sales Stage" required size={resolveOptionsFieldSize(OPPORTUNITY_SALES_STAGES)} hint="Pipeline phase">
                    <StyledSelect
                        value={form.salesStage || 'Qualification'}
                        onChange={(v) => setField('salesStage', v)}
                        options={OPPORTUNITY_SALES_STAGES}
                        placeholder="Select Sales Stage"
                        required
                    />
                </FormField>

                {/* ── Follow-up & ownership ── */}
                <FormField name="followupType" label="Followup Type" size={resolveOptionsFieldSize(FOLLOWUP_TYPES)} hint="Default: Call">
                    <StyledSelect
                        value={form.followupType || 'Call'}
                        onChange={(v) => setField('followupType', v)}
                        options={FOLLOWUP_TYPES}
                        placeholder="Select Type"
                    />
                </FormField>

                <FormField name="nextFollowupDate" label="Next Followup Date" required size="md" hint="Next touchpoint">
                    <Box sx={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 1.5 }}>
                        <TextField
                            fullWidth
                            size="small"
                            type="date"
                            value={form.nextFollowupDate}
                            onChange={(e) => setField('nextFollowupDate', e.target.value)}
                            slotProps={calendarAdornment}
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

                <FormField name="assignedTo" label="Assigned to" required size="md" hint="Account executive">
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

                {/* Product Category:* (Multi-select chips, full row) */}
                <FormField
                    name="productCategory"
                    label="Product Category"
                    required
                    size="full"
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
            </FormGrid>

            {/* ── Notes: two textareas side by side ── */}
            <FormGrid columns={2} sx={{ mt: 2.5 }}>
                <FormGridItem>
                    <FormField name="addDescription" label="Add Description" required size="full" hint="Stage summary & action items">
                        <TextField
                            fullWidth
                            size="small"
                            multiline
                            minRows={4}
                            maxRows={8}
                            placeholder="Provide current milestone details or immediate actions..."
                            value={form.addDescription}
                            onChange={(e) => setField('addDescription', e.target.value)}
                            sx={fieldSx}
                            slotProps={{ htmlInput: { maxLength: FIELD_MAX_LENGTH.longText } }}
                        />
                    </FormField>
                </FormGridItem>
                <FormGridItem>
                    <FormField name="description" label="Description" size="full" hint="Background & scope">
                        <TextField
                            fullWidth
                            size="small"
                            multiline
                            minRows={4}
                            maxRows={8}
                            placeholder="Enter background scope, requirements, current challenges, and business justification..."
                            value={form.description || ''}
                            onChange={(e) => setField('description', e.target.value)}
                            sx={fieldSx}
                            slotProps={{ htmlInput: { maxLength: FIELD_MAX_LENGTH.longText } }}
                        />
                    </FormField>
                </FormGridItem>
            </FormGrid>

            {/* ══════════════════════════════════════════════════════════════════════ */}
            {/* BILLING DETAILS                                                       */}
            {/* ══════════════════════════════════════════════════════════════════════ */}
            <Divider sx={{ my: 3.5, borderColor: '#f1f5f9' }} />
            <SectionLabel
                icon={<ReceiptLongOutlinedIcon sx={{ fontSize: 18 }} />}
                label="Billing Details"
                sx={{ mb: 2.5 }}
            />
            <FormGrid columns={3}>
                <FormField name="tallySerialNo" label="Tally Serial No" size="sm" hint="Optional serial number">
                    <TextField
                        fullWidth
                        size="small"
                        placeholder="e.g. 765432109"
                        value={form.tallySerialNo || ''}
                        onChange={(e) => setField('tallySerialNo', e.target.value)}
                        sx={fieldSx}
                        slotProps={{ htmlInput: { maxLength: FIELD_MAX_LENGTH.shortCode } }}
                    />
                </FormField>

                <FormField name="invoiceNo" label="Invoice No" size="sm" hint="Reference number">
                    <TextField
                        fullWidth
                        size="small"
                        placeholder="e.g. INV-2026-0982"
                        value={form.invoiceNo || ''}
                        onChange={(e) => setField('invoiceNo', e.target.value)}
                        sx={fieldSx}
                        slotProps={{ htmlInput: { maxLength: FIELD_MAX_LENGTH.shortCode } }}
                    />
                </FormField>

                <FormField name="invoiceDate" label="Invoice Date" size="sm" hint="Billing issue date">
                    <TextField
                        fullWidth
                        size="small"
                        type="date"
                        value={form.invoiceDate || ''}
                        onChange={(e) => setField('invoiceDate', e.target.value)}
                        slotProps={calendarAdornment}
                        sx={fieldSx}
                    />
                </FormField>
            </FormGrid>

            {/* ══════════════════════════════════════════════════════════════════════ */}
            {/* COMMISSION & DOCUMENTATION                                            */}
            {/* ══════════════════════════════════════════════════════════════════════ */}
            <Divider sx={{ my: 3.5, borderColor: '#f1f5f9' }} />
            <SectionLabel
                icon={<MonetizationOnOutlinedIcon sx={{ fontSize: 18 }} />}
                label="Commission & Documentation"
                sx={{ mb: 2.5 }}
            />
            <FormGrid columns={3}>
                <FormField name="commission" label="Commission" required size={resolveOptionsFieldSize(OPPORTUNITY_COMMISSIONS)} hint="Sales / partner commission">
                    <StyledSelect
                        value={form.commission}
                        onChange={(v) => setField('commission', v)}
                        options={OPPORTUNITY_COMMISSIONS}
                        placeholder="Select Commission"
                        required
                    />
                </FormField>

                <FormField name="addDocument" label="Add Document" size="sm" hint="Documents / PO attached">
                    <StyledSelect
                        value={form.addDocument || 'No'}
                        onChange={(v) => setField('addDocument', v)}
                        options={OPPORTUNITY_DOCUMENT_OPTIONS}
                        placeholder="Select"
                    />
                </FormField>
            </FormGrid>
        </Box>
    );
}
