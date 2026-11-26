'use client';

import React from 'react';
import { Box, ButtonBase, Paper, Popper, Typography } from '@mui/material';
import { keyframes, type SxProps, type Theme } from '@mui/material/styles';
import EventRepeatOutlinedIcon from '@mui/icons-material/EventRepeatOutlined';
import EventAvailableOutlinedIcon from '@mui/icons-material/EventAvailableOutlined';
import { useFormContext, useFormState, useWatch } from 'react-hook-form';
import { localNow, parseTimeOfDay } from '@/utils/pastDates';
import { fmtDay, fmtTime, useDisplayFormats } from '@/utils/formats';
import { focusFormField } from '@/utils/formFocus';
import type { ConfigValidationIssue } from '@/utils/formConfig';

/**
 * Follow-up flow shared by the Lead and Opportunity edit forms. Every edit records a fresh "Customer Response"
 * (the edit form starts without one). Picking it opens a popup attached to the field that asks whether the saved
 * next follow-up still stands or a new one is needed; it can't be dismissed. A saved follow-up that has already
 * passed (or none at all) can't be kept: the date field is cleared and glows, and a warning toast says why.
 */

/**
 * The Customer Response field is the same on both forms (key `customerResponse`, this flow) and uses one list
 * (`shared_customer_response`). Each form reads it through the field's link: leads for the Rating rules
 * (`useLeadRatingConfig`), opportunities for the Sales Stages each option fits (`useOpportunityResponseConfig`).
 */
export const CUSTOMER_RESPONSE_CATEGORY = 'shared_customer_response';

/** Fallback options while the admin configuration loads (same defaults as the backend seed). */
export const CUSTOMER_RESPONSES: string[] = [
    'Interested',
    'Need More Information',
    'Requested Quotation',
    'Requested Demo',
    'Under Discussion',
    'Call Back Later',
    'Not Interested',
    'Price Issue',
    'Using Other Software',
    'No Requirement',
    'Requirement in Future',
    'No Response',
    'Wrong Number',
    'Not Reachable',
    'Do Not Contact',
];

/** The form fields the flow reads and writes (both forms use these names). */
interface FollowUpFields {
    customerResponse?: string;
    /** Never a value: only carries the "decision still pending" save error, so no visible field turns red. */
    followUpDecision?: string;
    nextFollowupDate?: string;
    nextFollowupTime?: string;
}

type Notify = (message: string, severity?: 'success' | 'error' | 'info' | 'warning') => void;

export interface UseFollowUpDecisionOptions {
    /** Edit mode only: a new record has no follow-up to report on, and view mode changes nothing. */
    enabled: boolean;
    /** Top-right toast of the form. */
    notify?: Notify;
    /** Told when the popup starts / stops awaiting an answer; feed it to {@link followUpEditIssues} so the form won't save meanwhile. */
    onPendingChange?: (pending: boolean) => void;
    /** Told the decision the save sends (`keep` / `new`), or null while none is made (or the response was cleared). */
    onDecisionChange?: (decision: FollowUpDecision | null) => void;
    /**
     * Leads: the response may be cleared again (a details-only edit), which puts the saved follow-up back and asks
     * nothing. Opportunities always record one.
     */
    responseOptional?: boolean;
    /**
     * No follow-up is asked for (a lead being closed): picking a response opens no popup. Report changes with the
     * returned `onSuspendChange` so a pending question is dropped (or asked again).
     */
    suspended?: boolean;
}

/**
 * Wiring of the flow inside a form's `FormProvider`. Pass `setAnchor` as the ref of the box around the Customer Response
 * field, call `onResponseChange` when the user picks a response, wrap the date field in `<FieldGlow active={glow}>`
 * and render `popper` anywhere in the section.
 */
