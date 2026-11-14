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
import { FieldNotice } from './FieldNotice';
import { FIELD_MAX_LENGTH } from './fieldSizing';
import { useFormMode } from '@/context/FormModeContext';
import { DrawerCopyButton } from '../common/Drawer/DrawerPrimitives';
import type { CorporateEmail } from '@/types/organization.types';

export interface EmailRowProps {
    email: CorporateEmail;
    onChange: (updated: CorporateEmail) => void;
    /** Omitted for a row that can't be removed (the list's last remaining address). */
    onRemove?: () => void;
    /** Informational (non-error) note shown under the address, e.g. "Already exists in CRM". */
    notice?: React.ReactNode;
    /** Address input placeholder (form builder › Placeholder). */
    placeholder?: string;
}

export function EmailRow({ email, onChange, onRemove, notice, placeholder = 'e.g. contact@domain.com' }: EmailRowProps) {
    const { mode } = useFormMode();
    if (mode === 'view') {
        return (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', py: 0.75 }}>
                <Typography sx={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--crm-slate-900)' }}>{email.email || '—'}</Typography>
                {email.email && <DrawerCopyButton text={email.email} title="Copy email" />}
                {email.isPrimary && <Chip label="Primary" size="small" sx={{ height: 20, fontSize: '0.68rem', fontWeight: 700, color: 'var(--crm-text-blue-700)', backgroundColor: 'var(--mui-palette-primary-soft)' }} />}
                {email.isOptedOut && <Chip label="Opted Out (DND)" size="small" sx={{ height: 20, fontSize: '0.68rem', fontWeight: 700, color: 'var(--crm-amber-700)', backgroundColor: 'var(--crm-amber-100)' }} />}
                {email.isInvalidBounce && <Chip label="Invalid Bounce" size="small" sx={{ height: 20, fontSize: '0.68rem', fontWeight: 700, color: 'var(--crm-red-700)', backgroundColor: 'var(--crm-red-100)' }} />}
            </Box>
        );
    }
    return (
        <Box
            sx={{
                mb: 1.5,
                border: '1px solid var(--crm-gray-200)',
                borderRadius: '8px',
                p: 1.5,
                backgroundColor: 'var(--mui-palette-background-paper)',
            }}
        >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                <TextField
                    fullWidth
                    size="small"
                    type="email"
                    value={email.email}
                    placeholder={placeholder}
                    onChange={(e) => onChange({ ...email, email: e.target.value.toLowerCase().trim() })}
                    slotProps={{ htmlInput: { maxLength: FIELD_MAX_LENGTH.email } }}
                    sx={fieldSx}
                />
                {onRemove && (
                    <Tooltip title="Remove email">
                        <IconButton
                            onClick={onRemove}
                            size="small"
                            sx={{ color: 'var(--crm-gray-400)', '&:hover': { color: 'var(--crm-red-500)' }, flexShrink: 0 }}
                        >
                            <DeleteIcon fontSize="small" />
                        </IconButton>
                    </Tooltip>
                )}
            </Box>
            {notice && (
                <Box sx={{ mt: -0.5, mb: 1 }}>
                    <FieldNotice>{notice}</FieldNotice>
                </Box>
            )}
            <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
                <FormControlLabel
                    control={
                        <Radio
                            size="small"
                            checked={email.isPrimary}
                            onChange={() => onChange({ ...email, isPrimary: true })}
                            sx={{ color: 'var(--crm-text-blue-600)', '&.Mui-checked': { color: 'var(--crm-text-blue-600)' }, p: 0.5 }}
                        />
                    }
                    label={
                        <Typography sx={{ fontSize: '0.78rem', color: 'var(--crm-gray-700)', fontWeight: 500 }}>
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
                            <Typography sx={{ fontSize: '0.78rem', color: 'var(--crm-gray-700)' }}>
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
                            <Typography sx={{ fontSize: '0.78rem', color: 'var(--crm-gray-700)' }}>
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
