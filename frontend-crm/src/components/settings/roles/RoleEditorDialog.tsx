'use client';

import React, { useState } from 'react';
import { Alert, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Switch, TextField, Typography, useMediaQuery, useTheme } from '@mui/material';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import { errorMessage, inputSx, primaryButtonSx, secondaryButtonSx } from '@/components/settings/form-customization/builderUi';
import { apiFieldErrors } from '@/components/settings/users/userAdminUi';
import { useCreateRole, useUpdateRole } from '@/hooks/queries/useRoles';
import { type RoleDto, type RolePayload } from '@/types/role.types';
import { LongTextInput } from '@/components/forms/LongTextInput';
import { OWN_RECORDS_PERMISSIONS, normalizePermissions } from '@/utils/permissions';
import { ROLE_NAME_MAX_LENGTH } from '@/utils/roleAccess';
import { PermissionGrid } from './PermissionGrid';

export interface RoleEditorDialogProps {
    open: boolean;
    /** The role to edit; null for a new role. */
    role: RoleDto | null;
    /** Values a new role starts from (Duplicate). */
    template?: RolePayload | null;
    onClose: () => void;
    onSaved: (role: RoleDto, created: boolean) => void;
}

/** Mounts a fresh form each time it opens. */
export function RoleEditorDialog(props: RoleEditorDialogProps) {
    return props.open ? <RoleEditor {...props} /> : null;
}

function initialValues(role: RoleDto | null, template?: RolePayload | null): RolePayload {
    if (role) return { name: role.name, description: role.description, adminPanel: role.adminPanel, permissions: normalizePermissions(role.permissions) };
    if (template) return { ...template, permissions: normalizePermissions(template.permissions) };
    return { name: '', description: null, adminPanel: false, permissions: OWN_RECORDS_PERMISSIONS };
}

