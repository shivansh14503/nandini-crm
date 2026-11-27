'use client';

import React from 'react';
import { Box, Button, MenuItem, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, Typography, useMediaQuery, useTheme } from '@mui/material';
import { getModuleColor } from '@/theme/moduleColors';
import { inputSx, secondaryButtonSx } from '@/components/settings/form-customization/builderUi';
import {
    FULL_PERMISSIONS,
    OWN_RECORDS_PERMISSIONS,
    PERMISSION_ACTION_LABELS,
    PERMISSION_ACTIONS,
    PERMISSION_MODULES,
    levelLabel,
    levelsFor,
    normalizePermissions,
    uniformPermissions,
    type AccessLevel,
    type PermissionAction,
    type PermissionModuleDef,
    type RolePermissions,
} from '@/utils/permissions';

const RANK: Record<AccessLevel, number> = { none: 0, own: 1, all: 2 };

/** One-click starting points for the whole grid. */
const PRESETS: { key: string; label: string; build: () => RolePermissions }[] = [
    { key: 'full', label: 'Full access', build: () => FULL_PERMISSIONS },
    { key: 'own', label: 'Own records', build: () => OWN_RECORDS_PERMISSIONS },
    {
        key: 'view',
        label: 'View only',
        build: () => normalizePermissions(Object.fromEntries(PERMISSION_MODULES.map((m) => [m.key, { view: 'all' }]))),
    },
    { key: 'none', label: 'No access', build: () => uniformPermissions('none') },
];

const headCellSx = {
    fontSize: '0.72rem',
    fontWeight: 700,
    color: 'var(--crm-slate-600)',
    textTransform: 'uppercase',
    letterSpacing: '0.03em',
    backgroundColor: 'var(--mui-palette-background-subtle)',
    whiteSpace: 'nowrap',
    py: 1,
} as const;

/** Text colour of a level in the select: brand for All / Yes, amber for Own, muted for None / No. */
const levelColor = (level: AccessLevel) =>
    level === 'all' ? 'var(--crm-text-blue-700)' : level === 'own' ? 'var(--crm-amber-700)' : 'var(--mui-palette-text-muted)';

interface LevelSelectProps {
    module: PermissionModuleDef;
    action: PermissionAction;
    value: AccessLevel;
    view: AccessLevel;
    disabled?: boolean;
    onChange: (level: AccessLevel) => void;
    fullWidth?: boolean;
}

function LevelSelect({ module, action, value, view, disabled, onChange, fullWidth }: LevelSelectProps) {
    const levels = levelsFor(module, action);
    // Nothing but View works while View is None; Edit and Delete never go beyond View.
    const locked = disabled || (action !== 'view' && view === 'none');
    return (
        <TextField
            select
            size="small"
            value={value}
            disabled={locked}
            onChange={(e) => onChange(e.target.value as AccessLevel)}
            sx={{
                ...inputSx,
                width: fullWidth ? '100%' : 96,
                '& .MuiSelect-select': { fontSize: '0.8rem', fontWeight: 600, color: levelColor(value), py: '6px' },
            }}
            slotProps={{ htmlInput: { 'aria-label': `${module.label} ${PERMISSION_ACTION_LABELS[action]}` } }}
        >
            {levels.map((level) => (
                <MenuItem
                    key={level}
                    value={level}
                    disabled={(action === 'edit' || action === 'delete') && RANK[level] > RANK[view]}
                    sx={{ fontSize: '0.82rem', color: levelColor(level), fontWeight: 600 }}
                >
                    {levelLabel(action, level)}
                </MenuItem>
            ))}
        </TextField>
    );
}

const ModuleName = ({ module }: { module: PermissionModuleDef }) => (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
        <Box component="span" sx={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, backgroundColor: getModuleColor(module.key).main }} />
        <Typography component="span" sx={{ fontSize: '0.84rem', fontWeight: 600, color: 'var(--crm-slate-900)', overflowWrap: 'anywhere' }}>
            {module.label}
        </Typography>
    </Box>
);

export interface PermissionGridProps {
    value: RolePermissions;
    onChange: (next: RolePermissions) => void;
    disabled?: boolean;
}

/**
 * The per-module permission grid of the role editor: a table (modules × View / Create / Edit / Delete / Export /
 * Import) from `md` up, one card per module below. Every change is normalized (permissions.ts): turning View to None
 * clears the module, Edit / Delete never exceed View.
 */
