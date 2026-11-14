'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Box, Typography, Chip, IconButton, Tooltip } from '@mui/material';

// Icons
import PhoneOutlinedIcon from '@mui/icons-material/PhoneOutlined';
import SmartphoneOutlinedIcon from '@mui/icons-material/SmartphoneOutlined';
import EmailOutlinedIcon from '@mui/icons-material/EmailOutlined';
import ApartmentIcon from '@mui/icons-material/Apartment';
import StarOutlinedIcon from '@mui/icons-material/StarOutlined';
import BadgeOutlinedIcon from '@mui/icons-material/BadgeOutlined';
import ContactPhoneOutlinedIcon from '@mui/icons-material/ContactPhoneOutlined';
import TuneOutlinedIcon from '@mui/icons-material/TuneOutlined';
import PersonOutlinedIcon from '@mui/icons-material/PersonOutlined';
import NotesOutlinedIcon from '@mui/icons-material/NotesOutlined';
import CallOutlinedIcon from '@mui/icons-material/CallOutlined';
import WhatsAppIcon from '@mui/icons-material/WhatsApp';
import SmsOutlinedIcon from '@mui/icons-material/SmsOutlined';
import MailOutlineIcon from '@mui/icons-material/MailOutlineOutlined';
import CheckCircleOutlinedIcon from '@mui/icons-material/CheckCircleOutlined';
import LogoutOutlinedIcon from '@mui/icons-material/LogoutOutlined';

import { ROUTES } from '@/config/constants';
import type { Contact } from '@/types/contact.types';
import { useContact, useOrganizations } from '@/hooks/queries';
import {
    EntityDetailDrawer,
    DrawerSectionCard,
    DrawerCopyButton,
    DrawerFieldGrid,
    type DrawerBadgeItem,
} from '@/components/common/Drawer';
import { ReadOnlyField } from '@/components/forms/ReadOnlyField';
import { findCrmUser } from '@/services/masterData.store';
import { mailtoHref,smsHref, telHref, whatsappHref } from '@/utils/contactLinks';
import { CONTACT_FORM_TABS } from './ContactForm';
import { DynamicDrawerCustomFields } from '@/components/common/Drawer/DynamicDrawerCustomFields';

export interface ContactDetailDrawerProps {
    contact: Contact | null;
    open: boolean;
    onClose: () => void;
    onEdit?: (id: string) => void;
}

const sectionIcon = (icon: React.ReactElement) => (
    <Box
        sx={{
            width: 24,
            height: 24,
            borderRadius: '7px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--crm-text-blue-600)',
            backgroundColor: 'var(--mui-palette-primary-soft)',
        }}
    >
        {icon}
    </Box>
);

const getInitials = (name: string) => {
    const parts = name.replace(/[._-]+/g, ' ').trim().split(/\s+/);
    return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
};

interface ChannelAction {
    label: string;
    href: string;
    icon: React.ReactElement;
    /** Hover accent colour. */
    color: string;
    external?: boolean;
}

/** Icon button rendered as a real link (tel:, sms:, mailto:, wa.me). */
function ChannelActionButton({ label, href, icon, color, external }: ChannelAction) {
    return (
        <Tooltip title={label}>
            <IconButton
                component="a"
                href={href}
                aria-label={label}
                size="small"
                {...(external && { target: '_blank', rel: 'noopener noreferrer' })}
                sx={{
                    width: 28,
                    height: 28,
                    color: 'var(--mui-palette-text-secondary)',
                    border: '1px solid var(--mui-palette-border-main)',
                    borderRadius: '8px',
                    transition: 'all 0.15s ease',
                    '&:hover': { color, borderColor: color, backgroundColor: `${color}0f` },
                }}
            >
                {icon}
            </IconButton>
        </Tooltip>
    );
}

interface ChannelRowProps {
    icon: React.ReactElement;
    value: string;
    caption: string;
    tag?: string;
    actions: ChannelAction[];
    copyTitle: string;
}

