'use client';

import React from 'react';
import { ButtonBase, Chip, CircularProgress, InputAdornment, Tooltip } from '@mui/material';
import VerifiedIcon from '@mui/icons-material/Verified';
import { FieldNotice } from './FieldNotice';
import { emailVerificationService, type EmailCheckResult } from '@/services/emailVerification.service';
import type { CorporateEmail } from '@/types/organization.types';
import { fmtInstantDay, getDisplayFormats, useDisplayFormats } from '@/utils/formats';

/** Plain-language explanation of a stored verification reason (server and provider codes). */
export const REASON_TEXT: Record<string, string> = {
    syntax: 'The address is not in a valid format.',
    typo: 'The domain looks like a typo of a common email provider.',
    disposable: 'This is a disposable (temporary) email provider.',
    domain_not_found: 'The domain does not exist.',
    domain_no_mail: 'The domain does not accept email.',
    no_mx_record: 'The domain has no mail server set up.',
    accept_all: 'The domain accepts every address, so this mailbox could not be confirmed.',
    accepted_email: 'The mailbox exists and accepts email.',
    rejected_email: 'The mail server says this mailbox does not exist.',
    invalid_email: 'The address is not valid.',
    invalid_domain: 'The domain is not valid.',
    no_connect: 'The mail server could not be reached.',
    timeout: 'The mail server did not answer in time.',
    unavailable_smtp: 'The mail server was unavailable.',
    unexpected_error: 'The check could not be completed.',
    admin_accepted: 'An administrator accepted this address.',
    not_safe_to_send: 'The mailbox exists, but the provider does not consider it safe to send to (e.g. catch-all or disposable).',
    temporarily_blocked: 'The mail server temporarily refused the check (greylisting).',
    exceeded_storage: 'The mailbox is full.',
};

const STATUS_STYLE = {
    valid: { label: 'Verified', color: 'var(--mui-palette-success-main)', bg: 'var(--mui-palette-success-soft)' },
    risky: { label: 'Risky', color: 'var(--crm-amber-700)', bg: 'var(--mui-palette-warning-soft)' },
    invalid: { label: 'Invalid', color: 'var(--mui-palette-error-main)', bg: 'var(--mui-palette-error-soft)' },
} as const;

/** ` Checked 3 Dec 2026.`: the device's own date style until the company formats are saved, then the company's. */
function formatCheckedAt(iso: string | null | undefined): string {
    if (!iso) return '';
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '';
    const day = getDisplayFormats().customized ? fmtInstantDay(date) : date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
    return ` Checked ${day}.`;
}

/** Chip for the server's saved verification result; nothing when the address hasn't been decided yet. */
export function EmailVerificationBadge({ email }: { email: CorporateEmail }) {
    useDisplayFormats(); // the "Checked …" date follows an admin's format change
    const status = email.verificationStatus;
    if (!status || !email.email) return null;
    const style = STATUS_STYLE[status];
    const reason = (email.verificationReason && REASON_TEXT[email.verificationReason]) ?? '';
    return (
        <Tooltip title={`${reason}${formatCheckedAt(email.verifiedAt)}`.trim() || style.label}>
            <Chip
                label={style.label}
                size="small"
                sx={{ height: 20, fontSize: '0.68rem', fontWeight: 700, color: style.color, backgroundColor: style.bg, cursor: 'help' }}
            />
        </Tooltip>
    );
}

export type EmailCheckState =
    | { phase: 'idle' }
    | { phase: 'checking' }
    | { phase: 'done'; result: EmailCheckResult }
    | { phase: 'error' };

const IDLE: EmailCheckState = { phase: 'idle' };

/**
 * Runs the free server checks for an address the user just finished typing. `check()` is called on blur; the
 * state always belongs to the current value (editing the address drops a stale result or in-flight check).
 */
export function useEmailCheck(value: string) {
    const [state, setState] = React.useState<EmailCheckState>(IDLE);
    const abortRef = React.useRef<AbortController | null>(null);
    const lastChecked = React.useRef<string>('');

    React.useEffect(() => {
        if (value.trim().toLowerCase() === lastChecked.current) return;
        lastChecked.current = '';
        abortRef.current?.abort();
        setState(IDLE);
    }, [value]);

    React.useEffect(() => () => abortRef.current?.abort(), []);

    const check = React.useCallback(() => {
        const email = value.trim().toLowerCase();
        if (!email || email === lastChecked.current) return;
        lastChecked.current = email;
        abortRef.current?.abort();
        const controller = new AbortController();
        abortRef.current = controller;
        setState({ phase: 'checking' });
        emailVerificationService
            .check(email, controller.signal)
            .then((result) => {
                if (!controller.signal.aborted) setState({ phase: 'done', result });
            })
            .catch(() => {
                if (controller.signal.aborted) return;
                // Never shown as a problem with the address; the save re-checks it.
                lastChecked.current = '';
                setState({ phase: 'error' });
            });
    }, [value]);

    return { state, check };
}

type DoneState = { phase: 'done'; result: EmailCheckResult };

/** The address can't receive email: shown as the field's error, like any other invalid field (and the save rejects it). */
export const isEmailUndeliverable = (state: EmailCheckState): state is DoneState =>
    state.phase === 'done' && state.result.status === 'invalid';

/** Doubtful but allowed (typo suggestion, disposable, catch-all domain): an amber note under the field. */
export const hasEmailWarning = (state: EmailCheckState): state is DoneState =>
    state.phase === 'done' && state.result.status === 'risky' && Boolean(state.result.message);

/** End adornment of the address input, like the organization name field: a spinner while checking, a green tick only when the mailbox was confirmed. */
export function EmailCheckAdornment({ state }: { state: EmailCheckState }) {
    if (state.phase === 'checking') {
        return (
            <InputAdornment position="end">
                <CircularProgress size={16} aria-label="Checking email" />
            </InputAdornment>
        );
    }
    if (state.phase === 'done' && state.result.status === 'valid') {
        return (
            <InputAdornment position="end">
                <Tooltip title="Mailbox exists and accepts email.">
                    <VerifiedIcon aria-label="Email verified" sx={{ fontSize: 18, color: 'var(--mui-palette-success-main)' }} />
                </Tooltip>
            </InputAdornment>
        );
    }
    return null;
}

/** Amber note under the address for doubtful addresses, with a one-click fix for a provider typo. */
export function EmailCheckHint({ state, onApplySuggestion }: { state: EmailCheckState; onApplySuggestion: (email: string) => void }) {
    if (!hasEmailWarning(state)) return null;
    const { result } = state;

    if (result.suggestion) {
        const suggestion = result.suggestion;
        return (
            <FieldNotice>
                Did you mean{' '}
                <ButtonBase
                    onClick={() => onApplySuggestion(suggestion)}
                    sx={{
                        font: 'inherit',
                        fontWeight: 700,
                        verticalAlign: 'baseline',
                        color: 'var(--crm-text-blue-700)',
                        textDecoration: 'underline',
                        textUnderlineOffset: '2px',
                        borderRadius: '3px',
                        transition: 'color 0.15s ease',
                        '&:hover': { color: 'var(--crm-text-blue-600)' },
                        '&.Mui-focusVisible': { boxShadow: '0 0 0 3px rgb(var(--crm-accent-rgb) / 0.22)' },
                    }}
                >
                    {suggestion}
                </ButtonBase>
                ?
            </FieldNotice>
        );
    }

    return <FieldNotice>{result.message}</FieldNotice>;
}
