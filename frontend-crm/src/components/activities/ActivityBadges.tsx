'use client';

import React, { useCallback } from 'react';
import { Box, type SxProps, type Theme } from '@mui/material';
import type { SvgIconComponent } from '@mui/icons-material';
import CallOutlinedIcon from '@mui/icons-material/CallOutlined';
import GroupsOutlinedIcon from '@mui/icons-material/GroupsOutlined';
import SlideshowOutlinedIcon from '@mui/icons-material/SlideshowOutlined';
import EmailOutlinedIcon from '@mui/icons-material/EmailOutlined';
import WhatsAppIcon from '@mui/icons-material/WhatsApp';
import PlaceOutlinedIcon from '@mui/icons-material/PlaceOutlined';
import TaskAltOutlinedIcon from '@mui/icons-material/TaskAltOutlined';
import StickyNote2OutlinedIcon from '@mui/icons-material/StickyNote2Outlined';
import EventOutlinedIcon from '@mui/icons-material/EventOutlined';
import { useDropdownOptionLabel, useDropdownOptionMeta } from '@/hooks/queries/useFormConfigs';
import { FOLLOWUP_TYPE_CATEGORY_KEY } from '@/utils/formConfig';
import { getModuleColor } from '@/theme/moduleColors';
import type { AttendeeResponse } from '@/types/activity.types';

/** Icons the Followup Type options name in their meta (`icon`); others fall back to a calendar icon. */
const TYPE_ICONS: Readonly<Record<string, SvgIconComponent>> = {
    call: CallOutlinedIcon,
    meeting: GroupsOutlinedIcon,
    presentation: SlideshowOutlinedIcon,
    email: EmailOutlinedIcon,
    whatsapp: WhatsAppIcon,
    visit: PlaceOutlinedIcon,
    task: TaskAltOutlinedIcon,
    note: StickyNote2OutlinedIcon,
};

/** Key in TYPE_ICONS of a Followup Type's icon, from its option meta `icon` (kept on the option, so a rename keeps it). */
export function useActivityTypeIconKey(): (followupType: string | null | undefined) => string {
    const metaOf = useDropdownOptionMeta(FOLLOWUP_TYPE_CATEGORY_KEY);
    return useCallback(
        (followupType) => {
            const icon = followupType ? metaOf(followupType)?.icon : undefined;
            return typeof icon === 'string' && icon in TYPE_ICONS ? icon : '';
        },
        [metaOf]
    );
}

/** Icon component of a Followup Type (a generic calendar icon when its option names none). For passing as a prop. */
export function useActivityTypeIcon(): (followupType: string | null | undefined) => SvgIconComponent {
    const keyOf = useActivityTypeIconKey();
    return useCallback((followupType) => TYPE_ICONS[keyOf(followupType)] ?? EventOutlinedIcon, [keyOf]);
}

/** Renders the icon of a TYPE_ICONS key (a static lookup, so the component isn't created during render). */
function TypeIconGlyph({ iconKey, sx }: { iconKey: string; sx?: SxProps<Theme> }) {
    const Icon = TYPE_ICONS[iconKey] ?? EventOutlinedIcon;
    return <Icon sx={sx} />;
}

/** Display label of a Followup Type (admins may rename an option; records keep its value). */
export function useActivityTypeLabel(): (followupType: string | null | undefined) => string {
    return useDropdownOptionLabel(FOLLOWUP_TYPE_CATEGORY_KEY);
}

export function ActivityTypeIcon({ type, sx }: { type: string | null | undefined; sx?: SxProps<Theme> }) {
    const iconKey = useActivityTypeIconKey()(type);
    return <TypeIconGlyph iconKey={iconKey} sx={{ fontSize: 16, color: getModuleColor('activities').main, ...sx }} />;
}

