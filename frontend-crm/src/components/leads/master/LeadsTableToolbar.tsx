'use client';

import React from 'react';
import {
    Box,
    Button,
    InputBase,
    IconButton,
    Tooltip,
    Typography,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import AddIcon from '@mui/icons-material/Add';
import RefreshIcon from '@mui/icons-material/Refresh';
import DeleteOutlinedIcon from '@mui/icons-material/DeleteOutlined';

export interface LeadsTableToolbarProps {
    searchQuery: string;
    onSearchChange: (value: string) => void;
    onNewLead: () => void;
    onRefresh: () => void;
    selectedCount: number;
    onBulkDelete?: () => void;
}

export function LeadsTableToolbar({
    searchQuery,
    onSearchChange,
    onNewLead,
    onRefresh,
    selectedCount,
    onBulkDelete,
}: LeadsTableToolbarProps) {
    return (
        <Box
            sx={{
                p: 1.5,
                borderBottom: '1px solid #e2e8f0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: 1.5,
                backgroundColor: '#ffffff',
            }}
        >
            {/* Search Input Box */}
            <Box
                sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1,
                    px: 1.5,
                    py: 0.5,
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    backgroundColor: '#f8fafc',
                    width: { xs: '100%', sm: 340 },
                    '&:focus-within': {
                        borderColor: '#2563eb',
                        backgroundColor: '#fff',
                        boxShadow: '0 0 0 2px rgba(37,99,235,0.1)',
                    },
                }}
            >
                <SearchIcon sx={{ fontSize: 18, color: '#94a3b8' }} />
                <InputBase
                    placeholder="Search by name, company, phone, product, status..."
                    value={searchQuery}
                    onChange={(e) => onSearchChange(e.target.value)}
                    sx={{
                        fontSize: '0.82rem',
                        color: '#1e293b',
                        width: '100%',
                    }}
                />
            </Box>

            {/* Actions: Bulk selection or primary actions */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                {selectedCount > 0 ? (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                        <Typography sx={{ fontSize: '0.8rem', fontWeight: 600, color: '#1d4ed8' }}>
                            {selectedCount} selected
                        </Typography>
                        {onBulkDelete && (
                            <Button
                                size="small"
                                variant="outlined"
                                color="error"
                                startIcon={<DeleteOutlinedIcon sx={{ fontSize: 16 }} />}
                                onClick={onBulkDelete}
                                sx={{
                                    fontSize: '0.78rem',
                                    textTransform: 'none',
                                    borderRadius: '6px',
                                    height: 32,
                                }}
                            >
                                Delete Selected
                            </Button>
                        )}
                    </Box>
                ) : null}

                <Tooltip title="Refresh Leads">
                    <IconButton
                        size="small"
                        onClick={onRefresh}
                        sx={{
                            color: '#64748b',
                            border: '1px solid #e2e8f0',
                            borderRadius: '8px',
                            p: 0.8,
                            '&:hover': { backgroundColor: '#f1f5f9', color: '#1d4ed8' },
                        }}
                    >
                        <RefreshIcon sx={{ fontSize: 18 }} />
                    </IconButton>
                </Tooltip>

                <Button
                    variant="contained"
                    startIcon={<AddIcon sx={{ fontSize: 18 }} />}
                    onClick={onNewLead}
                    sx={{
                        background: 'linear-gradient(135deg, #1d4ed8 0%, #2563eb 100%)',
                        borderRadius: '8px',
                        textTransform: 'none',
                        fontWeight: 700,
                        fontSize: '0.82rem',
                        height: 34,
                        px: 2,
                        boxShadow: '0 2px 6px rgba(37,99,235,0.25)',
                        '&:hover': { background: 'linear-gradient(135deg, #1e40af 0%, #1d4ed8 100%)' },
                    }}
                >
                    New Lead
                </Button>
            </Box>
        </Box>
    );
}
