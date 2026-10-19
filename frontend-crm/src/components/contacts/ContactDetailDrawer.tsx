'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import {
    Box,
    Typography,
    IconButton,
    Chip,
    Tooltip,
    Divider,
} from '@mui/material';

// Icons
import PersonOutlinedIcon from '@mui/icons-material/PersonOutlined';
import PhoneOutlinedIcon from '@mui/icons-material/PhoneOutlined';
import EmailOutlinedIcon from '@mui/icons-material/EmailOutlined';
import ApartmentIcon from '@mui/icons-material/Apartment';
import ContentCopyOutlinedIcon from '@mui/icons-material/ContentCopyOutlined';
import StarOutlinedIcon from '@mui/icons-material/StarOutlined';
import ContactPhoneOutlinedIcon from '@mui/icons-material/ContactPhoneOutlined';
import TuneOutlinedIcon from '@mui/icons-material/TuneOutlined';

import { ROUTES } from '../../config/constants';
import type { Contact } from '../../types/contact.types';
import { EntityDetailDrawer, type DrawerTabItem, type AuditRevisionItem, buildDrawerTabs } from '../common/Drawer';
import { CONTACT_FORM_TABS } from './ContactForm';

export interface ContactDetailDrawerProps {
    contact: Contact | null;
    open: boolean;
    onClose: () => void;
    onEdit?: (id: string) => void;
}

