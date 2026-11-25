'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import ContentCopyOutlinedIcon from '@mui/icons-material/ContentCopyOutlined';

import { ROUTES } from '@/config/constants';
import { recordActivitiesContext } from '@/components/activities/activityLinks';
import { withListOrigin } from '@/utils/listOrigin';
import type { Ticket } from '@/types/ticket.types';
import { useTicket } from '@/hooks/queries';
import { EntityDetailDrawer, copyToClipboard } from '@/components/common/Drawer';
import { useLayoutDrawerProps } from '@/components/common/Drawer/layout';
import { TICKET_FORM_TABS } from './TicketForm';
import { useShowRecordNumber } from '@/hooks/queries/useDocumentSeries';

export interface TicketDetailDrawerProps {
    ticket: Ticket | null;
    open: boolean;
    onClose: () => void;
    onEdit?: (id: string) => void;
    hideBackdrop?: boolean;
}

export function TicketDetailDrawer({ ticket, open, onClose, onEdit, hideBackdrop }: TicketDetailDrawerProps) {
    const showNumber = useShowRecordNumber();
    const router = useRouter();

    const { data: freshTicket } = useTicket(open && ticket?.id ? ticket.id : undefined);
    const t = freshTicket ?? ticket;

    // Header, badges and tabs come from the Tickets drawer layout (Admin › Form Customization › Drawer Layout).
    const view = useLayoutDrawerProps('tickets', t, TICKET_FORM_TABS);

    if (!t) return null;

    const handleEdit = () => (onEdit ? onEdit(t.id) : router.push(ROUTES.TICKET_EDIT(t.id)));

    return (
        <EntityDetailDrawer
            open={open}
            module="tickets"
            onClose={onClose}
            hideBackdrop={hideBackdrop}
            title={view.title}
            subtitle={view.subtitle}
            avatarIcon={view.avatarIcon}
            avatarBg={view.avatarBg}
            badges={view.badges}
            headerActions={{
                onEdit: handleEdit,
                onView: () => router.push(withListOrigin(ROUTES.TICKET_DETAIL(t.id))),
            }}
            formTabs={view.formTabs}
            tabContents={view.tabContents}
            auditEntity={{ type: 'tickets', id: t.id }}
            activities={recordActivitiesContext('tickets', t)}
            recordAudit={t}
            includeChangesTab
            primaryAction={{ label: 'Edit Ticket', onClick: handleEdit }}
            secondaryAction={
                showNumber('ticket')
                    ? {
                          label: 'Copy Ticket Number',
                          icon: <ContentCopyOutlinedIcon sx={{ fontSize: 16 }} />,
                          onClick: () => copyToClipboard(t.ticketNumber),
                      }
                    : undefined
            }
        />
    );
}
