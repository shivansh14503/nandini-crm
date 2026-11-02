'use client';

import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';

/** Elements inside a row that keep their own pointer behaviour (typing, selecting, clicking) instead of starting a drag. */
const INTERACTIVE_SELECTOR = [
    'input',
    'textarea',
    'select',
    'button',
    'a',
    '[contenteditable="true"]',
    '[role="button"]',
    '[role="combobox"]',
    '[role="switch"]',
    '.MuiSwitch-root',
    '.MuiSelect-select',
].join(', ');

/** Vertical movement before a press becomes a drag (so plain clicks never move anything). */
const DRAG_THRESHOLD_PX = 4;
const SETTLE_MS = 180;
const SHIFT_MS = 220;
const EASE = 'cubic-bezier(0.2, 0, 0, 1)';
const LIFT_SHADOW = '0 14px 30px -6px rgba(15, 23, 42, 0.18), 0 4px 12px -2px rgba(37, 99, 235, 0.14), 0 0 0 1.5px #60a5fa';
/** Same three layers, transparent: lets the shadow fade out while the row settles. */
const SETTLED_SHADOW = '0 0 0 0 rgba(15, 23, 42, 0), 0 0 0 0 rgba(37, 99, 235, 0), 0 0 0 0 rgba(96, 165, 250, 0)';

/** Auto-scroll: distance from the scroll area's edge where scrolling kicks in, and the top speed (px / frame). */
const AUTO_SCROLL_ZONE_PX = 80;
const AUTO_SCROLL_MAX_SPEED = 20;

