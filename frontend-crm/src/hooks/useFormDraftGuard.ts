'use client';

import { useEffect, useState, useCallback, useRef } from 'react';

const SAVE_DEBOUNCE_MS = 300;

export interface UseFormDraftGuardOptions<T> {
    /** Unique localStorage key for this form instance (e.g. per record id). */
    draftKey: string;
    isDirty: boolean;
    currentValues: T;
    /** Pristine values; a draft identical to these is never stored. */
    defaultValues: T;
    onRestoreDraft: (savedValues: T) => void;
    enabled?: boolean;
    /**
     * Called to perform an in-app navigation that was intercepted while dirty (e.g. `router.push`).
     * When provided, clicks on same-origin links are intercepted and routed through the discard modal.
     */
    navigate?: (href: string) => void;
    /** Called when the user confirms "Discard & Leave", before navigating, so the form can reset itself. */
    onDiscard?: () => void;
}

function readDraft<T>(key: string): T | null {
    if (typeof window === 'undefined') return null;
    try {
        const raw = window.localStorage.getItem(key);
        if (!raw) return null;
        const parsed: unknown = JSON.parse(raw);
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as T) : null;
    } catch {
        return null;
    }
}

/**
 * Persists in-progress form values to localStorage (debounced, in the background), restores them
 * on the next visit, warns on tab close/reload while dirty, and exposes a confirm-before-leave helper.
 */
export function useFormDraftGuard<T>({
    draftKey,
    isDirty,
    currentValues,
    defaultValues,
    onRestoreDraft,
    enabled = true,
    navigate,
    onDiscard,
}: UseFormDraftGuardOptions<T>) {
    const [discardModalOpen, setDiscardModalOpen] = useState(false);
    const pendingNavCallback = useRef<(() => void) | null>(null);
    const saveTimer = useRef<number | null>(null);
    const restoredFor = useRef<string | null>(null);

    // Keep the latest callback without making the restore effect re-run on every render.
    const restoreRef = useRef(onRestoreDraft);
    useEffect(() => {
        restoreRef.current = onRestoreDraft;
    });

    const cancelPendingSave = useCallback(() => {
        if (saveTimer.current !== null) {
            window.clearTimeout(saveTimer.current);
            saveTimer.current = null;
        }
    }, []);

    const clearDraft = useCallback(() => {
        if (typeof window === 'undefined') return;
        cancelPendingSave();
        try {
            window.localStorage.removeItem(draftKey);
        } catch {
            // Storage unavailable: nothing to clear.
        }
    }, [draftKey, cancelPendingSave]);

    // 1. Restore a saved draft once per key when the guard becomes enabled.
    useEffect(() => {
        if (!enabled || restoredFor.current === draftKey) return;
        restoredFor.current = draftKey;
        const saved = readDraft<T>(draftKey);
        if (saved) restoreRef.current(saved);
    }, [draftKey, enabled]);

    // 2. Debounced background auto-save while the form is dirty.
    useEffect(() => {
        if (!enabled || !isDirty) return;
        saveTimer.current = window.setTimeout(() => {
            saveTimer.current = null;
            try {
                if (JSON.stringify(currentValues) === JSON.stringify(defaultValues)) {
                    window.localStorage.removeItem(draftKey);
                } else {
                    window.localStorage.setItem(draftKey, JSON.stringify(currentValues));
                }
            } catch {
                // Quota exceeded / private browsing: drafts are best-effort.
            }
        }, SAVE_DEBOUNCE_MS);
        return cancelPendingSave;
    }, [draftKey, isDirty, currentValues, defaultValues, enabled, cancelPendingSave]);

    // 3. Browser tab close / reload protection.
    useEffect(() => {
        if (!enabled || !isDirty) return;
        const handleBeforeUnload = (e: BeforeUnloadEvent) => {
            e.preventDefault();
            e.returnValue = '';
        };
        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }, [enabled, isDirty]);

    // 4. Confirm before an in-app exit (e.g. Cancel button) when there are unsaved changes.
    const confirmDiscard = useCallback(
        (onProceed: () => void) => {
            if (!isDirty) {
                clearDraft();
                onProceed();
                return;
            }
            pendingNavCallback.current = onProceed;
            setDiscardModalOpen(true);
        },
        [isDirty, clearDraft]
    );

    // 5. Intercept clicks on in-app links (navbar, breadcrumbs, logo) while dirty.
    const navigateRef = useRef(navigate);
    const onDiscardRef = useRef(onDiscard);
    useEffect(() => {
        navigateRef.current = navigate;
        onDiscardRef.current = onDiscard;
    });
    const interceptLinks = Boolean(navigate);
    useEffect(() => {
        if (!enabled || !isDirty || !interceptLinks) return;
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
            pendingNavCallback.current = () => navigateRef.current?.(target);
            setDiscardModalOpen(true);
        };
        // Capture phase: runs before Next.js <Link> handles the click.
        document.addEventListener('click', handleClick, true);
        return () => document.removeEventListener('click', handleClick, true);
    }, [enabled, isDirty, interceptLinks]);

    const handleKeepEditing = useCallback(() => {
        setDiscardModalOpen(false);
        pendingNavCallback.current = null;
    }, []);

    const handleDiscardAndLeave = useCallback(() => {
        clearDraft();
        onDiscardRef.current?.();
        setDiscardModalOpen(false);
        const proceed = pendingNavCallback.current;
        pendingNavCallback.current = null;
        proceed?.();
    }, [clearDraft]);

    return {
        clearDraft,
        confirmDiscard,
        discardModalOpen,
        handleKeepEditing,
        handleDiscardAndLeave,
    };
}
