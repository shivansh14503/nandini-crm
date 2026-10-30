'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Box, ClickAwayListener, InputBase, Paper, Popper, Typography } from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import ApartmentIcon from '@mui/icons-material/Apartment';
import PersonOutlinedIcon from '@mui/icons-material/PersonOutlined';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import WorkspacePremiumOutlinedIcon from '@mui/icons-material/WorkspacePremiumOutlined';
import {
    GLOBAL_SEARCH_CATEGORIES,
    type GlobalSearchCategory,
    type GlobalSearchResult,
} from '@/services/globalSearch.service';
import { useGlobalSearch } from '@/hooks/queries/useGlobalSearch';

const DEBOUNCE_MS = 150;

const CATEGORY_META: Record<GlobalSearchCategory, { label: string; icon: React.ReactElement }> = {
    organizations: { label: 'Organizations', icon: <ApartmentIcon sx={{ fontSize: 16 }} /> },
    contacts: { label: 'Contacts', icon: <PersonOutlinedIcon sx={{ fontSize: 16 }} /> },
    leads: { label: 'Leads', icon: <TrendingUpIcon sx={{ fontSize: 16 }} /> },
    opportunities: { label: 'Opportunities', icon: <WorkspacePremiumOutlinedIcon sx={{ fontSize: 16 }} /> },
};

/** True when the keyboard event comes from a place where '/' should be typed, not trigger search. */
const isTypingTarget = (target: EventTarget | null) =>
    target instanceof HTMLElement &&
    (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));

/**
 * Navbar search across organizations, contacts, leads and opportunities.
 * Press '/' (or Ctrl/⌘+K) to focus; ↑/↓ + Enter to open a result; Esc to close.
 */
