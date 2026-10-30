'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Box, Chip, Typography } from '@mui/material';
import ConfirmationNumberOutlinedIcon from '@mui/icons-material/ConfirmationNumberOutlined';
import ReportProblemOutlinedIcon from '@mui/icons-material/ReportProblemOutlined';
import BuildCircleOutlinedIcon from '@mui/icons-material/BuildCircleOutlined';
import ApartmentOutlinedIcon from '@mui/icons-material/ApartmentOutlined';
import PersonOutlineIcon from '@mui/icons-material/PersonOutlined';
import HandshakeOutlinedIcon from '@mui/icons-material/HandshakeOutlined';
import ContentCopyOutlinedIcon from '@mui/icons-material/ContentCopyOutlined';

import { ROUTES } from '@/config/constants';
import { isTicketOverdue, type Ticket } from '@/types/ticket.types';
import { useTicket } from '@/hooks/queries';
import { findCrmUser } from '@/services/masterData.store';
import { ReadOnlyField } from '@/components/forms/ReadOnlyField';
import {
    EntityDetailDrawer,
    DrawerSectionCard,
    DrawerMetricGrid,
    copyToClipboard,
} from '@/components/common/Drawer';
import { TICKET_FORM_TABS } from './TicketForm';
import { TicketPriorityPill, TicketStatusPill, formatTicketDue } from './TicketBadges';

export interface TicketDetailDrawerProps {
    ticket: Ticket | null;
    open: boolean;
    onClose: () => void;
    onEdit?: (id: string) => void;
    hideBackdrop?: boolean;
}

const sectionIcon = (icon: React.ReactNode) => (
    <Box sx={{ color: '#2563eb', display: 'inline-flex' }}>{icon}</Box>
);

const getInitials = (name: string) => {
    const parts = name.replace(/[._-]+/g, ' ').trim().split(/\s+/);
    return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
};

