'use client';

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Alert, Box, Button, Drawer, IconButton, Skeleton, Table, TableBody, TableCell, TableHead, TableRow, Tooltip, Typography } from '@mui/material';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import HistoryRoundedIcon from '@mui/icons-material/HistoryRounded';
import PersonSearchOutlinedIcon from '@mui/icons-material/PersonSearchOutlined';
import { DrawerCopyButton } from '@/components/common/Drawer';
import { errorMessage, secondaryButtonSx } from '@/components/settings/form-customization/builderUi';
import { auditAdminService, type AuditEntryDetail, type AuditListItem } from '@/services/auditAdmin.service';
import { ActionPill, ModuleDot, RecordCell, displayUser } from './auditLogUi';
import { SOURCE_LABELS } from './auditLogFilter';

export const auditEntryKey = (id: string) => ['admin-audit-log', 'entry', id] as const;

const BROWSERS: [string, RegExp][] = [
    ['Edge', /Edg\/(\d+)/],
    ['Opera', /OPR\/(\d+)/],
    ['Chrome', /Chrome\/(\d+)/],
    ['Firefox', /Firefox\/(\d+)/],
    ['Safari', /Version\/(\d+).*Safari/],
];
const SYSTEMS: [string, RegExp][] = [
    ['Windows', /Windows/],
    ['Android', /Android/],
    ['iOS', /iPhone|iPad/],
    ['macOS', /Mac OS X/],
    ['Linux', /Linux/],
];

/** `Mozilla/5.0 (Windows NT 10.0…) … Chrome/131…` → `Chrome 131 on Windows`. */
export function describeBrowser(userAgent: string | null): string | null {
    if (!userAgent) return null;
    const browser = BROWSERS.map(([name, re]) => [name, re.exec(userAgent)?.[1]] as const).find(([, version]) => version);
    const os = SYSTEMS.find(([, re]) => re.test(userAgent))?.[0];
    if (!browser) return userAgent.length > 60 ? `${userAgent.slice(0, 60)}…` : userAgent;
    const name = `${browser[0]} ${browser[1]}`;
    return os ? `${name} on ${os}` : name;
}

const sectionTitleSx = {
    fontSize: '0.72rem',
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    color: 'var(--mui-palette-text-secondary)',
    mb: 1,
} as const;

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

function InfoRow({ label, value, copy }: { label: string; value: React.ReactNode; copy?: string | null }) {
    return (
        <Box sx={{ display: 'grid', gridTemplateColumns: '120px minmax(0, 1fr)', gap: 1.5, py: 0.6, borderBottom: '1px solid var(--mui-palette-border-light)' }}>
            <Typography sx={{ fontSize: '0.78rem', color: 'var(--mui-palette-text-secondary)' }}>{label}</Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, minWidth: 0 }}>
                <Typography component="div" sx={{ fontSize: '0.8rem', color: 'var(--crm-slate-900)', wordBreak: 'break-word', minWidth: 0 }}>
                    {value ?? '—'}
                </Typography>
                {copy && <DrawerCopyButton text={copy} title={`Copy ${label.toLowerCase()}`} />}
            </Box>
        </Box>
    );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <Box sx={{ px: 2.5, py: 2, borderBottom: '1px solid var(--mui-palette-border-main)' }}>
            <Typography sx={sectionTitleSx}>{title}</Typography>
            {children}
        </Box>
    );
}

export interface AuditEntryDrawerProps {
    id: string | null;
    userNames: Map<string, string>;
    onClose: () => void;
    /** Opens another entry (same request, or the entry this one undid). */
    onOpenEntry: (id: string) => void;
    /** Open the record's page. */
    onOpenRecord: (href: string) => void;
    /** "History of this record". */
    onRecordHistory: (entry: AuditListItem) => void;
    /** "Everything this user did that day". */
    onUserDay: (entry: AuditListItem) => void;
    /** Extra actions for the entry (undo / restore). */
    renderActions?: (entry: AuditEntryDetail) => React.ReactNode;
}

