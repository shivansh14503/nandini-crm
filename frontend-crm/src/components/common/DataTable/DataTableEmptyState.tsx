'use client';

import React from 'react';
import { Box, Typography, Button } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import InboxOutlinedIcon from '@mui/icons-material/InboxOutlined';

export interface DataTableEmptyStateProps {
    icon?: React.ReactNode;
    title?: string;
    description?: string;
    actionLabel?: string;
    onAction?: () => void;
}

export function DataTableEmptyState({
    icon,
    title = 'No records found',
    description = 'There are no records matching your current filter criteria.',
    actionLabel,
    onAction,
}: DataTableEmptyStateProps) {
    return (
        <Box
            sx={{
                textAlign: 'center',
                py: 10,
                px: 3,
                my: 'auto',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                flex: 1,
            }}
        >
            <Box sx={{ color: '#cbd5e1', mb: 1.5, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {icon || <InboxOutlinedIcon sx={{ fontSize: 48 }} />}
            </Box>

            <Typography
                variant="h6"
                sx={{ color: '#475569', fontWeight: 600, fontSize: '1rem', mb: 0.5 }}
            >
                {title}
            </Typography>

            <Typography
                variant="body2"
                sx={{ color: '#94a3b8', mb: 3, maxWidth: 400, lineHeight: 1.5 }}
            >
                {description}
            </Typography>

            {actionLabel && onAction && (
                <Button
                    variant="contained"
                    startIcon={<AddIcon />}
                    onClick={onAction}
                    sx={{
                        background: 'linear-gradient(135deg, #1d4ed8 0%, #2563eb 100%)',
                        borderRadius: '8px',
                        textTransform: 'none',
                        fontWeight: 700,
                        fontSize: '0.84rem',
                        px: 2.5,
                        height: 38,
                        boxShadow: '0 2px 6px rgba(37,99,235,0.25)',
                        '&:hover': { background: 'linear-gradient(135deg, #1e40af 0%, #1d4ed8 100%)' },
                    }}
                >
                    {actionLabel}
                </Button>
            )}
        </Box>
    );
}
