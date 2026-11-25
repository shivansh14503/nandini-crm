'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import ContentCopyOutlinedIcon from '@mui/icons-material/ContentCopyOutlined';

import { ROUTES } from '@/config/constants';
import { recordActivitiesContext } from '@/components/activities/activityLinks';
import { withListOrigin } from '@/utils/listOrigin';
import type { Contract } from '@/types/contract.types';
import { useContract } from '@/hooks/queries';
import { EntityDetailDrawer, copyToClipboard } from '@/components/common/Drawer';
import { useLayoutDrawerProps } from '@/components/common/Drawer/layout';
import { useShowRecordNumber } from '@/hooks/queries/useDocumentSeries';
import { CONTRACT_FORM_TABS } from './ContractForm';

export interface ContractDetailDrawerProps {
    contract: Contract | null;
    open: boolean;
    onClose: () => void;
    onEdit?: (id: string) => void;
    hideBackdrop?: boolean;
}

export function ContractDetailDrawer({ contract, open, onClose, onEdit, hideBackdrop }: ContractDetailDrawerProps) {
    const showNumber = useShowRecordNumber();
    const router = useRouter();

    const { data: freshContract } = useContract(open && contract?.id ? contract.id : undefined);
    const c = freshContract ?? contract;

    // Header, badges and tabs come from the Contracts drawer layout (Admin › Form Customization › Drawer Layout).
    const view = useLayoutDrawerProps('contracts', c, CONTRACT_FORM_TABS);

    if (!c) return null;

    const handleEdit = () => (onEdit ? onEdit(c.id) : router.push(ROUTES.CONTRACT_EDIT(c.id)));

    return (
        <EntityDetailDrawer
            open={open}
            module="contracts"
            onClose={onClose}
            hideBackdrop={hideBackdrop}
            title={view.title}
            subtitle={view.subtitle}
            avatarIcon={view.avatarIcon}
            avatarBg={view.avatarBg}
            badges={view.badges}
            headerActions={{
                onEdit: handleEdit,
                onView: () => router.push(withListOrigin(ROUTES.CONTRACT_DETAIL(c.id))),
            }}
            formTabs={view.formTabs}
            tabContents={view.tabContents}
            auditEntity={{ type: 'contracts', id: c.id }}
            activities={recordActivitiesContext('contracts', c)}
            recordAudit={c}
            includeChangesTab
            primaryAction={{ label: 'Edit Contract', onClick: handleEdit }}
            secondaryAction={
                showNumber('contract')
                    ? {
                          label: 'Copy Contract Number',
                          icon: <ContentCopyOutlinedIcon sx={{ fontSize: 16 }} />,
                          onClick: () => copyToClipboard(c.contractNumber),
                      }
                    : undefined
            }
        />
    );
}