export function useFollowUpDecision({ enabled, notify, onPendingChange, onDecisionChange, responseOptional = false, suspended = false }: UseFollowUpDecisionOptions) {
    const { control, setValue, getValues, clearErrors } = useFormContext<FollowUpFields>();
    // The record's saved follow-up (the form's defaults, set by `reset` when the record loads).
    const { defaultValues, submitCount } = useFormState({ control });
    // Save attempts made while the popup is open make it glow (instead of flagging the field).
    const [openedAtSubmit, setOpenedAtSubmit] = React.useState(0);
    const existing: FollowUpSlot = { date: defaultValues?.nextFollowupDate ?? '', time: defaultValues?.nextFollowupTime ?? '' };

    const [anchor, setAnchor] = React.useState<HTMLElement | null>(null);
    const [open, setOpen] = React.useState(false);
    const [glowRequested, setGlowRequested] = React.useState(false);
    const date = useWatch({ control, name: 'nextFollowupDate' }) ?? '';
    const time = useWatch({ control, name: 'nextFollowupTime' }) ?? '';

    const setPending = (pending: boolean) => onPendingChange?.(pending);

    // The question only exists for a picked response in edit mode. Discard resets the form (the response is gone), and
    // the edit page may be kept alive and shown again later (Next's cacheComponents), so drop it whenever either is
    // missing: the next Edit starts clean.
    const response = useWatch({ control, name: 'customerResponse' }) ?? '';
    const active = enabled && Boolean(response.trim());
    if (!active && (open || glowRequested || openedAtSubmit !== 0)) {
        setOpen(false);
        setGlowRequested(false);
        setOpenedAtSubmit(0);
    }
    // The form's own copy of the pending question / decision is cleared with it.
    React.useEffect(() => {
        if (active) return;
        onPendingChange?.(false);
        onDecisionChange?.(null);
    }, [active, onPendingChange, onDecisionChange]);

    const setSlot = (slot: FollowUpSlot) => {
        setValue('nextFollowupDate', slot.date, { shouldDirty: true });
        setValue('nextFollowupTime', slot.time, { shouldDirty: true });
    };
    const askForNewDate = () => {
        setSlot({ date: '', time: '' });
        // A half-typed date (`12-mm-yyyy`) already reports '' as its value, so React leaves the input alone and
        // the typed parts stay on screen. Clear the native input itself.
        document
            .querySelectorAll<HTMLInputElement>('[data-field="nextFollowupDate"] input[type="date"], input[type="date"][name="nextFollowupDate"]')
            .forEach((input) => {
                input.value = '';
            });
        setGlowRequested(true);
        window.setTimeout(() => focusFormField('nextFollowupDate'), 0);
    };

    /** Back to the saved follow-up with nothing asked (response cleared, or the lead is being closed). */
    const standDown = () => {
        setOpen(false);
        setPending(false);
        setGlowRequested(false);
        setSlot(existing);
        onDecisionChange?.(null);
        clearErrors(['followUpDecision', 'nextFollowupDate', 'nextFollowupTime']);
    };

    /** Asks keep / new for the picked response (or straight for a new date when the saved one can't be kept). */
    const ask = () => {
        if (isFollowUpExpired(existing)) {
            setPending(false);
            askForNewDate();
            onDecisionChange?.('new');
            notify?.(
                existing.date
                    ? 'The previous follow-up has expired. Select a new follow-up date and time.'
                    : 'No follow-up is scheduled. Select a new follow-up date and time.',
                'warning'
            );
            return;
        }
        onDecisionChange?.(null);
        setPending(true);
        setOpenedAtSubmit(submitCount);
        setOpen(true);
    };

    /** Call with the newly picked response and the one it replaces. Every different pick asks again. */
    const onResponseChange = (next: string, previous: string | undefined) => {
        if (!enabled || next === previous) return;
        if (!next) {
            if (responseOptional) standDown();
            return;
        }
        if (suspended) return;
        ask();
    };

    /**
     * Call when the form starts or stops being suspended (e.g. the lead's status moves to or from a closing one):
     * closing drops the question; going back (with a response picked) asks again.
     */
    const onSuspendChange = (nowSuspended: boolean) => {
        if (!enabled) return;
        if (nowSuspended) standDown();
        else if (getValues('customerResponse')) ask();
    };

    const onDecide = (decision: FollowUpDecision) => {
        setOpen(false);
        setPending(false);
        onDecisionChange?.(decision);
        clearErrors(['customerResponse', 'followUpDecision', 'nextFollowupDate', 'nextFollowupTime']);
        if (decision === 'keep') {
            setSlot(existing);
            setGlowRequested(false);
        } else {
            askForNewDate();
        }
    };

    return {
        setAnchor,
        onResponseChange,
        onSuspendChange,
        /** The date field glows until both a date and a time are picked. */
        glow: glowRequested && !(date && time),
        popper: (
            <FollowUpDecisionPopper
                open={enabled && open}
                anchorEl={anchor}
                existing={existing}
                onDecide={onDecide}
                attention={submitCount > openedAtSubmit ? submitCount : 0}
            />
        ),
    };
}

