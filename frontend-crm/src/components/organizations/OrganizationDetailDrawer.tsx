'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
    Box,
    Typography,
    IconButton,
    Button,
    Chip,
    Tooltip,
    Divider,
} from '@mui/material';

// Icons
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import ContentCopyOutlinedIcon from '@mui/icons-material/ContentCopyOutlined';
import EmailOutlinedIcon from '@mui/icons-material/EmailOutlined';
import AlternateEmailIcon from '@mui/icons-material/AlternateEmail';
import PhoneOutlinedIcon from '@mui/icons-material/PhoneOutlined';
import AccessTimeOutlinedIcon from '@mui/icons-material/AccessTimeOutlined';
import BusinessIcon from '@mui/icons-material/Business';
import ReceiptLongOutlinedIcon from '@mui/icons-material/ReceiptLongOutlined';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import VisibilityOffOutlinedIcon from '@mui/icons-material/VisibilityOffOutlined';
import CheckCircleOutlinedIcon from '@mui/icons-material/CheckCircleOutlined';
import VerifiedUserOutlinedIcon from '@mui/icons-material/VerifiedUserOutlined';

// Tab Icons
import GridViewOutlinedIcon from '@mui/icons-material/GridViewOutlined';
import PlaceOutlinedIcon from '@mui/icons-material/PlaceOutlined';
import AccountBalanceOutlinedIcon from '@mui/icons-material/AccountBalanceOutlined';
import HubOutlinedIcon from '@mui/icons-material/HubOutlined';

import { ROUTES } from '../../config/constants';
import type { ExtendedOrganization } from '../../data/mockOrganizations';
import { EntityDetailDrawer, type DrawerTabItem, type AuditRevisionItem, buildDrawerTabs } from '../common/Drawer';
import { ORGANIZATION_FORM_TABS } from './OrganizationForm';

export interface OrganizationDetailDrawerProps {
    organization: ExtendedOrganization | null;
    open: boolean;
    onClose: () => void;
    onEdit?: (id: string) => void;
}

