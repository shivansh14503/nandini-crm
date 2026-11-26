'use client';

import React, { useMemo, useState } from 'react';
import { Autocomplete, Box, Button, Checkbox, Chip, FormControlLabel, IconButton, TextField, Tooltip, Typography } from '@mui/material';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import { getActiveUsers, findCrmUser } from '@/services/masterData.store';
import { useMasterData } from '@/hooks/queries/useMasterData';
import { UserAwayChip } from '@/components/common/UserAwayChip';
import { getModuleColor, type ModuleKey } from '@/theme/moduleColors';
import { ACTIVITY_STATUSES, type ActivityStatus, type CalendarSource } from '@/types/activity.types';
import { addDays } from '@/utils/zonedTime';
import { fieldSx } from '@/components/forms/FormField';

/** What the calendar shows. `users` empty = the signed-in user (the API's default). */
export interface CalendarFilterValues {
    users: string[];
    types: string[];
    sources: CalendarSource[];
    status: ActivityStatus[];
}

export const CALENDAR_SOURCE_OPTIONS: { value: CalendarSource; label: string; module: ModuleKey }[] = [
    { value: 'activity', label: 'Activities', module: 'activities' },
    { value: 'leadFollowup', label: 'Lead follow-ups', module: 'leads' },
    { value: 'opportunityFollowup', label: 'Opportunity follow-ups', module: 'opportunities' },
    { value: 'contractRenewal', label: 'Contract renewals', module: 'contracts' },
];

export const DEFAULT_CALENDAR_SOURCES: CalendarSource[] = CALENDAR_SOURCE_OPTIONS.map((o) => o.value);
/** The API's default (cancelled activities stay off the calendar until asked for). */
export const DEFAULT_CALENDAR_STATUS: ActivityStatus[] = ['Planned', 'Completed'];

export const DEFAULT_CALENDAR_FILTERS: CalendarFilterValues = { users: [], types: [], sources: DEFAULT_CALENDAR_SOURCES, status: DEFAULT_CALENDAR_STATUS };

const sameSet = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((x) => b.includes(x));

/** Filters that differ from the defaults (the Filters button's badge). */
export function countActiveFilters(values: CalendarFilterValues, me: string): number {
    let n = 0;
    if (values.users.length > 0 && !(values.users.length === 1 && values.users[0].toLowerCase() === me.toLowerCase())) n += 1;
    if (values.types.length > 0) n += 1;
    if (!sameSet(values.sources, DEFAULT_CALENDAR_SOURCES)) n += 1;
    if (!sameSet(values.status, DEFAULT_CALENDAR_STATUS)) n += 1;
    return n;
}

const toggle = <T extends string>(list: readonly T[], value: T): T[] => (list.includes(value) ? list.filter((x) => x !== value) : [...list, value]);

// ── Mini month ──────────────────────────────────────────────────────────────

