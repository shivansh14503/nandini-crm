'use client';

import React, { useState } from 'react';
import { Box, Chip, MenuItem, TextField, Typography, type SxProps, type Theme } from '@mui/material';
import RepeatIcon from '@mui/icons-material/Repeat';
import type { RepeatEnds, RepeatFrequency, RepeatRule } from '@/types/activity.types';
import {
    followStartDay,
    isoWeekday,
    normalizeRepeat,
    positionLabel,
    presetLabels,
    presetOf,
    presetRule,
    sameRepeat,
    setPosOf,
    summarizeRepeat,
    WEEKDAY_LONG,
    WEEKDAY_SHORT,
    type RepeatPreset,
} from '@/utils/activityRepeat';

/** Same outline / focus treatment as the other plain inputs (builderUi `inputSx`), brand-coloured in both modes. */
const inputSx = {
    '& .MuiOutlinedInput-root': {
        borderRadius: '8px',
        backgroundColor: 'var(--mui-palette-background-paper)',
        fontSize: '0.85rem',
        '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: 'var(--mui-palette-border-strong)' },
        '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: 'var(--mui-palette-primary-main)', borderWidth: '1.5px' },
    },
} as const;

const chipSx = (on: boolean) =>
    ({
        minWidth: 44,
        height: 34,
        fontSize: '0.8rem',
        fontWeight: on ? 700 : 500,
        borderColor: on ? 'var(--mui-palette-primary-softBorder)' : 'var(--mui-palette-border-main)',
        backgroundColor: on ? 'var(--mui-palette-primary-soft)' : 'var(--mui-palette-background-paper)',
        color: on ? 'var(--crm-text-blue-900)' : 'var(--crm-slate-700)',
        '&:hover': { borderColor: 'var(--crm-blue-300)', color: 'var(--crm-text-blue-700)' },
    }) as const;

const UNIT: Record<RepeatFrequency, string> = { daily: 'day', weekly: 'week', monthly: 'month' };

/**
 * A whole-number input that can be cleared while typing: the text is a local draft, committed when it is a number in
 * range (and clamped on blur), so backspacing "1" and typing "2" gives 2, not 12.
 */
function WholeNumberField({
    value,
    min,
    max,
    onCommit,
    label,
    ariaLabel,
    disabled,
    sx,
}: {
    value: number | undefined;
    min: number;
    max: number;
    onCommit: (value: number) => void;
    label?: string;
    ariaLabel?: string;
    disabled?: boolean;
    sx?: SxProps<Theme>;
}) {
    const [draft, setDraft] = useState<string | null>(null);
    const parse = (text: string) => (/^\d+$/.test(text.trim()) ? Number(text.trim()) : NaN);
    return (
        <TextField
            size="small"
            type="number"
            label={label}
            value={draft ?? (value === undefined ? '' : String(value))}
            onChange={(e) => {
                setDraft(e.target.value);
                const n = parse(e.target.value);
                if (n >= min && n <= max) onCommit(n);
            }}
            onBlur={() => {
                const n = draft === null ? NaN : parse(draft);
                if (!Number.isNaN(n)) onCommit(Math.min(max, Math.max(min, n)));
                setDraft(null);
            }}
            disabled={disabled}
            sx={sx}
            slotProps={{ htmlInput: { min, max, inputMode: 'numeric', ...(ariaLabel ? { 'aria-label': ariaLabel } : {}) } }}
        />
    );
}

export interface ActivityRepeatFieldProps {
    /** The rule, or null for "Does not repeat". */
    value: RepeatRule | null;
    onChange: (rule: RepeatRule | null) => void;
    /** First day of the activity (`YYYY-MM-DD`): the quick choices and defaults follow it. */
    startDay: string;
    disabled?: boolean;
    /** Shown under the summary (e.g. how edits of a series work). */
    hint?: string;
}

/**
 * "Repeat" of the activity form (Calendar Phase 4): quick choices for the first day ("Every week on Wednesday"), or a
 * custom rule (every N days / weeks / months, weekdays, day of the month or nth weekday, ends never / on a date /
 * after N times), with the summary the drawer shows. Plain controlled inputs (the rule isn't a form-configuration
 * field); responsive: the custom panel wraps on phones.
 */
