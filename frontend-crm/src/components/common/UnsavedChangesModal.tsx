'use client';

import React from 'react';
import {
    Avatar,
    Box,
    Button,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    Typography,
} from '@mui/material';
import WarningAmberRoundedIcon from '@mui/icons-material/WarningAmberRounded';

export interface UnsavedChangesModalProps {
    open: boolean;
    onKeepEditing: () => void;
    onDiscardAndLeave: () => void;
    title?: string;
    description?: string;
}

export function UnsavedChangesModal({
    open,
    onKeepEditing,
    onDiscardAndLeave,
    title = 'Unsaved Changes',
    description = 'You have unsaved changes. If you leave now, your progress will be stored in your local draft, or you can discard your changes.',
}: UnsavedChangesModalProps) {
    return (
        <Dialog
            open={open}
            onClose={onKeepEditing}
            maxWidth="xs"
            fullWidth
            slotProps={{ paper: { sx: { borderRadius: '12px' } } }}
            aria-labelledby="unsaved-changes-title"
            aria-describedby="unsaved-changes-description"
        >
            <DialogTitle component="div" sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5, pb: 1 }}>
                <Avatar sx={{ bgcolor: '#fef3c7', color: '#d97706', width: 40, height: 40 }}>
                    <WarningAmberRoundedIcon />
                </Avatar>
                <Box>
                    <Typography id="unsaved-changes-title" sx={{ fontWeight: 700, fontSize: '1.05rem', color: '#0f172a' }}>
                        {title}
                    </Typography>
                </Box>
            </DialogTitle>

            <DialogContent>
                <Typography id="unsaved-changes-description" sx={{ fontSize: '0.85rem', color: '#64748b', lineHeight: 1.6 }}>
                    {description}
                </Typography>
            </DialogContent>

            <DialogActions sx={{ px: 3, pb: 2.5, gap: 1 }}>
                <Button
                    autoFocus
                    variant="outlined"
                    onClick={onKeepEditing}
                    sx={{ textTransform: 'none', fontWeight: 600, borderRadius: '8px', borderColor: '#2563eb', color: '#2563eb' }}
                >
                    Keep Editing
                </Button>
                <Button
                    variant="contained"
                    color="error"
                    onClick={onDiscardAndLeave}
                    sx={{ textTransform: 'none', fontWeight: 700, borderRadius: '8px', boxShadow: 'none' }}
                >
                    Discard &amp; Leave
                </Button>
            </DialogActions>
        </Dialog>
    );
}
