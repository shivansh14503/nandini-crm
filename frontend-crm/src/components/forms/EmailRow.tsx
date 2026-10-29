import React from 'react';
import {
    Box,
    Chip,
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
import { fieldSx } from './FormField';
import { FIELD_MAX_LENGTH } from './fieldSizing';
import { useFormMode } from '@/context/FormModeContext';
import { DrawerCopyButton } from '../common/Drawer/DrawerPrimitives';
import type { CorporateEmail } from '@/types/organization.types';

export interface EmailRowProps {
    email: CorporateEmail;
    onChange: (updated: CorporateEmail) => void;
    onRemove: () => void;
}

export function EmailRow({ email, onChange, onRemove }: EmailRowProps) {
    const { mode } = useFormMode();
    if (mode === 'view') {
        return (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', py: 0.75 }}>
                <Typography sx={{ fontSize: '0.88rem', fontWeight: 600, color: '#0f172a' }}>{email.email || '—'}</Typography>
                {email.email && <DrawerCopyButton text={email.email} title="Copy email" />}
                {email.isPrimary && <Chip label="Primary" size="small" sx={{ height: 20, fontSize: '0.68rem', fontWeight: 700, color: '#1d4ed8', backgroundColor: '#eff6ff' }} />}
                {email.isOptedOut && <Chip label="Opted Out (DND)" size="small" sx={{ height: 20, fontSize: '0.68rem', fontWeight: 700, color: '#b45309', backgroundColor: '#fef3c7' }} />}
                {email.isInvalidBounce && <Chip label="Invalid Bounce" size="small" sx={{ height: 20, fontSize: '0.68rem', fontWeight: 700, color: '#b91c1c', backgroundColor: '#fee2e2' }} />}
            </Box>
        );
    }
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
                    type="email"
                    value={email.email}
                    placeholder="e.g. contact@domain.com"
                    onChange={(e) => onChange({ ...email, email: e.target.value.toLowerCase().trim() })}
                    slotProps={{ htmlInput: { maxLength: FIELD_MAX_LENGTH.email } }}
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