/** The Followup Type as a tinted chip (module tint: soft surface, border, text; icon in the module hue). */
export function ActivityTypeChip({ type, compact = false }: { type: string; compact?: boolean }) {
    const label = useActivityTypeLabel()(type);
    const iconKey = useActivityTypeIconKey()(type);
    const color = getModuleColor('activities');
    if (!type) return <Box component="span" sx={{ fontSize: '0.78rem', color: 'var(--mui-palette-text-muted)' }}>-</Box>;
    return (
        <Box
            component="span"
            sx={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 0.5,
                px: compact ? 0.7 : 0.9,
                py: 0.25,
                borderRadius: '12px',
                fontSize: '0.72rem',
                fontWeight: 700,
                whiteSpace: 'nowrap',
                backgroundColor: color.soft,
                color: color.text,
                border: `1px solid ${color.border}`,
                maxWidth: '100%',
            }}
        >
            <TypeIconGlyph iconKey={iconKey} sx={{ fontSize: 14, color: color.main, flexShrink: 0 }} />
            <Box component="span" sx={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {label}
            </Box>
        </Box>
    );
}

interface PillColors {
    bg: string;
    color: string;
    border: string;
    dot: string;
}

/** activity_status options (fixed), plus "Overdue" for a Planned activity whose time has passed. */
export const ACTIVITY_STATUS_COLORS: Readonly<Record<string, PillColors>> = {
    Planned: { bg: 'var(--crm-sky-50)', color: 'var(--crm-sky-700)', border: 'var(--crm-sky-200)', dot: 'var(--crm-sky-500)' },
    Completed: { bg: 'var(--mui-palette-success-soft)', color: 'var(--crm-emerald-700)', border: 'var(--mui-palette-success-softBorder)', dot: 'var(--crm-emerald-500)' },
    Cancelled: { bg: 'var(--mui-palette-background-hover)', color: 'var(--mui-palette-text-secondary)', border: 'var(--mui-palette-border-main)', dot: 'var(--mui-palette-text-muted)' },
    Overdue: { bg: 'var(--mui-palette-error-soft)', color: 'var(--crm-red-700)', border: 'var(--mui-palette-error-softBorder)', dot: 'var(--mui-palette-error-main)' },
};

const FALLBACK: PillColors = ACTIVITY_STATUS_COLORS.Cancelled;

function Pill({ colors, label }: { colors: PillColors; label: string }) {
    return (
        <Box
            component="span"
            sx={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 0.6,
                px: 0.9,
                py: 0.25,
                borderRadius: '12px',
                fontSize: '0.72rem',
                fontWeight: 700,
                whiteSpace: 'nowrap',
                backgroundColor: colors.bg,
                color: colors.color,
                border: `1px solid ${colors.border}`,
            }}
        >
            <Box component="span" sx={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: colors.dot, flexShrink: 0 }} />
            {label}
        </Box>
    );
}

/** Activity status as a rounded pill (dot + label); a Planned activity whose time has passed reads "Overdue". */
export function ActivityStatusPill({ status, overdue = false }: { status: string; overdue?: boolean }) {
    if (!status) return <Box component="span" sx={{ fontSize: '0.78rem', color: 'var(--mui-palette-text-muted)' }}>-</Box>;
    if (overdue && status === 'Planned') return <Pill colors={ACTIVITY_STATUS_COLORS.Overdue} label="Overdue" />;
    return <Pill colors={ACTIVITY_STATUS_COLORS[status] ?? FALLBACK} label={status} />;
}

/** Attendee replies, in the CRM's words. */
export const ATTENDEE_RESPONSE_LABELS: Readonly<Record<AttendeeResponse, string>> = {
    needsAction: 'Awaiting reply',
    accepted: 'Accepted',
    tentative: 'Maybe',
    declined: 'Declined',
};

const RESPONSE_COLORS: Readonly<Record<AttendeeResponse, PillColors>> = {
    needsAction: FALLBACK,
    accepted: ACTIVITY_STATUS_COLORS.Completed,
    tentative: { bg: 'var(--mui-palette-warning-soft)', color: 'var(--crm-amber-700)', border: 'var(--mui-palette-warning-softBorder)', dot: 'var(--crm-amber-500)' },
    declined: ACTIVITY_STATUS_COLORS.Overdue,
};

/** The dot color of a reply (attendee chips). */
export const attendeeResponseDot = (response: AttendeeResponse | undefined) => RESPONSE_COLORS[response ?? 'needsAction'].dot;

/** An attendee's reply as a small pill. */
export function AttendeeResponseChip({ response }: { response: AttendeeResponse | undefined }) {
    const value = response ?? 'needsAction';
    return <Pill colors={RESPONSE_COLORS[value]} label={ATTENDEE_RESPONSE_LABELS[value]} />;
}
