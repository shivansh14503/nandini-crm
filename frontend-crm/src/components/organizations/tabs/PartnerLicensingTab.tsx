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

import { SectionLabel } from '../shared/SectionLabel';
import { fieldSx } from '../shared/constants';
import type { OrganizationFormData } from '../../../types/organization.types';

export interface PartnerLicensingTabProps {
    form: OrganizationFormData;
    set: <K extends keyof OrganizationFormData>(key: K, value: OrganizationFormData[K]) => void;
}

export function PartnerLicensingTab({ form, set }: PartnerLicensingTabProps) {
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
            <Box sx={{ maxWidth: 720, mb: 3 }}>
                <Typography
                    variant="body2"
                    sx={{ fontWeight: 600, color: '#374151', fontSize: '0.82rem', mb: 0.6 }}
                >
                    Partner Company
                </Typography>
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
                            input: {
                                endAdornment: inputValue ? (
                                    <InputAdornment position="end">
                                        <IconButton
                                            size="small"
                                            onClick={handleClearInput}
                                            sx={{ color: '#9ca3af' }}
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
                            background: 'linear-gradient(135deg, #2563EB 0%, #1d4ed8 100%)',
                            borderRadius: '8px',
                            textTransform: 'none',
                            fontWeight: 600,
                            fontSize: '0.82rem',
                            height: 38,
                            px: 2,
                            whiteSpace: 'nowrap',
                            boxShadow: '0 2px 6px rgba(37,99,235,0.25)',
                            '&:hover': { background: 'linear-gradient(135deg, #1d4ed8 0%, #1e3a8a 100%)' },
                        }}
                    >
                        Add Company
                    </Button>
                </Box>
            </Box>

            {/* ── Partner Company Table Matching Screenshot ───────────────── */}
            <TableContainer
                component={Paper}
                elevation={0}
                sx={{
                    maxWidth: 720,
                    border: '1px solid #e2e8f0',
                    borderRadius: '10px',
                    overflow: 'hidden',
                }}
            >
                <Table size="small">
                    <TableHead>
                        <TableRow sx={{ backgroundColor: '#0284c7' }}>
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
                                        color: '#9ca3af',
                                        fontSize: '0.84rem',
                                        backgroundColor: '#fafafa',
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
                                        <BusinessIcon sx={{ fontSize: 28, color: '#cbd5e1' }} />
                                        <Typography sx={{ fontSize: '0.82rem', color: '#64748b' }}>
                                            No partner companies linked yet.
                                        </Typography>
                                        <Typography sx={{ fontSize: '0.74rem', color: '#9ca3af' }}>
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
                                        '&:nth-of-type(even)': { backgroundColor: '#f8fafc' },
                                        '&:hover': { backgroundColor: '#f1f5f9' },
                                    }}
                                >
                                    <TableCell
                                        sx={{
                                            fontSize: '0.82rem',
                                            fontWeight: 600,
                                            color: '#64748b',
                                            py: 1.2,
                                        }}
                                    >
                                        {index + 1}
                                    </TableCell>
                                    <TableCell
                                        sx={{
                                            fontSize: '0.84rem',
                                            fontWeight: 600,
                                            color: '#1e293b',
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
                                                    backgroundColor: '#e0e7ff',
                                                    color: '#4338ca',
                                                    fontWeight: 600,
                                                }}
                                            />
                                            {name}
                                        </Box>
                                    </TableCell>
                                    <TableCell align="right" sx={{ py: 1.2 }}>
                                        <IconButton
                                            size="small"
                                            onClick={() => handleRemovePartner(index)}
                                            sx={{
                                                color: '#9ca3af',
                                                '&:hover': { color: '#ef4444' },
                                            }}
                                        >
                                            <DeleteIcon fontSize="small" />
                                        </IconButton>
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
