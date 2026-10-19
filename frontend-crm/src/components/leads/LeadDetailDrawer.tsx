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
import LocalFireDepartmentIcon from '@mui/icons-material/LocalFireDepartment';
import CalendarMonthOutlinedIcon from '@mui/icons-material/CalendarMonthOutlined';
import PlaceOutlinedIcon from '@mui/icons-material/PlaceOutlined';
import BusinessOutlinedIcon from '@mui/icons-material/BusinessOutlined';
import CheckCircleOutlinedIcon from '@mui/icons-material/CheckCircleOutlined';
import AssignmentTurnedInOutlinedIcon from '@mui/icons-material/AssignmentTurnedInOutlined';
import AccessTimeOutlinedIcon from '@mui/icons-material/AccessTimeOutlined';

import { ROUTES } from '../../config/constants';
import type { Lead } from '../../types/lead.types';
import { EntityDetailDrawer, type DrawerTabItem, type AuditRevisionItem, buildDrawerTabs } from '../common/Drawer';
import { LEAD_FORM_TABS } from './LeadForm';

export interface LeadDetailDrawerProps {
    lead: Lead | null;
    open: boolean;
    onClose: () => void;
    onEdit?: (id: string) => void;
}

export function LeadDetailDrawer({
    lead,
    open,
    onClose,
    onEdit,
}: LeadDetailDrawerProps) {
    const router = useRouter();

    if (!lead) return null;

    const l = lead;

    const handleEdit = () => {
        if (onEdit) {
            onEdit(l.id);
        } else {
            router.push(ROUTES.LEAD_EDIT(l.id));
        }
    };

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
    };

    // ── Derive Drawer Tabs dynamically from Creation Form Single Source of Truth ──
    const tabs: DrawerTabItem[] = buildDrawerTabs(LEAD_FORM_TABS, {
        overview: (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {/* Linked Organization Card */}
                <Box
                    sx={{
                        p: 2,
                        borderRadius: '8px',
                        backgroundColor: '#f8fafc',
                        border: '1px solid #e2e8f0',
                    }}
                >
                    <Typography sx={{ fontSize: '0.68rem', fontWeight: 700, color: '#64748b', letterSpacing: '0.04em' }}>
                        PROSPECTIVE ORGANIZATION
                    </Typography>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5 }}>
                        <ApartmentIcon sx={{ fontSize: 18, color: '#2563eb' }} />
                        <Typography sx={{ fontSize: '0.98rem', fontWeight: 800, color: '#1d4ed8' }}>
                            {l.organizationName || 'Individual Prospect / Non-Entity'}
                        </Typography>
                    </Box>
                    {l.mailingName && l.mailingName !== l.organizationName && (
                        <Typography sx={{ fontSize: '0.75rem', color: '#64748b', mt: 0.3 }}>
                            Mailing Name: {l.mailingName}
                        </Typography>
                    )}
                </Box>

                {/* Next Followup Highlight Card */}
                <Box
                    sx={{
                        p: 2,
                        borderRadius: '8px',
                        backgroundColor: '#fffbeb',
                        border: '1px solid #fde68a',
                    }}
                >
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.8 }}>
                            <CalendarMonthOutlinedIcon sx={{ fontSize: 18, color: '#d97706' }} />
                            <Typography sx={{ fontSize: '0.8rem', fontWeight: 800, color: '#92400e' }}>
                                NEXT SCHEDULED FOLLOWUP
                            </Typography>
                        </Box>
                        {l.followupType && (
                            <Chip
                                label={l.followupType}
                                size="small"
                                sx={{
                                    height: 20,
                                    fontSize: '0.68rem',
                                    fontWeight: 700,
                                    backgroundColor: '#fef3c7',
                                    color: '#b45309',
                                    border: '1px solid #fcd34d',
                                }}
                            />
                        )}
                    </Box>

                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, my: 0.5 }}>
                        <Typography sx={{ fontSize: '0.94rem', fontWeight: 700, color: '#78350f' }}>
                            {l.nextFollowupDate}
                        </Typography>
                        {l.nextFollowupTime && (
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.4 }}>
                                <AccessTimeOutlinedIcon sx={{ fontSize: 14, color: '#b45309' }} />
                                <Typography sx={{ fontSize: '0.82rem', fontWeight: 600, color: '#92400e' }}>
                                    {l.nextFollowupTime}
                                </Typography>
                            </Box>
                        )}
                    </Box>

                    {l.addDescription && (
                        <Box
                            sx={{
                                mt: 1,
                                p: 1.2,
                                borderRadius: '6px',
                                backgroundColor: '#ffffff',
                                border: '1px solid #fed7aa',
                            }}
                        >
                            <Typography sx={{ fontSize: '0.74rem', color: '#9a3412', fontWeight: 500, lineHeight: 1.4 }}>
                                &quot;{l.addDescription}&quot;
                            </Typography>
                        </Box>
                    )}
                </Box>

                {/* Product Categories Interested In */}
                <Box sx={{ p: 2, borderRadius: '8px', backgroundColor: '#ffffff', border: '1px solid #e2e8f0' }}>
                    <Typography sx={{ fontSize: '0.68rem', fontWeight: 700, color: '#64748b', mb: 1 }}>
                        PRODUCTS &amp; SOLUTIONS OF INTEREST
                    </Typography>
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.8 }}>
                        {l.productCategory && l.productCategory.length > 0 ? (
                            l.productCategory.map((prod, idx) => (
                                <Chip
                                    key={idx}
                                    label={prod}
                                    size="small"
                                    icon={<CheckCircleOutlinedIcon sx={{ fontSize: '13px !important', color: '#15803d !important' }} />}
                                    sx={{
                                        height: 24,
                                        fontSize: '0.74rem',
                                        fontWeight: 700,
                                        backgroundColor: '#dcfce7',
                                        color: '#166534',
                                        border: '1px solid #86efac',
                                    }}
                                />
                            ))
                        ) : (
                            <Typography sx={{ fontSize: '0.8rem', color: '#94a3b8' }}>None specified</Typography>
                        )}
                    </Box>
                </Box>

                {/* Contact Phone & Channels */}
                <Box sx={{ p: 2, borderRadius: '8px', border: '1px solid #e2e8f0', backgroundColor: '#ffffff' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.8, mb: 1.2 }}>
                        <PhoneOutlinedIcon sx={{ fontSize: 16, color: '#2563eb' }} />
                        <Typography sx={{ fontSize: '0.78rem', fontWeight: 700, color: '#0f172a' }}>
                            Direct Phone &amp; Email
                        </Typography>
                    </Box>

                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.2 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                <PhoneOutlinedIcon sx={{ fontSize: 16, color: '#16a34a' }} />
                                <Box>
                                    <Typography sx={{ fontSize: '0.84rem', fontWeight: 700, color: '#0f172a' }}>
                                        {l.mobile}
                                    </Typography>
                                    <Typography sx={{ fontSize: '0.68rem', color: '#64748b' }}>
                                        Primary Mobile / WhatsApp
                                    </Typography>
                                </Box>
                            </Box>
                            <Tooltip title="Copy Phone">
                                <IconButton size="small" onClick={() => copyToClipboard(l.mobile)}>
                                    <ContentCopyOutlinedIcon sx={{ fontSize: 14 }} />
                                </IconButton>
                            </Tooltip>
                        </Box>

                        {l.otherPhone && (
                            <>
                                <Divider sx={{ borderColor: '#f1f5f9' }} />
                                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                        <PhoneOutlinedIcon sx={{ fontSize: 16, color: '#64748b' }} />
                                        <Box>
                                            <Typography sx={{ fontSize: '0.84rem', fontWeight: 600, color: '#334155' }}>
                                                {l.otherPhone}
                                            </Typography>
                                            <Typography sx={{ fontSize: '0.68rem', color: '#64748b' }}>
                                                Other / Landline Phone
                                            </Typography>
                                        </Box>
                                    </Box>
                                    <Tooltip title="Copy Phone">
                                        <IconButton size="small" onClick={() => copyToClipboard(l.otherPhone || '')}>
                                            <ContentCopyOutlinedIcon sx={{ fontSize: 14 }} />
                                        </IconButton>
                                    </Tooltip>
                                </Box>
                            </>
                        )}

                        {l.emailAddresses && l.emailAddresses.length > 0 && (
                            <>
                                <Divider sx={{ borderColor: '#f1f5f9' }} />
                                {l.emailAddresses.map((em, idx) => (
                                    <Box key={idx} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                            <EmailOutlinedIcon sx={{ fontSize: 16, color: '#2563eb' }} />
                                            <Box>
                                                <Typography sx={{ fontSize: '0.82rem', fontWeight: 600, color: '#0f172a' }}>
                                                    {em.email}
                                                </Typography>
                                                <Typography sx={{ fontSize: '0.68rem', color: '#64748b' }}>
                                                    {em.isPrimary ? 'Primary Official Email' : 'Alternate Email'}
                                                </Typography>
                                            </Box>
                                        </Box>
                                        {em.isPrimary && (
                                            <Chip label="PRIMARY" size="small" sx={{ height: 18, fontSize: '0.62rem', fontWeight: 700, backgroundColor: '#eff6ff', color: '#1d4ed8' }} />
                                        )}
                                    </Box>
                                ))}
                            </>
                        )}
                    </Box>
                </Box>

                {/* Profile & Business Metrics Grid */}
                <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 1.5 }}>
                    <Box sx={{ p: 1.5, borderRadius: '8px', backgroundColor: '#ffffff', border: '1px solid #e2e8f0' }}>
                        <Typography sx={{ fontSize: '0.68rem', fontWeight: 700, color: '#64748b' }}>DESIGNATION</Typography>
                        <Typography sx={{ fontSize: '0.86rem', fontWeight: 700, color: '#0f172a', mt: 0.3 }}>
                            {l.designation || 'Key Decision Maker'}
                        </Typography>
                    </Box>
                    <Box sx={{ p: 1.5, borderRadius: '8px', backgroundColor: '#ffffff', border: '1px solid #e2e8f0' }}>
                        <Typography sx={{ fontSize: '0.68rem', fontWeight: 700, color: '#64748b' }}>DEPARTMENT</Typography>
                        <Typography sx={{ fontSize: '0.86rem', fontWeight: 700, color: '#0f172a', mt: 0.3 }}>
                            {l.department || 'Management'}
                        </Typography>
                    </Box>
                    <Box sx={{ p: 1.5, borderRadius: '8px', backgroundColor: '#ffffff', border: '1px solid #e2e8f0' }}>
                        <Typography sx={{ fontSize: '0.68rem', fontWeight: 700, color: '#64748b' }}>ANNUAL TURNOVER</Typography>
                        <Typography sx={{ fontSize: '0.82rem', fontWeight: 600, color: '#334155', mt: 0.3 }}>
                            {l.turnover || 'Not Disclosed'}
                        </Typography>
                    </Box>
                    <Box sx={{ p: 1.5, borderRadius: '8px', backgroundColor: '#ffffff', border: '1px solid #e2e8f0' }}>
                        <Typography sx={{ fontSize: '0.68rem', fontWeight: 700, color: '#64748b' }}>NO OF EMPLOYEES</Typography>
                        <Typography sx={{ fontSize: '0.82rem', fontWeight: 600, color: '#334155', mt: 0.3 }}>
                            {l.noOfEmployee || '11 – 50 Staff'}
                        </Typography>
                    </Box>
                </Box>

                {/* Source & Representative Details */}
                <Box sx={{ p: 2, borderRadius: '8px', border: '1px solid #e2e8f0', backgroundColor: '#f8fafc' }}>
                    <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 1.5 }}>
                        <Box>
                            <Typography sx={{ fontSize: '0.68rem', fontWeight: 700, color: '#64748b' }}>LEAD SOURCE</Typography>
                            <Typography sx={{ fontSize: '0.82rem', fontWeight: 600, color: '#1e3a8a', mt: 0.3 }}>
                                {l.leadSource}
                            </Typography>
                        </Box>
                        <Box>
                            <Typography sx={{ fontSize: '0.68rem', fontWeight: 700, color: '#64748b' }}>ASSIGNED TO</Typography>
                            <Typography sx={{ fontSize: '0.82rem', fontWeight: 600, color: '#0f172a', mt: 0.3 }}>
                                {l.assignedTo}
                            </Typography>
                        </Box>
                    </Box>
                    {l.referredBy && (
                        <Box sx={{ mt: 1.2, pt: 1, borderTop: '1px dashed #cbd5e1' }}>
                            <Typography sx={{ fontSize: '0.68rem', fontWeight: 700, color: '#64748b' }}>REFERRED BY</Typography>
                            <Typography sx={{ fontSize: '0.8rem', color: '#334155', mt: 0.2 }}>
                                {l.referredBy}
                            </Typography>
                        </Box>
                    )}
                </Box>

                {/* Long Description */}
                {l.description && (
                    <Box sx={{ p: 2, borderRadius: '8px', backgroundColor: '#ffffff', border: '1px solid #e2e8f0' }}>
                        <Typography sx={{ fontSize: '0.68rem', fontWeight: 700, color: '#64748b', mb: 0.5 }}>
                            BACKGROUND CONTEXT &amp; NOTES
                        </Typography>
                        <Typography sx={{ fontSize: '0.82rem', color: '#334155', lineHeight: 1.5 }}>
                            {l.description}
                        </Typography>
                    </Box>
                )}
            </Box>
        ),

        address: (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {/* Primary Address Card */}
                <Box sx={{ p: 2, borderRadius: '8px', backgroundColor: '#ffffff', border: '1px solid #e2e8f0' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                        <PlaceOutlinedIcon sx={{ fontSize: 18, color: '#2563eb' }} />
                        <Typography sx={{ fontSize: '0.82rem', fontWeight: 700, color: '#0f172a' }}>
                            PRIMARY REGISTERED ADDRESS
                        </Typography>
                    </Box>
                    <Typography sx={{ fontSize: '0.84rem', color: '#1e293b', fontWeight: 500, lineHeight: 1.4 }}>
                        {l.primaryAddress || 'No primary address specified'}
                    </Typography>
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, mt: 1.2, pt: 1, borderTop: '1px solid #f1f5f9' }}>
                        <Box>
                            <Typography sx={{ fontSize: '0.68rem', color: '#64748b', fontWeight: 700 }}>CITY / STATE</Typography>
                            <Typography sx={{ fontSize: '0.8rem', color: '#334155' }}>
                                {l.primaryCity || '-'}, {l.primaryState || '-'}
                            </Typography>
                        </Box>
                        <Box>
                            <Typography sx={{ fontSize: '0.68rem', color: '#64748b', fontWeight: 700 }}>POSTAL PIN</Typography>
                            <Typography sx={{ fontSize: '0.8rem', color: '#334155' }}>
                                {l.primaryPostalCode || '-'}
                            </Typography>
                        </Box>
                        <Box>
                            <Typography sx={{ fontSize: '0.68rem', color: '#64748b', fontWeight: 700 }}>COUNTRY</Typography>
                            <Typography sx={{ fontSize: '0.8rem', color: '#334155' }}>
                                {l.primaryCountry || 'India'}
                            </Typography>
                        </Box>
                    </Box>
                    {l.primaryLatitude && l.primaryLatitude !== '0.00000000' && (
                        <Box sx={{ mt: 1 }}>
                            <Chip label={`Lat: ${l.primaryLatitude}`} size="small" sx={{ height: 20, fontSize: '0.66rem', fontFamily: 'monospace' }} />
                        </Box>
                    )}
                </Box>

                {/* Other Address Card */}
                <Box sx={{ p: 2, borderRadius: '8px', backgroundColor: '#ffffff', border: '1px solid #e2e8f0' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                        <BusinessOutlinedIcon sx={{ fontSize: 18, color: '#64748b' }} />
                        <Typography sx={{ fontSize: '0.82rem', fontWeight: 700, color: '#0f172a' }}>
                            OTHER / DISPATCH ADDRESS
                        </Typography>
                    </Box>
                    <Typography sx={{ fontSize: '0.84rem', color: '#1e293b', fontWeight: 500, lineHeight: 1.4 }}>
                        {l.otherAddress || 'Same as primary address or not provided'}
                    </Typography>
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, mt: 1.2, pt: 1, borderTop: '1px solid #f1f5f9' }}>
                        <Box>
                            <Typography sx={{ fontSize: '0.68rem', color: '#64748b', fontWeight: 700 }}>CITY / STATE</Typography>
                            <Typography sx={{ fontSize: '0.8rem', color: '#334155' }}>
                                {l.otherCity || '-'}, {l.otherState || '-'}
                            </Typography>
                        </Box>
                        <Box>
                            <Typography sx={{ fontSize: '0.68rem', color: '#64748b', fontWeight: 700 }}>POSTAL PIN</Typography>
                            <Typography sx={{ fontSize: '0.8rem', color: '#334155' }}>
                                {l.otherPostalCode || '-'}
                            </Typography>
                        </Box>
                        <Box>
                            <Typography sx={{ fontSize: '0.68rem', color: '#64748b', fontWeight: 700 }}>COUNTRY</Typography>
                            <Typography sx={{ fontSize: '0.8rem', color: '#334155' }}>
                                {l.otherCountry || 'India'}
                            </Typography>
                        </Box>
                    </Box>
                    {l.otherLongitude && l.otherLongitude !== '0.00000000' && (
                        <Box sx={{ mt: 1 }}>
                            <Chip label={`Long: ${l.otherLongitude}`} size="small" sx={{ height: 20, fontSize: '0.66rem', fontFamily: 'monospace' }} />
                        </Box>
                    )}
                </Box>
            </Box>
        ),
    });

    const isHot = l.leadType === 'Hot';
    const isWarm = l.leadType === 'Warm';

    // Standard Audit trail revisions
    const auditRevisions: AuditRevisionItem[] = [
        {
            title: `Lead record updated`,
            author: l.assignedTo || 'mittal.sharma',
            time: '2 hours ago',
            note: `Status synchronized: ${l.status}`,
            tag: l.status,
        },
        {
            title: `Followup scheduled: ${l.followupType}`,
            author: l.assignedTo || 'mittal.sharma',
            time: '1 day ago',
            note: l.addDescription,
        },
        {
            title: `Lead captured via ${l.leadSource}`,
            author: l.createdBy || 'mittal.sharma',
            time: '3 days ago',
            note: `Assigned to ${l.assignedTo}`,
        },
    ];

    return (
        <EntityDetailDrawer
            open={open}
            onClose={onClose}
            title={l.name}
            subtitle={`${l.leadCode} • ${l.organizationName || 'Prospect'}`}
            avatarIcon={<PersonOutlinedIcon sx={{ fontSize: 24, color: '#ffffff' }} />}
            avatarBg={
                isHot
                    ? 'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)'
                    : 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)'
            }
            verified={true}
            badges={[
                {
                    label: l.leadType || 'Normal',
                    icon: isHot ? <LocalFireDepartmentIcon sx={{ fontSize: '13px !important' }} /> : undefined,
                    color: isHot ? '#b91c1c' : isWarm ? '#b45309' : '#1e3a8a',
                    backgroundColor: isHot ? '#fee2e2' : isWarm ? '#fef3c7' : '#eff6ff',
                    borderColor: isHot ? '#fca5a5' : isWarm ? '#fde68a' : '#bfdbfe',
                },
                {
                    label: l.status,
                    color: '#047857',
                    backgroundColor: '#ecfdf5',
                    borderColor: '#a7f3d0',
                },
                {
                    label: l.assignedTo || 'mittal.sharma',
                    color: '#475569',
                    backgroundColor: '#f1f5f9',
                    borderColor: '#cbd5e1',
                },
            ]}
            headerActions={{
                onEdit: handleEdit,
                onPhone: () => window.open(`tel:${l.mobile}`),
            }}
            tabs={tabs}
            auditRevisions={auditRevisions}
            includeChangesTab={true}
            statusText={`Next Followup: ${l.nextFollowupDate}`}
            primaryAction={{
                label: 'Edit Lead',
                onClick: handleEdit,
            }}
            secondaryAction={{
                label: 'Schedule Demo',
                onClick: () => {
                    alert(`Demo invitation email triggered for ${l.name}`);
                },
            }}
        />
    );
}
