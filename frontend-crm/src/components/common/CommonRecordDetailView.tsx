'use client';

import React from 'react';
import Link from 'next/link';
import { Avatar, Box, Button, Chip, Paper, Tab, Tabs, Tooltip, Typography } from '@mui/material';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import VerifiedIcon from '@mui/icons-material/Verified';
import { FormModeProvider } from '@/context/FormModeContext';
import { FormHeader } from '../forms/FormHeader';
import type { BreadcrumbItem } from './AppBreadcrumbs';
import { RecordAuditFooter, type RecordAuditStamp } from './Drawer/RecordAuditFooter';
import { useDoubleClickCopy } from './useDoubleClickCopy';
import { FormSectionsSkeleton, RecordHeaderSkeleton } from './skeletons';
import { isSearchOrigin, useListOrigin } from '@/utils/listOrigin';

export interface RecordDetailTab {
    id: string;
    label: string;
    icon?: React.ReactNode;
    badge?: React.ReactNode;
}

export type RecordAuditInfo = RecordAuditStamp;

export interface CommonRecordDetailViewProps {
    breadcrumbItems?: BreadcrumbItem[];
    /** Identity hero */
    title: string;
    /** Document number (e.g. NIPL/L/26-27/0007), shown beside the title; double-click copies it. */
    code?: string;
    subtitle?: string;
    /** Icon shown in the square avatar; initials of `title` are used when omitted. */
    avatarIcon?: React.ReactNode;
    verified?: boolean;
    statusLabel?: string;
    statusColor?: string;
    /** Hero actions */
    editHref?: string;
    editLabel?: string;
    editDisabled?: boolean;
    editDisabledTooltip?: string;
    backHref: string;
    backLabel?: string;
    /** Extra hero actions shown before Back (e.g. the PDF menu). */
    actions?: React.ReactNode;
    /** Tabs and content (the same tab panels used by the edit form). */
    tabs?: RecordDetailTab[];
    activeTab?: string;
    onTabChange?: (tabId: string) => void;
    children: React.ReactNode;
    banner?: React.ReactNode;
    audit?: RecordAuditInfo;
    toast?: React.ReactNode;
    /** Pads the content area; off for entities whose tab panels already pad themselves. */
    padContent?: boolean;
    /** Record still loading: skeleton hero and fields instead of an empty "—" record. */
    loading?: boolean;
}

const initialsOf = (text: string) =>
    text
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((w) => w[0]?.toUpperCase())
        .join('') || '?';

/**
 * Read-only record page shared by every entity: breadcrumbs, identity hero with Edit/Back actions,
 * tab bar, the entity's own tab panels rendered in view mode, and an audit footer.
 */
