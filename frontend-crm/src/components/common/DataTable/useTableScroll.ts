'use client';

import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';

/** Elements that keep their own mouse behaviour (a drag started on them never pans the table). */
const INTERACTIVE_SELECTOR =
    // The row's hidden full-cell link (DataTable) isn't a control: dragging on it still pans.
    'a:not([data-row-link]), button, input, textarea, select, label, [role="button"], [role="checkbox"], [contenteditable="true"], .MuiCheckbox-root';

/** Pixels the pointer must travel before a left-button press becomes a pan (below it, it stays a click). */
const DRAG_THRESHOLD = 5;
/** Pixels per animation frame while an arrow button is held. */
const HOLD_SPEED = 14;

/** Nearest vertically scrollable ancestor, else the document's scrolling element. */
function findScrollParent(el: HTMLElement): HTMLElement | null {
    for (let node = el.parentElement; node && node !== document.body; node = node.parentElement) {
        const { overflowY } = getComputedStyle(node);
        if ((overflowY === 'auto' || overflowY === 'scroll') && node.scrollHeight > node.clientHeight) return node;
    }
    return (document.scrollingElement as HTMLElement | null) ?? document.documentElement;
}

export interface TableScrollState {
    /** Ref for the scrolling container. */
    setContainer: (el: HTMLDivElement | null) => void;
    canScrollLeft: boolean;
    canScrollRight: boolean;
    /** True while the user is panning the table with the mouse. */
    isPanning: boolean;
    /** Pointer-down handler for the container (left-drag on empty areas, or middle-button hold, pans the table). */
    onPointerDown: (e: ReactPointerEvent<HTMLDivElement>) => void;
    /** Starts scrolling in a direction until `stopHold` is called (press-and-hold arrow buttons). */
    startHold: (direction: -1 | 1) => void;
    stopHold: () => void;
}

/**
 * Horizontal scrolling helpers for wide tables: tracks whether there is more to the left / right, scrolls
 * continuously while an arrow button is held, and lets the user grab-and-drag the table (left button on a
 * non-interactive area, or holding the middle / scroll-wheel button anywhere).
 */
export function useTableScroll(): TableScrollState {
    const [el, setEl] = useState<HTMLDivElement | null>(null);
    const [canScrollLeft, setCanScrollLeft] = useState(false);
    const [canScrollRight, setCanScrollRight] = useState(false);
    const [isPanning, setIsPanning] = useState(false);
    const holdFrame = useRef<number | null>(null);
    const cleanupPan = useRef<(() => void) | null>(null);

    const update = useCallback(() => {
        if (!el) return;
        const max = el.scrollWidth - el.clientWidth;
        setCanScrollLeft(el.scrollLeft > 1);
        setCanScrollRight(el.scrollLeft < max - 1);
    }, [el]);

    useEffect(() => {
        if (!el) return;
        el.addEventListener('scroll', update, { passive: true });
        const observer = new ResizeObserver(update);
        observer.observe(el);
        if (el.firstElementChild) observer.observe(el.firstElementChild);
        return () => {
            el.removeEventListener('scroll', update);
            observer.disconnect();
        };
    }, [el, update]);

    // Wheel hand-off: once the table is at its top / bottom, keep scrolling the page. Browsers "latch" a wheel
    // gesture to the element it started in, so without this the page only moves after the cursor leaves the table.
    useEffect(() => {
        if (!el) return;
        const onWheel = (e: WheelEvent) => {
            if (e.ctrlKey || e.shiftKey || Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
            const dy = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? el.clientHeight : 1);
            const atTop = el.scrollTop <= 0;
            const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 1;
            if ((dy < 0 && !atTop) || (dy > 0 && !atBottom)) return; // the table still scrolls itself

            const page = findScrollParent(el);
            if (!page) return;
            const pageCanMove =
                dy < 0 ? page.scrollTop > 0 : page.scrollTop + page.clientHeight < page.scrollHeight - 1;
            if (!pageCanMove) return;
            e.preventDefault();
            page.scrollBy({ top: dy, behavior: 'instant' as ScrollBehavior });
        };
        el.addEventListener('wheel', onWheel, { passive: false });
        return () => el.removeEventListener('wheel', onWheel);
    }, [el]);

    const stopHold = useCallback(() => {
        if (holdFrame.current !== null) cancelAnimationFrame(holdFrame.current);
        holdFrame.current = null;
    }, []);

    const startHold = useCallback(
        (direction: -1 | 1) => {
            if (!el) return;
            stopHold();
            const step = () => {
                el.scrollLeft += direction * HOLD_SPEED;
                const atEnd = direction < 0 ? el.scrollLeft <= 0 : el.scrollLeft >= el.scrollWidth - el.clientWidth;
                holdFrame.current = atEnd ? null : requestAnimationFrame(step);
            };
            step();
        },
        [el, stopHold]
    );

    const onPointerDown = useCallback(
        (e: ReactPointerEvent<HTMLDivElement>) => {
            if (!el || e.pointerType !== 'mouse') return; // touch / pen already scroll natively
            const isMiddle = e.button === 1;
            if (!isMiddle && e.button !== 0) return;
            if (!isMiddle && (e.target as HTMLElement).closest(INTERACTIVE_SELECTOR)) return;
            if (el.scrollWidth <= el.clientWidth && el.scrollHeight <= el.clientHeight) return;
            // Middle button: suppress the browser's own autoscroll so it pans like a drag instead.
            if (isMiddle) e.preventDefault();

            cleanupPan.current?.();
            const startX = e.clientX;
            const startY = e.clientY;
            const startLeft = el.scrollLeft;
            const startTop = el.scrollTop;
            let panning = isMiddle;
            if (panning) setIsPanning(true);

            const onMove = (ev: PointerEvent) => {
                const dx = ev.clientX - startX;
                const dy = ev.clientY - startY;
                if (!panning) {
                    if (Math.abs(dx) < DRAG_THRESHOLD && Math.abs(dy) < DRAG_THRESHOLD) return;
                    panning = true;
                    setIsPanning(true);
                    window.getSelection()?.removeAllRanges();
                }
                ev.preventDefault();
                el.scrollLeft = startLeft - dx;
                el.scrollTop = startTop - dy;
            };
            const onUp = () => {
                if (panning) {
                    // The click that ends a drag must not open the row under the pointer.
                    const swallow = (ev: MouseEvent) => {
                        ev.stopPropagation();
                        ev.preventDefault();
                    };
                    window.addEventListener('click', swallow, { capture: true, once: true });
                    window.addEventListener('auxclick', swallow, { capture: true, once: true });
                    setTimeout(() => {
                        window.removeEventListener('click', swallow, { capture: true });
                        window.removeEventListener('auxclick', swallow, { capture: true });
                    }, 0);
                }
                cleanup();
            };
            const cleanup = () => {
                window.removeEventListener('pointermove', onMove);
                window.removeEventListener('pointerup', onUp);
                window.removeEventListener('pointercancel', cleanup);
                cleanupPan.current = null;
                setIsPanning(false);
            };
            window.addEventListener('pointermove', onMove);
            window.addEventListener('pointerup', onUp);
            window.addEventListener('pointercancel', cleanup);
            cleanupPan.current = cleanup;
        },
        [el]
    );

    useEffect(
        () => () => {
            stopHold();
            cleanupPan.current?.();
        },
        [stopHold]
    );

    return { setContainer: setEl, canScrollLeft, canScrollRight, isPanning, onPointerDown, startHold, stopHold };
}
