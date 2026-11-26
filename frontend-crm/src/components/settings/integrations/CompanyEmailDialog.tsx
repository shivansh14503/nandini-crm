'use client';

import React, { useState } from 'react';
import { Alert, Box, Button, Checkbox, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, TextField, Typography } from '@mui/material';
import { errorMessage, inputSx, primaryButtonSx, secondaryButtonSx } from '@/components/settings/form-customization/builderUi';
import { useSetPersonEmail } from '@/hooks/queries/useIntegrationsAdmin';
import { USER_EMAIL_MAX_LENGTH, type Person } from '@/types/integration.types';
import { fieldErrorsOf, hintSx } from './integrationUi';

const isCompanyAddress = (email: string, domains: string[]) => {
    const domain = email.trim().toLowerCase().split('@')[1] ?? '';
    return domains.some((d) => domain === d);
};

/**
 * Edits one person's company email (the users email service rule: lower-cased, unique among active people, a company
 * domain unless "allow another domain" is ticked). Blank clears it. Mount with a `key` per person so it starts fresh.
 */
export function CompanyEmailDialog({
    person,
    companyDomains,
    onClose,
    onSaved,
}: {
    person: Person | null;
    companyDomains: string[];
    onClose: () => void;
    onSaved: (person: Person) => void;
}) {
    const [email, setEmail] = useState(person?.email ?? '');
    const [allowOther, setAllowOther] = useState(false);
    const [fieldError, setFieldError] = useState('');
    const [formError, setFormError] = useState('');
    const save = useSetPersonEmail();

    const trimmed = email.trim();
    const otherDomain = trimmed.includes('@') && !isCompanyAddress(trimmed, companyDomains);
    const unchanged = trimmed.toLowerCase() === (person?.email ?? '').toLowerCase();

    const submit = async () => {
        if (!person) return;
        setFieldError('');
        setFormError('');
        try {
            const saved = await save.mutateAsync({ username: person.username, payload: { email: trimmed, allowOtherDomain: allowOther } });
            onSaved(saved);
        } catch (err) {
            const fields = fieldErrorsOf(err);
            if (fields.email) setFieldError(fields.email);
            else setFormError(errorMessage(err, 'Could not save the email.'));
        }
    };

    return (
        <Dialog
            open={Boolean(person)}
            onClose={save.isPending ? undefined : onClose}
            maxWidth="xs"
            fullWidth
            slotProps={{ paper: { sx: { borderRadius: '12px', m: { xs: 1.5, sm: 4 }, width: { xs: 'calc(100% - 24px)', sm: undefined } } } }}
        >
            <DialogTitle sx={{ fontWeight: 700, fontSize: '1rem', color: 'var(--crm-slate-900)', pb: 0.5 }}>Company email</DialogTitle>
            <Box
                component="form"
                onSubmit={(e: React.FormEvent) => {
                    e.preventDefault();
                    if (!unchanged) void submit();
                }}
            >
                <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, pt: '8px !important' }}>
                    {person && (
                        <Typography sx={{ fontSize: '0.84rem', color: 'var(--crm-slate-700)' }}>
                            <Box component="span" sx={{ fontWeight: 700, color: 'var(--crm-slate-900)' }}>
                                {person.fullName || person.username}
                            </Box>{' '}
                            ({person.username})
                        </Typography>
                    )}
                    <TextField
                        autoFocus
                        label="Email"
                        type="email"
                        size="small"
                        fullWidth
                        value={email}
                        onChange={(e) => {
                            setEmail(e.target.value);
                            setFieldError('');
                        }}
                        disabled={save.isPending}
                        error={Boolean(fieldError)}
                        helperText={fieldError || 'Calendars can only be connected with this address. Leave blank to clear it.'}
                        autoComplete="off"
                        sx={inputSx}
                        slotProps={{ htmlInput: { maxLength: USER_EMAIL_MAX_LENGTH, spellCheck: false, autoCapitalize: 'none' } }}
                    />
                    {(otherDomain || allowOther) && (
                        <Box>
                            <FormControlLabel
                                control={<Checkbox size="small" checked={allowOther} onChange={(e) => setAllowOther(e.target.checked)} disabled={save.isPending} />}
                                label={<Typography sx={{ fontSize: '0.82rem', color: 'var(--crm-slate-700)' }}>Allow an address outside the company domains</Typography>}
                                sx={{ ml: 0 }}
                            />
                            <Typography sx={hintSx}>Company domains: {companyDomains.join(', ') || 'none set'}.</Typography>
                        </Box>
                    )}
                    {formError && <Alert severity="error">{formError}</Alert>}
                </DialogContent>
                <DialogActions sx={{ px: 3, pb: 2, gap: 1, flexWrap: 'wrap' }}>
                    <Button variant="outlined" sx={secondaryButtonSx} onClick={onClose} disabled={save.isPending}>
                        Cancel
                    </Button>
                    <Button
                        type="submit"
                        variant="contained"
                        sx={primaryButtonSx}
                        disabled={save.isPending || unchanged}
                        startIcon={save.isPending ? <CircularProgress size={14} color="inherit" /> : undefined}
                    >
                        {trimmed ? 'Save email' : 'Clear email'}
                    </Button>
                </DialogActions>
            </Box>
        </Dialog>
    );
}
