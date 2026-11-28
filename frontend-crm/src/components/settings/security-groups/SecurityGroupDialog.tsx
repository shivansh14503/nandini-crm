'use client';

import React, { useMemo, useState } from 'react';
import {
    Alert,
    Autocomplete,
    Box,
    Button,
    Chip,
    CircularProgress,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    MenuItem,
    TextField,
    Typography,
    useMediaQuery,
    useTheme,
} from '@mui/material';
import { errorMessage, inputSx, primaryButtonSx, secondaryButtonSx } from '@/components/settings/form-customization/builderUi';
import { apiFieldErrors } from '@/components/settings/users/userAdminUi';
import { LongTextInput } from '@/components/forms/LongTextInput';
import { useCreateSecurityGroup, useSecurityGroupUsers, useSetSecurityGroupMembers, useUpdateSecurityGroup } from '@/hooks/queries/useSecurityGroups';
import { SECURITY_GROUP_NAME_MAX_LENGTH, type SecurityGroupDto, type SecurityGroupUserOption } from '@/types/securityGroup.types';
import { descendantIdsOf } from './securityGroupTree';

export interface SecurityGroupDialogProps {
    open: boolean;
    /** The group to edit; null for a new group. */
    group: SecurityGroupDto | null;
    /** Parent a new group starts under ("Add sub-group"). */
    defaultParentId?: number | null;
    groups: SecurityGroupDto[];
    onClose: () => void;
    onSaved: (group: SecurityGroupDto, created: boolean) => void;
}

/** Mounts a fresh form each time it opens. */
export function SecurityGroupDialog(props: SecurityGroupDialogProps) {
    return props.open ? <SecurityGroupEditor {...props} /> : null;
}

const sameIds = (a: number[], b: number[]) => a.length === b.length && [...a].sort().join(',') === [...b].sort().join(',');

