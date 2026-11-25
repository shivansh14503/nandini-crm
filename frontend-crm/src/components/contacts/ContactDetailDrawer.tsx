'use client';

import React from 'react';
import { useRouter } from 'next/navigation';

import PhoneOutlinedIcon from '@mui/icons-material/PhoneOutlined';

import { ROUTES } from '@/config/constants';
import { recordActivitiesContext } from '@/components/activities/activityLinks';
import { withListOrigin } from '@/utils/listOrigin';
import type { Contact } from '@/types/contact.types';
import { useContact } from '@/hooks/queries';
import { EntityDetailDrawer } from '@/components/common/Drawer';
import { useLayoutDrawerProps } from '@/components/common/Drawer/layout';
import { telHref } from '@/utils/contactLinks';
import { CONTACT_FORM_TABS } from './ContactForm';

export interface ContactDetailDrawerProps {
    contact: Contact | null;
    open: boolean;
    onClose: () => void;
    onEdit?: (id: string) => void;
}

export function ContactDetailDrawer({ contact, open, onClose, onEdit }: ContactDetailDrawerProps) {
    const router = useRouter();

    const { data: freshContact } = useContact(open && contact?.id ? contact.id : undefined);
    const c = freshContact ?? contact;

    // Header, badges and tabs come from the Contacts drawer layout (Admin › Form Customization › Drawer Layout).
    const view = useLayoutDrawerProps('contacts', c, CONTACT_FORM_TABS);

    if (!c) return null;

    const handleEdit = () => {
        if (onEdit) {
            onEdit(c.id);
        } else {
            router.push(ROUTES.CONTACT_EDIT(c.id));
        }
    };


    return (
        <EntityDetailDrawer
            open={open}
            module="contacts"
            onClose={onClose}
            title={view.title}
            subtitle={view.subtitle}
            avatarIcon={view.avatarIcon}
            avatarBg={view.avatarBg}
            verified={false}
            badges={view.badges}
            headerActions={{
                onEdit: handleEdit,
                onView: () => router.push(withListOrigin(ROUTES.CONTACT_DETAIL(c.id))),
            }}
            formTabs={view.formTabs}
            tabContents={view.tabContents}
            auditEntity={{ type: 'contacts', id: c.id }}
            activities={recordActivitiesContext('contacts', c)}
            recordAudit={c}
            includeChangesTab={true}
            primaryAction={{
                label: 'Edit Contact',
                onClick: handleEdit,
            }}
            secondaryAction={
                c.mobile
                    ? {
                          label: 'Direct Call',
                          icon: <PhoneOutlinedIcon sx={{ fontSize: 16 }} />,
                          onClick: () => {
                              window.location.href = telHref(c.mobile);
                          },
                      }
                    : undefined
            }
        />
    );
}
