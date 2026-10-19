'use client';

import React from 'react';
import { Box, Typography, Chip } from '@mui/material';
import PersonOutlinedIcon from '@mui/icons-material/PersonOutlined';
import type { AuditRevisionItem } from './types';

export interface AuditTrailTimelineProps {
    revisions?: AuditRevisionItem[];
    entityTitle?: string;
}

export function AuditTrailTimeline({ revisions, entityTitle }: AuditTrailTimelineProps) {
    const items = revisions && revisions.length > 0 ? revisions : [
        {
            title: 'Record Updated',
            author: 'mittal.sharma',
            time: 'Today, 10:48 AM',
            from: 'Draft',
            to: 'Active',
            note: 'Updated record fields and synchronized with ERP ledger.',
        },
        {
            title: 'Compliance & Verification Check',
            author: 'system.automations',
            time: 'Yesterday, 04:15 PM',
            from: 'Pending Review',
            to: 'Verified',
            note: 'Live validation against central registry returned 0 discrepancies.',
        },
        {
            title: 'Primary Contact Channel Registered',
            author: 'mittal.sharma',
            time: '12-Oct-2026, 11:15 AM',
            from: 'None',
            to: 'Active Channel',
            note: 'Direct enterprise communication link established.',
        },
        {
            title: 'Initial Master Record Created',
            author: 'mittal.sharma',
            time: '01-Oct-2026, 09:30 AM',
            from: 'New Lead Import',
            to: 'Master Catalog',
            note: 'Imported via enterprise database sync.',
        },
    ];

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.5 }}>
                <Typography sx={{ fontSize: '0.8rem', fontWeight: 700, color: '#0f172a' }}>
                    Revision Trail & Field Edits
                </Typography>
                <Chip
                    label={`${items.length} Revisions Tracked`}
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
