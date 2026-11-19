'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Box, CircularProgress, ClickAwayListener, IconButton, InputBase, Paper, Popper, Tooltip, Typography } from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import KeyboardReturnIcon from '@mui/icons-material/KeyboardReturn';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import {
    GLOBAL_SEARCH_CATEGORIES,
    searchPageHref,
    type GlobalSearchCategory,
    type GlobalSearchResult,
} from '@/services/globalSearch.service';
import { useGlobalSearch } from '@/hooks/queries/useGlobalSearch';
import { guardNavigation } from '@/hooks/useFormDraftGuard';
import { ModuleIconTile, SEARCH_CATEGORY_META, SearchMatchChip, SearchMetaTag } from '@/components/search/searchCategories';

/** Suggestions load once typing pauses this long (a superseded request is cancelled, see useGlobalSearch). */
const DEBOUNCE_MS = 250;
/** Characters needed before suggestions load; Enter opens the full results page from a single character. */
const MIN_SUGGEST_CHARS = 2;
/**
 * Suggestions match phone / account / other numbers by any part only from this many digits (the API default,
 * DEFAULT_MIN_NUMBER_DIGITS); the results page matches them from one digit.
 */
const MIN_SUGGEST_DIGITS = 3;
const NUMBER_LIKE = /^\+?[\d\s().-]+$/;
/** Suggestions per module in the dropdown; the results page shows the rest. */
const SUGGESTIONS_PER_MODULE = 3;

/** True when the keyboard event comes from a place where '/' should be typed, not trigger search. */
const isTypingTarget = (target: EventTarget | null) =>
    target instanceof HTMLElement &&
    (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));

/**
 * Navbar search across every module (record numbers, names, emails, phones, GSTIN, PAN, bank account).
 * Press '/' (or Ctrl/⌘+K) to focus. Typing shows suggestions; Enter opens the full results page, or the
 * suggestion picked with ↑/↓. Esc closes.
 */
