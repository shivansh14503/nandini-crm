"use client";

import { Alert } from '@mui/material';

interface ErrorAlertProps {
    id?: string;
    error: string | null;
    onClose?: () => void;
}

export function ErrorAlert({ id = 'error-alert', error, onClose }: ErrorAlertProps) {
    if (!error) return null;

    return (
        <Alert
            id={id}
            severity="error"
            sx={{ mb: 2.5, borderRadius: '10px', fontSize: '13px' }}
            onClose={onClose}
        >
            {error}
        </Alert>
    );
}
