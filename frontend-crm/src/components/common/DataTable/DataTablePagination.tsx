'use client';

import React from 'react';
import {
    Box,
    Button,
    FormControl,
    IconButton,
    MenuItem,
    Select,
    Typography,
} from '@mui/material';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import type { DataTablePaginationProps } from './types';

export function DataTablePagination({
    page,
    rowsPerPage,
    totalCount,
    onPageChange,
    onRowsPerPageChange,
    pageSizeOptions = [10, 25, 50],
    variant = 'compact',
    entityLabel = 'Records',
    displayTotalCount,
    hideWhenEmpty = false,
}: DataTablePaginationProps) {
    if (hideWhenEmpty && totalCount === 0) {
        return null;
    }

    const totalPages = Math.max(1, Math.ceil(totalCount / rowsPerPage));
    const startItem = totalCount === 0 ? 0 : page * rowsPerPage + 1;
    const endItem = Math.min((page + 1) * rowsPerPage, totalCount);

    if (variant === 'full') {
        const currentPage1Based = page + 1;
        return (
            <Box
                sx={{
                    p: 1.8,
                    borderTop: '1px solid var(--mui-palette-border-main)',
                    backgroundColor: 'var(--mui-palette-background-paper)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: 2,
                }}
            >
                {/* Left: Rows per page & showing records */}
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Typography sx={{ fontSize: '0.78rem', color: 'var(--mui-palette-text-secondary)' }}>
                            Rows per page:
                        </Typography>
                        <FormControl size="small">
                            <Select
                                value={rowsPerPage}
                                onChange={(e) => onRowsPerPageChange(Number(e.target.value))}
                                sx={{
                                    height: 28,
                                    fontSize: '0.78rem',
                                    borderRadius: '6px',
                                    '& .MuiSelect-select': { py: 0.4, px: 1 },
                                }}
                            >
                                {pageSizeOptions.map((size) => (
                                    <MenuItem key={size} value={size}>
                                        {size}
                                    </MenuItem>
                                ))}
                            </Select>
                        </FormControl>
                    </Box>

                    <Typography sx={{ fontSize: '0.78rem', color: 'var(--mui-palette-text-secondary)' }}>
                        Showing{' '}
                        <Typography component="span" sx={{ fontWeight: 600, color: 'var(--mui-palette-text-primary)' }}>
                            {startItem} - {endItem}
                        </Typography>{' '}
                        of{' '}
                        <Typography component="span" sx={{ fontWeight: 600, color: 'var(--mui-palette-text-primary)' }}>
                            {displayTotalCount ?? totalCount.toLocaleString()}
                        </Typography>{' '}
                        {entityLabel}
                    </Typography>
                </Box>

                {/* Right: Full Pagination Navigation Buttons */}
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.8 }}>
                    <Button
                        size="small"
                        disabled={currentPage1Based === 1}
                        onClick={() => onPageChange(0)}
                        sx={{
                            textTransform: 'none',
                            fontSize: '0.76rem',
                            color: 'var(--mui-palette-text-secondary)',
                            border: '1px solid var(--mui-palette-border-main)',
                            borderRadius: '6px',
                            minWidth: 44,
                            height: 28,
                            py: 0,
                        }}
                    >
                        First
                    </Button>
                    <Button
                        size="small"
                        disabled={currentPage1Based === 1}
                        onClick={() => onPageChange(Math.max(0, page - 1))}
                        sx={{
                            textTransform: 'none',
                            fontSize: '0.76rem',
                            color: 'var(--mui-palette-text-secondary)',
                            border: '1px solid var(--mui-palette-border-main)',
                            borderRadius: '6px',
                            minWidth: 44,
                            height: 28,
                            py: 0,
                        }}
                    >
                        Prev
                    </Button>

                    {/* Page number buttons */}
                    {Array.from({ length: Math.min(3, totalPages) }, (_, i) => i + 1).map((pageNum) => (
                        <Button
                            key={pageNum}
                            size="small"
                            onClick={() => onPageChange(pageNum - 1)}
                            sx={{
                                minWidth: 28,
                                height: 28,
                                p: 0,
                                fontSize: '0.76rem',
                                fontWeight: currentPage1Based === pageNum ? 700 : 500,
                                backgroundColor: currentPage1Based === pageNum ? 'var(--mui-palette-primary-soft)' : 'transparent',
                                color: currentPage1Based === pageNum ? 'var(--crm-text-blue-700)' : 'var(--mui-palette-text-secondary)',
                                border: currentPage1Based === pageNum ? '1px solid var(--crm-blue-300)' : '1px solid var(--mui-palette-border-main)',
                                borderRadius: '6px',
                            }}
                        >
                            {pageNum}
                        </Button>
                    ))}

                    {totalPages > 3 && (
                        <>
                            <Typography sx={{ color: 'var(--mui-palette-text-muted)', fontSize: '0.76rem' }}>...</Typography>
                            <Button
                                size="small"
                                onClick={() => onPageChange(totalPages - 1)}
                                sx={{
                                    minWidth: 32,
                                    height: 28,
                                    p: 0,
                                    fontSize: '0.76rem',
                                    fontWeight: 500,
                                    color: 'var(--mui-palette-text-secondary)',
                                    border: '1px solid var(--mui-palette-border-main)',
                                    borderRadius: '6px',
                                }}
                            >
                                457
                            </Button>
                        </>
                    )}

                    <Button
                        size="small"
                        disabled={currentPage1Based >= totalPages}
                        onClick={() => onPageChange(Math.min(totalPages - 1, page + 1))}
                        sx={{
                            textTransform: 'none',
                            fontSize: '0.76rem',
                            color: 'var(--mui-palette-text-secondary)',
                            border: '1px solid var(--mui-palette-border-main)',
                            borderRadius: '6px',
                            minWidth: 44,
                            height: 28,
                            py: 0,
                        }}
                    >
                        Next
                    </Button>
                    <Button
                        size="small"
                        disabled={currentPage1Based >= totalPages}
                        onClick={() => onPageChange(totalPages - 1)}
                        sx={{
                            textTransform: 'none',
                            fontSize: '0.76rem',
                            color: 'var(--mui-palette-text-secondary)',
                            border: '1px solid var(--mui-palette-border-main)',
                            borderRadius: '6px',
                            minWidth: 44,
                            height: 28,
                            py: 0,
                        }}
                    >
                        Last
                    </Button>
                </Box>
            </Box>
        );
    }

    return (
        <Box
            sx={{
                px: 2,
                py: 1,
                borderTop: '1px solid var(--mui-palette-border-main)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: 2,
                backgroundColor: 'var(--mui-palette-background-paper)',
            }}
        >
            {/* Rows per page selector */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Typography sx={{ fontSize: '0.78rem', color: 'var(--mui-palette-text-secondary)' }}>
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
                        '& .MuiOutlinedInput-notchedOutline': { borderColor: 'var(--mui-palette-border-strong)' },
                    }}
                >
                    {pageSizeOptions.map((size) => (
                        <MenuItem key={size} value={size}>
                            {size}
                        </MenuItem>
                    ))}
                </Select>
            </Box>

            {/* Range and page switcher */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                <Typography sx={{ fontSize: '0.78rem', color: 'var(--mui-palette-text-secondary)' }}>
                    {totalCount > 0 ? `${startItem}-${endItem} of ${totalCount}` : '0 of 0'}
                </Typography>

                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <IconButton
                        size="small"
                        disabled={page === 0}
                        onClick={() => onPageChange(page - 1)}
                        sx={{
                            border: '1px solid var(--mui-palette-border-main)',
                            borderRadius: '6px',
                            p: 0.4,
                            '&:disabled': { opacity: 0.4 },
                        }}
                    >
                        <ChevronLeftIcon sx={{ fontSize: 18 }} />
                    </IconButton>

                    <Typography sx={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--crm-slate-700)', px: 0.5 }}>
                        {page + 1} / {totalPages}
                    </Typography>

                    <IconButton
                        size="small"
                        disabled={page >= totalPages - 1}
                        onClick={() => onPageChange(page + 1)}
                        sx={{
                            border: '1px solid var(--mui-palette-border-main)',
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
