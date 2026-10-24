'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Box, Typography, IconButton, Button, Chip, Divider } from '@mui/material';

// Icons
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
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

import { ROUTES } from '@/config/constants';
import type { ExtendedOrganization } from '@/types/organization.types';
import { organizationService, subscribeCrmSync } from '@/services';
import {
    EntityDetailDrawer,
    DrawerSectionCard,
    DrawerMetricGrid,
    DrawerChannelRow,
    DrawerCopyButton,
    copyToClipboard,
    type AuditRevisionItem,
} from '@/components/common/Drawer';
import { ORGANIZATION_FORM_TABS } from './OrganizationForm';

export interface OrganizationDetailDrawerProps {
    organization: ExtendedOrganization | null;
    open: boolean;
    onClose: () => void;
    onEdit?: (id: string) => void;
    hideBackdrop?: boolean;
}

export function OrganizationDetailDrawer({
    organization,
    open,
    onClose,
    onEdit,
    hideBackdrop,
}: OrganizationDetailDrawerProps) {
    const router = useRouter();
    const [showBankAccount, setShowBankAccount] = useState(false);
    const [currentOrg, setCurrentOrg] = useState<ExtendedOrganization | null>(organization);
    const [, setSyncVersion] = useState(0);

    useEffect(() => {
        setCurrentOrg(organization);
    }, [organization]);

    useEffect(() => {
        if (!open || !organization?.id) return;

        const refreshOrg = () => {
            const fresh = organizationService.getByIdSync(organization.id);
            if (fresh) {
                setCurrentOrg(fresh);
            }
            setSyncVersion((v) => v + 1);
        };

        const unsubscribe = subscribeCrmSync(refreshOrg);
        return unsubscribe;
    }, [open, organization?.id]);

    if (!organization && !currentOrg) return null;

    const org = currentOrg || organization!;

    const handleEdit = () => {
        if (onEdit) {
            onEdit(org.id);
        } else {
            router.push(ROUTES.ORGANIZATION_EDIT(org.id));
        }
    };

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
            hideBackdrop={hideBackdrop}
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
                onView: () => router.push(ROUTES.ORGANIZATION_DETAIL(org.id)),
            }}
            formTabs={ORGANIZATION_FORM_TABS}
            tabContents={{
                overview: (
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.2 }}>
                        {/* 2x2 Key Metrics Grid */}
                        <DrawerMetricGrid
                            items={[
                                {
                                    label: 'ANNUAL TURNOVER',
                                    value: org.annualTurnover && org.annualTurnover.includes('₹') ? org.annualTurnover : '₹25,00,00,000',
                                    valueSize: '1.05rem',
                                    valueWeight: 800,
                                    bg: '#f8fafc',
                                    sublabel: (
                                        <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.4, mt: 0.5, color: '#16a34a', fontSize: '0.7rem', fontWeight: 700 }}>
                                            <TrendingUpIcon sx={{ fontSize: 13 }} />
                                            +14.2% YoY Growth
                                        </Box>
                                    ),
                                },
                                {
                                    label: 'CUSTOMER TYPE',
                                    value: org.customerType || 'Prime Enterprise',
                                    valueSize: '1.05rem',
                                    valueWeight: 800,
                                    bg: '#f8fafc',
                                    sublabel: 'Tally Tier-1 Distributor',
                                },
                                {
                                    label: 'SAP / TALLY CODE',
                                    value: org.sapCodeTallyId || 'SAP-ND-4891',
                                    valueSize: '0.98rem',
                                    valueWeight: 800,
                                    labelColor: '#1d4ed8',
                                    valueColor: '#1d4ed8',
                                    monospace: true,
                                    bg: '#eff6ff',
                                    borderColor: '#bfdbfe',
                                    sublabel: (
                                        <Typography sx={{ fontSize: '0.72rem', color: '#60a5fa', mt: 0.5 }}>
                                            Ledger: North Sales 01
                                        </Typography>
                                    ),
                                },
                                {
                                    label: 'SHOWROOM / BRANCH CODE',
                                    value: org.showroomBranchCode || 'DEL-NORTH-04',
                                    valueSize: '0.98rem',
                                    valueWeight: 800,
                                    monospace: true,
                                    bg: '#f8fafc',
                                    sublabel: 'Netaji Subhash Place',
                                },
                            ]}
                        />

                        {/* Registered Corporate Channels */}
                        <DrawerSectionCard
                            p={1.8}
                            title={
                                <Typography sx={{ fontSize: '0.8rem', fontWeight: 700, color: '#0f172a' }}>
                                    Registered Corporate Channels
                                </Typography>
                            }
                            action={
                                <Button
                                    size="small"
                                    onClick={handleEdit}
                                    sx={{ fontSize: '0.72rem', textTransform: 'none', fontWeight: 700, color: '#2563eb', p: 0 }}
                                >
                                    + Add Email
                                </Button>
                            }
                        >
                            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.2 }}>
                                <DrawerChannelRow
                                    icon={<EmailOutlinedIcon sx={{ fontSize: 16, color: '#2563eb' }} />}
                                    value={org.corporateEmails?.[0]?.email || 'billing@mohittraders.in'}
                                    caption="Primary Billing & e-Invoicing"
                                    badgeLabel="DEFAULT"
                                    badgeBorder="#bfdbfe"
                                />

                                <Divider sx={{ borderColor: '#f1f5f9' }} />

                                <DrawerChannelRow
                                    icon={<AlternateEmailIcon sx={{ fontSize: 16, color: '#64748b' }} />}
                                    value={org.corporateEmails?.[1]?.email || 'contact@mohittraders.in'}
                                    valueColor="#334155"
                                    caption="Executive Desk"
                                    badgeLabel="SECONDARY"
                                    badgeBg="#f8fafc"
                                    badgeColor="#64748b"
                                    badgeBorder="#e2e8f0"
                                />

                                <Divider sx={{ borderColor: '#f1f5f9' }} />

                                <DrawerChannelRow
                                    icon={<PhoneOutlinedIcon sx={{ fontSize: 16, color: '#16a34a' }} />}
                                    value="+91 98101 23456 / +91 11 4589 1200"
                                    caption="Board Line • Mon-Sat 9AM-7PM"
                                    copyValue="+919810123456"
                                    copyTitle="Copy Phone"
                                />
                            </Box>
                        </DrawerSectionCard>

                        {/* Business Nature & Description */}
                        <DrawerSectionCard p={1.8} title="BUSINESS NATURE & DESCRIPTION">
                            <Typography sx={{ fontSize: '0.78rem', color: '#334155', lineHeight: 1.5 }}>
                                {org.description ||
                                    'Authorized regional distributor for Tier-1 enterprise hardware, peripheral networking kits, and certified Tally multi-node cloud hosting solutions across the National Capital Region.'}
                            </Typography>
                            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.8, mt: 1.4 }}>
                                <Chip label={org.natureOfBusiness || 'Hardware Trading'} size="small" sx={{ height: 22, fontSize: '0.68rem', fontWeight: 600, backgroundColor: '#f1f5f9', color: '#334155' }} />
                                <Chip label={org.typeOfEntity || 'Pvt Ltd Entity'} size="small" sx={{ height: 22, fontSize: '0.68rem', fontWeight: 600, backgroundColor: '#f1f5f9', color: '#334155' }} />
                                <Chip label="Class-A Commercial" size="small" sx={{ height: 22, fontSize: '0.68rem', fontWeight: 600, backgroundColor: '#f1f5f9', color: '#334155' }} />
                            </Box>
                        </DrawerSectionCard>

                        {/* Assigned Primary Representative */}
                        <DrawerSectionCard p={1.5} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
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
                        </DrawerSectionCard>

                        {/* Last Modified Banner */}
                        <DrawerSectionCard p={1.5} bg="#f0f9ff" borderColor="#bae6fd" sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.2 }}>
                            <AccessTimeOutlinedIcon sx={{ fontSize: 18, color: '#0284c7', mt: 0.2 }} />
                            <Box>
                                <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: '#0369a1' }}>
                                    Last modified 19-Oct-2026, 10:48 AM by mittal.sharma
                                </Typography>
                                <Typography sx={{ fontSize: '0.72rem', color: '#0284c7', mt: 0.3, lineHeight: 1.4 }}>
                                    Updated turnover figures to ₹25 Cr and attached FY26-Q2 GST returns. 14 field revisions tracked in the Changes tab.
                                </Typography>
                            </Box>
                        </DrawerSectionCard>
                    </Box>
                ),
                address: (
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <DrawerSectionCard
                            bg="#f8fafc"
                            borderColor="#bfdbfe"
                            title={<Chip label="PRIMARY BILLING LOCATION" size="small" sx={{ height: 20, fontSize: '0.64rem', fontWeight: 700, backgroundColor: '#eff6ff', color: '#1d4ed8' }} />}
                            action={<DrawerCopyButton text={`${org.billingStreet || 'Plot 42'}, ${org.billingCity || 'Delhi'}`} iconColor="#64748b" />}
                        >
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
                        </DrawerSectionCard>

                        <DrawerSectionCard
                            bg="#f8fafc"
                            borderColor="#bbf7d0"
                            title={<Chip label="PRIMARY SHIPPING / WAREHOUSE LOCATION" size="small" sx={{ height: 20, fontSize: '0.64rem', fontWeight: 700, backgroundColor: '#f0fdf4', color: '#15803d' }} />}
                            action={<DrawerCopyButton text="Warehouse 12-B, Khasra 89/2, Alipur Freight Terminal" iconColor="#64748b" />}
                        >
                            <Typography sx={{ fontSize: '0.84rem', fontWeight: 700, color: '#0f172a' }}>
                                {org.shippingStreet || 'Warehouse 12-B, Khasra 89/2, Alipur Freight Terminal'}
                            </Typography>
                            <Typography sx={{ fontSize: '0.78rem', color: '#475569', mt: 0.3 }}>
                                {org.shippingCity || 'North Delhi'}, {org.shippingState || 'Delhi'} – {org.shippingPostalCode || '110036'}
                            </Typography>
                            <Typography sx={{ fontSize: '0.74rem', color: '#64748b', mt: 0.3 }}>
                                Country: {org.shippingCountry || 'India'}
                            </Typography>
                        </DrawerSectionCard>

                        <DrawerSectionCard>
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
                        </DrawerSectionCard>
                    </Box>
                ),
                tax_bank: (
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <DrawerSectionCard
                            bg="#f8fafc"
                            title={
                                <Typography sx={{ fontSize: '0.82rem', fontWeight: 700, color: '#0f172a' }}>
                                    Operating Bank Account
                                </Typography>
                            }
                            action={<Chip label="PRIMARY LEDGER" size="small" sx={{ height: 18, fontSize: '0.62rem', fontWeight: 700, backgroundColor: '#ecfdf5', color: '#059669' }} />}
                        >
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
                                            {showBankAccount ? org.accountNumber || '50200038920144' : '•••• •••• •••• 0144'}
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
                        </DrawerSectionCard>

                        <DrawerSectionCard>
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
                        </DrawerSectionCard>
                    </Box>
                ),
                partner_licensing: (
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <DrawerSectionCard
                            bg="#eff6ff"
                            borderColor="#bfdbfe"
                            title={
                                <Typography sx={{ fontSize: '0.82rem', fontWeight: 800, color: '#1d4ed8' }}>
                                    Tally Prime Licensing & AMC
                                </Typography>
                            }
                            action={<Chip label="GOLD PARTNER" size="small" sx={{ height: 18, fontSize: '0.62rem', fontWeight: 800, backgroundColor: '#fef3c7', color: '#b45309' }} />}
                        >
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
                        </DrawerSectionCard>

                        <DrawerSectionCard p={1.8}>
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
                        </DrawerSectionCard>
                    </Box>
                ),
            }}
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