export function CommonRecordDetailView({
    breadcrumbItems,
    title,
    code,
    subtitle,
    avatarIcon,
    verified,
    statusLabel,
    statusColor = 'var(--mui-palette-success-main)',
    editHref,
    editLabel = 'Edit Record',
    editDisabled,
    editDisabledTooltip,
    backHref,
    backLabel = 'Back to List',
    actions,
    tabs,
    activeTab,
    onTabChange,
    children,
    banner,
    audit,
    toast,
    padContent = false,
    loading = false,
}: CommonRecordDetailViewProps) {
    // Created At / Last Modified stamps belong to the overview tab only (the first tab when none is named 'overview').
    const overviewTabId = tabs?.find((t) => t.id === 'overview')?.id ?? tabs?.[0]?.id;
    const showAudit = Boolean(audit) && (!overviewTabId || (activeTab ?? tabs?.[0]?.id) === overviewTabId);
    const copyCode = useDoubleClickCopy();
    // Back goes to the list the user started browsing from (carried as `?from=`), else this record's own list.
    const backTo = useListOrigin(backHref);
    // Opened from the global search results: no "Back to List" (the user came from a search, not a list).
    const showBack = !isSearchOrigin(backTo);

    return (
        <Box sx={{ width: '100%', pb: 3 }}>
            <FormHeader breadcrumbItems={breadcrumbItems} />

            {banner}

            {/* ── Identity Hero ── */}
            <Paper
                elevation={0}
                sx={{
                    mb: 2,
                    p: { xs: 2, md: 2.5 },
                    border: '1px solid var(--mui-palette-border-main)',
                    borderRadius: '12px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: 2,
                    boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                }}
            >
                {loading ? (
                    <RecordHeaderSkeleton sx={{ flex: 1, minWidth: 0, '& > :last-child': { display: 'none' } }} />
                ) : (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, minWidth: 0 }}>
                    <Avatar
                        variant="rounded"
                        sx={{
                            width: 56,
                            height: 56,
                            borderRadius: '14px',
                            fontWeight: 800,
                            fontSize: '1.1rem',
                            color: '#fff',
                            background: 'linear-gradient(135deg, var(--crm-fill-blue-700) 0%, var(--crm-fill-blue-600) 100%)',
                        }}
                    >
                        {avatarIcon ?? initialsOf(title)}
                    </Avatar>
                    <Box sx={{ minWidth: 0 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                            <Typography
                                component="h1"
                                sx={{ fontSize: '22px', fontWeight: 700, color: 'var(--crm-slate-900)', lineHeight: 1.25 }}
                            >
                                {title || '—'}
                            </Typography>
                            {code && (
                                <Tooltip title="Double-click to copy">
                                    <Box
                                        component="span"
                                        onDoubleClick={copyCode.onDoubleClick}
                                        sx={{
                                            fontFamily: 'monospace',
                                            fontSize: '0.82rem',
                                            fontWeight: 700,
                                            lineHeight: 1.6,
                                            px: 1,
                                            borderRadius: '6px',
                                            color: 'var(--crm-text-blue-700)',
                                            backgroundColor: 'var(--mui-palette-primary-soft)',
                                            border: '1px solid var(--mui-palette-primary-softBorder)',
                                            cursor: 'text',
                                            whiteSpace: 'nowrap',
                                        }}
                                    >
                                        {code}
                                    </Box>
                                </Tooltip>
                            )}
                            {verified && (
                                <Tooltip title="Verified">
                                    <VerifiedIcon sx={{ fontSize: 20, color: 'var(--mui-palette-success-main)' }} />
                                </Tooltip>
                            )}
                            {statusLabel && (
                                <Chip
                                    label={statusLabel}
                                    size="small"
                                    sx={{
                                        height: 24,
                                        fontSize: '0.76rem',
                                        fontWeight: 700,
                                        cursor: 'default',
                                        color: statusColor,
                                        backgroundColor: `color-mix(in srgb, ${statusColor} 14%, transparent)`,
                                        border: `1px solid color-mix(in srgb, ${statusColor} 28%, transparent)`,
                                    }}
                                />
                            )}
                        </Box>
                        {subtitle && (
                            <Typography sx={{ fontSize: '0.82rem', color: 'var(--mui-palette-text-secondary)', fontFamily: 'monospace', mt: 0.3 }}>
                                {subtitle}
                            </Typography>
                        )}
                    </Box>
                </Box>
                )}

                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, flexWrap: 'wrap' }}>
                    {actions}
                    {showBack && (
                    <Button
                        component={Link}
                        href={backTo}
                        variant="outlined"
                        startIcon={<ArrowBackIcon sx={{ fontSize: 16 }} />}
                        sx={{
                            textTransform: 'none',
                            fontWeight: 600,
                            borderRadius: '8px',
                            borderColor: 'var(--mui-palette-border-main)',
                            color: 'var(--crm-slate-700)',
                            height: 36,
                            '&:hover': {
                                borderColor: 'var(--crm-blue-300)',
                                backgroundColor: 'var(--mui-palette-primary-soft)',
                                color: 'var(--crm-text-blue-700)',
                            },
                        }}
                    >
                        {backLabel}
                    </Button>
                    )}
                    {editHref && (
                        <Tooltip title={editDisabled ? editDisabledTooltip ?? '' : ''}>
                            <span>
                                <Button
                                    {...(editDisabled ? {} : { component: Link, href: editHref })}
                                    disabled={editDisabled}
                                    variant="contained"
                                    startIcon={<EditOutlinedIcon sx={{ fontSize: 16 }} />}
                                    sx={{
                                        textTransform: 'none',
                                        fontWeight: 700,
                                        borderRadius: '8px',
                                        height: 36,
                                        boxShadow: 'none',
                                        background: 'linear-gradient(135deg, var(--crm-fill-blue-700) 0%, var(--crm-fill-blue-600) 100%)',
                                        '&:hover': {
                                            background: 'linear-gradient(135deg, var(--crm-fill-blue-800) 0%, var(--crm-fill-blue-700) 100%)',
                                        },
                                    }}
                                >
                                    {editLabel}
                                </Button>
                            </span>
                        </Tooltip>
                    )}
                </Box>
            </Paper>

            {/* ── Tabs + read-only content ── */}
            <Paper
                elevation={0}
                sx={{
                    border: '1px solid var(--mui-palette-border-main)',
                    borderRadius: '12px',
                    overflow: 'hidden',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                }}
            >
                {tabs && tabs.length > 0 && (
                    <Tabs
                        value={activeTab ?? tabs[0].id}
                        onChange={(_, value: string) => onTabChange?.(value)}
                        variant="scrollable"
                        scrollButtons="auto"
                        sx={{
                            borderBottom: '1px solid var(--mui-palette-border-main)',
                            minHeight: 46,
                            px: { xs: 1, md: 2 },
                            '& .MuiTabs-indicator': { height: 3, borderRadius: '3px 3px 0 0', backgroundColor: 'var(--mui-palette-primary-main)' },
                        }}
                    >
                        {tabs.map((tab) => (
                            <Tab
                                key={tab.id}
                                value={tab.id}
                                icon={React.isValidElement(tab.icon) ? tab.icon : undefined}
                                iconPosition="start"
                                label={
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                                        {tab.label}
                                    </Box>
                                }
                                sx={{
                                    textTransform: 'none',
                                    fontWeight: 600,
                                    fontSize: '0.84rem',
                                    minHeight: 46,
                                    color: 'var(--mui-palette-text-secondary)',
                                    '&.Mui-selected': { color: 'var(--crm-text-blue-900)', fontWeight: 700 },
                                }}
                            />
                        ))}
                    </Tabs>
                )}

                <FormModeProvider mode="view">
                    {/* `inert` would also block the copy buttons, so only form controls are made non-interactive. */}
                    <Box
                        sx={{
                            p: padContent ? { xs: 2.5, md: 3.5 } : 0,
                            '& input, & textarea, & select, & .MuiSelect-select, & .MuiSwitch-root, & .MuiCheckbox-root, & .MuiRadio-root, & .MuiAutocomplete-root': {
                                pointerEvents: 'none',
                            },
                        }}
                    >
                        {/* Panels stay mounted (hidden) while loading so they're ready the moment data lands. */}
                        {loading && <FormSectionsSkeleton sx={padContent ? { p: 0 } : undefined} />}
                        <Box sx={loading ? { display: 'none' } : { display: 'contents' }}>{children}</Box>
                        {!loading && showAudit && audit && (
                            <Box sx={padContent ? undefined : { px: { xs: 2.5, md: 3.5 }, pb: 3 }}>
                                <RecordAuditFooter audit={audit} />
                            </Box>
                        )}
                    </Box>
                </FormModeProvider>
            </Paper>

            {toast}
            {copyCode.toast}
        </Box>
    );
}