export function OrganizationDetailDrawer({
    organization,
    open,
    onClose,
    onEdit,
}: OrganizationDetailDrawerProps) {
    const router = useRouter();
    const [showBankAccount, setShowBankAccount] = useState(false);

    if (!organization) return null;

    const org = organization;

    const handleEdit = () => {
        if (onEdit) {
            onEdit(org.id);
        } else {
            router.push(ROUTES.ORGANIZATION_EDIT(org.id));
        }
    };

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
    };

    // ── Derive Drawer Tabs dynamically from Creation Form Single Source of Truth ──
    const tabs: DrawerTabItem[] = buildDrawerTabs(ORGANIZATION_FORM_TABS, {
        overview: (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.2 }}>
                {/* 2x2 Key Metrics Grid */}
                <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 1.5 }}>
                    <Box sx={{ p: 1.5, borderRadius: '8px', backgroundColor: '#f8fafc', border: '1px solid #e2e8f0' }}>
                            <Typography sx={{ fontSize: '0.68rem', fontWeight: 700, color: '#64748b', letterSpacing: '0.04em' }}>
                                ANNUAL TURNOVER
                            </Typography>
                            <Typography sx={{ fontSize: '1.05rem', fontWeight: 800, color: '#0f172a', mt: 0.3 }}>
                                {org.annualTurnover && org.annualTurnover.includes('₹') ? org.annualTurnover : '₹25,00,00,000'}
                            </Typography>
                            <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.4, mt: 0.5, color: '#16a34a', fontSize: '0.7rem', fontWeight: 700 }}>
                                <TrendingUpIcon sx={{ fontSize: 13 }} />
                                +14.2% YoY Growth
                            </Box>
                        </Box>

                        <Box sx={{ p: 1.5, borderRadius: '8px', backgroundColor: '#f8fafc', border: '1px solid #e2e8f0' }}>
                            <Typography sx={{ fontSize: '0.68rem', fontWeight: 700, color: '#64748b', letterSpacing: '0.04em' }}>
                                CUSTOMER TYPE
                            </Typography>
                            <Typography sx={{ fontSize: '1.05rem', fontWeight: 800, color: '#0f172a', mt: 0.3 }}>
                                {org.customerType || 'Prime Enterprise'}
                            </Typography>
                            <Typography sx={{ fontSize: '0.72rem', color: '#64748b', mt: 0.5 }}>
                                Tally Tier-1 Distributor
                            </Typography>
                        </Box>

                        <Box sx={{ p: 1.5, borderRadius: '8px', backgroundColor: '#eff6ff', border: '1px solid #bfdbfe' }}>
                            <Typography sx={{ fontSize: '0.68rem', fontWeight: 700, color: '#1d4ed8', letterSpacing: '0.04em' }}>
                                SAP / TALLY CODE
                            </Typography>
                            <Typography sx={{ fontSize: '0.98rem', fontWeight: 800, color: '#1d4ed8', fontFamily: 'monospace', mt: 0.3 }}>
                                {org.sapCodeTallyId || 'SAP-ND-4891'}
                            </Typography>
                            <Typography sx={{ fontSize: '0.72rem', color: '#60a5fa', mt: 0.5 }}>
                                Ledger: North Sales 01
                            </Typography>
                        </Box>

                        <Box sx={{ p: 1.5, borderRadius: '8px', backgroundColor: '#f8fafc', border: '1px solid #e2e8f0' }}>
                            <Typography sx={{ fontSize: '0.68rem', fontWeight: 700, color: '#64748b', letterSpacing: '0.04em' }}>
                                SHOWROOM / BRANCH CODE
                            </Typography>
                            <Typography sx={{ fontSize: '0.98rem', fontWeight: 800, color: '#0f172a', fontFamily: 'monospace', mt: 0.3 }}>
                                {org.showroomBranchCode || 'DEL-NORTH-04'}
                            </Typography>
                            <Typography sx={{ fontSize: '0.72rem', color: '#64748b', mt: 0.5 }}>
                                Netaji Subhash Place
                            </Typography>
                        </Box>
                    </Box>

                    {/* Registered Corporate Channels */}
                    <Box sx={{ border: '1px solid #e2e8f0', borderRadius: '8px', p: 1.8, backgroundColor: '#ffffff' }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.2 }}>
                            <Typography sx={{ fontSize: '0.8rem', fontWeight: 700, color: '#0f172a' }}>
                                Registered Corporate Channels
                            </Typography>
                            <Button
                                size="small"
                                onClick={handleEdit}
                                sx={{ fontSize: '0.72rem', textTransform: 'none', fontWeight: 700, color: '#2563eb', p: 0 }}
                            >
                                + Add Email
                            </Button>
                        </Box>

                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.2 }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.2 }}>
                                    <EmailOutlinedIcon sx={{ fontSize: 16, color: '#2563eb' }} />
                                    <Box>
                                        <Typography sx={{ fontSize: '0.82rem', fontWeight: 600, color: '#0f172a' }}>
                                            {org.corporateEmails?.[0]?.email || 'billing@mohittraders.in'}
                                        </Typography>
                                        <Typography sx={{ fontSize: '0.7rem', color: '#64748b' }}>
                                            Primary Billing & e-Invoicing
                                        </Typography>
                                    </Box>
                                </Box>
                                <Chip
                                    label="DEFAULT"
                                    size="small"
                                    sx={{ height: 20, fontSize: '0.64rem', fontWeight: 700, backgroundColor: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe' }}
                                />
                            </Box>

                            <Divider sx={{ borderColor: '#f1f5f9' }} />

                            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.2 }}>
                                    <AlternateEmailIcon sx={{ fontSize: 16, color: '#64748b' }} />
                                    <Box>
                                        <Typography sx={{ fontSize: '0.82rem', fontWeight: 600, color: '#334155' }}>
                                            {org.corporateEmails?.[1]?.email || 'contact@mohittraders.in'}
                                        </Typography>
                                        <Typography sx={{ fontSize: '0.7rem', color: '#64748b' }}>
                                            Executive Desk
                                        </Typography>
                                    </Box>
                                </Box>
                                <Chip
                                    label="SECONDARY"
                                    size="small"
                                    sx={{ height: 20, fontSize: '0.64rem', fontWeight: 600, backgroundColor: '#f8fafc', color: '#64748b', border: '1px solid #e2e8f0' }}
                                />
                            </Box>

                            <Divider sx={{ borderColor: '#f1f5f9' }} />

                            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.2 }}>
                                    <PhoneOutlinedIcon sx={{ fontSize: 16, color: '#16a34a' }} />
                                    <Box>
                                        <Typography sx={{ fontSize: '0.82rem', fontWeight: 600, color: '#0f172a' }}>
                                            +91 98101 23456 / +91 11 4589 1200
                                        </Typography>
                                        <Typography sx={{ fontSize: '0.7rem', color: '#64748b' }}>
                                            Board Line • Mon-Sat 9AM-7PM
                                        </Typography>
                                    </Box>
                                </Box>
                                <Tooltip title="Copy Phone">
                                    <IconButton size="small" onClick={() => copyToClipboard('+919810123456')} sx={{ p: 0.5, color: '#64748b' }}>
                                        <ContentCopyOutlinedIcon sx={{ fontSize: 14 }} />
                                    </IconButton>
                                </Tooltip>
                            </Box>
                        </Box>
                    </Box>

                    {/* Business Nature & Description */}
                    <Box sx={{ border: '1px solid #e2e8f0', borderRadius: '8px', p: 1.8, backgroundColor: '#ffffff' }}>
                        <Typography sx={{ fontSize: '0.68rem', fontWeight: 700, color: '#64748b', letterSpacing: '0.04em', mb: 0.8 }}>
                            BUSINESS NATURE & DESCRIPTION
                        </Typography>
                        <Typography sx={{ fontSize: '0.78rem', color: '#334155', lineHeight: 1.5 }}>
                            {org.description ||
                                'Authorized regional distributor for Tier-1 enterprise hardware, peripheral networking kits, and certified Tally multi-node cloud hosting solutions across the National Capital Region.'}
                        </Typography>
                        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.8, mt: 1.4 }}>
                            <Chip label={org.natureOfBusiness || 'Hardware Trading'} size="small" sx={{ height: 22, fontSize: '0.68rem', fontWeight: 600, backgroundColor: '#f1f5f9', color: '#334155' }} />
                            <Chip label={org.typeOfEntity || 'Pvt Ltd Entity'} size="small" sx={{ height: 22, fontSize: '0.68rem', fontWeight: 600, backgroundColor: '#f1f5f9', color: '#334155' }} />
                            <Chip label="Class-A Commercial" size="small" sx={{ height: 22, fontSize: '0.68rem', fontWeight: 600, backgroundColor: '#f1f5f9', color: '#334155' }} />
                        </Box>
                    </Box>

                    {/* Assigned Primary Representative */}
                    <Box sx={{ p: 1.5, borderRadius: '8px', border: '1px solid #e2e8f0', backgroundColor: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.2 }}>
                            <Box sx={{ width: 36, height: 36, borderRadius: '50%', backgroundColor: '#1e3a8a', color: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '0.78rem' }}>
                                MS
                            </Box>
                            <Box>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.8 }}>
                                    <Typography sx={{ fontSize: '0.82rem', fontWeight: 700, color: '#0f172a' }}>
                                        {org.assignedUser || 'mittal.sharma'}
                                    </Typography>
                                    <Chip label="Primary Rep" size="small" sx={{ height: 18, fontSize: '0.62rem', fontWeight: 700, backgroundColor: '#eff6ff', color: '#1d4ed8' }} />
                                </Box>
                                <Typography sx={{ fontSize: '0.7rem', color: '#64748b' }}>
                                    Senior Sales Specialist • North Region
                                </Typography>
                            </Box>
                        </Box>
                        <Button size="small" variant="outlined" sx={{ fontSize: '0.72rem', textTransform: 'none', fontWeight: 600, borderColor: '#cbd5e1', color: '#475569', height: 28, borderRadius: '6px' }}>
                            Reassign
                        </Button>
                    </Box>

                    {/* Last Modified Banner */}
                    <Box sx={{ p: 1.5, borderRadius: '8px', backgroundColor: '#f0f9ff', border: '1px solid #bae6fd', display: 'flex', alignItems: 'flex-start', gap: 1.2 }}>
                        <AccessTimeOutlinedIcon sx={{ fontSize: 18, color: '#0284c7', mt: 0.2 }} />
                        <Box>
                            <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: '#0369a1' }}>
                                Last modified 19-Oct-2026, 10:48 AM by mittal.sharma
                            </Typography>
                            <Typography sx={{ fontSize: '0.72rem', color: '#0284c7', mt: 0.3, lineHeight: 1.4 }}>
                                Updated turnover figures to ₹25 Cr and attached FY26-Q2 GST returns. 14 field revisions tracked in the Changes tab.
                            </Typography>
                        </Box>
                    </Box>
                </Box>
        ),
        address: (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <Box sx={{ p: 2, borderRadius: '8px', border: '1px solid #bfdbfe', backgroundColor: '#f8fafc' }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                            <Chip label="PRIMARY BILLING LOCATION" size="small" sx={{ height: 20, fontSize: '0.64rem', fontWeight: 700, backgroundColor: '#eff6ff', color: '#1d4ed8' }} />
                            <IconButton size="small" onClick={() => copyToClipboard(`${org.billingStreet || 'Plot 42'}, ${org.billingCity || 'Delhi'}`)} sx={{ color: '#64748b' }}>
                                <ContentCopyOutlinedIcon sx={{ fontSize: 14 }} />
                            </IconButton>
                        </Box>
                        <Typography sx={{ fontSize: '0.84rem', fontWeight: 700, color: '#0f172a' }}>
                            {org.billingStreet || 'Plot 42, Wazirpur Industrial Area, Ring Road'}
                        </Typography>
                        <Typography sx={{ fontSize: '0.78rem', color: '#475569', mt: 0.3 }}>
                            {org.billingCity || 'New Delhi'}, {org.billingState || 'Delhi'} – {org.billingPostalCode || '110052'}
                        </Typography>
                        <Typography sx={{ fontSize: '0.74rem', color: '#64748b', mt: 0.3 }}>
                            Country: {org.billingCountry || 'India'}
                        </Typography>
                        <Box sx={{ mt: 1.2, pt: 1, borderTop: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: 2 }}>
                            <Typography sx={{ fontSize: '0.72rem', color: '#64748b' }}>
                                GST State Code: <strong style={{ color: '#0f172a' }}>07 (Delhi)</strong>
                            </Typography>
                            <Typography sx={{ fontSize: '0.72rem', color: '#64748b' }}>
                                Territory: <strong style={{ color: '#0f172a' }}>DEL-NORTH-04</strong>
                            </Typography>
                        </Box>
                    </Box>

                    <Box sx={{ p: 2, borderRadius: '8px', border: '1px solid #bbf7d0', backgroundColor: '#f8fafc' }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                            <Chip label="PRIMARY SHIPPING / WAREHOUSE LOCATION" size="small" sx={{ height: 20, fontSize: '0.64rem', fontWeight: 700, backgroundColor: '#f0fdf4', color: '#15803d' }} />
                            <IconButton size="small" onClick={() => copyToClipboard('Warehouse 12-B, Khasra 89/2, Alipur Freight Terminal')} sx={{ color: '#64748b' }}>
                                <ContentCopyOutlinedIcon sx={{ fontSize: 14 }} />
                            </IconButton>
                        </Box>
                        <Typography sx={{ fontSize: '0.84rem', fontWeight: 700, color: '#0f172a' }}>
                            {org.shippingStreet || 'Warehouse 12-B, Khasra 89/2, Alipur Freight Terminal'}
                        </Typography>
                        <Typography sx={{ fontSize: '0.78rem', color: '#475569', mt: 0.3 }}>
                            {org.shippingCity || 'North Delhi'}, {org.shippingState || 'Delhi'} – {org.shippingPostalCode || '110036'}
                        </Typography>
                        <Typography sx={{ fontSize: '0.74rem', color: '#64748b', mt: 0.3 }}>
                            Country: {org.shippingCountry || 'India'}
                        </Typography>
                    </Box>

                    <Box sx={{ p: 2, borderRadius: '8px', border: '1px solid #e2e8f0', backgroundColor: '#ffffff' }}>
                        <Chip label="SHOWROOM / BRANCH LOCATION" size="small" sx={{ height: 20, fontSize: '0.64rem', fontWeight: 700, backgroundColor: '#f1f5f9', color: '#475569', mb: 1 }} />
                        <Typography sx={{ fontSize: '0.84rem', fontWeight: 700, color: '#0f172a' }}>
                            Netaji Subhash Place Showroom & Training Center
                        </Typography>
                        <Typography sx={{ fontSize: '0.78rem', color: '#475569', mt: 0.3 }}>
                            Unit 304, Aggarwal Cyber Plaza-1, Pitampura, Delhi 110034
                        </Typography>
                        <Typography sx={{ fontSize: '0.72rem', color: '#64748b', mt: 0.8 }}>
                            Point of Contact: Ramesh Verma (+91 98112 34567)
                        </Typography>
                    </Box>
                </Box>
        ),
        tax_bank: (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <Box sx={{ p: 2, borderRadius: '8px', border: '1px solid #e2e8f0', backgroundColor: '#f8fafc' }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
                            <Typography sx={{ fontSize: '0.82rem', fontWeight: 700, color: '#0f172a' }}>
                                Operating Bank Account
                            </Typography>
                            <Chip label="PRIMARY LEDGER" size="small" sx={{ height: 18, fontSize: '0.62rem', fontWeight: 700, backgroundColor: '#ecfdf5', color: '#059669' }} />
                        </Box>

                        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 1.5 }}>
                            <Box>
                                <Typography sx={{ fontSize: '0.68rem', color: '#64748b' }}>BANK NAME</Typography>
                                <Typography sx={{ fontSize: '0.84rem', fontWeight: 700, color: '#0f172a' }}>
                                    {org.bankName || 'HDFC Bank Ltd'}
                                </Typography>
                            </Box>
                            <Box>
                                <Typography sx={{ fontSize: '0.68rem', color: '#64748b' }}>ACCOUNT TYPE</Typography>
                                <Typography sx={{ fontSize: '0.84rem', fontWeight: 700, color: '#0f172a' }}>
                                    {org.typeOfAccount || 'Current Account'}
                                </Typography>
                            </Box>
                            <Box>
                                <Typography sx={{ fontSize: '0.68rem', color: '#64748b' }}>ACCOUNT NUMBER</Typography>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.6 }}>
                                    <Typography sx={{ fontSize: '0.84rem', fontWeight: 800, fontFamily: 'monospace', color: '#0f172a' }}>
                                        {showBankAccount ? (org.accountNumber || '50200038920144') : '•••• •••• •••• 0144'}
                                    </Typography>
                                    <IconButton size="small" onClick={() => setShowBankAccount(!showBankAccount)} sx={{ p: 0.2 }}>
                                        {showBankAccount ? <VisibilityOffOutlinedIcon sx={{ fontSize: 14 }} /> : <VisibilityOutlinedIcon sx={{ fontSize: 14 }} />}
                                    </IconButton>
                                </Box>
                            </Box>
                            <Box>
                                <Typography sx={{ fontSize: '0.68rem', color: '#64748b' }}>IFSC CODE</Typography>
                                <Typography sx={{ fontSize: '0.84rem', fontWeight: 800, fontFamily: 'monospace', color: '#1d4ed8' }}>
                                    {org.bankIfscCode || 'HDFC0000284'}
                                </Typography>
                            </Box>
                        </Box>
                    </Box>

                    <Box sx={{ p: 2, borderRadius: '8px', border: '1px solid #e2e8f0', backgroundColor: '#ffffff' }}>
                        <Typography sx={{ fontSize: '0.82rem', fontWeight: 700, color: '#0f172a', mb: 1.5 }}>
                            Statutory Tax & Compliance
                        </Typography>
                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.2 }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <Box>
                                    <Typography sx={{ fontSize: '0.68rem', color: '#64748b' }}>GSTIN</Typography>
                                    <Typography sx={{ fontSize: '0.84rem', fontWeight: 800, fontFamily: 'monospace', color: '#0f172a' }}>
                                        {org.gstNumber || '07AABCM8912P1ZA'}
                                    </Typography>
                                </Box>
                                <Chip label="Active & Verified" size="small" sx={{ height: 20, fontSize: '0.66rem', fontWeight: 700, backgroundColor: '#ecfdf5', color: '#059669' }} />
                            </Box>
                            <Divider sx={{ borderColor: '#f1f5f9' }} />
                            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <Box>
                                    <Typography sx={{ fontSize: '0.68rem', color: '#64748b' }}>PAN NUMBER</Typography>
                                    <Typography sx={{ fontSize: '0.84rem', fontWeight: 800, fontFamily: 'monospace', color: '#0f172a' }}>
                                        {org.panNumber || 'AABCM8912P'}
                                    </Typography>
                                </Box>
                                <Chip label="Verified" size="small" sx={{ height: 20, fontSize: '0.66rem', fontWeight: 700, backgroundColor: '#eff6ff', color: '#1d4ed8' }} />
                            </Box>
                        </Box>
                    </Box>
                </Box>
        ),
        partner_licensing: (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <Box sx={{ p: 2, borderRadius: '8px', border: '1px solid #bfdbfe', backgroundColor: '#eff6ff' }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                            <Typography sx={{ fontSize: '0.82rem', fontWeight: 800, color: '#1d4ed8' }}>
                                Tally Prime Licensing & AMC
                            </Typography>
                            <Chip label="GOLD PARTNER" size="small" sx={{ height: 18, fontSize: '0.62rem', fontWeight: 800, backgroundColor: '#fef3c7', color: '#b45309' }} />
                        </Box>
                        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 1.2, mt: 1 }}>
                            <Box>
                                <Typography sx={{ fontSize: '0.68rem', color: '#1e40af' }}>SERIAL NUMBER</Typography>
                                <Typography sx={{ fontSize: '0.84rem', fontWeight: 800, fontFamily: 'monospace', color: '#0f172a' }}>
                                    789234501
                                </Typography>
                            </Box>
                            <Box>
                                <Typography sx={{ fontSize: '0.68rem', color: '#1e40af' }}>LICENSE TIER</Typography>
                                <Typography sx={{ fontSize: '0.84rem', fontWeight: 700, color: '#0f172a' }}>
                                    Multi-User Enterprise
                                </Typography>
                            </Box>
                        </Box>
                    </Box>

                    <Box sx={{ border: '1px solid #e2e8f0', borderRadius: '8px', p: 1.8, backgroundColor: '#ffffff' }}>
                        <Typography sx={{ fontSize: '0.82rem', fontWeight: 700, color: '#0f172a', mb: 1.5 }}>
                            Linked Partner Companies
                        </Typography>
                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.2 }}>
                            {[
                                { name: 'Alsorg Interiors India Pvt Ltd', type: 'System Integrator', status: 'Active' },
                                { name: 'Apex Holdings Conglomerate Ltd', type: 'Hardware Vendor', status: 'Certified' },
                                { name: 'Shree Balaji Logistics & Freight', type: '3PL Logistics Partner', status: 'Active' },
                            ].map((p, idx) => (
                                <Box key={idx} sx={{ p: 1.2, borderRadius: '6px', backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                        <BusinessIcon sx={{ fontSize: 18, color: '#64748b' }} />
                                        <Box>
                                            <Typography sx={{ fontSize: '0.8rem', fontWeight: 700, color: '#0f172a' }}>{p.name}</Typography>
                                            <Typography sx={{ fontSize: '0.68rem', color: '#64748b' }}>{p.type}</Typography>
                                        </Box>
                                    </Box>
                                    <Chip label={p.status} size="small" sx={{ height: 18, fontSize: '0.62rem', fontWeight: 700, backgroundColor: '#ecfdf5', color: '#059669' }} />
                                </Box>
                            ))}
                        </Box>
                    </Box>
                </Box>
        ),
    });

    // Standard audit revisions for Organization
    const auditRevisions: AuditRevisionItem[] = [
        {
            title: 'Annual Turnover Updated',
            author: 'mittal.sharma',
            time: 'Today, 10:48 AM',
            from: '₹5 Cr – ₹25 Cr',
            to: '₹25 Cr – ₹100 Cr',
            note: 'Attached FY26-Q2 provisional audited balance sheet.',
        },
        {
            title: 'Statutory KYC & GST Verification Completed',
            author: 'system.automations',
            time: 'Yesterday, 04:15 PM',
            from: 'Pending KYC',
            to: 'Verified Active',
            note: 'Live GSTIN check against Govt portal returned 0 non-compliance flags.',
        },
        {
            title: 'Primary Shipping Warehouse Added',
            author: 'vikas.nair',
            time: '15-Oct-2026, 02:30 PM',
            from: 'None (Direct Dispatch)',
            to: 'Warehouse 12-B Alipur',
            note: 'Configured new transit depot for north zone fulfillment.',
        },
        {
            title: 'Registered Corporate Email Channel Added',
            author: 'mittal.sharma',
            time: '12-Oct-2026, 11:15 AM',
            from: 'contact@mohittraders.in',
            to: 'billing@mohittraders.in (Default)',
            note: 'Routing e-Way bills to dedicated accounts desk.',
        },
        {
            title: 'Master Account Created & ERP Synced',
            author: 'mittal.sharma',
            time: '01-Oct-2026, 09:30 AM',
            from: 'New Lead Import',
            to: 'Active Master Ledger',
            note: 'Imported via Tally Prime Connector Gateway Port 9000.',
        },
    ];

    return (
        <EntityDetailDrawer
            open={open}
            onClose={onClose}
            title={org.organizationName}
            subtitle={`${org.mailingName || org.organizationName}${org.billingCity ? `, ${org.billingCity} NCR` : ', Delhi NCR'}`}
            avatarBg="linear-gradient(135deg, #0284c7 0%, #0369a1 100%)"
            verified={true}
            badges={[
                {
                    label: 'Account Verified (KYC & MSME)',
                    icon: <CheckCircleOutlinedIcon sx={{ fontSize: 13 }} />,
                    backgroundColor: '#ecfdf5',
                    color: '#059669',
                    borderColor: '#a7f3d0',
                },
                {
                    label: 'Active AMC Entitlement',
                    icon: <VerifiedUserOutlinedIcon sx={{ fontSize: 13 }} />,
                    backgroundColor: '#eff6ff',
                    color: '#1d4ed8',
                    borderColor: '#bfdbfe',
                },
                {
                    label: `ID: ${org.accountCode || org.id.toUpperCase()}`,
                    isMonospace: true,
                    backgroundColor: '#f1f5f9',
                    color: '#64748b',
                    borderColor: '#e2e8f0',
                },
            ]}
            headerActions={{
                onEdit: handleEdit,
                onPhone: () => copyToClipboard('+919810123456'),
            }}
            tabs={tabs}
            auditRevisions={auditRevisions}
            includeChangesTab={true}
            statusText="Ready for Order Processing"
            primaryAction={{
                label: 'Edit Details',
                onClick: handleEdit,
            }}
            secondaryAction={{
                label: 'Generate Quote',
                icon: <ReceiptLongOutlinedIcon sx={{ fontSize: 16 }} />,
                onClick: () => {},
            }}
        />
    );
}
