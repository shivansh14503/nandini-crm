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

export function copyToClipboard(text: string) {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
        navigator.clipboard.writeText(text);
    }
}

export interface DrawerCopyButtonProps {
    text: string;
    title?: string;
    iconColor?: string;
}

export function DrawerCopyButton({ text, title = 'Copy', iconColor }: DrawerCopyButtonProps) {
    return (
        <Tooltip title={title}>
            <IconButton size="small" onClick={() => copyToClipboard(text)}>
                <ContentCopyOutlinedIcon sx={{ fontSize: 14, color: iconColor }} />
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
    bg = '#ffffff',
    borderColor = '#e2e8f0',
    p = 2,
    titleSx,
    sx,
    children,
}: DrawerSectionCardProps) {
    return (
        <Box
            sx={{
                p,
                borderRadius: '8px',
                backgroundColor: bg,
                border: `1px solid ${borderColor}`,
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
                                    fontSize: icon ? '0.78rem' : '0.68rem',
                                    fontWeight: 700,
                                    color: icon ? '#0f172a' : '#64748b',
                                    letterSpacing: icon ? undefined : '0.04em',
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
                        borderRadius: '8px',
                        backgroundColor: item.bg || '#ffffff',
                        border: `1px solid ${item.borderColor || '#e2e8f0'}`,
                    }}
                >
                    <Typography
                        sx={{
                            fontSize: '0.68rem',
                            fontWeight: 700,
                            color: item.labelColor || '#64748b',
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
                                color: item.valueColor || '#0f172a',
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
                            <Typography sx={{ fontSize: '0.72rem', color: '#64748b', mt: 0.5 }}>
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
}

export function DrawerChannelRow({
    icon,
    value,
    caption,
    copyValue,
    copyTitle = 'Copy',
    badgeLabel,
    badgeBg = '#eff6ff',
    badgeColor = '#1d4ed8',
    badgeBorder,
    valueWeight = 600,
    valueColor = '#0f172a',
}: DrawerChannelRowProps) {
    return (
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                {icon}
                <Box>
                    <Typography sx={{ fontSize: '0.84rem', fontWeight: valueWeight, color: valueColor }}>
                        {value}
                    </Typography>
                    {caption && (
                        <Typography sx={{ fontSize: '0.68rem', color: '#64748b' }}>
                            {caption}
                        </Typography>
                    )}
                </Box>
            </Box>
            {copyValue && <DrawerCopyButton text={copyValue} title={copyTitle} />}
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
        </Box>
    );
}
