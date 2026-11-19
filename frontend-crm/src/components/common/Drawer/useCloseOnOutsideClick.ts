'use client';

import { useEffect } from 'react';

/**
 * Clicks that never close the drawer: inside a drawer, the navbar (search, create, theme, notifications sit beside a
 * docked drawer), a table row (it opens that row in the drawer instead), or a portalled layer the drawer opened
 * (menus, dialogs, popovers, tooltips, toasts).
 */
const KEEP_OPEN_SELECTOR = [
    '.MuiDrawer-paper',
    '.MuiAppBar-root',
    'tbody tr',
    '.MuiPopover-root',
    '.MuiMenu-root',
    '.MuiDialog-root',
    '.MuiPopper-root',
    '.MuiSnackbar-root',
].join(', ');

function keepsOpen(target: EventTarget | null): boolean {
    if (!(target instanceof Element)) return true;
    // Removed while handling the click (e.g. a menu item that closed its menu): its place in the page is unknown.
    if (!target.isConnected) return true;
    return Boolean(target.closest(KEEP_OPEN_SELECTOR));
}

/**
 * Closes a non-modal (persistent) side drawer when the user clicks elsewhere on the page. Both the press and the
 * click must land outside, so selecting text in the drawer and releasing outside it doesn't close it. Listens in
 * the capture phase so it still sees clicks whose handlers stop propagation; the click that ends a table's
 * drag-to-pan is swallowed before it gets here (see useTableScroll).
 */
export function useCloseOnOutsideClick(enabled: boolean, onClose: (() => void) | undefined): void {
    useEffect(() => {
        if (!enabled || !onClose) return;
        let pressedOutside = false;
        const onPointerDown = (e: PointerEvent) => {
            pressedOutside = e.button === 0 && !keepsOpen(e.target);
        };
        const onClick = (e: MouseEvent) => {
            const outside = pressedOutside && e.button === 0 && !keepsOpen(e.target);
            pressedOutside = false;
            if (outside) onClose();
        };
        document.addEventListener('pointerdown', onPointerDown, true);
        document.addEventListener('click', onClick, true);
        return () => {
            document.removeEventListener('pointerdown', onPointerDown, true);
            document.removeEventListener('click', onClick, true);
        };
    }, [enabled, onClose]);
}