export interface FollowUpEditRules {
    /** A Customer Response must be picked (default). Leads make it optional: none = a details-only edit. */
    requireResponse?: boolean;
    /** No follow-up is scheduled by this save (a lead being closed): only the response rule applies. */
    skipFollowUp?: boolean;
    /** The response the requirement asks for, worded for the case (e.g. closing a lead). */
    responseMessage?: string;
}

/**
 * Save rules of an edit form using the flow: a customer response (unless optional), the keep / reschedule decision,
 * and a next follow-up with a date and a time that is still later than now when Save is clicked.
 */
export function followUpEditIssues(values: FollowUpFields, decisionPending: boolean, rules: FollowUpEditRules = {}): ConfigValidationIssue[] {
    const { requireResponse = true, skipFollowUp = false, responseMessage = 'Customer Response is required.' } = rules;
    const response = values.customerResponse?.trim();
    if (!response) return requireResponse ? [{ path: 'customerResponse', message: responseMessage }] : [];
    if (skipFollowUp) return [];
    if (decisionPending) {
        // Not on customerResponse: the popup itself glows (see useFollowUpDecision), the field stays as it is.
        return [{ path: 'followUpDecision', message: 'Choose whether to keep the current follow-up or schedule a new one.' }];
    }
    return followUpSlotIssues(values);
}

/** A follow-up being saved needs a date and a time later than now (checked again whenever Save is clicked). */
export function followUpSlotIssues(values: Pick<FollowUpFields, 'nextFollowupDate' | 'nextFollowupTime'>): ConfigValidationIssue[] {
    if (!values.nextFollowupDate?.trim()) return [{ path: 'nextFollowupDate', message: 'Select the next follow-up date.' }];
    if (!values.nextFollowupTime?.trim()) return [{ path: 'nextFollowupTime', message: 'Select the next follow-up time.' }];
    if (isFollowUpExpired({ date: values.nextFollowupDate, time: values.nextFollowupTime })) {
        return [{ path: 'nextFollowupTime', message: 'The next follow-up must be later than now. Pick a later date or time.' }];
    }
    return [];
}

