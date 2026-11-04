'use client';

import React from 'react';
import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, Switch, Tooltip, Typography, type SxProps, type Theme } from '@mui/material';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import DragIndicatorRoundedIcon from '@mui/icons-material/DragIndicatorRounded';

/** Shared surface / control styling for the Form & Dropdown Customization screens (Nandini CRM tokens). */

export const surfaceSx = {
    borderRadius: '12px',
    border: '1px solid #e2e8f0',
    backgroundColor: '#ffffff',
    boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
} as const;

export const panelHeaderSx = {
    px: 2,
    py: 1.25,
    backgroundColor: '#f8fafc',
    borderBottom: '1px solid #e2e8f0',
} as const;

export const primaryButtonSx = {
    textTransform: 'none',
    fontWeight: 600,
    fontSize: '0.82rem',
    borderRadius: '8px',
    boxShadow: 'none',
    background: 'linear-gradient(135deg, #1d4ed8 0%, #2563eb 100%)',
    '&:hover': { boxShadow: '0 2px 6px rgba(37,99,235,0.25)' },
} as const;

export const secondaryButtonSx = {
    textTransform: 'none',
    fontWeight: 600,
    fontSize: '0.82rem',
    borderRadius: '8px',
    color: '#334155',
    borderColor: '#cbd5e1',
    '&:hover': { borderColor: '#94a3b8', backgroundColor: '#f8fafc' },
} as const;

export const inputSx = {
    '& .MuiOutlinedInput-root': {
        borderRadius: '8px',
        backgroundColor: '#fff',
        fontSize: '0.85rem',
        '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#2563EB' },
        '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: '#2563EB', borderWidth: '1.5px' },
    },
} as const;

export interface PillTabItem<K extends string> {
    key: K;
    label: string;
    icon?: React.ReactNode;
    count?: number;
    /** Shows the orange "unsaved" signal dot (same as on the module pills). */
    hasUnsaved?: boolean;
    unsavedTooltip?: string;
}

/**
 * Horizontal pill tabs, matching CommonFormLayout's tab bar. With `onDeleteTab`, each pill gets a small delete
 * button (always shown on the active pill, on hover / focus on the others); `getDeleteTabDisabledReason` returns
 * why a tab can't be deleted (shown as the disabled button's tooltip), or null.
 */
export function PillTabs<K extends string>({
    items,
    value,
    onChange,
    sx,
    onDeleteTab,
    getDeleteTabDisabledReason,
}: {
    items: PillTabItem<K>[];
    value: K;
    onChange: (key: K) => void;
    sx?: SxProps<Theme>;
    onDeleteTab?: (key: K) => void;
    getDeleteTabDisabledReason?: (key: K) => string | null;
}) {
    return (
        <Box role="tablist" sx={[{ display: 'flex', alignItems: 'center', gap: 1, overflowX: 'auto', flexWrap: 'nowrap' }, ...(Array.isArray(sx) ? sx : [sx])]}>
            {items.map((item) => {
                const active = item.key === value;
                return (
                    <Box
                        key={item.key}
                        role="tab"
                        aria-selected={active}
                        tabIndex={0}
                        onClick={() => onChange(item.key)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                onChange(item.key);
                            }
                        }}
                        sx={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 0.8,
                            px: 1.75,
                            py: 0.8,
                            borderRadius: '8px',
                            cursor: 'pointer',
                            userSelect: 'none',
                            whiteSpace: 'nowrap',
                            transition: 'all 0.15s ease-in-out',
                            backgroundColor: active ? '#ffffff' : 'transparent',
                            border: active ? '1px solid #cbd5e1' : '1px solid transparent',
                            boxShadow: active ? '0 1px 3px rgba(0,0,0,0.06)' : 'none',
                            color: active ? '#1e3a8a' : '#64748b',
                            fontWeight: active ? 700 : 500,
                            fontSize: '0.82rem',
                            outline: 'none',
                            '&:hover': { backgroundColor: active ? '#ffffff' : '#f1f5f9', color: active ? '#1e3a8a' : '#1e293b' },
                            '&:focus-visible': { boxShadow: '0 0 0 2px #bfdbfe' },
                            ...(onDeleteTab ? { pr: 0.75, '&:hover .pill-tab-delete, &:focus-within .pill-tab-delete': { opacity: 1 } } : {}),
                        }}
                    >
                        {item.icon && <Box sx={{ display: 'flex', color: active ? '#2563eb' : '#64748b' }}>{item.icon}</Box>}
                        <span>{item.label}</span>
                        {item.count !== undefined && (
                            <Box
                                component="span"
                                sx={{
                                    px: 0.8,
                                    borderRadius: '9999px',
                                    fontSize: '0.68rem',
                                    fontWeight: 600,
                                    lineHeight: 1.6,
                                    border: `1px solid ${active ? '#93c5fd' : '#e2e8f0'}`,
                                    backgroundColor: active ? '#eff6ff' : '#f8fafc',
                                    color: active ? '#2563eb' : '#64748b',
                                }}
                            >
                                {item.count}
                            </Box>
                        )}
                        {item.hasUnsaved && (
                            <Tooltip title={item.unsavedTooltip ?? 'Has unsaved changes on this tab'} arrow>
                                <Box
                                    component="span"
                                    aria-label={item.unsavedTooltip ?? 'Has unsaved changes on this tab'}
                                    sx={{
                                        width: 7,
                                        height: 7,
                                        borderRadius: '50%',
                                        backgroundColor: '#f59e0b',
                                        boxShadow: '0 0 0 2px #fef3c7',
                                        flexShrink: 0,
                                    }}
                                />
                            </Tooltip>
                        )}
                        {onDeleteTab && (
                            <PillTabDeleteButton
                                label={item.label}
                                active={active}
                                disabledReason={getDeleteTabDisabledReason?.(item.key) ?? null}
                                onDelete={() => onDeleteTab(item.key)}
                            />
                        )}
                    </Box>
                );
            })}
        </Box>
    );
}

