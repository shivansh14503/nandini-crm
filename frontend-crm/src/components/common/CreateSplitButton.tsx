'use client';

import React, { useState } from 'react';
import { Box, Button, ListItemIcon, ListItemText, Menu, MenuItem } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import FileUploadOutlinedIcon from '@mui/icons-material/FileUploadOutlined';

export interface CreateSplitButtonProps {
    newButtonLabel: string;
    onNewClick: () => void;
    onImportClick: () => void;
    disabled?: boolean;
}

const gradient = 'linear-gradient(135deg, #1d4ed8 0%, #2563eb 100%)';
const gradientHover = 'linear-gradient(135deg, #1e40af 0%, #1d4ed8 100%)';

const baseSx = {
    background: gradient,
    color: '#fff',
    textTransform: 'none',
    fontWeight: 700,
    fontSize: '0.82rem',
    height: 36,
    boxShadow: 'none',
    '&:hover': { background: gradientHover, boxShadow: 'none' },
    '&.Mui-disabled': { background: '#cbd5e1', color: '#fff' },
} as const;

const menuItemSx = { fontSize: '0.84rem', fontWeight: 500, color: '#334155' } as const;

export function CreateSplitButton({ newButtonLabel, onNewClick, onImportClick, disabled }: CreateSplitButtonProps) {
    const [anchorEl, setAnchorEl] = useState<HTMLDivElement | null>(null);
    const [open, setOpen] = useState(false);

    const run = (fn: () => void) => () => {
        setOpen(false);
        fn();
    };

    return (
        <>
            <Box ref={setAnchorEl}sx={{ display: 'inline-flex' }}>
                <Button
                    variant="contained"
                    size="small"
                    disabled={disabled}
                    startIcon={<AddIcon sx={{ fontSize: 16 }} />}
                    onClick={onNewClick}
                    sx={{ ...baseSx, px: 2, borderRadius: '8px 0 0 8px' }}
                >
                    {newButtonLabel}
                </Button>
                <Button
                    variant="contained"
                    size="small"
                    disabled={disabled}
                    aria-label="More create options"
                    aria-haspopup="menu"
                    aria-expanded={open}
                    onClick={() => setOpen((o) => !o)}
                    sx={{
                        ...baseSx,
                        minWidth: 34,
                        px: 0.5,
                        borderRadius: '0 8px 8px 0',
                        borderLeft: '1px solid rgba(255,255,255,0.35)',
                    }}
                >
                    <KeyboardArrowDownIcon sx={{ fontSize: 20 }} />
                </Button>
            </Box>
            <Menu
                anchorEl={anchorEl}
                open={open}
                onClose={() => setOpen(false)}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
                transformOrigin={{ vertical: 'top', horizontal: 'right' }}
                slotProps={{
                    paper: {
                        sx: { mt: 0.5, minWidth: 230, border: '1px solid #e2e8f0', borderRadius: '10px', boxShadow: '0 8px 24px rgba(15,23,42,0.10)' },
                    },
                }}
            >
                <MenuItem onClick={run(onNewClick)} sx={menuItemSx}>
                    <ListItemIcon sx={{ minWidth: 30 }}>
                        <AddIcon sx={{ fontSize: 18, color: '#2563eb' }} />
                    </ListItemIcon>
                    <ListItemText slotProps={{ primary: { sx: { fontSize: '0.84rem' } } }}>{newButtonLabel}</ListItemText>
                </MenuItem>
                <MenuItem onClick={run(onImportClick)} sx={menuItemSx}>
                    <ListItemIcon sx={{ minWidth: 30 }}>
                        <FileUploadOutlinedIcon sx={{ fontSize: 18, color: '#2563eb' }} />
                    </ListItemIcon>
                    <ListItemText slotProps={{ primary: { sx: { fontSize: '0.84rem' } } }}>Import from CSV / Excel</ListItemText>
                </MenuItem>
            </Menu>
        </>
    );
}
