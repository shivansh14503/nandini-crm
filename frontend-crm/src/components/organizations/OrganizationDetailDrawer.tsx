'use client';

import React from 'react';
import { useRouter } from 'next/navigation';

import { ROUTES } from '@/config/constants';
import { withListOrigin } from '@/utils/listOrigin';
import type { ExtendedOrganization } from '@/types/organization.types';
import { useOrganization } from '@/hooks/queries';
import { EntityDetailDrawer } from '@/components/common/Drawer';
import { useLayoutDrawerProps } from '@/components/common/Drawer/layout';
import { ORGANIZATION_FORM_TABS } from './OrganizationForm';

export interface OrganizationDetailDrawerProps {
    organization: ExtendedOrganization | null;
    open: boolean;
    onClose: () => void;
    onEdit?: (id: string) => void;
    hideBackdrop?: boolean;
}

export function OrganizationDetailDrawer({ organization, open, onClose, onEdit, hideBackdrop }: OrganizationDetailDrawerProps) {
    const router = useRouter();

    const { data: freshOrg } = useOrganization(open && organization?.id ? organization.id : undefined);
    const org = freshOrg ?? organization;

    // Header, badges and tabs come from the Organizations drawer layout (Admin › Form Customization › Drawer Layout).
    const view = useLayoutDrawerProps('organizations', org, ORGANIZATION_FORM_TABS);

    if (!org) return null;

    const handleEdit = () => {
        if (onEdit) {
            onEdit(org.id);
        } else {
            router.push(ROUTES.ORGANIZATION_EDIT(org.id));
        }
    };


    return (
        <EntityDetailDrawer
            open={open}
            module="organizations"
            onClose={onClose}
            hideBackdrop={hideBackdrop}
            title={view.title}
            subtitle={view.subtitle}
            avatarIcon={view.avatarIcon}
            avatarBg={view.avatarBg}
            verified={Boolean(org.accountVerified)}
            badges={view.badges}
            headerActions={{
                onEdit: handleEdit,
                onView: () => router.push(withListOrigin(ROUTES.ORGANIZATION_DETAIL(org.id))),
            }}
            formTabs={view.formTabs}
            tabContents={view.tabContents}
            auditEntity={{ type: 'organizations', id: org.id }}
            recordAudit={org}
            includeChangesTab={true}
            primaryAction={{
                label: 'Edit Details',
                onClick: handleEdit,
            }}
        />
    );
}