/** Nearest ancestor that actually scrolls vertically, else the page. */
function findScroller(el: HTMLElement): HTMLElement {
    for (let node = el.parentElement; node && node !== document.body; node = node.parentElement) {
        const { overflowY } = getComputedStyle(node);
        if ((overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay') && node.scrollHeight > node.clientHeight + 1) return node;
    }
    return (document.scrollingElement as HTMLElement | null) ?? document.documentElement;
}

/** Scroll speed for a pointer at `clientY`: negative = up, positive = down, eased in as it nears the edge. */
function autoScrollSpeed(scroller: HTMLElement, clientY: number): number {
    const isPage = scroller === document.scrollingElement || scroller === document.documentElement;
    const rect = isPage ? { top: 0, bottom: window.innerHeight } : scroller.getBoundingClientRect();
    // Only the part of the scroll area that is on screen counts.
    const top = Math.max(rect.top, 0);
    const bottom = Math.min(rect.bottom, window.innerHeight);
    const ease = (distance: number) => {
        const t = Math.min(1, Math.max(0, (AUTO_SCROLL_ZONE_PX - distance) / AUTO_SCROLL_ZONE_PX));
        return Math.max(1, Math.round(AUTO_SCROLL_MAX_SPEED * t * t));
    };
    if (clientY < top + AUTO_SCROLL_ZONE_PX && scroller.scrollTop > 0) return -ease(clientY - top);
    if (clientY > bottom - AUTO_SCROLL_ZONE_PX && scroller.scrollTop + scroller.clientHeight < scroller.scrollHeight) return ease(bottom - clientY);
    return 0;
}

/** Page-wide drag styling (no text selection, grabbing cursor); returns the previous values to restore. */
function lockBody(): { userSelect: string; cursor: string } {
    const { style } = document.body;
    const previous = { userSelect: style.userSelect, cursor: style.cursor };
    style.userSelect = 'none';
    style.cursor = 'grabbing';
    window.getSelection()?.removeAllRanges();
    return previous;
}

function unlockBody(previous: { userSelect: string; cursor: string }): void {
    document.body.style.userSelect = previous.userSelect;
    document.body.style.cursor = previous.cursor;
}

const isInteractive = (target: EventTarget | null, row: Element) => {
    const el = target instanceof Element ? target.closest(INTERACTIVE_SELECTOR) : null;
    return Boolean(el && el !== row && row.contains(el));
};

interface RowRect {
    top: number;
    bottom: number;
    height: number;
    midY: number;
}

/** Mutable pointer session (lives in a ref so window listeners always see the latest values). */
interface Session {
    id: string;
    pointerId: number;
    startY: number;
    /** Scroll area the rows live in (auto-scrolled near its edges) and its scrollTop when the drag began. */
    scroller: HTMLElement | null;
    startScrollTop: number;
    lastClientY: number;
    engaged: boolean;
    ids: string[];
    rects: RowRect[];
    fromIndex: number;
    targetIndex: number;
    deltaY: number;
    /** Distance a sibling moves to make room: dragged row height + the gap between rows. */
    stride: number;
    bodyUserSelect: string;
    bodyCursor: string;
}

/** What rendering needs from the session. */
interface DragView {
    id: string;
    ids: string[];
    fromIndex: number;
    targetIndex: number;
    deltaY: number;
    stride: number;
    phase: 'dragging' | 'settling';
}

export interface RowDragProps {
    ref: (el: HTMLElement | null) => void;
    onPointerDown: (e: ReactPointerEvent<HTMLElement>) => void;
}

/**
 * Zero-dependency, pointer-driven drag-to-reorder with a physical feel.
 *
 * - The pressed row lifts and follows the pointer; siblings slide out of its way as it passes their middle.
 * - On release the row glides into its slot, then `onReorder` fires — in the same tick as the drag state is
 *   cleared, so the list re-renders straight into the new order without a jump. Escape / pointer-cancel glide
 *   it back instead.
 * - `orderedItems` holds the new order until `items` changes, so the rows never snap back while the parent
 *   catches up (render `orderedItems`, not `items`).
 *
 * Spread `getRowDragProps(item)` on each row and `getRowDragSx(item)` last into its `sx`. Presses on inputs,
 * buttons, selects and switches inside a row never start a drag.
 */
export function useDragReorder<T extends { id: string }>({
    items,
    canDrag,
    onReorder,
}: {
    items: T[];
    canDrag: boolean;
    onReorder: (orderedIds: string[]) => void;
}) {
    const [view, setView] = useState<DragView | null>(null);
    /** Order committed by the last drop, applied while `items` is still what it was at that moment. */
    const [pending, setPending] = useState<{ order: string[]; basis: string } | null>(null);

    const itemsKey = items.map((i) => i.id).join('\u0000');
    const orderedItems = useMemo(() => {
        if (!pending || pending.basis !== itemsKey) return items;
        const byId = new Map(items.map((i) => [i.id, i]));
        const out = pending.order.map((id) => byId.get(id)).filter((i): i is T => Boolean(i));
        return out.length === items.length ? out : items;
    }, [items, itemsKey, pending]);

    const rowEls = useRef(new Map<string, HTMLElement>());
    const session = useRef<Session | null>(null);
    const detachRef = useRef<(() => void) | null>(null);
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const rafRef = useRef<number | null>(null);
    const autoScrollRef = useRef<number | null>(null);
    const orderedRef = useRef(orderedItems);
    const itemsKeyRef = useRef(itemsKey);
    const onReorderRef = useRef(onReorder);
    useEffect(() => {
        orderedRef.current = orderedItems;
        itemsKeyRef.current = itemsKey;
        onReorderRef.current = onReorder;
    }, [orderedItems, itemsKey, onReorder]);

    const restoreBody = (s: Session) => unlockBody({ userSelect: s.bodyUserSelect, cursor: s.bodyCursor });

    // Unmounting mid-drag: drop listeners, timers and the body styles.
    useEffect(
        () => () => {
            detachRef.current?.();
            if (timerRef.current) clearTimeout(timerRef.current);
            if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
            if (autoScrollRef.current != null) cancelAnimationFrame(autoScrollRef.current);
            if (session.current?.engaged) restoreBody(session.current);
        },
        [],
    );

    const stopAutoScroll = () => {
        if (autoScrollRef.current != null) cancelAnimationFrame(autoScrollRef.current);
        autoScrollRef.current = null;
    };

    /**
     * Runs every frame while dragging: near the top / bottom edge of the scroll area it scrolls (faster the
     * closer the pointer gets), and the lifted row and sliding siblings follow the scrolled content.
     */
    const autoScrollLoop = () => {
        const s = session.current;
        if (!s?.engaged || !s.scroller) {
            autoScrollRef.current = null;
            return;
        }
        const speed = autoScrollSpeed(s.scroller, s.lastClientY);
        if (speed !== 0) {
            const before = s.scroller.scrollTop;
            s.scroller.scrollTop = before + speed;
            if (s.scroller.scrollTop !== before) {
                track(s, s.lastClientY);
                schedule();
            }
        }
        autoScrollRef.current = requestAnimationFrame(autoScrollLoop);
    };

    const publish = () => {
        rafRef.current = null;
        const s = session.current;
        if (!s?.engaged) return;
        setView({ id: s.id, ids: s.ids, fromIndex: s.fromIndex, targetIndex: s.targetIndex, deltaY: s.deltaY, stride: s.stride, phase: 'dragging' });
    };
    /** One render per animation frame, however many pointer events arrive. */
    const schedule = () => {
        if (rafRef.current == null) rafRef.current = requestAnimationFrame(publish);
    };

    /** Measures the rows once, at the start of the drag. */
    const engage = (s: Session): boolean => {
        const ids = orderedRef.current.map((i) => i.id);
        const fromIndex = ids.indexOf(s.id);
        const measured = ids.map((id) => rowEls.current.get(id)?.getBoundingClientRect());
        if (fromIndex < 0 || measured.some((r) => !r)) return false;
        const rects = (measured as DOMRect[]).map((r) => ({ top: r.top, bottom: r.bottom, height: r.height, midY: r.top + r.height / 2 }));
        const self = rects[fromIndex];
        const next = rects[fromIndex + 1];
        const prev = rects[fromIndex - 1];
        const gap = Math.max(0, next ? next.top - self.bottom : prev ? self.top - prev.bottom : 0);

        const scroller = findScroller(rowEls.current.get(s.id) as HTMLElement);
        Object.assign(s, { engaged: true, ids, rects, fromIndex, targetIndex: fromIndex, deltaY: 0, stride: self.height + gap, scroller, startScrollTop: scroller.scrollTop });
        // The pointer may have moved past the threshold already: measure from where the drag really starts.
        track(s, s.lastClientY);
        autoScrollRef.current = requestAnimationFrame(autoScrollLoop);
        const previous = lockBody();
        s.bodyUserSelect = previous.userSelect;
        s.bodyCursor = previous.cursor;
        return true;
    };

    /** Follows the pointer and works out which slot the row's leading edge has reached. */
    const track = (s: Session, clientY: number) => {
        s.lastClientY = clientY;
        // Scrolling moves the rows too (by hand or auto-scroll): keep the lifted row under the pointer.
        // Rects were measured before any scroll, so everything here is in "content at drag start" coordinates.
        const scrolled = s.scroller ? s.scroller.scrollTop - s.startScrollTop : 0;
        s.deltaY = clientY - s.startY + scrolled;
        const self = s.rects[s.fromIndex];
        let target = s.fromIndex;
        if (s.deltaY > 0) {
            const bottom = self.bottom + s.deltaY;
            for (let i = s.fromIndex + 1; i < s.rects.length && s.rects[i].midY < bottom; i++) target = i;
        } else if (s.deltaY < 0) {
            const top = self.top + s.deltaY;
            for (let i = s.fromIndex - 1; i >= 0 && s.rects[i].midY > top; i--) target = i;
        }
        s.targetIndex = target;
    };

    /** Glides the row into its slot (or back home when cancelled), then commits. */
    const finish = (commit: boolean) => {
        const s = session.current;
        detachRef.current?.();
        stopAutoScroll();
        if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
        if (!s?.engaged) {
            session.current = null;
            return;
        }

        const from = s.fromIndex;
        const to = commit ? s.targetIndex : from;
        const r = s.rects;
        // Where the row's box lands once the list is in its new order (exact, whatever the row heights).
        const settleY = to > from ? r[to].bottom - r[from].bottom : to < from ? r[to].top - r[from].top : 0;
        setView({ id: s.id, ids: s.ids, fromIndex: from, targetIndex: to, deltaY: settleY, stride: s.stride, phase: 'settling' });

        // The release must not also "click" whatever is under the pointer.
        const swallow = (e: MouseEvent) => {
            e.stopPropagation();
            e.preventDefault();
        };
        window.addEventListener('click', swallow, { capture: true, once: true });
        setTimeout(() => window.removeEventListener('click', swallow, { capture: true }), 0);

        timerRef.current = setTimeout(() => {
            timerRef.current = null;
            restoreBody(s);
            session.current = null;
            if (to === from) {
                setView(null);
                return;
            }
            const next = [...s.ids];
            const [moved] = next.splice(from, 1);
            next.splice(to, 0, moved);
            // Same tick: the transforms go away exactly as the rows take their new order.
            setPending({ order: next, basis: itemsKeyRef.current });
            setView(null);
            onReorderRef.current(next);
        }, SETTLE_MS);
    };

    const start = (item: T, e: ReactPointerEvent<HTMLElement>) => {
        const s: Session = {
            id: item.id,
            pointerId: e.pointerId,
            startY: e.clientY,
            scroller: null,
            startScrollTop: 0,
            lastClientY: e.clientY,
            engaged: false,
            ids: [],
            rects: [],
            fromIndex: -1,
            targetIndex: -1,
            deltaY: 0,
            stride: 0,
            bodyUserSelect: '',
            bodyCursor: '',
        };
        session.current = s;

        const onMove = (ev: PointerEvent) => {
            if (ev.pointerId !== s.pointerId) return;
            s.lastClientY = ev.clientY;
            if (!s.engaged) {
                if (Math.abs(ev.clientY - s.startY) < DRAG_THRESHOLD_PX) return;
                if (!engage(s)) {
                    detachRef.current?.();
                    session.current = null;
                    return;
                }
            }
            ev.preventDefault();
            track(s, ev.clientY);
            schedule();
        };
        const onUp = (ev: PointerEvent) => ev.pointerId === s.pointerId && finish(true);
        const onCancel = (ev: PointerEvent) => ev.pointerId === s.pointerId && finish(false);
        const onKey = (ev: KeyboardEvent) => {
            if (ev.key !== 'Escape') return;
            if (s.engaged) ev.preventDefault();
            finish(false);
        };
        const onScroll = () => {
            if (!s.engaged) return;
            track(s, s.lastClientY);
            schedule();
        };

        window.addEventListener('pointermove', onMove, { passive: false });
        window.addEventListener('pointerup', onUp);
        window.addEventListener('pointercancel', onCancel);
        window.addEventListener('keydown', onKey);
        // Capture phase: scrolls of inner containers don't bubble, but do reach a capturing window listener.
        window.addEventListener('scroll', onScroll, { passive: true, capture: true });
        detachRef.current = () => {
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerup', onUp);
            window.removeEventListener('pointercancel', onCancel);
            window.removeEventListener('keydown', onKey);
            window.removeEventListener('scroll', onScroll, { capture: true });
            detachRef.current = null;
        };
    };

    const getRowDragProps = (item: T, isDraggable = true): RowDragProps => ({
        ref: (el) => {
            if (el) rowEls.current.set(item.id, el);
            else rowEls.current.delete(item.id);
        },
        onPointerDown: (e) => {
            if (!canDrag || !isDraggable || e.button !== 0 || !e.isPrimary) return;
            if (session.current || view) return; // a drag is running or settling
            if (isInteractive(e.target, e.currentTarget)) return;
            start(item, e);
        },
    });

    /** Lifted style for the dragged row, sliding offsets for its siblings; `{}` when nothing is dragged. */
    const getRowDragSx = (item: T): Record<string, unknown> => {
        if (!view) return {};
        const index = view.ids.indexOf(item.id);
        if (index < 0) return {};

        if (item.id === view.id) {
            const settling = view.phase === 'settling';
            return {
                position: 'relative',
                zIndex: 30,
                backgroundColor: '#ffffff',
                borderRadius: '8px',
                cursor: 'grabbing',
                willChange: 'transform',
                transform: `translate3d(0, ${view.deltaY}px, 0) scale(${settling ? 1 : 1.014})`,
                boxShadow: settling ? SETTLED_SHADOW : LIFT_SHADOW,
                // While tracking, the transform follows the pointer with no easing (zero lag).
                transition: settling
                    ? `transform ${SETTLE_MS}ms ${EASE}, box-shadow ${SETTLE_MS}ms ease`
                    : 'box-shadow 180ms ease, background-color 180ms ease',
                '&:hover': { backgroundColor: '#ffffff' },
            };
        }

        const { fromIndex: from, targetIndex: to, stride } = view;
        let offset = 0;
        if (to > from && index > from && index <= to) offset = -stride;
        else if (to < from && index >= to && index < from) offset = stride;
        return {
            position: 'relative',
            zIndex: 1,
            pointerEvents: 'none',
            transform: `translate3d(0, ${offset}px, 0)`,
            transition: `transform ${SHIFT_MS}ms ${EASE}`,
        };
    };

    return { draggedId: view?.id ?? null, isDragging: Boolean(view), orderedItems, getRowDragProps, getRowDragSx };
}
