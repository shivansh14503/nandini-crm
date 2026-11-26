'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';

const CLOSE_DELAY_MS = 150;

/**
 * Hover + click / tap dropdown behaviour shared by the navbar menus (pills, Create, notification bell, user menu):
 * mouse hover opens it and leaving closes it after a short delay; a click or tap toggles it; Escape and a click
 * outside close it.
 */
export function useDropdown() {
    const menuId = useId();
    const [open, setOpen] = useState(false);
    const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
    const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const clearCloseTimer = useCallback(() => {
        if (closeTimer.current) {
            clearTimeout(closeTimer.current);
            closeTimer.current = null;
        }
    }, []);

    // Clear any pending close timeout on unmount
    useEffect(() => clearCloseTimer, [clearCloseTimer]);

    const close = useCallback(() => {
        clearCloseTimer();
        setOpen(false);
    }, [clearCloseTimer]);

    const show = useCallback(() => {
        clearCloseTimer();
        setOpen(true);
    }, [clearCloseTimer]);

    // Close on Escape while open
    useEffect(() => {
        if (!open) return;
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') close();
        };
        document.addEventListener('keydown', onKeyDown);
        return () => document.removeEventListener('keydown', onKeyDown);
    }, [open, close]);

    // Hover is mouse-only: touch/pen taps also emit pointerenter, which would
    // open the menu and then have the click handler toggle it straight shut.
    const hoverProps = {
        onPointerEnter: (e: React.PointerEvent) => {
            if (e.pointerType !== 'mouse') return;
            clearCloseTimer();
            setOpen(true);
        },
        onPointerLeave: (e: React.PointerEvent) => {
            if (e.pointerType !== 'mouse') return;
            clearCloseTimer();
            closeTimer.current = setTimeout(() => setOpen(false), CLOSE_DELAY_MS);
        },
    };

    const triggerProps = {
        'aria-haspopup': 'true' as const,
        'aria-expanded': open,
        'aria-controls': open ? menuId : undefined,
        onClick: () => {
            clearCloseTimer();
            setOpen((prev) => !prev);
        },
    };

    // The popper is portaled outside the trigger, so a click on the trigger
    // reaches ClickAwayListener too; ignore it and let onClick toggle.
    const handleClickAway = (event: MouseEvent | TouchEvent) => {
        if (anchorEl && anchorEl.contains(event.target as Node)) return;
        close();
    };

    return { open, close, show, menuId, setAnchorEl, anchorEl, hoverProps, triggerProps, handleClickAway };
}
