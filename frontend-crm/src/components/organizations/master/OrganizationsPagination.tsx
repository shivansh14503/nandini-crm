'use client';

import React from 'react';
import {
    Box,
    Typography,
    Button,
    FormControl,
    Select,
    MenuItem,
} from '@mui/material';

export interface OrganizationsPaginationProps {
    totalRecords: number;
    currentPage: number;
    rowsPerPage: number;
    totalPages: number;
    onPageChange: (page: number) => void;
    onRowsPerPageChange: (rows: number) => void;
}

export function OrganizationsPagination({
    totalRecords,
    currentPage,
    rowsPerPage,
    totalPages,
    onPageChange,
    onRowsPerPageChange,
}: OrganizationsPaginationProps) {
    return (
        <Box
            sx={{
                p: 1.8,
                borderTop: '1px solid #e2e8f0',
                backgroundColor: '#fff',
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
                    <Typography sx={{ fontSize: '0.78rem', color: '#64748b' }}>
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
                            <MenuItem value={10}>10</MenuItem>
                            <MenuItem value={25}>25</MenuItem>
                            <MenuItem value={50}>50</MenuItem>
                            <MenuItem value={100}>100</MenuItem>
                        </Select>
                    </FormControl>
                </Box>

                <Typography sx={{ fontSize: '0.78rem', color: '#64748b' }}>
                    Showing{' '}
                    <Typography component="span" sx={{ fontWeight: 600, color: '#1e293b' }}>
                        {totalRecords === 0 ? 0 : (currentPage - 1) * rowsPerPage + 1} -{' '}
                        {Math.min(currentPage * rowsPerPage, totalRecords)}
                    </Typography>{' '}
                    of{' '}
                    <Typography component="span" sx={{ fontWeight: 600, color: '#1e293b' }}>
                        11,417
                    </Typography>{' '}
                    Organizations
                </Typography>
            </Box>

            {/* Right: Full Pagination Navigation Buttons */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.8 }}>
                <Button
                    size="small"
                    disabled={currentPage === 1}
                    onClick={() => onPageChange(1)}
                    sx={{
                        textTransform: 'none',
                        fontSize: '0.76rem',
                        color: '#64748b',
                        border: '1px solid #e2e8f0',
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
                    disabled={currentPage === 1}
                    onClick={() => onPageChange(Math.max(1, currentPage - 1))}
                    sx={{
                        textTransform: 'none',
                        fontSize: '0.76rem',
                        color: '#64748b',
                        border: '1px solid #e2e8f0',
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
                        onClick={() => onPageChange(pageNum)}
                        sx={{
                            minWidth: 28,
                            height: 28,
                            p: 0,
                            fontSize: '0.76rem',
                            fontWeight: currentPage === pageNum ? 700 : 500,
                            backgroundColor: currentPage === pageNum ? '#eff6ff' : 'transparent',
                            color: currentPage === pageNum ? '#1d4ed8' : '#64748b',
                            border: currentPage === pageNum ? '1px solid #93c5fd' : '1px solid #e2e8f0',
                            borderRadius: '6px',
                        }}
                    >
                        {pageNum}
                    </Button>
                ))}

                {totalPages > 3 && (
                    <>
                        <Typography sx={{ color: '#94a3b8', fontSize: '0.76rem' }}>...</Typography>
                        <Button
                            size="small"
                            onClick={() => onPageChange(totalPages)}
                            sx={{
                                minWidth: 32,
                                height: 28,
                                p: 0,
                                fontSize: '0.76rem',
                                fontWeight: 500,
                                color: '#64748b',
                                border: '1px solid #e2e8f0',
                                borderRadius: '6px',
                            }}
                        >
                            457
                        </Button>
                    </>
                )}

                <Button
                    size="small"
                    disabled={currentPage >= totalPages}
                    onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
                    sx={{
                        textTransform: 'none',
                        fontSize: '0.76rem',
                        color: '#64748b',
                        border: '1px solid #e2e8f0',
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
                    disabled={currentPage >= totalPages}
                    onClick={() => onPageChange(totalPages)}
                    sx={{
                        textTransform: 'none',
                        fontSize: '0.76rem',
                        color: '#64748b',
                        border: '1px solid #e2e8f0',
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
