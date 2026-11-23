'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import PhoneOutlinedIcon from '@mui/icons-material/PhoneOutlined';

import { ROUTES } from '@/config/constants';
import { withListOrigin } from '@/utils/listOrigin';
import { usePartnerCompany } from '@/hooks/queries';
import { EntityDetailDrawer } from '@/components/common/Drawer';
import { useLayoutDrawerProps } from '@/components/common/Drawer/layout';
import type { ExtendedPartnerCompany } from '@/types/partner.types';
import { telHref } from '@/utils/contactLinks';
import { PARTNER_COMPANY_FORM_TABS } from './PartnerCompanyForm';

export interface PartnerCompanyDetailDrawerProps {
    partnerCompany: ExtendedPartnerCompany | null;
    open: boolean;
    onClose: () => void;
}

export function PartnerCompanyDetailDrawer({ partnerCompany, open, onClose }: PartnerCompanyDetailDrawerProps) {
    const router = useRouter();

    const { data: fresh } = usePartnerCompany(open && partnerCompany?.id ? partnerCompany.id : undefined);
    const p = fresh ?? partnerCompany;

    // Header, badges and tabs come from the Partner Companies drawer layout (Admin › Form Customization › Drawer Layout).
    const view = useLayoutDrawerProps('partner-companies', p, PARTNER_COMPANY_FORM_TABS);

    if (!p) return null;

    const handleEdit = () => router.push(ROUTES.PARTNER_COMPANY_EDIT(p.id));

    return (
        <EntityDetailDrawer
            open={open}
            module="partnerCompanies"
            onClose={onClose}
            title={view.title}
            subtitle={view.subtitle}
            avatarIcon={view.avatarIcon}
            avatarBg={view.avatarBg}
            verified={false}
            badges={view.badges}
            headerActions={{ onEdit: handleEdit, onView: () => router.push(withListOrigin(ROUTES.PARTNER_COMPANY_DETAIL(p.id))) }}
            formTabs={view.formTabs}
            tabContents={view.tabContents}
            auditEntity={{ type: 'partner-companies', id: p.id }}
            recordAudit={p}
            includeChangesTab
            statusText={p.natureOfPartner || 'Partner Company'}
            primaryAction={{ label: 'Edit Partner Company', onClick: handleEdit }}
            secondaryAction={
                p.officePhone
                    ? {
                          label: 'Call Office',
                          icon: <PhoneOutlinedIcon sx={{ fontSize: 16 }} />,
                          onClick: () => {
                              window.location.href = telHref(p.officePhone);
                          },
                      }
                    : undefined
            }
        />
    );
}
