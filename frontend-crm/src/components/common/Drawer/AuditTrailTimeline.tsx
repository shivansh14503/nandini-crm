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
            <Box sx={{ py: 5, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, color: '#94a3b8' }}>
                <HistoryOutlinedIcon sx={{ fontSize: 32 }} />
                <Typography sx={{ fontSize: '0.8rem', fontWeight: 600, color: '#64748b' }}>
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
                <Typography sx={{ fontSize: '0.8rem', fontWeight: 700, color: '#0f172a' }}>
                    Revision Trail & Field Edits
                </Typography>
                <Chip
                    label={`${items.length} ${items.length === 1 ? 'Revision' : 'Revisions'} Tracked`}
                    size="small"
                    sx={{ height: 20, fontSize: '0.66rem', fontWeight: 700, backgroundColor: '#f1f5f9', color: '#475569' }}
                />
            </Box>

            {items.map((evt, idx) => (
                <Box
                    key={idx}
                    sx={{
                        p: 1.6,
                        borderRadius: '8px',
                        border: '1px solid #e2e8f0',
                        backgroundColor: '#ffffff',
                        position: 'relative',
                        pl: 2,
                        '&::before': {
                            content: '""',
                            position: 'absolute',
                            left: 0,
                            top: 10,
                            bottom: 10,
                            width: 3,
                            backgroundColor: idx === 0 ? '#2563eb' : '#94a3b8',
                            borderRadius: '0 2px 2px 0',
                        },
                    }}
                >
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <Typography sx={{ fontSize: '0.8rem', fontWeight: 700, color: '#0f172a' }}>
                            {evt.title}
                        </Typography>
                        <Typography sx={{ fontSize: '0.68rem', color: '#94a3b8' }}>
                            {evt.time}
                        </Typography>
                    </Box>

                    {(evt.from || evt.to) && (
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.8, mt: 0.6, flexWrap: 'wrap' }}>
                            {evt.from && (
                                <Chip
                                    label={`From: ${evt.from}`}
                                    size="small"
                                    sx={{ height: 18, fontSize: '0.64rem', color: '#64748b', backgroundColor: '#f1f5f9' }}
                                />
                            )}
                            {evt.from && evt.to && (
                                <Typography sx={{ fontSize: '0.72rem', color: '#94a3b8' }}>→</Typography>
                            )}
                            {evt.to && (
                                <Chip
                                    label={`To: ${evt.to}`}
                                    size="small"
                                    sx={{ height: 18, fontSize: '0.64rem', fontWeight: 700, color: '#1d4ed8', backgroundColor: '#eff6ff' }}
                                />
                            )}
                        </Box>
                    )}

                    {evt.note && (
                        <Typography sx={{ fontSize: '0.72rem', color: '#475569', mt: 0.8 }}>
                            {evt.note}
                        </Typography>
                    )}

                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.6, mt: 0.8, pt: 0.6, borderTop: '1px dashed #f1f5f9' }}>
                        <PersonOutlinedIcon sx={{ fontSize: 13, color: '#94a3b8' }} />
                        <Typography sx={{ fontSize: '0.68rem', color: '#64748b' }}>
                            Edited by <strong style={{ color: '#334155' }}>{evt.author}</strong>
                        </Typography>
                    </Box>
                </Box>
            ))}
        </Box>
    );
}
