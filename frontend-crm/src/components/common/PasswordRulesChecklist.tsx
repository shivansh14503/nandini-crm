'use client';

import React from 'react';
import { Box, Typography } from '@mui/material';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import RadioButtonUncheckedRoundedIcon from '@mui/icons-material/RadioButtonUncheckedRounded';
import {
    passwordRulesFor,
    passwordStrength,
    type PasswordAudience,
    type PasswordPolicyContext,
    type PasswordStrengthLevel,
} from '@/utils/passwordPolicy';

/** Hides text visually but keeps it for screen readers. Strings, not numbers: in `sx` a width of 1 means 100%. */
export const visuallyHiddenSx = {
    position: 'absolute',
    width: '1px',
    height: '1px',
    p: 0,
    m: '-1px',
    overflow: 'hidden',
    clip: 'rect(0 0 0 0)',
    whiteSpace: 'nowrap',
    border: 0,
} as const;

const STRENGTH_COLOR: Record<PasswordStrengthLevel, string> = {
    empty: 'var(--mui-palette-border-main)',
    weak: 'var(--mui-palette-error-main)',
    fair: 'var(--mui-palette-warning-main)',
    good: 'var(--mui-palette-success-main)',
    strong: 'var(--mui-palette-success-main)',
};

const HEADING: Record<PasswordAudience, string> = {
    self: 'Your new password needs',
    admin: 'The password needs',
};

/** 4-segment strength meter with its label ("Weak" … "Strong"); advisory only. */
function StrengthMeter({ password, context }: { password: string; context: PasswordPolicyContext }) {
    const strength = passwordStrength(password, context);
    return (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }} aria-live="polite">
            <Box sx={{ display: 'flex', gap: 0.4 }} aria-hidden>
                {[1, 2, 3, 4].map((segment) => (
                    <Box
                        key={segment}
                        sx={{
                            width: 22,
                            height: 5,
                            borderRadius: '3px',
                            backgroundColor: segment <= strength.score ? STRENGTH_COLOR[strength.level] : 'var(--mui-palette-border-main)',
                            transition: 'background-color 0.2s ease',
                        }}
                    />
                ))}
            </Box>
            <Typography sx={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--mui-palette-text-secondary)', minWidth: 44 }}>{strength.label}</Typography>
        </Box>
    );
}

/**
 * Live checklist of the password rules (met / not yet), driven by `utils/passwordPolicy.ts`, the frontend mirror of
 * the API's policy. `audience="self"` (My Profile › Change password) lists every rule, including "Different from your
 * current password" when `context.currentPassword` is given; `audience="admin"` (Admin › Users › set / reset a
 * password) leaves that rule out and words "Not the username" for the person being set up. Link the password input to
 * it with `aria-describedby={id}`.
 */
export function PasswordRulesChecklist({
    password,
    context,
    audience = 'self',
    showStrength = false,
    id,
}: {
    password: string;
    context: PasswordPolicyContext;
    audience?: PasswordAudience;
    /** Show the advisory strength meter next to the heading. */
    showStrength?: boolean;
    id?: string;
}) {
    return (
        <Box
            id={id}
            sx={{
                p: 1.5,
                borderRadius: '10px',
                backgroundColor: 'var(--mui-palette-background-subtle)',
                border: '1px solid var(--mui-palette-border-light)',
                minWidth: 0,
            }}
        >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1, flexWrap: 'wrap' }}>
                <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--crm-slate-700)', flex: 1, minWidth: 140 }}>{HEADING[audience]}</Typography>
                {showStrength && <StrengthMeter password={password} context={context} />}
            </Box>
            <Box
                component="ul"
                sx={{ m: 0, p: 0, listStyle: 'none', display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'repeat(2, minmax(0, 1fr))' }, gap: 0.75 }}
            >
                {passwordRulesFor(audience).map((rule) => {
                    const met = password !== '' && rule.test(password, context);
                    return (
                        <Box
                            component="li"
                            key={rule.key}
                            sx={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 0.75,
                                fontSize: '0.78rem',
                                color: met ? 'var(--crm-slate-900)' : 'var(--mui-palette-text-secondary)',
                                minWidth: 0,
                            }}
                        >
                            {met ? (
                                <CheckCircleRoundedIcon sx={{ fontSize: 16, flexShrink: 0, color: 'var(--mui-palette-success-main)' }} />
                            ) : (
                                <RadioButtonUncheckedRoundedIcon sx={{ fontSize: 16, flexShrink: 0, color: 'var(--mui-palette-text-muted)' }} />
                            )}
                            <span>
                                {rule.label}
                                <Box component="span" sx={visuallyHiddenSx}>
                                    {met ? ' (done)' : ' (not yet)'}
                                </Box>
                            </span>
                        </Box>
                    );
                })}
            </Box>
        </Box>
    );
}
