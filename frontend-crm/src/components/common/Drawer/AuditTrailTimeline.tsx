'use client';

import React from 'react';
import { Box, Typography, Chip, Skeleton } from '@mui/material';
import PersonOutlinedIcon from '@mui/icons-material/PersonOutlined';
import HistoryOutlinedIcon from '@mui/icons-material/HistoryOutlined';
import { useEntityAuditLogs, type AuditEntityType } from '@/hooks/queries/useAuditLogs';
import type { AuditRevisionItem } from './types';

export interface AuditTrailTimelineProps {
    /** The record whose revision trail is loaded from GET /api/audit-logs/:entityType/:entityId. */
    entityType: AuditEntityType;
    entityId: string;
}

/** Revision trail of one record, newest first, with loading and empty states. */
export function AuditTrailTimeline({ entityType, entityId }: AuditTrailTimelineProps) {
    const { data: items = [], isLoading, isError } = useEntityAuditLogs(entityType, entityId);

    if (isLoading) {
        return (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                {[0, 1, 2].map((i) => (
                    <Skeleton key={i} variant="rounded" height={86} sx={{ borderRadius: '8px' }} />
                ))}
            </Box>
        );
    }
    if (isError || items.length === 0) {
        return (
            <Box sx={{ py: 5, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, color: 'var(--mui-palette-text-muted)' }}>
                <HistoryOutlinedIcon sx={{ fontSize: 32 }} />
                <Typography sx={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--mui-palette-text-secondary)' }}>
                    {isError ? 'The revision trail could not be loaded.' : 'No revisions yet'}
                </Typography>
                <Typography sx={{ fontSize: '0.72rem' }}>
                    {isError ? 'Please try again in a moment.' : 'Changes to this record will appear here.'}
                </Typography>
            </Box>
        );
    }
    return <RevisionList items={items} />;
}

function RevisionList({ items }: { items: AuditRevisionItem[] }) {
    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.5 }}>
                <Typography sx={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--crm-slate-900)' }}>
                    Revision Trail & Field Edits
                </Typography>
                <Chip
                    label={`${items.length} ${items.length === 1 ? 'Revision' : 'Revisions'} Tracked`}
                    size="small"
                    sx={{ height: 20, fontSize: '0.66rem', fontWeight: 700, backgroundColor: 'var(--mui-palette-background-hover)', color: 'var(--crm-slate-600)' }}
                />
            </Box>

            {items.map((evt, idx) => (
                <Box
                    key={idx}
                    sx={{
                        p: 1.6,
                        borderRadius: '8px',
                        border: '1px solid var(--mui-palette-border-main)',
                        backgroundColor: 'var(--mui-palette-background-paper)',
                        position: 'relative',
                        pl: 2,
                        '&::before': {
                            content: '""',
                            position: 'absolute',
                            left: 0,
                            top: 10,
                            bottom: 10,
                            width: 3,
                            backgroundColor: idx === 0 ? 'var(--mui-palette-primary-main)' : 'var(--crm-slate-400)',
                            borderRadius: '0 2px 2px 0',
                        },
                    }}
                >
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <Typography sx={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--crm-slate-900)' }}>
                            {evt.title}
                        </Typography>
                        <Typography sx={{ fontSize: '0.68rem', color: 'var(--mui-palette-text-muted)' }}>
                            {evt.time}
                        </Typography>
                    </Box>

                    {(evt.from || evt.to) && (
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.8, mt: 0.6, flexWrap: 'wrap' }}>
                            {evt.from && (
                                <Chip
                                    label={`From: ${evt.from}`}
                                    size="small"
                                    sx={{ height: 18, fontSize: '0.64rem', color: 'var(--mui-palette-text-secondary)', backgroundColor: 'var(--mui-palette-background-hover)' }}
                                />
                            )}
                            {evt.from && evt.to && (
                                <Typography sx={{ fontSize: '0.72rem', color: 'var(--mui-palette-text-muted)' }}>→</Typography>
                            )}
                            {evt.to && (
                                <Chip
                                    label={`To: ${evt.to}`}
                                    size="small"
                                    sx={{ height: 18, fontSize: '0.64rem', fontWeight: 700, color: 'var(--crm-text-blue-700)', backgroundColor: 'var(--mui-palette-primary-soft)' }}
                                />
                            )}
                        </Box>
                    )}

                    {evt.note && (
                        <Typography sx={{ fontSize: '0.72rem', color: 'var(--crm-slate-600)', mt: 0.8 }}>
                            {evt.note}
                        </Typography>
                    )}

                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.6, mt: 0.8, pt: 0.6, borderTop: '1px dashed var(--mui-palette-border-light)' }}>
                        <PersonOutlinedIcon sx={{ fontSize: 13, color: 'var(--mui-palette-text-muted)' }} />
                        <Typography sx={{ fontSize: '0.68rem', color: 'var(--mui-palette-text-secondary)' }}>
                            Edited by <strong style={{ color: 'var(--crm-slate-700)' }}>{evt.author}</strong>
                        </Typography>
                    </Box>
                </Box>
            ))}
        </Box>
    );
}
