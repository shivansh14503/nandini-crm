'use client';

import React, { useCallback } from 'react';
import { ThemeProvider, type Theme } from '@mui/material/styles';
import { DrawerStackContext, type DrawerStackContextValue } from './Drawer/DrawerStackContext';

/** Above the detail drawers (1310–1400, CommonMasterView) and their bookmark tab (1410). */
export const RAISED_MODAL_Z_INDEX = 1450;

/** A drawer opened from inside a detail drawer: above the stack (1310–1400) and its bookmark, below raised dialogs. */
export const RAISED_DRAWER_Z_INDEX = 1420;

/**
 * Raises MUI's overlay layers for everything rendered inside: dialogs, menus, popovers, autocomplete lists,
 * snackbars and drawers opened from a detail drawer would otherwise sit behind it (`theme.zIndex.modal` is 1300,
 * `drawer` 1200). Overrides both the theme value and its CSS variable reference, so components reading either follow.
 */
export function RaisedLayer({ children, zIndex = RAISED_MODAL_Z_INDEX }: { children: React.ReactNode; zIndex?: number }) {
    const raise = useCallback(
        (outer: Theme): Theme => {
            const layers = { drawer: zIndex, modal: zIndex, snackbar: zIndex + 10 };
            const vars = (outer as Theme & { vars?: { zIndex?: Record<string, unknown> } }).vars;
            return {
                ...outer,
                zIndex: { ...outer.zIndex, ...layers },
                ...(vars ? { vars: { ...vars, zIndex: { ...vars.zIndex, ...layers } } } : {}),
            } as Theme;
        },
        [zIndex]
    );
    return <ThemeProvider theme={raise}>{children}</ThemeProvider>;
}

/** Drawers opened from a detail drawer stack on top of it without a second bookmark tab. */
const NESTED_STACK: DrawerStackContextValue = {
    isCollapsed: false,
    onToggleCollapse: () => undefined,
    onCollapseReset: () => undefined,
    showBookmark: false,
};

/** A detail drawer opened from inside another one (an activity from a record's Activities tab, a record from an activity). */
export function NestedDrawerLayer({ children }: { children: React.ReactNode }) {
    return (
        <RaisedLayer zIndex={RAISED_DRAWER_Z_INDEX}>
            <DrawerStackContext.Provider value={NESTED_STACK}>{children}</DrawerStackContext.Provider>
        </RaisedLayer>
    );
}