function ChannelRow({ icon, value, caption, tag, actions, copyTitle }: ChannelRowProps) {
    return (
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1.5, py: 1 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, minWidth: 0 }}>
                <Box sx={{ color: 'var(--mui-palette-text-muted)', display: 'flex', flexShrink: 0 }}>{icon}</Box>
                <Box sx={{ minWidth: 0 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, minWidth: 0 }}>
                        <Typography noWrap sx={{ fontSize: '0.86rem', fontWeight: 700, color: 'var(--crm-slate-900)' }}>
                            {value}
                        </Typography>
                        {tag && (
                            <Box
                                component="span"
                                sx={{
                                    fontSize: '0.6rem',
                                    fontWeight: 800,
                                    letterSpacing: '0.05em',
                                    color: 'var(--crm-text-blue-700)',
                                    backgroundColor: 'var(--mui-palette-primary-soft)',
                                    border: '1px solid var(--mui-palette-primary-softBorder)',
                                    borderRadius: '9999px',
                                    px: 0.75,
                                    lineHeight: 1.6,
                                    flexShrink: 0,
                                }}
                            >
                                {tag}
                            </Box>
                        )}
                    </Box>
                    <Typography sx={{ fontSize: '0.7rem', color: 'var(--mui-palette-text-secondary)' }}>{caption}</Typography>
                </Box>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexShrink: 0 }}>
                {actions.filter((a) => a.href).map((a) => (
                    <ChannelActionButton key={a.label} {...a} />
                ))}
                <DrawerCopyButton text={value} title={copyTitle} iconColor="var(--mui-palette-text-secondary)" />
            </Box>
        </Box>
    );
}

const callAction = (phone: string): ChannelAction => ({
    label: 'Call',
    href: telHref(phone),
    icon: <CallOutlinedIcon sx={{ fontSize: 15 }} />,
    color: 'var(--crm-text-blue-600)',
});