/** A follow-up appointment as the form stores it: `YYYY-MM-DD` + a time text (`02:58 PM` or `14:58`). */
export interface FollowUpSlot {
    date: string;
    time: string;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** `YYYY-MM-DDTHH:mm` of a slot, or null when it has no date. A date without a time counts as its end of day. */
function slotDateTime({ date, time }: FollowUpSlot): string | null {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
    const minutes = parseTimeOfDay(time) ?? 23 * 60 + 59;
    return `${date}T${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
}

/** Whether the slot is missing or already in the past, so it can't be kept. */
export function isFollowUpExpired(slot: FollowUpSlot, now = localNow()): boolean {
    const at = slotDateTime(slot);
    return !at || at <= now;
}

/** `04 Dec 2026 · 2:58 pm` (the company formats once saved). */
export function formatFollowUpSlot({ date, time }: FollowUpSlot): string {
    const dateText = /^\d{4}-\d{2}-\d{2}$/.test(date) ? fmtDay(date, { legacy: 'DD MMM YYYY' }) : date;
    const minutes = parseTimeOfDay(time);
    if (minutes === null) return dateText;
    return `${dateText} · ${fmtTime(minutes, { legacy: 'h:mm a' })}`;
}

const pulse = keyframes`
    0%, 100% { box-shadow: 0 0 0 3px rgb(var(--crm-accent-rgb) / 0.22), 0 0 10px 0 rgb(var(--crm-accent-rgb) / 0.18); }
    50% { box-shadow: 0 0 0 4px rgb(var(--crm-accent-rgb) / 0.34), 0 0 18px 2px rgb(var(--crm-accent-rgb) / 0.30); }
`;

/** Brand-colored pulsing ring around the inputs inside, until `active` turns off. */
export function FieldGlow({ active, children }: { active: boolean; children: React.ReactNode }) {
    return (
        <Box
            data-glow={active || undefined}
            sx={{
                minWidth: 0,
                // The grid's gap replaces the field's own bottom margin (as FormGrid does for direct cells).
                '&& > *': { mb: 0 },
                '& .MuiOutlinedInput-root': { transition: 'box-shadow 0.2s ease' },
                ...(active && {
                    '& .MuiOutlinedInput-root': {
                        animation: `${pulse} 1.6s ease-in-out infinite`,
                        '& .MuiOutlinedInput-notchedOutline': { borderColor: 'var(--mui-palette-primary-main)' },
                    },
                    '@media (prefers-reduced-motion: reduce)': {
                        '& .MuiOutlinedInput-root': { animation: 'none', boxShadow: '0 0 0 3px rgb(var(--crm-accent-rgb) / 0.28)' },
                    },
                }),
            }}
        >
            {children}
        </Box>
    );
}

export type FollowUpDecision = 'new' | 'keep';

export interface FollowUpDecisionPopperProps {
    open: boolean;
    anchorEl: HTMLElement | null;
    existing: FollowUpSlot;
    onDecide: (decision: FollowUpDecision) => void;
    /**
     * Non-zero once the user tried to save without answering: the popup glows in the brand color. A new value (the
     * form's submit count) replays the nudge.
     */
    attention?: number;
}

const POPPER_SHADOW = '0 12px 32px rgb(15 23 42 / 0.16), 0 2px 6px rgb(15 23 42 / 0.08)';

const popperGlow = keyframes`
    0%, 100% { box-shadow: ${POPPER_SHADOW}, 0 0 0 3px rgb(var(--crm-accent-rgb) / 0.24), 0 0 14px 2px rgb(var(--crm-accent-rgb) / 0.20); }
    50% { box-shadow: ${POPPER_SHADOW}, 0 0 0 4px rgb(var(--crm-accent-rgb) / 0.38), 0 0 24px 6px rgb(var(--crm-accent-rgb) / 0.32); }
`;

/** A short side-to-side shake that draws the eye on a save attempt. */
const popperNudge = keyframes`
    0%, 100% { transform: translateX(0); }
    20% { transform: translateX(-5px); }
    40% { transform: translateX(5px); }
    60% { transform: translateX(-3px); }
    80% { transform: translateX(3px); }
`;

const optionSx: SxProps<Theme> = {
    width: '100%',
    display: 'flex',
    alignItems: 'flex-start',
    gap: 1.25,
    textAlign: 'left',
    p: 1.5,
    borderRadius: '10px',
    border: '1px solid var(--mui-palette-border-main)',
    backgroundColor: 'var(--mui-palette-background-paper)',
    transition: 'all 0.15s ease',
    '& .option-icon': { color: 'var(--mui-palette-text-muted)', transition: 'color 0.15s ease' },
    '& .option-title': { color: 'var(--mui-palette-text-primary)', transition: 'color 0.15s ease' },
    '&:hover, &.Mui-focusVisible': {
        borderColor: 'var(--crm-blue-300)',
        backgroundColor: 'var(--mui-palette-primary-soft)',
        '& .option-icon, & .option-title': { color: 'var(--crm-text-blue-700)' },
    },
    '&.Mui-focusVisible': { boxShadow: '0 0 0 3px rgb(var(--crm-accent-rgb) / 0.22)' },
};

/**
 * Attached to the right of the Customer Response field once a response is picked: the user must either schedule a
 * new follow-up or confirm the existing one. Deliberately has no close button and ignores outside clicks and
 * Escape; only a decision closes it.
 */
export function FollowUpDecisionPopper({ open, anchorEl, existing, onDecide, attention = 0 }: FollowUpDecisionPopperProps) {
    useDisplayFormats(); // the slot text follows an admin's format change
    const firstOptionRef = React.useRef<HTMLButtonElement>(null);
    const [arrowEl, setArrowEl] = React.useState<HTMLSpanElement | null>(null);

    // Move keyboard focus into the popup once the dropdown menu has closed, and again on each save attempt.
    React.useEffect(() => {
        if (!open) return;
        const id = window.setTimeout(() => firstOptionRef.current?.focus({ preventScroll: true }), 80);
        return () => window.clearTimeout(id);
    }, [open, attention]);

    return (
        <Popper
            open={open && Boolean(anchorEl)}
            // Attach to the select box itself: the wrapper spans the whole grid column, wider than the field.
            anchorEl={() => anchorEl?.querySelector<HTMLElement>('.MuiInputBase-root') ?? anchorEl!}
            placement="right-start"
            modifiers={[
                { name: 'offset', options: { offset: [0, 14] } },
                { name: 'flip', options: { fallbackPlacements: ['bottom-start', 'left-start'] } },
                { name: 'preventOverflow', options: { padding: 12 } },
                { name: 'arrow', enabled: true, options: { element: arrowEl, padding: 12 } },
                { name: 'hide' },
            ]}
            sx={{
                zIndex: (theme) => theme.zIndex.modal,
                // The anchor scrolled out of view or its tab is hidden: hide with it (it reappears on return).
                '&[data-popper-reference-hidden]': { visibility: 'hidden', pointerEvents: 'none' },
                '&[data-popper-placement^="right"] .decision-arrow': { left: -6, '&::before': { borderRight: 'none', borderTop: 'none' } },
                '&[data-popper-placement^="left"] .decision-arrow': { right: -6, '&::before': { borderLeft: 'none', borderBottom: 'none' } },
                '&[data-popper-placement^="bottom"] .decision-arrow': { top: -6, '&::before': { borderRight: 'none', borderBottom: 'none' } },
            }}
        >
            <Paper
                role="dialog"
                aria-modal="false"
                aria-labelledby="followup-decision-title"
                elevation={0}
                onKeyDown={(e) => {
                    // Escape must not dismiss the decision (or the page behind it).
                    if (e.key === 'Escape') e.stopPropagation();
                }}
                // A new save attempt remounts the paper, so the attention animation plays again from the start.
                key={attention}
                sx={{
                    position: 'relative',
                    width: 300,
                    maxWidth: 'calc(100vw - 24px)',
                    p: 1.75,
                    borderRadius: '12px',
                    border: '1px solid var(--mui-palette-border-main)',
                    backgroundColor: 'var(--mui-palette-background-paper)',
                    boxShadow: POPPER_SHADOW,
                    transition: 'border-color 0.2s ease',
                    ...(attention > 0 && {
                        borderColor: 'var(--mui-palette-primary-main)',
                        animation: `${popperNudge} 0.42s ease-in-out, ${popperGlow} 1.6s ease-in-out 0.42s infinite`,
                        '& .decision-arrow::before': { borderColor: 'var(--mui-palette-primary-main)' },
                        '@media (prefers-reduced-motion: reduce)': {
                            animation: 'none',
                            boxShadow: `${POPPER_SHADOW}, 0 0 0 3px rgb(var(--crm-accent-rgb) / 0.3)`,
                        },
                    }),
                }}
            >
                <Box
                    ref={setArrowEl}
                    component="span"
                    className="decision-arrow"
                    sx={{
                        position: 'absolute',
                        width: 12,
                        height: 12,
                        '&::before': {
                            content: '""',
                            position: 'absolute',
                            inset: 0,
                            transform: 'rotate(45deg)',
                            backgroundColor: 'var(--mui-palette-background-paper)',
                            border: '1px solid var(--mui-palette-border-main)',
                        },
                    }}
                />
                <Typography
                    id="followup-decision-title"
                    sx={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--mui-palette-text-secondary)' }}
                >
                    Next follow-up <Box component="span" sx={{ color: 'var(--crm-red-500)' }}>*</Box>
                </Typography>
                <Typography sx={{ fontSize: '0.75rem', color: 'var(--mui-palette-text-muted)', mb: 1.5 }}>
                    Choose one to continue.
                </Typography>

                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                    <ButtonBase ref={firstOptionRef} sx={optionSx} onClick={() => onDecide('new')}>
                        <EventRepeatOutlinedIcon className="option-icon" sx={{ fontSize: 20, mt: 0.1 }} />
                        <Box sx={{ minWidth: 0 }}>
                            <Typography className="option-title" sx={{ fontSize: '0.85rem', fontWeight: 600 }}>
                                Schedule a new follow-up
                            </Typography>
                            <Typography sx={{ fontSize: '0.74rem', color: 'var(--mui-palette-text-secondary)' }}>
                                Pick a date and time later than now.
                            </Typography>
                        </Box>
                    </ButtonBase>
                    <ButtonBase sx={optionSx} onClick={() => onDecide('keep')}>
                        <EventAvailableOutlinedIcon className="option-icon" sx={{ fontSize: 20, mt: 0.1 }} />
                        <Box sx={{ minWidth: 0 }}>
                            <Typography className="option-title" sx={{ fontSize: '0.85rem', fontWeight: 600 }}>
                                Keep existing date &amp; time
                            </Typography>
                            <Typography sx={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--crm-slate-900)', my: 0.25 }}>
                                {formatFollowUpSlot(existing)}
                            </Typography>
                            <Typography sx={{ fontSize: '0.74rem', color: 'var(--mui-palette-text-secondary)' }}>
                                Confirm this appointment still works.
                            </Typography>
                        </Box>
                    </ButtonBase>
                </Box>
            </Paper>
        </Popper>
    );
}
