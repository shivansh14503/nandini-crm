'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';

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
/** A sibling's slot flips only once the dragged edge is this far past its middle (no jitter on the boundary). */
const HYSTERESIS_PX = 6;
const SETTLE_MS = 180;
const SHIFT_MS = 220;
const EASE = 'cubic-bezier(0.2, 0, 0, 1)';
const LIFT_SCALE = 1.012;
const LIFT_SHADOW = '0 14px 30px -6px rgba(15, 23, 42, 0.18), 0 4px 12px -2px rgb(var(--crm-accent-rgb) / 0.14), 0 0 0 1.5px var(--crm-blue-400)';
/** Same three layers, transparent: lets the shadow fade out while the row settles. */
const SETTLED_SHADOW = '0 0 0 0 rgba(15, 23, 42, 0), 0 0 0 0 rgb(var(--crm-accent-rgb) / 0), 0 0 0 0 rgb(var(--crm-accent-rgb) / 0)';
/** Group header of the section a row is being dragged into (from another section). */
const TARGET_GROUP_BG = 'var(--mui-palette-primary-soft)';
const TARGET_GROUP_SHADOW = 'inset 3px 0 0 var(--mui-palette-primary-main), inset 0 -1px 0 var(--crm-blue-200)';

/** Auto-scroll: distance from the scroll area's edge where scrolling kicks in, and the top speed (px / frame). */
const AUTO_SCROLL_ZONE_PX = 80;
const AUTO_SCROLL_MAX_SPEED = 20;

/** Every inline style the drag sets, so a reset leaves the rows exactly as React / Emotion styled them. */
const DRAG_STYLE_PROPS = [
    'transform',
    'transition',
    'zIndex',
    'position',
    'boxShadow',
    'willChange',
    'pointerEvents',
    'backgroundColor',
    'borderRadius',
    'cursor',
] as const;

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

