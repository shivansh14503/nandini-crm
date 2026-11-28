'use client';

import React, { useEffect, useState } from 'react';
import {
    Alert,
    Box,
    Button,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    MenuItem,
    Pagination,
    Skeleton,
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableRow,
    TextField,
    Typography,
} from '@mui/material';
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded';
import { AppToast } from '@/components/common/AppToast';
import { ClampedText } from '@/components/common/ClampedText';
import { EmptyState, errorMessage, inputSx, panelHeaderSx, secondaryButtonSx, surfaceSx } from '@/components/settings/form-customization/builderUi';
import { useEmailQueue, useRetryEmail } from '@/hooks/queries/useEmailAdmin';
import type { EmailLogDto, EmailLogStatus } from '@/types/emailAdmin.types';
import { fmtInstant } from '@/utils/formats';
import { Fact, StatusChip, type Tone } from './emailUi';

const STATUS_LABEL: Record<EmailLogStatus, string> = { queued: 'Queued', sending: 'Sending', sent: 'Sent', failed: 'Failed', skipped: 'Skipped' };
const STATUS_TONE: Record<EmailLogStatus, Tone> = { queued: 'info', sending: 'info', sent: 'success', failed: 'error', skipped: 'warning' };
const STATUSES: EmailLogStatus[] = ['failed', 'queued', 'sending', 'sent', 'skipped'];
const PAGE_SIZE = 25;

const retryLabel = (row: EmailLogDto) => (row.retry === 'resend_link' ? 'Send new link' : 'Retry');