export function PermissionGrid({ value, onChange, disabled }: PermissionGridProps) {
    const theme = useTheme();
    const wide = useMediaQuery(theme.breakpoints.up('md'));

    const setLevel = (module: PermissionModuleDef, action: PermissionAction, level: AccessLevel) => {
        const nextModule = { ...value[module.key], [action]: level };
        // Raising View back up from None keeps the rest at None until they are set.
        onChange(normalizePermissions({ ...value, [module.key]: nextModule }));
    };

    const presets = (
        <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1 }}>
            <Typography sx={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--mui-palette-text-secondary)', mr: 0.5 }}>Set every module to:</Typography>
            {PRESETS.map((preset) => (
                <Button
                    key={preset.key}
                    size="small"
                    variant="outlined"
                    disabled={disabled}
                    onClick={() => onChange(preset.build())}
                    sx={{ ...secondaryButtonSx, minHeight: 32, fontSize: '0.78rem', px: 1.25 }}
                >
                    {preset.label}
                </Button>
            ))}
        </Box>
    );

    const legend = (
        <Typography sx={{ fontSize: '0.75rem', color: 'var(--mui-palette-text-secondary)', lineHeight: 1.6 }}>
            <b>All</b>: every record. <b>Own</b>: records the user is assigned to or created. <b>None</b>: hidden. Create, Export and Import are Yes or No.
            Products and Partner Companies have no owner, so they are All or None.
        </Typography>
    );

    if (!wide) {
        return (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                {presets}
                {legend}
                {PERMISSION_MODULES.map((module) => {
                    const perms = value[module.key];
                    const view = perms.view ?? 'none';
                    return (
                        <Box
                            key={module.key}
                            sx={{ border: '1px solid var(--mui-palette-border-main)', borderRadius: '10px', p: 1.5, backgroundColor: 'var(--mui-palette-background-paper)' }}
                        >
                            <ModuleName module={module} />
                            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 1.25, mt: 1.25 }}>
                                {module.actions.map((action) => (
                                    <Box key={action} sx={{ minWidth: 0 }}>
                                        <Typography sx={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--crm-slate-600)', mb: 0.4, textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                                            {PERMISSION_ACTION_LABELS[action]}
                                        </Typography>
                                        <LevelSelect
                                            module={module}
                                            action={action}
                                            value={perms[action] ?? 'none'}
                                            view={view}
                                            disabled={disabled}
                                            onChange={(level) => setLevel(module, action, level)}
                                            fullWidth
                                        />
                                    </Box>
                                ))}
                            </Box>
                        </Box>
                    );
                })}
            </Box>
        );
    }

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, minWidth: 0 }}>
            {presets}
            {legend}
            <TableContainer sx={{ border: '1px solid var(--mui-palette-border-main)', borderRadius: '10px', overflowX: 'auto' }}>
                <Table size="small" sx={{ minWidth: 760 }}>
                    <TableHead>
                        <TableRow>
                            <TableCell sx={headCellSx}>Module</TableCell>
                            {PERMISSION_ACTIONS.map((action) => (
                                <TableCell key={action} sx={headCellSx} align="center">
                                    {PERMISSION_ACTION_LABELS[action]}
                                </TableCell>
                            ))}
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {PERMISSION_MODULES.map((module) => {
                            const perms = value[module.key];
                            const view = perms.view ?? 'none';
                            return (
                                <TableRow key={module.key} sx={{ '&:hover': { backgroundColor: 'var(--mui-palette-background-hover)' }, '&:last-child td': { borderBottom: 0 } }}>
                                    <TableCell sx={{ py: 0.75, borderColor: 'var(--mui-palette-border-light)' }}>
                                        <ModuleName module={module} />
                                    </TableCell>
                                    {PERMISSION_ACTIONS.map((action) => (
                                        <TableCell key={action} align="center" sx={{ py: 0.75, borderColor: 'var(--mui-palette-border-light)' }}>
                                            {module.actions.includes(action) ? (
                                                <LevelSelect
                                                    module={module}
                                                    action={action}
                                                    value={perms[action] ?? 'none'}
                                                    view={view}
                                                    disabled={disabled}
                                                    onChange={(level) => setLevel(module, action, level)}
                                                />
                                            ) : (
                                                <Box component="span" title="This module has no such action" sx={{ color: 'var(--mui-palette-text-muted)', fontSize: '0.85rem' }}>
                                                    —
                                                </Box>
                                            )}
                                        </TableCell>
                                    ))}
                                </TableRow>
                            );
                        })}
                    </TableBody>
                </Table>
            </TableContainer>
        </Box>
    );
}
