'use client';

import React from 'react';
import { Box, Typography } from '@mui/material';
import EditCalendarOutlinedIcon from '@mui/icons-material/EditCalendarOutlined';
import EventAvailableOutlinedIcon from '@mui/icons-material/EventAvailableOutlined';
import { fmtInstant, useDisplayFormats } from '@/utils/formats';

/** System-maintained authorship stamps of a record (set by the backend on create/update). */
export interface RecordAuditStamp {
    createdAt?: string | null;
    createdBy?: string | null;
    updatedAt?: string | null;
    updatedBy?: string | null;
    /** The record's owner: with `createdBy`, decides whether a role at "Own" may edit it (Admin › Roles). */
    assignedTo?: string | null;
}

/** `updatedAt` is stamped on create too; a gap under this is the same save, not an edit. */
const CREATE_STAMP_TOLERANCE_MS = 2000;

/**
 * Whether a record was changed after it was created. The backend leaves `updatedBy` empty on create but still
 * sets `updatedAt` (to the creation time), so: edited by someone, or updated clearly later than created
 * (covers system updates that record no user).
 */
export function wasModified(stamp: RecordAuditStamp): boolean {
    if (stamp.updatedBy) return true;
    if (!stamp.updatedAt) return false;
    const updated = new Date(stamp.updatedAt).getTime();
    const created = stamp.createdAt ? new Date(stamp.createdAt).getTime() : NaN;
    if (Number.isNaN(updated)) return false;
    if (Number.isNaN(created)) return true;
    return updated - created > CREATE_STAMP_TOLERANCE_MS;
}

/** `25 Nov 2026, 01:07 pm` until the company formats are saved; missing → undefined, unreadable → as stored. */
const formatDateTime = (iso?: string | null) => {
    if (!iso) return undefined;
    return fmtInstant(iso, { legacyDate: 'DD MMM YYYY', legacyTime: 'hh:mm a' }) || iso;
};

/** One stamp: label on top, date below it, "by user" under that. Everything left-aligned and read in one glance. */
function AuditItem({ icon, label, at, by }: { icon: React.ReactNode; label: string; at?: string; by?: string | null }) {
    return (
        <Box sx={{ minWidth: 0 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.6, color: 'var(--mui-palette-text-muted)', mb: 0.4 }}>
                {icon}
                <Typography
                    sx={{ fontSize: '0.66rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--mui-palette-text-muted)' }}
                >
                    {label}
                </Typography>
            </Box>
            {/* Fixed line heights keep both items the same height, even when "Last Modified" is blank. */}
            <Typography
                noWrap
                sx={{ fontSize: '0.8rem', fontWeight: 600, color: at ? 'var(--crm-slate-700)' : 'var(--mui-palette-text-muted)', lineHeight: 1.45, minHeight: '1.45em' }}
            >
                {at ?? '- - -'}
            </Typography>
            <Typography noWrap sx={{ fontSize: '0.74rem', color: 'var(--mui-palette-text-secondary)', lineHeight: 1.45, minHeight: '1.45em' }}>
                {by ? `by ${by}` : ''}
            </Typography>
        </Box>
    );
}

/** Created At / Last Modified stamps, side by side as the footer of a record's overview tab (drawer and view page). */
export function RecordAuditFooter({ audit }: { audit: RecordAuditStamp }) {
    useDisplayFormats();
    if (!audit.createdAt && !audit.updatedAt) return null;
    // Never edited since it was created: "Last Modified" stays blank.
    const modified = wasModified(audit);
    return (
        <Box
            component="footer"
            sx={{
                mt: 3,
                pt: 1.5,
                borderTop: '1px solid var(--mui-palette-border-main)',
                display: 'grid',
                // Two columns, stacking only when the panel is too narrow for both.
                gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                columnGap: 3,
                rowGap: 1.5,
            }}
        >
            <AuditItem
                icon={<EventAvailableOutlinedIcon sx={{ fontSize: 14 }} />}
                label="Created At"
                at={formatDateTime(audit.createdAt)}
                by={audit.createdBy}
            />
            <AuditItem
                icon={<EditCalendarOutlinedIcon sx={{ fontSize: 14 }} />}
                label="Last Modified"
                at={modified ? formatDateTime(audit.updatedAt) : undefined}
                by={modified ? audit.updatedBy : undefined}
            />
        </Box>
    );
}
