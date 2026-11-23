'use client';

import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Box, Button, Checkbox, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Skeleton, Table, TableBody, TableCell, TableHead, TableRow, Typography } from '@mui/material';
import UndoRoundedIcon from '@mui/icons-material/UndoRounded';
import RestoreFromTrashOutlinedIcon from '@mui/icons-material/RestoreFromTrashOutlined';
import { Badge, errorMessage, primaryButtonSx, secondaryButtonSx, type BadgeTone } from '@/components/settings/form-customization/builderUi';
import { ApiClientError } from '@/services/apiClient';
import { auditAdminService, type AuditEntryResponse, type UndoField, type UndoFieldStatus, type UndoResult } from '@/services/auditAdmin.service';
import { notifyCrmUpdate } from '@/services/crmSync';
import { AUDIT_LOG_KEY, recordText } from './auditLogUi';

const headCellSx = {
    fontSize: '0.7rem',
    fontWeight: 700,
    color: 'var(--crm-slate-600)',
    textTransform: 'uppercase',
    letterSpacing: '0.03em',
    backgroundColor: 'var(--mui-palette-background-subtle)',
    py: 0.9,
} as const;
const cellSx = { fontSize: '0.8rem', color: 'var(--crm-slate-700)', py: 0.9, verticalAlign: 'top', wordBreak: 'break-word' } as const;
const dialogPaper = { paper: { sx: { borderRadius: '12px', backgroundImage: 'none' } } } as const;

const STATUS_BADGES: Record<Exclude<UndoFieldStatus, 'ready'>, { tone: BadgeTone; label: string; title: string }> = {
    conflict: { tone: 'locked', label: 'Changed since', title: 'Someone changed this field again after this entry, so it is left as it is now.' },
    already: { tone: 'neutral', label: 'Already back', title: 'The field already holds its earlier value.' },
    blocked: { tone: 'neutral', label: 'Can’t undo', title: 'This value was hidden when it was logged, or the field no longer exists.' },
};

/** The API's message, with its per-field errors (a 400 from the record's own checks, a 409 listing conflicts) under it. */
function ActionError({ error, fallback }: { error: unknown; fallback: string }) {
    const fieldErrors = error instanceof ApiClientError ? (error.details?.errors ?? []) : [];
    return (
        <Alert severity="error" sx={{ fontSize: '0.8rem' }}>
            {errorMessage(error, fallback)}
            {fieldErrors.length > 1 && (
                <Box component="ul" sx={{ m: 0, mt: 0.5, pl: 2.5 }}>
                    {fieldErrors.map((e, i) => (
                        <li key={i}>{e.message}</li>
                    ))}
                </Box>
            )}
        </Alert>
    );
}

const labels = (fields: UndoField[]) => fields.map((f) => f.label).join(', ');

/** What an undo did, one line per outcome. */
function UndoOutcome({ result }: { result: UndoResult }) {
    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {result.undone.length > 0 && (
                <Alert severity="success" sx={{ fontSize: '0.8rem' }}>
                    Put back: {labels(result.undone)}.{result.revertId ? ` Logged as entry #${result.revertId}.` : ''}
                </Alert>
            )}
            {result.conflicts.length > 0 && (
                <Alert severity="warning" sx={{ fontSize: '0.8rem' }}>
                    Left as they are because they were changed again since: {labels(result.conflicts)}.
                </Alert>
            )}
            {result.notReverted.length > 0 && (
                <Alert severity="warning" sx={{ fontSize: '0.8rem' }}>
                    The record didn’t take back: {labels(result.notReverted)}. Its own rules may have worked them out again.
                </Alert>
            )}
        </Box>
    );
}

