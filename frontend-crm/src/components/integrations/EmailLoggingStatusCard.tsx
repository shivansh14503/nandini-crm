'use client';

import { Box, Skeleton, Typography } from '@mui/material';
import MailOutlineRoundedIcon from '@mui/icons-material/MailOutlineRounded';
import { panelHeaderSx, surfaceSx } from '@/components/settings/form-customization/builderUi';
import { formatDateTime, hintSx, StatusChip } from '@/components/settings/integrations/integrationUi';
import { useOwnEmailLogging } from '@/hooks/queries/useEmailLogs';
import { EMAIL_VISIBILITY_LABELS, NOT_LOGGED_LABELS, type OwnEmailLogging } from '@/types/emailLog.types';

/**
 * My Profile › Connected accounts: whether the employee's emails with customers are logged on CRM records (Calendar
 * Phase 4). Read-only: admins switch it on or off per person, so there is no toggle here, only what is kept and who
 * sees it. Hidden while the company switch is off and the employee has nothing to know.
 */

const MAILBOX_LABELS: Record<string, string> = { google: 'Gmail', microsoft: 'Outlook', fake: 'Test mailbox' };

function statusLine(data: OwnEmailLogging): { tone: 'success' | 'warning' | 'neutral'; label: string; text: string } {
    if (!data.logging) return { tone: 'neutral', label: 'Not logged', text: data.reason ? `${NOT_LOGGED_LABELS[data.reason]}.` : 'Your emails are not logged.' };
    if (data.status === 'error') return { tone: 'warning', label: 'Needs attention', text: "Logging isn't working right now. Your admins have been told; nothing is needed from you." };
    return {
        tone: 'success',
        label: 'Logging',
        text: data.lastSuccessAt ? `Last checked ${formatDateTime(data.lastSuccessAt)}.` : 'Your mailbox will be checked shortly.',
    };
}

export function EmailLoggingStatusCard() {
    const query = useOwnEmailLogging();
    const data = query.data;
    if (query.isError || (data && !data.companyEnabled)) return null;
    const line = data ? statusLine(data) : null;
    return (
        <Box component="section" aria-labelledby="own-email-logging-title" sx={{ ...surfaceSx, overflow: 'hidden', minWidth: 0 }}>
            <Box sx={panelHeaderSx}>
                <Typography id="own-email-logging-title" component="h2" sx={{ fontWeight: 700, fontSize: '0.92rem', color: 'var(--crm-slate-900)' }}>
                    Email logging
                </Typography>
                <Typography sx={hintSx}>Your admins decide whose emails with customers are logged on CRM contacts, leads and opportunities.</Typography>
            </Box>
            <Box sx={{ p: { xs: 1.75, sm: 2 }, display: 'flex', gap: 1.5, alignItems: 'flex-start', minWidth: 0 }}>
                <Box
                    aria-hidden
                    sx={{
                        width: 40,
                        height: 40,
                        flexShrink: 0,
                        borderRadius: '10px',
                        display: 'grid',
                        placeItems: 'center',
                        color: 'var(--crm-text-blue-700)',
                        backgroundColor: 'var(--mui-palette-primary-soft)',
                        border: '1px solid var(--mui-palette-primary-softBorder)',
                    }}
                >
                    <MailOutlineRoundedIcon sx={{ fontSize: 22 }} />
                </Box>
                {!data || !line ? (
                    <Skeleton variant="rounded" height={56} sx={{ flex: 1 }} />
                ) : (
                    <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                            <Typography sx={{ fontWeight: 600, fontSize: '0.86rem', color: 'var(--crm-slate-900)', overflowWrap: 'anywhere' }}>
                                {data.logging && data.provider ? `${MAILBOX_LABELS[data.provider] ?? data.provider}${data.accountEmail ? ` · ${data.accountEmail}` : ''}` : 'Your mailbox'}
                            </Typography>
                            <StatusChip tone={line.tone}>{line.label}</StatusChip>
                        </Box>
                        <Typography sx={hintSx}>{line.text}</Typography>
                        {data.logging && (
                            <Typography sx={hintSx}>
                                Emails to or from CRM contacts and leads are logged with their subject, participants and time
                                {data.storeSnippets ? ' and a short snippet' : ''}; never the body, attachments or Bcc. Internal, private (labelled
                                &quot;Private&quot;, &quot;Personal&quot; or &quot;No CRM&quot;) and automated mail is skipped. Kept {data.retentionMonths} months. Seen by:{' '}
                                {EMAIL_VISIBILITY_LABELS[data.visibility].toLowerCase()}.
                            </Typography>
                        )}
                    </Box>
                )}
            </Box>
        </Box>
    );
}