function SecurityGroupEditor({ open, group, defaultParentId, groups, onClose, onSaved }: SecurityGroupDialogProps) {
    const theme = useTheme();
    const phone = useMediaQuery(theme.breakpoints.down('sm'));
    const [name, setName] = useState(group?.name ?? '');
    const [description, setDescription] = useState(group?.description ?? '');
    const [parentId, setParentId] = useState<number | null>(group ? group.parentId : (defaultParentId ?? null));
    const [memberIds, setMemberIds] = useState<number[]>(() => group?.members.map((m) => m.id) ?? []);
    const [touched, setTouched] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
    const { data: users = [], isLoading: usersLoading } = useSecurityGroupUsers(open);
    const create = useCreateSecurityGroup();
    const update = useUpdateSecurityGroup();
    const setMembers = useSetSecurityGroupMembers();
    const saving = create.isPending || update.isPending || setMembers.isPending;

    // A group can't sit under itself or one of its own sub-groups.
    const parentOptions = useMemo(() => {
        const blocked = group ? new Set([group.id, ...descendantIdsOf(groups, group.id)]) : new Set<number>();
        return groups.filter((g) => !blocked.has(g.id));
    }, [group, groups]);

    // Members already in the group stay listed even if they were deactivated since; new picks are active users only.
    const userById = useMemo(() => new Map(users.map((u) => [u.id, u])), [users]);
    const selected = memberIds.map((id) => userById.get(id) ?? fallbackUser(group, id)).filter((u): u is SecurityGroupUserOption => Boolean(u));
    const options = users.filter((u) => u.isActive || memberIds.includes(u.id));

    const nameError = fieldErrors.name || (touched && !name.trim() ? 'Group Name is required.' : '');

    const save = async () => {
        setTouched(true);
        if (!name.trim()) return;
        setError(null);
        setFieldErrors({});
        const payload = { name: name.trim(), description: description.trim() || null, parentId };
        try {
            let saved: SecurityGroupDto;
            if (group) {
                saved = await update.mutateAsync({ id: group.id, payload });
                const before = group.members.map((m) => m.id);
                if (!sameIds(before, memberIds)) saved = await setMembers.mutateAsync({ id: group.id, memberIds });
            } else {
                saved = await create.mutateAsync({ ...payload, memberIds });
            }
            onSaved(saved, !group);
        } catch (err) {
            const fields = apiFieldErrors(err);
            setFieldErrors(fields);
            setError(fields.name || fields.parentId ? null : errorMessage(err, 'Could not save the group.'));
        }
    };

    return (
        <Dialog
            open={open}
            onClose={saving ? undefined : onClose}
            fullWidth
            maxWidth="sm"
            fullScreen={phone}
            slotProps={{ paper: { sx: { borderRadius: phone ? 0 : '12px' } } }}
        >
            <DialogTitle sx={{ fontWeight: 700, fontSize: '1rem', color: 'var(--crm-slate-900)' }}>{group ? 'Edit Group' : 'New Group'}</DialogTitle>
            <DialogContent dividers sx={{ display: 'flex', flexDirection: 'column', gap: 2, borderColor: 'var(--mui-palette-border-main)' }}>
                <Box
                    component="form"
                    onSubmit={(e) => {
                        e.preventDefault();
                        void save();
                    }}
                    sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'minmax(0, 1fr) minmax(0, 1fr)' } }}
                >
                    <TextField
                        label="Group Name"
                        required
                        size="small"
                        value={name}
                        onChange={(e) => {
                            setName(e.target.value);
                            setFieldErrors((f) => ({ ...f, name: '' }));
                        }}
                        onBlur={() => setTouched(true)}
                        error={Boolean(nameError)}
                        helperText={nameError || 'A team or branch, e.g. “Delhi Sales”.'}
                        disabled={saving}
                        slotProps={{ htmlInput: { maxLength: SECURITY_GROUP_NAME_MAX_LENGTH } }}
                        sx={inputSx}
                        autoFocus={!group}
                    />
                    <TextField
                        select
                        label="Parent Group"
                        size="small"
                        value={parentId ?? ''}
                        onChange={(e) => {
                            setParentId(e.target.value === '' ? null : Number(e.target.value));
                            setFieldErrors((f) => ({ ...f, parentId: '' }));
                        }}
                        error={Boolean(fieldErrors.parentId)}
                        helperText={fieldErrors.parentId || 'Its members also see this group’s records.'}
                        disabled={saving}
                        sx={inputSx}
                    >
                        <MenuItem value="" sx={{ fontSize: '0.85rem', color: 'var(--mui-palette-text-secondary)' }}>
                            None (top level)
                        </MenuItem>
                        {parentOptions.map((g) => (
                            <MenuItem key={g.id} value={g.id} sx={{ fontSize: '0.85rem' }}>
                                {g.name}
                                {!g.isActive ? ' (archived)' : ''}
                            </MenuItem>
                        ))}
                    </TextField>
                    <Box sx={{ gridColumn: '1 / -1', minWidth: 0 }}>
                        <LongTextInput
                            label="Description"
                            inputLabel="Description"
                            name="description"
                            value={description}
                            onChange={setDescription}
                            error={fieldErrors.description || undefined}
                            helperText="Who is in this group and what it is for."
                            disabled={saving}
                            crmFieldStyle={false}
                            sx={inputSx}
                        />
                    </Box>
                    <button type="submit" hidden aria-hidden tabIndex={-1} />
                </Box>

                <Box sx={{ minWidth: 0 }}>
                    <Typography sx={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--crm-slate-900)', mb: 0.25 }}>Members</Typography>
                    <Typography sx={{ fontSize: '0.78rem', color: 'var(--mui-palette-text-secondary)', mb: 1 }}>
                        People with a role set to Group see each other’s records. A person can be in several groups.
                    </Typography>
                    <Autocomplete
                        multiple
                        size="small"
                        options={options}
                        value={selected}
                        loading={usersLoading}
                        disabled={saving}
                        disableCloseOnSelect
                        filterSelectedOptions
                        isOptionEqualToValue={(a, b) => a.id === b.id}
                        getOptionLabel={(u) => `${u.name} (${u.username})`}
                        onChange={(_e, next) => {
                            setMemberIds(next.map((u) => u.id));
                            setFieldErrors((f) => ({ ...f, memberIds: '' }));
                        }}
                        renderOption={(props, u) => {
                            const { key, ...rest } = props as React.HTMLAttributes<HTMLLIElement> & { key: React.Key };
                            return (
                                <Box component="li" key={key} {...rest} sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start !important', gap: 0.1 }}>
                                    <Typography sx={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--crm-slate-900)' }}>
                                        {u.name}
                                        {!u.isActive ? ' · inactive' : ''}
                                    </Typography>
                                    <Typography sx={{ fontSize: '0.74rem', color: 'var(--mui-palette-text-secondary)', overflowWrap: 'anywhere' }}>
                                        {u.username} · {u.role}
                                        {u.groups.length ? ` · in ${u.groups.join(', ')}` : ''}
                                    </Typography>
                                </Box>
                            );
                        }}
                        renderValue={(value, getItemProps) =>
                            value.map((u, index) => {
                                const { key, ...itemProps } = getItemProps({ index });
                                return (
                                    <Chip
                                        key={key}
                                        {...itemProps}
                                        size="small"
                                        label={u.name}
                                        title={`${u.username} · ${u.role}`}
                                        sx={{
                                            maxWidth: '100%',
                                            backgroundColor: 'var(--mui-palette-primary-soft)',
                                            border: '1px solid var(--mui-palette-primary-softBorder)',
                                            color: u.isActive ? 'var(--crm-text-blue-900)' : 'var(--mui-palette-text-muted)',
                                            fontWeight: 600,
                                        }}
                                    />
                                );
                            })
                        }
                        renderInput={(params) => (
                            <TextField
                                {...params}
                                placeholder={selected.length ? '' : 'Add people'}
                                error={Boolean(fieldErrors.memberIds)}
                                helperText={fieldErrors.memberIds || `${selected.length} ${selected.length === 1 ? 'member' : 'members'}`}
                                sx={inputSx}
                            />
                        )}
                    />
                </Box>

                {error && (
                    <Alert severity="error" sx={{ fontSize: '0.8rem' }}>
                        {error}
                    </Alert>
                )}
            </DialogContent>
            <DialogActions sx={{ px: 3, py: 1.5, flexWrap: 'wrap', gap: 1 }}>
                <Button variant="outlined" sx={secondaryButtonSx} onClick={onClose} disabled={saving}>
                    Cancel
                </Button>
                <Button
                    variant="contained"
                    sx={primaryButtonSx}
                    onClick={() => void save()}
                    disabled={saving}
                    startIcon={saving ? <CircularProgress size={14} color="inherit" /> : undefined}
                >
                    {group ? 'Save' : 'Create Group'}
                </Button>
            </DialogActions>
        </Dialog>
    );
}

/** A member the picker list doesn't hold (still loading): shown from the group's own member list. */
function fallbackUser(group: SecurityGroupDto | null, id: number): SecurityGroupUserOption | null {
    const m = group?.members.find((x) => x.id === id);
    return m ? { ...m, groups: [] } : null;
}