export function ActivityRepeatField({ value, onChange, startDay, disabled = false, hint }: ActivityRepeatFieldProps) {
    const labels = presetLabels(startDay);
    const preset = presetOf(value, startDay);
    const [customOpen, setCustomOpen] = useState(preset === 'custom');
    const showCustom = value !== null && (customOpen || preset === 'custom');
    const rule = value ? normalizeRepeat(value, startDay) : null;

    const pick = (next: RepeatPreset) => {
        if (next === 'none') {
            setCustomOpen(false);
            onChange(null);
        } else if (next === 'custom') {
            setCustomOpen(true);
            onChange(rule ?? presetRule('weekly', startDay));
        } else {
            setCustomOpen(false);
            onChange(presetRule(next, startDay));
        }
    };
    const patch = (changes: Partial<RepeatRule>) => rule && onChange(normalizeRepeat({ ...rule, ...changes }, startDay));
    const toggleWeekday = (day: number) => {
        if (!rule) return;
        const current = rule.weekdays ?? [];
        const next = current.includes(day) ? current.filter((d) => d !== day) : [...current, day];
        if (next.length > 0) patch({ weekdays: next });
    };

    return (
        <Box sx={{ minWidth: 0 }}>
            <TextField
                select
                size="small"
                fullWidth
                label="Repeat"
                value={showCustom ? 'custom' : preset}
                onChange={(e) => pick(e.target.value as RepeatPreset)}
                disabled={disabled}
                sx={inputSx}
                slotProps={{ input: { startAdornment: <RepeatIcon sx={{ fontSize: 18, mr: 1, color: 'var(--mui-palette-text-muted)' }} /> } }}
            >
                {(Object.keys(labels) as RepeatPreset[]).map((key) => (
                    <MenuItem key={key} value={key} sx={{ fontSize: '0.85rem' }}>
                        {labels[key]}
                    </MenuItem>
                ))}
            </TextField>

            {showCustom && rule && (
                <Box
                    sx={{
                        mt: 1.25,
                        p: { xs: 1.25, sm: 1.5 },
                        borderRadius: '10px',
                        border: '1px solid var(--mui-palette-border-main)',
                        backgroundColor: 'var(--mui-palette-background-subtle)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 1.25,
                        minWidth: 0,
                    }}
                >
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, alignItems: 'center' }}>
                        <Typography sx={{ fontSize: '0.82rem', color: 'var(--mui-palette-text-secondary)' }}>Every</Typography>
                        <WholeNumberField
                            value={rule.interval}
                            min={1}
                            max={99}
                            onCommit={(interval) => patch({ interval })}
                            ariaLabel="Repeat every"
                            disabled={disabled}
                            sx={{ ...inputSx, width: 84 }}
                        />
                        <TextField
                            select
                            size="small"
                            value={rule.frequency}
                            onChange={(e) => patch({ frequency: e.target.value as RepeatFrequency, weekdays: undefined, monthlyMode: undefined, monthDay: undefined, setPos: undefined, setWeekday: undefined })}
                            disabled={disabled}
                            sx={{ ...inputSx, minWidth: 120 }}
                            slotProps={{ htmlInput: { 'aria-label': 'Repeat unit' } }}
                        >
                            {(['daily', 'weekly', 'monthly'] as const).map((f) => (
                                <MenuItem key={f} value={f} sx={{ fontSize: '0.85rem' }}>
                                    {rule.interval === 1 ? UNIT[f] : `${UNIT[f]}s`}
                                </MenuItem>
                            ))}
                        </TextField>
                    </Box>

                    {rule.frequency === 'weekly' && (
                        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }} role="group" aria-label="Repeat on">
                            {[1, 2, 3, 4, 5, 6, 7].map((day) => {
                                const on = (rule.weekdays ?? []).includes(day);
                                return (
                                    <Chip
                                        key={day}
                                        label={WEEKDAY_SHORT[day]}
                                        variant="outlined"
                                        aria-pressed={on}
                                        aria-label={WEEKDAY_LONG[day]}
                                        onClick={disabled ? undefined : () => toggleWeekday(day)}
                                        sx={chipSx(on)}
                                    />
                                );
                            })}
                        </Box>
                    )}

                    {rule.frequency === 'monthly' && (
                        <TextField
                            select
                            size="small"
                            label="On"
                            value={rule.monthlyMode ?? 'day'}
                            onChange={(e) =>
                                patch(
                                    e.target.value === 'weekday'
                                        ? { monthlyMode: 'weekday', setPos: setPosOf(startDay), setWeekday: isoWeekday(startDay) }
                                        : { monthlyMode: 'day', monthDay: Number(startDay.slice(8, 10) || 1) }
                                )
                            }
                            disabled={disabled}
                            sx={{ ...inputSx, maxWidth: 360 }}
                        >
                            <MenuItem value="day" sx={{ fontSize: '0.85rem' }}>
                                {`Day ${Number(startDay.slice(8, 10) || 1)} of the month`}
                            </MenuItem>
                            <MenuItem value="weekday" sx={{ fontSize: '0.85rem' }}>
                                {`The ${positionLabel(setPosOf(startDay))} ${WEEKDAY_LONG[isoWeekday(startDay)]}`}
                            </MenuItem>
                        </TextField>
                    )}

                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, alignItems: 'center' }}>
                        <TextField
                            select
                            size="small"
                            label="Ends"
                            value={rule.ends}
                            onChange={(e) => {
                                const ends = e.target.value as RepeatEnds;
                                patch({ ends, untilDay: ends === 'on' ? (rule.untilDay ?? startDay) : undefined, count: ends === 'after' ? (rule.count ?? 10) : undefined });
                            }}
                            disabled={disabled}
                            sx={{ ...inputSx, minWidth: 140 }}
                        >
                            <MenuItem value="never" sx={{ fontSize: '0.85rem' }}>
                                Never
                            </MenuItem>
                            <MenuItem value="on" sx={{ fontSize: '0.85rem' }}>
                                On a date
                            </MenuItem>
                            <MenuItem value="after" sx={{ fontSize: '0.85rem' }}>
                                After a number of times
                            </MenuItem>
                        </TextField>
                        {rule.ends === 'on' && (
                            <TextField
                                size="small"
                                type="date"
                                label="Last day"
                                value={rule.untilDay ?? ''}
                                onChange={(e) => patch({ untilDay: e.target.value })}
                                disabled={disabled}
                                sx={{ ...inputSx, minWidth: 160 }}
                                slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: startDay } }}
                            />
                        )}
                        {rule.ends === 'after' && (
                            <WholeNumberField
                                label="Times"
                                value={rule.count}
                                min={1}
                                max={366}
                                onCommit={(count) => patch({ count })}
                                disabled={disabled}
                                sx={{ ...inputSx, width: 110 }}
                            />
                        )}
                    </Box>
                </Box>
            )}

            {(rule || hint) && (
                <Typography sx={{ mt: 0.75, fontSize: '0.76rem', color: 'var(--mui-palette-text-secondary)', overflowWrap: 'anywhere' }}>
                    {rule ? summarizeRepeat(rule) : ''}
                    {rule && hint ? '. ' : ''}
                    {hint}
                </Typography>
            )}
        </Box>
    );
}