const monthTitle = (day: string) =>
    new Intl.DateTimeFormat('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${day.slice(0, 7)}-01T12:00:00Z`));
const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

export interface MiniMonthProps {
    /** The calendar's current date (`YYYY-MM-DD`): its month is shown first. */
    date: string;
    /** Today in the business timezone. */
    today: string;
    /** Days the main calendar shows: `[start, end)`. */
    rangeStart: string;
    rangeEnd: string;
    firstDay: number;
    onPick: (day: string) => void;
}

/** A small month grid: pick a day to jump the calendar there; the days on screen are tinted. */
export function MiniMonth({ date, today, rangeStart, rangeEnd, firstDay, onPick }: MiniMonthProps) {
    const [shown, setShown] = useState(() => `${date.slice(0, 7)}-01`);
    const [lastDate, setLastDate] = useState(date);
    // Follows the main calendar when it moves to another month.
    if (date !== lastDate) {
        setLastDate(date);
        if (date.slice(0, 7) !== shown.slice(0, 7)) setShown(`${date.slice(0, 7)}-01`);
    }
    const cells = useMemo(() => {
        const first = shown;
        const weekday = new Date(`${first}T12:00:00Z`).getUTCDay();
        const start = addDays(first, -((weekday - firstDay + 7) % 7));
        return Array.from({ length: 42 }, (_, i) => addDays(start, i));
    }, [shown, firstDay]);
    const weekdays = useMemo(() => Array.from({ length: 7 }, (_, i) => WEEKDAYS[(firstDay + i) % 7]), [firstDay]);
    const month = shown.slice(0, 7);
    const shiftMonth = (by: number) => {
        const [y, m] = shown.split('-').map(Number);
        const d = new Date(Date.UTC(y, m - 1 + by, 1));
        setShown(d.toISOString().slice(0, 10));
    };
    const navSx = {
        width: 32,
        height: 32,
        borderRadius: '8px',
        color: 'var(--mui-palette-text-secondary)',
        '&:hover': { backgroundColor: 'var(--mui-palette-primary-soft)', color: 'var(--crm-text-blue-700)' },
    } as const;

    return (
        <Box>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.5 }}>
                <Typography sx={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--crm-slate-900)' }}>{monthTitle(shown)}</Typography>
                <Box sx={{ display: 'flex' }}>
                    <IconButton size="small" aria-label="Previous month" onClick={() => shiftMonth(-1)} sx={navSx}>
                        <ChevronLeftIcon sx={{ fontSize: 18 }} />
                    </IconButton>
                    <IconButton size="small" aria-label="Next month" onClick={() => shiftMonth(1)} sx={navSx}>
                        <ChevronRightIcon sx={{ fontSize: 18 }} />
                    </IconButton>
                </Box>
            </Box>
            <Box role="grid" aria-label={monthTitle(shown)} sx={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', rowGap: 0.25 }}>
                {weekdays.map((w) => (
                    <Typography key={w} role="columnheader" sx={{ textAlign: 'center', fontSize: '0.68rem', fontWeight: 600, color: 'var(--mui-palette-text-muted)', py: 0.25 }}>
                        {w}
                    </Typography>
                ))}
                {cells.map((day) => {
                    const inMonth = day.slice(0, 7) === month;
                    const isToday = day === today;
                    const inRange = day >= rangeStart && day < rangeEnd;
                    return (
                        <Box key={day} sx={{ display: 'flex', justifyContent: 'center', backgroundColor: inRange ? 'var(--mui-palette-primary-soft)' : 'transparent' }}>
                            <Box
                                component="button"
                                type="button"
                                role="gridcell"
                                aria-label={day}
                                aria-current={isToday ? 'date' : undefined}
                                onClick={() => onPick(day)}
                                sx={{
                                    width: 32,
                                    height: 32,
                                    border: isToday ? '1px solid var(--crm-blue-300)' : '1px solid transparent',
                                    borderRadius: '50%',
                                    cursor: 'pointer',
                                    font: 'inherit',
                                    fontSize: '0.75rem',
                                    fontWeight: isToday ? 800 : 500,
                                    backgroundColor: 'transparent',
                                    color: isToday ? 'var(--crm-text-blue-900)' : inMonth ? 'var(--crm-slate-900)' : 'var(--mui-palette-text-muted)',
                                    transition: 'all 0.15s ease',
                                    '&:hover': { backgroundColor: 'var(--mui-palette-background-paper)', borderColor: 'var(--crm-blue-300)', color: 'var(--crm-text-blue-700)' },
                                    '&:focus-visible': { outline: 'none', boxShadow: '0 0 0 3px rgb(var(--crm-accent-rgb) / 0.22)' },
                                }}
                            >
                                {Number(day.slice(8, 10))}
                            </Box>
                        </Box>
                    );
                })}
            </Box>
        </Box>
    );
}

// ── Filters ─────────────────────────────────────────────────────────────────

const sectionTitleSx = {
    fontSize: '0.7rem',
    fontWeight: 700,
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
    color: 'var(--mui-palette-text-secondary)',
    mb: 0.5,
} as const;

const checkboxLabelSx = {
    mx: 0,
    minHeight: 34,
    '& .MuiFormControlLabel-label': { fontSize: '0.82rem', color: 'var(--crm-slate-700)', minWidth: 0 },
} as const;

