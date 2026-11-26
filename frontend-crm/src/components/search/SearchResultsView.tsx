'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Box, Button, IconButton, InputBase, Paper, Skeleton, Typography } from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import CloseIcon from '@mui/icons-material/Close';
import SearchOffIcon from '@mui/icons-material/SearchOff';
import { AppBreadcrumbs } from '@/components/common/AppBreadcrumbs';
import { LeadsMasterView } from '@/components/leads';
import { OpportunitiesMasterView } from '@/components/opportunities';
import { QuotationsMasterView } from '@/components/quotations';
import { OrganizationsMasterView } from '@/components/organizations/OrganizationsMasterView';
import { ContactsMasterView } from '@/components/contacts';
import { TicketsMasterView } from '@/components/tickets';
import { ContractsMasterView } from '@/components/contracts';
import { ProductsMasterView } from '@/components/products';
import { PartnerCompaniesMasterView } from '@/components/partner-companies';
import { useQuery } from '@tanstack/react-query';
import { useGlobalSearch } from '@/hooks/queries/useGlobalSearch';
import { queryKeys } from '@/hooks/queries/queryKeys';
import {
    GLOBAL_SEARCH_CATEGORIES,
    fetchSearchRecords,
    isGlobalSearchCategory,
    searchPageHref,
    type GlobalSearchCategory,
} from '@/services/globalSearch.service';
import { fmtCount, useDisplayFormats } from '@/utils/formats';
import { ModuleIconTile, SEARCH_CATEGORY_META } from './searchCategories';
import { SearchScopeProvider, useDrawerClaim, type SearchScopeValue } from './SearchScope';

/** Matching ids per module come back capped at this many (backend MAX_IDS_PER_MODULE). */
const MAX_IDS_PER_MODULE = 1000;

/** Each module's own list view; inside a SearchScopeProvider it shows only the matched records (see SearchScope). */
const MODULE_VIEWS: Record<GlobalSearchCategory, React.ComponentType> = {
    leads: LeadsMasterView,
    opportunities: OpportunitiesMasterView,
    quotations: QuotationsMasterView,
    organizations: OrganizationsMasterView,
    contacts: ContactsMasterView,
    tickets: TicketsMasterView,
    contracts: ContractsMasterView,
    products: ProductsMasterView,
    partnerCompanies: PartnerCompaniesMasterView,
};

/** A count in the device's grouping until the company saves its formats (as before), then in the company grouping. */
const countText = (value: number, customized: boolean) => (customized ? fmtCount(value) : value.toLocaleString());

const SEARCHABLE_FIELDS = ['Record numbers', 'Names', 'Emails', 'Phone numbers', 'GSTIN', 'PAN', 'Bank account numbers'];

/**
 * /search page body: a search box, module tabs with match counts, and every module's matches in that module's own
 * list table (same columns, column manager, record drawer, toolbar and pagination as its list page).
 */