function RoleEditor({ open, role, template, onClose, onSaved }: RoleEditorDialogProps) {
    const theme = useTheme();
    const phone = useMediaQuery(theme.breakpoints.down('sm'));
    const readOnly = Boolean(role?.isSystem);
    const [values, setValues] = useState<RolePayload>(() => initialValues(role, template));
    const [touched, setTouched] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
    const create = useCreateRole();
    const update = useUpdateRole();
    const saving = create.isPending || update.isPending;

    const set = <K extends keyof RolePayload>(key: K, value: RolePayload[K]) => {
        setValues((v) => ({ ...v, [key]: value }));
        setFieldErrors((e) => (e[key] ? { ...e, [key]: '' } : e));
    };

    const nameError = fieldErrors.name || (touched && !values.name.trim() ? 'Role Name is required.' : '');

    const save = async () => {
        setTouched(true);
        if (readOnly || !values.name.trim()) return;
        setError(null);
        setFieldErrors({});
        const payload: RolePayload = { ...values, name: values.name.trim(), description: values.description?.trim() || null };
        try {
            const saved = role ? await update.mutateAsync({ id: role.id, payload }) : await create.mutateAsync(payload);
            onSaved(saved, !role);
        } catch (err) {
            const fields = apiFieldErrors(err);
            setFieldErrors(fields);
            setError(fields.name || fields.description ? null : errorMessage(err, 'Could not save the role.'));
        }
    };

    const title = readOnly ? role!.name : role ? 'Edit Role' : 'New Role';

    return (
        <Dialog
            open={open}
            onClose={saving ? undefined : onClose}
            fullWidth
            maxWidth="lg"
            fullScreen={phone}
            slotProps={{ paper: { sx: { borderRadius: phone ? 0 : '12px' } } }}
        >
            <DialogTitle sx={{ fontWeight: 700, fontSize: '1rem', color: 'var(--crm-slate-900)', display: 'flex', alignItems: 'center', gap: 1 }}>
                {readOnly && <LockOutlinedIcon sx={{ fontSize: 18, color: 'var(--mui-palette-text-muted)' }} />}
                {title}
            </DialogTitle>
            <DialogContent dividers sx={{ display: 'flex', flexDirection: 'column', gap: 2, borderColor: 'var(--mui-palette-border-main)' }}>
                {readOnly && (
                    <Alert severity="info" sx={{ fontSize: '0.8rem' }}>
                        Super Admin always has full access to every module and the admin panel. It can’t be changed, renamed or deleted.
                    </Alert>
                )}
                <Box
                    component="form"
                    onSubmit={(e) => {
                        e.preventDefault();
                        void save();
                    }}
                    sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'minmax(0, 1fr) minmax(0, 2fr)' } }}
                >
                    <TextField
                        label="Role Name"
                        required
                        size="small"
                        value={values.name}
                        onChange={(e) => set('name', e.target.value)}
                        onBlur={() => setTouched(true)}
                        error={Boolean(nameError)}
                        helperText={nameError || ' '}
                        disabled={readOnly || saving}
                        slotProps={{ htmlInput: { maxLength: ROLE_NAME_MAX_LENGTH } }}
                        sx={inputSx}
                        autoFocus={!role}
                    />
                    <LongTextInput
                        label="Description"
                        inputLabel="Description"
                        name="description"
                        value={values.description ?? ''}
                        onChange={(v) => set('description', v)}
                        error={fieldErrors.description || undefined}
                        helperText="What the role is for, shown on the role card."
                        disabled={readOnly || saving}
                        crmFieldStyle={false}
                        sx={inputSx}
                    />
                    <button type="submit" hidden aria-hidden tabIndex={-1} />
                </Box>

                <Box
                    sx={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: 1.5,
                        p: 1.5,
                        borderRadius: '10px',
                        border: '1px solid var(--mui-palette-border-main)',
                        backgroundColor: 'var(--mui-palette-background-subtle)',
                    }}
                >
                    <Switch
                        checked={readOnly || values.adminPanel}
                        onChange={(e) => set('adminPanel', e.target.checked)}
                        disabled={readOnly || saving}
                        slotProps={{ input: { 'aria-label': 'Admin panel' } }}
                    />
                    <Box sx={{ minWidth: 0 }}>
                        <Typography sx={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--crm-slate-900)' }}>Admin panel</Typography>
                        <Typography sx={{ fontSize: '0.78rem', color: 'var(--mui-palette-text-secondary)' }}>
                            Opens Admin: users, roles, forms and dropdowns, PDF templates, the audit log and the other settings. Record access still
                            follows the permissions below.
                        </Typography>
                        {fieldErrors.adminPanel && <Typography sx={{ fontSize: '0.76rem', color: 'var(--mui-palette-error-main)', mt: 0.5 }}>{fieldErrors.adminPanel}</Typography>}
                    </Box>
                </Box>

                <Box>
                    <Typography sx={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--crm-slate-900)', mb: 0.25 }}>Module permissions</Typography>
                    <Typography sx={{ fontSize: '0.78rem', color: 'var(--mui-palette-text-secondary)', mb: 1.25 }}>
                        All: every record. Group: records of anyone in the user’s security groups. Own: records the user is assigned to or created.
                        Edit and Delete can’t go beyond View, and a module set to View None is hidden from the menu.
                    </Typography>
                    <PermissionGrid value={values.permissions} onChange={(permissions) => set('permissions', permissions)} disabled={readOnly || saving} />
                    {fieldErrors.permissions && <Typography sx={{ fontSize: '0.76rem', color: 'var(--mui-palette-error-main)', mt: 0.75 }}>{fieldErrors.permissions}</Typography>}
                </Box>

                {error && (
                    <Alert severity="error" sx={{ fontSize: '0.8rem' }}>
                        {error}
                    </Alert>
                )}
            </DialogContent>
            <DialogActions sx={{ px: 3, py: 1.5, flexWrap: 'wrap', gap: 1 }}>
                <Button variant="outlined" sx={secondaryButtonSx} onClick={onClose} disabled={saving}>
                    {readOnly ? 'Close' : 'Cancel'}
                </Button>
                {!readOnly && (
                    <Button
                        variant="contained"
                        sx={primaryButtonSx}
                        onClick={() => void save()}
                        disabled={saving}
                        startIcon={saving ? <CircularProgress size={14} color="inherit" /> : undefined}
                    >
                        {role ? 'Save' : 'Create Role'}
                    </Button>
                )}
            </DialogActions>
        </Dialog>
    );
}
