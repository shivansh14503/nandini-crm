'use client';

import React, { useMemo, useState } from 'react';
import { Alert, Box, Button, IconButton, Tooltip, Typography } from '@mui/material';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import AccountTreeOutlinedIcon from '@mui/icons-material/AccountTreeOutlined';
import ContentCopyOutlinedIcon from '@mui/icons-material/ContentCopyOutlined';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import PeopleOutlineRoundedIcon from '@mui/icons-material/PeopleOutlineRounded';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import { AppToast } from '@/components/common/AppToast';
import { EmptyState, errorMessage, primaryButtonSx, surfaceSx } from '@/components/settings/form-customization/builderUi';
import { RoleAccessBadges } from '@/components/settings/users/userAdminUi';
import { useRoles } from '@/hooks/queries/useRoles';
import type { RoleDto, RolePayload } from '@/types/role.types';
import { PERMISSION_MODULES, levelOf } from '@/utils/permissions';
import { ROLE_NAME_MAX_LENGTH } from '@/utils/roleAccess';
import { DeleteRoleDialog } from './DeleteRoleDialog';
import { RoleEditorDialog } from './RoleEditorDialog';

const iconButtonSx = {
    width: 34,
    height: 34,
    borderRadius: '8px',
    border: '1px solid var(--mui-palette-border-main)',
    color: 'var(--mui-palette-text-secondary)',
    backgroundColor: 'var(--mui-palette-background-paper)',
    transition: 'all 0.15s ease',
    '&:hover': { borderColor: 'var(--crm-blue-300)', backgroundColor: 'var(--mui-palette-primary-soft)', color: 'var(--crm-text-blue-700)' },
} as const;

const dangerIconButtonSx = {
    ...iconButtonSx,
    '&:hover': { color: 'var(--mui-palette-error-main)', backgroundColor: 'var(--mui-palette-error-soft)', borderColor: 'var(--mui-palette-error-softBorder)' },
} as const;

type Toast = { open: boolean; message: string; severity: 'success' | 'error' };

/** "Copy of Sales" for a duplicate, kept within the name limit. */
function copyName(name: string, roles: RoleDto[]): string {
    const taken = new Set(roles.map((r) => r.name.toLowerCase()));
    for (let n = 1; n < 100; n++) {
        const candidate = `Copy of ${name}${n > 1 ? ` ${n}` : ''}`.slice(0, ROLE_NAME_MAX_LENGTH);
        if (!taken.has(candidate.toLowerCase())) return candidate;
    }
    return `Copy of ${name}`.slice(0, ROLE_NAME_MAX_LENGTH);
}

/** Modules the role can open, as a count line ("9 of 12 modules"). */
function visibleModules(role: RoleDto): number {
    return PERMISSION_MODULES.filter((m) => levelOf(role.permissions, m.key, 'view') !== 'none').length;
}

/** Admin › Roles: every role as a card; create, edit, duplicate and delete (moving the role's users to another). */
export function RolesView() {
    const { data: roles = [], isLoading, error } = useRoles();
    const [editing, setEditing] = useState<{ role: RoleDto | null; template: RolePayload | null } | null>(null);
    const [deleting, setDeleting] = useState<RoleDto | null>(null);
    const [toast, setToast] = useState<Toast>({ open: false, message: '', severity: 'success' });
    const totalUsers = useMemo(() => roles.reduce((sum, r) => sum + r.userCount, 0), [roles]);

    const duplicate = (role: RoleDto) =>
        setEditing({
            role: null,
            template: { name: copyName(role.name, roles), description: role.description, adminPanel: role.isSystem ? true : role.adminPanel, permissions: role.permissions },
        });

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
            <Box sx={{ ...surfaceSx, p: { xs: 2, md: 2.5 }, display: 'flex', alignItems: { xs: 'flex-start', sm: 'center' }, gap: 2, flexWrap: 'wrap' }}>
                <Box
                    sx={{
                        width: 44,
                        height: 44,
                        borderRadius: '10px',
                        flexShrink: 0,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: 'var(--crm-text-blue-600)',
                        backgroundColor: 'var(--mui-palette-primary-soft)',
                        border: '1px solid var(--mui-palette-primary-softBorder)',
                    }}
                >
                    <AccountTreeOutlinedIcon />
                </Box>
                <Box sx={{ flex: '1 1 260px', minWidth: 0 }}>
                    <Typography component="h1" sx={{ fontWeight: 800, fontSize: { xs: '1.05rem', md: '1.2rem' }, color: 'var(--crm-slate-900)' }}>
                        Roles
                    </Typography>
                    <Typography sx={{ fontSize: '0.82rem', color: 'var(--mui-palette-text-secondary)' }}>
                        What each role may view, create, edit, delete, export and import in every module, for all records or only their own. Pick a
                        person’s role in Admin › Users.
                    </Typography>
                </Box>
                <Button
                    variant="contained"
                    startIcon={<AddRoundedIcon />}
                    sx={{ ...primaryButtonSx, flexShrink: 0 }}
                    onClick={() => setEditing({ role: null, template: null })}
                >
                    New Role
                </Button>
            </Box>

            {error && <Alert severity="error">{errorMessage(error, 'Could not load the roles.')}</Alert>}

            {isLoading ? (
                <Box sx={{ ...surfaceSx, p: 3, color: 'var(--mui-palette-text-secondary)', fontSize: '0.85rem' }}>Loading roles…</Box>
            ) : roles.length === 0 && !error ? (
                <Box sx={surfaceSx}>
                    <EmptyState title="No roles yet" description="Add a role to decide what people can do in each module." icon={<AccountTreeOutlinedIcon />} />
                </Box>
            ) : (
                <>
                    <Typography sx={{ fontSize: '0.78rem', color: 'var(--mui-palette-text-secondary)' }}>
                        {roles.length} {roles.length === 1 ? 'role' : 'roles'} · {totalUsers} active {totalUsers === 1 ? 'person' : 'people'}
                    </Typography>
                    <Box sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 280px), 1fr))' }}>
                        {roles.map((role) => (
                            <RoleCard
                                key={role.id}
                                role={role}
                                onOpen={() => setEditing({ role, template: null })}
                                onDuplicate={() => duplicate(role)}
                                onDelete={() => setDeleting(role)}
                            />
                        ))}
                    </Box>
                </>
            )}

            <RoleEditorDialog
                open={Boolean(editing)}
                role={editing?.role ?? null}
                template={editing?.template}
                onClose={() => setEditing(null)}
                onSaved={(role, created) => {
                    setEditing(null);
                    setToast({ open: true, severity: 'success', message: created ? `Role “${role.name}” created.` : `Role “${role.name}” saved.` });
                }}
            />
            <DeleteRoleDialog
                role={deleting}
                roles={roles}
                onClose={() => setDeleting(null)}
                onDeleted={(role, result) => {
                    setDeleting(null);
                    setToast({
                        open: true,
                        severity: 'success',
                        message: result.movedUsers > 0 ? `Role “${role.name}” deleted; ${result.movedUsers} moved to the new role.` : `Role “${role.name}” deleted.`,
                    });
                }}
            />
            <AppToast open={toast.open} message={toast.message} severity={toast.severity} onClose={() => setToast((t) => ({ ...t, open: false }))} />
        </Box>
    );
}