const linkButtonSx = {
    minWidth: 0,
    // Tap target: at least 32px (responsive-ui.md rule 4); these sit in the phone's filter sheet.
    height: 32,
    px: 1,
    textTransform: 'none',
    fontSize: '0.75rem',
    fontWeight: 600,
    color: 'var(--crm-text-blue-700)',
    '&:hover': { backgroundColor: 'var(--mui-palette-primary-soft)', color: 'var(--crm-text-blue-600)' },
} as const;

export interface CalendarFiltersProps {
    values: CalendarFilterValues;
    onChange: (next: CalendarFilterValues) => void;
    /** Signed-in username. */
    me: string;
    /** Followup Types that can be on the calendar (option values) and their labels. */
    typeOptions: string[];
    typeLabel: (value: string) => string;
    typeIcon: (value: string) => React.ElementType;
    miniMonth: MiniMonthProps;
    /**
     * "Show busy times" (Calendar Phase 2, P2-6): colleagues' busy blocks from the CRM and their company calendars as
     * shaded background. Offered only while colleagues are selected; `available` false (month / agenda) explains why.
     */
    busyTimes?: { checked: boolean; available: boolean; onChange: (checked: boolean) => void };
}

/** The calendar's side rail: mini month, whose calendars, which types, sources and statuses. */
export function CalendarFilters({ values, onChange, me, typeOptions, typeLabel, typeIcon, miniMonth, busyTimes }: CalendarFiltersProps) {
    const masters = useMasterData();
    const users = useMemo(
        () => getActiveUsers().filter((u) => !u.isGroupUser),
        // eslint-disable-next-line react-hooks/exhaustive-deps -- getActiveUsers reads the directory `masters` holds
        [masters]
    );
    const selectedUsers = values.users.length > 0 ? values.users : [me];
    const set = (patch: Partial<CalendarFilterValues>) => onChange({ ...values, ...patch });
    const onlyMe = selectedUsers.length === 1 && selectedUsers[0].toLowerCase() === me.toLowerCase();
    const userLabel = (username: string) => {
        const name = findCrmUser(username)?.name || username;
        return username.toLowerCase() === me.toLowerCase() ? `${name} (You)` : name;
    };

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.25, minWidth: 0 }}>
            <MiniMonth {...miniMonth} />

            <Box>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Typography sx={sectionTitleSx}>Calendars</Typography>
                    {!onlyMe && (
                        <Button onClick={() => set({ users: [] })} sx={linkButtonSx}>
                            Just me
                        </Button>
                    )}
                </Box>
                <Autocomplete
                    multiple
                    size="small"
                    options={users.map((u) => u.username)}
                    value={selectedUsers}
                    onChange={(_, next) => set({ users: next.length === 1 && next[0].toLowerCase() === me.toLowerCase() ? [] : next })}
                    getOptionLabel={userLabel}
                    filterSelectedOptions
                    disableClearable
                    isOptionEqualToValue={(a, b) => a.toLowerCase() === b.toLowerCase()}
                    // Away colleagues stay listed; the chip explains an empty calendar (out of office until …, on leave).
                    renderOption={(props, username) => {
                        const { key, ...optionProps } = props;
                        return (
                            <li key={key} {...optionProps}>
                                <Box component="span" sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap', minWidth: 0 }}>
                                    <Box component="span" sx={{ minWidth: 0, overflowWrap: 'anywhere' }}>
                                        {userLabel(username)}
                                    </Box>
                                    <UserAwayChip user={findCrmUser(username)} />
                                </Box>
                            </li>
                        );
                    }}
                    renderValue={(selected, getItemProps) =>
                        selected.map((username, index) => {
                            const { key, ...itemProps } = getItemProps({ index });
                            return (
                                <Chip
                                    key={key}
                                    size="small"
                                    {...itemProps}
                                    label={userLabel(username)}
                                    onDelete={selected.length > 1 ? itemProps.onDelete : undefined}
                                    sx={{
                                        height: 24,
                                        fontSize: '0.72rem',
                                        fontWeight: 600,
                                        color: 'var(--crm-slate-700)',
                                        backgroundColor: 'var(--mui-palette-background-subtle)',
                                        border: '1px solid var(--mui-palette-border-main)',
                                        maxWidth: '100%',
                                    }}
                                />
                            );
                        })
                    }
                    renderInput={(params) => <TextField {...params} placeholder={selectedUsers.length === 0 ? 'Add people…' : undefined} sx={fieldSx} />}
                />
                {busyTimes && !onlyMe && (
                    <Box sx={{ mt: 0.5 }}>
                        <FormControlLabel
                            sx={checkboxLabelSx}
                            control={
                                <Checkbox
                                    size="small"
                                    checked={busyTimes.checked}
                                    disabled={!busyTimes.available}
                                    onChange={(event) => busyTimes.onChange(event.target.checked)}
                                />
                            }
                            label="Show busy times"
                        />
                        <Typography sx={{ fontSize: '0.7rem', color: 'var(--mui-palette-text-muted)', pl: 0.5 }}>
                            {busyTimes.available
                                ? 'Shaded: when anyone selected is busy, from the CRM and their work calendars (times only).'
                                : 'In the week, 3-day and day views.'}
                        </Typography>
                    </Box>
                )}
            </Box>

            <Box>
                <Typography sx={sectionTitleSx}>Show</Typography>
                <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                    {CALENDAR_SOURCE_OPTIONS.map((o) => {
                        const color = getModuleColor(o.module);
                        return (
                            <FormControlLabel
                                key={o.value}
                                sx={checkboxLabelSx}
                                control={
                                    <Checkbox
                                        size="small"
                                        checked={values.sources.includes(o.value)}
                                        // At least one source stays on (no sources = the API's "all").
                                        onChange={() => {
                                            const next = toggle(values.sources, o.value);
                                            if (next.length > 0) set({ sources: next });
                                        }}
                                    />
                                }
                                label={
                                    <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75, minWidth: 0 }}>
                                        <Box component="span" sx={{ width: 10, height: 10, borderRadius: '3px', backgroundColor: color.main, flexShrink: 0 }} />
                                        {o.label}
                                    </Box>
                                }
                            />
                        );
                    })}
                </Box>
            </Box>

            <Box>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Typography sx={sectionTitleSx}>Types</Typography>
                    {values.types.length > 0 && (
                        <Button onClick={() => set({ types: [] })} sx={linkButtonSx}>
                            All types
                        </Button>
                    )}
                </Box>
                <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                    {typeOptions.map((type) => {
                        const Icon = typeIcon(type);
                        return (
                            <FormControlLabel
                                key={type}
                                sx={checkboxLabelSx}
                                control={
                                    <Checkbox
                                        size="small"
                                        // No type picked = every type.
                                        checked={values.types.length === 0 || values.types.includes(type)}
                                        onChange={() => {
                                            const current = values.types.length === 0 ? typeOptions : values.types;
                                            const next = toggle(current, type);
                                            set({ types: next.length === typeOptions.length || next.length === 0 ? [] : next });
                                        }}
                                    />
                                }
                                label={
                                    <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75, minWidth: 0 }}>
                                        <Icon sx={{ fontSize: 16, color: 'var(--mui-palette-text-secondary)' }} />
                                        {typeLabel(type) || type}
                                    </Box>
                                }
                            />
                        );
                    })}
                </Box>
            </Box>

            <Box>
                <Typography sx={sectionTitleSx}>Activity status</Typography>
                <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                    {ACTIVITY_STATUSES.map((status) => (
                        <FormControlLabel
                            key={status}
                            sx={checkboxLabelSx}
                            control={
                                <Checkbox
                                    size="small"
                                    checked={values.status.includes(status)}
                                    onChange={() => {
                                        const next = toggle(values.status, status);
                                        if (next.length > 0) set({ status: next });
                                    }}
                                />
                            }
                            label={status}
                        />
                    ))}
                </Box>
            </Box>

            {countActiveFilters(values, me) > 0 && (
                <Tooltip title="My calendar, every type and source, planned and completed">
                    <Button onClick={() => onChange(DEFAULT_CALENDAR_FILTERS)} variant="outlined" sx={{ ...linkButtonSx, alignSelf: 'flex-start', height: 36, px: 1.5, border: '1px solid var(--mui-palette-border-main)' }}>
                        Reset filters
                    </Button>
                </Tooltip>
            )}
        </Box>
    );
}