export function ContactDetailDrawer({
    contact,
    open,
    onClose,
    onEdit,
}: ContactDetailDrawerProps) {
    const router = useRouter();

    if (!contact) return null;

    const c = contact;

    const handleEdit = () => {
        if (onEdit) {
            onEdit(c.id);
        } else {
            router.push(ROUTES.CONTACT_EDIT(c.id));
        }
    };

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
    };

    // ── Derive Drawer Tabs dynamically from Creation Form Single Source of Truth ──
    const tabs: DrawerTabItem[] = buildDrawerTabs(CONTACT_FORM_TABS, {
        overview: (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    {/* Organization Banner Card */}
                    <Box
                        sx={{
                            p: 2,
                            borderRadius: '8px',
                            backgroundColor: '#f8fafc',
                            border: '1px solid #e2e8f0',
                        }}
                    >
                        <Typography sx={{ fontSize: '0.68rem', fontWeight: 700, color: '#64748b', letterSpacing: '0.04em' }}>
                            LINKED ORGANIZATION
                        </Typography>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5 }}>
                            <ApartmentIcon sx={{ fontSize: 18, color: '#2563eb' }} />
                            <Typography sx={{ fontSize: '0.98rem', fontWeight: 800, color: '#1d4ed8' }}>
                                {c.organizationName || 'Independent Contact'}
                            </Typography>
                        </Box>
                        {c.isPrimaryContact && (
                            <Box sx={{ mt: 1 }}>
                                <Chip
                                    label="Key Decision Maker / Primary Contact"
                                    size="small"
                                    sx={{
                                        height: 20,
                                        fontSize: '0.66rem',
                                        fontWeight: 700,
                                        backgroundColor: '#eff6ff',
                                        color: '#1d4ed8',
                                        border: '1px solid #bfdbfe',
                                    }}
                                />
                            </Box>
                        )}
                    </Box>

                    {/* Role & Department Grid */}
                    <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 1.5 }}>
                        <Box sx={{ p: 1.5, borderRadius: '8px', backgroundColor: '#ffffff', border: '1px solid #e2e8f0' }}>
                            <Typography sx={{ fontSize: '0.68rem', fontWeight: 700, color: '#64748b' }}>DESIGNATION</Typography>
                            <Typography sx={{ fontSize: '0.88rem', fontWeight: 700, color: '#0f172a', mt: 0.3 }}>
                                {c.designation || 'Key Stakeholder'}
                            </Typography>
                        </Box>
                        <Box sx={{ p: 1.5, borderRadius: '8px', backgroundColor: '#ffffff', border: '1px solid #e2e8f0' }}>
                            <Typography sx={{ fontSize: '0.68rem', fontWeight: 700, color: '#64748b' }}>DEPARTMENT</Typography>
                            <Typography sx={{ fontSize: '0.88rem', fontWeight: 700, color: '#0f172a', mt: 0.3 }}>
                                {c.department || 'Management'}
                            </Typography>
                        </Box>
                    </Box>

                    {/* Location & Employment Status */}
                    <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 1.5 }}>
                        <Box sx={{ p: 1.5, borderRadius: '8px', backgroundColor: '#ffffff', border: '1px solid #e2e8f0' }}>
                            <Typography sx={{ fontSize: '0.68rem', fontWeight: 700, color: '#64748b' }}>LOCATION</Typography>
                            <Typography sx={{ fontSize: '0.84rem', fontWeight: 600, color: '#334155', mt: 0.3 }}>
                                {c.location || 'Delhi NCR'}
                            </Typography>
                        </Box>
                        <Box sx={{ p: 1.5, borderRadius: '8px', backgroundColor: '#ffffff', border: '1px solid #e2e8f0' }}>
                            <Typography sx={{ fontSize: '0.68rem', fontWeight: 700, color: '#64748b' }}>EMPLOYMENT STATUS</Typography>
                            <Box sx={{ mt: 0.3 }}>
                                <Chip
                                    label={c.leftJob === 'Yes' ? 'Left Job / Inactive' : 'Active in Role'}
                                    size="small"
                                    sx={{
                                        height: 20,
                                        fontSize: '0.66rem',
                                        fontWeight: 700,
                                        backgroundColor: c.leftJob === 'Yes' ? '#fef2f2' : '#ecfdf5',
                                        color: c.leftJob === 'Yes' ? '#b91c1c' : '#059669',
                                    }}
                                />
                            </Box>
                        </Box>
                    </Box>

                    {/* Phone Numbers Card */}
                    <Box sx={{ p: 2, borderRadius: '8px', border: '1px solid #e2e8f0', backgroundColor: '#ffffff' }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.8, mb: 1.2 }}>
                            <ContactPhoneOutlinedIcon sx={{ fontSize: 16, color: '#2563eb' }} />
                            <Typography sx={{ fontSize: '0.78rem', fontWeight: 700, color: '#0f172a' }}>
                                Direct Phone Numbers
                            </Typography>
                        </Box>
                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.2 }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                    <PhoneOutlinedIcon sx={{ fontSize: 16, color: '#16a34a' }} />
                                    <Box>
                                        <Typography sx={{ fontSize: '0.84rem', fontWeight: 700, color: '#0f172a' }}>
                                            {c.mobile || '+91 98101 23456'}
                                        </Typography>
                                        <Typography sx={{ fontSize: '0.68rem', color: '#64748b' }}>
                                            Primary Mobile (Direct WhatsApp)
                                        </Typography>
                                    </Box>
                                </Box>
                                <Tooltip title="Copy Phone">
                                    <IconButton size="small" onClick={() => copyToClipboard(c.mobile || '+919810123456')}>
                                        <ContentCopyOutlinedIcon sx={{ fontSize: 14 }} />
                                    </IconButton>
                                </Tooltip>
                            </Box>

                            {c.officePhone && (
                                <>
                                    <Divider sx={{ borderColor: '#f1f5f9' }} />
                                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                            <PhoneOutlinedIcon sx={{ fontSize: 16, color: '#64748b' }} />
                                            <Box>
                                                <Typography sx={{ fontSize: '0.84rem', fontWeight: 600, color: '#334155' }}>
                                                    {c.officePhone}
                                                </Typography>
                                                <Typography sx={{ fontSize: '0.68rem', color: '#64748b' }}>
                                                    Office Landline / Extension
                                                </Typography>
                                            </Box>
                                        </Box>
                                        <Tooltip title="Copy Phone">
                                            <IconButton size="small" onClick={() => copyToClipboard(c.officePhone)}>
                                                <ContentCopyOutlinedIcon sx={{ fontSize: 14 }} />
                                            </IconButton>
                                        </Tooltip>
                                    </Box>
                                </>
                            )}
                        </Box>
                    </Box>

                    {/* Email Channels Card */}
                    <Box sx={{ p: 2, borderRadius: '8px', border: '1px solid #e2e8f0', backgroundColor: '#ffffff' }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.8, mb: 1.2 }}>
                            <EmailOutlinedIcon sx={{ fontSize: 16, color: '#2563eb' }} />
                            <Typography sx={{ fontSize: '0.78rem', fontWeight: 700, color: '#0f172a' }}>
                                Registered Email Addresses
                            </Typography>
                        </Box>
                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.2 }}>
                            {c.emailAddresses && c.emailAddresses.length > 0 ? (
                                c.emailAddresses.map((em, idx) => (
                                    <Box key={idx} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                            <EmailOutlinedIcon sx={{ fontSize: 16, color: '#2563eb' }} />
                                            <Box>
                                                <Typography sx={{ fontSize: '0.82rem', fontWeight: 600, color: '#0f172a' }}>
                                                    {em.email}
                                                </Typography>
                                                <Typography sx={{ fontSize: '0.68rem', color: '#64748b' }}>
                                                    {em.isPrimary ? 'Primary Official Channel' : 'Alternate Channel'}
                                                </Typography>
                                            </Box>
                                        </Box>
                                        {em.isPrimary && (
                                            <Chip label="PRIMARY" size="small" sx={{ height: 18, fontSize: '0.62rem', fontWeight: 700, backgroundColor: '#eff6ff', color: '#1d4ed8' }} />
                                        )}
                                    </Box>
                                ))
                            ) : (
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                    <EmailOutlinedIcon sx={{ fontSize: 16, color: '#2563eb' }} />
                                    <Typography sx={{ fontSize: '0.82rem', color: '#475569' }}>
                                        contact@{c.organizationName ? c.organizationName.toLowerCase().replace(/[^a-z]/g, '') : 'company'}.com
                                    </Typography>
                                </Box>
                            )}
                        </Box>
                    </Box>

                    {/* Assignment & Notes Card */}
                    <Box sx={{ p: 2, borderRadius: '8px', border: '1px solid #e2e8f0', backgroundColor: '#f8fafc' }}>
                        <Typography sx={{ fontSize: '0.68rem', fontWeight: 700, color: '#64748b' }}>ASSIGNED ACCOUNT MANAGER</Typography>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.2, mt: 0.8 }}>
                            <Box sx={{ width: 34, height: 34, borderRadius: '50%', backgroundColor: '#1e3a8a', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '0.75rem' }}>
                                MS
                            </Box>
                            <Box>
                                <Typography sx={{ fontSize: '0.84rem', fontWeight: 700, color: '#0f172a' }}>
                                    {c.assignedTo || 'mittal.sharma'}
                                </Typography>
                                <Typography sx={{ fontSize: '0.7rem', color: '#64748b' }}>
                                    Senior Client Partner • Regional Desk
                                </Typography>
                            </Box>
                        </Box>

                        {c.description && (
                            <>
                                <Divider sx={{ my: 1.5, borderColor: '#e2e8f0' }} />
                                <Typography sx={{ fontSize: '0.68rem', fontWeight: 700, color: '#64748b', mb: 0.5 }}>
                                    CONTACT SUMMARY & NOTES
                                </Typography>
                                <Typography sx={{ fontSize: '0.78rem', color: '#334155', lineHeight: 1.5 }}>
                                    {c.description}
                                </Typography>
                            </>
                        )}
                    </Box>

                    {/* Communication Preferences & DNC Card */}
                    <Box sx={{ p: 2, borderRadius: '8px', border: '1px solid #e2e8f0', backgroundColor: '#ffffff' }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.8, mb: 1 }}>
                            <TuneOutlinedIcon sx={{ fontSize: 16, color: '#2563eb' }} />
                            <Typography sx={{ fontSize: '0.78rem', fontWeight: 700, color: '#0f172a' }}>
                                Communication Preferences & Policy
                            </Typography>
                        </Box>
                        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 1.5 }}>
                            {c.communicationType && c.communicationType.length > 0 ? (
                                c.communicationType.map((type, i) => (
                                    <Chip key={i} label={type} size="small" sx={{ fontWeight: 600, fontSize: '0.72rem', backgroundColor: '#eff6ff', color: '#1d4ed8' }} />
                                ))
                            ) : (
                                ['Call', 'Email', 'WhatsApp'].map((type, i) => (
                                    <Chip key={i} label={type} size="small" sx={{ fontWeight: 600, fontSize: '0.72rem', backgroundColor: '#eff6ff', color: '#1d4ed8' }} />
                                ))
                            )}
                        </Box>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Typography sx={{ fontSize: '0.72rem', color: '#64748b' }}>DNC Status:</Typography>
                            <Chip
                                label={c.doNotCall ? 'DNC Active (Do Not Call)' : 'Consent Approved (Call Allowed)'}
                                size="small"
                                sx={{
                                    fontWeight: 700,
                                    fontSize: '0.68rem',
                                    backgroundColor: c.doNotCall ? '#fef2f2' : '#ecfdf5',
                                    color: c.doNotCall ? '#b91c1c' : '#059669',
                                }}
                            />
                        </Box>
                    </Box>
                </Box>
        ),
    });

    // Standard audit revisions for Contacts
    const auditRevisions: AuditRevisionItem[] = [
        {
            title: 'Contact Details Verified',
            author: 'mittal.sharma',
            time: 'Today, 11:20 AM',
            from: 'Unverified',
            to: 'Direct Link Verified',
            note: 'Confirmed direct WhatsApp & corporate email channel with client.',
        },
        {
            title: 'Role & Department Updated',
            author: 'vikas.nair',
            time: '14-Oct-2026, 03:40 PM',
            from: 'Accounts Executive',
            to: c.designation || 'Purchase Head',
            note: 'Updated upon client organizational restructuring.',
        },
        {
            title: 'Primary Contact Flag Assigned',
            author: 'mittal.sharma',
            time: '05-Oct-2026, 09:15 AM',
            from: 'Secondary',
            to: 'Primary Contact',
            note: 'Set as primary escalation point for software and licensing orders.',
        },
    ];

    return (
        <EntityDetailDrawer
            open={open}
            onClose={onClose}
            title={c.name}
            subtitle={`${c.designation ? `${c.designation} • ` : ''}${c.organizationName || 'Client Contact'}`}
            avatarBg="linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)"
            verified={true}
            badges={[
                {
                    label: c.isPrimaryContact ? 'Primary Key Decision Maker' : 'Corporate Contact',
                    icon: <StarOutlinedIcon sx={{ fontSize: 13 }} />,
                    backgroundColor: c.isPrimaryContact ? '#eff6ff' : '#f8fafc',
                    color: c.isPrimaryContact ? '#1d4ed8' : '#475569',
                    borderColor: c.isPrimaryContact ? '#bfdbfe' : '#e2e8f0',
                },
                {
                    label: `ID: ${c.contactCode || c.id.toUpperCase()}`,
                    isMonospace: true,
                    backgroundColor: '#f1f5f9',
                    color: '#64748b',
                    borderColor: '#e2e8f0',
                },
            ]}
            headerActions={{
                onEdit: handleEdit,
                onPhone: () => copyToClipboard(c.mobile || '+919810123456'),
            }}
            tabs={tabs}
            auditRevisions={auditRevisions}
            includeChangesTab={true}
            statusText="Direct Channel Active"
            primaryAction={{
                label: 'Edit Contact',
                onClick: handleEdit,
            }}
            secondaryAction={{
                label: 'Direct Call',
                icon: <PhoneOutlinedIcon sx={{ fontSize: 16 }} />,
                onClick: () => copyToClipboard(c.mobile || '+919810123456'),
            }}
        />
    );
}
