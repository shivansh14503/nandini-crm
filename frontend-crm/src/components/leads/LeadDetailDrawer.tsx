'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

// Icons
import CheckCircleOutlinedIcon from '@mui/icons-material/CheckCircleOutlined';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import PublishedWithChangesIcon from '@mui/icons-material/PublishedWithChanges';

import { ROUTES } from '@/config/constants';
import { withListOrigin } from '@/utils/listOrigin';
import type { Lead } from '@/types/lead.types';
import { useLead } from '@/hooks/queries';
import { EntityDetailDrawer } from '@/components/common/Drawer';
import { useLayoutDrawerProps } from '@/components/common/Drawer/layout';
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

    // Header, badges and tabs come from the Leads drawer layout (Admin › Form Customization › Drawer Layout).
    const view = useLayoutDrawerProps('leads', freshLead ?? lead, LEAD_FORM_TABS);

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

    const hasOrg = Boolean(l.organizationName && l.organizationName.trim().length > 0);
    const isConverted = l.status === 'Converted';

    return (
        <>
            <EntityDetailDrawer
            open={open}
            module="leads"
            onClose={onClose}
            title={view.title}
            subtitle={view.subtitle}
            avatarIcon={view.avatarIcon}
            avatarBg={view.avatarBg}
            verified={true}
            badges={view.badges}
            headerAside={view.headerAside}
            headerActions={{
                onEdit: handleEdit,
                onView: () => router.push(withListOrigin(ROUTES.LEAD_DETAIL(l.id))),
            }}
            formTabs={view.formTabs}
            tabContents={view.tabContents}
            auditEntity={{ type: 'leads', id: l.id }}
            recordAudit={l}
            includeChangesTab={true}
            primaryAction={{
                label: 'Edit Lead',
                onClick: handleEdit,
                icon: <EditOutlinedIcon sx={{ fontSize: 16 }} />,
            }}
            secondaryAction={{
                label: isConverted ? 'Lead Converted' : 'Convert Lead',
                icon: isConverted ? (
                    <CheckCircleOutlinedIcon sx={{ fontSize: 16, color: 'var(--crm-logo-green-text)' }} />
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
                    // Company-logo green in both themes; red while the lead has no organisation to convert to.
                    color: isConverted || hasOrg ? 'var(--crm-logo-green-text)' : 'var(--mui-palette-error-main)',
                    borderColor: isConverted || hasOrg ? 'var(--crm-logo-green-border)' : 'var(--crm-red-300)',
                    backgroundColor: isConverted || hasOrg ? 'var(--crm-logo-green-soft)' : 'var(--mui-palette-error-soft)',
                    '&:hover': {
                        borderColor: isConverted || hasOrg ? 'var(--crm-logo-green-border-hover)' : 'var(--crm-red-500)',
                        backgroundColor: isConverted || hasOrg ? 'var(--crm-logo-green-soft-hover)' : 'var(--crm-red-100)',
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
