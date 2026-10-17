'use client';

import React from 'react';
import {
    Box,
    Typography,
    Select,
    MenuItem,
    IconButton,
} from '@mui/material';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';

export interface ContactsPaginationProps {
    page: number;
    rowsPerPage: number;
    totalCount: number;
    onPageChange: (newPage: number) => void;
    onRowsPerPageChange: (newRowsPerPage: number) => void;
}

export function ContactsPagination({
    page,
    rowsPerPage,
    totalCount,
    onPageChange,
    onRowsPerPageChange,
}: ContactsPaginationProps) {
    const totalPages = Math.max(1, Math.ceil(totalCount / rowsPerPage));
    const startItem = totalCount === 0 ? 0 : page * rowsPerPage + 1;
    const endItem = Math.min((page + 1) * rowsPerPage, totalCount);

    return (
        <Box
            sx={{
                px: 2,
                py: 1,
                borderTop: '1px solid #e2e8f0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: 2,
                backgroundColor: '#ffffff',
            }}
        >
            {/* Rows per page selector */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Typography sx={{ fontSize: '0.78rem', color: '#64748b' }}>
                    Rows per page:
                </Typography>
                <Select
                    size="small"
                    value={rowsPerPage}
                    onChange={(e) => onRowsPerPageChange(Number(e.target.value))}
                    sx={{
                        fontSize: '0.78rem',
                        height: 28,
                        '& .MuiSelect-select': { py: 0.5, px: 1 },
                        '& .MuiOutlinedInput-notchedOutline': { borderColor: '#cbd5e1' },
                    }}
                >
                    <MenuItem value={10}>10</MenuItem>
                    <MenuItem value={25}>25</MenuItem>
                    <MenuItem value={50}>50</MenuItem>
                </Select>
            </Box>

            {/* Range and page switcher */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                <Typography sx={{ fontSize: '0.78rem', color: '#64748b' }}>
                    {totalCount > 0
                        ? `${startItem}-${endItem} of ${totalCount}`
                        : '0 of 0'}
                </Typography>

                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <IconButton
                        size="small"
                        disabled={page === 0}
                        onClick={() => onPageChange(page - 1)}
                        sx={{
                            border: '1px solid #e2e8f0',
                            borderRadius: '6px',
                            p: 0.4,
                            '&:disabled': { opacity: 0.4 },
                        }}
                    >
                        <ChevronLeftIcon sx={{ fontSize: 18 }} />
                    </IconButton>

                    <Typography sx={{ fontSize: '0.78rem', fontWeight: 600, color: '#334155', px: 0.5 }}>
                        {page + 1} / {totalPages}
                    </Typography>

                    <IconButton
                        size="small"
                        disabled={page >= totalPages - 1}
                        onClick={() => onPageChange(page + 1)}
                        sx={{
                            border: '1px solid #e2e8f0',
                            borderRadius: '6px',
                            p: 0.4,
                            '&:disabled': { opacity: 0.4 },
                        }}
                    >
                        <ChevronRightIcon sx={{ fontSize: 18 }} />
                    </IconButton>
                </Box>
            </Box>
        </Box>
    );
}
