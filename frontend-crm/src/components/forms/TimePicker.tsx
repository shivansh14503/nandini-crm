'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Box, ClickAwayListener, InputAdornment, Paper, Popper, TextField } from '@mui/material';
import AccessTimeOutlinedIcon from '@mui/icons-material/AccessTimeOutlined';
import { localNow, parseTimeOfDay } from '@/utils/pastDates';
import { fieldSx } from './FormField';

const pad = (n: number) => String(n).padStart(2, '0');

/** How the value is stored: `12h` → `04:15 PM` (follow-up times), `24h` → `16:15` (the `datetime-local` time part). */
export type TimeValueFormat = '12h' | '24h';

interface Parts {
    h12: number;
    m: number;
    pm: boolean;
}

const toParts = (mins: number): Parts => ({ h12: Math.floor(mins / 60) % 12 || 12, m: mins % 60, pm: mins >= 720 });
const fromParts = ({ h12, m, pm }: Parts) => ((h12 % 12) + (pm ? 12 : 0)) * 60 + m;

/** Minutes since midnight → `04:15 PM`. */
export function formatTime12(mins: number): string {
    const { h12, m, pm } = toParts(mins);
    return `${pad(h12)}:${pad(m)} ${pm ? 'PM' : 'AM'}`;
}

/** Minutes since midnight → `16:15`. */
export const formatTime24 = (mins: number) => `${pad(Math.floor(mins / 60))}:${pad(mins % 60)}`;

const formatValue = (mins: number, format: TimeValueFormat) => (format === '24h' ? formatTime24(mins) : formatTime12(mins));

/** Where the columns sit when the field is empty: the start of the working day. */
const DEFAULT_MINUTES = 9 * 60;

const HOURS = Array.from({ length: 12 }, (_, i) => i + 1);
const MINUTES = Array.from({ length: 60 }, (_, i) => i);
const PERIODS = [false, true]; // pm flag: AM, PM

type Column = 0 | 1 | 2;
const COLUMN_LABELS = ['Hours', 'Minutes', 'AM/PM'] as const;
const ITEM_HEIGHT = 32;
const VISIBLE_ROWS = 7;

export interface TimePickerProps {
    value: string;
    onChange: (value: string) => void;
    /** Stored format of `value` / `onChange`; the field always shows `hh:mm AM/PM`. Defaults to `12h`. */
    valueFormat?: TimeValueFormat;
    /** The date the time belongs to (`YYYY-MM-DD`): on today, times that have passed are greyed out. */
    date?: string | null;
    error?: boolean;
    ariaLabel?: string;
    onBlur?: () => void;
    name?: string;
    placeholder?: string;
    disabled?: boolean;
}

/**
 * Time-of-day picker: a `hh:mm AM/PM` text field that opens three scrollable columns (hours, minutes, AM/PM).
 * Clicking an item updates the value at once. Typing a time (`4:15 pm`, `16:15`) is accepted on blur / Enter.
 * Keyboard: ↓ (or Alt+↓) opens and focuses the columns, ↑/↓ move, ←/→ or Tab switch columns, Enter/Space picks,
 * Escape closes. A stored value that has already passed stays as it is, so older records keep it.
 */
