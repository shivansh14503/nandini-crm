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
import {
    EmailCheckAdornment,
    EmailCheckHint,
    EmailVerificationBadge,
    hasEmailWarning,
    isEmailUndeliverable,
    useEmailCheck,
} from './EmailVerification';
import { FIELD_MAX_LENGTH } from './fieldSizing';
import { useFormMode } from '@/context/FormModeContext';
import { EmailActions } from '../common/ContactActions';
import type { CorporateEmail } from '@/types/organization.types';

export interface EmailRowProps {
    email: CorporateEmail;
    onChange: (updated: CorporateEmail) => void;
    /** Omitted for a row that can't be removed (the list's last remaining address). */
    onRemove?: () => void;
    /**
     * Informational (non-error) note shown under the address. Text is wrapped in a `FieldNotice`; an element
     * (e.g. `ExistingRecordMatches`) is shown as is.
     */
    notice?: React.ReactNode;
    /** Address input placeholder (form builder › Placeholder). */
    placeholder?: string;
    /** Validation error of this row's address (schema format check, or the server rejecting the address). */
    error?: string;
}

export function EmailRow({ email, onChange, onRemove, notice, placeholder = 'e.g. contact@domain.com', error }: EmailRowProps) {
    const { mode } = useFormMode();
    const { state: checkState, check } = useEmailCheck(mode === 'view' ? '' : email.email);
    // The form's own error wins; otherwise an address the check found undeliverable shows as a field error too.
    const errorText = error ?? (isEmailUndeliverable(checkState) ? checkState.result.message ?? undefined : undefined);
    // A new address drops the saved result; the server verifies it again after save.
    const setAddress = (value: string) =>
        onChange({ ...email, email: value, verificationStatus: null, verificationReason: null, verifiedAt: null });
    if (mode === 'view') {
        return (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', py: 0.75 }}>
                <Typography sx={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--crm-slate-900)' }}>{email.email || '—'}</Typography>
                <EmailActions email={email.email} />
                <EmailVerificationBadge email={email} />
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
                    onChange={(e) => setAddress(e.target.value.toLowerCase().trim())}
                    onBlur={check}
                    error={Boolean(errorText)}
                    helperText={errorText}
                    slotProps={{
                        input: { endAdornment: errorText ? undefined : <EmailCheckAdornment state={checkState} /> },
                        htmlInput: { maxLength: FIELD_MAX_LENGTH.email },
                    }}
                    sx={fieldSx}
                />
                <EmailVerificationBadge email={email} />
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
            {!errorText && hasEmailWarning(checkState) && (
                <Box sx={{ mt: -0.5, mb: 1 }}>
                    <EmailCheckHint state={checkState} onApplySuggestion={setAddress} />
                </Box>
            )}
            {notice && (
                <Box sx={{ mt: -0.5, mb: 1 }}>
                    {React.isValidElement(notice) ? notice : <FieldNotice>{notice}</FieldNotice>}
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
