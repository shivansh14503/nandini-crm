'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';

// Icons
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import RequestQuoteOutlinedIcon from '@mui/icons-material/RequestQuoteOutlined';
import CheckCircleOutlinedIcon from '@mui/icons-material/CheckCircleOutlined';

import { ROUTES } from '@/config/constants';
import { recordActivitiesContext } from '@/components/activities/activityLinks';
import { withListOrigin } from '@/utils/listOrigin';
import type { Opportunity } from '@/types/opportunity.types';
import { EntityDetailDrawer } from '@/components/common/Drawer';
import { useLayoutDrawerProps } from '@/components/common/Drawer/layout';
import { AppToast } from '@/components/common/AppToast';
import { useOpportunity, useOrganization, useOrganizations, useQuotations } from '@/hooks/queries';
import { OPPORTUNITY_FORM_TABS } from './OpportunityForm';

export interface OpportunityDetailDrawerProps {
    opportunity: Opportunity | null;
    open: boolean;
    onClose: () => void;
    onEdit?: (id: string) => void;
    onShowToast?: (message: string, severity?: 'success' | 'error' | 'info' | 'warning') => void;
}

export function OpportunityDetailDrawer({
    opportunity,
    open,
    onClose,
    onEdit,
    onShowToast,
}: OpportunityDetailDrawerProps) {
    const router = useRouter();

    const { data: freshOpp } = useOpportunity(open && opportunity?.id ? opportunity.id : undefined);
    const opp = freshOpp ?? opportunity;

    // Header, badges and tabs come from the Opportunities drawer layout (Admin › Form Customization › Drawer Layout).
    const view = useLayoutDrawerProps('opportunities', opp, OPPORTUNITY_FORM_TABS);

    const { data: linkedOrgById } = useOrganization(
        open && opp?.organizationId ? opp.organizationId : undefined
    );
    const { data: organizations } = useOrganizations(undefined, {
        enabled: Boolean(open && opp && !opp.organizationId && opp.organizationName),
    });
    const { data: linkedQuotes } = useQuotations(
        opp?.id ? { opportunityId: opp.id } : undefined,
        { enabled: Boolean(open && opp?.id) }
    );

    const [toast, setToast] = useState<{
        open: boolean;
        message: string;
        severity: 'success' | 'error' | 'info' | 'warning';
    }>({
        open: false,
        message: '',
        severity: 'error',
    });

    if (!opp) return null;

    const triggerToast = (
        message: string,
        severity: 'success' | 'error' | 'info' | 'warning' = 'error'
    ) => {
        setToast({ open: true, message, severity });
        onShowToast?.(message, severity);
    };

    // Check whether the linked Organization has a complete address
    const linkedOrg =
        linkedOrgById ??
        organizations?.find(
            (o) =>
                o.organizationName.trim().toLowerCase() ===
                opp.organizationName.trim().toLowerCase()
        );

    const billingStreet = (linkedOrg?.billingStreet || linkedOrg?.billingAddress || '').trim();
    const billingCity = (linkedOrg?.billingCity || '').trim();
    const billingState = (linkedOrg?.billingState || '').trim();
    const billingPostalCode = (linkedOrg?.billingPostalCode || '').trim();

    const hasAddress = Boolean(
        billingStreet && billingCity && billingState && billingPostalCode
    );

    const existingQuote = linkedQuotes?.[0];
    const isQuoteCreated = Boolean(existingQuote);

    const handleCreateQuote = () => {
        if (!hasAddress) {
            triggerToast(
                'Address is required before creating a quotation. Please update the address details first.',
                'error'
            );
            return;
        }

        router.push(ROUTES.OPPORTUNITY_CREATE_QUOTE(opp.id));
    };

    const handleEdit = () => {
        if (onEdit) {
            onEdit(opp.id);
        } else {
            router.push(ROUTES.OPPORTUNITY_EDIT(opp.id));
        }
    };

    return (
        <>
            <EntityDetailDrawer
            open={open}
            module="opportunities"
            onClose={onClose}
            title={view.title}
            subtitle={view.subtitle}
            avatarIcon={view.avatarIcon}
            avatarBg={view.avatarBg}
            badges={view.badges}
            headerActions={{
                onEdit: handleEdit,
                onView: () => router.push(withListOrigin(ROUTES.OPPORTUNITY_DETAIL(opp.id))),
            }}
            formTabs={view.formTabs}
            tabContents={view.tabContents}
            auditEntity={{ type: 'opportunities', id: opp.id }}
            activities={recordActivitiesContext('opportunities', opp)}
            recordAudit={opp}
            includeChangesTab={true}
            primaryAction={{
                label: 'Edit Opportunity',
                onClick: handleEdit,
                icon: <EditOutlinedIcon sx={{ fontSize: 16 }} />,
            }}
            secondaryAction={{
                label: isQuoteCreated ? 'Quote Created' : 'Create Quote',
                icon: isQuoteCreated ? (
                    <CheckCircleOutlinedIcon sx={{ fontSize: 16, color: 'var(--crm-emerald-600)' }} />
                ) : (
                    <RequestQuoteOutlinedIcon sx={{ fontSize: 16 }} />
                ),
                onClick: handleCreateQuote,
                variant: 'outlined',
                tooltip: !hasAddress
                    ? 'Complete Address is required to create a quotation'
                    : isQuoteCreated
                    ? 'Quotation already created for this opportunity'
                    : 'Create Quotation from Opportunity details',
                sx: {
                    fontSize: '0.78rem',
                    textTransform: 'none',
                    fontWeight: 700,
                    height: 36,
                    px: 1.8,
                    borderRadius: '6px',
                    color: isQuoteCreated ? 'var(--crm-emerald-700)' : hasAddress ? 'var(--crm-emerald-700)' : 'var(--mui-palette-error-main)',
                    borderColor: isQuoteCreated ? 'var(--mui-palette-success-softBorder)' : hasAddress ? 'var(--mui-palette-success-softBorder)' : 'var(--crm-red-300)',
                    backgroundColor: isQuoteCreated ? 'var(--mui-palette-success-soft)' : hasAddress ? 'var(--mui-palette-success-soft)' : 'var(--mui-palette-error-soft)',
                    '&:hover': {
                        borderColor: isQuoteCreated ? 'var(--crm-emerald-700)' : hasAddress ? 'var(--crm-emerald-600)' : 'var(--crm-red-500)',
                        backgroundColor: isQuoteCreated ? 'var(--crm-emerald-100)' : hasAddress ? 'var(--crm-emerald-100)' : 'var(--crm-red-100)',
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
