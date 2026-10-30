'use client';

import React, { useState } from 'react';
import { Avatar, Box, Chip, IconButton, Tooltip, Typography } from '@mui/material';
import PersonOutlinedIcon from '@mui/icons-material/PersonOutlined';
import { useFormContext, useWatch, type FieldPath, type FieldValues, type PathValue } from 'react-hook-form';
import { FormField } from '../FormField';
import type { FieldSize } from '../fieldSizing';
import { UserLookupModal } from '@/components/common/lookup';
import { findCrmUser } from '@/services/masterData.store';
import { useMasterData } from '@/hooks/queries/useMasterData';
import { useFormMode } from '@/context/FormModeContext';

export interface RhfAssignedUserCardProps<T extends FieldValues> {
    name: FieldPath<T>;
    label?: string;
    required?: boolean;
    /** Outlined pill beside the change button (e.g. "Primary Rep"). Pass an empty string to hide it. */
    roleBadge?: string;
    hint?: string;
    /** Called with the picked username in addition to updating the form, for forms that mirror values elsewhere. */
    onValueChange?: (username: string) => void;
    /** Width token (default `md`): the card only holds an avatar, a truncating name, a badge and a button. */
    fieldSize?: FieldSize;
}

const getInitials = (name: string) => {
    const parts = name.replace(/[._-]+/g, ' ').trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '?';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};

/**
 * React Hook Form bound "assigned user" card: avatar, full name, role • department and a button that
 * opens the user directory. Stores the picked user's username. Must be rendered inside a `FormProvider`.
 */
export function RhfAssignedUserCard<T extends FieldValues>({
    name,
    label = 'Assigned to (Account Executive)',
    required = true,
    roleBadge = 'Primary Rep',
    hint,
    onValueChange,
    fieldSize = 'md',
}: RhfAssignedUserCardProps<T>) {
    const { control, setValue } = useFormContext<T>();
    const assignedUsername = (useWatch({ control, name }) as string | undefined) || '';
    const [lookupOpen, setLookupOpen] = useState(false);
    const isView = useFormMode().mode === 'view';
    // Re-renders once the user directory loads (API mode), so the card shows the person, not just the username.
    useMasterData();

    const user = findCrmUser(assignedUsername);
    const displayName = user?.name || assignedUsername || 'Unassigned';
    const subtitle = user
        ? `${user.role} • ${user.department}`
        : assignedUsername
          ? 'Not in user directory'
          : 'No user assigned';

    const handleSelect = (username: string) => {
        setValue(name, username as PathValue<T, FieldPath<T>>, { shouldDirty: true, shouldValidate: true });
        onValueChange?.(username);
    };

    return (
        <FormField
            name={name}
            label={label}
            required={required}
            hint={hint}
            viewValue={assignedUsername ? `${displayName} • ${subtitle}` : ''}
            size={fieldSize}
            sx={{ mb: 0 }}
        >
            <Box
                sx={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 1,
                    p: 1.5,
                    border: '1px solid #e2e8f0',
                    borderRadius: '8px',
                    backgroundColor: '#fff',
                    transition: 'border-color 0.15s ease',
                    '&:hover': { borderColor: '#cbd5e1' },
                }}
            >
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, minWidth: 0 }}>
                    <Avatar sx={{ width: 32, height: 32, fontSize: '0.78rem', fontWeight: 700, backgroundColor: '#1d4ed8', flexShrink: 0 }}>
                        {getInitials(displayName)}
                    </Avatar>
                    <Box sx={{ minWidth: 0 }}>
                        <Typography noWrap sx={{ fontSize: '0.84rem', fontWeight: 600, color: '#1e293b', lineHeight: 1.2 }}>
                            {displayName}
                        </Typography>
                        <Typography noWrap sx={{ fontSize: '0.72rem', color: '#64748b', mt: 0.2 }}>
                            {subtitle}
                        </Typography>
                    </Box>
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexShrink: 0 }}>
                    {roleBadge && (
                        <Chip
                            label={roleBadge}
                            size="small"
                            variant="outlined"
                            sx={{ fontSize: '0.7rem', height: 22, borderColor: '#cbd5e1', color: '#475569', backgroundColor: '#f8fafc', fontWeight: 500 }}
                        />
                    )}
                    {!isView && (
                        <Tooltip title="Change assigned user">
                            <IconButton
                                size="small"
                                aria-label="Change assigned user"
                                onClick={() => setLookupOpen(true)}
                                sx={{ color: '#64748b', width: 28, height: 28, '&:hover': { color: '#1d4ed8', backgroundColor: '#eff6ff' } }}
                            >
                                <PersonOutlinedIcon sx={{ fontSize: 18 }} />
                            </IconButton>
                        </Tooltip>
                    )}
                </Box>
            </Box>
            <UserLookupModal
                open={lookupOpen}
                onClose={() => setLookupOpen(false)}
                onSelect={(selected) => handleSelect(selected.username)}
                selectedValue={assignedUsername}
            />
        </FormField>
    );
}