/** Field by field: the value to put back, what the change set, what the record holds now; only `ready` fields can be ticked. */
function UndoDialog({ entry, onClose, onDone }: { entry: AuditEntryResponse['entry']; onClose: () => void; onDone: (result: UndoResult) => void }) {
    const preview = useQuery({ queryKey: [...AUDIT_LOG_KEY, 'undo', entry.id], queryFn: () => auditAdminService.undoPreview(entry.id), staleTime: 0, gcTime: 0 });
    const ready = useMemo(() => (preview.data?.fields ?? []).filter((f) => f.status === 'ready'), [preview.data]);
    // Every field that can be put back starts ticked.
    const [unticked, setUnticked] = useState<Set<string>>(new Set());
    const chosen = ready.filter((f) => !unticked.has(f.key));
    const undo = useMutation({
        mutationFn: () => auditAdminService.undo(entry.id, chosen.length === ready.length ? undefined : chosen.map((f) => f.key)),
        onSuccess: onDone,
    });

    const toggle = (key: string) =>
        setUnticked((prev) => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return next;
        });

    return (
        <Dialog open onClose={undo.isPending ? undefined : onClose} maxWidth="md" fullWidth slotProps={dialogPaper}>
            <DialogTitle sx={{ fontWeight: 700, fontSize: '1rem', color: 'var(--crm-slate-900)', pb: 0.5 }}>Undo this change</DialogTitle>
            <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                <Typography sx={{ fontSize: '0.82rem', color: 'var(--mui-palette-text-secondary)', lineHeight: 1.55 }}>
                    {recordText(entry)}. The ticked fields go back to their earlier values through the record’s normal checks, as if someone edited them now. The undo is
                    logged, and an entry can be undone once.
                </Typography>
                {preview.isLoading ? (
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
                        {[0, 1, 2].map((i) => (
                            <Skeleton key={i} height={32} />
                        ))}
                    </Box>
                ) : preview.isError ? (
                    <ActionError error={preview.error} fallback="Could not check this change." />
                ) : preview.data ? (
                    <Box sx={{ border: '1px solid var(--mui-palette-border-main)', borderRadius: '8px', overflowX: 'auto' }}>
                        <Table size="small" sx={{ minWidth: 560 }}>
                            <TableHead>
                                <TableRow>
                                    <TableCell sx={{ ...headCellSx, width: 44 }} padding="checkbox" />
                                    <TableCell sx={headCellSx}>Field</TableCell>
                                    <TableCell sx={headCellSx}>Put back</TableCell>
                                    <TableCell sx={headCellSx}>Changed to</TableCell>
                                    <TableCell sx={headCellSx}>Now</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {preview.data.fields.map((field) => {
                                    const isReady = field.status === 'ready';
                                    const badge = field.status === 'ready' ? null : STATUS_BADGES[field.status];
                                    return (
                                        <TableRow key={field.key} sx={{ '&:last-child td': { borderBottom: 0 }, ...(!isReady && { '& td': { color: 'var(--mui-palette-text-secondary)' } }) }}>
                                            <TableCell padding="checkbox" sx={{ verticalAlign: 'top' }}>
                                                <Checkbox
                                                    size="small"
                                                    checked={isReady && !unticked.has(field.key)}
                                                    disabled={!isReady || undo.isPending}
                                                    onChange={() => toggle(field.key)}
                                                    slotProps={{ input: { 'aria-label': `Undo ${field.label}` } }}
                                                />
                                            </TableCell>
                                            <TableCell sx={{ ...cellSx, fontWeight: 600, color: 'var(--crm-slate-900)' }}>
                                                <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 0.5 }}>
                                                    {field.label}
                                                    {badge && (
                                                        <Badge tone={badge.tone} title={badge.title}>
                                                            {badge.label}
                                                        </Badge>
                                                    )}
                                                </Box>
                                            </TableCell>
                                            <TableCell sx={{ ...cellSx, ...(isReady && { color: 'var(--crm-slate-900)', fontWeight: 600 }) }}>{field.from}</TableCell>
                                            <TableCell sx={cellSx}>{field.to}</TableCell>
                                            <TableCell sx={{ ...cellSx, ...(field.status === 'conflict' && { color: 'var(--crm-amber-700)', fontWeight: 600 }) }}>{field.current}</TableCell>
                                        </TableRow>
                                    );
                                })}
                            </TableBody>
                        </Table>
                    </Box>
                ) : null}
                {preview.data && ready.length === 0 && (
                    <Alert severity="info" sx={{ fontSize: '0.8rem' }}>
                        Nothing can be put back: every field was changed again since, or already holds its earlier value.
                    </Alert>
                )}
                {undo.isError && <ActionError error={undo.error} fallback="Could not undo this change." />}
            </DialogContent>
            <DialogActions sx={{ px: 3, pb: 2 }}>
                <Button onClick={onClose} variant="outlined" sx={secondaryButtonSx} disabled={undo.isPending}>
                    Cancel
                </Button>
                <Button
                    variant="contained"
                    sx={primaryButtonSx}
                    disabled={chosen.length === 0 || undo.isPending}
                    startIcon={undo.isPending ? <CircularProgress size={14} sx={{ color: 'inherit' }} /> : <UndoRoundedIcon />}
                    onClick={() => undo.mutate()}
                >
                    Undo {chosen.length} field{chosen.length === 1 ? '' : 's'}
                </Button>
            </DialogActions>
        </Dialog>
    );
}

function RestoreDialog({ entry, onClose, onDone }: { entry: AuditEntryResponse['entry']; onClose: () => void; onDone: () => void }) {
    const restore = useMutation({ mutationFn: () => auditAdminService.restore(entry.id), onSuccess: onDone });
    return (
        <Dialog open onClose={restore.isPending ? undefined : onClose} maxWidth="xs" fullWidth slotProps={dialogPaper}>
            <DialogTitle sx={{ fontWeight: 700, fontSize: '1rem', color: 'var(--crm-slate-900)' }}>Restore {recordText(entry)}?</DialogTitle>
            <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                <Typography sx={{ fontSize: '0.82rem', color: 'var(--mui-palette-text-secondary)', lineHeight: 1.55 }}>
                    The record comes back with the values it had when it was deleted, and shows in its module again. If another record now uses its name or tax numbers,
                    the restore is refused.
                </Typography>
                {restore.isError && <ActionError error={restore.error} fallback="Could not restore the record." />}
            </DialogContent>
            <DialogActions sx={{ px: 3, pb: 2 }}>
                <Button onClick={onClose} variant="outlined" sx={secondaryButtonSx} disabled={restore.isPending}>
                    Cancel
                </Button>
                <Button
                    variant="contained"
                    sx={primaryButtonSx}
                    disabled={restore.isPending}
                    startIcon={restore.isPending ? <CircularProgress size={14} sx={{ color: 'inherit' }} /> : <RestoreFromTrashOutlinedIcon />}
                    onClick={() => restore.mutate()}
                >
                    Restore record
                </Button>
            </DialogActions>
        </Dialog>
    );
}

