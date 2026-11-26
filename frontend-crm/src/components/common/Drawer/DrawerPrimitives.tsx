'use client';

import React from 'react';
import {
    Box,
    Typography,
    IconButton,
    Chip,
    Tooltip,
    type SxProps,
    type Theme,
} from '@mui/material';
import ContentCopyOutlinedIcon from '@mui/icons-material/ContentCopyOutlined';
import CheckIcon from '@mui/icons-material/Check';

/** Legacy copy via a hidden textarea; still works where the Clipboard API is unavailable. */
function copyWithTextarea(text: string): boolean {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.top = '0';
    textarea.style.left = '0';
    textarea.style.opacity = '0';
    // Inside an open MUI drawer/dialog the focus trap would pull focus back; append next to the active element.
    const host = document.activeElement?.closest('[role="dialog"], [role="presentation"]') ?? document.body;
    host.appendChild(textarea);
    const previous = document.activeElement as HTMLElement | null;
    textarea.focus();
    textarea.select();
    let ok = false;
    try {
        ok = document.execCommand('copy');
    } catch {
        ok = false;
    }
    host.removeChild(textarea);
    previous?.focus?.();
    return ok;
}

/**
 * Copies text to the clipboard. The Clipboard API only exists on secure pages (https / localhost), so the CRM
 * opened by server IP over http falls back to the legacy copy command.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
    if (typeof window === 'undefined') return false;
    if (window.isSecureContext && navigator.clipboard?.writeText) {
        try {
            await navigator.clipboard.writeText(text);
            return true;
        } catch {
            // Permission denied or document not focused: try the fallback.
        }
    }
    return copyWithTextarea(text);
}

export interface DrawerCopyButtonProps {
    text: string;
    title?: string;
    iconColor?: string;
    /** Minimum tap target in px (e.g. 32 in touch-dense rows); default: MUI's small IconButton. */
    minTarget?: number;
}

export function DrawerCopyButton({ text, title = 'Copy', iconColor, minTarget }: DrawerCopyButtonProps) {
    const [status, setStatus] = React.useState<'idle' | 'copied' | 'failed'>('idle');
    React.useEffect(() => {
        if (status === 'idle') return;
        const timer = window.setTimeout(() => setStatus('idle'), 1500);
        return () => window.clearTimeout(timer);
    }, [status]);

    const handleClick = async (e: React.MouseEvent) => {
        // Drawers and table rows often react to clicks themselves.
        e.stopPropagation();
        setStatus((await copyToClipboard(text)) ? 'copied' : 'failed');
    };

    const tooltip = status === 'copied' ? 'Copied!' : status === 'failed' ? 'Copy failed' : title;
    return (
        <Tooltip title={tooltip} open={status !== 'idle' ? true : undefined} placement="top">
            <IconButton size="small" onClick={handleClick} aria-label={title} sx={minTarget ? { minWidth: minTarget, minHeight: minTarget } : undefined}>
                {status === 'copied' ? (
                    <CheckIcon sx={{ fontSize: 14, color: 'var(--mui-palette-success-main)' }} />
                ) : (
                    <ContentCopyOutlinedIcon sx={{ fontSize: 14, color: iconColor }} />
                )}
            </IconButton>
        </Tooltip>
    );
}

export interface DrawerSectionCardProps {
    title?: React.ReactNode;
    icon?: React.ReactNode;
    action?: React.ReactNode;
    bg?: string;
    borderColor?: string;
    p?: number;
    titleSx?: SxProps<Theme>;
    sx?: SxProps<Theme>;
    children: React.ReactNode;
}

export function DrawerSectionCard({
    title,
    icon,
    action,
    bg = 'var(--mui-palette-background-paper)',
    borderColor = 'var(--mui-palette-border-light)',
    p = 2,
    titleSx,
    sx,
    children,
}: DrawerSectionCardProps) {
    return (
        <Box
            sx={{
                p,
                borderRadius: '10px',
                backgroundColor: bg,
                border: `1px solid ${borderColor}`,
                boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
                ...sx,
            }}
        >
            {(title || icon || action) && (
                <Box
                    sx={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        mb: icon || action ? 1.2 : 0.5,
                    }}
                >
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.8 }}>
                        {icon}
                        {typeof title === 'string' ? (
                            <Typography
                                sx={{
                                    fontSize: '0.72rem',
                                    fontWeight: 700,
                                    color: 'var(--crm-slate-600)',
                                    textTransform: 'uppercase',
                                    letterSpacing: '0.05em',
                                    // Subtle left accent when there is no icon
                                    ...(!icon && { borderLeft: '3px solid var(--mui-palette-primary-main)', pl: 1, lineHeight: 1.2 }),
                                    ...titleSx,
                                }}
                            >
                                {title}
                            </Typography>
                        ) : (
                            title
                        )}
                    </Box>
                    {action}
                </Box>
            )}
            {children}
        </Box>
    );
}

