import React from 'react';
import {
    Box,
    TextField,
    Tooltip,
    IconButton,
    FormControlLabel,
    Radio,
    FormGroup,
    Checkbox,
    Typography,
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import { fieldSx } from './constants';
import type { CorporateEmail } from '../../../types/organization.types';

export interface EmailRowProps {
    email: CorporateEmail;
    onChange: (updated: CorporateEmail) => void;
    onRemove: () => void;
}

export function EmailRow({ email, onChange, onRemove }: EmailRowProps) {
    return (
        <Box
            sx={{
                mb: 1.5,
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                p: 1.5,
                backgroundColor: '#ffffff',
            }}
        >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                <TextField
                    fullWidth
                    size="small"
                    value={email.email}
                    placeholder="e.g. contact@domain.com"
                    onChange={(e) => onChange({ ...email, email: e.target.value })}
                    sx={fieldSx}
                />
                <Tooltip title="Remove email">
                    <IconButton
                        onClick={onRemove}
                        size="small"
                        sx={{ color: '#9ca3af', '&:hover': { color: '#ef4444' }, flexShrink: 0 }}
                    >
                        <DeleteIcon fontSize="small" />
                    </IconButton>
                </Tooltip>
            </Box>
            <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
                <FormControlLabel
                    control={
                        <Radio
                            size="small"
                            checked={email.isPrimary}
                            onChange={() => onChange({ ...email, isPrimary: true })}
                            sx={{ color: '#2563EB', '&.Mui-checked': { color: '#2563EB' }, p: 0.5 }}
                        />
                    }
                    label={
                        <Typography sx={{ fontSize: '0.78rem', color: '#374151', fontWeight: 500 }}>
                            Primary Contact
                        </Typography>
                    }
                    sx={{ m: 0 }}
                />
                <FormGroup row sx={{ gap: 1.5 }}>
                    <FormControlLabel
                        control={
                            <Checkbox
                                size="small"
                                checked={email.isOptedOut}
                                onChange={(e) => onChange({ ...email, isOptedOut: e.target.checked })}
                                sx={{ p: 0.5 }}
                            />
                        }
                        label={
                            <Typography sx={{ fontSize: '0.78rem', color: '#374151' }}>
                                Opted Out (DND)
                            </Typography>
                        }
                        sx={{ m: 0 }}
                    />
                    <FormControlLabel
                        control={
                            <Checkbox
                                size="small"
                                checked={email.isInvalidBounce}
                                onChange={(e) => onChange({ ...email, isInvalidBounce: e.target.checked })}
                                sx={{ p: 0.5 }}
                            />
                        }
                        label={
                            <Typography sx={{ fontSize: '0.78rem', color: '#374151' }}>
                                Invalid Bounce
                            </Typography>
                        }
                        sx={{ m: 0 }}
                    />
                </FormGroup>
            </Box>
        </Box>
    );
}