/** Small "×" on a pill tab; a click on it never selects the tab. */
function PillTabDeleteButton({ label, active, disabledReason, onDelete }: { label: string; active: boolean; disabledReason: string | null; onDelete: () => void }) {
    const disabled = Boolean(disabledReason);
    return (
        <Tooltip title={disabledReason ?? `Delete '${label}' tab`} arrow>
            {/* span: a disabled button fires no events, so the tooltip hangs on its wrapper. */}
            <Box
                component="span"
                className="pill-tab-delete"
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => e.stopPropagation()}
                sx={{ display: 'inline-flex', ml: -0.25, opacity: active ? 1 : 0, transition: 'opacity 120ms ease' }}
            >
                <IconButton
                    size="small"
                    disabled={disabled}
                    aria-label={disabled ? `Can't delete '${label}' tab: ${disabledReason}` : `Delete '${label}' tab`}
                    onClick={onDelete}
                    sx={{
                        p: 0.25,
                        color: '#94a3b8',
                        '&:hover': { color: dangerColor, backgroundColor: '#fef2f2' },
                        '&:focus-visible': { color: dangerColor, boxShadow: '0 0 0 2px #fecaca' },
                        '&.Mui-disabled': { color: '#e2e8f0' },
                    }}
                >
                    <CloseRoundedIcon sx={{ fontSize: 14 }} />
                </IconButton>
            </Box>
        </Tooltip>
    );
}

export type BadgeTone = 'system' | 'custom' | 'active' | 'archived' | 'locked' | 'shared' | 'neutral' | 'unsaved';

const BADGE_TONES: Record<BadgeTone, { bg: string; color: string; border: string }> = {
    system: { bg: '#f1f5f9', color: '#475569', border: '#e2e8f0' },
    custom: { bg: '#eff6ff', color: '#1d4ed8', border: '#bfdbfe' },
    active: { bg: '#dcfce7', color: '#166534', border: '#86efac' },
    archived: { bg: '#f8fafc', color: '#94a3b8', border: '#e2e8f0' },
    locked: { bg: '#fef3c7', color: '#b45309', border: '#fde68a' },
    shared: { bg: '#f5f3ff', color: '#6d28d9', border: '#ddd6fe' },
    neutral: { bg: '#ffffff', color: '#475569', border: '#cbd5e1' },
    unsaved: { bg: '#fff7ed', color: '#c2410c', border: '#fed7aa' },
};

export function Badge({ tone, children, icon, title }: { tone: BadgeTone; children: React.ReactNode; icon?: React.ReactNode; title?: string }) {
    const t = BADGE_TONES[tone];
    const badge = (
        <Box
            component="span"
            sx={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 0.4,
                px: 0.75,
                py: 0.1,
                borderRadius: '4px',
                fontSize: '0.64rem',
                fontWeight: 700,
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
                whiteSpace: 'nowrap',
                lineHeight: 1.6,
                backgroundColor: t.bg,
                color: t.color,
                border: `1px solid ${t.border}`,
            }}
        >
            {icon}
            {children}
        </Box>
    );
    return title ? (
        <Tooltip title={title} arrow>
            {badge}
        </Tooltip>
    ) : (
        badge
    );
}

