'use client';

import React, { createContext, useContext, useMemo, useRef } from 'react';

/**
 * Lets a module's list view (LeadsMasterView, ContactsMasterView, …) render inside the global search results page:
 * the view shows the matched records (`useSearchScopedRows`, fed by POST /api/search/records, which is not limited
 * by row-level access) instead of its own list, and `CommonMasterView` drops its page chrome (breadcrumbs, summary
 * cards, filter pills, footer). Columns, column manager, record drawer, toolbar and pagination stay exactly as on
 * the module's own page.
 */
export interface SearchScopeValue {
    /** The matched records, in the module's list row shape. */
    rows: readonly { id: string }[];
    /**
     * Called when this view opens its record drawer: closes the drawer another module's table had open, so the
     * results page shows one drawer at a time.
     */
    claimDrawer: (owner: string, close: () => void) => void;
}

const SearchScopeContext = createContext<SearchScopeValue | null>(null);

/** The search scope when the list view is embedded in the search results page; null on the module's own page. */
export function useSearchScope(): SearchScopeValue | null {
    return useContext(SearchScopeContext);
}

/**
 * The matched records when embedded in the results page; the view's own list otherwise (same array). The search
 * rows are the module's list rows, so `T` is the caller's row type.
 */
export function useSearchScopedRows<T extends { id: string }>(rows: T[]): T[] {
    const scope = useSearchScope();
    return scope ? (scope.rows as T[]) : rows;
}

/** One drawer at a time across every table on the page: the shared `claimDrawer` for the scope providers. */
export function useDrawerClaim(): SearchScopeValue['claimDrawer'] {
    const current = useRef<{ owner: string; close: () => void } | null>(null);
    return useMemo(
        () => (owner: string, close: () => void) => {
            const previous = current.current;
            if (previous && previous.owner !== owner) previous.close();
            current.current = { owner, close };
        },
        []
    );
}

export function SearchScopeProvider({
    rows,
    claimDrawer,
    children,
}: {
    rows: readonly { id: string }[];
    claimDrawer: SearchScopeValue['claimDrawer'];
    children: React.ReactNode;
}) {
    const value = useMemo<SearchScopeValue>(() => ({ rows, claimDrawer }), [rows, claimDrawer]);
    return <SearchScopeContext.Provider value={value}>{children}</SearchScopeContext.Provider>;
}
