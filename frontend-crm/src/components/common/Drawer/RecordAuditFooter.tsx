'use client';

import React from 'react';
import { Box, Typography } from '@mui/material';
import EditCalendarOutlinedIcon from '@mui/icons-material/EditCalendarOutlined';
import EventAvailableOutlinedIcon from '@mui/icons-material/EventAvailableOutlined';

/** System-maintained authorship stamps of a record (set by the backend on create/update). */
export interface RecordAuditStamp {
    createdAt?: string | null;
    createdBy?: string | null;
    updatedAt?: string | null;
    updatedBy?: string | null;
}

const formatDateTime = (iso?: string | null) => {
    if (!iso) return undefined;
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
    });
};

function AuditRow({ icon, label, at, by }: { icon: React.ReactNode; label: string; at?: string; by?: string | null }) {
    return (
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, py: 1 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.8, color: '#64748b', flexShrink: 0 }}>
                {icon}
                <Typography sx={{ fontSize: '0.74rem', fontWeight: 600, color: '#64748b' }}>{label}</Typography>
            </Box>
            <Typography sx={{ fontSize: '0.78rem', fontWeight: 600, color: '#334155', textAlign: 'right', minWidth: 0 }}>
                {at ?? '-'}
                {by && (
                    <Box component="span" sx={{ color: '#64748b', fontWeight: 500 }}>
                        {' '}by {by}
                    </Box>
                )}
            </Typography>
        </Box>
    );
}

/** "Last Modified" above "Created At", shown at the bottom of a record's overview tab (drawer and view page). */
export function RecordAuditFooter({ audit }: { audit: RecordAuditStamp }) {
    if (!audit.createdAt && !audit.updatedAt) return null;
    // A record that was never edited has no updatedBy: its last modification is its creation.
    const modifiedBy = audit.updatedBy || audit.createdBy;
    return (
        <Box
            sx={{
                mt: 2.5,
                px: 1.5,
                borderRadius: '10px',
                border: '1px solid #eef2f6',
                backgroundColor: '#f8fafc',
                '& > * + *': { borderTop: '1px solid #eef2f6' },
            }}
        >
            <AuditRow
                icon={<EditCalendarOutlinedIcon sx={{ fontSize: 15 }} />}
                label="Last Modified"
                at={formatDateTime(audit.updatedAt ?? audit.createdAt)}
                by={modifiedBy}
            />
            <AuditRow
                icon={<EventAvailableOutlinedIcon sx={{ fontSize: 15 }} />}
                label="Created At"
                at={formatDateTime(audit.createdAt)}
                by={audit.createdBy}
            />
        </Box>
    );
}
