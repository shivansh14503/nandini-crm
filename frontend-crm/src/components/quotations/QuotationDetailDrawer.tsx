'use client';

import React from 'react';
import { useRouter } from 'next/navigation';

import EditOutlinedIcon from '@mui/icons-material/EditOutlined';

import { ROUTES } from '@/config/constants';
import { recordActivitiesContext } from '@/components/activities/activityLinks';
import { withListOrigin } from '@/utils/listOrigin';
import type { Quotation } from '@/types/quotation.types';
import { useQuotation } from '@/hooks/queries';
import { EntityDetailDrawer } from '@/components/common/Drawer';
import { useLayoutDrawerProps } from '@/components/common/Drawer/layout';
import { QUOTATION_FORM_TABS } from './CreateQuoteForm';
import { PdfActionsButton } from '@/components/pdf/PdfActionsButton';

export interface QuotationDetailDrawerProps {
    quotation: Quotation | null;
    open: boolean;
    onClose: () => void;
    onEdit?: (id: string) => void;
    onShowToast?: (message: string, severity?: 'success' | 'error' | 'info' | 'warning') => void;
}

export function QuotationDetailDrawer({ quotation: initialQuotation, open, onClose, onEdit }: QuotationDetailDrawerProps) {
    const router = useRouter();

    const { data: freshQuotation } = useQuotation(open && initialQuotation?.id ? initialQuotation.id : undefined);
    const quotation = freshQuotation ?? initialQuotation;

    // Header, badges and tabs come from the Quotations drawer layout (Admin › Form Customization › Drawer Layout).
    const view = useLayoutDrawerProps('quotations', quotation, QUOTATION_FORM_TABS);

    if (!quotation) return null;

    const handleEdit = () => {
        if (onEdit) {
            onEdit(quotation.id);
        } else {
            router.push(ROUTES.QUOTATION_EDIT(quotation.id));
        }
    };

    return (
        <EntityDetailDrawer
            open={open}
            module="quotations"
            onClose={onClose}
            title={view.title}
            subtitle={view.subtitle}
            avatarIcon={view.avatarIcon}
            avatarBg={view.avatarBg}
            badges={view.badges}
            headerActions={{
                onEdit: handleEdit,
                onView: () => router.push(withListOrigin(ROUTES.QUOTATION_DETAIL(quotation.id))),
                custom: <PdfActionsButton module="QUOTATION" recordId={quotation.id} variant="icon" />,
            }}
            primaryAction={{
                label: 'Edit Quotation',
                onClick: handleEdit,
                icon: <EditOutlinedIcon sx={{ fontSize: 16 }} />,
            }}
            formTabs={view.formTabs}
            tabContents={view.tabContents}
            auditEntity={{ type: 'quotations', id: quotation.id }}
            activities={recordActivitiesContext('quotations', quotation)}
            recordAudit={quotation}
            includeChangesTab={true}
        />
    );
}

export default QuotationDetailDrawer;