export function GlobalSearch() {
    const router = useRouter();
    const inputRef = useRef<HTMLInputElement>(null);
    // Callback ref (stored in state) so the popper can anchor without reading a ref during render.
    const [anchorEl, setAnchorEl] = useState<HTMLDivElement | null>(null);
    const [query, setQuery] = useState('');
    const [debouncedQuery, setDebouncedQuery] = useState('');
    const [open, setOpen] = useState(false);
    // 0 = "See all results"; 1..n = suggestions.
    const [activeIndex, setActiveIndex] = useState(0);

    // Debounce the query so results update after typing pauses.
    useEffect(() => {
        const timer = window.setTimeout(() => {
            setDebouncedQuery(query);
            setActiveIndex(0);
        }, DEBOUNCE_MS);
        return () => window.clearTimeout(timer);
    }, [query]);

    // '/' (when not already typing somewhere) or Ctrl/⌘+K focuses the search box.
    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            const slash = e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey && !isTypingTarget(e.target);
            // `key` is missing on some synthetic keydown events (e.g. browser autofill).
            const cmdK = e.key?.toLowerCase() === 'k' && (e.ctrlKey || e.metaKey);
            if (slash || cmdK) {
                e.preventDefault();
                inputRef.current?.focus();
                setOpen(true);
            }
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, []);

    const trimmed = debouncedQuery.trim();
    const typed = query.trim();
    // Too short for useful suggestions: only the "See all results" row (Enter) is offered.
    const tooShort = typed.length < MIN_SUGGEST_CHARS;
    // A number too short for suggestions to match phones / accounts (e.g. "991"): say so instead of "no records".
    const shortNumber = NUMBER_LIKE.test(trimmed) && trimmed.replace(/\D/g, '').length < MIN_SUGGEST_DIGITS;
    const { results, isFetching } = useGlobalSearch(trimmed.length >= MIN_SUGGEST_CHARS ? trimmed : '', { limit: SUGGESTIONS_PER_MODULE });
    const flat = useMemo<GlobalSearchResult[]>(
        () => (tooShort ? [] : GLOBAL_SEARCH_CATEGORIES.flatMap((c) => results[c])),
        [results, tooShort]
    );
    const showPopper = open && typed.length > 0;
    const optionCount = flat.length + 1;

    const close = () => {
        setOpen(false);
        setActiveIndex(0);
    };

    const navigate = (href: string) => {
        close();
        setQuery('');
        inputRef.current?.blur();
        // A dirty form on the page asks "Keep Editing" / "Discard & Leave" first.
        guardNavigation(() => router.push(href));
    };

    const openResultsPage = (category?: GlobalSearchCategory) => {
        if (typed) navigate(searchPageHref(typed, category));
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Escape') {
            close();
            inputRef.current?.blur();
        } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            setOpen(true);
            setActiveIndex((i) => (i + 1) % optionCount);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActiveIndex((i) => (i - 1 + optionCount) % optionCount);
        } else if (e.key === 'Enter') {
            e.preventDefault();
            const picked = activeIndex > 0 ? flat[activeIndex - 1] : undefined;
            if (picked) navigate(picked.href);
            else openResultsPage();
        }
    };

    /** Plain clicks navigate through the guard and close; modifier clicks open a new tab natively. */
    const handleLinkClick = (e: React.MouseEvent, href: string) => {
        if (e.ctrlKey || e.metaKey || e.shiftKey) return;
        e.preventDefault();
        navigate(href);
    };

    const stillTyping = typed !== trimmed;

    return (
        <ClickAwayListener onClickAway={close}>
            <Box>
                {/* Phones: the search box is hidden, so the icon opens the results page. */}
                <Tooltip title="Search">
                    <IconButton
                        component={Link}
                        href="/search"
                        aria-label="Search CRM"
                        size="small"
                        sx={{
                            display: { xs: 'inline-flex', md: 'none' },
                            border: '1px solid var(--mui-palette-border-main)',
                            color: 'var(--mui-palette-text-secondary)',
                            backgroundColor: 'var(--mui-palette-background-paper)',
                            transition: 'all 0.15s ease',
                            '&:hover': {
                                borderColor: 'var(--crm-blue-300)',
                                backgroundColor: 'var(--mui-palette-primary-soft)',
                                color: 'var(--crm-text-blue-700)',
                            },
                        }}
                    >
                        <SearchIcon sx={{ fontSize: 18 }} />
                    </IconButton>
                </Tooltip>

                <Box
                    ref={setAnchorEl}
                    sx={{
                        display: { xs: 'none', md: 'flex' },
                        alignItems: 'center',
                        gap: 1,
                        backgroundColor: 'var(--crm-gray-100)',
                        border: '1px solid var(--crm-gray-200)',
                        borderRadius: '8px',
                        px: 1.5,
                        py: 0.5,
                        width: 220,
                        transition: 'all 0.2s ease',
                        '&:hover': {
                            borderColor: 'var(--crm-blue-300)',
                        },
                        '&:focus-within': {
                            backgroundColor: 'var(--mui-palette-background-paper)',
                            borderColor: 'var(--mui-palette-primary-main)',
                            boxShadow: '0 0 0 3px rgb(var(--crm-accent-rgb) / 0.22)',
                            width: 300,
                        },
                    }}
                >
                    <SearchIcon sx={{ fontSize: 16, color: 'var(--crm-gray-400)', flexShrink: 0 }} />
                    <InputBase
                        inputRef={inputRef}
                        value={query}
                        onChange={(e) => {
                            setQuery(e.target.value);
                            setOpen(true);
                            // New text: Enter means "see all results" until a fresh suggestion is picked.
                            setActiveIndex(0);
                        }}
                        onFocus={() => setOpen(true)}
                        onKeyDown={handleKeyDown}
                        placeholder="Search name, number, GST, PAN…"
                        slotProps={{
                            input: {
                                'aria-label': 'Search CRM',
                                role: 'combobox',
                                'aria-expanded': showPopper,
                                'aria-controls': 'global-search-results',
                                'aria-autocomplete': 'list',
                                'aria-activedescendant': showPopper ? `global-search-option-${activeIndex}` : undefined,
                                maxLength: 100,
                            },
                        }}
                        sx={{
                            fontSize: '0.8rem',
                            color: 'var(--crm-gray-700)',
                            width: '100%',
                            '& input::placeholder': { color: 'var(--crm-gray-400)', opacity: 1 },
                        }}
                    />
                    {isFetching && !tooShort ? (
                        <CircularProgress size={12} thickness={5} sx={{ color: 'var(--mui-palette-text-muted)', flexShrink: 0 }} />
                    ) : (
                        <Typography
                            sx={{
                                fontSize: '0.65rem',
                                color: 'var(--crm-gray-400)',
                                backgroundColor: 'var(--crm-gray-200)',
                                borderRadius: '4px',
                                px: 0.6,
                                py: 0.2,
                                fontFamily: 'monospace',
                                flexShrink: 0,
                            }}
                        >
                            /
                        </Typography>
                    )}
                </Box>

                <Popper
                    open={showPopper}
                    anchorEl={anchorEl}
                    placement="bottom-end"
                    sx={{ zIndex: 1400 }}
                    modifiers={[{ name: 'offset', options: { offset: [0, 6] } }]}
                >
                    <Paper
                        id="global-search-results"
                        role="listbox"
                        elevation={0}
                        sx={{
                            width: 420,
                            maxWidth: 'calc(100vw - 32px)',
                            maxHeight: 480,
                            overflowY: 'auto',
                            border: '1px solid var(--mui-palette-border-main)',
                            borderRadius: '10px',
                            boxShadow: '0 12px 32px rgba(15, 23, 42, 0.14)',
                            pb: 0.5,
                        }}
                    >
                        {/* Option 0: the full results page */}
                        <Box
                            id="global-search-option-0"
                            component={Link}
                            href={searchPageHref(typed)}
                            role="option"
                            aria-selected={activeIndex === 0}
                            onMouseEnter={() => setActiveIndex(0)}
                            onClick={(e: React.MouseEvent) => handleLinkClick(e, searchPageHref(typed))}
                            sx={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 1.25,
                                px: 1.75,
                                py: 1.1,
                                textDecoration: 'none',
                                borderBottom: '1px solid var(--mui-palette-border-light)',
                                backgroundColor: activeIndex === 0 ? 'var(--mui-palette-primary-soft)' : 'var(--mui-palette-background-subtle)',
                            }}
                        >
                            <SearchIcon sx={{ fontSize: 18, color: 'var(--crm-text-blue-600)' }} />
                            <Typography noWrap sx={{ flex: 1, minWidth: 0, fontSize: '0.84rem', color: 'var(--crm-slate-900)' }}>
                                See all results for{' '}
                                <Box component="span" sx={{ fontWeight: 700, color: 'var(--crm-text-blue-700)' }}>
                                    &lsquo;{typed}&rsquo;
                                </Box>
                            </Typography>
                            <Box
                                sx={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    color: 'var(--mui-palette-text-muted)',
                                    border: '1px solid var(--mui-palette-border-main)',
                                    borderRadius: '4px',
                                    px: 0.4,
                                    flexShrink: 0,
                                }}
                            >
                                <KeyboardReturnIcon sx={{ fontSize: 13 }} />
                            </Box>
                        </Box>

                        {flat.length === 0 ? (
                            <Typography sx={{ px: 2, py: 2.5, fontSize: '0.82rem', color: 'var(--mui-palette-text-secondary)', textAlign: 'center' }}>
                                {tooShort ? (
                                    <>Type at least {MIN_SUGGEST_CHARS} characters for suggestions, or press Enter to search everything.</>
                                ) : stillTyping || isFetching ? (
                                    'Searching…'
                                ) : shortNumber ? (
                                    <>
                                        Suggestions match phone and other numbers from {MIN_SUGGEST_DIGITS} digits. Press Enter to search
                                        every record for &lsquo;{trimmed}&rsquo;.
                                    </>
                                ) : (
                                    <>No matching records found for &lsquo;{trimmed}&rsquo;</>
                                )}
                            </Typography>
                        ) : (
                            GLOBAL_SEARCH_CATEGORIES.filter((c) => results[c].length > 0).map((category) => {
                                const { label, Icon, color } = SEARCH_CATEGORY_META[category];
                                const moreHref = searchPageHref(typed, category);
                                return (
                                    <Box
                                        key={category}
                                        sx={{
                                            // Each module's group sits on a faint panel of its identity color.
                                            mx: 0.75,
                                            mt: 0.75,
                                            pt: 0.5,
                                            pb: 0.25,
                                            borderRadius: '8px',
                                            overflow: 'hidden',
                                            backgroundColor: `color-mix(in srgb, ${color.soft} 75%, var(--mui-palette-background-paper))`,
                                            border: `1px solid color-mix(in srgb, ${color.border} 60%, transparent)`,
                                        }}
                                    >
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, px: 1.75, py: 0.5 }}>
                                            <Icon sx={{ fontSize: 15, color: color.main }} />
                                            <Typography
                                                sx={{
                                                    flex: 1,
                                                    fontSize: '0.7rem',
                                                    fontWeight: 700,
                                                    letterSpacing: '0.05em',
                                                    textTransform: 'uppercase',
                                                    color: color.text,
                                                }}
                                            >
                                                {label}
                                            </Typography>
                                            <Box
                                                component={Link}
                                                href={moreHref}
                                                onClick={(e: React.MouseEvent) => handleLinkClick(e, moreHref)}
                                                tabIndex={-1}
                                                sx={{
                                                    display: 'inline-flex',
                                                    alignItems: 'center',
                                                    fontSize: '0.7rem',
                                                    fontWeight: 600,
                                                    color: 'var(--crm-text-blue-700)',
                                                    textDecoration: 'none',
                                                    borderRadius: '4px',
                                                    pl: 0.75,
                                                    pr: 0.25,
                                                    '&:hover': { backgroundColor: 'var(--mui-palette-primary-soft)', color: 'var(--crm-text-blue-600)' },
                                                }}
                                            >
                                                View all
                                                <ChevronRightIcon sx={{ fontSize: 14 }} />
                                            </Box>
                                        </Box>
                                        {results[category].map((result) => {
                                            const index = flat.indexOf(result) + 1;
                                            const active = index === activeIndex;
                                            return (
                                                <Box
                                                    key={`${category}-${result.id}`}
                                                    id={`global-search-option-${index}`}
                                                    component={Link}
                                                    href={result.href}
                                                    role="option"
                                                    aria-selected={active}
                                                    onMouseEnter={() => setActiveIndex(index)}
                                                    onClick={(e: React.MouseEvent) => handleLinkClick(e, result.href)}
                                                    sx={{
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: 1.25,
                                                        px: 1.75,
                                                        py: 0.8,
                                                        textDecoration: 'none',
                                                        backgroundColor: active ? 'var(--mui-palette-primary-soft)' : 'transparent',
                                                        // Module-colored edge marks the highlighted row.
                                                        boxShadow: active ? `inset 3px 0 0 ${color.main}` : 'none',
                                                    }}
                                                >
                                                    <ModuleIconTile category={category} />
                                                    <Box sx={{ minWidth: 0, flex: 1 }}>
                                                        <Typography noWrap sx={{ fontSize: '0.84rem', fontWeight: 600, color: 'var(--crm-slate-900)' }}>
                                                            {result.title}
                                                        </Typography>
                                                        {result.subtitle && (
                                                            <Typography noWrap sx={{ fontSize: '0.74rem', color: 'var(--mui-palette-text-secondary)' }}>
                                                                {result.subtitle}
                                                            </Typography>
                                                        )}
                                                        {result.match && (
                                                            <Box sx={{ mt: 0.3, display: 'flex', minWidth: 0 }}>
                                                                <SearchMatchChip match={result.match} dense />
                                                            </Box>
                                                        )}
                                                    </Box>
                                                    {result.meta && <SearchMetaTag>{result.meta}</SearchMetaTag>}
                                                </Box>
                                            );
                                        })}
                                    </Box>
                                );
                            })
                        )}
                    </Paper>
                </Popper>
            </Box>
        </ClickAwayListener>
    );
}
