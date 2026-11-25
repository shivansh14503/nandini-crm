'use client';

import React from 'react';
import { useRouter } from 'next/navigation';

import PhoneOutlinedIcon from '@mui/icons-material/PhoneOutlined';

import { ROUTES } from '@/config/constants';
import { withListOrigin } from '@/utils/listOrigin';
import type { Referral } from '@/types/referral.types';
import { useReferral } from '@/hooks/queries';
import { EntityDetailDrawer } from '@/components/common/Drawer';
import { useLayoutDrawerProps } from '@/components/common/Drawer/layout';
import { telHref } from '@/utils/contactLinks';
import { REFERRAL_FORM_TABS } from './ReferralForm';

export interface ReferralDetailDrawerProps {
    referral: Referral | null;
    open: boolean;
    onClose: () => void;
    onEdit?: (id: string) => void;
}

export function ReferralDetailDrawer({ referral, open, onClose, onEdit }: ReferralDetailDrawerProps) {
    const router = useRouter();

    const { data: freshReferral } = useReferral(open && referral?.id ? referral.id : undefined);
    const r = freshReferral ?? referral;

    // Header, badges and tabs come from the Referrals drawer layout (Admin › Form Customization › Drawer Layout).
    const view = useLayoutDrawerProps('referrals', r, REFERRAL_FORM_TABS);

    if (!r) return null;

    const handleEdit = () => {
        if (onEdit) onEdit(r.id);
        else router.push(ROUTES.REFERRAL_EDIT(r.id));
    };

    return (
        <EntityDetailDrawer
            open={open}
            module="referrals"
            onClose={onClose}
            title={view.title}
            subtitle={view.subtitle}
            avatarIcon={view.avatarIcon}
            avatarBg={view.avatarBg}
            verified={false}
            badges={view.badges}
            headerActions={{
                onEdit: handleEdit,
                onView: () => router.push(withListOrigin(ROUTES.REFERRAL_DETAIL(r.id))),
            }}
            formTabs={view.formTabs}
            tabContents={view.tabContents}
            auditEntity={{ type: 'referrals', id: r.id }}
            recordAudit={r}
            includeChangesTab={true}
            primaryAction={{ label: 'Edit Referral', onClick: handleEdit }}
            secondaryAction={
                r.mobile
                    ? {
                          label: 'Direct Call',
                          icon: <PhoneOutlinedIcon sx={{ fontSize: 16 }} />,
                          onClick: () => {
                              window.location.href = telHref(r.mobile);
                          },
                      }
                    : undefined
            }
        />
    );
}
