'use client';

import React from 'react';
import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, Switch, Tooltip, Typography, type SxProps, type Theme } from '@mui/material';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import DragIndicatorRoundedIcon from '@mui/icons-material/DragIndicatorRounded';

/** Shared surface / control styling for the Form & Dropdown Customization screens (Nandini CRM tokens). */

export const surfaceSx = {
    borderRadius: '12px',
    border: '1px solid var(--mui-palette-border-main)',
    backgroundColor: 'var(--mui-palette-background-paper)',
    boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
} as const;

export const panelHeaderSx = {
    px: 2,
    py: 1.25,
    backgroundColor: 'var(--mui-palette-background-subtle)',
    borderBottom: '1px solid var(--mui-palette-border-main)',
} as const;

export const primaryButtonSx = {
    textTransform: 'none',
    fontWeight: 600,
    fontSize: '0.82rem',
    borderRadius: '8px',
    boxShadow: 'none',
    background: 'linear-gradient(135deg, var(--crm-fill-blue-700) 0%, var(--crm-fill-blue-600) 100%)',
    '&:hover': { boxShadow: '0 2px 6px rgb(var(--crm-accent-rgb) / 0.25)' },
} as const;

export const secondaryButtonSx = {
    textTransform: 'none',
    fontWeight: 600,
    fontSize: '0.82rem',
    borderRadius: '8px',
    color: 'var(--crm-slate-700)',
    borderColor: 'var(--mui-palette-border-strong)',
    '&:hover': { borderColor: 'var(--crm-slate-400)', backgroundColor: 'var(--mui-palette-background-subtle)' },
} as const;

export const inputSx = {
    '& .MuiOutlinedInput-root': {
        borderRadius: '8px',
        backgroundColor: 'var(--mui-palette-background-paper)',
        fontSize: '0.85rem',
        '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: 'var(--mui-palette-primary-main)' },
        '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: 'var(--mui-palette-primary-main)', borderWidth: '1.5px' },
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
                            backgroundColor: active ? 'var(--mui-palette-background-paper)' : 'transparent',
                            border: active ? '1px solid var(--mui-palette-border-strong)' : '1px solid transparent',
                            boxShadow: active ? '0 1px 3px rgba(0,0,0,0.06)' : 'none',
                            color: active ? 'var(--crm-text-blue-900)' : 'var(--mui-palette-text-secondary)',
                            fontWeight: active ? 700 : 500,
                            fontSize: '0.82rem',
                            outline: 'none',
                            '&:hover': { backgroundColor: active ? 'var(--mui-palette-background-paper)' : 'var(--mui-palette-background-hover)', color: active ? 'var(--crm-blue-900)' : 'var(--mui-palette-text-primary)' },
                            '&:focus-visible': { boxShadow: '0 0 0 2px var(--crm-blue-200)' },
                            ...(onDeleteTab ? { pr: 0.75, '&:hover .pill-tab-delete, &:focus-within .pill-tab-delete': { opacity: 1 } } : {}),
                        }}
                    >
                        {item.icon && <Box sx={{ display: 'flex', color: active ? 'var(--crm-text-blue-600)' : 'var(--mui-palette-text-secondary)' }}>{item.icon}</Box>}
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
                                    border: `1px solid ${active ? 'var(--crm-blue-300)' : 'var(--mui-palette-border-main)'}`,
                                    backgroundColor: active ? 'var(--mui-palette-primary-soft)' : 'var(--mui-palette-background-subtle)',
                                    color: active ? 'var(--crm-text-blue-600)' : 'var(--mui-palette-text-secondary)',
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
                                        boxShadow: '0 0 0 2px var(--crm-amber-100)',
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
                        color: 'var(--mui-palette-text-muted)',
                        '&:hover': { color: dangerColor, backgroundColor: 'var(--mui-palette-error-soft)' },
                        '&:focus-visible': { color: dangerColor, boxShadow: '0 0 0 2px var(--crm-red-200)' },
                        '&.Mui-disabled': { color: 'var(--crm-slate-200)' },
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
    system: { bg: 'var(--mui-palette-background-hover)', color: 'var(--crm-slate-600)', border: 'var(--mui-palette-border-main)' },
    custom: { bg: 'var(--mui-palette-primary-soft)', color: 'var(--crm-text-blue-700)', border: 'var(--mui-palette-primary-softBorder)' },
    active: { bg: 'var(--crm-green-100)', color: 'var(--crm-green-800)', border: 'var(--crm-green-300)' },
    archived: { bg: 'var(--mui-palette-background-subtle)', color: 'var(--mui-palette-text-muted)', border: 'var(--mui-palette-border-main)' },
    locked: { bg: 'var(--crm-amber-100)', color: 'var(--crm-amber-700)', border: 'var(--mui-palette-warning-softBorder)' },
    shared: { bg: 'var(--crm-violet-50)', color: 'var(--crm-violet-700)', border: 'var(--crm-violet-200)' },
    neutral: { bg: 'var(--mui-palette-background-paper)', color: 'var(--crm-slate-600)', border: 'var(--mui-palette-border-strong)' },
    unsaved: { bg: 'var(--crm-orange-50)', color: 'var(--crm-orange-700)', border: 'var(--crm-orange-200)' },
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
                color: disabled ? 'var(--crm-slate-200)' : 'var(--mui-palette-text-muted)',
                cursor: disabled ? 'default' : 'grab',
                transition: 'color 120ms ease, background-color 120ms ease',
                touchAction: disabled ? undefined : 'none',
                '&:hover': disabled ? undefined : { color: 'var(--mui-palette-text-secondary)', backgroundColor: 'var(--mui-palette-background-hover)' },
                '&:active': disabled ? undefined : { cursor: 'grabbing', color: 'var(--crm-text-blue-600)', backgroundColor: 'var(--mui-palette-primary-soft)' },
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

export const dangerColor = 'var(--crm-red-500)';

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
            <DialogTitle sx={{ fontWeight: 700, fontSize: '1rem', color: 'var(--crm-slate-900)' }}>{title}</DialogTitle>
            <DialogContent sx={{ fontSize: '0.85rem', color: 'var(--crm-slate-600)', display: 'flex', flexDirection: 'column', gap: 1 }}>{children}</DialogContent>
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
        <Box sx={{ py: 6, px: 3, textAlign: 'center', color: 'var(--mui-palette-text-secondary)' }}>
            {icon && <Box sx={{ color: 'var(--mui-palette-text-muted)', mb: 1, display: 'flex', justifyContent: 'center' }}>{icon}</Box>}
            <Typography sx={{ fontWeight: 700, color: 'var(--mui-palette-text-primary)', fontSize: '0.9rem' }}>{title}</Typography>
            {description && <Typography sx={{ fontSize: '0.8rem', mt: 0.5, maxWidth: 560, mx: 'auto' }}>{description}</Typography>}
            {action && <Box sx={{ mt: 2, display: 'flex', justifyContent: 'center' }}>{action}</Box>}
        </Box>
    );
}

/** Error message from an API failure (ApiClientError carries the server message). */
export const errorMessage = (err: unknown, fallback = 'Something went wrong. Please try again.') =>
    err instanceof Error && err.message ? err.message : fallback;
