'use client';

import React from 'react';
import { Snackbar, Alert } from '@mui/material';

export interface AppToastProps {
    open: boolean;
    message: string;
    severity?: 'success' | 'error' | 'info' | 'warning';
    onClose: () => void;
    autoHideDuration?: number;
}

/**
 * Standardized Application Toast notification.
 * Consistently pops up on the top right across the whole CRM application.
 */
export function AppToast({
    open,
    message,
    severity = 'success',
    onClose,
    autoHideDuration = 4000,
}: AppToastProps) {
    return (
        <Snackbar
            open={open}
            autoHideDuration={autoHideDuration}
            onClose={onClose}
            anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
            sx={{ zIndex: 2000 }}
        >
            <Alert
                severity={severity}
                variant="filled"
                onClose={onClose}
                sx={{
                    boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
                    borderRadius: '8px',
                    fontWeight: 600,
                    fontSize: '0.84rem',
                    minWidth: 260,
                }}
            >
                {message}
            </Alert>
        </Snackbar>
    );
}
