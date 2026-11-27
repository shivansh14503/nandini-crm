'use client';

import React from 'react';
import { Alert, Box, Button, Skeleton, Tooltip, Typography } from '@mui/material';
import AttachFileRoundedIcon from '@mui/icons-material/AttachFileRounded';
import CallMadeRoundedIcon from '@mui/icons-material/CallMadeRounded';
import CallReceivedRoundedIcon from '@mui/icons-material/CallReceivedRounded';
import MailOutlineRoundedIcon from '@mui/icons-material/MailOutlineRounded';
import OpenInNewRoundedIcon from '@mui/icons-material/OpenInNewRounded';
import { useRecordEmails } from '@/hooks/queries/useEmailLogs';
import { errorMessage } from '@/components/settings/form-customization/builderUi';
import { formatDateTime, StatusChip } from '@/components/settings/integrations/integrationUi';
import type { EmailAddress, EmailLogModule, LoggedEmail } from '@/types/emailLog.types';

/**
 * A record's Emails tab (Calendar Phase 4; docs/system-design.md › Email logging): the emails logged automatically
 * from enrolled employees' Gmail / Outlook mailboxes, newest first. Only metadata and a short plain-text snippet are
 * stored; nothing here renders HTML (React escapes every string). "Open in Gmail / Outlook" shows only on the
 * caller's own copy, so an employee never gets a link into a colleague's mailbox.
 */

const OPEN_LABELS: Record<string, string> = { google: 'Open in Gmail', microsoft: 'Open in Outlook', fake: 'Open (test mailbox)' };

const outlinedButtonSx = {
    minHeight: 32,
    px: 1.25,
    borderRadius: '8px',
    textTransform: 'none',
    fontWeight: 600,
    fontSize: '0.76rem',
    border: '1px solid var(--mui-palette-border-main)',
    color: 'var(--crm-slate-700)',
    backgroundColor: 'var(--mui-palette-background-paper)',
    transition: 'all 0.15s ease',
    '&:hover': {
        borderColor: 'var(--crm-blue-300)',
        backgroundColor: 'var(--mui-palette-primary-soft)',
        color: 'var(--crm-text-blue-700)',
    },
} as const;

const addressText = (a: EmailAddress) => (a.name ? `${a.name} <${a.email}>` : a.email);
const shortName = (a: EmailAddress) => a.name || a.email;

function recipientsLine(email: LoggedEmail): string {
    const all = [...email.to, ...email.cc];
    const shown = all.slice(0, 3).map(shortName).join(', ');
    const more = all.length - 3 + email.moreRecipients;
    return more > 0 ? `${shown} +${more}` : shown;
}

