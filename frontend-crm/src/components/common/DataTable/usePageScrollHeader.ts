'use client';

import { createContext, useCallback, useEffect, useLayoutEffect, type RefObject } from 'react';
import { keyframes, type SxProps, type Theme } from '@mui/material/styles';
import { FLOAT_INSET, NAVBAR_HEIGHT } from '@/theme/glass';

/**
 * True when the table is part of a page that scrolls as a whole (list pages): the table then has no vertical
 * scrollbar of its own and grows with its rows. Provided by the master view layout.
 */
export const TablePageScrollContext = createContext(false);

/**
 * Where the header row docks while the page scrolls: flush against the floating (sticky) navbar's bottom edge,
 * tucked 1px under it (the navbar is on top) so no seam shows at fractional zoom levels. Measured, since the bar's
 * borders add to its toolbar height; the constants are the fallback when the navbar isn't on the page.
 */
const headerDockTop = (): number => {
    const navbar = document.querySelector<HTMLElement>('[data-crm-navbar]');
    return navbar ? Math.round(navbar.getBoundingClientRect().bottom) - 1 : FLOAT_INSET + NAVBAR_HEIGHT;
};

/** Scroll-driven animations (Chromium, Safari 26+): the header dock then runs in CSS, not on scroll events. */
const SCROLL_TIMELINES = typeof CSS !== 'undefined' && CSS.supports('animation-timeline: scroll()');

const headDock = keyframes`
    from { transform: translateY(0); }
    to { transform: translateY(var(--crm-head-travel, 0px)); }
`;

/**
 * Header cells of a page-scrolled table: slide down with the page scroll and stop under the navbar. Linked to the
 * page's scroll position by the browser itself, so the header moves in the same frame as the page (no lag/jitter).
 * The animation runs over page scroll [start, start + travel]; before it the header sits in place, after it it
 * stays at the table's last row.
 */
export const pageScrollHeadSx: SxProps<Theme> = {
    '@supports (animation-timeline: scroll())': {
        '& > tr > th': {
            animationName: `${headDock}`,
            animationDuration: 'auto',
            animationTimingFunction: 'linear',
            animationFillMode: 'both',
            animationTimeline: 'scroll(root block)',
            animationRange: 'var(--crm-head-start, 0px) calc(var(--crm-head-start, 0px) + var(--crm-head-travel, 0px))',
        },
    },
};

const setVar = (el: HTMLElement, name: string, value: string) => {
    if (el.style.getPropertyValue(name) !== value) el.style.setProperty(name, value);
};

interface PageScrollHeaderRefs {
    /** Positioned box around the scroll container; holds the side-scroll arrows. */
    wrapper: RefObject<HTMLElement | null>;
    /** The table's (horizontal-only) scroll container. */
    container: RefObject<HTMLElement | null>;
    head: RefObject<HTMLElement | null>;
}

/**
 * Keeps a page-scrolled table usable: the header row stays docked under the navbar while its rows scroll past,
 * and the side-scroll arrows stay centred in the part of the table that is on screen.
 *
 * CSS `position: sticky` can't do the header here: the container scrolls sideways (wide tables), which makes it
 * the header's sticky boundary, and it never scrolls vertically. So the header cells are shifted down instead,
 * by a scroll-linked CSS animation (`pageScrollHeadSx`) that moves in the same frame as the page.
 * This hook only feeds it where the docking starts and how far it can go (both change with layout, not scroll).
 * Browsers without scroll timelines get the shift from a scroll listener instead.
 */
export function usePageScrollHeader(enabled: boolean, { wrapper, container, head }: PageScrollHeaderRefs) {
    const update = useCallback(() => {
        const box = container.current;
        const thead = head.current;
        if (!enabled || !box || !thead) return;
        const rect = box.getBoundingClientRect();
        const dockTop = headerDockTop();
        const headHeight = thead.offsetHeight;
        // Never past the last row: the header leaves with the table's bottom edge.
        const travel = Math.max(0, box.clientHeight - headHeight);
        if (SCROLL_TIMELINES) {
            const scroller = document.scrollingElement ?? document.documentElement;
            setVar(thead, '--crm-head-start', `${Math.round(rect.top + scroller.scrollTop - dockTop)}px`);
            setVar(thead, '--crm-head-travel', `${Math.round(travel)}px`);
        } else {
            const offset = Math.round(Math.min(Math.max(0, dockTop - rect.top), travel));
            const transform = offset > 0 ? `translateY(${offset}px)` : '';
            thead.querySelectorAll<HTMLElement>(':scope > tr > th').forEach((cell) => {
                if (cell.style.transform !== transform) cell.style.transform = transform;
            });
        }

        const outer = wrapper.current;
        if (outer) {
            const top = Math.max(rect.top, dockTop);
            const bottom = Math.min(rect.bottom, window.innerHeight);
            const arrowTop = bottom > top ? `${Math.round((top + bottom) / 2 - outer.getBoundingClientRect().top)}px` : '50%';
            outer.style.setProperty('--table-arrow-top', arrowTop);
        }
    }, [enabled, wrapper, container, head]);

    // Re-run after every render: new columns / rows bring new header cells or change the table's height.
    useLayoutEffect(update);

    useEffect(() => {
        if (!enabled) return;
        let frame = 0;
        const schedule = () => {
            if (!frame) frame = requestAnimationFrame(() => {
                frame = 0;
                update();
            });
        };
        // Capture: catches the page's scroll whichever element ends up scrolling it.
        window.addEventListener('scroll', schedule, { passive: true, capture: true });
        window.addEventListener('resize', schedule);
        const observer = new ResizeObserver(schedule);
        if (container.current) observer.observe(container.current);
        // Content above the table (summary cards, filters) loading in moves where the docking starts.
        observer.observe(document.body);
        return () => {
            cancelAnimationFrame(frame);
            window.removeEventListener('scroll', schedule, { capture: true });
            window.removeEventListener('resize', schedule);
            observer.disconnect();
        };
    }, [enabled, update, container]);
}
