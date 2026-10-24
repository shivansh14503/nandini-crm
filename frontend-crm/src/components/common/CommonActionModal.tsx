'use client';

import React from 'react';
import {
    Avatar,
    Box,
    Button,
    Chip,
    CircularProgress,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    TextField,
    Typography,
} from '@mui/material';
import WarningAmberRoundedIcon from '@mui/icons-material/WarningAmberRounded';

export interface CommonActionModalProps {
    open: boolean;
    title: string;
    description?: string;
    reasonLabel?: string;
    reasonPlaceholder?: string;
    required?: boolean;
    presetReasons?: string[];
    confirmLabel?: string;
    cancelLabel?: string;
    confirmColor?: 'error' | 'warning' | 'primary';
    loading?: boolean;
    onConfirm: (reason: string) => void | Promise<void>;
    onClose: () => void;
}

const CONFIRM_GRADIENTS: Record<NonNullable<CommonActionModalProps['confirmColor']>, string> = {
    primary: 'linear-gradient(135deg, #1d4ed8 0%, #2563eb 100%)',
    warning: 'linear-gradient(135deg, #d97706 0%, #f59e0b 100%)',
    error: 'linear-gradient(135deg, #b91c1c 0%, #dc2626 100%)',
};

/**
 * Reusable confirmation dialog that collects a reason (free text and/or preset chips).
 * Enter submits, Shift+Enter inserts a newline, Escape closes.
 */
export function CommonActionModal({
    open,
    title,
    description,
    reasonLabel = 'Reason',
    reasonPlaceholder = 'Enter a reason...',
    required = true,
    presetReasons = [],
    confirmLabel = 'Confirm',
    cancelLabel = 'Cancel',
    confirmColor = 'primary',
    loading = false,
    onConfirm,
    onClose,
}: CommonActionModalProps) {
    const [reason, setReason] = React.useState('');
    const [submitted, setSubmitted] = React.useState(false);

    const reset = () => {
        setReason('');
        setSubmitted(false);
    };

    const handleClose = () => {
        if (loading) return;
        reset();
        onClose();
    };

    const handleConfirm = async () => {
        setSubmitted(true);
        const trimmed = reason.trim();
        if (required && !trimmed) return;
        await onConfirm(trimmed);
        reset();
    };

    const showError = submitted && required && !reason.trim();

    return (
        <Dialog
            open={open}
            onClose={handleClose}
            maxWidth="sm"
            fullWidth
            slotProps={{ paper: { sx: { borderRadius: '12px' } } }}
            aria-labelledby="common-action-modal-title"
        >
            <DialogTitle component="div" sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5, pb: 1 }}>
                <Avatar sx={{ bgcolor: '#fef3c7', color: '#d97706', width: 40, height: 40 }}>
                    <WarningAmberRoundedIcon />
                </Avatar>
                <Box>
                    <Typography id="common-action-modal-title" sx={{ fontWeight: 700, fontSize: '1.05rem', color: '#0f172a' }}>
                        {title}
                    </Typography>
                    {description && (
                        <Typography sx={{ fontSize: '0.82rem', color: '#64748b', mt: 0.25 }}>
                            {description}
                        </Typography>
                    )}
                </Box>
            </DialogTitle>

            <DialogContent sx={{ pt: 1 }}>
                {presetReasons.length > 0 && (
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, mb: 2 }}>
                        {presetReasons.map((preset) => (
                            <Chip
                                key={preset}
                                label={preset}
                                size="small"
                                clickable
                                onClick={() => setReason(preset)}
                                variant={reason === preset ? 'filled' : 'outlined'}
                                color={reason === preset ? 'primary' : 'default'}
                                sx={{ fontSize: '0.76rem', fontWeight: 600 }}
                            />
                        ))}
                    </Box>
                )}

                <TextField
                    autoFocus
                    fullWidth
                    multiline
                    minRows={3}
                    maxRows={6}
                    label={reasonLabel}
                    placeholder={reasonPlaceholder}
                    value={reason}
                    required={required}
                    onChange={(e) => setReason(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                            e.preventDefault();
                            void handleConfirm();
                        }
                    }}
                    error={showError}
                    helperText={showError ? `${reasonLabel} is required.` : 'Press Enter to confirm, Shift+Enter for a new line.'}
                />
            </DialogContent>

            <DialogActions sx={{ px: 3, pb: 2.5, gap: 1 }}>
                <Button
                    variant="outlined"
                    onClick={handleClose}
                    disabled={loading}
                    sx={{ textTransform: 'none', fontWeight: 600, borderRadius: '8px', borderColor: '#e2e8f0', color: '#334155' }}
                >
                    {cancelLabel}
                </Button>
                <Button
                    variant="contained"
                    onClick={() => void handleConfirm()}
                    disabled={loading}
                    startIcon={loading ? <CircularProgress size={14} color="inherit" /> : undefined}
                    sx={{
                        textTransform: 'none',
                        fontWeight: 700,
                        borderRadius: '8px',
                        boxShadow: 'none',
                        background: CONFIRM_GRADIENTS[confirmColor],
                    }}
                >
                    {confirmLabel}
                </Button>
            </DialogActions>
        </Dialog>
    );
}
