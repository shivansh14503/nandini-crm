'use client';

import React, { useState, useEffect } from 'react';
import { getCountryNameByCode } from '@/data/addressMaster';
import { useRouter } from 'next/navigation';
import { Box, Typography, Chip, Divider } from '@mui/material';

// Icons
import PersonOutlinedIcon from '@mui/icons-material/PersonOutlined';
import PhoneOutlinedIcon from '@mui/icons-material/PhoneOutlined';
import EmailOutlinedIcon from '@mui/icons-material/EmailOutlined';
import ApartmentIcon from '@mui/icons-material/Apartment';
import LocalFireDepartmentIcon from '@mui/icons-material/LocalFireDepartment';
import CalendarMonthOutlinedIcon from '@mui/icons-material/CalendarMonthOutlined';
import PlaceOutlinedIcon from '@mui/icons-material/PlaceOutlined';
import BusinessOutlinedIcon from '@mui/icons-material/BusinessOutlined';
import CheckCircleOutlinedIcon from '@mui/icons-material/CheckCircleOutlined';
import AccessTimeOutlinedIcon from '@mui/icons-material/AccessTimeOutlined';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import PublishedWithChangesIcon from '@mui/icons-material/PublishedWithChanges';

import { ROUTES } from '@/config/constants';
import type { Lead } from '@/types/lead.types';
import { useLead } from '@/hooks/queries';
import {
    EntityDetailDrawer,
    DrawerSectionCard,
    DrawerMetricGrid,
    DrawerChannelRow,
} from '@/components/common/Drawer';
import { AppToast } from '@/components/common/AppToast';
import { LEAD_FORM_TABS } from './LeadForm';

export interface LeadDetailDrawerProps {
    lead: Lead | null;
    open: boolean;
    onClose: () => void;
    onEdit?: (id: string) => void;
    onLeadUpdated?: (updatedLead: Lead) => void;
    onShowToast?: (message: string, severity?: 'success' | 'error' | 'info' | 'warning') => void;
}