export function SearchResultsView() {
    const params = useSearchParams();
    const q = (params.get('q') ?? '').trim();
    const moduleParam = params.get('module');
    const activeModule = isGlobalSearchCategory(moduleParam) ? moduleParam : undefined;

    // minDigits 1: after Enter even a single digit matches phone / account / other numbers by any part.
    const search = useGlobalSearch(q, { ids: true, totals: true, minDigits: 1 });
    const claimDrawer = useDrawerClaim();
    const { customized } = useDisplayFormats();

    const totals = search.totals;
    const ids = search.ids;
    const grandTotal = totals ? GLOBAL_SEARCH_CATEGORIES.reduce((sum, c) => sum + totals[c], 0) : 0;
    const shown = GLOBAL_SEARCH_CATEGORIES.filter((c) => (ids?.[c].length ?? 0) > 0 && (!activeModule || activeModule === c));
    const loading = search.isLoading || !totals || !ids;

    return (
        <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
            <Box sx={{ px: { xs: 2, md: 3 }, pt: 2, pb: 3, flex: 1, minWidth: 0 }}>
                <Box sx={{ mb: 1.5 }}>
                    <AppBreadcrumbs items={[{ label: 'Home', href: '/dashboard' }, { label: 'Search' }]} />
                </Box>

                <SearchBox key={`${q}|${activeModule ?? ''}`} initial={q} module={activeModule} />

                {!q ? (
                    <EmptyPrompt />
                ) : (
                    <>
                        <Box sx={{ display: 'flex', alignItems: 'baseline', flexWrap: 'wrap', gap: 1, mt: 2.5, mb: 1.25 }}>
                            <Typography component="h1" sx={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--crm-slate-900)' }}>
                                {loading ? 'Searching…' : `${countText(grandTotal, customized)} ${grandTotal === 1 ? 'result' : 'results'}`}
                            </Typography>
                            <Typography sx={{ fontSize: '0.9rem', color: 'var(--mui-palette-text-secondary)' }}>
                                for{' '}
                                <Box component="span" sx={{ fontWeight: 700, color: 'var(--crm-text-blue-700)' }}>
                                    &lsquo;{q}&rsquo;
                                </Box>
                            </Typography>
                        </Box>

                        <ModuleTabs q={q} active={activeModule} totals={totals} />

                        {search.isError ? (
                            <Message title="Search failed" body="Something went wrong while searching. Please try again." />
                        ) : loading ? (
                            <ResultsSkeleton />
                        ) : shown.length === 0 ? (
                            <Message
                                title={
                                    activeModule
                                        ? `No ${SEARCH_CATEGORY_META[activeModule].label.toLowerCase()} match ‘${q}’`
                                        : `No matches for ‘${q}’`
                                }
                                body="Check the spelling, or try a record number, phone number, email, GSTIN, PAN or bank account number."
                            />
                        ) : (
                            <Box sx={{ display: 'grid', gap: 3, minWidth: 0 }}>
                                {shown.map((category) => {
                                    const { label, color } = SEARCH_CATEGORY_META[category];
                                    const total = totals[category];
                                    return (
                                        <Box component="section" key={category} aria-label={label} sx={{ minWidth: 0 }}>
                                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                                                <ModuleIconTile category={category} size={30} />
                                                <Typography component="h2" sx={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--crm-slate-900)' }}>
                                                    {label}
                                                </Typography>
                                                <Box
                                                    component="span"
                                                    sx={{
                                                        fontSize: '0.72rem',
                                                        fontWeight: 700,
                                                        color: color.text,
                                                        backgroundColor: color.soft,
                                                        border: `1px solid ${color.border}`,
                                                        borderRadius: '999px',
                                                        px: 0.9,
                                                        lineHeight: 1.6,
                                                    }}
                                                >
                                                    {countText(total, customized)}
                                                </Box>
                                                {total > MAX_IDS_PER_MODULE && (
                                                    <Typography sx={{ fontSize: '0.75rem', color: 'var(--mui-palette-text-secondary)' }}>
                                                        Showing the {countText(MAX_IDS_PER_MODULE, customized)} most recently updated. Refine your search to narrow it down.
                                                    </Typography>
                                                )}
                                            </Box>
                                            <ModuleTable key={`${category}:${q}`} category={category} ids={ids[category]} claimDrawer={claimDrawer} />

                                        </Box>
                                    );
                                })}
                            </Box>
                        )}
                    </>
                )}
            </Box>
        </Box>
    );
}

/**
 * One module's matches in its own list view. The rows come from the search (any owner), keyed under the module's
 * query keys so creating, editing or deleting a record refreshes them like the list page.
 */
function ModuleTable({
    category,
    ids,
    claimDrawer,
}: {
    category: GlobalSearchCategory;
    ids: string[];
    claimDrawer: SearchScopeValue['claimDrawer'];
}) {
    const View = MODULE_VIEWS[category];
    const rows = useQuery({
        queryKey: [...queryKeys[category].all, 'search-rows', ids],
        queryFn: ({ signal }) => fetchSearchRecords(category, ids, signal),
    });

    if (rows.isError) {
        return <Message title="Could not load these results" body="Something went wrong while loading the matched records. Please try again." />;
    }
    if (!rows.data) return <TableSkeleton />;
    return (
        <SearchScopeProvider rows={rows.data} claimDrawer={claimDrawer}>
            <View />
        </SearchScopeProvider>
    );
}

