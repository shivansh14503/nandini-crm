'use client';

import React, { useState } from 'react';
import { Box, IconButton, Tooltip, Typography } from '@mui/material';
import PhotoCameraOutlinedIcon from '@mui/icons-material/PhotoCameraOutlined';
import { UserAvatar } from '@/components/common/UserAvatar';
import { ConfirmDeleteDialog, errorMessage, surfaceSx } from '@/components/settings/form-customization/builderUi';
import { useRemovePhoto, useUploadPhoto } from '@/hooks/queries/useProfile';
import type { ProfileDto } from '@/types/profile.types';
import { formatDateTime } from '@/utils/date';
import { PhotoCropDialog } from './PhotoCropDialog';
import { ProfilePhotoDialog } from './ProfilePhotoDialog';
import type { Notify } from './ProfileView';
import { relativeInSentence } from './profileUi';

const AVATAR_SIZE = 88;

/** Top card of My Profile: photo (the camera badge opens the photo dialog: webcam, upload, remove), name, role, department, username and last sign-in. */
export function ProfileHeaderCard({ profile, notify }: { profile: ProfileDto; notify: Notify }) {
    const [photoMenuOpen, setPhotoMenuOpen] = useState(false);
    const [cropFile, setCropFile] = useState<File | null>(null);
    const [confirmRemove, setConfirmRemove] = useState(false);
    const uploadPhoto = useUploadPhoto();
    const removePhoto = useRemovePhoto();

    const name = profile.fullName.trim() || profile.username;
    const hasPhoto = Boolean(profile.photoUrl);

    /** A file picked in the photo dialog moves on to the crop step. */
    const onFilePicked = (file: File) => {
        setPhotoMenuOpen(false);
        setCropFile(file);
    };

    const savePhoto = async (blob: Blob, fileName?: string) => {
        await uploadPhoto.mutateAsync({ blob, fileName });
        notify('Profile photo updated.');
    };

    const saveCroppedPhoto = async (blob: Blob) => {
        await savePhoto(blob, cropFile?.name);
        setCropFile(null);
    };

    const saveCapturedPhoto = async (blob: Blob) => {
        await savePhoto(blob, 'camera-photo');
        setPhotoMenuOpen(false);
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
                        aria-haspopup="dialog"
                        onClick={() => setPhotoMenuOpen(true)}
                        disabled={uploadPhoto.isPending || removePhoto.isPending}
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

            <ProfilePhotoDialog
                open={photoMenuOpen}
                hasPhoto={hasPhoto}
                onClose={() => setPhotoMenuOpen(false)}
                onPickFile={onFilePicked}
                onSaveCapture={saveCapturedPhoto}
                onRemove={() => {
                    setPhotoMenuOpen(false);
                    setConfirmRemove(true);
                }}
            />
            <PhotoCropDialog open={Boolean(cropFile)} file={cropFile} onClose={() => setCropFile(null)} onSave={saveCroppedPhoto} />
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