/**
 * The Repeat state of an activity form: starts from the loaded activity's series rule (none when creating), and says
 * whether the user changed it (only a changed rule is sent, so a plain save of an occurrence doesn't ask for a series
 * rewrite). `startDay` = the form's first day: while the activity isn't a series yet, a quick choice tied to the day
 * ("Every week on Thursday") follows a new start; an occurrence's rule stays as loaded (the server moves a one-day rule
 * with "This and following events").
 */
export function useActivityRepeat(activity: { series?: { rule: RepeatRule } | null; id?: string } | undefined, startDay = '') {
    const loaded = activity?.series?.rule ?? null;
    const [state, setState] = useState<{ forId: string | undefined; rule: RepeatRule | null; day: string }>({ forId: activity?.id, rule: loaded, day: startDay });
    // A record loaded after the first render: take its rule; a new start moves a day-tied quick choice (React's
    // "adjust state while rendering" pattern).
    if (state.forId !== activity?.id) setState({ forId: activity?.id, rule: loaded, day: startDay });
    else if (state.day !== startDay) setState({ ...state, day: startDay, rule: loaded ? state.rule : followStartDay(state.rule, state.day, startDay) });
    const repeat = state.forId === activity?.id ? state.rule : loaded;
    const setRepeat = (rule: RepeatRule | null) => setState({ forId: activity?.id, rule, day: startDay });
    const changed = !sameRepeat(repeat, loaded);
    return { repeat, setRepeat, loaded, changed };
}
