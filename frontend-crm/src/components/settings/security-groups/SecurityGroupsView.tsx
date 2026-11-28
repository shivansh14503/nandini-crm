'use client';

import React, { useMemo, useState } from 'react';
import NextLink from 'next/link';
import { Alert, Box, Button, IconButton, Link, Tooltip, Typography } from '@mui/material';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import ArchiveOutlinedIcon from '@mui/icons-material/ArchiveOutlined';
import UnarchiveOutlinedIcon from '@mui/icons-material/UnarchiveOutlined';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import GroupsOutlinedIcon from '@mui/icons-material/GroupsOutlined';
import PeopleOutlineRoundedIcon from '@mui/icons-material/PeopleOutlineRounded';
import SubdirectoryArrowRightRoundedIcon from '@mui/icons-material/SubdirectoryArrowRightRounded';
import { AppToast } from '@/components/common/AppToast';
import { Badge, ConfirmDeleteDialog, EmptyState, errorMessage, primaryButtonSx, surfaceSx } from '@/components/settings/form-customization/builderUi';
import { ROUTES } from '@/config/constants';
import { useDeleteSecurityGroup, useSecurityGroups, useUpdateSecurityGroup } from '@/hooks/queries/useSecurityGroups';
import type { SecurityGroupDto } from '@/types/securityGroup.types';
import { SecurityGroupDialog } from './SecurityGroupDialog';
import { flattenTree } from './securityGroupTree';

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

/** Members shown on a card before "+N more". */
const MEMBER_PREVIEW = 6;

type Toast = { open: boolean; message: string; severity: 'success' | 'error' };

/**
 * Admin › Security Groups: teams / branches, shown as a tree (sub-groups indented under their parent). Create, edit,
 * add sub-groups, archive / restore and delete groups, and pick their members. A role's "Group" level (Admin › Roles)
 * reads them.
 */
