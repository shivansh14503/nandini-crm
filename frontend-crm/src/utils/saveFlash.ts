'use client';

import { useEffect, useRef } from 'react';

/**
 * Hand-off from a record form to its list after a save: the form navigates straight back to the list, and the
 * list shows the "saved" toast and opens the saved record's drawer. (A toast raised on the form itself is
 * unmounted by the navigation before it can be seen.)
 */
export interface SaveFlash {
    /** List route the form returns to (e.g. `ROUTES.CONTACTS`); only that list picks the flash up. */
    listPath: string;
    message: string;
    severity?: 'success' | 'error' | 'info';
    /** Record to open in the list's drawer. */
    recordId?: string;
}

/** Kept in memory: client-side navigation keeps the JS runtime, and a stale flash must not survive a reload. */
let pending: (SaveFlash & { at: number }) | null = null;
/** A flash nobody picked up within this window (e.g. the user navigated elsewhere) is dropped. */
const MAX_AGE_MS = 30_000;
/**
 * How long a list must stay mounted before its flash counts as delivered. Returning to a list mounts it more
 * than once (a throwaway first instance, Strict Mode's re-mount) and only the last one stays on screen, so the
 * flash is kept until an instance outlives this delay; otherwise the discarded one would swallow it.
 */
const SETTLE_MS = 500;

export function setSaveFlash(flash: SaveFlash): void {
    pending = { ...flash, at: Date.now() };
}

function peekSaveFlash(listPath: string): (SaveFlash & { at: number }) | null {
    if (!pending || pending.listPath !== listPath) return null;
    if (Date.now() - pending.at > MAX_AGE_MS) {
        pending = null;
        return null;
    }
    return pending;
}

/** On mount, picks up a flash left for `listPath` and hands it to `onFlash` (once it is on screen). */
export function useSaveFlash(listPath: string, onFlash: (flash: SaveFlash) => void): void {
    const onFlashRef = useRef(onFlash);
    useEffect(() => {
        onFlashRef.current = onFlash;
    });
    useEffect(() => {
        const flash = peekSaveFlash(listPath);
        if (!flash) return;
        onFlashRef.current(flash);
        // Consumed only if this instance stays mounted; an unmount first leaves it for the next instance.
        const timer = window.setTimeout(() => {
            if (pending === flash) pending = null;
        }, SETTLE_MS);
        return () => window.clearTimeout(timer);
    }, [listPath]);
}