/** One audit entry: what changed (Field / Before / After), who did it from where, and the rest of the same request. */
export function AuditEntryDrawer({ id, userNames, onClose, onOpenEntry, onOpenRecord, onRecordHistory, onUserDay, renderActions }: AuditEntryDrawerProps) {
    const query = useQuery({ queryKey: auditEntryKey(id ?? ''), queryFn: () => auditAdminService.get(id!), enabled: Boolean(id) });
    const data = query.data;
    const entry = data?.entry;
    const showBefore = Boolean(data?.fields.some((f) => f.before !== null));
    const showAfter = Boolean(data?.fields.some((f) => f.after !== null));

    return (
        <Drawer
            anchor="right"
            open={Boolean(id)}
            onClose={onClose}
            slotProps={{ paper: { sx: { width: { xs: '100%', sm: 580 }, backgroundColor: 'var(--mui-palette-background-paper)', backgroundImage: 'none' } } }}
        >
            {/* Header */}
            <Box
                sx={{
                    px: 2.5,
                    py: 1.75,
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 1.5,
                    borderBottom: '1px solid var(--mui-palette-border-main)',
                    backgroundColor: 'var(--mui-palette-background-subtle)',
                    position: 'sticky',
                    top: 0,
                    zIndex: 1,
                }}
            >
                <Box sx={{ flex: 1, minWidth: 0 }}>
                    {entry ? (
                        <>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', mb: 0.5 }}>
                                <ActionPill action={entry.action} label={entry.actionLabel} />
                                <Typography sx={{ fontSize: '0.75rem', color: 'var(--mui-palette-text-secondary)' }}>
                                    {entry.time} · #{entry.id}
                                </Typography>
                            </Box>
                            <Typography component="h2" sx={{ fontSize: '1rem', fontWeight: 700, color: 'var(--crm-slate-900)', wordBreak: 'break-word' }}>
                                {entry.summary}
                            </Typography>
                            <Typography sx={{ fontSize: '0.8rem', color: 'var(--mui-palette-text-secondary)', mt: 0.25 }}>
                                by {displayUser(entry.changedBy, userNames)}
                                {entry.actorRole ? ` (${entry.actorRole})` : ''}
                            </Typography>
                        </>
                    ) : (
                        <>
                            <Skeleton width={160} height={22} />
                            <Skeleton width="80%" height={26} />
                        </>
                    )}
                </Box>
                <IconButton
                    size="small"
                    onClick={onClose}
                    aria-label="Close"
                    sx={{
                        color: 'var(--mui-palette-text-secondary)',
                        '&:hover': { color: 'var(--mui-palette-error-main)', backgroundColor: 'var(--mui-palette-error-soft)' },
                    }}
                >
                    <CloseRoundedIcon fontSize="small" />
                </IconButton>
            </Box>

            {query.isError && (
                <Alert severity="error" sx={{ m: 2 }}>
                    {errorMessage(query.error, 'Could not load this entry.')}
                </Alert>
            )}
            {query.isLoading && (
                <Box sx={{ p: 2.5, display: 'flex', flexDirection: 'column', gap: 1 }}>
                    {[0, 1, 2, 3, 4].map((i) => (
                        <Skeleton key={i} height={28} />
                    ))}
                </Box>
            )}

            {data && entry && (
                <Box sx={{ overflowY: 'auto' }}>
                    {renderActions?.(entry)}

                    {/* Record */}
                    <Section title="Record">
                        <InfoRow label="Module" value={<ModuleDot module={entry.module} label={entry.moduleLabel} />} />
                        <InfoRow label="Record" value={<RecordCell item={entry} onOpen={onOpenRecord} />} />
                        <InfoRow label="Record ID" value={entry.entityId} copy={entry.entityId} />
                        {entry.revertsId && (
                            <InfoRow
                                label="Undoes"
                                value={
                                    <Button size="small" onClick={() => onOpenEntry(entry.revertsId!)} sx={{ ...secondaryButtonSx, p: 0, minWidth: 0, border: 'none' }}>
                                        Entry #{entry.revertsId}
                                    </Button>
                                }
                            />
                        )}
                        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mt: 1.5 }}>
                            {entry.entityId && entry.category !== 'SECURITY' && (
                                <Button size="small" variant="outlined" startIcon={<HistoryRoundedIcon />} sx={secondaryButtonSx} onClick={() => onRecordHistory(entry)}>
                                    History of this record
                                </Button>
                            )}
                            {entry.changedBy !== 'system' && (
                                <Button size="small" variant="outlined" startIcon={<PersonSearchOutlinedIcon />} sx={secondaryButtonSx} onClick={() => onUserDay(entry)}>
                                    Everything {displayUser(entry.changedBy, userNames)} did that day
                                </Button>
                            )}
                        </Box>
                    </Section>

                    {/* What changed */}
                    {data.fields.length > 0 && (
                        <Section title={entry.action === 'CREATE' ? 'Values saved' : entry.action === 'DELETE' ? 'Values when deleted' : 'What changed'}>
                            <Box sx={{ border: '1px solid var(--mui-palette-border-main)', borderRadius: '8px', overflow: 'hidden' }}>
                                <Table size="small">
                                    <TableHead>
                                        <TableRow>
                                            <TableCell sx={headCellSx}>Field</TableCell>
                                            {showBefore && <TableCell sx={headCellSx}>Before</TableCell>}
                                            {showAfter && <TableCell sx={headCellSx}>After</TableCell>}
                                        </TableRow>
                                    </TableHead>
                                    <TableBody>
                                        {data.fields.map((row) => (
                                            <TableRow key={row.key} sx={{ '&:last-child td': { borderBottom: 0 } }}>
                                                <TableCell sx={{ ...cellSx, fontWeight: 600, color: 'var(--crm-slate-900)', width: '32%' }}>{row.label}</TableCell>
                                                {showBefore && (
                                                    <TableCell sx={{ ...cellSx, ...(showAfter && { color: 'var(--mui-palette-text-secondary)', textDecoration: 'line-through', textDecorationColor: 'var(--mui-palette-border-strong)' }) }}>
                                                        {row.before ?? '—'}
                                                    </TableCell>
                                                )}
                                                {showAfter && <TableCell sx={cellSx}>{row.after ?? '—'}</TableCell>}
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </Box>
                        </Section>
                    )}

                    {/* Everything else the entry recorded */}
                    {data.details.length > 0 && (
                        <Section title="Details">
                            {data.details.map((row) => (
                                <InfoRow key={row.key} label={row.label} value={row.value} />
                            ))}
                        </Section>
                    )}

                    {/* Who, where, how */}
                    <Section title="Who, where and how">
                        <InfoRow
                            label="User"
                            value={
                                entry.changedBy === 'system'
                                    ? 'System (background job)'
                                    : `${displayUser(entry.changedBy, userNames)} (${entry.changedBy})${entry.actorRole ? ` · ${entry.actorRole}` : ''}`
                            }
                        />
                        <InfoRow label="When" value={entry.time} />
                        <InfoRow label="Source" value={entry.source ? (SOURCE_LABELS[entry.source] ?? entry.source) : null} />
                        <InfoRow label="Screen" value={entry.page} />
                        <InfoRow label="IP address" value={entry.ipAddress} copy={entry.ipAddress} />
                        <InfoRow
                            label="Browser"
                            value={
                                entry.userAgent ? (
                                    <Tooltip title={entry.userAgent}>
                                        <span style={{ cursor: 'help' }}>{describeBrowser(entry.userAgent)}</span>
                                    </Tooltip>
                                ) : null
                            }
                        />
                        <InfoRow label="Request" value={entry.httpMethod && entry.route ? `${entry.httpMethod} ${entry.route}` : null} />
                        <InfoRow label="Request ID" value={entry.requestId} copy={entry.requestId} />
                        <InfoRow label="Session ID" value={entry.sessionId} copy={entry.sessionId} />
                    </Section>

                    {/* The rest of the same request (e.g. a conversion's new contact and organization) */}
                    {data.relatedCount > 0 && (
                        <Section title={`Same request (${data.relatedCount})`}>
                            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                                {data.related.map((other) => (
                                    <Box
                                        key={other.id}
                                        role="button"
                                        tabIndex={0}
                                        onClick={() => onOpenEntry(other.id)}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter' || e.key === ' ') {
                                                e.preventDefault();
                                                onOpenEntry(other.id);
                                            }
                                        }}
                                        sx={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: 1,
                                            px: 1.25,
                                            py: 0.75,
                                            borderRadius: '8px',
                                            border: '1px solid var(--mui-palette-border-main)',
                                            cursor: 'pointer',
                                            fontSize: '0.8rem',
                                            transition: 'all 0.15s ease',
                                            '&:hover, &:focus-visible': {
                                                borderColor: 'var(--crm-blue-300)',
                                                backgroundColor: 'var(--mui-palette-primary-soft)',
                                                outline: 'none',
                                            },
                                        }}
                                    >
                                        <ActionPill action={other.action} label={other.actionLabel} />
                                        <ModuleDot module={other.module} label={other.moduleLabel} />
                                        <Typography sx={{ fontSize: '0.8rem', color: 'var(--crm-slate-700)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            {other.summary}
                                        </Typography>
                                    </Box>
                                ))}
                                {data.relatedCount > data.related.length && (
                                    <Typography sx={{ fontSize: '0.75rem', color: 'var(--mui-palette-text-secondary)', mt: 0.5 }}>
                                        Showing the first {data.related.length}. Filter by this request id to see all of them.
                                    </Typography>
                                )}
                            </Box>
                        </Section>
                    )}
                </Box>
            )}
        </Drawer>
    );
}