export function TimePicker({
    value,
    onChange,
    valueFormat = '12h',
    date,
    error,
    ariaLabel = 'Time',
    onBlur,
    name,
    placeholder = 'hh:mm AM',
    disabled,
}: TimePickerProps) {
    const current = useMemo(() => parseTimeOfDay(value), [value]);
    const display = current === null ? value ?? '' : formatTime12(current);

    const [open, setOpen] = useState(false);
    const [text, setText] = useState(display);
    const [editing, setEditing] = useState(false);
    const [focus, setFocus] = useState<{ col: Column; index: number } | null>(null);
    const anchorRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const columnRefs = useRef<(HTMLDivElement | null)[]>([]);

    useEffect(() => {
        if (!editing) setText(display);
    }, [display, editing]);

    // Earliest allowed time today (null on other days).
    const now = localNow();
    const minMinutes = date && date.slice(0, 10) === now.slice(0, 10) ? Number(now.slice(11, 13)) * 60 + Number(now.slice(14, 16)) : null;

    // Parts the columns work from: the value, or a sensible starting point when empty.
    const base = toParts(current ?? Math.max(DEFAULT_MINUTES, minMinutes ?? 0));
    const selected = current === null ? null : base;

    const isPast = (mins: number) => minMinutes !== null && mins < minMinutes;
    const disabledAt = (col: Column, index: number): boolean => {
        if (minMinutes === null) return false;
        if (col === 0) return isPast(fromParts({ ...base, h12: HOURS[index], m: 59 }));
        if (col === 1) return isPast(fromParts({ ...base, m: MINUTES[index] }));
        return isPast(fromParts({ h12: 11, m: 59, pm: PERIODS[index] }));
    };

    const columns: { items: string[]; selectedIndex: number | null; baseIndex: number }[] = [
        { items: HOURS.map(pad), selectedIndex: selected ? selected.h12 - 1 : null, baseIndex: base.h12 - 1 },
        { items: MINUTES.map(pad), selectedIndex: selected ? selected.m : null, baseIndex: base.m },
        { items: ['AM', 'PM'], selectedIndex: selected ? Number(selected.pm) : null, baseIndex: Number(base.pm) },
    ];

    const commit = (mins: number) => {
        // A change never lands in the past; clamp to now instead of leaving an invalid time.
        const next = minMinutes !== null && mins < minMinutes ? minMinutes : mins;
        onChange(formatValue(next, valueFormat));
    };

    const pick = (col: Column, index: number) => {
        if (disabledAt(col, index)) return;
        const parts = { ...base };
        if (col === 0) parts.h12 = HOURS[index];
        else if (col === 1) parts.m = MINUTES[index];
        else parts.pm = PERIODS[index];
        commit(fromParts(parts));
    };

    const scrollColumns = useCallback(
        (behavior: ScrollBehavior = 'auto') => {
            columns.forEach((c, col) => {
                const el = columnRefs.current[col];
                if (!el) return;
                const index = c.selectedIndex ?? c.baseIndex;
                // Put the chosen item near the top with a row of context above it.
                el.scrollTo({ top: Math.max(0, (index - 1) * ITEM_HEIGHT), behavior });
            });
        },
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [current, minMinutes],
    );

    const focusItem = (col: Column, index: number) => {
        const items = columns[col].items;
        const i = Math.min(Math.max(index, 0), items.length - 1);
        setFocus({ col, index: i });
        const el = columnRefs.current[col]?.querySelector<HTMLElement>(`[data-index="${i}"]`);
        el?.focus({ preventScroll: true });
        el?.scrollIntoView({ block: 'nearest' });
    };

    const focusColumn = (col: Column) => {
        const c = columns[col];
        focusItem(col, focus && focus.col === col ? focus.index : (c.selectedIndex ?? c.baseIndex));
    };

    const openPanel = (focusFirstColumn = false) => {
        if (disabled) return;
        setOpen(true);
        // Wait for the popper to mount before scrolling / focusing.
        setTimeout(() => {
            scrollColumns();
            if (focusFirstColumn) focusColumn(0);
        }, 0);
    };

    const close = (refocusInput = false) => {
        setOpen(false);
        setFocus(null);
        if (refocusInput) inputRef.current?.focus();
    };

    // Keep the chosen items in view while the value changes with the panel open.
    useEffect(() => {
        if (open && !focus) scrollColumns('smooth');
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [current]);

    const applyTyped = () => {
        setEditing(false);
        const trimmed = text.trim();
        if (!trimmed) {
            if (value) onChange('');
            return;
        }
        const mins = parseTimeOfDay(trimmed);
        if (mins === null) setText(display);
        else if (mins !== current) commit(mins);
        else setText(display);
    };

    const onInputKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            openPanel(true);
        } else if (e.key === 'Escape' && open) {
            e.preventDefault();
            e.stopPropagation();
            close();
        } else if (e.key === 'Enter' && editing) {
            applyTyped();
        }
    };

    const onItemKeyDown = (e: React.KeyboardEvent, col: Column, index: number) => {
        const move = (fn: () => void) => {
            e.preventDefault();
            e.stopPropagation();
            fn();
        };
        switch (e.key) {
            case 'ArrowDown':
                return move(() => focusItem(col, index + 1));
            case 'ArrowUp':
                return move(() => focusItem(col, index - 1));
            case 'PageDown':
                return move(() => focusItem(col, index + VISIBLE_ROWS - 1));
            case 'PageUp':
                return move(() => focusItem(col, index - VISIBLE_ROWS + 1));
            case 'Home':
                return move(() => focusItem(col, 0));
            case 'End':
                return move(() => focusItem(col, columns[col].items.length - 1));
            case 'ArrowRight':
                return move(() => focusColumn(Math.min(col + 1, 2) as Column));
            case 'ArrowLeft':
                return move(() => focusColumn(Math.max(col - 1, 0) as Column));
            case 'Tab': {
                const next = col + (e.shiftKey ? -1 : 1);
                // Tabbing past either end leaves the panel and returns to the field.
                return move(() => (next < 0 || next > 2 ? close(true) : focusColumn(next as Column)));
            }
            case ' ':
                return move(() => pick(col, index));
            case 'Enter':
                return move(() => {
                    pick(col, index);
                    close(true);
                });
            case 'Escape':
                return move(() => close(true));
            default:
                return undefined;
        }
    };

    return (
        <ClickAwayListener onClickAway={() => open && close()}>
            <Box ref={anchorRef} sx={{ width: '100%' }}>
                <TextField
                    name={name}
                    inputRef={inputRef}
                    value={text}
                    placeholder={placeholder}
                    fullWidth
                    size="small"
                    error={error}
                    disabled={disabled}
                    autoComplete="off"
                    onChange={(e) => {
                        setEditing(true);
                        setText(e.target.value);
                    }}
                    onClick={() => !open && openPanel()}
                    onKeyDown={onInputKeyDown}
                    onBlur={() => {
                        if (editing) applyTyped();
                        onBlur?.();
                    }}
                    slotProps={{
                        htmlInput: {
                            'aria-label': ariaLabel,
                            'aria-haspopup': 'listbox',
                            'aria-expanded': open,
                            inputMode: 'text',
                        },
                        input: {
                            startAdornment: (
                                <InputAdornment position="start">
                                    <AccessTimeOutlinedIcon
                                        onClick={() => (open ? close() : openPanel())}
                                        sx={{ fontSize: 16, color: 'var(--mui-palette-text-secondary)', cursor: 'pointer' }}
                                    />
                                </InputAdornment>
                            ),
                        },
                    }}
                    sx={fieldSx}
                />
                <Popper
                    open={open}
                    anchorEl={anchorRef.current}
                    placement="bottom-start"
                    sx={{ zIndex: (t) => t.zIndex.modal + 1 }}
                    modifiers={[{ name: 'offset', options: { offset: [0, 4] } }]}
                >
                    <Paper
                        elevation={4}
                        role="group"
                        aria-label={`${ariaLabel} picker`}
                        // Keep clicks from blurring the field and closing the panel mid-pick.
                        onMouseDown={(e) => e.preventDefault()}
                        sx={{
                            display: 'flex',
                            gap: 0.5,
                            p: 0.5,
                            border: '1px solid var(--mui-palette-divider)',
                            borderRadius: '4px',
                            bgcolor: 'var(--mui-palette-background-paper)',
                        }}
                    >
                        {columns.map((c, colIndex) => {
                            const col = colIndex as Column;
                            return (
                                <Box
                                    key={col}
                                    ref={(el: HTMLDivElement | null) => {
                                        columnRefs.current[col] = el;
                                    }}
                                    role="listbox"
                                    aria-label={COLUMN_LABELS[col]}
                                    sx={{
                                        width: 56,
                                        maxHeight: ITEM_HEIGHT * VISIBLE_ROWS,
                                        overflowY: 'auto',
                                        overscrollBehavior: 'contain',
                                        scrollbarWidth: 'none',
                                        '&::-webkit-scrollbar': { display: 'none' },
                                    }}
                                >
                                    {c.items.map((label, index) => {
                                        const isSelected = c.selectedIndex === index;
                                        const isFocused = focus?.col === col && focus.index === index;
                                        const isDisabled = disabledAt(col, index) && !isSelected;
                                        return (
                                            <Box
                                                key={label}
                                                data-index={index}
                                                role="option"
                                                aria-selected={isSelected}
                                                aria-disabled={isDisabled || undefined}
                                                tabIndex={isFocused || (!focus && isSelected) ? 0 : -1}
                                                onClick={() => {
                                                    setFocus({ col, index });
                                                    pick(col, index);
                                                }}
                                                onKeyDown={(e) => onItemKeyDown(e, col, index)}
                                                sx={{
                                                    height: ITEM_HEIGHT,
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    boxSizing: 'border-box',
                                                    borderRadius: '4px',
                                                    fontSize: '0.85rem',
                                                    cursor: isDisabled ? 'default' : 'pointer',
                                                    userSelect: 'none',
                                                    outline: 'none',
                                                    color: isDisabled ? 'var(--mui-palette-text-disabled)' : 'var(--mui-palette-text-primary)',
                                                    ...(isSelected && {
                                                        bgcolor: 'var(--mui-palette-primary-main)',
                                                        color: 'var(--mui-palette-primary-contrastText)',
                                                        fontWeight: 700,
                                                    }),
                                                    ...(!isSelected &&
                                                        !isDisabled && { '&:hover': { bgcolor: 'var(--mui-palette-action-hover)' } }),
                                                    ...(isFocused && { boxShadow: 'inset 0 0 0 2px var(--mui-palette-text-primary)' }),
                                                }}
                                            >
                                                {label}
                                            </Box>
                                        );
                                    })}
                                </Box>
                            );
                        })}
                    </Paper>
                </Popper>
            </Box>
        </ClickAwayListener>
    );
}
