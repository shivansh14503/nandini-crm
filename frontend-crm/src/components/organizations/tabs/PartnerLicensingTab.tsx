'use client';

import React, { useState } from 'react';
import {
    Box,
    Typography,
    TextField,
    Button,
    IconButton,
    InputAdornment,
    Table,
    TableHead,
    TableBody,
    TableRow,
    TableCell,
    TableContainer,
    Paper,
    Chip,
} from '@mui/material';

// Icons
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import BusinessIcon from '@mui/icons-material/Business';
import ClearIcon from '@mui/icons-material/Clear';
import HandshakeOutlinedIcon from '@mui/icons-material/HandshakeOutlined';

import { FIELD_MAX_LENGTH, FormField, SectionLabel, fieldSizeMaxWidth, fieldSx } from '@/components/forms';
import type { OrganizationFormData } from '@/types/organization.types';
import { useFormMode } from '@/context/FormModeContext';

export interface PartnerLicensingTabProps {
    form: OrganizationFormData;
    set: <K extends keyof OrganizationFormData>(key: K, value: OrganizationFormData[K]) => void;
}

export function PartnerLicensingTab({ form, set }: PartnerLicensingTabProps) {
    const isView = useFormMode().mode === 'view';
    const [inputValue, setInputValue] = useState('');

    const partnerCompanies = form.partnerCompanies || [];

    const handleAddPartner = () => {
        const trimmed = inputValue.trim();
        if (!trimmed) return;
        if (partnerCompanies.includes(trimmed)) return;
        set('partnerCompanies', [...partnerCompanies, trimmed]);
        setInputValue('');
    };

    const handleRemovePartner = (index: number) => {
        set(
            'partnerCompanies',
            partnerCompanies.filter((_, i) => i !== index)
        );
    };

    const handleClearInput = () => {
        setInputValue('');
    };

    return (
        <Box sx={{ p: { xs: 2.5, md: 3.5 } }}>
            <SectionLabel
                icon={<HandshakeOutlinedIcon sx={{ fontSize: 18 }} />}
                label="Partner Company Associations"
            />

            {/* ── Partner Company Input with Search and Clear ─────────────── */}
            {!isView && (
            <FormField label="Partner Company" size="lg" sx={{ mb: 3 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    <TextField
                        fullWidth
                        size="small"
                        placeholder="Search or enter partner company name..."
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                                e.preventDefault();
                                handleAddPartner();
                            }
                        }}
                        sx={fieldSx}
                        slotProps={{
                            htmlInput: { maxLength: FIELD_MAX_LENGTH.organizationName },
                            input: {
                                endAdornment: inputValue ? (
                                    <InputAdornment position="end">
                                        <IconButton
                                            size="small"
                                            onClick={handleClearInput}
                                            sx={{ color: 'var(--crm-gray-400)' }}
                                        >
                                            <ClearIcon sx={{ fontSize: 16 }} />
                                        </IconButton>
                                    </InputAdornment>
                                ) : undefined,
                            },
                        }}
                    />
                    <Button
                        variant="contained"
                        size="small"
                        onClick={handleAddPartner}
                        startIcon={<AddIcon fontSize="small" />}
                        sx={{
                            background: 'linear-gradient(135deg, var(--crm-fill-blue-600) 0%, var(--crm-fill-blue-700) 100%)',
                            borderRadius: '8px',
                            textTransform: 'none',
                            fontWeight: 600,
                            fontSize: '0.82rem',
                            height: 38,
                            px: 2,
                            whiteSpace: 'nowrap',
                            boxShadow: '0 2px 6px rgb(var(--crm-accent-rgb) / 0.25)',
                            '&:hover': { background: 'linear-gradient(135deg, var(--crm-fill-blue-700) 0%, var(--crm-fill-blue-900) 100%)' },
                        }}
                    >
                        Add Company
                    </Button>
                </Box>
            </FormField>
            )}

            {/* ── Partner Company Table Matching Screenshot ───────────────── */}
            <TableContainer
                component={Paper}
                elevation={0}
                sx={{
                    maxWidth: fieldSizeMaxWidth('lg'),
                    border: '1px solid var(--mui-palette-border-main)',
                    borderRadius: '10px',
                    overflow: 'hidden',
                }}
            >
                <Table size="small">
                    <TableHead>
                        <TableRow sx={{ backgroundColor: 'var(--mui-palette-info-main)' }}>
                            <TableCell
                                sx={{
                                    color: '#fff',
                                    fontWeight: 700,
                                    fontSize: '0.78rem',
                                    py: 1.2,
                                    width: 70,
                                    letterSpacing: '0.04em',
                                }}
                            >
                                SR
                            </TableCell>
                            <TableCell
                                sx={{
                                    color: '#fff',
                                    fontWeight: 700,
                                    fontSize: '0.78rem',
                                    py: 1.2,
                                    letterSpacing: '0.04em',
                                }}
                            >
                                Partner Company
                            </TableCell>
                            <TableCell
                                align="right"
                                sx={{
                                    color: '#fff',
                                    fontWeight: 700,
                                    fontSize: '0.78rem',
                                    py: 1.2,
                                    width: 80,
                                }}
                            >
                                Action
                            </TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {partnerCompanies.length === 0 ? (
                            <TableRow>
                                <TableCell
                                    colSpan={3}
                                    sx={{
                                        textAlign: 'center',
                                        py: 4,
                                        color: 'var(--crm-gray-400)',
                                        fontSize: '0.84rem',
                                        backgroundColor: 'var(--mui-palette-background-subtle)',
                                    }}
                                >
                                    <Box
                                        sx={{
                                            display: 'flex',
                                            flexDirection: 'column',
                                            alignItems: 'center',
                                            gap: 1,
                                        }}
                                    >
                                        <BusinessIcon sx={{ fontSize: 28, color: 'var(--crm-slate-300)' }} />
                                        <Typography sx={{ fontSize: '0.82rem', color: 'var(--mui-palette-text-secondary)' }}>
                                            No partner companies linked yet.
                                        </Typography>
                                        <Typography sx={{ fontSize: '0.74rem', color: 'var(--crm-gray-400)' }}>
                                            Type a company name above and click &quot;Add Company&quot;.
                                        </Typography>
                                    </Box>
                                </TableCell>
                            </TableRow>
                        ) : (
                            partnerCompanies.map((name, index) => (
                                <TableRow
                                    key={`${name}-${index}`}
                                    sx={{
                                        '&:nth-of-type(even)': { backgroundColor: 'var(--mui-palette-background-subtle)' },
                                        '&:hover': { backgroundColor: 'var(--mui-palette-background-hover)' },
                                    }}
                                >
                                    <TableCell
                                        sx={{
                                            fontSize: '0.82rem',
                                            fontWeight: 600,
                                            color: 'var(--mui-palette-text-secondary)',
                                            py: 1.2,
                                        }}
                                    >
                                        {index + 1}
                                    </TableCell>
                                    <TableCell
                                        sx={{
                                            fontSize: '0.84rem',
                                            fontWeight: 600,
                                            color: 'var(--mui-palette-text-primary)',
                                            py: 1.2,
                                        }}
                                    >
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                            <Chip
                                                label="Partner"
                                                size="small"
                                                sx={{
                                                    height: 20,
                                                    fontSize: '0.68rem',
                                                    backgroundColor: 'var(--crm-indigo-100)',
                                                    color: 'var(--crm-indigo-700)',
                                                    fontWeight: 600,
                                                }}
                                            />
                                            {name}
                                        </Box>
                                    </TableCell>
                                    <TableCell align="right" sx={{ py: 1.2 }}>
                                        {!isView && (
                                        <IconButton
                                            size="small"
                                            onClick={() => handleRemovePartner(index)}
                                            sx={{
                                                color: 'var(--crm-gray-400)',
                                                '&:hover': { color: 'var(--crm-red-500)' },
                                            }}
                                        >
                                            <DeleteIcon fontSize="small" />
                                        </IconButton>
                                        )}
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </TableContainer>
        </Box>
    );
}