/** Balanced 2-column key/value grid shared by every entity drawer. */
export function DrawerFieldGrid({ children, columns = 2, sx }: { children: React.ReactNode; columns?: number; sx?: SxProps<Theme> }) {
    return (
        <Box
            sx={{
                display: 'grid',
                gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
                gap: 2,
                mt: 1,
                ...sx,
            }}
        >
            {children}
        </Box>
    );
}

export interface DrawerMetricItem {
    label: string;
    value: React.ReactNode;
    sublabel?: React.ReactNode;
    bg?: string;
    borderColor?: string;
    labelColor?: string;
    valueColor?: string;
    valueSize?: string;
    valueWeight?: number;
    monospace?: boolean;
    p?: number;
}

export interface DrawerMetricGridProps {
    items: DrawerMetricItem[];
    columns?: number;
    gap?: number;
}

export function DrawerMetricGrid({ items, columns = 2, gap = 1.5 }: DrawerMetricGridProps) {
    return (
        <Box sx={{ display: 'grid', gridTemplateColumns: `repeat(${columns}, 1fr)`, gap }}>
            {items.map((item, idx) => (
                <Box
                    key={idx}
                    sx={{
                        p: item.p ?? 1.5,
                        borderRadius: '10px',
                        backgroundColor: item.bg || 'var(--mui-palette-background-paper)',
                        border: `1px solid ${item.borderColor || 'var(--mui-palette-border-main)'}`,
                    }}
                >
                    <Typography
                        sx={{
                            fontSize: '0.68rem',
                            fontWeight: 700,
                            color: item.labelColor || 'var(--mui-palette-text-secondary)',
                            letterSpacing: '0.04em',
                        }}
                    >
                        {item.label}
                    </Typography>
                    {typeof item.value === 'string' || typeof item.value === 'number' ? (
                        <Typography
                            sx={{
                                fontSize: item.valueSize || '0.88rem',
                                fontWeight: item.valueWeight || 700,
                                color: item.valueColor || 'var(--crm-slate-900)',
                                fontFamily: item.monospace ? 'monospace' : 'inherit',
                                mt: 0.3,
                            }}
                        >
                            {item.value}
                        </Typography>
                    ) : (
                        <Box sx={{ mt: 0.3 }}>{item.value}</Box>
                    )}
                    {item.sublabel && (
                        typeof item.sublabel === 'string' ? (
                            <Typography sx={{ fontSize: '0.72rem', color: 'var(--mui-palette-text-secondary)', mt: 0.5 }}>
                                {item.sublabel}
                            </Typography>
                        ) : (
                            item.sublabel
                        )
                    )}
                </Box>
            ))}
        </Box>
    );
}

export interface DrawerChannelRowProps {
    icon: React.ReactNode;
    value: string;
    caption?: string;
    copyValue?: string;
    copyTitle?: string;
    badgeLabel?: string;
    badgeBg?: string;
    badgeColor?: string;
    badgeBorder?: string;
    valueWeight?: number;
    valueColor?: string;
    /** A tag shown right after the value (e.g. `<PrimaryTag />` on the primary email); wraps under it when narrow. */
    tag?: React.ReactNode;
    /** Action buttons (call / email / copy …) shown at the right edge; replaces the plain copy button. */
    actions?: React.ReactNode;
}

export function DrawerChannelRow({
    icon,
    value,
    caption,
    copyValue,
    copyTitle = 'Copy',
    badgeLabel,
    badgeBg = 'var(--mui-palette-primary-soft)',
    badgeColor = 'var(--crm-text-blue-700)',
    badgeBorder,
    valueWeight = 600,
    valueColor = 'var(--crm-slate-900)',
    tag,
    actions,
}: DrawerChannelRowProps) {
    return (
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, minWidth: 0 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
                {icon}
                <Box sx={{ minWidth: 0 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', columnGap: 0.75, rowGap: 0.25, minWidth: 0 }}>
                        <Typography sx={{ fontSize: '0.84rem', fontWeight: valueWeight, color: valueColor, minWidth: 0, overflowWrap: 'anywhere' }}>
                            {value}
                        </Typography>
                        {tag}
                    </Box>
                    {caption && (
                        <Typography sx={{ fontSize: '0.68rem', color: 'var(--mui-palette-text-secondary)' }}>
                            {caption}
                        </Typography>
                    )}
                </Box>
            </Box>
            {/* Badge and copy button sit together on the right (copy last, at the edge), not spread across the row. */}
            {(copyValue || badgeLabel || actions) && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexShrink: 0 }}>
                    {badgeLabel && (
                        <Chip
                            label={badgeLabel}
                            size="small"
                            sx={{
                                height: 18,
                                fontSize: '0.62rem',
                                fontWeight: 700,
                                backgroundColor: badgeBg,
                                color: badgeColor,
                                border: badgeBorder ? `1px solid ${badgeBorder}` : undefined,
                            }}
                        />
                    )}
                    {actions ?? (copyValue && <DrawerCopyButton text={copyValue} title={copyTitle} />)}
                </Box>
            )}
        </Box>
    );
}