function SearchBox({ initial, module }: { initial: string; module?: GlobalSearchCategory }) {
    const router = useRouter();
    const [draft, setDraft] = useState(initial);

    const submit = (e: React.FormEvent) => {
        e.preventDefault();
        const text = draft.trim();
        if (text) router.push(searchPageHref(text, module));
    };

    return (
        <Paper
            component="form"
            role="search"
            onSubmit={submit}
            elevation={0}
            sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1.25,
                maxWidth: 820,
                px: 2,
                py: 0.75,
                border: '1px solid var(--mui-palette-border-main)',
                borderRadius: '10px',
                backgroundColor: 'var(--mui-palette-background-paper)',
                transition: 'all 0.15s ease',
                '&:hover': { borderColor: 'var(--mui-palette-border-strong)' },
                '&:focus-within': {
                    borderColor: 'var(--mui-palette-primary-main)',
                    boxShadow: '0 0 0 3px rgb(var(--crm-accent-rgb) / 0.22)',
                },
            }}
        >
            <SearchIcon sx={{ color: 'var(--mui-palette-text-muted)' }} />
            <InputBase
                autoFocus={!initial}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Search by name, record number, email, phone, GSTIN, PAN or bank account…"
                inputProps={{ 'aria-label': 'Search all modules', maxLength: 100 }}
                sx={{
                    flex: 1,
                    fontSize: '0.92rem',
                    color: 'var(--crm-slate-900)',
                    '& input::placeholder': { color: 'var(--mui-palette-text-muted)', opacity: 1 },
                }}
            />
            {draft && (
                <IconButton
                    size="small"
                    aria-label="Clear search"
                    onClick={() => setDraft('')}
                    sx={{
                        color: 'var(--mui-palette-text-muted)',
                        '&:hover': { color: 'var(--mui-palette-error-main)', backgroundColor: 'var(--mui-palette-error-soft)' },
                    }}
                >
                    <CloseIcon sx={{ fontSize: 18 }} />
                </IconButton>
            )}
            <Button
                type="submit"
                disableElevation
                variant="contained"
                sx={{
                    textTransform: 'none',
                    fontWeight: 600,
                    borderRadius: '8px',
                    px: 2.5,
                    color: '#ffffff',
                    background: 'linear-gradient(135deg, var(--crm-fill-blue-700) 0%, var(--crm-fill-blue-600) 100%)',
                    '&:hover': { background: 'linear-gradient(135deg, var(--crm-fill-blue-800) 0%, var(--crm-fill-blue-700) 100%)' },
                }}
            >
                Search
            </Button>
        </Paper>
    );
}

function ModuleTabs({ q, active, totals }: { q: string; active?: GlobalSearchCategory; totals?: Record<GlobalSearchCategory, number> }) {
    const { customized } = useDisplayFormats();
    const tabs: { key: string; label: string; href: string; count?: number; selected: boolean; dot?: string }[] = [
        {
            key: 'all',
            label: 'All',
            href: searchPageHref(q),
            count: totals ? GLOBAL_SEARCH_CATEGORIES.reduce((s, c) => s + totals[c], 0) : undefined,
            selected: !active,
        },
        ...GLOBAL_SEARCH_CATEGORIES.map((c) => ({
            key: c,
            label: SEARCH_CATEGORY_META[c].label,
            href: searchPageHref(q, c),
            count: totals?.[c],
            selected: active === c,
            dot: SEARCH_CATEGORY_META[c].color.main,
        })),
    ];

    return (
        <Box role="tablist" aria-label="Modules" sx={{ display: 'flex', gap: 0.75, overflowX: 'auto', pb: 1, mb: 1.5, scrollbarWidth: 'thin' }}>
            {tabs.map((tab) => {
                const empty = tab.count === 0 && !tab.selected;
                return (
                    <Box
                        key={tab.key}
                        component={Link}
                        href={tab.href}
                        role="tab"
                        aria-selected={tab.selected}
                        sx={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 0.75,
                            flexShrink: 0,
                            px: 1.5,
                            py: 0.6,
                            borderRadius: '999px',
                            fontSize: '0.8rem',
                            fontWeight: tab.selected ? 700 : 600,
                            textDecoration: 'none',
                            border: '1px solid',
                            borderColor: tab.selected ? 'var(--mui-palette-border-strong)' : 'transparent',
                            backgroundColor: tab.selected ? 'var(--mui-palette-background-paper)' : 'transparent',
                            color: tab.selected ? 'var(--crm-text-blue-900)' : empty ? 'var(--mui-palette-text-muted)' : 'var(--mui-palette-text-secondary)',
                            transition: 'all 0.15s ease',
                            '&:hover': tab.selected ? {} : { backgroundColor: 'var(--mui-palette-primary-soft)', color: 'var(--crm-text-blue-700)' },
                        }}
                    >
                        {tab.dot && (
                            <Box
                                component="span"
                                aria-hidden
                                sx={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: tab.dot, opacity: empty ? 0.45 : 1, flexShrink: 0 }}
                            />
                        )}
                        {tab.label}
                        {tab.count !== undefined && (
                            <Box
                                component="span"
                                sx={{
                                    fontSize: '0.7rem',
                                    fontWeight: 700,
                                    borderRadius: '999px',
                                    px: 0.75,
                                    lineHeight: 1.6,
                                    color: tab.selected ? 'var(--crm-text-blue-700)' : 'inherit',
                                    backgroundColor: tab.selected ? 'var(--mui-palette-primary-soft)' : 'var(--mui-palette-background-hover)',
                                }}
                            >
                                {countText(tab.count, customized)}
                            </Box>
                        )}
                    </Box>
                );
            })}
        </Box>
    );
}

