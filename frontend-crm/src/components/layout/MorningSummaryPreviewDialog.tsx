'use client';

import { useId, useState } from 'react';
import {
    Box,
    Button,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    IconButton,
    Skeleton,
    Tooltip,
    Typography,
    useMediaQuery,
    useTheme,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import RefreshIcon from '@mui/icons-material/Refresh';
import SendOutlinedIcon from '@mui/icons-material/SendOutlined';
import MailOutlineOutlinedIcon from '@mui/icons-material/MailOutlineOutlined';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import { AppToast } from '@/components/common/AppToast';
import { RaisedLayer } from '@/components/common/RaisedLayer';
import { useAuth } from '@/context/AuthContext';
import { useMorningSummaryPreview, useSendMorningSummaryTest } from '@/hooks/queries/useNotifications';
import type { MorningSummaryNotSentReason, MorningSummaryTestResult } from '@/types/notification.types';
import { isAdminRole } from '@/utils/adminRoles';

export interface MorningSummaryPreviewDialogProps {
    open: boolean;
    onClose: () => void;
}

/** Brand gradient with its own hover gradient (CLAUDE.md §2.D). */
const primaryButtonSx = {
    textTransform: 'none',
    fontWeight: 700,
    fontSize: '0.85rem',
    height: 40,
    px: 2.2,
    borderRadius: '8px',
    color: '#ffffff',
    boxShadow: 'none',
    background: 'linear-gradient(135deg, var(--crm-fill-blue-700) 0%, var(--crm-fill-blue-600) 100%)',
    '&:hover': {
        background: 'linear-gradient(135deg, var(--crm-fill-blue-800) 0%, var(--crm-fill-blue-700) 100%)',
        boxShadow: '0 4px 14px rgb(var(--crm-accent-rgb) / 0.28)',
    },
    '&.Mui-disabled': { color: '#ffffff', opacity: 0.6 },
} as const;

const outlinedButtonSx = {
    textTransform: 'none',
    fontWeight: 600,
    fontSize: '0.85rem',
    height: 40,
    px: 2,
    borderRadius: '8px',
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

const iconButtonSx = {
    width: 40,
    height: 40,
    flexShrink: 0,
    border: '1px solid var(--mui-palette-border-main)',
    borderRadius: '8px',
    color: 'var(--mui-palette-text-secondary)',
    backgroundColor: 'var(--mui-palette-background-paper)',
    transition: 'all 0.15s ease',
    '&:hover': { borderColor: 'var(--crm-blue-300)', backgroundColor: 'var(--mui-palette-primary-soft)', color: 'var(--crm-text-blue-700)' },
} as const;

const NOTE_COLORS = {
    info: { background: 'var(--mui-palette-primary-soft)', border: 'var(--mui-palette-primary-softBorder)', color: 'var(--crm-text-blue-900)' },
    warning: { background: 'var(--mui-palette-warning-soft)', border: 'var(--mui-palette-warning-softBorder)', color: 'var(--crm-amber-700)' },
} as const;

function Note({ tone, children }: { tone: keyof typeof NOTE_COLORS; children: React.ReactNode }) {
    const c = NOTE_COLORS[tone];
    return (
        <Box
            sx={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 1,
                px: 1.5,
                py: 1,
                borderRadius: '8px',
                backgroundColor: c.background,
                border: `1px solid ${c.border}`,
                color: c.color,
            }}
        >
            <InfoOutlinedIcon sx={{ fontSize: 18, mt: '1px', flexShrink: 0 }} />
            <Typography sx={{ fontSize: '0.8rem', lineHeight: 1.45, color: 'inherit', minWidth: 0 }}>{children}</Typography>
        </Box>
    );
}

/** Why this user gets no morning email (`notSentReason`); their preferences live in My Profile › Notifications. */
const NOT_SENT_NOTES: Record<MorningSummaryNotSentReason, string> = {
    opted_out: 'You turned this email off in My Profile › Notifications.',
    out_of_office: 'You are out of office today, so this email is paused.',
    on_leave: 'You are marked as on leave, so this email is paused.',
};

type ToastState = { open: boolean; message: string; severity: 'success' | 'error' | 'info' | 'warning' };

const toastSeverity = (status: MorningSummaryTestResult['status']): ToastState['severity'] =>
    status === 'sent' ? 'success' : status === 'failed' ? 'error' : 'info';

function PreviewContent({ titleId, onClose }: { titleId: string; onClose: () => void }) {
    const { user } = useAuth();
    const canSendTest = isAdminRole(user?.role);
    const preview = useMorningSummaryPreview();
    const sendTest = useSendMorningSummaryTest();
    const [toast, setToast] = useState<ToastState>({ open: false, message: '', severity: 'success' });
    const data = preview.data;

    const handleSendTest = () =>
        sendTest.mutate(undefined, {
            onSuccess: (result) =>
                setToast({ open: true, message: result.message || `Test email: ${result.status}.`, severity: toastSeverity(result.status) }),
            onError: (err) =>
                setToast({ open: true, message: err instanceof Error && err.message ? err.message : 'The test email could not be sent.', severity: 'error' }),
        });

    return (
        <>
            <DialogTitle
                component="div"
                id={titleId}
                sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1.25,
                    py: 1.5,
                    px: { xs: 2, sm: 3 },
                    borderBottom: '1px solid var(--mui-palette-border-light)',
                }}
            >
                <Box
                    sx={{
                        width: 36,
                        height: 36,
                        flexShrink: 0,
                        borderRadius: '10px',
                        display: { xs: 'none', sm: 'flex' },
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: 'var(--mui-palette-primary-soft)',
                        border: '1px solid var(--mui-palette-primary-softBorder)',
                        color: 'var(--crm-text-blue-600)',
                    }}
                >
                    <MailOutlineOutlinedIcon sx={{ fontSize: 20 }} />
                </Box>
                <Box sx={{ minWidth: 0, flex: 1 }}>
                    <Typography noWrap sx={{ fontSize: '1rem', fontWeight: 800, color: 'var(--crm-slate-900)' }}>
                        Morning email preview
                    </Typography>
                    <Typography noWrap sx={{ fontSize: '0.75rem', color: 'var(--mui-palette-text-secondary)' }}>
                        Your summary for today, as it would be sent now
                    </Typography>
                </Box>
                <Tooltip title="Refresh">
                    <span>
                        <IconButton onClick={() => preview.refetch()} disabled={preview.isFetching} aria-label="Refresh the preview" sx={iconButtonSx}>
                            <RefreshIcon sx={{ fontSize: 20 }} />
                        </IconButton>
                    </span>
                </Tooltip>
                <Tooltip title="Close">
                    <IconButton
                        onClick={onClose}
                        aria-label="Close"
                        sx={{
                            ...iconButtonSx,
                            '&:hover': {
                                color: 'var(--mui-palette-error-main)',
                                backgroundColor: 'var(--mui-palette-error-soft)',
                                borderColor: 'var(--mui-palette-error-softBorder)',
                            },
                        }}
                    >
                        <CloseIcon sx={{ fontSize: 20 }} />
                    </IconButton>
                </Tooltip>
            </DialogTitle>

            <DialogContent
                sx={{
                    px: { xs: 1.5, sm: 3 },
                    pt: '16px !important',
                    pb: 2,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 1.25,
                    minHeight: 0,
                }}
            >
                {preview.isPending ? (
                    <Box aria-busy="true" sx={{ display: 'flex', flexDirection: 'column', gap: 1.25, flex: 1 }}>
                        <Skeleton variant="text" width="60%" />
                        <Skeleton variant="rounded" sx={{ flex: 1, minHeight: 320, borderRadius: '10px' }} />
                    </Box>
                ) : preview.isError || !data ? (
                    <Note tone="warning">
                        {preview.error instanceof Error && preview.error.message ? preview.error.message : 'The preview could not be loaded.'}
                    </Note>
                ) : (
                    <>
                        {!data.mailEnabled && (
                            <Note tone="info">
                                Email is turned off on the server, so nothing is sent yet. This is what your email would look like once it is
                                set up.
                            </Note>
                        )}
                        {!data.email && (
                            <Note tone="warning">Your user account has no email address, so you won&apos;t get this email. Ask an admin to add one.</Note>
                        )}
                        {data.notSentReason && <Note tone="info">{NOT_SENT_NOTES[data.notSentReason]}</Note>}
                        {data.empty && (
                            <Note tone="info">Nothing is due for you today. Users with nothing due get no email, unless the server is set to send it anyway.</Note>
                        )}
                        <Box sx={{ minWidth: 0 }}>
                            <Typography sx={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--mui-palette-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                Subject
                            </Typography>
                            <Typography sx={{ fontSize: '0.86rem', fontWeight: 600, color: 'var(--crm-slate-900)', overflowWrap: 'anywhere' }}>{data.subject}</Typography>
                            {data.email && (
                                <Typography sx={{ fontSize: '0.75rem', color: 'var(--mui-palette-text-secondary)', overflowWrap: 'anywhere' }}>To {data.email}</Typography>
                            )}
                        </Box>
                        {/* The email as mail clients show it: its own light page, no scripts (sandbox=""), links inert. */}
                        <Box
                            sx={{
                                flex: 1,
                                minHeight: { xs: 360, sm: 420 },
                                borderRadius: '10px',
                                overflow: 'hidden',
                                border: '1px solid var(--mui-palette-border-main)',
                                backgroundColor: 'var(--mui-palette-background-subtle)',
                                display: 'flex',
                            }}
                        >
                            <Box
                                component="iframe"
                                title="Morning email preview"
                                sandbox=""
                                srcDoc={data.html}
                                sx={{ flex: 1, width: '100%', minHeight: '100%', border: 0, display: 'block' }}
                            />
                        </Box>
                        <Typography sx={{ fontSize: '0.72rem', color: 'var(--mui-palette-text-muted)' }}>
                            Links don&apos;t open from the preview. In the email they open the CRM or add the meeting to Google Calendar.
                        </Typography>
                    </>
                )}
            </DialogContent>

            <DialogActions
                sx={{ px: { xs: 2, sm: 3 }, py: 1.5, gap: 1, borderTop: '1px solid var(--mui-palette-border-light)', flexWrap: 'wrap', '& > :not(style) ~ :not(style)': { ml: 0 } }}
            >
                {canSendTest && (
                    <Tooltip title={data?.email ? `Sends this email to ${data.email} now` : ''}>
                        <span>
                            <Button
                                onClick={handleSendTest}
                                disabled={sendTest.isPending || !data}
                                variant="contained"
                                startIcon={<SendOutlinedIcon sx={{ fontSize: '17px !important' }} />}
                                sx={primaryButtonSx}
                            >
                                {sendTest.isPending ? 'Sending…' : 'Send me a test'}
                            </Button>
                        </span>
                    </Tooltip>
                )}
                <Button onClick={onClose} sx={outlinedButtonSx}>
                    Close
                </Button>
            </DialogActions>

            <AppToast open={toast.open} message={toast.message} severity={toast.severity} autoHideDuration={6000} onClose={() => setToast((t) => ({ ...t, open: false }))} />
        </>
    );
}