export function SecurityGroupsView() {
    const { data: groups = [], isLoading, error } = useSecurityGroups();
    const [editing, setEditing] = useState<{ group: SecurityGroupDto | null; parentId: number | null } | null>(null);
    const [deleting, setDeleting] = useState<SecurityGroupDto | null>(null);
    const [toast, setToast] = useState<Toast>({ open: false, message: '', severity: 'success' });
    const update = useUpdateSecurityGroup();
    const remove = useDeleteSecurityGroup();
    const tree = useMemo(() => flattenTree(groups), [groups]);
    const people = useMemo(() => new Set(groups.flatMap((g) => g.members.map((m) => m.id))).size, [groups]);

    const notify = (message: string, severity: Toast['severity'] = 'success') => setToast({ open: true, message, severity });

    const toggleArchive = async (group: SecurityGroupDto) => {
        try {
            await update.mutateAsync({ id: group.id, payload: { isActive: !group.isActive } });
            notify(group.isActive ? `“${group.name}” archived. Its members keep their own records only.` : `“${group.name}” restored.`);
        } catch (err) {
            notify(errorMessage(err, 'Could not change the group.'), 'error');
        }
    };

    const confirmDelete = async () => {
        if (!deleting) return;
        const group = deleting;
        try {
            await remove.mutateAsync(group.id);
            setDeleting(null);
            notify(`“${group.name}” deleted.`);
        } catch (err) {
            setDeleting(null);
            notify(errorMessage(err, 'Could not delete the group.'), 'error');
        }
    };

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
                    <GroupsOutlinedIcon />
                </Box>
                <Box sx={{ flex: '1 1 260px', minWidth: 0 }}>
                    <Typography component="h1" sx={{ fontWeight: 800, fontSize: { xs: '1.05rem', md: '1.2rem' }, color: 'var(--crm-slate-900)' }}>
                        Security Groups
                    </Typography>
                    <Typography sx={{ fontSize: '0.82rem', color: 'var(--mui-palette-text-secondary)' }}>
                        Teams and branches. Set a module to <b>Group</b> in{' '}
                        <Link component={NextLink} href={ROUTES.ADMIN_ROLES} sx={{ color: 'var(--crm-text-blue-700)', fontWeight: 600 }}>
                            Admin › Roles
                        </Link>{' '}
                        and people see the records of everyone in their groups. A parent group also sees its sub-groups’ records.
                    </Typography>
                </Box>
                <Button
                    variant="contained"
                    startIcon={<AddRoundedIcon />}
                    sx={{ ...primaryButtonSx, flexShrink: 0 }}
                    onClick={() => setEditing({ group: null, parentId: null })}
                >
                    New Group
                </Button>
            </Box>

            {error && <Alert severity="error">{errorMessage(error, 'Could not load the groups.')}</Alert>}

            {isLoading ? (
                <Box sx={{ ...surfaceSx, p: 3, color: 'var(--mui-palette-text-secondary)', fontSize: '0.85rem' }}>Loading groups…</Box>
            ) : groups.length === 0 && !error ? (
                <Box sx={surfaceSx}>
                    <EmptyState
                        title="No groups yet"
                        description="Add a group for each team or branch, then give a role the Group level so its people see their team’s records."
                        icon={<GroupsOutlinedIcon />}
                    />
                </Box>
            ) : (
                <>
                    <Typography sx={{ fontSize: '0.78rem', color: 'var(--mui-palette-text-secondary)' }}>
                        {groups.length} {groups.length === 1 ? 'group' : 'groups'} · {people} {people === 1 ? 'person' : 'people'} in a group
                    </Typography>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25, minWidth: 0 }}>
                        {tree.map(({ group, depth }) => (
                            <GroupCard
                                key={group.id}
                                group={group}
                                depth={depth}
                                busy={update.isPending}
                                onEdit={() => setEditing({ group, parentId: group.parentId })}
                                onAddSubGroup={() => setEditing({ group: null, parentId: group.id })}
                                onToggleArchive={() => void toggleArchive(group)}
                                onDelete={() => setDeleting(group)}
                            />
                        ))}
                    </Box>
                </>
            )}

            <SecurityGroupDialog
                open={Boolean(editing)}
                group={editing?.group ?? null}
                defaultParentId={editing?.parentId ?? null}
                groups={groups}
                onClose={() => setEditing(null)}
                onSaved={(group, created) => {
                    setEditing(null);
                    notify(created ? `Group “${group.name}” created.` : `Group “${group.name}” saved.`);
                }}
            />
            <ConfirmDeleteDialog
                open={Boolean(deleting)}
                title={`Delete “${deleting?.name ?? ''}”?`}
                confirmDisabled={remove.isPending}
                onConfirm={() => void confirmDelete()}
                onClose={() => setDeleting(null)}
            >
                {deleting && deleting.subGroupCount > 0 ? (
                    <span>
                        {deleting.subGroupCount} {deleting.subGroupCount === 1 ? 'group sits' : 'groups sit'} under this one. Move or delete{' '}
                        {deleting.subGroupCount === 1 ? 'it' : 'them'} first.
                    </span>
                ) : (
                    <span>
                        Its {deleting?.members.length ?? 0} {deleting?.members.length === 1 ? 'member loses' : 'members lose'} the records they saw through it.
                        Records stay with their owners. To keep the group for later, archive it instead.
                    </span>
                )}
                <span style={{ fontSize: '0.78rem' }}>The change is recorded in Admin › Audit Log.</span>
            </ConfirmDeleteDialog>
            <AppToast open={toast.open} message={toast.message} severity={toast.severity} onClose={() => setToast((t) => ({ ...t, open: false }))} />
        </Box>
    );
}

interface GroupCardProps {
    group: SecurityGroupDto;
    depth: number;
    busy: boolean;
    onEdit: () => void;
    onAddSubGroup: () => void;
    onToggleArchive: () => void;
    onDelete: () => void;
}