export function ContactDetailDrawer({
    contact,
    open,
    onClose,
    onEdit,
}: ContactDetailDrawerProps) {
    const router = useRouter();

    const { data: freshContact } = useContact(open && contact?.id ? contact.id : undefined);
    const c = freshContact ?? contact;

    const { data: organizations } = useOrganizations(undefined, {
        enabled: Boolean(open && c && !c.organizationId && c.organizationName),
    });

    if (!c) return null;

    const assignedUser = findCrmUser(c.assignedTo);
    const assignedDisplayName = assignedUser?.name || c.assignedTo;

    const handleEdit = () => {
        if (onEdit) {
            onEdit(c.id);
        } else {
            router.push(ROUTES.CONTACT_EDIT(c.id));
        }
    };

    const leftJob = c.leftJob === 'Yes';
    const organizationId =
        c.organizationId ||
        organizations?.find((o) => o.organizationName === c.organizationName)?.id;

    const badges: DrawerBadgeItem[] = [
        leftJob
            ? {
                  label: 'Left Organization / Former Employee',
                  icon: <LogoutOutlinedIcon sx={{ fontSize: 13 }} />,
                  backgroundColor: 'var(--mui-palette-error-soft)',
                  color: 'var(--crm-red-700)',
                  borderColor: 'var(--mui-palette-error-softBorder)',
              }
            : {
                  label: 'Active Employee',
                  icon: <CheckCircleOutlinedIcon sx={{ fontSize: 13 }} />,
                  backgroundColor: 'var(--mui-palette-success-soft)',
                  color: 'var(--crm-emerald-600)',
                  borderColor: 'var(--mui-palette-success-softBorder)',
              },
        c.isPrimaryContact
            ? {
                  label: 'Primary Contact',
                  icon: <StarOutlinedIcon sx={{ fontSize: 13 }} />,
                  backgroundColor: 'var(--mui-palette-primary-soft)',
                  color: 'var(--crm-text-blue-700)',
                  borderColor: 'var(--mui-palette-primary-softBorder)',
              }
            : {
                  label: 'Corporate Contact',
                  icon: <BadgeOutlinedIcon sx={{ fontSize: 13 }} />,
                  backgroundColor: 'var(--mui-palette-background-subtle)',
                  color: 'var(--crm-slate-600)',
                  borderColor: 'var(--mui-palette-border-main)',
              },
    ];

    const extraPhones = (
        [
            ['Phone 3', c.phone3],
            ['Phone 4', c.phone4],
            ['Phone 5', c.phone5],
        ] as const
    ).filter(([, value]) => Boolean(value?.trim()));

    const emails = (c.emailAddresses ?? []).filter((em) => em.email?.trim());

    return (
        <EntityDetailDrawer
            open={open}
            onClose={onClose}
            title={c.name}
            subtitle={`${c.designation ? `${c.designation} • ` : ''}${c.organizationName || 'Independent Contact'}`}
            avatarBg="linear-gradient(135deg, var(--crm-fill-blue-600) 0%, var(--crm-fill-blue-700) 100%)"
            verified={false}
            badges={badges}
            headerActions={{
                onEdit: handleEdit,
                onView: () => router.push(ROUTES.CONTACT_DETAIL(c.id)),
            }}
            formTabs={CONTACT_FORM_TABS}
            tabContents={{
                overview: (
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        {/* Role & organization */}
                        <DrawerSectionCard p={1.8} icon={sectionIcon(<ApartmentIcon sx={{ fontSize: 15 }} />)} title="Overview">
                            <DrawerFieldGrid sx={{ mt: 0 }}>
                                <ReadOnlyField
                                    label="Organisation"
                                    sx={{ gridColumn: '1 / -1' }}
                                    value={
                                        c.organizationName ? (
                                            <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75 }}>
                                                <ApartmentIcon sx={{ fontSize: 16, color: 'var(--crm-text-blue-600)' }} />
                                                {organizationId ? (
                                                    <Typography
                                                        component={Link}
                                                        href={ROUTES.ORGANIZATION_DETAIL(organizationId)}
                                                        sx={{
                                                            fontSize: '0.9rem',
                                                            fontWeight: 700,
                                                            color: 'var(--crm-text-blue-700)',
                                                            textDecoration: 'none',
                                                            '&:hover': { textDecoration: 'underline' },
                                                        }}
                                                    >
                                                        {c.organizationName}
                                                    </Typography>
                                                ) : (
                                                    c.organizationName
                                                )}
                                            </Box>
                                        ) : undefined
                                    }
                                />
                                <ReadOnlyField label="Designation" value={c.designation} />
                                <ReadOnlyField label="Department" value={c.department} />
                                <ReadOnlyField
                                    label="Corporate Contact Status"
                                    sx={{ gridColumn: '1 / -1' }}
                                    value={
                                        c.isPrimaryContact
                                            ? 'Primary contact · authorized corporate signatory'
                                            : 'Corporate contact · not an authorized signatory'
                                    }
                                    badge
                                    badgeColor={c.isPrimaryContact ? 'var(--crm-blue-700)' : 'var(--crm-slate-600)'}
                                />
                            </DrawerFieldGrid>
                        </DrawerSectionCard>

                        {/* Communication channels */}
                        <DrawerSectionCard p={1.8} icon={sectionIcon(<ContactPhoneOutlinedIcon sx={{ fontSize: 15 }} />)} title="Communication Channels">
                            {c.doNotCall && (
                                <Box
                                    sx={{
                                        mb: 1,
                                        px: 1.25,
                                        py: 0.75,
                                        borderRadius: '8px',
                                        backgroundColor: 'var(--mui-palette-error-soft)',
                                        border: '1px solid var(--mui-palette-error-softBorder)',
                                        fontSize: '0.74rem',
                                        fontWeight: 600,
                                        color: 'var(--crm-red-700)',
                                    }}
                                >
                                    Do Not Call (DND) is active for this contact.
                                </Box>
                            )}
                            <Box sx={{ '& > * + *': { borderTop: '1px dashed var(--mui-palette-border-main)' } }}>
                                {c.mobile && (
                                    <ChannelRow
                                        icon={<SmartphoneOutlinedIcon sx={{ fontSize: 18 }} />}
                                        value={c.mobile}
                                        caption="Mobile"
                                        copyTitle="Copy mobile"
                                        actions={[
                                            callAction(c.mobile),
                                            {
                                                label: 'WhatsApp',
                                                href: whatsappHref(c.mobile),
                                                icon: <WhatsAppIcon sx={{ fontSize: 15 }} />,
                                                color: 'var(--mui-palette-success-main)',
                                                external: true,
                                            },
                                            {
                                                label: 'Send SMS',
                                                href: smsHref(c.mobile),
                                                icon: <SmsOutlinedIcon sx={{ fontSize: 15 }} />,
                                                color: 'var(--crm-violet-600)',
                                            },
                                        ]}
                                    />
                                )}
                                {c.officePhone && (
                                    <ChannelRow
                                        icon={<PhoneOutlinedIcon sx={{ fontSize: 18 }} />}
                                        value={c.officePhone}
                                        caption="Office Phone"
                                        copyTitle="Copy office phone"
                                        actions={[callAction(c.officePhone)]}
                                    />
                                )}
                                {extraPhones.map(([label, value]) => (
                                    <ChannelRow
                                        key={label}
                                        icon={<PhoneOutlinedIcon sx={{ fontSize: 18 }} />}
                                        value={value}
                                        caption={label}
                                        copyTitle={`Copy ${label.toLowerCase()}`}
                                        actions={[callAction(value)]}
                                    />
                                ))}
                                {emails.map((em) => (
                                    <ChannelRow
                                        key={em.id || em.email}
                                        icon={<EmailOutlinedIcon sx={{ fontSize: 18 }} />}
                                        value={em.email}
                                        caption="Email"
                                        tag={em.isPrimary ? 'PRIMARY' : undefined}
                                        copyTitle="Copy email"
                                        actions={[
                                            {
                                                label: 'Send email',
                                                href: mailtoHref(em.email),
                                                icon: <MailOutlineIcon sx={{ fontSize: 15 }} />,
                                                color: 'var(--crm-text-blue-600)',
                                            },
                                        ]}
                                    />
                                ))}
                            </Box>
                            {!c.mobile && !c.officePhone && extraPhones.length === 0 && emails.length === 0 && (
                                <Typography sx={{ fontSize: '0.82rem', color: 'var(--mui-palette-text-muted)' }}>No phone numbers or emails recorded.</Typography>
                            )}
                        </DrawerSectionCard>

                        {/* Preferred communication */}
                        {c.communicationType?.length > 0 && (
                            <DrawerSectionCard p={1.8} icon={sectionIcon(<TuneOutlinedIcon sx={{ fontSize: 15 }} />)} title="Communication Type">
                                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
                                    {c.communicationType.map((type) => (
                                        <Chip
                                            key={type}
                                            label={type}
                                            size="small"
                                            sx={{
                                                height: 24,
                                                fontWeight: 700,
                                                fontSize: '0.72rem',
                                                backgroundColor: 'var(--mui-palette-primary-soft)',
                                                color: 'var(--crm-text-blue-700)',
                                                border: '1px solid var(--crm-blue-100)',
                                                cursor: 'default',
                                            }}
                                        />
                                    ))}
                                </Box>
                            </DrawerSectionCard>
                        )}

                        {/* Assigned user */}
                        <DrawerSectionCard p={1.8} icon={sectionIcon(<PersonOutlinedIcon sx={{ fontSize: 15 }} />)} title="Assigned User">
                            {c.assignedTo ? (
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
                                        <Typography sx={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--crm-slate-900)', lineHeight: 1.3 }}>
                                            {assignedDisplayName}
                                        </Typography>
                                        <Typography sx={{ fontSize: '0.72rem', color: 'var(--mui-palette-text-secondary)' }}>
                                            {assignedUser ? `${assignedUser.role} • ${assignedUser.department}` : 'Account Manager'}
                                        </Typography>
                                    </Box>
                                </Box>
                            ) : (
                                <Typography sx={{ color: 'var(--mui-palette-text-muted)', fontSize: '0.86rem' }}>Unassigned</Typography>
                            )}
                        </DrawerSectionCard>

                        {/* Admin-defined custom fields */}
                        <DynamicDrawerCustomFields module="contacts" record={c} />

                        {c.description && (
                            <DrawerSectionCard p={1.8} icon={sectionIcon(<NotesOutlinedIcon sx={{ fontSize: 15 }} />)} title="Notes">
                                <Typography sx={{ fontSize: '0.84rem', color: 'var(--crm-slate-700)', lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>
                                    {c.description}
                                </Typography>
                            </DrawerSectionCard>
                        )}
                    </Box>
                ),
            }}
            auditEntity={{ type: 'contacts', id: c.id }}
            recordAudit={c}
            includeChangesTab={true}
            statusText={leftJob ? 'Former employee' : 'Direct Channel Active'}
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
