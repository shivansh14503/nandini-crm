'use client';

import React, { createContext, useCallback, useContext, useState } from 'react';
import {
    DndContext,
    DragOverlay,
    KeyboardSensor,
    MouseSensor,
    TouchSensor,
    useSensor,
    useSensors,
    type Active,
    type ClientRect,
    type CollisionDetection,
    type DragEndEvent,
    type DragMoveEvent,
    type DragStartEvent,
    type Over,
} from '@dnd-kit/core';
import { Box, Typography } from '@mui/material';
import type { DrawerLayoutDocument } from '@/lib/drawer-layout';
import { findBadge, findBlock, findSection } from './layoutEditor';

/**
 * Drag and drop for the Drawer Layout builder (same approach as the PDF builder): draggables carry a DragSource,
 * droppables a DropZone; the innermost compatible zone under the pointer wins and the pointer's side of it (above /
 * below, or left / right for badges and half-width fields) gives the insertion point, drawn as a line.
 */

export type DragSource =
    | { source: 'field'; key: string; label: string }
    | { source: 'block'; blockType: 'heading' | 'text' | 'divider' | 'address' | 'customFields'; prefix?: string; label: string }
    | { source: 'section'; columns: 1 | 2; label: string }
    | { source: 'piece'; pieceId: string; label: string }
    | { source: 'canvas-block'; blockId: string; label: string }
    | { source: 'canvas-section'; sectionId: string; label: string }
    | { source: 'canvas-badge'; badgeId: string; label: string };

export type DropZone =
    | { target: 'block'; blockId: string; sectionId: string; half: boolean }
    | { target: 'section-body'; sectionId: string }
    | { target: 'section'; sectionId: string }
    | { target: 'tab'; tab: string }
    | { target: 'badge'; badgeId: string }
    | { target: 'badges' };

export type DropTarget =
    | { kind: 'block'; sectionId: string; index: number }
    | { kind: 'section'; tab: string; index: number }
    | { kind: 'newSection'; tab: string; index: number }
    | { kind: 'badge'; index: number };

const isBlockDrag = (s: DragSource) => s.source === 'field' || s.source === 'block' || s.source === 'canvas-block';
const isSectionDrag = (s: DragSource) => s.source === 'section' || s.source === 'piece' || s.source === 'canvas-section';
const isBadgeDrag = (s: DragSource) => s.source === 'canvas-badge' || s.source === 'field';

function accepts(source: DragSource, zone: DropZone): boolean {
    switch (zone.target) {
        case 'badge':
        case 'badges':
            return isBadgeDrag(source);
        case 'block':
        case 'section-body':
            return isBlockDrag(source);
        case 'section':
            if (source.source === 'canvas-section' && source.sectionId === zone.sectionId) return false;
            return isBlockDrag(source) || isSectionDrag(source);
        case 'tab':
            return isBlockDrag(source) || isSectionDrag(source);
        default:
            return false;
    }
}

const DropTargetContext = createContext<DropTarget | null>(null);
const ActiveDragContext = createContext<DragSource | null>(null);
export const useDropTarget = () => useContext(DropTargetContext);
export const useActiveDrag = () => useContext(ActiveDragContext);

/** Innermost compatible droppable under the pointer. */
const collision: CollisionDetection = ({ active, droppableContainers, droppableRects, pointerCoordinates }) => {
    const source = active.data.current as DragSource | undefined;
    if (!source || !pointerCoordinates) return [];
    let best: { id: string | number; area: number } | null = null;
    for (const container of droppableContainers) {
        const zone = container.data.current as DropZone | undefined;
        const rect = droppableRects.get(container.id);
        if (!zone || !rect || !accepts(source, zone)) continue;
        const { x, y } = pointerCoordinates;
        if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) continue;
        const area = rect.width * rect.height;
        if (!best || area < best.area) best = { id: container.id, area };
    }
    return best ? [{ id: best.id, data: { droppableContainer: droppableContainers.find((c) => c.id === best.id), value: best.area } }] : [];
};

function pointer(active: Active, delta: { x: number; y: number }, activatorEvent: Event | null): { x: number; y: number } | null {
    if (activatorEvent && 'clientX' in activatorEvent) {
        const e = activatorEvent as MouseEvent;
        return { x: e.clientX + delta.x, y: e.clientY + delta.y };
    }
    const touch = activatorEvent && 'touches' in activatorEvent ? ((activatorEvent as TouchEvent).touches[0] ?? (activatorEvent as TouchEvent).changedTouches[0]) : undefined;
    if (touch) return { x: touch.clientX + delta.x, y: touch.clientY + delta.y };
    const r = active.rect.current.initial;
    return r ? { x: r.left + r.width / 2 + delta.x, y: r.top + r.height / 2 + delta.y } : null;
}

const after = (rect: ClientRect, p: { x: number; y: number }, horizontal: boolean) =>
    horizontal ? p.x > rect.left + rect.width / 2 : p.y > rect.top + rect.height / 2;

