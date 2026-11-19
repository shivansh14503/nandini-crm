'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Box, ClickAwayListener, InputAdornment, Paper, Popper, TextField } from '@mui/material';
import AccessTimeOutlinedIcon from '@mui/icons-material/AccessTimeOutlined';
import { localNow, parseTimeOfDay } from '@/utils/pastDates';
import { fieldSx } from './FormField';

const pad = (n: number) => String(n).padStart(2, '0');

/** How the value is stored: `12h` → `04:15 PM` (follow-up times), `24h` → `16:15` (the `datetime-local` time part). */
export type TimeValueFormat = '12h' | '24h';

/** Minutes since midnight → `04:15 PM`. */
export function formatTime12(mins: number): string {
    const h = Math.floor(mins / 60);
    return `${pad(h % 12 || 12)}:${pad(mins % 60)} ${h < 12 ? 'AM' : 'PM'}`;
}

/** Minutes since midnight → `16:15`. */
export const formatTime24 = (mins: number) => `${pad(Math.floor(mins / 60))}:${pad(mins % 60)}`;

/** Minutes since midnight → the short 12-hour hint shown beside 24-hour times (`4:15 PM`). */
const hint12 = (mins: number) => {
    const h = Math.floor(mins / 60);
    return `${h % 12 || 12}:${pad(mins % 60)} ${h < 12 ? 'AM' : 'PM'}`;
};

/** Hour → `4 PM`, the label under each 24-hour hour in the picker. */
const hourHint = (h: number) => `${h % 12 || 12} ${h < 12 ? 'AM' : 'PM'}`;

const formatValue = (mins: number, format: TimeValueFormat) => (format === '24h' ? formatTime24(mins) : formatTime12(mins));

/** Where the columns sit when the field is empty: the start of the working day. */
const DEFAULT_MINUTES = 9 * 60;

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const MINUTES = Array.from({ length: 60 }, (_, i) => i);

type Column = 0 | 1;
const COLUMN_LABELS = ['Hours', 'Minutes'] as const;
/** Share of the panel width each column takes (the panel matches the field's width), with a floor so narrow fields stay usable. */
const COLUMN_FLEX = [3, 2] as const;
const COLUMN_MIN_WIDTHS = [84, 52] as const;
const ITEM_HEIGHT = 32;
const VISIBLE_ROWS = 7;

