'use client';

import React, { useState } from 'react';
import {
    Badge,
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
    filterCount = 0,
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
                    borderBottom: '1px solid var(--mui-palette-border-light)',
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
                            sx={{ p: 0.5, color: 'var(--mui-palette-text-muted)', '&.Mui-checked': { color: 'var(--crm-text-blue-600)' } }}
                        />
                        <IconButton
                            size="small"
                            onClick={(e) => setSelectMenuAnchor(e.currentTarget)}
                            sx={{ p: 0.2, color: 'var(--mui-palette-text-muted)' }}
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
                                    borderColor: 'var(--mui-palette-border-main)',
                                    color: 'var(--crm-slate-700)',
                                    textTransform: 'none',
                                    fontWeight: 700,
                                    fontSize: '0.78rem',
                                    borderRadius: '6px',
                                    height: 32,
                                    px: 1.5,
                                    backgroundColor: 'var(--mui-palette-background-paper)',
                                    '&:hover': { borderColor: 'var(--mui-palette-border-strong)', backgroundColor: 'var(--mui-palette-background-subtle)' },
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
                                            color: item.color === 'error' ? 'var(--crm-red-500)' : undefined,
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
                        <Tooltip title={filterCount ? `Filter (${filterCount} applied)` : 'Filter'}>
                            <IconButton
                                size="small"
                                aria-label="Filter"
                                onClick={onFilterClick}
                                sx={{
                                    border: `1px solid ${filterCount ? 'var(--crm-blue-300)' : 'var(--mui-palette-border-main)'}`,
                                    borderRadius: '6px',
                                    width: 32,
                                    height: 32,
                                    color: filterCount ? 'var(--crm-text-blue-600)' : 'var(--mui-palette-text-secondary)',
                                    backgroundColor: filterCount ? 'var(--mui-palette-primary-soft)' : undefined,
                                }}
                            >
                                <Badge
                                    badgeContent={filterCount}
                                    color="primary"
                                    sx={{ '& .MuiBadge-badge': { fontSize: '0.6rem', height: 15, minWidth: 15, top: -6, right: -6 } }}
                                >
                                    <FilterListIcon sx={{ fontSize: 16 }} />
                                </Badge>
                            </IconButton>
                        </Tooltip>
                    )}

                    {onColumnClick && (
                        <Tooltip title="Modify Columns">
                            <IconButton
                                size="small"
                                aria-label="Modify Columns"
                                onClick={(e) => onColumnClick(e.currentTarget)}
                                sx={{ border: '1px solid var(--mui-palette-border-main)', borderRadius: '6px', width: 32, height: 32, color: 'var(--mui-palette-text-secondary)' }}
                            >
                                <ViewColumnIcon sx={{ fontSize: 16 }} />
                            </IconButton>
                        </Tooltip>
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
                                backgroundColor: 'var(--mui-palette-background-paper)',
                                '& fieldset': { borderColor: 'var(--mui-palette-border-main)' },
                                '&:hover fieldset': { borderColor: 'var(--mui-palette-border-strong)' },
                                '&.Mui-focused fieldset': { borderColor: 'var(--mui-palette-primary-main)' },
                            },
                        }}
                        slotProps={{
                            input: {
                                startAdornment: (
                                    <InputAdornment position="start">
                                        <SearchIcon sx={{ fontSize: 16, color: 'var(--mui-palette-text-muted)' }} />
                                    </InputAdornment>
                                ),
                                endAdornment: searchQuery ? (
                                    <InputAdornment position="end">
                                        <IconButton size="small" onClick={() => onSearchChange('')} sx={{ p: 0.2 }}>
                                            <ClearIcon sx={{ fontSize: 14, color: 'var(--mui-palette-text-muted)' }} />
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
                        <Typography sx={{ fontSize: '0.78rem', color: 'var(--mui-palette-text-secondary)' }}>
                            Showing{' '}
                            <Typography component="span" sx={{ fontWeight: 700, color: 'var(--mui-palette-text-primary)' }}>
                                {totalRecords === 0 ? 0 : (currentPage - 1) * rowsPerPage + 1} -{' '}
                                {Math.min(currentPage * rowsPerPage, totalRecords)}
                            </Typography>{' '}
                            of{' '}
                            <Typography component="span" sx={{ fontWeight: 700, color: 'var(--mui-palette-text-primary)' }}>
                                {displayTotalRecords ?? totalRecords.toLocaleString()}
                            </Typography>{' '}
                            records
                        </Typography>

                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                            <IconButton
                                size="small"
                                disabled={currentPage === 1}
                                onClick={() => onPageChange(Math.max(1, currentPage - 1))}
                                sx={{ border: '1px solid var(--mui-palette-border-main)', borderRadius: '4px', width: 26, height: 26 }}
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
                                    border: '1px solid var(--crm-blue-300)',
                                    borderRadius: '4px',
                                    backgroundColor: 'var(--mui-palette-primary-soft)',
                                    color: 'var(--crm-text-blue-700)',
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
                                sx={{ border: '1px solid var(--mui-palette-border-main)', borderRadius: '4px', width: 26, height: 26 }}
                            >
                                &gt;
                            </IconButton>
                            <IconButton
                                size="small"
                                disabled={currentPage >= totalPages}
                                onClick={() => onPageChange(totalPages)}
                                sx={{ border: '1px solid var(--mui-palette-border-main)', borderRadius: '4px', width: 26, height: 26 }}
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
                borderBottom: '1px solid var(--mui-palette-border-main)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: 1.5,
                backgroundColor: 'var(--mui-palette-background-paper)',
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
                    border: '1px solid var(--mui-palette-border-strong)',
                    backgroundColor: 'var(--mui-palette-background-subtle)',
                    width: searchWidth,
                    '&:focus-within': {
                        borderColor: 'var(--mui-palette-primary-main)',
                        backgroundColor: 'var(--mui-palette-background-paper)',
                        boxShadow: '0 0 0 2px rgb(var(--crm-accent-rgb) / 0.1)',
                    },
                }}
            >
                <SearchIcon sx={{ fontSize: 18, color: 'var(--mui-palette-text-muted)' }} />
                <InputBase
                    placeholder={searchPlaceholder}
                    value={searchQuery}
                    onChange={(e) => onSearchChange(e.target.value)}
                    sx={{
                        fontSize: '0.82rem',
                        color: 'var(--mui-palette-text-primary)',
                        width: '100%',
                    }}
                />
            </Box>

            {/* Actions: Bulk selection or primary actions */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                {selectedCount > 0 ? (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                        <Typography sx={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--crm-text-blue-700)' }}>
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

                {onColumnClick && (
                    <Tooltip title="Modify Columns">
                        <IconButton
                            size="small"
                            aria-label="Modify Columns"
                            onClick={(e) => onColumnClick(e.currentTarget)}
                            sx={{
                                color: 'var(--mui-palette-text-secondary)',
                                border: '1px solid var(--mui-palette-border-main)',
                                borderRadius: '8px',
                                p: 0.8,
                                '&:hover': { backgroundColor: 'var(--mui-palette-background-hover)', color: 'var(--crm-blue-700)' },
                            }}
                        >
                            <ViewColumnIcon sx={{ fontSize: 18 }} />
                        </IconButton>
                    </Tooltip>
                )}

                {onRefresh && (
                    <Tooltip title={refreshTooltip}>
                        <IconButton
                            size="small"
                            onClick={onRefresh}
                            sx={{
                                color: 'var(--mui-palette-text-secondary)',
                                border: '1px solid var(--mui-palette-border-main)',
                                borderRadius: '8px',
                                p: 0.8,
                                '&:hover': { backgroundColor: 'var(--mui-palette-background-hover)', color: 'var(--crm-blue-700)' },
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
                            background: 'linear-gradient(135deg, var(--crm-fill-blue-700) 0%, var(--crm-fill-blue-600) 100%)',
                            borderRadius: '8px',
                            textTransform: 'none',
                            fontWeight: 700,
                            fontSize: '0.82rem',
                            height: 34,
                            px: 2,
                            boxShadow: '0 2px 6px rgb(var(--crm-accent-rgb) / 0.25)',
                            '&:hover': { background: 'linear-gradient(135deg, var(--crm-fill-blue-800) 0%, var(--crm-fill-blue-700) 100%)' },
                        }}
                    >
                        {newButtonLabel}
                    </Button>
                )}
            </Box>
        </Box>
    );
}