function RoleCard({ role, onOpen, onDuplicate, onDelete }: { role: RoleDto; onOpen: () => void; onDuplicate: () => void; onDelete: () => void }) {
    const modules = visibleModules(role);
    return (
        <Box sx={{ ...surfaceSx, p: 2, display: 'flex', flexDirection: 'column', gap: 1.25, minWidth: 0 }}>
            <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, minWidth: 0 }}>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, minWidth: 0 }}>
                        {role.isSystem && (
                            <Tooltip title="Built in: full access, can’t be changed or deleted." arrow>
                                <LockOutlinedIcon sx={{ fontSize: 16, color: 'var(--mui-palette-text-muted)', flexShrink: 0 }} />
                            </Tooltip>
                        )}
                        <Typography
                            component="button"
                            type="button"
                            onClick={onOpen}
                            sx={{
                                p: 0,
                                border: 0,
                                background: 'none',
                                cursor: 'pointer',
                                textAlign: 'left',
                                fontWeight: 700,
                                fontSize: '0.95rem',
                                color: 'var(--crm-slate-900)',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                                minWidth: 0,
                                '&:hover': { color: 'var(--crm-text-blue-700)', textDecoration: 'underline' },
                            }}
                        >
                            {role.name}
                        </Typography>
                    </Box>
                    <Box sx={{ mt: 0.5 }}>
                        <RoleAccessBadges access={role.access} />
                    </Box>
                </Box>
            </Box>

            <Typography
                sx={{
                    fontSize: '0.8rem',
                    color: role.description ? 'var(--mui-palette-text-secondary)' : 'var(--mui-palette-text-muted)',
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                    minHeight: '2.4em',
                    wordBreak: 'break-word',
                }}
            >
                {role.description || 'No description.'}
            </Typography>

            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5, fontSize: '0.76rem', color: 'var(--crm-slate-600)' }}>
                <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
                    <PeopleOutlineRoundedIcon sx={{ fontSize: 16, color: 'var(--mui-palette-text-muted)' }} />
                    {role.userCount} active{role.inactiveUserCount > 0 ? ` · ${role.inactiveUserCount} inactive` : ''}
                </Box>
                <Box component="span">
                    {modules} of {PERMISSION_MODULES.length} modules
                </Box>
            </Box>

            <Box sx={{ display: 'flex', gap: 0.75, mt: 'auto', pt: 0.5 }}>
                <Tooltip title={role.isSystem ? 'View' : 'Edit'} arrow>
                    <IconButton aria-label={role.isSystem ? `View ${role.name}` : `Edit ${role.name}`} sx={iconButtonSx} onClick={onOpen}>
                        {role.isSystem ? <VisibilityOutlinedIcon sx={{ fontSize: 18 }} /> : <EditOutlinedIcon sx={{ fontSize: 18 }} />}
                    </IconButton>
                </Tooltip>
                <Tooltip title="Duplicate" arrow>
                    <IconButton aria-label={`Duplicate ${role.name}`} sx={iconButtonSx} onClick={onDuplicate}>
                        <ContentCopyOutlinedIcon sx={{ fontSize: 17 }} />
                    </IconButton>
                </Tooltip>
                {!role.isSystem && (
                    <Tooltip title="Delete" arrow>
                        <IconButton aria-label={`Delete ${role.name}`} sx={dangerIconButtonSx} onClick={onDelete}>
                            <DeleteOutlineRoundedIcon sx={{ fontSize: 18 }} />
                        </IconButton>
                    </Tooltip>
                )}
            </Box>
        </Box>
    );
}
