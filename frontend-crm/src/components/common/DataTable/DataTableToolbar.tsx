'use client';

import React, { useState } from 'react';
import {
    Box,
    Button,
    Checkbox,
    IconButton,
    InputAdornment,
    InputBase,
    Menu,
    MenuItem,
    TextField,
    Tooltip,
    Typography,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import AddIcon from '@mui/icons-material/Add';
import RefreshIcon from '@mui/icons-material/Refresh';
import DeleteOutlinedIcon from '@mui/icons-material/DeleteOutlined';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import FilterListIcon from '@mui/icons-material/FilterList';
import ViewColumnIcon from '@mui/icons-material/ViewColumn';
import ClearIcon from '@mui/icons-material/Clear';
import type { DataTableToolbarProps } from './types';

export function DataTableToolbar({
    searchQuery,
    onSearchChange,
    searchPlaceholder = 'Search records...',
    searchWidth = { xs: '100%', sm: 320 },
    onNewClick,
    newButtonLabel = 'New Record',
    onRefresh,
    refreshTooltip = 'Refresh',
    selectedCount = 0,
    onBulkDelete,
    bulkDeleteLabel = 'Delete Selected',
    extraActions,
    variant = 'standard',
    isAllPageSelected = false,
    isSomePageSelected = false,
    onToggleSelectAll,
    onSelectAllMatching,
    onSelectVisible,
    onDeselectAll,
    totalRecords = 0,
    displayTotalRecords,
    currentPage = 1,
    rowsPerPage = 25,
    totalPages = 1,
    onPageChange,
    bulkActionItems = [],
    onFilterClick,
    onColumnClick,
}: DataTableToolbarProps) {
    const [selectMenuAnchor, setSelectMenuAnchor] = useState<null | HTMLElement>(null);
    const [bulkMenuAnchor, setBulkMenuAnchor] = useState<null | HTMLElement>(null);

    if (variant === 'extended') {
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
                        {onSelectAllMatching && (
                            <MenuItem
                                onClick={() => {
                                    setSelectMenuAnchor(null);
                                    onSelectAllMatching();
                                }}
                                sx={{ fontSize: '0.8rem' }}
                            >
                                Select All ({totalRecords})
                            </MenuItem>
                        )}
                        {onSelectVisible && (
                            <MenuItem
                                onClick={() => {
                                    setSelectMenuAnchor(null);
                                    onSelectVisible();
                                }}
                                sx={{ fontSize: '0.8rem' }}
                            >
                                Select Visible
                            </MenuItem>
                        )}
                        {onDeselectAll && (
                            <MenuItem
                                onClick={() => {
                                    setSelectMenuAnchor(null);
                                    onDeselectAll();
                                }}
                                sx={{ fontSize: '0.8rem' }}
                            >
                                Deselect All
                            </MenuItem>
                        )}
                    </Menu>

                    {/* Bulk Action Dropdown */}
                    {bulkActionItems.length > 0 && (
                        <>
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
                                {bulkActionItems.map((item) => (
                                    <MenuItem
                                        key={item.id}
                                        onClick={() => {
                                            setBulkMenuAnchor(null);
                                            item.onClick();
                                        }}
                                        sx={{
                                            fontSize: '0.8rem',
                                            color: item.color === 'error' ? '#ef4444' : undefined,
                                        }}
                                    >
                                        {item.label}
                                    </MenuItem>
                                ))}
                            </Menu>
                        </>
                    )}

                    {/* Filter & Column Layout Buttons */}
                    {onFilterClick && (
                        <IconButton
                            size="small"
                            onClick={onFilterClick}
                            sx={{ border: '1px solid #e2e8f0', borderRadius: '6px', width: 32, height: 32, color: '#64748b' }}
                        >
                            <FilterListIcon sx={{ fontSize: 16 }} />
                        </IconButton>
                    )}

                    {onColumnClick && (
                        <IconButton
                            size="small"
                            onClick={onColumnClick}
                            sx={{ border: '1px solid #e2e8f0', borderRadius: '6px', width: 32, height: 32, color: '#64748b' }}
                        >
                            <ViewColumnIcon sx={{ fontSize: 16 }} />
                        </IconButton>
                    )}

                    {/* Search within table */}
                    <TextField
                        size="small"
                        placeholder={searchPlaceholder}
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
                {onPageChange && (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                        <Typography sx={{ fontSize: '0.78rem', color: '#64748b' }}>
                            Showing{' '}
                            <Typography component="span" sx={{ fontWeight: 700, color: '#1e293b' }}>
                                {totalRecords === 0 ? 0 : (currentPage - 1) * rowsPerPage + 1} -{' '}
                                {Math.min(currentPage * rowsPerPage, totalRecords)}
                            </Typography>{' '}
                            of{' '}
                            <Typography component="span" sx={{ fontWeight: 700, color: '#1e293b' }}>
                                {displayTotalRecords ?? totalRecords.toLocaleString()}
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
                )}
            </Box>
        );
    }

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
                    width: searchWidth,
                    '&:focus-within': {
                        borderColor: '#2563eb',
                        backgroundColor: '#fff',
                        boxShadow: '0 0 0 2px rgba(37,99,235,0.1)',
                    },
                }}
            >
                <SearchIcon sx={{ fontSize: 18, color: '#94a3b8' }} />
                <InputBase
                    placeholder={searchPlaceholder}
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
                                {bulkDeleteLabel}
                            </Button>
                        )}
                    </Box>
                ) : null}

                {extraActions}

                {onRefresh && (
                    <Tooltip title={refreshTooltip}>
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
                )}

                {onNewClick && (
                    <Button
                        variant="contained"
                        startIcon={<AddIcon sx={{ fontSize: 18 }} />}
                        onClick={onNewClick}
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
                        {newButtonLabel}
                    </Button>
                )}
            </Box>
        </Box>
    );
}