function clearDragStyles(el: HTMLElement): void {
    for (const prop of DRAG_STYLE_PROPS) el.style[prop] = '';
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

/**
 * One vertical block taking part in a drag: a row, or (in grouped mode) a group header. A row's group is the
 * header above it, so moving a row past a header moves it into the neighbouring group.
 */
interface DragNode {
    kind: 'item' | 'group';
    key: string;
    /** Group the node belongs to ('' when the list isn't grouped). */
    group: string;
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
    /** Rows and group headers in display order (captured once at drag start). */
    nodes: DragNode[];
    rects: RowRect[];
    /** Node elements, aligned with `nodes`. */
    els: HTMLElement[];
    /** Lowest slot a row may take (1 when the list starts with a group header: no row above the first group). */
    firstSlot: number;
    fromIndex: number;
    targetIndex: number;
    /** Group header currently highlighted as the drop target (index into `nodes`, -1 for none). */
    highlighted: number;
    deltaY: number;
    /** Distance a sibling moves to make room: dragged row height + the gap between rows. */
    stride: number;
    bodyUserSelect: string;
    bodyCursor: string;
}

export interface RowDragProps {
    ref: (el: HTMLElement | null) => void;
    onPointerDown: (e: ReactPointerEvent<HTMLElement>) => void;
}

export interface GroupDragProps {
    ref: (el: HTMLElement | null) => void;
}

const NO_SX: Record<string, unknown> = {};

/**
 * Zero-dependency, pointer-driven drag-to-reorder with a physical feel — and no React work while dragging.
 *
 * - The pressed row lifts and follows the pointer; siblings slide out of its way as it passes their middle.
 *   All of it is inline `transform`s written straight to the row elements (compositor-only), so moving the
 *   pointer causes no React render and no Emotion style injection. Siblings are only touched when the target
 *   slot changes, and a small hysteresis keeps that slot from flickering on a boundary.
 * - Grouped mode (`groups` + `groupOf`, with `getGroupProps(key)` spread on each group's header): rows and
 *   headers form one list, so a row can be dragged across a header into another group. The headers slide with
 *   the rows (the source group closes its gap, the target group parts), and the target group's header is
 *   highlighted. `onReorder` then also receives each row's group.
 * - On release the row glides into its slot, then `onReorder` fires; the inline styles are cleared in a layout
 *   effect of the very render that puts the rows in their new order, so no frame shows old order + no offsets
 *   (or new order + old offsets). Escape / pointer-cancel glide it back instead.
 * - `orderedItems` holds the new order until `items` changes, so the rows never snap back while the parent
 *   catches up (render `orderedItems`, not `items`, unless the parent updates in the same render).
 *
 * Spread `getRowDragProps(item)` on each row (and `getRowDragSx(item)` into its `sx`; it is static now). Presses
 * on inputs, buttons, selects and switches inside a row never start a drag.
 */
export function useDragReorder<T extends { id: string }>({
    items,
    canDrag,
    onReorder,
    groups,
    groupOf,
}: {
    /** Every row taking part, in display order (rows that can't be dragged themselves still slide aside). */
    items: T[];
    canDrag: boolean;
    /** New row order; in grouped mode also each row's group (`row id → group key`). */
    onReorder: (orderedIds: string[], groupById: Record<string, string>) => void;
    /** Grouped mode: group keys in display order. */
    groups?: string[];
    /** Grouped mode: the group a row is in. */
    groupOf?: (item: T) => string;
}) {
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
    const groupEls = useRef(new Map<string, HTMLElement>());
    const session = useRef<Session | null>(null);
    const detachRef = useRef<(() => void) | null>(null);
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const autoScrollRef = useRef<number | null>(null);
    /** Elements whose drag styles must be cleared once the reordered rows are committed to the DOM. */
    const clearOnCommit = useRef<HTMLElement[] | null>(null);
    const orderedRef = useRef(orderedItems);
    const itemsKeyRef = useRef(itemsKey);
    const onReorderRef = useRef(onReorder);
    const groupsRef = useRef(groups);
    const groupOfRef = useRef(groupOf);
    useEffect(() => {
        orderedRef.current = orderedItems;
        itemsKeyRef.current = itemsKey;
        onReorderRef.current = onReorder;
        groupsRef.current = groups;
        groupOfRef.current = groupOf;
    }, [orderedItems, itemsKey, onReorder, groups, groupOf]);

    // Runs after the DOM is updated and before the browser paints: the rows are in their new order, so the
    // offsets that faked that order can go in the same frame.
    useLayoutEffect(() => {
        const els = clearOnCommit.current;
        if (!els) return;
        clearOnCommit.current = null;
        els.forEach(clearDragStyles);
    }, [orderedItems]);

    const restoreBody = (s: Session) => unlockBody({ userSelect: s.bodyUserSelect, cursor: s.bodyCursor });

    // Unmounting mid-drag: drop listeners, timers, inline styles and the body styles.
    useEffect(
        () => () => {
            detachRef.current?.();
            if (timerRef.current) clearTimeout(timerRef.current);
            if (autoScrollRef.current != null) cancelAnimationFrame(autoScrollRef.current);
            const s = session.current;
            if (s?.engaged) {
                s.els.forEach(clearDragStyles);
                restoreBody(s);
            }
        },
        [],
    );

    const stopAutoScroll = () => {
        if (autoScrollRef.current != null) cancelAnimationFrame(autoScrollRef.current);
        autoScrollRef.current = null;
    };

    // ── Imperative styling (no React state) ──

    const dragTransform = (deltaY: number, scale: number) => `translate3d(0, ${deltaY}px, 0) scale(${scale})`;

    /** Group the dragged row joins at the current target slot (its own group when it hasn't moved). */
    const targetGroupOf = (s: Session): string => {
        const { nodes, fromIndex: from, targetIndex: to } = s;
        if (to === from) return nodes[from].group;
        // Moving down it lands after node `to`; moving up, after node `to - 1` (never the row itself).
        return nodes[to > from ? to : to - 1]?.group ?? nodes[from].group;
    };

    /** Highlights the header of the group the row is being dragged into, when that's another group. */
    const highlightTarget = (s: Session) => {
        const group = targetGroupOf(s);
        const index = group !== s.nodes[s.fromIndex].group ? s.nodes.findIndex((n) => n.kind === 'group' && n.key === group) : -1;
        if (index === s.highlighted) return;
        if (s.highlighted >= 0) {
            const { style } = s.els[s.highlighted];
            style.backgroundColor = '';
            style.boxShadow = '';
        }
        if (index >= 0) {
            const { style } = s.els[index];
            style.backgroundColor = TARGET_GROUP_BG;
            style.boxShadow = TARGET_GROUP_SHADOW;
        }
        s.highlighted = index;
    };

    /** Sibling offsets for the current target slot. Called only when the target changes. */
    const layoutSiblings = (s: Session) => {
        const from = s.fromIndex;
        const to = s.targetIndex;
        s.els.forEach((el, index) => {
            if (index === from) return;
            let offset = 0;
            if (to > from && index > from && index <= to) offset = -s.stride;
            else if (to < from && index >= to && index < from) offset = s.stride;
            el.style.transform = `translate3d(0, ${offset}px, 0)`;
        });
        highlightTarget(s);
    };

    const liftRows = (s: Session) => {
        s.els.forEach((el, index) => {
            const { style } = el;
            style.position = 'relative';
            style.willChange = 'transform';
            if (index === s.fromIndex) {
                style.zIndex = '30';
                style.backgroundColor = 'var(--mui-palette-background-paper)';
                style.borderRadius = '8px';
                style.cursor = 'grabbing';
                style.boxShadow = LIFT_SHADOW;
                // No transform transition while dragging: the row tracks the pointer with zero lag.
                style.transition = 'box-shadow 150ms ease';
                style.transform = dragTransform(s.deltaY, LIFT_SCALE);
            } else {
                style.zIndex = '1';
                style.pointerEvents = 'none';
                style.transition = `transform ${SHIFT_MS}ms ${EASE}, background-color 150ms ease, box-shadow 150ms ease`;
                style.transform = 'translate3d(0, 0px, 0)';
            }
        });
    };

    /**
     * Follows the pointer: moves the lifted row, and re-lays the siblings only if the target slot changed.
     * A sibling counts as passed once the leading edge is HYSTERESIS_PX beyond its middle, and as un-passed only
     * once it is HYSTERESIS_PX back on the other side, so hovering on a boundary never makes rows flicker.
     * Group headers are siblings like any row: passing one moves the row into the neighbouring group.
     */
    const track = (s: Session, clientY: number) => {
        s.lastClientY = clientY;
        // Scrolling moves the rows too (by hand or auto-scroll): keep the lifted row under the pointer.
        // Rects were measured before any scroll, so everything here is in "content at drag start" coordinates.
        const scrolled = s.scroller ? s.scroller.scrollTop - s.startScrollTop : 0;
        s.deltaY = clientY - s.startY + scrolled;
        s.els[s.fromIndex].style.transform = dragTransform(s.deltaY, LIFT_SCALE);

        const { fromIndex: from, targetIndex: current, rects } = s;
        const self = rects[from];
        const passed = (i: number) => (i > from && i <= current) || (i < from && i >= current);
        let target = from;
        const bottom = self.bottom + s.deltaY;
        for (let i = from + 1; i < rects.length && bottom > rects[i].midY + (passed(i) ? -HYSTERESIS_PX : HYSTERESIS_PX); i++) target = i;
        if (target === from) {
            const top = self.top + s.deltaY;
            for (let i = from - 1; i >= s.firstSlot && top < rects[i].midY + (passed(i) ? HYSTERESIS_PX : -HYSTERESIS_PX); i--) target = i;
        }
        if (target !== current) {
            s.targetIndex = target;
            layoutSiblings(s);
        }
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
            if (s.scroller.scrollTop !== before) track(s, s.lastClientY);
        }
        autoScrollRef.current = requestAnimationFrame(autoScrollLoop);
    };

    /** Rows (and, in grouped mode, group headers) in display order. */
    const buildNodes = (): DragNode[] => {
        const list = orderedRef.current;
        const groupKeys = groupsRef.current;
        const of = groupOfRef.current;
        if (!groupKeys || !of) return list.map((i) => ({ kind: 'item', key: i.id, group: '' }));
        const nodes: DragNode[] = [];
        for (const group of groupKeys) {
            nodes.push({ kind: 'group', key: group, group });
            for (const item of list) if (of(item) === group) nodes.push({ kind: 'item', key: item.id, group });
        }
        return nodes;
    };

    /** Measures the rows once and lifts the pressed one. */
    const engage = (s: Session): boolean => {
        const nodes = buildNodes();
        const fromIndex = nodes.findIndex((n) => n.kind === 'item' && n.key === s.id);
        const els = nodes.map((n) => (n.kind === 'item' ? rowEls.current : groupEls.current).get(n.key));
        if (fromIndex < 0 || els.some((el) => !el)) return false;
        const nodeElements = els as HTMLElement[];
        const rects = nodeElements.map((el) => {
            const r = el.getBoundingClientRect();
            return { top: r.top, bottom: r.bottom, height: r.height, midY: r.top + r.height / 2 };
        });
        const self = rects[fromIndex];
        const next = rects[fromIndex + 1];
        const prev = rects[fromIndex - 1];
        const gap = Math.max(0, next ? next.top - self.bottom : prev ? self.top - prev.bottom : 0);

        const scroller = findScroller(nodeElements[fromIndex]);
        Object.assign(s, {
            engaged: true,
            nodes,
            rects,
            els: nodeElements,
            firstSlot: nodes[0]?.kind === 'group' ? 1 : 0,
            fromIndex,
            targetIndex: fromIndex,
            highlighted: -1,
            deltaY: 0,
            stride: self.height + gap,
            scroller,
            startScrollTop: scroller.scrollTop,
        });
        liftRows(s);
        // The pointer may have moved past the threshold already: place the row where the pointer really is.
        track(s, s.lastClientY);
        autoScrollRef.current = requestAnimationFrame(autoScrollLoop);
        const previous = lockBody();
        s.bodyUserSelect = previous.userSelect;
        s.bodyCursor = previous.cursor;
        return true;
    };

    /** Glides the row into its slot (or back home when cancelled), then commits. */
    const finish = (commit: boolean) => {
        const s = session.current;
        detachRef.current?.();
        stopAutoScroll();
        if (!s?.engaged) {
            session.current = null;
            return;
        }

        const from = s.fromIndex;
        const to = commit ? s.targetIndex : from;
        if (s.targetIndex !== to) {
            s.targetIndex = to;
            layoutSiblings(s); // cancelled: siblings slide back home
        }
        const r = s.rects;
        // Where the row's box lands once the list is in its new order (exact, whatever the row heights).
        const settleY = to > from ? r[to].bottom - r[from].bottom : to < from ? r[to].top - r[from].top : 0;
        const { style } = s.els[from];
        style.transition = `transform ${SETTLE_MS}ms ${EASE}, box-shadow ${SETTLE_MS}ms ease`;
        style.transform = dragTransform(settleY, 1);
        style.boxShadow = SETTLED_SHADOW;

        // The release must not also "click" whatever is under the pointer.
        const swallow = (e: MouseEvent) => {
            e.stopPropagation();
            e.preventDefault();
        };
        window.addEventListener('click', swallow, { capture: true, once: true });
        setTimeout(() => window.removeEventListener('click', swallow, { capture: true }), 0);

        timerRef.current = setTimeout(
            () => {
                timerRef.current = null;
                restoreBody(s);
                session.current = null;
                if (to === from) {
                    // Order unchanged: every row is visually home already, so the styles can go right away.
                    s.els.forEach(clearDragStyles);
                    return;
                }
                const next = [...s.nodes];
                const [moved] = next.splice(from, 1);
                next.splice(to, 0, moved);
                // Each row's group is the header above it in the new order.
                const groupById: Record<string, string> = {};
                let group = '';
                const order: string[] = [];
                for (const node of next) {
                    if (node.kind === 'group') group = node.key;
                    else {
                        order.push(node.key);
                        groupById[node.key] = group || node.group;
                    }
                }
                // The layout effect of the render that applies `next` clears the offsets before that frame paints.
                clearOnCommit.current = s.els;
                setPending({ order, basis: itemsKeyRef.current });
                onReorderRef.current(order, groupById);
            },
            to === from ? Math.max(SETTLE_MS, SHIFT_MS) : SETTLE_MS,
        );
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
            nodes: [],
            rects: [],
            els: [],
            firstSlot: 0,
            fromIndex: -1,
            targetIndex: -1,
            highlighted: -1,
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
                }
                ev.preventDefault();
                return;
            }
            ev.preventDefault();
            track(s, ev.clientY);
        };
        const onUp = (ev: PointerEvent) => ev.pointerId === s.pointerId && finish(true);
        const onCancel = (ev: PointerEvent) => ev.pointerId === s.pointerId && finish(false);
        const onKey = (ev: KeyboardEvent) => {
            if (ev.key !== 'Escape') return;
            if (s.engaged) ev.preventDefault();
            finish(false);
        };
        const onScroll = () => {
            if (s.engaged) track(s, s.lastClientY);
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
            if (session.current) return; // a drag is running or settling
            if (isInteractive(e.target, e.currentTarget)) return;
            start(item, e);
        },
    });

    /** Grouped mode: spread on each group's header (the block a row passes to enter the group). */
    const getGroupProps = (groupKey: string): GroupDragProps => ({
        ref: (el) => {
            if (el) groupEls.current.set(groupKey, el);
            else groupEls.current.delete(groupKey);
        },
    });

    /** Kept for API compatibility: all drag styling is applied to the row elements directly, so this is static. */
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const getRowDragSx = (_item: T): Record<string, unknown> => NO_SX;

    return { orderedItems, getRowDragProps, getGroupProps, getRowDragSx };
}