/** A band at the top of the entry: the button that acts on it, or why it can't be acted on. */
function ActionBand({ icon, text, action, children }: { icon: React.ReactNode; text: React.ReactNode; action?: React.ReactNode; children?: React.ReactNode }) {
    return (
        <Box sx={{ px: 2.5, py: 1.75, borderBottom: '1px solid var(--mui-palette-border-main)', display: 'flex', flexDirection: 'column', gap: 1.25 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, flexWrap: 'wrap' }}>
                <Box
                    sx={{
                        width: 30,
                        height: 30,
                        borderRadius: '8px',
                        flexShrink: 0,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: 'var(--crm-text-blue-600)',
                        backgroundColor: 'var(--mui-palette-primary-soft)',
                        border: '1px solid var(--mui-palette-primary-softBorder)',
                        '& svg': { fontSize: 17 },
                    }}
                >
                    {icon}
                </Box>
                <Typography sx={{ flex: '1 1 220px', fontSize: '0.8rem', color: 'var(--crm-slate-700)', lineHeight: 1.5 }}>{text}</Typography>
                {action}
            </Box>
            {children}
        </Box>
    );
}

export interface AuditEntryActionsProps {
    data: AuditEntryResponse;
    /** Opens another entry (the one that undid / restored this one). */
    onOpenEntry: (id: string) => void;
}

/** Undo (a field or status change) and Restore (a delete) for one entry, when it offers them. */
export function AuditEntryActions({ data, onOpenEntry }: AuditEntryActionsProps) {
    const queryClient = useQueryClient();
    const { entry, actions, reversedBy } = data;
    const [dialog, setDialog] = useState<'undo' | 'restore' | null>(null);
    const [undoResult, setUndoResult] = useState<UndoResult | null>(null);
    const [restored, setRestored] = useState(false);

    const afterChange = () => {
        setDialog(null);
        // The log (this entry, the list, the counts) and the record's own module screens.
        void queryClient.invalidateQueries({ queryKey: AUDIT_LOG_KEY });
        notifyCrmUpdate(`/api/${entry.module}`, entry.entityId);
    };

    const reversedLink = reversedBy && (
        <Button size="small" onClick={() => onOpenEntry(reversedBy.id)} sx={{ ...secondaryButtonSx, px: 1, py: 0.25, minWidth: 0, border: 'none' }}>
            See entry #{reversedBy.id}
        </Button>
    );

    if (actions.restore) {
        const { available, reason } = actions.restore;
        return (
            <>
                <ActionBand
                    icon={<RestoreFromTrashOutlinedIcon />}
                    text={available ? 'This record is deleted. Restore brings it back with the values it had.' : reason}
                    action={
                        available ? (
                            <Button size="small" variant="contained" sx={primaryButtonSx} startIcon={<RestoreFromTrashOutlinedIcon />} onClick={() => setDialog('restore')}>
                                Restore record
                            </Button>
                        ) : (
                            reversedLink
                        )
                    }
                >
                    {restored && (
                        <Alert severity="success" sx={{ fontSize: '0.8rem' }}>
                            Restored. The record is back in its module.
                        </Alert>
                    )}
                </ActionBand>
                {dialog === 'restore' && (
                    <RestoreDialog
                        entry={entry}
                        onClose={() => setDialog(null)}
                        onDone={() => {
                            setRestored(true);
                            afterChange();
                        }}
                    />
                )}
            </>
        );
    }

    if (actions.undo) {
        const { available, reason } = actions.undo;
        return (
            <>
                <ActionBand
                    icon={<UndoRoundedIcon />}
                    text={available ? 'Put the earlier values back. Fields changed again since are left as they are.' : reason}
                    action={
                        available ? (
                            <Button size="small" variant="outlined" sx={secondaryButtonSx} startIcon={<UndoRoundedIcon />} onClick={() => setDialog('undo')}>
                                Undo this change…
                            </Button>
                        ) : (
                            reversedLink
                        )
                    }
                >
                    {undoResult && <UndoOutcome result={undoResult} />}
                </ActionBand>
                {dialog === 'undo' && (
                    <UndoDialog
                        entry={entry}
                        onClose={() => setDialog(null)}
                        onDone={(result) => {
                            setUndoResult(result);
                            afterChange();
                        }}
                    />
                )}
            </>
        );
    }

    return null;
}
