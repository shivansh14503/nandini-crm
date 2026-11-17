'use client';

import { useEffect, useState } from 'react';

/**
 * Key for a page's main view that changes every time the user navigates away, so coming back (Back button,
 * navbar link, …) shows a fresh default view instead of the old one.
 *
 * With `cacheComponents` (next.config) Next keeps visited pages alive but hidden (React `<Activity>`) and shows
 * them again as they were — e.g. the list page with its detail drawer and related-records split still open.
 * Hiding a page runs its effect cleanups; this one bumps the key then, so the view remounts while hidden and
 * reappears in its initial state. Filters saved in sessionStorage are restored as usual.
 */
export function useFreshOnReturn(): number {
    const [key, setKey] = useState(0);
    useEffect(() => () => setKey((k) => k + 1), []);
    return key;
}
