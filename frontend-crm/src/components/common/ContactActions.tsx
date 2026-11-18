'use client';

import React from 'react';
import { Box, IconButton, Tooltip } from '@mui/material';
import CallOutlinedIcon from '@mui/icons-material/CallOutlined';
import SmsOutlinedIcon from '@mui/icons-material/SmsOutlined';
import WhatsAppIcon from '@mui/icons-material/WhatsApp';
import MailOutlineIcon from '@mui/icons-material/MailOutlineOutlined';
import { DrawerCopyButton } from './Drawer/DrawerPrimitives';
import { mailtoHref, smsHref, telHref, whatsappHref } from '@/utils/contactLinks';
import { phoneForCopy } from '@/utils/phone';

export interface ContactActionButtonProps {
    label: string;
    href: string;
    icon: React.ReactElement;
    /** Hover accent colour. */
    color: string;
    external?: boolean;
}

/** Bordered icon button rendered as a real link (tel:, sms:, mailto:, wa.me). Renders nothing without an href. */
export function ContactActionButton({ label, href, icon, color, external }: ContactActionButtonProps) {
    if (!href) return null;
    return (
        <Tooltip title={label}>
            <IconButton
                component="a"
                href={href}
                aria-label={label}
                size="small"
                // Drawers and table rows often react to clicks themselves.
                onClick={(e: React.MouseEvent) => e.stopPropagation()}
                {...(external && { target: '_blank', rel: 'noopener noreferrer' })}
                sx={{
                    width: 26,
                    height: 26,
                    flexShrink: 0,
                    color,
                    border: `1px solid color-mix(in srgb, ${color} 35%, transparent)`,
                    backgroundColor: `color-mix(in srgb, ${color} 10%, transparent)`,
                    borderRadius: '7px',
                    transition: 'all 0.15s ease',
                    '&:hover': {
                        color: '#ffffff',
                        borderColor: color,
                        backgroundColor: color,
                    },
                }}
            >
                {icon}
            </IconButton>
        </Tooltip>
    );
}

const rowSx = { display: 'inline-flex', alignItems: 'center', gap: 0.5, flexShrink: 0 } as const;

/**
 * Channel identity colours as used across the industry (not brand UI, so they stay the same in light and dark
 * mode): phone-app green, Google Messages blue, WhatsApp green, Gmail red.
 */
export const CHANNEL_COLORS = {
    call: '#16A34A',
    sms: '#1A73E8',
    whatsapp: '#25D366',
    email: '#EA4335',
} as const;

/** Call, SMS, WhatsApp and copy buttons for a phone number. */
export function PhoneActions({ phone, copyTitle = 'Copy phone number' }: { phone?: string | null; copyTitle?: string }) {
    const value = phone?.trim();
    if (!value) return null;
    return (
        <Box component="span" sx={rowSx}>
            <ContactActionButton label="Call" href={telHref(value)} icon={<CallOutlinedIcon sx={{ fontSize: 14 }} />} color={CHANNEL_COLORS.call} />
            <ContactActionButton label="Send SMS" href={smsHref(value)} icon={<SmsOutlinedIcon sx={{ fontSize: 14 }} />} color={CHANNEL_COLORS.sms} />
            <ContactActionButton
                label="WhatsApp"
                href={whatsappHref(value)}
                icon={<WhatsAppIcon sx={{ fontSize: 14 }} />}
                color={CHANNEL_COLORS.whatsapp}
                external
            />
            <DrawerCopyButton text={phoneForCopy(value)} title={copyTitle} iconColor="var(--mui-palette-text-secondary)" />
        </Box>
    );
}

/** Send-email and copy buttons for an email address. */
export function EmailActions({ email, copyTitle = 'Copy email' }: { email?: string | null; copyTitle?: string }) {
    const value = email?.trim();
    if (!value) return null;
    return (
        <Box component="span" sx={rowSx}>
            <ContactActionButton
                label="Send email"
                href={mailtoHref(value)}
                icon={<MailOutlineIcon sx={{ fontSize: 14 }} />}
                color={CHANNEL_COLORS.email}
            />
            <DrawerCopyButton text={value} title={copyTitle} iconColor="var(--mui-palette-text-secondary)" />
        </Box>
    );
}