function EmailRow({ email }: { email: LoggedEmail }) {
    const outgoing = email.direction === 'out';
    const recipients = [...email.to, ...email.cc];
    const fullRecipients = recipients.map(addressText).join(', ') + (email.moreRecipients > 0 ? ` and ${email.moreRecipients} more` : '');
    return (
        <Box
            component="li"
            sx={{
                listStyle: 'none',
                p: { xs: 1.25, sm: 1.5 },
                borderRadius: '10px',
                border: '1px solid var(--mui-palette-border-main)',
                backgroundColor: 'var(--mui-palette-background-paper)',
                display: 'flex',
                flexDirection: 'column',
                gap: 0.6,
                minWidth: 0,
            }}
        >
            <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, minWidth: 0 }}>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography sx={{ fontWeight: 700, fontSize: '0.86rem', color: 'var(--crm-slate-900)', overflowWrap: 'anywhere' }}>{email.subject}</Typography>
                    <Typography sx={{ fontSize: '0.74rem', color: 'var(--mui-palette-text-secondary)' }}>{formatDateTime(email.sentAt)}</Typography>
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexShrink: 0 }}>
                    {email.hasAttachments && (
                        <Tooltip title="Had attachments (not stored in the CRM)">
                            <AttachFileRoundedIcon aria-label="Had attachments" sx={{ fontSize: 16, color: 'var(--mui-palette-text-muted)' }} />
                        </Tooltip>
                    )}
                    <StatusChip tone={outgoing ? 'brand' : 'neutral'}>
                        <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.4 }}>
                            {outgoing ? <CallMadeRoundedIcon sx={{ fontSize: 12 }} /> : <CallReceivedRoundedIcon sx={{ fontSize: 12 }} />}
                            {outgoing ? 'Sent' : 'Received'}
                        </Box>
                    </StatusChip>
                </Box>
            </Box>
            <Typography sx={{ fontSize: '0.78rem', color: 'var(--crm-slate-700)', overflowWrap: 'anywhere' }} title={`From ${addressText(email.from)}\nTo ${fullRecipients}`}>
                <Box component="span" sx={{ color: 'var(--mui-palette-text-secondary)' }}>From </Box>
                {shortName(email.from)}
                {recipients.length > 0 && (
                    <>
                        <Box component="span" sx={{ color: 'var(--mui-palette-text-secondary)' }}> to </Box>
                        {recipientsLine(email)}
                    </>
                )}
            </Typography>
            {email.snippet && (
                <Typography
                    sx={{
                        fontSize: '0.78rem',
                        color: 'var(--mui-palette-text-secondary)',
                        lineHeight: 1.5,
                        overflowWrap: 'anywhere',
                        display: '-webkit-box',
                        WebkitLineClamp: 3,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                    }}
                >
                    {email.snippet}
                </Typography>
            )}
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, flexWrap: 'wrap', mt: 0.25 }}>
                <Typography sx={{ fontSize: '0.72rem', color: 'var(--mui-palette-text-muted)', minWidth: 0, overflowWrap: 'anywhere' }}>
                    {email.participants.length > 0 ? `Logged from ${email.participants.map((p) => p.name).join(', ')}` : ''}
                </Typography>
                {email.openLink && (
                    <Button
                        variant="outlined"
                        size="small"
                        href={email.openLink.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        endIcon={<OpenInNewRoundedIcon sx={{ fontSize: 14 }} />}
                        sx={outlinedButtonSx}
                    >
                        {OPEN_LABELS[email.openLink.provider] ?? 'Open in mailbox'}
                    </Button>
                )}
            </Box>
        </Box>
    );
}

export function RecordEmailsPanel({ module, id }: { module: EmailLogModule; id: string }) {
    const query = useRecordEmails(module, id);
    const pages = query.data?.pages ?? [];
    const first = pages[0];
    const items = pages.flatMap((p) => p.items);

    if (query.isLoading) {
        return (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                {[0, 1, 2].map((i) => (
                    <Skeleton key={i} variant="rounded" height={92} />
                ))}
            </Box>
        );
    }
    if (query.isError || !first) return <Alert severity="error">{errorMessage(query.error, 'Could not load the emails.')}</Alert>;

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25, minWidth: 0 }}>
            {!first.seesAll && first.enabled && (
                <Typography sx={{ fontSize: '0.74rem', color: 'var(--mui-palette-text-secondary)', lineHeight: 1.5 }}>
                    You see the emails you took part in. The record owner, managers and admins see every email logged here.
                </Typography>
            )}
            {items.length === 0 ? (
                <Box
                    sx={{
                        p: 3,
                        textAlign: 'center',
                        borderRadius: '10px',
                        border: '1px dashed var(--mui-palette-border-strong)',
                        backgroundColor: 'var(--mui-palette-background-subtle)',
                    }}
                >
                    <MailOutlineRoundedIcon sx={{ fontSize: 28, color: 'var(--mui-palette-text-muted)' }} />
                    <Typography sx={{ fontSize: '0.84rem', fontWeight: 600, color: 'var(--crm-slate-900)', mt: 0.5 }}>No emails logged yet</Typography>
                    <Typography sx={{ fontSize: '0.76rem', color: 'var(--mui-palette-text-secondary)', mt: 0.25 }}>
                        Emails between enrolled employees and this record&apos;s email addresses appear here automatically.
                    </Typography>
                </Box>
            ) : (
                <Box component="ul" sx={{ m: 0, p: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
                    {items.map((email) => (
                        <EmailRow key={email.id} email={email} />
                    ))}
                </Box>
            )}
            {query.hasNextPage && (
                <Box sx={{ display: 'flex', justifyContent: 'center' }}>
                    <Button variant="outlined" sx={outlinedButtonSx} disabled={query.isFetchingNextPage} onClick={() => void query.fetchNextPage()}>
                        {query.isFetchingNextPage ? 'Loading…' : `Load more (${first.total - items.length} left)`}
                    </Button>
                </Box>
            )}
        </Box>
    );
}