export function GlobalSearch() {
    const router = useRouter();
    const inputRef = useRef<HTMLInputElement>(null);
    // Callback ref (stored in state) so the popper can anchor without reading a ref during render.
    const [anchorEl, setAnchorEl] = useState<HTMLDivElement | null>(null);
    const [query, setQuery] = useState('');
    const [debouncedQuery, setDebouncedQuery] = useState('');
    const [open, setOpen] = useState(false);
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
            const cmdK = e.key.toLowerCase() === 'k' && (e.ctrlKey || e.metaKey);
            if (slash || cmdK) {
                e.preventDefault();
                inputRef.current?.focus();
                setOpen(true);
            }
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, []);

    const { results } = useGlobalSearch(debouncedQuery);
    const flat = useMemo<GlobalSearchResult[]>(
        () => GLOBAL_SEARCH_CATEGORIES.flatMap((c) => results[c]),
        [results]
    );
    const trimmed = debouncedQuery.trim();
    const showPopper = open && trimmed.length > 0;

    const close = () => {
        setOpen(false);
        setActiveIndex(0);
    };

    const go = (result: GlobalSearchResult) => {
        close();
        setQuery('');
        inputRef.current?.blur();
        router.push(result.href);
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Escape') {
            close();
            inputRef.current?.blur();
        } else if (e.key === 'ArrowDown' && flat.length > 0) {
            e.preventDefault();
            setOpen(true);
            setActiveIndex((i) => (i + 1) % flat.length);
        } else if (e.key === 'ArrowUp' && flat.length > 0) {
            e.preventDefault();
            setActiveIndex((i) => (i - 1 + flat.length) % flat.length);
        } else if (e.key === 'Enter' && flat[activeIndex]) {
            e.preventDefault();
            go(flat[activeIndex]);
        }
    };

    return (
        <ClickAwayListener onClickAway={close}>
            <Box>
                <Box
                    ref={setAnchorEl}
                    sx={{
                        display: { xs: 'none', md: 'flex' },
                        alignItems: 'center',
                        gap: 1,
                        backgroundColor: '#F3F4F6',
                        border: '1px solid #E5E7EB',
                        borderRadius: '8px',
                        px: 1.5,
                        py: 0.5,
                        width: 220,
                        transition: 'all 0.2s ease',
                        '&:focus-within': {
                            backgroundColor: '#FFFFFF',
                            borderColor: '#93C5FD',
                            boxShadow: '0 0 0 3px rgba(147,197,253,0.3)',
                            width: 300,
                        },
                    }}
                >
                    <SearchIcon sx={{ fontSize: 16, color: '#9CA3AF', flexShrink: 0 }} />
                    <InputBase
                        inputRef={inputRef}
                        value={query}
                        onChange={(e) => {
                            setQuery(e.target.value);
                            setOpen(true);
                        }}
                        onFocus={() => setOpen(true)}
                        onKeyDown={handleKeyDown}
                        placeholder="Search CRM..."
                        slotProps={{
                            input: {
                                'aria-label': 'Search CRM',
                                role: 'combobox',
                                'aria-expanded': showPopper,
                                'aria-controls': 'global-search-results',
                                'aria-autocomplete': 'list',
                            },
                        }}
                        sx={{
                            fontSize: '0.8rem',
                            color: '#374151',
                            width: '100%',
                            '& input::placeholder': { color: '#9CA3AF', opacity: 1 },
                        }}
                    />
                    <Typography
                        sx={{
                            fontSize: '0.65rem',
                            color: '#9CA3AF',
                            backgroundColor: '#E5E7EB',
                            borderRadius: '4px',
                            px: 0.6,
                            py: 0.2,
                            fontFamily: 'monospace',
                            flexShrink: 0,
                        }}
                    >
                        /
                    </Typography>
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
                            width: 380,
                            maxWidth: 'calc(100vw - 32px)',
                            maxHeight: 420,
                            overflowY: 'auto',
                            border: '1px solid #e2e8f0',
                            borderRadius: '10px',
                            boxShadow: '0 12px 32px rgba(15, 23, 42, 0.14)',
                            py: 0.5,
                        }}
                    >
                        {flat.length === 0 ? (
                            <Typography sx={{ px: 2, py: 2.5, fontSize: '0.82rem', color: '#64748b', textAlign: 'center' }}>
                                No matching records found for &lsquo;{trimmed}&rsquo;
                            </Typography>
                        ) : (
                            GLOBAL_SEARCH_CATEGORIES.filter((c) => results[c].length > 0).map((category) => (
                                <Box key={category} sx={{ py: 0.5 }}>
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, px: 1.75, py: 0.5, color: '#64748b' }}>
                                        {CATEGORY_META[category].icon}
                                        <Typography sx={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                                            {CATEGORY_META[category].label}
                                        </Typography>
                                        <Box
                                            component="span"
                                            sx={{
                                                fontSize: '0.66rem',
                                                fontWeight: 700,
                                                color: '#1d4ed8',
                                                backgroundColor: '#eff6ff',
                                                borderRadius: '999px',
                                                px: 0.75,
                                                lineHeight: 1.6,
                                            }}
                                        >
                                            {results[category].length}
                                        </Box>
                                    </Box>
                                    {results[category].map((result) => {
                                        const index = flat.indexOf(result);
                                        const active = index === activeIndex;
                                        return (
                                            <Box
                                                key={`${category}-${result.id}`}
                                                component={Link}
                                                href={result.href}
                                                role="option"
                                                aria-selected={active}
                                                onMouseEnter={() => setActiveIndex(index)}
                                                onClick={(e: React.MouseEvent) => {
                                                    // Modifier clicks open a new tab natively; a plain click navigates and closes.
                                                    if (e.ctrlKey || e.metaKey || e.shiftKey) return;
                                                    e.preventDefault();
                                                    go(result);
                                                }}
                                                sx={{
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: 1.25,
                                                    px: 1.75,
                                                    py: 0.9,
                                                    textDecoration: 'none',
                                                    backgroundColor: active ? '#eff6ff' : 'transparent',
                                                }}
                                            >
                                                <Box sx={{ color: active ? '#2563eb' : '#94a3b8', display: 'flex' }}>
                                                    {CATEGORY_META[category].icon}
                                                </Box>
                                                <Box sx={{ minWidth: 0, flex: 1 }}>
                                                    <Typography noWrap sx={{ fontSize: '0.84rem', fontWeight: 600, color: '#0f172a' }}>
                                                        {result.title}
                                                    </Typography>
                                                    {result.subtitle && (
                                                        <Typography noWrap sx={{ fontSize: '0.74rem', color: '#64748b' }}>
                                                            {result.subtitle}
                                                        </Typography>
                                                    )}
                                                </Box>
                                                {result.meta && (
                                                    <Typography
                                                        noWrap
                                                        sx={{
                                                            fontSize: '0.68rem',
                                                            fontWeight: 700,
                                                            color: '#475569',
                                                            backgroundColor: '#f1f5f9',
                                                            borderRadius: '6px',
                                                            px: 0.75,
                                                            py: 0.2,
                                                            flexShrink: 0,
                                                        }}
                                                    >
                                                        {result.meta}
                                                    </Typography>
                                                )}
                                            </Box>
                                        );
                                    })}
                                </Box>
                            ))
                        )}
                    </Paper>
                </Popper>
            </Box>
        </ClickAwayListener>
    );
}
