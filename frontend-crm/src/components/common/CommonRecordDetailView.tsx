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

export interface RecordDetailTab {
    id: string;
    label: string;
    icon?: React.ReactNode;
    badge?: React.ReactNode;
    sublabel?: React.ReactNode;
}

export interface RecordAuditInfo {
    createdAt?: string;
    createdBy?: string;
    updatedAt?: string;
}

export interface CommonRecordDetailViewProps {
    breadcrumbItems?: BreadcrumbItem[];
    /** Identity hero */
    title: string;
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
}

const formatDate = (iso?: string) => {
    if (!iso) return undefined;
    const d = new Date(iso);
    return Number.isNaN(d.getTime())
        ? iso
        : d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

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
    subtitle,
    avatarIcon,
    verified,
    statusLabel,
    statusColor = '#16a34a',
    editHref,
    editLabel = 'Edit Record',
    editDisabled,
    editDisabledTooltip,
    backHref,
    backLabel = 'Back to List',
    tabs,
    activeTab,
    onTabChange,
    children,
    banner,
    audit,
    toast,
    padContent = false,
}: CommonRecordDetailViewProps) {
    const created = formatDate(audit?.createdAt);
    const modified = formatDate(audit?.updatedAt);
    const auditText = [
        created ? `Created on ${created}${audit?.createdBy ? ` by ${audit.createdBy}` : ''}` : undefined,
        modified ? `Last modified ${modified}` : undefined,
    ]
        .filter(Boolean)
        .join(' • ');

    return (
        <Box sx={{ width: '100%', pb: 10 }}>
            <FormHeader breadcrumbItems={breadcrumbItems} />

            {banner}

            {/* ── Identity Hero ── */}
            <Paper
                elevation={0}
                sx={{
                    mb: 2,
                    p: { xs: 2, md: 2.5 },
                    border: '1px solid #e2e8f0',
                    borderRadius: '12px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: 2,
                    boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                }}
            >
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
                            background: 'linear-gradient(135deg, #1d4ed8 0%, #2563eb 100%)',
                        }}
                    >
                        {avatarIcon ?? initialsOf(title)}
                    </Avatar>
                    <Box sx={{ minWidth: 0 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                            <Typography
                                component="h1"
                                sx={{ fontSize: '22px', fontWeight: 700, color: '#0f172a', lineHeight: 1.25 }}
                            >
                                {title || '—'}
                            </Typography>
                            {verified && (
                                <Tooltip title="Verified">
                                    <VerifiedIcon sx={{ fontSize: 20, color: '#16a34a' }} />
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
                                        backgroundColor: `${statusColor}1a`,
                                    }}
                                />
                            )}
                        </Box>
                        {subtitle && (
                            <Typography sx={{ fontSize: '0.82rem', color: '#64748b', fontFamily: 'monospace', mt: 0.3 }}>
                                {subtitle}
                            </Typography>
                        )}
                    </Box>
                </Box>

                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, flexWrap: 'wrap' }}>
                    <Button
                        component={Link}
                        href={backHref}
                        variant="outlined"
                        startIcon={<ArrowBackIcon sx={{ fontSize: 16 }} />}
                        sx={{
                            textTransform: 'none',
                            fontWeight: 600,
                            borderRadius: '8px',
                            borderColor: '#e2e8f0',
                            color: '#334155',
                            height: 36,
                        }}
                    >
                        {backLabel}
                    </Button>
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
                                        background: 'linear-gradient(135deg, #1d4ed8 0%, #2563eb 100%)',
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
                    border: '1px solid #e2e8f0',
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
                            borderBottom: '1px solid #e2e8f0',
                            minHeight: 46,
                            px: { xs: 1, md: 2 },
                            '& .MuiTabs-indicator': { height: 3, borderRadius: '3px 3px 0 0', backgroundColor: '#2563eb' },
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
                                        {tab.sublabel && (
                                            <Typography component="span" sx={{ fontSize: '0.74rem', color: '#94a3b8', fontWeight: 400 }}>
                                                {tab.sublabel}
                                            </Typography>
                                        )}
                                    </Box>
                                }
                                sx={{
                                    textTransform: 'none',
                                    fontWeight: 600,
                                    fontSize: '0.84rem',
                                    minHeight: 46,
                                    color: '#64748b',
                                    '&.Mui-selected': { color: '#1e3a8a', fontWeight: 700 },
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
                        {children}
                    </Box>
                </FormModeProvider>
            </Paper>

            {/* ── Audit footer (only when the record carries audit data) ── */}
            {auditText && (
            <Box
                sx={{
                    position: 'fixed',
                    bottom: 0,
                    left: 0,
                    right: 0,
                    zIndex: 1200,
                    backgroundColor: '#fff',
                    borderTop: '1px solid #e2e8f0',
                    px: { xs: 2, md: 4 },
                    py: 1.5,
                    boxShadow: '0 -2px 10px rgba(0,0,0,0.05)',
                }}
            >
                <Typography sx={{ fontSize: '0.78rem', color: '#64748b', fontWeight: 500 }}>
                    {auditText}
                </Typography>
            </Box>
            )}

            {toast}
        </Box>
    );
}
