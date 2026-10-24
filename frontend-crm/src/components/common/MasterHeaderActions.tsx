'use client';

import React from 'react';
import { Box, Button } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import RefreshIcon from '@mui/icons-material/Refresh';

export interface MasterHeaderActionsProps {
    onRefresh?: () => void;
    onNewClick?: () => void;
    newButtonLabel?: string;
}

const outlinedSx = {
    borderColor: '#e2e8f0',
    color: '#334155',
    backgroundColor: '#fff',
    textTransform: 'none',
    fontWeight: 600,
    fontSize: '0.8rem',
    borderRadius: '8px',
    height: 36,
    px: 1.8,
    '&:hover': { borderColor: '#cbd5e1', backgroundColor: '#f8fafc' },
} as const;

/** Standard right-aligned header action row shared by the entity master views. */
export function MasterHeaderActions({
    onRefresh,
    onNewClick,
    newButtonLabel = 'New Record',
}: MasterHeaderActionsProps) {
    return (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.2, flexWrap: 'wrap' }}>
            {onRefresh && (
                <Button
                    variant="outlined"
                    size="small"
                    startIcon={<RefreshIcon sx={{ fontSize: 16 }} />}
                    onClick={onRefresh}
                    sx={outlinedSx}
                >
                    Refresh
                </Button>
            )}

            {onNewClick && (
                <Button
                    variant="contained"
                    size="small"
                    startIcon={<AddIcon sx={{ fontSize: 16 }} />}
                    onClick={onNewClick}
                    sx={{
                        background: 'linear-gradient(135deg, #1d4ed8 0%, #2563eb 100%)',
                        color: '#fff',
                        textTransform: 'none',
                        fontWeight: 700,
                        fontSize: '0.82rem',
                        borderRadius: '8px',
                        height: 36,
                        px: 2,
                        boxShadow: 'none',
                        '&:hover': { background: 'linear-gradient(135deg, #1e40af 0%, #1d4ed8 100%)' },
                    }}
                >
                    {newButtonLabel}
                </Button>
            )}
        </Box>
    );
}