function GroupCard({ group, depth, busy, onEdit, onAddSubGroup, onToggleArchive, onDelete }: GroupCardProps) {
    const shown = group.members.slice(0, MEMBER_PREVIEW);
    const more = group.members.length - shown.length;
    // Indent sub-groups, less on phones so deep trees still fit.
    const indent = Math.min(depth, 6);
    return (
        <Box
            sx={{
                ...surfaceSx,
                ml: { xs: indent * 1.5, md: indent * 4 },
                p: { xs: 1.5, md: 2 },
                display: 'flex',
                flexDirection: { xs: 'column', md: 'row' },
                alignItems: { xs: 'stretch', md: 'center' },
                gap: { xs: 1.25, md: 2 },
                minWidth: 0,
                opacity: group.isActive ? 1 : 0.75,
            }}
        >
            <Box sx={{ flex: '1 1 auto', minWidth: 0 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap', minWidth: 0 }}>
                    {depth > 0 && <SubdirectoryArrowRightRoundedIcon sx={{ fontSize: 18, color: 'var(--mui-palette-text-muted)', flexShrink: 0 }} />}
                    <Typography
                        component="button"
                        type="button"
                        onClick={onEdit}
                        sx={{
                            p: 0,
                            border: 0,
                            background: 'none',
                            cursor: 'pointer',
                            textAlign: 'left',
                            fontWeight: 700,
                            fontSize: '0.95rem',
                            color: 'var(--crm-slate-900)',
                            overflowWrap: 'anywhere',
                            minWidth: 0,
                            '&:hover': { color: 'var(--crm-text-blue-700)', textDecoration: 'underline' },
                        }}
                    >
                        {group.name}
                    </Typography>
                    {!group.isActive && <Badge tone="neutral">Archived</Badge>}
                    {group.parentName && (
                        <Typography component="span" sx={{ fontSize: '0.75rem', color: 'var(--mui-palette-text-secondary)' }}>
                            under {group.parentName}
                        </Typography>
                    )}
                </Box>
                {group.description && (
                    <Typography
                        sx={{
                            mt: 0.25,
                            fontSize: '0.8rem',
                            color: 'var(--mui-palette-text-secondary)',
                            display: '-webkit-box',
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: 'vertical',
                            overflow: 'hidden',
                            overflowWrap: 'anywhere',
                        }}
                    >
                        {group.description}
                    </Typography>
                )}
                <Box sx={{ mt: 0.75, display: 'flex', alignItems: 'center', gap: 0.5, flexWrap: 'wrap' }}>
                    <PeopleOutlineRoundedIcon sx={{ fontSize: 16, color: 'var(--mui-palette-text-muted)' }} />
                    {group.members.length === 0 ? (
                        <Typography component="span" sx={{ fontSize: '0.78rem', color: 'var(--mui-palette-text-muted)' }}>
                            No members yet
                        </Typography>
                    ) : (
                        <>
                            {shown.map((m) => (
                                <Box
                                    key={m.id}
                                    component="span"
                                    title={`${m.username} · ${m.role}${m.isActive ? '' : ' · inactive'}`}
                                    sx={{
                                        px: 0.9,
                                        py: 0.15,
                                        borderRadius: '999px',
                                        fontSize: '0.74rem',
                                        fontWeight: 600,
                                        maxWidth: '100%',
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                        whiteSpace: 'nowrap',
                                        color: m.isActive ? 'var(--crm-slate-700)' : 'var(--mui-palette-text-muted)',
                                        backgroundColor: 'var(--mui-palette-background-subtle)',
                                        border: '1px solid var(--mui-palette-border-main)',
                                        textDecoration: m.isActive ? 'none' : 'line-through',
                                    }}
                                >
                                    {m.name}
                                </Box>
                            ))}
                            {more > 0 && (
                                <Typography component="span" sx={{ fontSize: '0.76rem', color: 'var(--mui-palette-text-secondary)', fontWeight: 600 }}>
                                    +{more} more
                                </Typography>
                            )}
                        </>
                    )}
                </Box>
            </Box>

            <Box sx={{ display: 'flex', gap: 0.75, flexShrink: 0, flexWrap: 'wrap' }}>
                <Tooltip title="Edit name, parent and members" arrow>
                    <IconButton aria-label={`Edit ${group.name}`} sx={iconButtonSx} onClick={onEdit}>
                        <EditOutlinedIcon sx={{ fontSize: 18 }} />
                    </IconButton>
                </Tooltip>
                <Tooltip title="Add a sub-group" arrow>
                    <IconButton aria-label={`Add a sub-group under ${group.name}`} sx={iconButtonSx} onClick={onAddSubGroup}>
                        <AddRoundedIcon sx={{ fontSize: 18 }} />
                    </IconButton>
                </Tooltip>
                <Tooltip title={group.isActive ? 'Archive (keeps members, grants nothing)' : 'Restore'} arrow>
                    <span>
                        <IconButton aria-label={group.isActive ? `Archive ${group.name}` : `Restore ${group.name}`} sx={iconButtonSx} onClick={onToggleArchive} disabled={busy}>
                            {group.isActive ? <ArchiveOutlinedIcon sx={{ fontSize: 18 }} /> : <UnarchiveOutlinedIcon sx={{ fontSize: 18 }} />}
                        </IconButton>
                    </span>
                </Tooltip>
                <Tooltip title="Delete" arrow>
                    <IconButton aria-label={`Delete ${group.name}`} sx={dangerIconButtonSx} onClick={onDelete}>
                        <DeleteOutlineRoundedIcon sx={{ fontSize: 18 }} />
                    </IconButton>
                </Tooltip>
            </Box>
        </Box>
    );
}
