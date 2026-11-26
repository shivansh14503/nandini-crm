'use client';

import React, { useEffect, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Box, Button, CircularProgress, Skeleton, Tooltip, Typography } from '@mui/material';
import VerifiedUserOutlinedIcon from '@mui/icons-material/VerifiedUserOutlined';
import GppBadOutlinedIcon from '@mui/icons-material/GppBadOutlined';
import GppMaybeOutlinedIcon from '@mui/icons-material/GppMaybeOutlined';
import ShieldOutlinedIcon from '@mui/icons-material/ShieldOutlined';
import { errorMessage, secondaryButtonSx, surfaceSx } from '@/components/settings/form-customization/builderUi';
import { auditAdminService, type AuditIntegrityStatus } from '@/services/auditAdmin.service';
import { AUDIT_LOG_KEY } from './auditLogUi';
import { fmtCount } from '@/utils/formats';

const INTEGRITY_KEY = [...AUDIT_LOG_KEY, 'integrity'] as const;
const POLL_MS = 3000;

type Tone = 'success' | 'error' | 'warning' | 'neutral';
const TONES: Record<Tone, { color: string; bg: string; border: string }> = {
    success: { color: 'var(--mui-palette-success-main)', bg: 'var(--mui-palette-success-soft)', border: 'var(--mui-palette-success-softBorder)' },
    error: { color: 'var(--mui-palette-error-main)', bg: 'var(--mui-palette-error-soft)', border: 'var(--mui-palette-error-softBorder)' },
    warning: { color: 'var(--crm-amber-700)', bg: 'var(--mui-palette-warning-soft)', border: 'var(--mui-palette-warning-softBorder)' },
    neutral: { color: 'var(--mui-palette-text-secondary)', bg: 'var(--mui-palette-background-subtle)', border: 'var(--mui-palette-border-main)' },
};

/** Headline, explanation and tone of the last check. */
function describe(status: AuditIntegrityStatus): { tone: Tone; icon: React.ReactNode; title: string; detail: string } {
    const check = status.lastCheck;
    if (!check) return { tone: 'neutral', icon: <ShieldOutlinedIcon />, title: 'Not verified yet', detail: 'Run a check to prove no entry was changed or removed.' };
    if (check.result === 'verified') return { tone: 'success', icon: <VerifiedUserOutlinedIcon />, title: `Verified ${check.time}`, detail: check.message };
    if (check.result === 'failed') return { tone: 'error', icon: <GppBadOutlinedIcon />, title: `Check FAILED ${check.time}`, detail: check.message };
    return { tone: 'warning', icon: <GppMaybeOutlinedIcon />, title: `Check couldn’t run ${check.time}`, detail: check.message };
}

/**
 * Tamper evidence for the log: the last "Verify integrity" result, the saved ledger digests, and the buttons to check
 * now or save a digest. A check runs in the background (about 100 s per million entries) and is polled.
 */
