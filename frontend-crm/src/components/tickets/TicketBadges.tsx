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
    Urgent: { bg: 'var(--mui-palette-error-soft)', color: 'var(--crm-red-700)', border: 'var(--mui-palette-error-softBorder)', dot: 'var(--mui-palette-error-main)' },
    High: { bg: 'var(--mui-palette-error-soft)', color: 'var(--mui-palette-error-main)', border: 'var(--mui-palette-error-softBorder)', dot: 'var(--crm-red-500)' },
    Normal: { bg: 'var(--mui-palette-warning-soft)', color: 'var(--crm-amber-700)', border: 'var(--mui-palette-warning-softBorder)', dot: 'var(--crm-amber-500)' },
    Low: { bg: 'var(--mui-palette-background-hover)', color: 'var(--crm-slate-600)', border: 'var(--mui-palette-border-main)', dot: 'var(--mui-palette-text-muted)' },
};

export const TICKET_STATUS_COLORS: Record<TicketStatus, PillColors> = {
    New: { bg: 'var(--mui-palette-primary-soft)', color: 'var(--crm-text-blue-700)', border: 'var(--mui-palette-primary-softBorder)', dot: 'var(--crm-blue-500)' },
    Assigned: { bg: 'var(--crm-indigo-50)', color: 'var(--crm-indigo-700)', border: 'var(--crm-indigo-200)', dot: 'var(--crm-indigo-500)' },
    'In Progress': { bg: 'var(--crm-violet-50)', color: 'var(--crm-violet-700)', border: 'var(--crm-violet-200)', dot: 'var(--crm-violet-500)' },
    'Pending Customer': { bg: 'var(--mui-palette-warning-soft)', color: 'var(--crm-amber-700)', border: 'var(--mui-palette-warning-softBorder)', dot: 'var(--crm-amber-500)' },
    Escalated: { bg: 'var(--mui-palette-error-soft)', color: 'var(--mui-palette-error-main)', border: 'var(--mui-palette-error-softBorder)', dot: 'var(--crm-red-500)' },
    Resolved: { bg: 'var(--mui-palette-success-soft)', color: 'var(--crm-emerald-600)', border: 'var(--mui-palette-success-softBorder)', dot: 'var(--crm-emerald-500)' },
    Closed: { bg: 'var(--mui-palette-success-soft)', color: 'var(--crm-emerald-700)', border: 'var(--mui-palette-success-softBorder)', dot: 'var(--crm-emerald-600)' },
};

const FALLBACK: PillColors = { bg: 'var(--mui-palette-background-hover)', color: 'var(--crm-slate-600)', border: 'var(--mui-palette-border-main)', dot: 'var(--mui-palette-text-muted)' };

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
