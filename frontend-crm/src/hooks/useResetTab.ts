import { useLayoutEffect, useState } from 'react';
import { usePathname } from 'next/navigation';

/**
 * A selected tab (form tab, list filter pill, drawer tab…) that goes back to `initial` whenever its page is shown.
 *
 * With `cacheComponents`, Next.js keeps visited pages mounted but hidden (React `<Activity>`), so plain
 * `useState` would reopen a page on whichever tab was last used (e.g. a form's Address tab). Layout effects
 * re-run each time a hidden page is shown again, and on a URL change (another record on the same page), so
 * the tab resets before the page paints.
 */
export function useResetTab<T>(initial: T) {
    const pathname = usePathname();
    const [tab, setTab] = useState<T>(initial);
    // The value the tab started on; a later change of `initial` alone doesn't move the user.
    const [first] = useState<T>(initial);
    useLayoutEffect(() => {
        // Only an effect sees the page being shown again; render can't tell.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setTab(first);
    }, [first, pathname]);
    return [tab, setTab] as const;
}
