'use client';

import { useSearchParams } from 'next/navigation';

/**
 * The list a user started browsing from travels with them as `?from=/leads` while they hop from record to record
 * (drawer eye button → detail page → related module → that record's eye button → …). "Back to List" and the
 * module table's close button return there.
 */
export const LIST_ORIGIN_PARAM = 'from';

/** Only same-site paths are accepted, so the param can't send users to another site. */
export function sanitizeListOrigin(value: string | null | undefined): string | null {
    if (!value || !value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return null;
    return value;
}

/** The global search results page (`/search?q=…`). */
const SEARCH_PATH = '/search';

/** True when the user started from the global search results page rather than a module list. */
export function isSearchOrigin(origin: string | null | undefined): boolean {
    return Boolean(origin) && (origin === SEARCH_PATH || origin!.startsWith(`${SEARCH_PATH}?`));
}

/**
 * The list to come back to, read at click time: the origin already carried in the URL, else the current page's
 * module list (`/leads/123` → `/leads`, `/leads` → `/leads`). From the search results page it is that page with its
 * query (`/search?q=9811`), so returning there shows the same results.
 */
export function getListOrigin(): string {
    if (typeof window === 'undefined') return '/';
    const carried = sanitizeListOrigin(new URLSearchParams(window.location.search).get(LIST_ORIGIN_PARAM));
    if (carried) return carried;
    if (window.location.pathname === SEARCH_PATH) return `${SEARCH_PATH}${window.location.search}`;
    const firstSegment = window.location.pathname.split('/').filter(Boolean)[0];
    return firstSegment ? `/${firstSegment}` : '/';
}

/** A record's detail href that remembers which list the user started from. */
export function withListOrigin(href: string): string {
    const separator = href.includes('?') ? '&' : '?';
    return `${href}${separator}${LIST_ORIGIN_PARAM}=${encodeURIComponent(getListOrigin())}`;
}

/** The list this detail page was reached from, else `fallback` (the record's own module list). */
export function useListOrigin(fallback: string): string {
    const params = useSearchParams();
    return sanitizeListOrigin(params.get(LIST_ORIGIN_PARAM)) ?? fallback;
}