export function LeadDetailDrawer({
    lead,
    open,
    onClose,
    onEdit,
    onLeadUpdated,
    onShowToast,
}: LeadDetailDrawerProps) {
    const router = useRouter();

    const { data: freshLead } = useLead(open && lead?.id ? lead.id : undefined);

    useEffect(() => {
        if (freshLead) {
            onLeadUpdated?.(freshLead);
        }
    }, [freshLead, onLeadUpdated]);

    const [toast, setToast] = useState<{
        open: boolean;
        message: string;
        severity: 'success' | 'error' | 'info' | 'warning';
    }>({
        open: false,
        message: '',
        severity: 'error',
    });

    const l = freshLead ?? lead;
    if (!l) return null;

    const triggerToast = (message: string, severity: 'success' | 'error' | 'info' | 'warning' = 'error') => {
        setToast({ open: true, message, severity });
        onShowToast?.(message, severity);
    };

    const handleConvertLead = () => {
        const orgName = (l.organizationName || '').trim();
        if (!orgName) {
            triggerToast('Organisation Name is required.', 'error');
            return;
        }

        if (l.status === 'Converted') {
            triggerToast('This lead has already been converted.', 'info');
            return;
        }

        router.push(ROUTES.LEAD_CONVERT(l.id));
    };

    const handleEdit = () => {
        if (onEdit) {
            onEdit(l.id);
        } else {
            router.push(ROUTES.LEAD_EDIT(l.id));
        }
    };

    const isHot = l.leadType === 'Hot';
    const isWarm = l.leadType === 'Warm';
    const hasOrg = Boolean(l.organizationName && l.organizationName.trim().length > 0);
    const isConverted = l.status === 'Converted';

    return (
        <>
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
                    label: l.assignedTo || 'Unassigned',
                    color: '#475569',
                    backgroundColor: '#f1f5f9',
                    borderColor: '#cbd5e1',
                },
            ]}
            headerActions={{
                onEdit: handleEdit,
                onView: () => router.push(ROUTES.LEAD_DETAIL(l.id)),
            }}
            formTabs={LEAD_FORM_TABS}
            tabContents={{
                overview: (
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        {/* Linked Organization Card */}
                        <DrawerSectionCard title="PROSPECTIVE ORGANIZATION" bg="#f8fafc">
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
                        </DrawerSectionCard>

                        {/* Next Followup Highlight Card */}
                        <DrawerSectionCard
                            title="NEXT SCHEDULED FOLLOWUP"
                            icon={<CalendarMonthOutlinedIcon sx={{ fontSize: 18, color: '#d97706' }} />}
                            titleSx={{ fontSize: '0.8rem', fontWeight: 800, color: '#92400e' }}
                            bg="#fffbeb"
                            borderColor="#fde68a"
                            action={
                                l.followupType ? (
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
                                ) : undefined
                            }
                        >
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
                        </DrawerSectionCard>

                        {/* Product Categories Interested In */}
                        <DrawerSectionCard title="PRODUCTS & SOLUTIONS OF INTEREST">
                            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.8, mt: 0.5 }}>
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
                        </DrawerSectionCard>

                        {/* Contact Phone & Channels */}
                        <DrawerSectionCard
                            title="Direct Phone & Email"
                            icon={<PhoneOutlinedIcon sx={{ fontSize: 16, color: '#2563eb' }} />}
                        >
                            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.2 }}>
                                <DrawerChannelRow
                                    icon={<PhoneOutlinedIcon sx={{ fontSize: 16, color: '#16a34a' }} />}
                                    value={l.mobile}
                                    valueWeight={700}
                                    caption="Primary Mobile / WhatsApp"
                                    copyValue={l.mobile}
                                    copyTitle="Copy Phone"
                                />

                                {l.otherPhone && (
                                    <>
                                        <Divider sx={{ borderColor: '#f1f5f9' }} />
                                        <DrawerChannelRow
                                            icon={<PhoneOutlinedIcon sx={{ fontSize: 16, color: '#64748b' }} />}
                                            value={l.otherPhone}
                                            valueColor="#334155"
                                            caption="Other / Landline Phone"
                                            copyValue={l.otherPhone}
                                            copyTitle="Copy Phone"
                                        />
                                    </>
                                )}

                                {l.emailAddresses && l.emailAddresses.length > 0 && (
                                    <>
                                        <Divider sx={{ borderColor: '#f1f5f9' }} />
                                        {l.emailAddresses.map((em, idx) => (
                                            <DrawerChannelRow
                                                key={idx}
                                                icon={<EmailOutlinedIcon sx={{ fontSize: 16, color: '#2563eb' }} />}
                                                value={em.email}
                                                caption={em.isPrimary ? 'Primary Official Email' : 'Alternate Email'}
                                                badgeLabel={em.isPrimary ? 'PRIMARY' : undefined}
                                            />
                                        ))}
                                    </>
                                )}
                            </Box>
                        </DrawerSectionCard>

                        {/* Profile & Business Metrics Grid */}
                        <DrawerMetricGrid
                            items={[
                                { label: 'DESIGNATION', value: l.designation || 'Key Decision Maker', valueSize: '0.86rem' },
                                { label: 'DEPARTMENT', value: l.department || 'Management', valueSize: '0.86rem' },
                                {
                                    label: 'ANNUAL TURNOVER',
                                    value: l.turnover || 'Not Disclosed',
                                    valueSize: '0.82rem',
                                    valueWeight: 600,
                                    valueColor: '#334155',
                                },
                                {
                                    label: 'NO OF EMPLOYEES',
                                    value: l.noOfEmployee || '11 – 50 Staff',
                                    valueSize: '0.82rem',
                                    valueWeight: 600,
                                    valueColor: '#334155',
                                },
                            ]}
                        />

                        {/* Source & Representative Details */}
                        <DrawerSectionCard bg="#f8fafc">
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
                        </DrawerSectionCard>

                        {/* Long Description */}
                        {l.description && (
                            <DrawerSectionCard title="BACKGROUND CONTEXT & NOTES">
                                <Typography sx={{ fontSize: '0.82rem', color: '#334155', lineHeight: 1.5 }}>
                                    {l.description}
                                </Typography>
                            </DrawerSectionCard>
                        )}
                    </Box>
                ),
                address: (
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        {/* Primary Address Card */}
                        <DrawerSectionCard
                            title="PRIMARY REGISTERED ADDRESS"
                            icon={<PlaceOutlinedIcon sx={{ fontSize: 18, color: '#2563eb' }} />}
                        >
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
                                        {getCountryNameByCode(l.primaryCountry || 'IN')}
                                    </Typography>
                                </Box>
                            </Box>
                        </DrawerSectionCard>

                        {/* Other Address Card */}
                        <DrawerSectionCard
                            title="OTHER / DISPATCH ADDRESS"
                            icon={<BusinessOutlinedIcon sx={{ fontSize: 18, color: '#64748b' }} />}
                        >
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
                                        {getCountryNameByCode(l.otherCountry || 'IN')}
                                    </Typography>
                                </Box>
                            </Box>
                        </DrawerSectionCard>
                    </Box>
                ),
            }}
            auditEntity={{ type: 'leads', id: l.id }}
            includeChangesTab={true}
            statusText={isConverted ? 'Lead Converted' : `Next Followup: ${l.nextFollowupDate}`}
            primaryAction={{
                label: 'Edit Lead',
                onClick: handleEdit,
                icon: <EditOutlinedIcon sx={{ fontSize: 16 }} />,
            }}
            secondaryAction={{
                label: isConverted ? 'Lead Converted' : 'Convert Lead',
                icon: isConverted ? (
                    <CheckCircleOutlinedIcon sx={{ fontSize: 16, color: '#059669' }} />
                ) : (
                    <PublishedWithChangesIcon sx={{ fontSize: 16 }} />
                ),
                onClick: handleConvertLead,
                variant: 'outlined',
                tooltip: !hasOrg
                    ? 'Organisation Name is required to convert lead'
                    : isConverted
                    ? 'Lead has already been converted'
                    : 'Convert Lead to Organization & Contact',
                sx: {
                    fontSize: '0.78rem',
                    textTransform: 'none',
                    fontWeight: 700,
                    height: 36,
                    px: 1.8,
                    borderRadius: '6px',
                    color: isConverted ? '#047857' : hasOrg ? '#047857' : '#dc2626',
                    borderColor: isConverted ? '#a7f3d0' : hasOrg ? '#a7f3d0' : '#fca5a5',
                    backgroundColor: isConverted ? '#ecfdf5' : hasOrg ? '#ecfdf5' : '#fef2f2',
                    '&:hover': {
                        borderColor: isConverted ? '#047857' : hasOrg ? '#059669' : '#ef4444',
                        backgroundColor: isConverted ? '#d1fae5' : hasOrg ? '#d1fae5' : '#fee2e2',
                    },
                },
            }}
        />
        <AppToast
            open={toast.open}
            message={toast.message}
            severity={toast.severity}
            onClose={() => setToast((prev) => ({ ...prev, open: false }))}
        />
    </>
    );
}
