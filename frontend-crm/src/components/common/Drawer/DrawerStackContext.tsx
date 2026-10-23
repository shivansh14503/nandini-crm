'use client';

import { createContext, useContext } from 'react';

export interface DrawerStackContextValue {
    /** Shared collapsed state of the entire right-hand drawer stack. */
    isCollapsed: boolean;
    /** Toggles collapse/expand for the whole stack. */
    onToggleCollapse: () => void;
    /** Forces the stack back to its expanded state (e.g. when a new record opens). */
    onCollapseReset: () => void;
    /** Only the topmost drawer in the stack renders the single shared bookmark tab. */
    showBookmark: boolean;
}

export const DrawerStackContext = createContext<DrawerStackContextValue | null>(null);

export function useDrawerStack(): DrawerStackContextValue | null {
    return useContext(DrawerStackContext);
}