/** Email Queue: every email the CRM sent or tried to send, newest first, with Retry for failed ones. */
export function EmailQueuePanel() {
    const [status, setStatus] = useState<EmailLogStatus | ''>('');
    const [kind, setKind] = useState('');
    const [search, setSearch] = useState('');
    const [q, setQ] = useState('');
    const [page, setPage] = useState(1);
    const [open, setOpen] = useState<EmailLogDto | null>(null);
    const [toast, setToast] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({ open: false, message: '', severity: 'success' });

    useEffect(() => {
        const timer = setTimeout(() => {
            setQ(search.trim());
            setPage(1);
        }, 350);
        return () => clearTimeout(timer);
    }, [search]);

    const query = useEmailQueue({ status: status || undefined, kind: kind || undefined, q: q || undefined, page, limit: PAGE_SIZE });
    const retry = useRetryEmail();

    const onRetry = async (row: EmailLogDto) => {
        try {
            const result = await retry.mutateAsync(row.id);
            setToast({ open: true, message: result.message, severity: result.ok ? 'success' : 'error' });
            setOpen((current) => (current?.id === row.id ? (result.email ?? null) : current));
        } catch (err) {
            setToast({ open: true, message: errorMessage(err, 'Could not retry the email.'), severity: 'error' });
        }
    };

    const summary = query.data?.summary;
    const pages = query.data ? Math.max(1, Math.ceil(query.data.total / PAGE_SIZE)) : 1;

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
            {summary && (
                <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', sm: 'repeat(3, minmax(0, 1fr))', lg: 'repeat(6, minmax(0, 1fr))' }, gap: 1.5 }}>
                    <Box sx={{ ...surfaceSx, p: 1.5 }}>
                        <Fact label="Sent today">
                            {summary.sentToday} / {summary.dailyLimit}
                        </Fact>
                    </Box>
                    {STATUSES.map((s) => {
                        const active = status === s;
                        return (
                            <Box
                                key={s}
                                component="button"
                                type="button"
                                aria-pressed={active}
                                onClick={() => {
                                    setStatus(active ? '' : s);
                                    setPage(1);
                                }}
                                sx={{
                                    ...surfaceSx,
                                    p: 1.5,
                                    textAlign: 'left',
                                    cursor: 'pointer',
                                    font: 'inherit',
                                    minHeight: 44,
                                    borderColor: active ? 'var(--mui-palette-primary-softBorder)' : 'var(--mui-palette-border-main)',
                                    backgroundColor: active ? 'var(--mui-palette-primary-soft)' : 'var(--mui-palette-background-paper)',
                                    transition: 'all 0.15s ease',
                                    '&:hover': { borderColor: 'var(--crm-blue-300)', backgroundColor: 'var(--mui-palette-primary-soft)' },
                                    '&:focus-visible': { outline: 'none', boxShadow: '0 0 0 3px rgb(var(--crm-accent-rgb) / 0.22)' },
                                }}
                            >
                                <Fact label={STATUS_LABEL[s]}>{summary.counts[s]}</Fact>
                            </Box>
                        );
                    })}
                </Box>
            )}

            <Box sx={{ ...surfaceSx, overflow: 'hidden', minWidth: 0 }}>
                <Box sx={{ ...panelHeaderSx, display: 'flex', flexWrap: 'wrap', gap: 1, alignItems: 'center' }}>
                    <TextField
                        size="small"
                        placeholder="Search recipient or subject"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        sx={{ ...inputSx, flex: { xs: '1 1 100%', sm: '1 1 240px' } }}
                        slotProps={{ htmlInput: { 'aria-label': 'Search recipient or subject' } }}
                    />
                    <TextField
                        select
                        size="small"
                        label="Status"
                        value={status}
                        onChange={(e) => {
                            setStatus(e.target.value as EmailLogStatus | '');
                            setPage(1);
                        }}
                        sx={{ ...inputSx, flex: { xs: '1 1 45%', sm: '0 0 150px' } }}
                    >
                        <MenuItem value="">All</MenuItem>
                        {STATUSES.map((s) => (
                            <MenuItem key={s} value={s}>
                                {STATUS_LABEL[s]}
                            </MenuItem>
                        ))}
                    </TextField>
                    <TextField
                        select
                        size="small"
                        label="Type"
                        value={kind}
                        onChange={(e) => {
                            setKind(e.target.value);
                            setPage(1);
                        }}
                        sx={{ ...inputSx, flex: { xs: '1 1 45%', sm: '0 0 190px' } }}
                    >
                        <MenuItem value="">All</MenuItem>
                        {(summary?.kinds ?? []).map((k) => (
                            <MenuItem key={k.value} value={k.value}>
                                {k.label}
                            </MenuItem>
                        ))}
                    </TextField>
                    <Button variant="outlined" startIcon={<RefreshRoundedIcon />} sx={{ ...secondaryButtonSx, minHeight: 40 }} onClick={() => void query.refetch()} disabled={query.isFetching}>
                        Refresh
                    </Button>
                </Box>

                {query.isPending ? (
                    <Box sx={{ p: 2 }}>
                        <Skeleton variant="rounded" height={240} />
                    </Box>
                ) : query.isError || !query.data ? (
                    <Alert severity="error" sx={{ m: 2, borderRadius: '10px' }}>
                        {errorMessage(query.error, 'Could not load the email queue.')}
                    </Alert>
                ) : query.data.data.length === 0 ? (
                    <EmptyState title="No emails" description={status || kind || q ? 'Nothing matches these filters.' : 'Emails the CRM sends will show here.'} />
                ) : (
                    <Box sx={{ overflowX: 'auto' }}>
                        <Table size="small" sx={{ minWidth: 820 }}>
                            <TableHead>
                                <TableRow sx={{ '& th': { backgroundColor: 'var(--mui-palette-background-subtle)', fontWeight: 700, fontSize: '0.75rem', color: 'var(--mui-palette-text-secondary)', whiteSpace: 'nowrap' } }}>
                                    <TableCell>Created</TableCell>
                                    <TableCell>To</TableCell>
                                    <TableCell>Type</TableCell>
                                    <TableCell>Subject</TableCell>
                                    <TableCell>Status</TableCell>
                                    <TableCell align="right">Action</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {query.data.data.map((row) => (
                                    <TableRow
                                        key={row.id}
                                        hover
                                        onClick={() => setOpen(row)}
                                        sx={{ cursor: 'pointer', '& td': { fontSize: '0.8rem', color: 'var(--crm-slate-900)', borderColor: 'var(--mui-palette-border-light)' } }}
                                    >
                                        <TableCell sx={{ whiteSpace: 'nowrap' }}>{fmtInstant(row.createdAt)}</TableCell>
                                        <TableCell sx={{ maxWidth: 220, overflowWrap: 'anywhere' }}>
                                            {row.toEmail}
                                            {row.toUsername && <Box sx={{ fontSize: '0.72rem', color: 'var(--mui-palette-text-secondary)' }}>{row.toUsername}</Box>}
                                        </TableCell>
                                        <TableCell sx={{ whiteSpace: 'nowrap' }}>{row.kindLabel}</TableCell>
                                        <TableCell sx={{ maxWidth: 280, overflowWrap: 'anywhere' }}>{row.subject}</TableCell>
                                        <TableCell sx={{ maxWidth: 260 }}>
                                            <StatusChip tone={STATUS_TONE[row.status]}>{STATUS_LABEL[row.status]}</StatusChip>
                                            {row.error && (
                                                <Box sx={{ fontSize: '0.72rem', color: 'var(--mui-palette-text-secondary)', mt: 0.5, overflowWrap: 'anywhere', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                                                    {row.error}
                                                </Box>
                                            )}
                                        </TableCell>
                                        <TableCell align="right" onClick={(e) => e.stopPropagation()}>
                                            {row.retry && (
                                                <Button size="small" variant="outlined" sx={{ ...secondaryButtonSx, minHeight: 32, whiteSpace: 'nowrap' }} disabled={retry.isPending} onClick={() => void onRetry(row)}>
                                                    {retryLabel(row)}
                                                </Button>
                                            )}
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </Box>
                )}
                {query.data && query.data.total > PAGE_SIZE && (
                    <Box sx={{ display: 'flex', justifyContent: 'center', p: 1.5, borderTop: '1px solid var(--mui-palette-border-light)' }}>
                        <Pagination count={pages} page={page} onChange={(_, p) => setPage(p)} size="small" />
                    </Box>
                )}
            </Box>

            <Dialog open={Boolean(open)} onClose={() => setOpen(null)} fullWidth maxWidth="sm" sx={{ '& .MuiDialog-paper': { m: { xs: 1, sm: 4 }, width: { xs: 'calc(100% - 16px)', sm: undefined } } }}>
                {open && (
                    <>
                        <DialogTitle sx={{ fontSize: '0.95rem', fontWeight: 700, overflowWrap: 'anywhere' }}>{open.subject}</DialogTitle>
                        <DialogContent dividers sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'repeat(2, minmax(0, 1fr))' }, gap: 2 }}>
                            <Fact label="Status">
                                <StatusChip tone={STATUS_TONE[open.status]}>{STATUS_LABEL[open.status]}</StatusChip>
                            </Fact>
                            <Fact label="Type">{open.kindLabel}</Fact>
                            <Fact label="To">{open.toEmail}</Fact>
                            <Fact label="From">{open.fromEmail ?? '—'}</Fact>
                            <Fact label="Created">{fmtInstant(open.createdAt)}</Fact>
                            <Fact label="Sent">{open.sentAt ? fmtInstant(open.sentAt) : '—'}</Fact>
                            <Fact label="Attempts">
                                {open.attempts} of {open.maxAttempts}
                            </Fact>
                            <Fact label="Next attempt">{open.nextAttemptAt ? fmtInstant(open.nextAttemptAt) : '—'}</Fact>
                            <Fact label="Sent with">{open.provider === 'gmail' ? 'Gmail API' : open.provider === 'smtp' ? 'SMTP' : '—'}</Fact>
                            <Fact label="Template">{open.templateKey ?? '—'}</Fact>
                            {open.error && (
                                <Box sx={{ gridColumn: '1 / -1' }}>
                                    <Fact label="Error">
                                        <ClampedText>{open.error}</ClampedText>
                                    </Fact>
                                </Box>
                            )}
                            {open.retry === 'resend_link' && (
                                <Typography sx={{ gridColumn: '1 / -1', fontSize: '0.75rem', color: 'var(--mui-palette-text-secondary)' }}>
                                    Set-password links are never stored, so this sends the user a new link instead.
                                </Typography>
                            )}
                        </DialogContent>
                        <DialogActions sx={{ flexWrap: 'wrap', gap: 1 }}>
                            <Button variant="outlined" sx={{ ...secondaryButtonSx, minHeight: 40 }} onClick={() => setOpen(null)}>
                                Close
                            </Button>
                            {open.retry && (
                                <Button variant="outlined" sx={{ ...secondaryButtonSx, minHeight: 40 }} disabled={retry.isPending} onClick={() => void onRetry(open)}>
                                    {retry.isPending ? 'Sending…' : retryLabel(open)}
                                </Button>
                            )}
                        </DialogActions>
                    </>
                )}
            </Dialog>

            <AppToast open={toast.open} message={toast.message} severity={toast.severity} onClose={() => setToast((t) => ({ ...t, open: false }))} autoHideDuration={6000} />
        </Box>
    );
}
