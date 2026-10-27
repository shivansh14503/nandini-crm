'use client';

import React from 'react';
import { Box } from '@mui/material';
import type { TicketPriority, TicketStatus } from '@/types/ticket.types';

interface PillColors {
    bg: string;
    color: string;
    border: string;
    dot: string;
}

export const TICKET_PRIORITY_COLORS: Record<TicketPriority, PillColors> = {
    Urgent: { bg: '#fef2f2', color: '#b91c1c', border: '#fecaca', dot: '#dc2626' },
    High: { bg: '#fef2f2', color: '#dc2626', border: '#fecaca', dot: '#ef4444' },
    Normal: { bg: '#fffbeb', color: '#b45309', border: '#fde68a', dot: '#f59e0b' },
    Low: { bg: '#f1f5f9', color: '#475569', border: '#e2e8f0', dot: '#94a3b8' },
};

export const TICKET_STATUS_COLORS: Record<TicketStatus, PillColors> = {
    New: { bg: '#eff6ff', color: '#1d4ed8', border: '#bfdbfe', dot: '#3b82f6' },
    Assigned: { bg: '#eef2ff', color: '#4338ca', border: '#c7d2fe', dot: '#6366f1' },
    'In Progress': { bg: '#f5f3ff', color: '#6d28d9', border: '#ddd6fe', dot: '#8b5cf6' },
    'Pending Customer': { bg: '#fffbeb', color: '#b45309', border: '#fde68a', dot: '#f59e0b' },
    Escalated: { bg: '#fef2f2', color: '#dc2626', border: '#fecaca', dot: '#ef4444' },
    Resolved: { bg: '#ecfdf5', color: '#059669', border: '#a7f3d0', dot: '#10b981' },
    Closed: { bg: '#ecfdf5', color: '#047857', border: '#a7f3d0', dot: '#059669' },
};

const FALLBACK: PillColors = { bg: '#f1f5f9', color: '#475569', border: '#e2e8f0', dot: '#94a3b8' };

function Pill({ label, colors, rounded }: { label: string; colors: PillColors; rounded: string }) {
    return (
        <Box
            component="span"
            sx={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 0.6,
                px: 0.9,
                py: 0.25,
                borderRadius: rounded,
                fontSize: '0.72rem',
                fontWeight: 700,
                whiteSpace: 'nowrap',
                backgroundColor: colors.bg,
                color: colors.color,
                border: `1px solid ${colors.border}`,
            }}
        >
            <Box component="span" sx={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: colors.dot }} />
            {label}
        </Box>
    );
}

export function TicketPriorityPill({ priority }: { priority: TicketPriority }) {
    return <Pill label={priority} colors={TICKET_PRIORITY_COLORS[priority] ?? FALLBACK} rounded="6px" />;
}

export function TicketStatusPill({ status }: { status: TicketStatus }) {
    return <Pill label={status} colors={TICKET_STATUS_COLORS[status] ?? FALLBACK} rounded="12px" />;
}

/** "27 Oct 2026, 6:00 pm" from a `YYYY-MM-DDTHH:mm` / ISO value; '-' when empty or invalid. */
export function formatTicketDue(value: string | undefined): string {
    if (!value) return '-';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return value;
    return d.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}