export interface TimePickerProps {
    value: string;
    onChange: (value: string) => void;
    /** Stored format of `value` / `onChange`; the field always shows `HH:mm` (24-hour) with a 12-hour hint. Defaults to `12h`. */
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
 * Time-of-day picker: a 24-hour `HH:mm` text field that opens two scrollable columns (hours 00–23, minutes).
 * Each hour carries its 12-hour reading (`16 · 4 PM`) and the field shows the picked time in 12-hour form too,
 * so nobody has to convert in their head. Clicking an item updates the value at once. Typing a time
 * (`16:15`, `4:15 pm`) is accepted on blur / Enter.
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
    placeholder = 'HH:mm',
    disabled,
}: TimePickerProps) {
    const current = useMemo(() => parseTimeOfDay(value), [value]);
    const display = current === null ? value ?? '' : formatTime24(current);

    const [open, setOpen] = useState(false);
    // What the user is typing; the field shows the formatted value whenever they aren't.
    const [draft, setDraft] = useState<string | null>(null);
    const editing = draft !== null;
    const text = draft ?? display;
    const [focus, setFocus] = useState<{ col: Column; index: number } | null>(null);
    const [anchorEl, setAnchorEl] = useState<HTMLDivElement | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const columnRefs = useRef<(HTMLDivElement | null)[]>([]);

    // 12-hour reading of whatever is in the field right now (typed text included).
    const typedMinutes = editing ? parseTimeOfDay(text) : current;
    const fieldHint = typedMinutes === null ? null : hint12(typedMinutes);

    // Earliest allowed time today (null on other days). No date yet counts as today: that's where the time lands.
    const now = localNow();
    const day = (date ?? '').slice(0, 10) || now.slice(0, 10);
    const minMinutes = day === now.slice(0, 10) ? Number(now.slice(11, 13)) * 60 + Number(now.slice(14, 16)) : null;

    // Hour / minute the columns work from: the value, or a sensible starting point when empty.
    const baseMinutes = current ?? Math.max(DEFAULT_MINUTES, minMinutes ?? 0);
    const base = { h: Math.floor(baseMinutes / 60), m: baseMinutes % 60 };
    const selected = current === null ? null : base;

    const isPast = (mins: number) => minMinutes !== null && mins < minMinutes;
    const disabledAt = (col: Column, index: number): boolean => {
        if (minMinutes === null) return false;
        if (col === 0) return isPast(HOURS[index] * 60 + 59);
        return isPast(base.h * 60 + MINUTES[index]);
    };

    const columns: { count: number; selectedIndex: number | null; baseIndex: number }[] = [
        { count: HOURS.length, selectedIndex: selected ? selected.h : null, baseIndex: base.h },
        { count: MINUTES.length, selectedIndex: selected ? selected.m : null, baseIndex: base.m },
    ];

    const commit = (mins: number) => {
        // A change never lands in the past; clamp to now instead of leaving an invalid time.
        const next = minMinutes !== null && mins < minMinutes ? minMinutes : mins;
        onChange(formatValue(next, valueFormat));
    };

    const pick = (col: Column, index: number) => {
        if (disabledAt(col, index)) return;
        commit(col === 0 ? HOURS[index] * 60 + base.m : base.h * 60 + MINUTES[index]);
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
        const i = Math.min(Math.max(index, 0), columns[col].count - 1);
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

    // Moving the date to today can leave the picked time behind us: push it to the next quarter hour.
    // Only on a date change, so a record that loads with an old time keeps it.
    const prevDay = useRef(day);
    useEffect(() => {
        if (prevDay.current === day) return;
        prevDay.current = day;
        if (current !== null && minMinutes !== null && current < minMinutes) {
            commit(Math.min(23 * 60 + 59, Math.ceil(minMinutes / 15) * 15));
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [day]);

    const applyTyped = () => {
        setDraft(null);
        const trimmed = text.trim();
        if (!trimmed) {
            if (value) onChange('');
            return;
        }
        const mins = parseTimeOfDay(trimmed);
        if (mins !== null && mins !== current) commit(mins);
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
                return move(() => focusItem(col, columns[col].count - 1));
            case 'ArrowRight':
                return move(() => focusColumn(1));
            case 'ArrowLeft':
                return move(() => focusColumn(0));
            case 'Tab': {
                const next = col + (e.shiftKey ? -1 : 1);
                // Tabbing past either end leaves the panel and returns to the field.
                return move(() => (next < 0 || next > 1 ? close(true) : focusColumn(next as Column)));
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
            <Box ref={setAnchorEl} sx={{ width: '100%' }}>
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
                    onChange={(e) => setDraft(e.target.value)}
                    onClick={() => !open && openPanel()}
                    onKeyDown={onInputKeyDown}
                    onBlur={() => {
                        if (editing) applyTyped();
                        onBlur?.();
                    }}
                    slotProps={{
                        htmlInput: {
                            'aria-label': fieldHint ? `${ariaLabel}, ${fieldHint}` : ariaLabel,
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
                            endAdornment: fieldHint ? (
                                <InputAdornment position="end" sx={{ ml: 0.75, height: 'auto', maxHeight: 'none', alignSelf: 'center' }}>
                                    <Box
                                        component="span"
                                        aria-hidden
                                        sx={{
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            height: 20,
                                            px: 1,
                                            borderRadius: '999px',
                                            fontSize: '0.7rem',
                                            fontWeight: 600,
                                            lineHeight: 1,
                                            whiteSpace: 'nowrap',
                                            color: 'var(--crm-text-blue-700)',
                                            backgroundColor: 'var(--mui-palette-primary-soft)',
                                            border: '1px solid var(--mui-palette-primary-softBorder)',
                                        }}
                                    >
                                        {fieldHint}
                                    </Box>
                                </InputAdornment>
                            ) : undefined,
                        },
                    }}
                    sx={{
                        ...fieldSx,
                        '& .MuiOutlinedInput-root': {
                            ...fieldSx['& .MuiOutlinedInput-root'],
                            alignItems: 'center',
                            pr: '6px',
                        },
                        '& .MuiInputAdornment-positionStart': { mr: 0.75, '& svg': { display: 'block' } },
                        '& .MuiOutlinedInput-input': { minWidth: 0, fontVariantNumeric: 'tabular-nums', textOverflow: 'ellipsis' },
                    }}
                />
                <Popper
                    open={open}
                    anchorEl={anchorEl}
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
                            width: anchorEl?.offsetWidth,
                            boxSizing: 'border-box',
                            border: '1px solid var(--mui-palette-border-main)',
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
                                        flex: `${COLUMN_FLEX[col]} 1 0`,
                                        minWidth: COLUMN_MIN_WIDTHS[col],
                                        maxHeight: ITEM_HEIGHT * VISIBLE_ROWS,
                                        overflowY: 'auto',
                                        overscrollBehavior: 'contain',
                                        scrollbarWidth: 'none',
                                        '&::-webkit-scrollbar': { display: 'none' },
                                    }}
                                >
                                    {Array.from({ length: c.count }, (_, index) => {
                                        const isSelected = c.selectedIndex === index;
                                        const isFocused = focus?.col === col && focus.index === index;
                                        const isDisabled = disabledAt(col, index) && !isSelected;
                                        const hourHintText = col === 0 ? hourHint(HOURS[index]) : null;
                                        return (
                                            <Box
                                                key={index}
                                                data-index={index}
                                                role="option"
                                                aria-selected={isSelected}
                                                aria-disabled={isDisabled || undefined}
                                                aria-label={hourHintText ? `${pad(HOURS[index])}, ${hourHintText}` : undefined}
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
                                                    gap: 1,
                                                    boxSizing: 'border-box',
                                                    borderRadius: '4px',
                                                    fontSize: '0.85rem',
                                                    cursor: isDisabled ? 'default' : 'pointer',
                                                    userSelect: 'none',
                                                    outline: 'none',
                                                    color: isDisabled ? 'var(--mui-palette-text-disabled)' : 'var(--mui-palette-text-primary)',
                                                    '& .time-hint': {
                                                        fontSize: '0.68rem',
                                                        color: isDisabled ? 'var(--mui-palette-text-disabled)' : 'var(--mui-palette-text-muted)',
                                                    },
                                                    ...(isSelected && {
                                                        bgcolor: 'var(--crm-fill-blue-600)',
                                                        color: '#ffffff',
                                                        fontWeight: 700,
                                                        '& .time-hint': { fontSize: '0.68rem', fontWeight: 500, color: 'rgb(255 255 255 / 0.85)' },
                                                    }),
                                                    ...(!isSelected &&
                                                        !isDisabled && {
                                                            '&:hover': {
                                                                bgcolor: 'var(--mui-palette-primary-soft)',
                                                                color: 'var(--crm-text-blue-700)',
                                                                '& .time-hint': { color: 'var(--crm-text-blue-600)' },
                                                            },
                                                        }),
                                                    ...(isFocused && { boxShadow: 'inset 0 0 0 2px rgb(var(--crm-accent-rgb) / 0.6)' }),
                                                }}
                                            >
                                                <span>{pad(col === 0 ? HOURS[index] : MINUTES[index])}</span>
                                                {hourHintText && <span className="time-hint">{hourHintText}</span>}
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
