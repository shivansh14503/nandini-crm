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

export function setSaveFlash(flash: SaveFlash): void {
    pending = { ...flash, at: Date.now() };
}

function takeSaveFlash(listPath: string): SaveFlash | null {
    if (!pending || pending.listPath !== listPath) return null;
    const flash = pending;
    pending = null;
    return Date.now() - flash.at <= MAX_AGE_MS ? flash : null;
}

/** On mount, picks up a flash left for `listPath` and hands it to `onFlash` (once). */
export function useSaveFlash(listPath: string, onFlash: (flash: SaveFlash) => void): void {
    const onFlashRef = useRef(onFlash);
    useEffect(() => {
        onFlashRef.current = onFlash;
    });
    useEffect(() => {
        const flash = takeSaveFlash(listPath);
        if (flash) onFlashRef.current(flash);
    }, [listPath]);
}