const cardSx = {
    border: '1px solid var(--mui-palette-border-main)',
    borderRadius: '10px',
    backgroundColor: 'var(--mui-palette-background-paper)',
    overflow: 'hidden',
} as const;

function TableSkeleton() {
    return (
        <Paper elevation={0} sx={cardSx}>
            <Box sx={{ px: 2, py: 1.25, backgroundColor: 'var(--mui-palette-background-subtle)', borderBottom: '1px solid var(--mui-palette-border-main)' }}>
                <Skeleton width="30%" height={22} />
            </Box>
            {[0, 1, 2, 3].map((r) => (
                <Box key={r} sx={{ display: 'flex', gap: 3, px: 2, py: 1.25, borderTop: r ? '1px solid var(--mui-palette-border-light)' : 'none' }}>
                    <Skeleton width="18%" height={20} />
                    <Skeleton width="22%" height={20} />
                    <Skeleton width="16%" height={20} />
                    <Skeleton width="20%" height={20} />
                </Box>
            ))}
        </Paper>
    );
}

function ResultsSkeleton() {
    return (
        <Box sx={{ display: 'grid', gap: 3 }}>
            {[0, 1].map((s) => (
                <Box key={s}>
                    <Skeleton width={160} height={26} sx={{ mb: 1 }} />
                    <TableSkeleton />
                </Box>
            ))}
        </Box>
    );
}

function Message({ title, body }: { title: string; body: string }) {
    return (
        <Paper elevation={0} sx={{ ...cardSx, textAlign: 'center', px: 3, py: 6 }}>
            <SearchOffIcon sx={{ fontSize: 40, color: 'var(--mui-palette-text-muted)' }} />
            <Typography sx={{ mt: 1, fontSize: '1rem', fontWeight: 700, color: 'var(--crm-slate-900)' }}>{title}</Typography>
            <Typography sx={{ mt: 0.5, fontSize: '0.85rem', color: 'var(--mui-palette-text-secondary)' }}>{body}</Typography>
        </Paper>
    );
}

function EmptyPrompt() {
    return (
        <Paper elevation={0} sx={{ ...cardSx, mt: 3, px: 3, py: 5, textAlign: 'center' }}>
            <SearchIcon sx={{ fontSize: 40, color: 'var(--mui-palette-text-muted)' }} />
            <Typography sx={{ mt: 1, fontSize: '1rem', fontWeight: 700, color: 'var(--crm-slate-900)' }}>Search across every module</Typography>
            <Typography sx={{ mt: 0.5, mb: 2, fontSize: '0.85rem', color: 'var(--mui-palette-text-secondary)' }}>
                Leads, opportunities, quotations, organizations, contacts, tickets, contracts, products and partner companies. You can search by:
            </Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 0.75 }}>
                {SEARCHABLE_FIELDS.map((field) => (
                    <Box
                        key={field}
                        component="span"
                        sx={{
                            fontSize: '0.75rem',
                            fontWeight: 600,
                            color: 'var(--crm-text-blue-700)',
                            backgroundColor: 'var(--mui-palette-primary-soft)',
                            border: '1px solid var(--mui-palette-primary-softBorder)',
                            borderRadius: '999px',
                            px: 1.25,
                            py: 0.3,
                        }}
                    >
                        {field}
                    </Box>
                ))}
            </Box>
        </Paper>
    );
}
