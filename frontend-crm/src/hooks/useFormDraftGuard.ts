'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';

/** Prefix of the localStorage keys earlier versions stored drafts under. Purged on first use; never written. */
const LEGACY_DRAFT_PREFIX = 'crm_draft_';
/** Marks the duplicate history entry pushed while dirty, so Browser Back can be intercepted. */
const HISTORY_GUARD_KEY = '__crmFormGuard';

export interface UseFormDraftGuardOptions<T = unknown> {
    isDirty: boolean;
    enabled?: boolean;
    /**
     * Performs an in-app navigation that was intercepted while dirty. Defaults to the Next.js router
     * (`router.replace` when the guard's own history entry is on top, so it doesn't linger, else `router.push`).
     */
    navigate?: (href: string) => void;
    /** Called when the user confirms "Discard & Leave", before navigating, so the form can reset itself. */
    onDiscard?: () => void;
    /** @deprecated Drafts are no longer stored; ignored. */
    draftKey?: string;
    /** @deprecated Drafts are no longer stored; ignored. */
    currentValues?: T;
    /** @deprecated Drafts are no longer stored; ignored. */
    defaultValues?: T;
    /** @deprecated Drafts are no longer restored; ignored. */
    onRestoreDraft?: (savedValues: T) => void;
}

// ── Programmatic navigation guard (e.g. GlobalSearch's Enter key) ──
type ActiveGuard = (proceed: () => void) => void;
let activeGuard: ActiveGuard | null = null;

/**
 * Runs `proceed` (a programmatic navigation such as `router.push`) unless a dirty form is mounted,
 * in which case that form's "Unsaved Changes" modal opens and `proceed` runs only on "Discard & Leave".
 */
export function guardNavigation(proceed: () => void): void {
    if (activeGuard) activeGuard(proceed);
    else proceed();
}

let legacyDraftsPurged = false;
function purgeLegacyDrafts() {
    if (legacyDraftsPurged || typeof window === 'undefined') return;
    legacyDraftsPurged = true;
    try {
        const stale: string[] = [];
        for (let i = 0; i < window.localStorage.length; i++) {
            const key = window.localStorage.key(i);
            if (key?.startsWith(LEGACY_DRAFT_PREFIX)) stale.push(key);
        }
        stale.forEach((key) => window.localStorage.removeItem(key));
    } catch {
        // Storage unavailable: nothing to purge.
    }
}

const isGuardEntry = () =>
    typeof window !== 'undefined' && Boolean((window.history.state as Record<string, unknown> | null)?.[HISTORY_GUARD_KEY]);

/**
 * Guards a form with unsaved changes: while `enabled && isDirty` it intercepts in-app link clicks
 * (navbar, breadcrumbs, logo, search results), programmatic navigations routed through `guardNavigation`,
 * Browser Back, and tab close / reload, and exposes a confirm-before-leave helper for Cancel buttons.
 * Nothing is ever persisted: leaving after "Discard & Leave" means the next visit starts blank.
 */
export function useFormDraftGuard<T = unknown>({ isDirty, enabled = true, navigate, onDiscard }: UseFormDraftGuardOptions<T>) {
    const router = useRouter();
    const [discardModalOpen, setDiscardModalOpen] = useState(false);
    const pendingNavCallback = useRef<(() => void) | null>(null);
    const active = enabled && isDirty;

    const navigateRef = useRef(navigate);
    const onDiscardRef = useRef(onDiscard);
    const routerRef = useRef(router);
    useEffect(() => {
        navigateRef.current = navigate;
        onDiscardRef.current = onDiscard;
        routerRef.current = router;
    });

    // 0. Wipe drafts left in localStorage by earlier versions so they can never prefill a form.
    useEffect(purgeLegacyDrafts, []);

    /** Kept for callers of the old API; there is no stored draft to clear. */
    const clearDraft = useCallback(() => {}, []);

    const openModal = useCallback((proceed: () => void) => {
        pendingNavCallback.current = proceed;
        setDiscardModalOpen(true);
    }, []);

    // 1. Browser tab close / reload protection.
    useEffect(() => {
        if (!active) return;
        const handleBeforeUnload = (e: BeforeUnloadEvent) => {
            e.preventDefault();
            e.returnValue = '';
        };
        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }, [active]);

    // 2. Intercept clicks on in-app links (navbar, quick create, breadcrumbs, logo, search results).
    useEffect(() => {
        if (!active) return;
        const handleClick = (e: MouseEvent) => {
            if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
            const anchor = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
            if (!anchor || anchor.target === '_blank' || anchor.hasAttribute('download')) return;
            const url = new URL(anchor.href, window.location.href);
            if (url.origin !== window.location.origin) return;
            // In-page anchors don't leave the form. A link to the same page (e.g. "New Organization" while on it) does reset it.
            if (url.hash && url.pathname === window.location.pathname && url.search === window.location.search) return;
            e.preventDefault();
            e.stopPropagation();
            const target = url.pathname + url.search + url.hash;
            openModal(() => {
                if (navigateRef.current) navigateRef.current(target);
                // Replace the guard's duplicate history entry so Back from the target returns to the form once.
                else if (isGuardEntry()) routerRef.current.replace(target);
                else routerRef.current.push(target);
            });
        };
        // Capture phase: runs before Next.js <Link> and component onClick handlers see the click.
        document.addEventListener('click', handleClick, true);
        return () => document.removeEventListener('click', handleClick, true);
    }, [active, openModal]);

    // 3. Programmatic navigations routed through `guardNavigation` (e.g. GlobalSearch Enter key).
    useEffect(() => {
        if (!active) return;
        const guard: ActiveGuard = (proceed) => openModal(proceed);
        activeGuard = guard;
        return () => {
            if (activeGuard === guard) activeGuard = null;
        };
    }, [active, openModal]);

    // 4. Browser Back: a duplicate entry of this page sits on top while dirty, so Back lands on the same URL.
    //    We re-arm it and ask; "Discard & Leave" then steps back past both entries.
    useEffect(() => {
        if (!active) return;
        const pushGuardEntry = () =>
            window.history.pushState({ ...(window.history.state ?? {}), [HISTORY_GUARD_KEY]: true }, '', window.location.href);
        if (!isGuardEntry()) pushGuardEntry();
        let leaving = false;
        const handlePopState = () => {
            // Our own "Discard & Leave" step back, or Forward onto our own entry (still on the form).
            if (leaving || isGuardEntry()) return;
            pushGuardEntry();
            openModal(() => {
                leaving = true;
                window.history.go(-2);
            });
        };
        window.addEventListener('popstate', handlePopState);
        return () => window.removeEventListener('popstate', handlePopState);
    }, [active, openModal]);

    // 5. Confirm before an in-app exit (e.g. Cancel button) when there are unsaved changes.
    const confirmDiscard = useCallback(
        (onProceed: () => void) => {
            if (!active) {
                onProceed();
                return;
            }
            openModal(onProceed);
        },
        [active, openModal]
    );

    const handleKeepEditing = useCallback(() => {
        setDiscardModalOpen(false);
        pendingNavCallback.current = null;
    }, []);

    const handleDiscardAndLeave = useCallback(() => {
        onDiscardRef.current?.();
        setDiscardModalOpen(false);
        const proceed = pendingNavCallback.current;
        pendingNavCallback.current = null;
        proceed?.();
    }, []);

    return {
        clearDraft,
        confirmDiscard,
        discardModalOpen,
        handleKeepEditing,
        handleDiscardAndLeave,
    };
}