/**
 * Grip shown at the start of a draggable row (see useDragReorder). Deliberately not a button: the drag starts
 * from the row, and buttons inside a row don't start drags. `touch-action: none` lets touch drags start here
 * without scrolling the page.
 */
export function DragHandle({ disabled, title }: { disabled?: boolean; title?: string }) {
    const handle = (
        <Box
            aria-hidden
            sx={{
                display: 'flex',
                alignItems: 'center',
                p: 0.25,
                borderRadius: '4px',
                color: disabled ? '#e2e8f0' : '#94a3b8',
                cursor: disabled ? 'default' : 'grab',
                transition: 'color 120ms ease, background-color 120ms ease',
                touchAction: disabled ? undefined : 'none',
                '&:hover': disabled ? undefined : { color: '#64748b', backgroundColor: '#f1f5f9' },
                '&:active': disabled ? undefined : { cursor: 'grabbing', color: '#2563eb', backgroundColor: '#eff6ff' },
            }}
        >
            <DragIndicatorRoundedIcon sx={{ fontSize: 18 }} />
        </Box>
    );
    return title ? (
        <Tooltip title={title} arrow>
            {handle}
        </Tooltip>
    ) : (
        handle
    );
}

export const dangerColor = '#ef4444';

/** Red "delete" confirmation. */
export function ConfirmDeleteDialog({
    open,
    title,
    children,
    confirmLabel = 'Delete',
    confirmDisabled,
    onConfirm,
    onClose,
}: {
    open: boolean;
    title: string;
    children: React.ReactNode;
    confirmLabel?: string;
    confirmDisabled?: boolean;
    onConfirm: () => void;
    onClose: () => void;
}) {
    return (
        <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth slotProps={{ paper: { sx: { borderRadius: '12px' } } }}>
            <DialogTitle sx={{ fontWeight: 700, fontSize: '1rem', color: '#0f172a' }}>{title}</DialogTitle>
            <DialogContent sx={{ fontSize: '0.85rem', color: '#475569', display: 'flex', flexDirection: 'column', gap: 1 }}>{children}</DialogContent>
            <DialogActions sx={{ px: 3, pb: 2 }}>
                <Button onClick={onClose} variant="outlined" sx={secondaryButtonSx}>
                    Cancel
                </Button>
                <Button
                    variant="contained"
                    disabled={confirmDisabled}
                    onClick={onConfirm}
                    sx={{ ...primaryButtonSx, background: `linear-gradient(135deg, #dc2626 0%, ${dangerColor} 100%)`, '&:hover': { boxShadow: '0 2px 6px rgba(239,68,68,0.3)' } }}
                >
                    {confirmLabel}
                </Button>
            </DialogActions>
        </Dialog>
    );
}

/** Small labelled switch; shows `disabledReason` as a tooltip when disabled. */
export function LabeledSwitch({
    checked,
    onChange,
    disabled,
    disabledReason,
    label,
}: {
    checked: boolean;
    onChange: (checked: boolean) => void;
    disabled?: boolean;
    disabledReason?: string;
    label: string;
}) {
    const control = (
        <Switch
            size="small"
            checked={checked}
            disabled={disabled}
            onChange={(e) => onChange(e.target.checked)}
            slotProps={{ input: { 'aria-label': label } }}
        />
    );
    return disabled && disabledReason ? (
        <Tooltip title={disabledReason} arrow>
            <span>{control}</span>
        </Tooltip>
    ) : (
        control
    );
}

export function EmptyState({ title, description, icon, action }: { title: string; description?: string; icon?: React.ReactNode; action?: React.ReactNode }) {
    return (
        <Box sx={{ py: 6, px: 3, textAlign: 'center', color: '#64748b' }}>
            {icon && <Box sx={{ color: '#94a3b8', mb: 1, display: 'flex', justifyContent: 'center' }}>{icon}</Box>}
            <Typography sx={{ fontWeight: 700, color: '#1e293b', fontSize: '0.9rem' }}>{title}</Typography>
            {description && <Typography sx={{ fontSize: '0.8rem', mt: 0.5, maxWidth: 560, mx: 'auto' }}>{description}</Typography>}
            {action && <Box sx={{ mt: 2, display: 'flex', justifyContent: 'center' }}>{action}</Box>}
        </Box>
    );
}

/** Error message from an API failure (ApiClientError carries the server message). */
export const errorMessage = (err: unknown, fallback = 'Something went wrong. Please try again.') =>
    err instanceof Error && err.message ? err.message : fallback;