export function AuditIntegrityPanel() {
    const queryClient = useQueryClient();
    const status = useQuery({
        queryKey: INTEGRITY_KEY,
        queryFn: () => auditAdminService.integrity(),
        refetchInterval: (q) => (q.state.data?.running ? POLL_MS : false),
    });
    const setStatus = (next: AuditIntegrityStatus) => queryClient.setQueryData(INTEGRITY_KEY, next);
    const verify = useMutation({ mutationFn: () => auditAdminService.verifyIntegrity(), onSuccess: setStatus });
    const digest = useMutation({ mutationFn: () => auditAdminService.saveDigest(), onSuccess: (result) => setStatus(result.status) });

    // When a check finishes, its LEDGER_VERIFY entry is in the log: show it.
    const wasRunning = useRef(false);
    const running = Boolean(status.data?.running);
    useEffect(() => {
        if (wasRunning.current && !running) void queryClient.invalidateQueries({ queryKey: [...AUDIT_LOG_KEY, 'list'] });
        wasRunning.current = running;
    }, [running, queryClient]);

    const data = status.data;
    const view = data ? describe(data) : null;
    const tone = view ? TONES[view.tone] : TONES.neutral;
    const latest = data?.digests.latest;
    const error = verify.error ?? digest.error ?? status.error;

    return (
        <Box sx={{ ...surfaceSx, p: 2, display: 'flex', flexDirection: 'column', gap: 1.25, minWidth: 0 }}>
            <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, flexWrap: 'wrap' }}>
                <Typography sx={{ fontWeight: 700, fontSize: '0.88rem', color: 'var(--crm-slate-900)' }}>Integrity</Typography>
                <Typography sx={{ fontSize: '0.75rem', color: 'var(--mui-palette-text-secondary)' }}>SQL Server ledger</Typography>
            </Box>

            {!data ? (
                <Skeleton variant="rounded" height={64} />
            ) : (
                <Box sx={{ display: 'flex', gap: 1.25, alignItems: 'flex-start' }}>
                    <Box
                        sx={{
                            width: 34,
                            height: 34,
                            borderRadius: '9px',
                            flexShrink: 0,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: tone.color,
                            backgroundColor: tone.bg,
                            border: `1px solid ${tone.border}`,
                            '& svg': { fontSize: 19 },
                        }}
                    >
                        {running ? <CircularProgress size={16} sx={{ color: 'inherit' }} /> : view?.icon}
                    </Box>
                    <Box sx={{ minWidth: 0 }}>
                        <Typography sx={{ fontSize: '0.82rem', fontWeight: 700, color: view?.tone === 'error' ? tone.color : 'var(--crm-slate-900)' }}>
                            {running ? 'Checking the log…' : view?.title}
                        </Typography>
                        <Typography sx={{ fontSize: '0.75rem', color: 'var(--mui-palette-text-secondary)', lineHeight: 1.5, wordBreak: 'break-word' }}>
                            {running ? 'Reading every entry against the saved digests. This takes about a minute and a half per million entries.' : view?.detail}
                        </Typography>
                    </Box>
                </Box>
            )}

            {data && (
                <Typography sx={{ fontSize: '0.72rem', color: 'var(--mui-palette-text-muted)', lineHeight: 1.5 }}>
                    {data.digests.count === 0
                        ? 'No digest saved yet.'
                        : `${fmtCount(data.digests.count)} digest${data.digests.count === 1 ? '' : 's'} saved, latest ${latest?.time} (block ${latest?.blockId}).`}{' '}
                    {data.schedule}.
                </Typography>
            )}
            {data && !data.digestDirConfigured && (
                <Alert severity="warning" sx={{ fontSize: '0.75rem', py: 0 }}>
                    Digests are kept next to the application. Set AUDIT_DIGEST_DIR to storage outside the database server.
                </Alert>
            )}
            {error && (
                <Alert severity="error" sx={{ fontSize: '0.75rem', py: 0 }}>
                    {errorMessage(error, 'Could not reach the integrity check.')}
                </Alert>
            )}

            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mt: 'auto' }}>
                <Button
                    variant="outlined"
                    size="small"
                    sx={secondaryButtonSx}
                    disabled={!data || running || verify.isPending}
                    startIcon={verify.isPending || running ? <CircularProgress size={14} /> : <VerifiedUserOutlinedIcon />}
                    onClick={() => verify.mutate()}
                >
                    Verify integrity
                </Button>
                <Tooltip title="Saves the ledger's current hash outside the database. One is saved every night anyway.">
                    <span>
                        <Button
                            size="small"
                            sx={{ ...secondaryButtonSx, border: 'none' }}
                            disabled={!data || digest.isPending}
                            startIcon={digest.isPending ? <CircularProgress size={14} /> : undefined}
                            onClick={() => digest.mutate()}
                        >
                            Save a digest now
                        </Button>
                    </span>
                </Tooltip>
            </Box>
        </Box>
    );
}
