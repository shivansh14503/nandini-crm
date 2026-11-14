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
import { useLead, useDropdownOptionLabel } from '@/hooks/queries';
import {
    EntityDetailDrawer,
    DrawerSectionCard,
    DrawerMetricGrid,
    DrawerChannelRow,
} from '@/components/common/Drawer';
import { AppToast } from '@/components/common/AppToast';
import { LEAD_FORM_TABS } from './LeadForm';
import { DynamicDrawerCustomFields } from '@/components/common/Drawer/DynamicDrawerCustomFields';

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
    const leadSourceLabel = useDropdownOptionLabel('shared_lead_source');

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
                    : 'linear-gradient(135deg, var(--crm-fill-blue-600) 0%, var(--crm-fill-blue-700) 100%)'
            }
            verified={true}
            badges={[
                {
                    label: l.leadType || 'Normal',
                    icon: isHot ? <LocalFireDepartmentIcon sx={{ fontSize: '13px !important' }} /> : undefined,
                    color: isHot ? 'var(--crm-red-700)' : isWarm ? 'var(--crm-amber-700)' : 'var(--crm-text-blue-900)',
                    backgroundColor: isHot ? 'var(--crm-red-100)' : isWarm ? 'var(--crm-amber-100)' : 'var(--mui-palette-primary-soft)',
                    borderColor: isHot ? 'var(--crm-red-300)' : isWarm ? 'var(--mui-palette-warning-softBorder)' : 'var(--mui-palette-primary-softBorder)',
                },
                {
                    label: l.status,
                    color: 'var(--crm-emerald-700)',
                    backgroundColor: 'var(--mui-palette-success-soft)',
                    borderColor: 'var(--mui-palette-success-softBorder)',
                },
                {
                    label: l.assignedTo || 'Unassigned',
                    color: 'var(--crm-slate-600)',
                    backgroundColor: 'var(--mui-palette-background-hover)',
                    borderColor: 'var(--mui-palette-border-strong)',
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
                        <DrawerSectionCard title="PROSPECTIVE ORGANIZATION" bg="var(--mui-palette-background-subtle)">
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5 }}>
                                <ApartmentIcon sx={{ fontSize: 18, color: 'var(--crm-text-blue-600)' }} />
                                <Typography sx={{ fontSize: '0.98rem', fontWeight: 800, color: 'var(--crm-text-blue-700)' }}>
                                    {l.organizationName || 'Individual Prospect / Non-Entity'}
                                </Typography>
                            </Box>
                            {l.mailingName && l.mailingName !== l.organizationName && (
                                <Typography sx={{ fontSize: '0.75rem', color: 'var(--mui-palette-text-secondary)', mt: 0.3 }}>
                                    Mailing Name: {l.mailingName}
                                </Typography>
                            )}
                        </DrawerSectionCard>

                        {/* Next Followup Highlight Card */}
                        <DrawerSectionCard
                            title="NEXT SCHEDULED FOLLOWUP"
                            icon={<CalendarMonthOutlinedIcon sx={{ fontSize: 18, color: 'var(--mui-palette-warning-main)' }} />}
                            titleSx={{ fontSize: '0.8rem', fontWeight: 800, color: 'var(--crm-amber-800)' }}
                            bg="var(--mui-palette-warning-soft)"
                            borderColor="var(--mui-palette-warning-softBorder)"
                            action={
                                l.followupType ? (
                                    <Chip
                                        label={l.followupType}
                                        size="small"
                                        sx={{
                                            height: 20,
                                            fontSize: '0.68rem',
                                            fontWeight: 700,
                                            backgroundColor: 'var(--crm-amber-100)',
                                            color: 'var(--crm-amber-700)',
                                            border: '1px solid var(--crm-amber-300)',
                                        }}
                                    />
                                ) : undefined
                            }
                        >
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, my: 0.5 }}>
                                <Typography sx={{ fontSize: '0.94rem', fontWeight: 700, color: 'var(--crm-amber-900)' }}>
                                    {l.nextFollowupDate}
                                </Typography>
                                {l.nextFollowupTime && (
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.4 }}>
                                        <AccessTimeOutlinedIcon sx={{ fontSize: 14, color: 'var(--crm-amber-700)' }} />
                                        <Typography sx={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--crm-amber-800)' }}>
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
                                        backgroundColor: 'var(--mui-palette-background-paper)',
                                        border: '1px solid var(--crm-orange-200)',
                                    }}
                                >
                                    <Typography sx={{ fontSize: '0.74rem', color: 'var(--crm-orange-800)', fontWeight: 500, lineHeight: 1.4 }}>
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
                                            icon={<CheckCircleOutlinedIcon sx={{ fontSize: '13px !important', color: 'var(--crm-green-700) !important' }} />}
                                            sx={{
                                                height: 24,
                                                fontSize: '0.74rem',
                                                fontWeight: 700,
                                                backgroundColor: 'var(--crm-green-100)',
                                                color: 'var(--crm-green-800)',
                                                border: '1px solid var(--crm-green-300)',
                                            }}
                                        />
                                    ))
                                ) : (
                                    <Typography sx={{ fontSize: '0.8rem', color: 'var(--mui-palette-text-muted)' }}>None specified</Typography>
                                )}
                            </Box>
                        </DrawerSectionCard>

                        {/* Contact Phone & Channels */}
                        <DrawerSectionCard
                            title="Direct Phone & Email"
                            icon={<PhoneOutlinedIcon sx={{ fontSize: 16, color: 'var(--crm-text-blue-600)' }} />}
                        >
                            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.2 }}>
                                <DrawerChannelRow
                                    icon={<PhoneOutlinedIcon sx={{ fontSize: 16, color: 'var(--mui-palette-success-main)' }} />}
                                    value={l.mobile}
                                    valueWeight={700}
                                    caption="Primary Mobile / WhatsApp"
                                    copyValue={l.mobile}
                                    copyTitle="Copy Phone"
                                />

                                {l.otherPhone && (
                                    <>
                                        <Divider sx={{ borderColor: 'var(--mui-palette-border-light)' }} />
                                        <DrawerChannelRow
                                            icon={<PhoneOutlinedIcon sx={{ fontSize: 16, color: 'var(--mui-palette-text-secondary)' }} />}
                                            value={l.otherPhone}
                                            valueColor="var(--crm-slate-700)"
                                            caption="Other / Landline Phone"
                                            copyValue={l.otherPhone}
                                            copyTitle="Copy Phone"
                                        />
                                    </>
                                )}

                                {l.emailAddresses && l.emailAddresses.length > 0 && (
                                    <>
                                        <Divider sx={{ borderColor: 'var(--mui-palette-border-light)' }} />
                                        {l.emailAddresses.map((em, idx) => (
                                            <DrawerChannelRow
                                                key={idx}
                                                icon={<EmailOutlinedIcon sx={{ fontSize: 16, color: 'var(--crm-text-blue-600)' }} />}
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
                                    valueColor: 'var(--crm-slate-700)',
                                },
                                {
                                    label: 'NO OF EMPLOYEES',
                                    value: l.noOfEmployee || '11 – 50 Staff',
                                    valueSize: '0.82rem',
                                    valueWeight: 600,
                                    valueColor: 'var(--crm-slate-700)',
                                },
                            ]}
                        />

                        {/* Source & Representative Details */}
                        <DrawerSectionCard bg="var(--mui-palette-background-subtle)">
                            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 1.5 }}>
                                <Box>
                                    <Typography sx={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--mui-palette-text-secondary)' }}>LEAD SOURCE</Typography>
                                    <Typography sx={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--crm-text-blue-900)', mt: 0.3 }}>
                                        {leadSourceLabel(l.leadSource)}
                                    </Typography>
                                </Box>
                                <Box>
                                    <Typography sx={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--mui-palette-text-secondary)' }}>ASSIGNED TO</Typography>
                                    <Typography sx={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--crm-slate-900)', mt: 0.3 }}>
                                        {l.assignedTo}
                                    </Typography>
                                </Box>
                            </Box>
                            {l.referredBy && (
                                <Box sx={{ mt: 1.2, pt: 1, borderTop: '1px dashed var(--mui-palette-border-strong)' }}>
                                    <Typography sx={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--mui-palette-text-secondary)' }}>REFERRED BY</Typography>
                                    <Typography sx={{ fontSize: '0.8rem', color: 'var(--crm-slate-700)', mt: 0.2 }}>
                                        {l.referredBy}
                                    </Typography>
                                </Box>
                            )}
                        </DrawerSectionCard>

                        {/* Long Description */}
                        {l.description && (
                            <DrawerSectionCard title="BACKGROUND CONTEXT & NOTES">
                                <Typography sx={{ fontSize: '0.82rem', color: 'var(--crm-slate-700)', lineHeight: 1.5 }}>
                                    {l.description}
                                </Typography>
                            </DrawerSectionCard>
                        )}

                        {/* Admin-defined custom fields */}
                        <DynamicDrawerCustomFields module="leads" record={l} />
                    </Box>
                ),
                address: (
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        {/* Primary Address Card */}
                        <DrawerSectionCard
                            title="PRIMARY REGISTERED ADDRESS"
                            icon={<PlaceOutlinedIcon sx={{ fontSize: 18, color: 'var(--crm-text-blue-600)' }} />}
                        >
                            <Typography sx={{ fontSize: '0.84rem', color: 'var(--mui-palette-text-primary)', fontWeight: 500, lineHeight: 1.4 }}>
                                {l.primaryAddress || 'No primary address specified'}
                            </Typography>
                            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, mt: 1.2, pt: 1, borderTop: '1px solid var(--mui-palette-border-light)' }}>
                                <Box>
                                    <Typography sx={{ fontSize: '0.68rem', color: 'var(--mui-palette-text-secondary)', fontWeight: 700 }}>CITY / STATE</Typography>
                                    <Typography sx={{ fontSize: '0.8rem', color: 'var(--crm-slate-700)' }}>
                                        {l.primaryCity || '-'}, {l.primaryState || '-'}
                                    </Typography>
                                </Box>
                                <Box>
                                    <Typography sx={{ fontSize: '0.68rem', color: 'var(--mui-palette-text-secondary)', fontWeight: 700 }}>POSTAL PIN</Typography>
                                    <Typography sx={{ fontSize: '0.8rem', color: 'var(--crm-slate-700)' }}>
                                        {l.primaryPostalCode || '-'}
                                    </Typography>
                                </Box>
                                <Box>
                                    <Typography sx={{ fontSize: '0.68rem', color: 'var(--mui-palette-text-secondary)', fontWeight: 700 }}>COUNTRY</Typography>
                                    <Typography sx={{ fontSize: '0.8rem', color: 'var(--crm-slate-700)' }}>
                                        {getCountryNameByCode(l.primaryCountry || 'IN')}
                                    </Typography>
                                </Box>
                            </Box>
                        </DrawerSectionCard>

                        {/* Other Address Card */}
                        <DrawerSectionCard
                            title="OTHER / DISPATCH ADDRESS"
                            icon={<BusinessOutlinedIcon sx={{ fontSize: 18, color: 'var(--mui-palette-text-secondary)' }} />}
                        >
                            <Typography sx={{ fontSize: '0.84rem', color: 'var(--mui-palette-text-primary)', fontWeight: 500, lineHeight: 1.4 }}>
                                {l.otherAddress || 'Same as primary address or not provided'}
                            </Typography>
                            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, mt: 1.2, pt: 1, borderTop: '1px solid var(--mui-palette-border-light)' }}>
                                <Box>
                                    <Typography sx={{ fontSize: '0.68rem', color: 'var(--mui-palette-text-secondary)', fontWeight: 700 }}>CITY / STATE</Typography>
                                    <Typography sx={{ fontSize: '0.8rem', color: 'var(--crm-slate-700)' }}>
                                        {l.otherCity || '-'}, {l.otherState || '-'}
                                    </Typography>
                                </Box>
                                <Box>
                                    <Typography sx={{ fontSize: '0.68rem', color: 'var(--mui-palette-text-secondary)', fontWeight: 700 }}>POSTAL PIN</Typography>
                                    <Typography sx={{ fontSize: '0.8rem', color: 'var(--crm-slate-700)' }}>
                                        {l.otherPostalCode || '-'}
                                    </Typography>
                                </Box>
                                <Box>
                                    <Typography sx={{ fontSize: '0.68rem', color: 'var(--mui-palette-text-secondary)', fontWeight: 700 }}>COUNTRY</Typography>
                                    <Typography sx={{ fontSize: '0.8rem', color: 'var(--crm-slate-700)' }}>
                                        {getCountryNameByCode(l.otherCountry || 'IN')}
                                    </Typography>
                                </Box>
                            </Box>
                        </DrawerSectionCard>
                    </Box>
                ),
            }}
            auditEntity={{ type: 'leads', id: l.id }}
            recordAudit={l}
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
                    <CheckCircleOutlinedIcon sx={{ fontSize: 16, color: 'var(--crm-emerald-600)' }} />
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
                    color: isConverted ? 'var(--crm-emerald-700)' : hasOrg ? 'var(--crm-emerald-700)' : 'var(--mui-palette-error-main)',
                    borderColor: isConverted ? 'var(--mui-palette-success-softBorder)' : hasOrg ? 'var(--mui-palette-success-softBorder)' : 'var(--crm-red-300)',
                    backgroundColor: isConverted ? 'var(--mui-palette-success-soft)' : hasOrg ? 'var(--mui-palette-success-soft)' : 'var(--mui-palette-error-soft)',
                    '&:hover': {
                        borderColor: isConverted ? 'var(--crm-emerald-700)' : hasOrg ? 'var(--crm-emerald-600)' : 'var(--crm-red-500)',
                        backgroundColor: isConverted ? 'var(--crm-emerald-100)' : hasOrg ? 'var(--crm-emerald-100)' : 'var(--crm-red-100)',
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
