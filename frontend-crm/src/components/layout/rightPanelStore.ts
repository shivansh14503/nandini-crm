'use client';

import { useEffect, useId, useSyncExternalStore } from 'react';

/**
 * Tracks floating right-side panels (detail drawers docked beside a list on wide screens) so the floating navbar
 * can end short of them and switch to its compact, icon-only controls.
 */
const panels = new Map<string, number>();
const listeners = new Set<() => void>();
let snapshot = 0;

function emit() {
    snapshot = panels.size ? Math.max(...panels.values()) : 0;
    listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

/** Width (px) of the widest docked right panel, or 0 when none is open. */
export function useRightPanelWidth(): number {
    return useSyncExternalStore(subscribe, () => snapshot, () => 0);
}

/** Registers a docked right panel of `width` px while `active` is true. */
export function useRegisterRightPanel(active: boolean, width: number) {
    const id = useId();
    useEffect(() => {
        if (!active) return;
        panels.set(id, width);
        emit();
        return () => {
            panels.delete(id);
            emit();
        };
    }, [active, width, id]);
}