/** Labelled multi-line text; renders nothing when empty. */
function TextBlock({ label, value }: { label: string; value?: string }) {
    if (!value?.trim()) return null;
    return (
        <Box sx={{ '& + &': { mt: 1.5 } }}>
            <Typography sx={{ fontSize: '0.68rem', fontWeight: 700, color: '#64748b', letterSpacing: 0.3, mb: 0.4 }}>
                {label.toUpperCase()}
            </Typography>
            <Typography sx={{ fontSize: '0.84rem', color: '#334155', lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>{value}</Typography>
        </Box>
    );
}

const flagChip = (label: string) => (
    <Chip
        key={label}
        label={label}
        size="small"
        sx={{ height: 20, fontSize: '0.68rem', fontWeight: 700, backgroundColor: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe' }}
    />
);

export function TicketDetailDrawer({ ticket, open, onClose, onEdit, hideBackdrop }: TicketDetailDrawerProps) {
    const router = useRouter();

    const { data: freshTicket } = useTicket(open && ticket?.id ? ticket.id : undefined);
    const t = freshTicket ?? ticket;

    if (!t) return null;

    const handleEdit = () => (onEdit ? onEdit(t.id) : router.push(ROUTES.TICKET_EDIT(t.id)));
    const overdue = isTicketOverdue(t);
    const assignedUser = findCrmUser(t.assignedTo);
    const assignedDisplayName = assignedUser?.name || t.assignedTo;
    const flags = [t.amcFlag && 'AMC', t.cloudFlag && 'Cloud'].filter((f): f is string => Boolean(f));

    return (
        <EntityDetailDrawer
            open={open}
            onClose={onClose}
            hideBackdrop={hideBackdrop}
            title={t.ticketSubject || t.ticketNumber}
            subtitle={`${t.ticketNumber} • ${t.organizationName}`}
            avatarIcon={<ConfirmationNumberOutlinedIcon />}
            avatarBg="linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%)"
            badges={[
                {
                    label: t.ticketNumber,
                    isMonospace: true,
                    backgroundColor: '#eff6ff',
                    color: '#1d4ed8',
                    borderColor: '#bfdbfe',
                },
                {
                    label: t.natureOfCall || 'General',
                    backgroundColor: '#f8fafc',
                    color: '#475569',
                    borderColor: '#e2e8f0',
                },
            ]}
            headerActions={{
                onEdit: handleEdit,
                onView: () => router.push(ROUTES.TICKET_DETAIL(t.id)),
            }}
            formTabs={TICKET_FORM_TABS}
            tabContents={{
                overview: (
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <DrawerMetricGrid
                            items={[
                                { label: 'PRIORITY', value: <TicketPriorityPill priority={t.ticketPriority} />, bg: '#f8fafc', borderColor: '#f1f5f9', p: 1.2 },
                                { label: 'STATUS', value: <TicketStatusPill status={t.ticketStatus} />, bg: '#f8fafc', borderColor: '#f1f5f9', p: 1.2 },
                                {
                                    label: 'SUPPORT TYPE',
                                    value: t.supportType,
                                    valueSize: '0.92rem',
                                    valueWeight: 800,
                                    bg: '#f8fafc',
                                    borderColor: '#f1f5f9',
                                    p: 1.2,
                                    sublabel: flags.length ? <Box sx={{ display: 'flex', gap: 0.5, mt: 0.6 }}>{flags.map(flagChip)}</Box> : undefined,
                                },
                                {
                                    label: 'DUE DATE',
                                    value: formatTicketDue(t.dueDate),
                                    valueSize: '0.86rem',
                                    valueWeight: 800,
                                    labelColor: overdue ? '#b91c1c' : undefined,
                                    valueColor: overdue ? '#b91c1c' : '#0f172a',
                                    bg: overdue ? '#fef2f2' : '#f8fafc',
                                    borderColor: overdue ? '#fecaca' : '#f1f5f9',
                                    p: 1.2,
                                    sublabel: overdue ? (
                                        <Typography sx={{ fontSize: '0.7rem', fontWeight: 700, color: '#dc2626', mt: 0.4 }}>Overdue</Typography>
                                    ) : undefined,
                                },
                            ]}
                        />

                        <DrawerSectionCard p={1.8} icon={sectionIcon(<ReportProblemOutlinedIcon sx={{ fontSize: 15 }} />)} title="Problem Details">
                            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1.5, mb: 1.5 }}>
                                <ReadOnlyField label="Nature Of Call" value={t.natureOfCall} />
                                <ReadOnlyField label="Support Mode" value={t.supportMode} />
                                <ReadOnlyField label="Source" value={t.source} />
                            </Box>
                            <TextBlock label="Problem Reported" value={t.problemReported} />
                            <TextBlock label="Problem Observed" value={t.problemObserved} />
                            <TextBlock label="Reason For Escalated Calls" value={t.reasonForEscalatedCalls} />
                        </DrawerSectionCard>

                        <DrawerSectionCard p={1.8} icon={sectionIcon(<BuildCircleOutlinedIcon sx={{ fontSize: 15 }} />)} title="Resolution & RCA">
                            {t.resolution || t.rca || t.addDescription ? (
                                <>
                                    <TextBlock label="Resolution" value={t.resolution} />
                                    <TextBlock label="RCA (Root Cause Analysis)" value={t.rca} />
                                    <TextBlock label="Additional Description" value={t.addDescription} />
                                </>
                            ) : (
                                <Typography sx={{ color: '#94a3b8', fontSize: '0.84rem' }}>No resolution recorded yet.</Typography>
                            )}
                        </DrawerSectionCard>

                        <DrawerSectionCard p={1.8} icon={sectionIcon(<ApartmentOutlinedIcon sx={{ fontSize: 15 }} />)} title="Client & Contact Information">
                            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 1.5 }}>
                                <ReadOnlyField label="Organization" value={t.organizationName} />
                                <ReadOnlyField label="Contact Person" value={t.contactPersonName} />
                                <ReadOnlyField label="Contact Number" value={t.contactNumber} />
                                <ReadOnlyField label="Contact Email" value={t.contactEmail} />
                                <ReadOnlyField label="Left Job" value={t.leftJob} />
                            </Box>
                            <Box sx={{ mt: 1.5 }}>
                                <TextBlock label="Account Address" value={t.accountAddress} />
                            </Box>
                        </DrawerSectionCard>

                        <DrawerSectionCard p={1.8} icon={sectionIcon(<PersonOutlineIcon sx={{ fontSize: 15 }} />)} title="Assigned Representative">
                            {t.assignedTo ? (
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
                                    <Box
                                        sx={{
                                            width: 34,
                                            height: 34,
                                            borderRadius: '50%',
                                            background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
                                            color: '#ffffff',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            fontSize: '0.78rem',
                                            fontWeight: 700,
                                            boxShadow: '0 2px 8px rgba(79, 70, 229, 0.25)',
                                        }}
                                    >
                                        {getInitials(assignedDisplayName)}
                                    </Box>
                                    <Box>
                                        <Typography sx={{ fontSize: '0.88rem', fontWeight: 700, color: '#0f172a', lineHeight: 1.3 }}>
                                            {assignedDisplayName}
                                        </Typography>
                                        <Typography sx={{ fontSize: '0.72rem', color: '#64748b' }}>
                                            {assignedUser ? `${assignedUser.role} • ${assignedUser.department}` : 'Support Representative'}
                                        </Typography>
                                    </Box>
                                </Box>
                            ) : (
                                <Typography sx={{ color: '#94a3b8', fontSize: '0.86rem' }}>Unassigned</Typography>
                            )}
                        </DrawerSectionCard>
                    </Box>
                ),
                partner_company: (
                    <DrawerSectionCard p={1.8} icon={sectionIcon(<HandshakeOutlinedIcon sx={{ fontSize: 15 }} />)} title="Partner Company">
                        {t.partnerCompany || t.partnerCompanyContact ? (
                            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 1.5 }}>
                                <ReadOnlyField label="Partner Company" value={t.partnerCompany} />
                                <ReadOnlyField label="Partner Company Contact" value={t.partnerCompanyContact} />
                            </Box>
                        ) : (
                            <Typography sx={{ color: '#94a3b8', fontSize: '0.84rem' }}>No partner company involved.</Typography>
                        )}
                    </DrawerSectionCard>
                ),
            }}
            auditEntity={{ type: 'tickets', id: t.id }}
            includeChangesTab
            statusText={overdue ? `${t.ticketStatus} • Overdue` : t.ticketStatus}
            primaryAction={{ label: 'Edit Ticket', onClick: handleEdit }}
            secondaryAction={{
                label: 'Copy Ticket Number',
                icon: <ContentCopyOutlinedIcon sx={{ fontSize: 16 }} />,
                onClick: () => copyToClipboard(t.ticketNumber),
            }}
        />
    );
}
