'use client';

import React, { useRef, useState } from 'react';
import { Box, Button, IconButton, Tooltip, Typography } from '@mui/material';
import PhotoCameraOutlinedIcon from '@mui/icons-material/PhotoCameraOutlined';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import { UserAvatar } from '@/components/common/UserAvatar';
import { ConfirmDeleteDialog, errorMessage, surfaceSx } from '@/components/settings/form-customization/builderUi';
import { useRemovePhoto, useUploadPhoto } from '@/hooks/queries/useProfile';
import type { ProfileDto } from '@/types/profile.types';
import { formatDateTime } from '@/utils/date';
import { PHOTO_ACCEPT, PhotoCropDialog, photoFileIssue } from './PhotoCropDialog';
import type { Notify } from './ProfileView';
import { relativeInSentence } from './profileUi';

const AVATAR_SIZE = 88;

/** Top card of My Profile: photo (change / remove), name, role, department, username and last sign-in. */
export function ProfileHeaderCard({ profile, notify }: { profile: ProfileDto; notify: Notify }) {
    const inputRef = useRef<HTMLInputElement | null>(null);
    const [cropFile, setCropFile] = useState<File | null>(null);
    const [confirmRemove, setConfirmRemove] = useState(false);
    const uploadPhoto = useUploadPhoto();
    const removePhoto = useRemovePhoto();

    const name = profile.fullName.trim() || profile.username;
    const hasPhoto = Boolean(profile.photoUrl);

    const pickPhoto = () => inputRef.current?.click();

    const onFilePicked = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file) return;
        const issue = photoFileIssue(file);
        if (issue) {
            notify(issue, 'error');
            return;
        }
        setCropFile(file);
    };

    const savePhoto = async (blob: Blob) => {
        await uploadPhoto.mutateAsync({ blob, fileName: cropFile?.name });
        setCropFile(null);
        notify('Profile photo updated.');
    };

    const confirmRemovePhoto = async () => {
        setConfirmRemove(false);
        try {
            await removePhoto.mutateAsync();
            notify('Profile photo removed.');
        } catch (err) {
            notify(errorMessage(err, 'Could not remove the photo.'), 'error');
        }
    };

    const subtitle = [profile.role, profile.department].filter(Boolean).join(' · ');

    return (
        <Box
            sx={{
                ...surfaceSx,
                p: { xs: 2, md: 2.5 },
                display: 'flex',
                flexDirection: { xs: 'column', sm: 'row' },
                alignItems: { xs: 'center', sm: 'center' },
                textAlign: { xs: 'center', sm: 'left' },
                gap: { xs: 1.5, sm: 2.5 },
                minWidth: 0,
            }}
        >
            {/* Photo with a camera button to change it */}
            <Box sx={{ position: 'relative', flexShrink: 0 }}>
                <UserAvatar
                    name={name}
                    photoUrl={profile.photoUrl}
                    size={AVATAR_SIZE}
                    sx={{ boxShadow: '0 4px 14px rgb(var(--crm-accent-rgb) / 0.22)', border: '3px solid var(--mui-palette-background-paper)' }}
                />
                <Tooltip title={hasPhoto ? 'Change photo' : 'Add a photo'} arrow>
                    <IconButton
                        aria-label={hasPhoto ? 'Change profile photo' : 'Add a profile photo'}
                        onClick={pickPhoto}
                        disabled={uploadPhoto.isPending}
                        sx={{
                            position: 'absolute',
                            right: -6,
                            bottom: -6,
                            width: 40,
                            height: 40,
                            color: '#ffffff',
                            backgroundColor: 'var(--crm-fill-blue-600)',
                            border: '3px solid var(--mui-palette-background-paper)',
                            boxShadow: '0 2px 8px rgb(var(--crm-accent-rgb) / 0.28)',
                            transition: 'background-color 0.15s ease',
                            '&:hover': { backgroundColor: 'var(--crm-fill-blue-700)' },
                            '&.Mui-focusVisible': { boxShadow: '0 0 0 3px rgb(var(--crm-accent-rgb) / 0.32)' },
                            '&.Mui-disabled': { color: '#ffffff', backgroundColor: 'var(--crm-fill-blue-600)', opacity: 0.7 },
                        }}
                    >
                        <PhotoCameraOutlinedIcon sx={{ fontSize: 18 }} />
                    </IconButton>
                </Tooltip>
                <input ref={inputRef} type="file" accept={PHOTO_ACCEPT} hidden onChange={onFilePicked} />
            </Box>

            {/* Identity */}
            <Box sx={{ minWidth: 0, flex: 1, width: { xs: '100%', sm: 'auto' } }}>
                <Typography
                    component="h1"
                    sx={{ fontWeight: 700, fontSize: { xs: '1.15rem', md: '1.3rem' }, color: 'var(--crm-slate-900)', lineHeight: 1.3, overflowWrap: 'anywhere' }}
                >
                    {name}
                </Typography>
                {subtitle && (
                    <Typography sx={{ fontSize: '0.85rem', color: 'var(--mui-palette-text-secondary)', mt: 0.25, overflowWrap: 'anywhere' }}>{subtitle}</Typography>
                )}
                <Typography sx={{ fontSize: '0.8rem', color: 'var(--mui-palette-text-muted)', mt: 0.5, overflowWrap: 'anywhere' }}>
                    @{profile.username}
                    {profile.lastLoginAt && (
                        <>
                            {' · '}
                            <Tooltip title={formatDateTime(profile.lastLoginAt)} arrow>
                                <span>Last signed in {relativeInSentence(profile.lastLoginAt)}</span>
                            </Tooltip>
                        </>
                    )}
                </Typography>
            </Box>

            {/* Photo actions (also reachable without the camera button) */}
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', justifyContent: 'center', width: { xs: '100%', sm: 'auto' }, flexShrink: 0 }}>
                <Button
                    variant="outlined"
                    startIcon={<PhotoCameraOutlinedIcon />}
                    onClick={pickPhoto}
                    disabled={uploadPhoto.isPending}
                    sx={{ ...outlinedButtonSx, flex: { xs: 1, sm: 'none' } }}
                >
                    {hasPhoto ? 'Change photo' : 'Add photo'}
                </Button>
                {hasPhoto && (
                    <Button
                        variant="outlined"
                        startIcon={<DeleteOutlineRoundedIcon />}
                        onClick={() => setConfirmRemove(true)}
                        disabled={removePhoto.isPending}
                        sx={{
                            ...outlinedButtonSx,
                            flex: { xs: 1, sm: 'none' },
                            '&:hover': {
                                color: 'var(--mui-palette-error-main)',
                                backgroundColor: 'var(--mui-palette-error-soft)',
                                borderColor: 'var(--mui-palette-error-softBorder)',
                            },
                        }}
                    >
                        Remove
                    </Button>
                )}
            </Box>

            <PhotoCropDialog open={Boolean(cropFile)} file={cropFile} onClose={() => setCropFile(null)} onSave={savePhoto} />
            <ConfirmDeleteDialog
                open={confirmRemove}
                title="Remove your photo?"
                confirmLabel="Remove photo"
                onConfirm={confirmRemovePhoto}
                onClose={() => setConfirmRemove(false)}
            >
                Your initials will show instead of your photo everywhere in the CRM. You can add a new photo at any time.
            </ConfirmDeleteDialog>
        </Box>
    );
}

const outlinedButtonSx = {
    textTransform: 'none',
    fontWeight: 600,
    fontSize: '0.82rem',
    borderRadius: '8px',
    minHeight: 40,
    whiteSpace: 'nowrap',
    border: '1px solid var(--mui-palette-border-main)',
    color: 'var(--crm-slate-700)',
    backgroundColor: 'var(--mui-palette-background-paper)',
    transition: 'all 0.15s ease',
    '&:hover': {
        borderColor: 'var(--crm-blue-300)',
        backgroundColor: 'var(--mui-palette-primary-soft)',
        color: 'var(--crm-text-blue-700)',
    },
} as const;
