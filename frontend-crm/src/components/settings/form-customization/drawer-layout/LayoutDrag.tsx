'use client';

import React, { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { produce } from 'immer';
import type { DrawerLayoutDocument } from '@/lib/drawer-layout';
import {
    DRAG_THRESHOLD_PX,
    EASE,
    HYSTERESIS_PX,
    INTERACTIVE_SELECTOR,
    LIFT_SCALE,
    LIFT_SHADOW,
    SETTLED_SHADOW,
    SETTLE_MS,
    SHIFT_MS,
    autoScrollSpeed,
    findScroller,
    lockBody,
    unlockBody,
} from '../useDragReorder';
import { findBadge, findBlock, findSection, type Selection } from './layoutEditor';

/**
 * Drag and drop for the Drawer Layout builder, with the same feel as the form builder's field list (useDragReorder):
 * the pressed item lifts and follows the pointer with no lag, everything else slides out of its way, and on release
 * it glides into its slot. It works on the drawer's real layout (two-column sections, badges that wrap, moving a
 * field into another section or a new one): while dragging, the canvas renders the layout as it would be after the
 * drop, and every block, section and badge that moved slides from where it was to where it is now (FLIP). The
 * lifted item is a copy that floats above the page, so its slot in the layout simply shows as a gap.
 *
 * The parts that take part are marked with data attributes (see `dndItem`, `dndSource`, `DND_HANDLE`, `dndZone`)
 * rather than hooks, so one pointer handler on the builder starts every drag. Mouse drags start from anywhere on an
 * item after a few pixels; touch drags start from its grip, so swiping over the drawer still scrolls the page.
 */

export type DragSource =
    | { source: 'field'; key: string; label: string }
    | { source: 'block'; blockType: 'heading' | 'text' | 'divider' | 'address' | 'customFields' | 'lineItems' | 'totals'; prefix?: string; label: string }
    | { source: 'section'; columns: 1 | 2; label: string }
    | { source: 'piece'; pieceId: string; label: string }
    | { source: 'canvas-block'; blockId: string; label: string }
    | { source: 'canvas-section'; sectionId: string; label: string }
    | { source: 'canvas-badge'; badgeId: string; label: string };

/** Where a drop puts the item. `index` is its place in the list it lands in, counted without the item itself. */
export type DropTarget =
    | { kind: 'block'; sectionId: string; index: number }
    | { kind: 'section'; tab: string; index: number }
    | { kind: 'newSection'; tab: string; index: number }
    | { kind: 'badge'; index: number };

/** What dropping a source on a target does: the edit, the item's id in the result, and what to select after. */
export type DropResult = { recipe: (doc: DrawerLayoutDocument) => void; itemId: string; select?: Selection; createdSectionId?: string } | { error: string };

/** Made once per drag (so new items keep one id from the first preview to the drop). */
export type DropPlan = (target: DropTarget) => DropResult | null;

// ─── Markup contract ────────────────────────────────────────────────────────────

type DataAttrs = Record<`data-${string}`, string>;

/** A palette item that can be dragged onto the drawer. */
export const dndSource = (source: DragSource): DataAttrs => ({ 'data-dnd-source': JSON.stringify(source) });

/** A block, section or badge of the drawer: draggable, and one of the slots a drag moves around. */
export const dndItem = (kind: 'block' | 'section' | 'badge', id: string, source: DragSource, inline = false): DataAttrs => ({
    ...dndSource(source),
    'data-dnd-kind': kind,
    'data-dnd-id': id,
    'data-dnd-flip': id,
    ...(inline ? { 'data-dnd-inline': 'true' } : {}),
});

/** The grip of an item: where touch drags start (give it `touch-action: none`). */
export const DND_HANDLE: DataAttrs = { 'data-dnd-handle': 'true' };

/** Areas of the drawer a drag measures: the tab's sections, the header badges, a section's blocks, the "new section" box. */
export const dndZone = (zone: 'tab' | 'badges' | 'section-body' | 'new-section', tab?: string): DataAttrs => ({
    'data-dnd-zone': zone,
    ...(tab ? { 'data-dnd-tab': tab } : {}),
    ...(zone === 'new-section' ? { 'data-dnd-flip': '__new-section' } : {}),
});

const isSectionSource = (s: DragSource) => s.source === 'section' || s.source === 'piece' || s.source === 'canvas-section';
const isCanvasSource = (s: DragSource) => s.source === 'canvas-block' || s.source === 'canvas-section' || s.source === 'canvas-badge';
const canvasItemId = (s: DragSource) => (s.source === 'canvas-block' ? s.blockId : s.source === 'canvas-section' ? s.sectionId : s.source === 'canvas-badge' ? s.badgeId : null);

// ─── Geometry ───────────────────────────────────────────────────────────────────

interface Box {
    left: number;
    top: number;
    right: number;
    bottom: number;
    width: number;
    height: number;
}
interface Pt {
    x: number;
    y: number;
}
/** One item's place in the layout (relative to the drawer, so scrolling doesn't change it). */
interface Slot {
    id: string;
    rect: Box;
    /** Sits side by side with others (half-width field, badge): left / right decides before or after. */
    inline: boolean;
    /** The row it sits in (its own box unless inline). */
    band: { top: number; bottom: number };
}
interface Measured {
    tab: string | null;
    newSection: Box | null;
    badgesZone: Box | null;
    sections: (Slot & { blocks: Slot[] })[];
    badges: Slot[];
}

const relBox = (r: DOMRect, origin: DOMRect): Box => ({
    left: r.left - origin.left,
    top: r.top - origin.top,
    right: r.right - origin.left,
    bottom: r.bottom - origin.top,
    width: r.width,
    height: r.height,
});
const inside = (b: Box, p: Pt, pad = 0) => p.x >= b.left - pad && p.x <= b.right + pad && p.y >= b.top - pad && p.y <= b.bottom + pad;

/** Slots in display order, with the rows inline items share. */
function slotsOf(els: HTMLElement[], origin: DOMRect): Slot[] {
    const slots = els.map((el) => {
        const rect = relBox(el.getBoundingClientRect(), origin);
        return { id: el.dataset.dndId ?? '', rect, inline: el.dataset.dndInline === 'true', band: { top: rect.top, bottom: rect.bottom } };
    });
    let row: Slot[] = [];
    const close = () => {
        const band = { top: Math.min(...row.map((s) => s.rect.top)), bottom: Math.max(...row.map((s) => s.rect.bottom)) };
        for (const s of row) if (s.inline) s.band = band;
        row = [];
    };
    for (const s of slots) {
        if (row.length && s.rect.top >= Math.max(...row.map((r) => r.rect.bottom)) - 2) close();
        row.push(s);
    }
    if (row.length) close();
    return slots;
}

function measure(root: HTMLElement): Measured {
    const origin = root.getBoundingClientRect();
    const zone = (name: string) => root.querySelector<HTMLElement>(`[data-dnd-zone="${name}"]`);
    const tabZone = zone('tab');
    const newSection = zone('new-section');
    const badgesZone = zone('badges');
    const sectionEls = tabZone ? Array.from(tabZone.querySelectorAll<HTMLElement>('[data-dnd-kind="section"]')) : [];
    const sections = slotsOf(sectionEls, origin).map((slot, i) => ({
        ...slot,
        blocks: slotsOf(Array.from(sectionEls[i].querySelectorAll<HTMLElement>('[data-dnd-kind="block"]')), origin),
    }));
    return {
        tab: tabZone?.dataset.dndTab ?? null,
        newSection: newSection ? relBox(newSection.getBoundingClientRect(), origin) : null,
        badgesZone: badgesZone ? relBox(badgesZone.getBoundingClientRect(), origin) : null,
        sections,
        badges: slotsOf(badgesZone ? Array.from(badgesZone.querySelectorAll<HTMLElement>('[data-dnd-kind="badge"]')) : [], origin),
    };
}

/** The pointer is past an item's middle (below it, or right of it within its row). */
const isPast = (s: Slot, p: Pt, h: number) =>
    p.y > s.band.bottom || (p.y >= s.band.top && (s.inline ? p.x > s.rect.left + s.rect.width / 2 + h : p.y > s.rect.top + s.rect.height / 2 + h));
const isBefore = (s: Slot, p: Pt, h: number) =>
    p.y < s.band.top || (p.y <= s.band.bottom && (s.inline ? p.x < s.rect.left + s.rect.width / 2 - h : p.y < s.rect.top + s.rect.height / 2 - h));

/**
 * The slot the dragged item should take in a list, or 'keep'. When the item is already in the list it only moves
 * once the pointer passes a neighbour's middle (plus a little), walking away from where it is. Passing an item moves
 * that item the other way, away from the pointer, so the slot never flips back and forth on a boundary.
 */
function slotIndex(slots: Slot[], dragId: string | null, p: Pt): number | 'keep' {
    const at = dragId ? slots.findIndex((s) => s.id === dragId) : -1;
    if (at < 0) {
        const i = slots.findIndex((s) => !isPast(s, p, 0));
        return i < 0 ? slots.length : i;
    }
    if (inside(slots[at].rect, p)) return 'keep';
    let to = at;
    for (let i = at + 1; i < slots.length && isPast(slots[i], p, HYSTERESIS_PX); i++) to = i;
    if (to === at) for (let i = at - 1; i >= 0 && isBefore(slots[i], p, HYSTERESIS_PX); i--) to = i;
    return to === at ? 'keep' : to;
}

// ─── FLIP ───────────────────────────────────────────────────────────────────────

const FLIP_SELECTOR = '[data-dnd-flip]';

function visualRects(root: HTMLElement): Map<string, DOMRect> {
    const rects = new Map<string, DOMRect>();
    root.querySelectorAll<HTMLElement>(FLIP_SELECTOR).forEach((el) => rects.set(el.dataset.dndFlip ?? '', el.getBoundingClientRect()));
    return rects;
}

function clearFlip(root: HTMLElement | null) {
    root?.querySelectorAll<HTMLElement>(FLIP_SELECTOR).forEach((el) => {
        el.style.transform = '';
        el.style.transition = '';
        el.style.opacity = '';
    });
}

/**
 * Runs once React has put the new layout in the DOM, before it paints: measures the new layout, then starts every
 * item where it was on screen and slides it to its new place. A block inside a section that moved only animates the
 * part of the move that is its own.
 */
function flipAndMeasure(root: HTMLElement, before: Map<string, DOMRect> | null): Measured {
    const els = Array.from(root.querySelectorAll<HTMLElement>(FLIP_SELECTOR));
    for (const el of els) {
        el.style.transition = 'none';
        el.style.transform = '';
    }
    const now = els.map((el) => el.getBoundingClientRect());
    const measured = measure(root);
    if (!before) return measured;

    const shift = new Map<HTMLElement, Pt>();
    const moved: HTMLElement[] = [];
    const entered = new Set<HTMLElement>();
    els.forEach((el, i) => {
        const parent = el.parentElement?.closest<HTMLElement>(FLIP_SELECTOR) ?? null;
        const base = (parent && shift.get(parent)) || { x: 0, y: 0 };
        const was = before.get(el.dataset.dndFlip ?? '');
        if (!was) {
            shift.set(el, base);
            if (!parent || !entered.has(parent)) entered.add(el);
            return;
        }
        const d = { x: was.left - now[i].left, y: was.top - now[i].top };
        shift.set(el, d);
        const x = d.x - base.x;
        const y = d.y - base.y;
        if (Math.abs(x) < 0.5 && Math.abs(y) < 0.5) return;
        el.style.transform = `translate3d(${x}px, ${y}px, 0)`;
        moved.push(el);
    });
    entered.forEach((el) => (el.style.opacity = '0'));
    void root.offsetHeight; // commit the start positions before the transitions begin
    for (const el of moved) {
        el.style.transition = `transform ${SHIFT_MS}ms ${EASE}`;
        el.style.transform = '';
    }
    entered.forEach((el) => {
        el.style.transition = `opacity ${SHIFT_MS}ms ease`;
        el.style.opacity = '';
    });
    return measured;
}

// ─── The lifted copy ────────────────────────────────────────────────────────────

function makeGhost(el: HTMLElement, rect: DOMRect, grab: Pt, kind: string | undefined): HTMLElement {
    const ghost = document.createElement('div');
    const copy = el.cloneNode(true) as HTMLElement;
    for (const node of [copy, ...Array.from(copy.querySelectorAll<HTMLElement>('*'))]) {
        for (const attr of Array.from(node.attributes)) if (attr.name.startsWith('data-dnd') || attr.name === 'data-layout-selected' || attr.name === 'id') node.removeAttribute(attr.name);
    }
    Object.assign(copy.style, { margin: '0', width: '100%', height: '100%', boxSizing: 'border-box', transform: 'none', opacity: '1', boxShadow: 'none' });
    const radius = getComputedStyle(el).borderRadius;
    Object.assign(ghost.style, {
        position: 'fixed',
        left: '0',
        top: '0',
        width: `${rect.width}px`,
        height: `${rect.height}px`,
        zIndex: '2000',
        pointerEvents: 'none',
        borderRadius: radius && radius !== '0px' ? radius : '8px',
        backgroundColor: kind === 'badge' ? 'transparent' : 'var(--mui-palette-background-paper)',
        boxShadow: LIFT_SHADOW,
        transformOrigin: `${grab.x}px ${grab.y}px`,
        willChange: 'transform',
        transition: 'box-shadow 150ms ease',
        overflow: 'hidden',
    });
    ghost.setAttribute('aria-hidden', 'true');
    ghost.appendChild(copy);
    document.body.appendChild(ghost);
    return ghost;
}

// ─── Engine ─────────────────────────────────────────────────────────────────────

/** Pointer travel needed between two slot changes (lets the slide start before the slot can change again). */
const RETARGET_PX = 6;

interface Session {
    pointerId: number;
    source: DragSource;
    sourceEl: HTMLElement;
    fromCanvas: boolean;
    startX: number;
    startY: number;
    lastX: number;
    lastY: number;
    engaged: boolean;
    settling: boolean;
    /** Waiting for React to render the last slot change (the measurements are stale until then). */
    rendering: boolean;
    grab: Pt;
    ghost: HTMLElement | null;
    plan: DropPlan | null;
    target: DropTarget | null;
    /** Where a drawer item started (dropping it there again changes nothing). */
    home: DropTarget | null;
    result: DropResult | null;
    /** Id of the dragged item in the rendered layout (the gap), or null while a new item has nowhere to go. */
    itemId: string | null;
    homeId: string | null;
    createdSectionId: string | null;
    measured: Measured | null;
    lastChange: Pt | null;
    scroller: HTMLElement | null;
    body: { userSelect: string; cursor: string } | null;
    sourceOpacity: string;
    /** The drawer ignores the pointer while dragging (no hover flicker under the lifted item); restored after. */
    rootPointerEvents: string | null;
    /** Runs after the next render (used to glide back home once the layout is restored). */
    afterRender: (() => void) | null;
}

/** Puts back what a drag changed outside React: page styles, the drawer's pointer, the palette item. */
function restore(s: Session, root: HTMLElement | null) {
    if (s.body) unlockBody(s.body);
    if (root && s.rootPointerEvents !== null) root.style.pointerEvents = s.rootPointerEvents;
    if (!s.fromCanvas) s.sourceEl.style.opacity = s.sourceOpacity;
}

export interface LayoutDragView {
    source: DragSource | null;
    itemId: string | null;
    target: DropTarget | null;
    /** The layout as it will be after the drop (null: the layout as it is). */
    preview: DrawerLayoutDocument | null;
}

const IDLE: LayoutDragView = { source: null, itemId: null, target: null, preview: null };

const LayoutDragContext = createContext<LayoutDragView & { attachRoot: (el: HTMLElement | null) => void }>({ ...IDLE, attachRoot: () => undefined });

/** What the canvas needs while dragging: the layout to show, the item to show as a gap, and its root ref. */
export const useLayoutDrag = () => useContext(LayoutDragContext);

function homeTarget(doc: DrawerLayoutDocument, source: DragSource): DropTarget | null {
    if (source.source === 'canvas-block') {
        const at = findBlock(doc, source.blockId);
        return at ? { kind: 'block', sectionId: at.section.id, index: at.index } : null;
    }
    if (source.source === 'canvas-section') {
        const at = findSection(doc, source.sectionId);
        return at ? { kind: 'section', tab: at.tab, index: at.index } : null;
    }
    if (source.source === 'canvas-badge') {
        const at = findBadge(doc, source.badgeId);
        return at ? { kind: 'badge', index: at.index } : null;
    }
    return null;
}

export function LayoutDrag({
    doc,
    disabled,
    prepare,
    onCommit,
    onReject,
    children,
}: {
    doc: DrawerLayoutDocument;
    disabled?: boolean;
    /** Called when a drag starts. */
    prepare: (source: DragSource) => DropPlan;
    onCommit: (result: Extract<DropResult, { recipe: unknown }>) => void;
    /** A drop that isn't allowed (a limit is reached). */
    onReject: (message: string) => void;
    children: React.ReactNode;
}) {
    const [view, setView] = useState<LayoutDragView>(IDLE);
    const root = useRef<HTMLElement | null>(null);
    const attachRoot = useCallback((el: HTMLElement | null) => {
        root.current = el;
    }, []);
    const session = useRef<Session | null>(null);
    const flipFrom = useRef<Map<string, DOMRect> | null>(null);
    const ghostToRemove = useRef<HTMLElement | null>(null);
    const detachRef = useRef<(() => void) | null>(null);
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const scrollFrame = useRef<number | null>(null);
    const latest = useRef({ doc, disabled, prepare, onCommit, onReject });
    useEffect(() => {
        latest.current = { doc, disabled, prepare, onCommit, onReject };
    });

    // After every render of a drag: slide the items to their new places and measure the new slots.
    useLayoutEffect(() => {
        const el = root.current;
        const before = flipFrom.current;
        flipFrom.current = null;
        if (view.source === null) {
            // The drop is in the layout now (or the drag was cancelled): the copy and the slide styles can go.
            ghostToRemove.current?.remove();
            ghostToRemove.current = null;
            clearFlip(el);
            return;
        }
        const measured = el ? flipAndMeasure(el, before) : null;
        const s = session.current;
        if (s?.engaged) {
            s.measured = measured;
            s.rendering = false;
            const after = s.afterRender;
            s.afterRender = null;
            after?.();
        }
    }, [view]);

    const stopAutoScroll = () => {
        if (scrollFrame.current != null) cancelAnimationFrame(scrollFrame.current);
        scrollFrame.current = null;
    };

    // Unmounting mid-drag: drop listeners, timers, the lifted copy and the page styles.
    useEffect(
        () => () => {
            detachRef.current?.();
            if (timerRef.current) clearTimeout(timerRef.current);
            if (scrollFrame.current != null) cancelAnimationFrame(scrollFrame.current);
            const s = session.current;
            s?.ghost?.remove();
            ghostToRemove.current?.remove();
            if (s?.engaged) restore(s, root.current);
        },
        [],
    );

    const placeGhost = (s: Session, x: number, y: number, scale: number) => {
        if (s.ghost) s.ghost.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${scale})`;
    };

    const retarget = (s: Session, target: DropTarget | null, p: Pt) => {
        if (JSON.stringify(target) === JSON.stringify(s.target)) return;
        const result = target && s.plan ? s.plan(target) : null;
        const ok = result && !('error' in result) ? result : null;
        s.target = target;
        s.result = result;
        s.itemId = ok ? ok.itemId : s.homeId;
        s.createdSectionId = ok?.createdSectionId ?? null;
        s.lastChange = p;
        const el = root.current;
        if (el) flipFrom.current = visualRects(el);
        s.rendering = true;
        setView({ source: s.source, itemId: s.itemId, target, preview: ok ? produce(latest.current.doc, ok.recipe) : null });
    };

    /** The slot under the pointer for this drag, 'keep' for no change, or null for nowhere (a palette item off the drawer). */
    const targetAt = (s: Session, m: Measured, p: Pt, overDrawer: boolean): DropTarget | null | 'keep' => {
        const src = s.source;
        if (!s.fromCanvas && !overDrawer) return null;
        if (src.source === 'canvas-badge' || (src.source === 'field' && m.badgesZone && inside(m.badgesZone, p, 6))) {
            const index = slotIndex(m.badges, s.itemId, p);
            return index === 'keep' ? 'keep' : { kind: 'badge', index };
        }
        if (!m.tab) return s.fromCanvas ? 'keep' : null;
        if (isSectionSource(src)) {
            const index = slotIndex(m.sections, s.itemId, p);
            return index === 'keep' ? 'keep' : { kind: 'section', tab: m.tab, index };
        }
        const section = m.sections.find((sec) => p.y >= sec.rect.top && p.y <= sec.rect.bottom);
        if (section) {
            // The section a "new section" drop would add is the item's own: stay put while over it.
            if (section.id === s.createdSectionId) return 'keep';
            const index = slotIndex(section.blocks, s.itemId, p);
            return index === 'keep' ? 'keep' : { kind: 'block', sectionId: section.id, index };
        }
        if (m.newSection && inside(m.newSection, p)) {
            return { kind: 'newSection', tab: m.tab, index: latest.current.doc.tabs[m.tab]?.length ?? 0 };
        }
        return 'keep';
    };

    /** Moves the lifted copy with the pointer, and changes the slot when the pointer has moved far enough. */
    const follow = (s: Session) => {
        placeGhost(s, s.lastX - s.grab.x, s.lastY - s.grab.y, LIFT_SCALE);
        const el = root.current;
        if (!el || !s.measured || s.rendering || s.settling) return;
        const r = el.getBoundingClientRect();
        const p = { x: s.lastX - r.left, y: s.lastY - r.top };
        if (s.lastChange && Math.hypot(p.x - s.lastChange.x, p.y - s.lastChange.y) < RETARGET_PX) return;
        const overDrawer = s.lastX >= r.left && s.lastX <= r.right && s.lastY >= r.top && s.lastY <= r.bottom;
        const next = targetAt(s, s.measured, p, overDrawer);
        if (next !== 'keep') retarget(s, next, p);
    };

    const autoScrollLoop = () => {
        const s = session.current;
        if (!s?.engaged || s.settling || !s.scroller) {
            scrollFrame.current = null;
            return;
        }
        const speed = autoScrollSpeed(s.scroller, s.lastY);
        if (speed !== 0) {
            const before = s.scroller.scrollTop;
            s.scroller.scrollTop = before + speed;
            if (s.scroller.scrollTop !== before) follow(s);
        }
        scrollFrame.current = requestAnimationFrame(autoScrollLoop);
    };

    const engage = (s: Session) => {
        const rect = s.sourceEl.getBoundingClientRect();
        s.grab = { x: s.startX - rect.left, y: s.startY - rect.top };
        s.plan = latest.current.prepare(s.source);
        s.homeId = canvasItemId(s.source);
        s.itemId = s.homeId;
        s.home = s.fromCanvas ? homeTarget(latest.current.doc, s.source) : null;
        s.target = s.home;
        s.engaged = true;
        s.ghost = makeGhost(s.sourceEl, rect, s.grab, s.sourceEl.dataset.dndKind);
        placeGhost(s, rect.left, rect.top, LIFT_SCALE);
        s.scroller = findScroller(root.current ?? s.sourceEl);
        s.body = lockBody();
        if (root.current) {
            s.rootPointerEvents = root.current.style.pointerEvents;
            root.current.style.pointerEvents = 'none';
        }
        if (!s.fromCanvas) {
            s.sourceOpacity = s.sourceEl.style.opacity;
            s.sourceEl.style.opacity = '0.45';
        }
        s.rendering = true;
        setView({ source: s.source, itemId: s.itemId, target: s.target, preview: null });
        scrollFrame.current = requestAnimationFrame(autoScrollLoop);
    };

    /** Glides the lifted copy onto a box (in page coordinates), fading it if it isn't what lands there. */
    const glide = (s: Session, to: { left: number; top: number }, fade: boolean) => {
        const ghost = s.ghost;
        if (!ghost) return;
        ghost.style.transition = `transform ${SETTLE_MS}ms ${EASE}, box-shadow ${SETTLE_MS}ms ease, opacity ${SETTLE_MS}ms ease`;
        placeGhost(s, to.left, to.top, 1);
        ghost.style.boxShadow = SETTLED_SHADOW;
        if (fade) ghost.style.opacity = '0';
    };

    /** Where an item of the rendered layout sits on the page once it stops sliding. */
    const slotOnPage = (s: Session, id: string | null): { left: number; top: number } | null => {
        const el = root.current;
        const m = s.measured;
        if (!el || !m || !id) return null;
        const slot = [...m.sections, ...m.sections.flatMap((sec) => sec.blocks), ...m.badges].find((x) => x.id === id);
        if (!slot) return null;
        const r = el.getBoundingClientRect();
        return { left: r.left + slot.rect.left, top: r.top + slot.rect.top };
    };

    const end = (s: Session, apply: () => void) => {
        timerRef.current = setTimeout(() => {
            timerRef.current = null;
            restore(s, root.current);
            ghostToRemove.current = s.ghost;
            session.current = null;
            setView(IDLE);
            apply();
        }, SHIFT_MS);
    };

    const finish = (commit: boolean) => {
        const s = session.current;
        detachRef.current?.();
        stopAutoScroll();
        if (!s?.engaged) {
            session.current = null;
            return;
        }
        s.settling = true;

        // The release must not also "click" whatever is under the pointer.
        const swallow = (e: MouseEvent) => {
            e.stopPropagation();
            e.preventDefault();
        };
        window.addEventListener('click', swallow, { capture: true, once: true });
        setTimeout(() => window.removeEventListener('click', swallow, { capture: true }), 0);

        const result = commit ? s.result : null;
        if (result && 'error' in result) latest.current.onReject(result.error);
        const ok = result && !('error' in result) ? result : null;
        if (ok) {
            // Put back where it was: no edit (and no empty undo step).
            const moved = !s.fromCanvas || JSON.stringify(s.target) !== JSON.stringify(s.home);
            // Glide into the slot (a palette item fades as it lands: the real block is already showing there).
            const land = () => {
                const landing = slotOnPage(s, ok.itemId);
                if (landing) glide(s, landing, !s.fromCanvas);
                else if (s.ghost) s.ghost.style.opacity = '0';
                end(s, moved ? () => latest.current.onCommit(ok) : () => undefined);
            };
            if (s.rendering) s.afterRender = land;
            else land();
            return;
        }

        // Back where it came from: the drawer as it was (into the item's own gap), or the palette.
        s.itemId = s.homeId;
        s.afterRender = () => {
            const home = s.fromCanvas ? slotOnPage(s, s.homeId) : null;
            const rect = home ?? (s.sourceEl.isConnected ? s.sourceEl.getBoundingClientRect() : null);
            if (rect) glide(s, rect, !s.fromCanvas);
            else if (s.ghost) s.ghost.style.opacity = '0';
            end(s, () => undefined);
        };
        const el = root.current;
        if (el) flipFrom.current = visualRects(el);
        setView({ source: s.source, itemId: s.homeId, target: null, preview: null });
    };

    const start = (source: DragSource, sourceEl: HTMLElement, e: React.PointerEvent) => {
        const s: Session = {
            pointerId: e.pointerId,
            source,
            sourceEl,
            fromCanvas: isCanvasSource(source),
            startX: e.clientX,
            startY: e.clientY,
            lastX: e.clientX,
            lastY: e.clientY,
            engaged: false,
            settling: false,
            rendering: false,
            grab: { x: 0, y: 0 },
            ghost: null,
            plan: null,
            target: null,
            home: null,
            result: null,
            itemId: null,
            homeId: null,
            createdSectionId: null,
            measured: null,
            lastChange: null,
            scroller: null,
            body: null,
            sourceOpacity: '',
            rootPointerEvents: null,
            afterRender: null,
        };
        session.current = s;

        const onMove = (ev: PointerEvent) => {
            if (ev.pointerId !== s.pointerId) return;
            s.lastX = ev.clientX;
            s.lastY = ev.clientY;
            if (!s.engaged) {
                if (Math.hypot(ev.clientX - s.startX, ev.clientY - s.startY) < DRAG_THRESHOLD_PX) return;
                engage(s);
            }
            ev.preventDefault();
            follow(s);
        };
        const onUp = (ev: PointerEvent) => ev.pointerId === s.pointerId && finish(true);
        const onCancel = (ev: PointerEvent) => ev.pointerId === s.pointerId && finish(false);
        const onKey = (ev: KeyboardEvent) => {
            if (ev.key !== 'Escape') return;
            if (s.engaged) ev.preventDefault();
            finish(false);
        };
        const onScroll = () => {
            if (s.engaged) follow(s);
        };
        window.addEventListener('pointermove', onMove, { passive: false });
        window.addEventListener('pointerup', onUp);
        window.addEventListener('pointercancel', onCancel);
        window.addEventListener('keydown', onKey);
        // Capture: scrolls of inner containers don't bubble, but do reach a capturing window listener.
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

    const onPointerDown = (e: React.PointerEvent) => {
        if (latest.current.disabled || session.current || e.button !== 0 || !e.isPrimary) return;
        const target = e.target instanceof Element ? e.target : null;
        const item = target?.closest<HTMLElement>('[data-dnd-source]');
        if (!target || !item?.dataset.dndSource) return;
        // Buttons, inputs and links inside an item keep their own behaviour (its grip doesn't count).
        const interactive = target.closest(INTERACTIVE_SELECTOR);
        if (interactive && interactive !== item && item.contains(interactive) && !interactive.closest('[data-dnd-handle]')) return;
        // On touch screens only the grip drags, so a swipe over the drawer still scrolls.
        if (e.pointerType === 'touch') {
            const handle = target.closest('[data-dnd-handle]');
            if (!handle || handle.closest('[data-dnd-source]') !== item) return;
        }
        // A section drags by its title bar; presses on its fields area belong to the fields.
        if (item.dataset.dndKind === 'section') {
            const body = target.closest('[data-dnd-zone="section-body"]');
            if (body && item.contains(body)) return;
        }
        let source: DragSource;
        try {
            source = JSON.parse(item.dataset.dndSource) as DragSource;
        } catch {
            return;
        }
        start(source, item, e);
    };

    return (
        <LayoutDragContext.Provider value={{ ...view, attachRoot }}>
            <div onPointerDown={onPointerDown} style={{ display: 'contents' }}>
                {children}
            </div>
        </LayoutDragContext.Provider>
    );
}