/**
 * "Preview morning email" (navbar bell footer): the signed-in user's 9 AM summary email for today, rendered as the
 * email itself in a sandboxed iframe. Works while email is turned off on the server. Admin roles can also send it to
 * their own address now ("Send me a test"); the API's answer shows in a toast. Full screen on phones.
 */
export function MorningSummaryPreviewDialog({ open, onClose }: MorningSummaryPreviewDialogProps) {
    const theme = useTheme();
    const fullScreen = useMediaQuery(theme.breakpoints.down('sm'));
    const titleId = useId();
    return (
        <RaisedLayer>
            <Dialog
                open={open}
                onClose={onClose}
                fullScreen={fullScreen}
                fullWidth
                maxWidth="md"
                scroll="paper"
                aria-labelledby={titleId}
                slotProps={{
                    paper: {
                        sx: {
                            backgroundColor: 'var(--mui-palette-background-paper)',
                            backgroundImage: 'none',
                            borderRadius: fullScreen ? 0 : '14px',
                            border: fullScreen ? 'none' : '1px solid var(--mui-palette-border-main)',
                            height: fullScreen ? '100%' : 'min(90vh, 920px)',
                        },
                    },
                }}
            >
                {/* Mounted per opening, so every opening fetches today's email afresh. */}
                {open && <PreviewContent titleId={titleId} onClose={onClose} />}
            </Dialog>
        </RaisedLayer>
    );
}
