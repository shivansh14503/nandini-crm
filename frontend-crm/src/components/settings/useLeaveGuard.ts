import { useEffect } from 'react';
import { holdUnsavedWork } from '@/utils/unsavedWork';

/**
 * Asks before leaving the page (reload, close, or an in-app link to another page) while there are unsaved
 * changes. Used by the admin builders (Form Customization, List Scorecards). While active it also counts as unsaved
 * work, so a session that ends mid-edit (any API 401) asks the user to sign in again in place (SessionExpiredDialog).
 */
export function useLeaveGuard(active: boolean, message: string) {
    useEffect(() => {
        if (!active) return;
        const releaseUnsavedWork = holdUnsavedWork();
        const onBeforeUnload = (e: BeforeUnloadEvent) => {
            e.preventDefault();
            e.returnValue = message;
        };
        const onClick = (e: MouseEvent) => {
            if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
            const anchor = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
            if (!anchor || anchor.target === '_blank' || anchor.origin !== window.location.origin) return;
            if (anchor.pathname === window.location.pathname) return;
            if (!window.confirm(message)) {
                e.preventDefault();
                e.stopPropagation();
            }
        };
        window.addEventListener('beforeunload', onBeforeUnload);
        document.addEventListener('click', onClick, true);
        return () => {
            window.removeEventListener('beforeunload', onBeforeUnload);
            document.removeEventListener('click', onClick, true);
            releaseUnsavedWork();
        };
    }, [active, message]);
}
