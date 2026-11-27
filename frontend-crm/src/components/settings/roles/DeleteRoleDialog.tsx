'use client';

import React, { useState } from 'react';
import { Alert, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, TextField, Typography } from '@mui/material';
import { errorMessage, inputSx, secondaryButtonSx } from '@/components/settings/form-customization/builderUi';
import { useAuth } from '@/context/AuthContext';
import { useDeleteRole } from '@/hooks/queries/useRoles';
import type { DeleteRoleResult, RoleDto } from '@/types/role.types';

export interface DeleteRoleDialogProps {
    role: RoleDto | null;
    roles: RoleDto[];
    onClose: () => void;
    onDeleted: (role: RoleDto, result: DeleteRoleResult) => void;
}

/** Mounts a fresh form for each role. */
export function DeleteRoleDialog(props: DeleteRoleDialogProps) {
    return props.role ? <DeleteRole key={props.role.id} {...props} role={props.role} /> : null;
}

const dangerButtonSx = {
    textTransform: 'none',
    fontWeight: 600,
    fontSize: '0.82rem',
    borderRadius: '8px',
    boxShadow: 'none',
    color: '#ffffff',
    background: 'var(--crm-fill-red-700)',
    '&:hover': { background: 'var(--crm-fill-red-800)', boxShadow: 'none' },
} as const;

function DeleteRole({ role, roles, onClose, onDeleted }: DeleteRoleDialogProps & { role: RoleDto }) {
    const { user } = useAuth();
    const remove = useDeleteRole();
    const [reassignTo, setReassignTo] = useState<number | ''>('');
    const [error, setError] = useState<string | null>(null);
    const holders = role.userCount + role.inactiveUserCount;
    // Only a Super Admin may hand out the Super Admin role.
    const targets = roles.filter((r) => r.id !== role.id && (!r.isSystem || user?.access?.superAdmin));
    const needsTarget = holders > 0;

    const confirm = async () => {
        if (needsTarget && reassignTo === '') {
            setError('Pick the role to move its users to.');
            return;
        }
        setError(null);
        try {
            const result = await remove.mutateAsync({ id: role.id, reassignTo: reassignTo === '' ? undefined : reassignTo });
            onDeleted(role, result);
        } catch (err) {
            setError(errorMessage(err, 'Could not delete the role.'));
        }
    };

    const people = (n: number) => `${n} ${n === 1 ? 'person' : 'people'}`;

    return (
        <Dialog
            open
            onClose={remove.isPending ? undefined : onClose}
            maxWidth="xs"
            fullWidth
            slotProps={{ paper: { sx: { borderRadius: '12px', m: { xs: 1.5, sm: 4 }, width: { xs: 'calc(100% - 24px)', sm: undefined } } } }}
        >
            <DialogTitle sx={{ fontWeight: 700, fontSize: '1rem', color: 'var(--crm-slate-900)' }}>Delete “{role.name}”?</DialogTitle>
            <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                {needsTarget ? (
                    <>
                        <Typography sx={{ fontSize: '0.85rem', color: 'var(--crm-slate-600)' }}>
                            {people(holders)} {holders === 1 ? 'has' : 'have'} this role
                            {role.inactiveUserCount > 0 ? ` (${role.inactiveUserCount} inactive)` : ''}. Pick the role they move to.
                        </Typography>
                        <TextField
                            select
                            size="small"
                            label="Move users to"
                            value={reassignTo}
                            onChange={(e) => {
                                setReassignTo(e.target.value === '' ? '' : Number(e.target.value));
                                setError(null);
                            }}
                            disabled={remove.isPending}
                            sx={inputSx}
                        >
                            {targets.map((r) => (
                                <MenuItem key={r.id} value={r.id} sx={{ fontSize: '0.85rem' }}>
                                    {r.name}
                                </MenuItem>
                            ))}
                        </TextField>
                    </>
                ) : (
                    <Typography sx={{ fontSize: '0.85rem', color: 'var(--crm-slate-600)' }}>Nobody has this role. It can be added again later.</Typography>
                )}
                <Box sx={{ fontSize: '0.78rem', color: 'var(--mui-palette-text-secondary)' }}>The change is recorded in Admin › Audit Log.</Box>
                {error && (
                    <Alert severity="error" sx={{ fontSize: '0.8rem' }}>
                        {error}
                    </Alert>
                )}
            </DialogContent>
            <DialogActions sx={{ px: 3, pb: 2 }}>
                <Button variant="outlined" sx={secondaryButtonSx} onClick={onClose} disabled={remove.isPending}>
                    Cancel
                </Button>
                <Button
                    variant="contained"
                    sx={dangerButtonSx}
                    onClick={() => void confirm()}
                    disabled={remove.isPending}
                    startIcon={remove.isPending ? <CircularProgress size={14} color="inherit" /> : undefined}
                >
                    {needsTarget ? 'Move users and delete' : 'Delete'}
                </Button>
            </DialogActions>
        </Dialog>
    );
}