export function computeDropTarget(doc: DrawerLayoutDocument, over: Over | null, p: { x: number; y: number } | null, source: DragSource): DropTarget | null {
    if (!over || !p) return null;
    const zone = over.data.current as DropZone | undefined;
    if (!zone) return null;
    switch (zone.target) {
        case 'badge': {
            const at = findBadge(doc, zone.badgeId);
            return at ? { kind: 'badge', index: at.index + (after(over.rect, p, true) ? 1 : 0) } : null;
        }
        case 'badges':
            return { kind: 'badge', index: doc.header.badges.length };
        case 'block': {
            const at = findBlock(doc, zone.blockId);
            return at ? { kind: 'block', sectionId: at.section.id, index: at.index + (after(over.rect, p, zone.half) ? 1 : 0) } : null;
        }
        case 'section-body': {
            const at = findSection(doc, zone.sectionId);
            return at ? { kind: 'block', sectionId: at.section.id, index: at.section.blocks.length } : null;
        }
        case 'section': {
            const at = findSection(doc, zone.sectionId);
            if (!at) return null;
            // A field dropped on a section's title bar joins the section; sections go above / below it.
            if (isBlockDrag(source)) return { kind: 'block', sectionId: at.section.id, index: at.section.blocks.length };
            return { kind: 'section', tab: at.tab, index: at.index + (after(over.rect, p, false) ? 1 : 0) };
        }
        case 'tab': {
            const count = doc.tabs[zone.tab]?.length ?? 0;
            return { kind: isBlockDrag(source) ? 'newSection' : 'section', tab: zone.tab, index: count };
        }
        default:
            return null;
    }
}

export function LayoutDnd({
    doc,
    disabled,
    onDrop,
    children,
}: {
    doc: DrawerLayoutDocument;
    disabled?: boolean;
    onDrop: (source: DragSource, target: DropTarget) => void;
    children: React.ReactNode;
}) {
    const [active, setActive] = useState<DragSource | null>(null);
    const [target, setTarget] = useState<DropTarget | null>(null);
    // Mouse drags start after a few pixels; on touch screens a short press starts a drag so a swipe still scrolls.
    const sensors = useSensors(
        useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
        useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }),
        useSensor(KeyboardSensor),
    );

    const onDragStart = (e: DragStartEvent) => {
        setActive((e.active.data.current as DragSource) ?? null);
        setTarget(null);
    };
    const onDragMove = useCallback(
        (e: DragMoveEvent) => {
            const source = e.active.data.current as DragSource | undefined;
            if (!source) return;
            const next = computeDropTarget(doc, e.over, pointer(e.active, e.delta, e.activatorEvent), source);
            setTarget((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
        },
        [doc],
    );
    const finish = () => {
        setActive(null);
        setTarget(null);
    };
    const onDragEnd = (e: DragEndEvent) => {
        const source = e.active.data.current as DragSource | undefined;
        const drop = source ? computeDropTarget(doc, e.over, pointer(e.active, e.delta, e.activatorEvent), source) : null;
        finish();
        if (source && drop && !disabled) onDrop(source, drop);
    };

    return (
        <DndContext sensors={sensors} collisionDetection={collision} onDragStart={onDragStart} onDragMove={onDragMove} onDragEnd={onDragEnd} onDragCancel={finish}>
            <ActiveDragContext.Provider value={active}>
                <DropTargetContext.Provider value={target}>{children}</DropTargetContext.Provider>
            </ActiveDragContext.Provider>
            <DragOverlay dropAnimation={null}>
                {active && (
                    <Box
                        sx={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            px: 1.25,
                            py: 0.6,
                            borderRadius: '8px',
                            background: 'linear-gradient(135deg, var(--crm-fill-blue-700) 0%, var(--crm-fill-blue-600) 100%)',
                            color: '#ffffff',
                            boxShadow: '0 6px 18px rgb(var(--crm-accent-rgb) / 0.3)',
                            pointerEvents: 'none',
                        }}
                    >
                        <Typography sx={{ fontSize: '0.78rem', fontWeight: 700, whiteSpace: 'nowrap' }}>{active.label}</Typography>
                    </Box>
                )}
            </DragOverlay>
        </DndContext>
    );
}

/** The blue / green insertion line. */
export function DropLine({ vertical, sx }: { vertical?: boolean; sx?: object }) {
    return (
        <Box
            aria-hidden
            sx={{
                position: 'absolute',
                zIndex: 3,
                pointerEvents: 'none',
                borderRadius: '2px',
                backgroundColor: 'var(--crm-fill-blue-600)',
                boxShadow: '0 0 0 2px rgb(var(--crm-accent-rgb) / 0.22)',
                ...(vertical ? { top: 0, bottom: 0, width: 3, left: -5 } : { left: 0, right: 0, height: 3, top: -7 }),
                ...sx,
            }}
        />
    );
}
