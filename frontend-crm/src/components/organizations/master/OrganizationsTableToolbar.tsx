'use client';

import React, { useState } from 'react';
import {
    Box,
    Typography,
    Button,
    IconButton,
    TextField,
    Checkbox,
    Menu,
    MenuItem,
    InputAdornment,
} from '@mui/material';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import FilterListIcon from '@mui/icons-material/FilterList';
import ViewColumnIcon from '@mui/icons-material/ViewColumn';
import SearchIcon from '@mui/icons-material/Search';
import ClearIcon from '@mui/icons-material/Clear';

export interface OrganizationsTableToolbarProps {
    searchQuery: string;
    onSearchChange: (query: string) => void;
    isAllPageSelected: boolean;
    isSomePageSelected: boolean;
    onToggleSelectAll: () => void;
    onSelectAllMatching: () => void;
    onSelectVisible: () => void;
    onDeselectAll: () => void;
    totalRecords: number;
    currentPage: number;
    rowsPerPage: number;
    totalPages: number;
    onPageChange: (page: number) => void;
    onBulkAction: (action: 'active' | 'inactive' | 'delete' | 'export') => void;
    onFilterClick?: () => void;
    onColumnClick?: () => void;
}

export function OrganizationsTableToolbar({
    searchQuery,
    onSearchChange,
    isAllPageSelected,
    isSomePageSelected,
    onToggleSelectAll,
    onSelectAllMatching,
    onSelectVisible,
    onDeselectAll,
    totalRecords,
    currentPage,
    rowsPerPage,
    totalPages,
    onPageChange,
    onBulkAction,
    onFilterClick,
    onColumnClick,
}: OrganizationsTableToolbarProps) {
    const [selectMenuAnchor, setSelectMenuAnchor] = useState<null | HTMLElement>(null);
    const [bulkMenuAnchor, setBulkMenuAnchor] = useState<null | HTMLElement>(null);

    return (
        <Box
            sx={{
                p: 1.5,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: 1.5,
                borderBottom: '1px solid #f1f5f9',
            }}
        >
            {/* Left Controls */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                {/* Checkbox with dropdown */}
                <Box sx={{ display: 'flex', alignItems: 'center' }}>
                    <Checkbox
                        size="small"
                        checked={isAllPageSelected}
                        indeterminate={isSomePageSelected}
                        onChange={onToggleSelectAll}
                        sx={{ p: 0.5, color: '#94a3b8', '&.Mui-checked': { color: '#2563eb' } }}
                    />
                    <IconButton
                        size="small"
                        onClick={(e) => setSelectMenuAnchor(e.currentTarget)}
                        sx={{ p: 0.2, color: '#94a3b8' }}
                    >
                        <KeyboardArrowDownIcon sx={{ fontSize: 14 }} />
                    </IconButton>
                </Box>

                <Menu
                    anchorEl={selectMenuAnchor}
                    open={Boolean(selectMenuAnchor)}
                    onClose={() => setSelectMenuAnchor(null)}
                    slotProps={{ paper: { sx: { borderRadius: '8px', minWidth: 160 } } }}
                >
                    <MenuItem
                        onClick={() => {
                            setSelectMenuAnchor(null);
                            onSelectAllMatching();
                        }}
                        sx={{ fontSize: '0.8rem' }}
                    >
                        Select All ({totalRecords})
                    </MenuItem>
                    <MenuItem
                        onClick={() => {
                            setSelectMenuAnchor(null);
                            onSelectVisible();
                        }}
                        sx={{ fontSize: '0.8rem' }}
                    >
                        Select Visible
                    </MenuItem>
                    <MenuItem
                        onClick={() => {
                            setSelectMenuAnchor(null);
                            onDeselectAll();
                        }}
                        sx={{ fontSize: '0.8rem' }}
                    >
                        Deselect All
                    </MenuItem>
                </Menu>

                {/* Bulk Action Dropdown */}
                <Button
                    variant="outlined"
                    size="small"
                    endIcon={<KeyboardArrowDownIcon sx={{ fontSize: 16 }} />}
                    onClick={(e) => setBulkMenuAnchor(e.currentTarget)}
                    sx={{
                        borderColor: '#e2e8f0',
                        color: '#334155',
                        textTransform: 'none',
                        fontWeight: 700,
                        fontSize: '0.78rem',
                        borderRadius: '6px',
                        height: 32,
                        px: 1.5,
                        backgroundColor: '#fff',
                        '&:hover': { borderColor: '#cbd5e1', backgroundColor: '#f8fafc' },
                    }}
                >
                    BULK ACTION
                </Button>

                <Menu
                    anchorEl={bulkMenuAnchor}
                    open={Boolean(bulkMenuAnchor)}
                    onClose={() => setBulkMenuAnchor(null)}
                    slotProps={{ paper: { sx: { borderRadius: '8px', minWidth: 190 } } }}
                >
                    <MenuItem
                        onClick={() => {
                            setBulkMenuAnchor(null);
                            onBulkAction('active');
                        }}
                        sx={{ fontSize: '0.8rem' }}
                    >
                        Mark as Active
                    </MenuItem>
                    <MenuItem
                        onClick={() => {
                            setBulkMenuAnchor(null);
                            onBulkAction('inactive');
                        }}
                        sx={{ fontSize: '0.8rem' }}
                    >
                        Mark as Inactive
                    </MenuItem>
                    <MenuItem
                        onClick={() => {
                            setBulkMenuAnchor(null);
                            onBulkAction('export');
                        }}
                        sx={{ fontSize: '0.8rem' }}
                    >
                        Export Selected to CSV
                    </MenuItem>
                    <MenuItem
                        onClick={() => {
                            setBulkMenuAnchor(null);
                            onBulkAction('delete');
                        }}
                        sx={{ fontSize: '0.8rem', color: '#ef4444' }}
                    >
                        Delete Selected
                    </MenuItem>
                </Menu>

                {/* Filter & Column Layout Buttons */}
                <IconButton
                    size="small"
                    onClick={onFilterClick}
                    sx={{ border: '1px solid #e2e8f0', borderRadius: '6px', width: 32, height: 32, color: '#64748b' }}
                >
                    <FilterListIcon sx={{ fontSize: 16 }} />
                </IconButton>

                <IconButton
                    size="small"
                    onClick={onColumnClick}
                    sx={{ border: '1px solid #e2e8f0', borderRadius: '6px', width: 32, height: 32, color: '#64748b' }}
                >
                    <ViewColumnIcon sx={{ fontSize: 16 }} />
                </IconButton>

                {/* Search within table */}
                <TextField
                    size="small"
                    placeholder="Search within table..."
                    value={searchQuery}
                    onChange={(e) => onSearchChange(e.target.value)}
                    sx={{
                        width: { xs: 180, sm: 260 },
                        '& .MuiOutlinedInput-root': {
                            height: 32,
                            fontSize: '0.8rem',
                            borderRadius: '6px',
                            backgroundColor: '#fff',
                            '& fieldset': { borderColor: '#e2e8f0' },
                            '&:hover fieldset': { borderColor: '#cbd5e1' },
                            '&.Mui-focused fieldset': { borderColor: '#2563eb' },
                        },
                    }}
                    slotProps={{
                        input: {
                            startAdornment: (
                                <InputAdornment position="start">
                                    <SearchIcon sx={{ fontSize: 16, color: '#94a3b8' }} />
                                </InputAdornment>
                            ),
                            endAdornment: searchQuery ? (
                                <InputAdornment position="end">
                                    <IconButton size="small" onClick={() => onSearchChange('')} sx={{ p: 0.2 }}>
                                        <ClearIcon sx={{ fontSize: 14, color: '#94a3b8' }} />
                                    </IconButton>
                                </InputAdornment>
                            ) : undefined,
                        },
                    }}
                />
            </Box>

            {/* Right: Showing records & Mini Pager */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                <Typography sx={{ fontSize: '0.78rem', color: '#64748b' }}>
                    Showing{' '}
                    <Typography component="span" sx={{ fontWeight: 700, color: '#1e293b' }}>
                        {totalRecords === 0 ? 0 : (currentPage - 1) * rowsPerPage + 1} -{' '}
                        {Math.min(currentPage * rowsPerPage, totalRecords)}
                    </Typography>{' '}
                    of{' '}
                    <Typography component="span" sx={{ fontWeight: 700, color: '#1e293b' }}>
                        11,417
                    </Typography>{' '}
                    records
                </Typography>

                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <IconButton
                        size="small"
                        disabled={currentPage === 1}
                        onClick={() => onPageChange(Math.max(1, currentPage - 1))}
                        sx={{ border: '1px solid #e2e8f0', borderRadius: '4px', width: 26, height: 26 }}
                    >
                        &lt;
                    </IconButton>
                    <Box
                        sx={{
                            width: 26,
                            height: 26,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            border: '1px solid #93c5fd',
                            borderRadius: '4px',
                            backgroundColor: '#eff6ff',
                            color: '#1d4ed8',
                            fontWeight: 700,
                            fontSize: '0.76rem',
                        }}
                    >
                        {currentPage}
                    </Box>
                    <IconButton
                        size="small"
                        disabled={currentPage >= totalPages}
                        onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
                        sx={{ border: '1px solid #e2e8f0', borderRadius: '4px', width: 26, height: 26 }}
                    >
                        &gt;
                    </IconButton>
                    <IconButton
                        size="small"
                        disabled={currentPage >= totalPages}
                        onClick={() => onPageChange(totalPages)}
                        sx={{ border: '1px solid #e2e8f0', borderRadius: '4px', width: 26, height: 26 }}
                    >
                        &gt;&gt;
                    </IconButton>
                </Box>
            </Box>
        </Box>
    );
}
