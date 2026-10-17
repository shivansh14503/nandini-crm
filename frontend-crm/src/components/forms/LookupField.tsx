'use client';

import React, { useState } from 'react';
import {
    Box,
    TextField,
    IconButton,
    Autocomplete,
    Tooltip,
} from '@mui/material';
import ArrowForwardIosIcon from '@mui/icons-material/ArrowForwardIos';
import ClearIcon from '@mui/icons-material/Clear';
import SearchIcon from '@mui/icons-material/Search';
import { fieldSx } from '../organizations/shared/constants';

export interface LookupFieldProps {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    options?: string[];
    onSelectClick?: () => void;
    required?: boolean;
}

export function LookupField({
    value,
    onChange,
    placeholder = 'Type or select...',
    options = [],
    onSelectClick,
    required = false,
}: LookupFieldProps) {
    const [inputValue, setInputValue] = useState(value);

    const handleClear = () => {
        onChange('');
        setInputValue('');
    };

    return (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            {options.length > 0 ? (
                <Autocomplete
                    freeSolo
                    options={options}
                    value={value || ''}
                    inputValue={inputValue}
                    onInputChange={(_, newInputValue) => {
                        setInputValue(newInputValue);
                        onChange(newInputValue);
                    }}
                    onChange={(_, newValue) => {
                        onChange(newValue || '');
                    }}
                    sx={{ flex: 1, ...fieldSx }}
                    renderInput={(params) => (
                        <TextField
                            {...params}
                            size="small"
                            placeholder={placeholder}
                            required={required}
                        />
                    )}
                />
            ) : (
                <TextField
                    fullWidth
                    size="small"
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    placeholder={placeholder}
                    required={required}
                    sx={fieldSx}
                />
            )}

            {/* Select / Search Action Button */}
            <Tooltip title="Select from Directory">
                <IconButton
                    size="small"
                    onClick={onSelectClick}
                    sx={{
                        width: 34,
                        height: 34,
                        borderRadius: '6px',
                        backgroundColor: '#1e3a8a',
                        color: '#fff',
                        flexShrink: 0,
                        '&:hover': { backgroundColor: '#1d4ed8' },
                    }}
                >
                    <ArrowForwardIosIcon sx={{ fontSize: 13 }} />
                </IconButton>
            </Tooltip>

            {/* Clear Action Button */}
            <Tooltip title="Clear selection">
                <IconButton
                    size="small"
                    onClick={handleClear}
                    disabled={!value}
                    sx={{
                        width: 34,
                        height: 34,
                        borderRadius: '6px',
                        backgroundColor: '#1e3a8a',
                        color: '#fff',
                        flexShrink: 0,
                        '&:hover': { backgroundColor: '#1d4ed8' },
                        '&.Mui-disabled': { backgroundColor: '#e2e8f0', color: '#94a3b8' },
                    }}
                >
                    <ClearIcon sx={{ fontSize: 14 }} />
                </IconButton>
            </Tooltip>
        </Box>
    );
}
