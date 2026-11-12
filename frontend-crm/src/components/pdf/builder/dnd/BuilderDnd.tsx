'use client';

import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import {
    DndContext,
    DragOverlay,
    PointerSensor,
    KeyboardSensor,
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
import { BLOCK_LABELS, cloneBlock, cloneSection, createBlock, createSection, type Band, type Block, type BlockFactoryInput, type BlockType, type Section } from '@/lib/pdf-document';
import type { PdfSavedItem } from '@/types/pdfTemplate.types';
import { BLOCK_ICONS } from '../blockMeta';
import { PREBUILT_LAYOUTS } from '../layouts';
import { BAND_LABELS, blockAllowedIn, findBlock, findColumn, findSection, insertBlock, insertSection, moveBlock, moveSection } from '../state/docOps';
import { useBuilder, useBuilderEnv } from '../state/builderState';

/**
 * Drag and drop for the builder. Draggables carry a `DragSource`; droppables a `DropZone`. Block-like drags
 * (palette blocks, saved blocks, canvas blocks) target blocks / columns / bands; section-like drags target
 * sections / bands. The insertion point comes from the pointer: above or below the middle of the hovered item.
 */

export type DragSource =
    | { source: 'palette-block'; blockType: BlockType }
    | { source: 'palette-section'; widths: number[]; label: string }
    | { source: 'layout'; layoutKey: string; label: string }
    | { source: 'saved'; item: PdfSavedItem }
    | { source: 'canvas-section'; sectionId: string; label: string }
    | { source: 'canvas-block'; blockId: string; blockType: BlockType };

export type DropZone = { target: 'block'; blockId: string; columnId: string } | { target: 'column'; columnId: string } | { target: 'section'; sectionId: string; band: Band } | { target: 'band'; band: Band };

/** Where the current drag would land (drawn as an insertion line). */
export type DropTarget = { kind: 'block'; columnId: string; index: number } | { kind: 'section'; band: Band; index: number } | { kind: 'newSection'; band: Band; index: number };

const isBlockDrag = (s: DragSource): boolean =>
    s.source === 'palette-block' || s.source === 'canvas-block' || (s.source === 'saved' && s.item.content.kind === 'block');

function dragLabel(s: DragSource): { label: string; icon: React.ReactNode } {
    switch (s.source) {
        case 'palette-block':
        case 'canvas-block': {
            const Icon = BLOCK_ICONS[s.blockType];
            return { label: BLOCK_LABELS[s.blockType], icon: <Icon sx={{ fontSize: 16 }} /> };
        }
        case 'saved':
            return { label: s.item.name, icon: null };
        default:
            return { label: s.label, icon: null };
    }
}

const DropTargetContext = createContext<DropTarget | null>(null);
const DraggingContext = createContext<DragSource | null>(null);

export const useDropTarget = () => useContext(DropTargetContext);
export const useActiveDrag = () => useContext(DraggingContext);

/** Innermost compatible droppable under the pointer. */
const collision: CollisionDetection = ({ active, droppableContainers, droppableRects, pointerCoordinates }) => {
    const source = active.data.current as DragSource | undefined;
    if (!source || !pointerCoordinates) return [];
    const blockDrag = isBlockDrag(source);
    let best: { id: string | number; area: number } | null = null;
    for (const container of droppableContainers) {
        const zone = container.data.current as DropZone | undefined;
        const rect = droppableRects.get(container.id);
        if (!zone || !rect) continue;
        const accepts = blockDrag ? zone.target !== 'section' : zone.target === 'section' || zone.target === 'band';
        if (!accepts) continue;
        if (source.source === 'canvas-section' && zone.target === 'section' && zone.sectionId === source.sectionId) continue;
        const { x, y } = pointerCoordinates;
        if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) continue;
        const area = rect.width * rect.height;
        if (!best || area < best.area) best = { id: container.id, area };
    }
    return best ? [{ id: best.id, data: { droppableContainer: droppableContainers.find((c) => c.id === best.id), value: best.area } }] : [];
};

function pointerY(active: Active, delta: { y: number }, activatorEvent: Event | null): number | null {
    const start = activatorEvent && 'clientY' in activatorEvent ? (activatorEvent as PointerEvent).clientY : active.rect.current.initial ? active.rect.current.initial.top : null;
    return start === null ? null : start + delta.y;
}

const below = (rect: ClientRect, y: number) => y > rect.top + rect.height / 2;

export function BuilderDnd({ children }: { children: React.ReactNode }) {
    const { doc, edit } = useBuilder();
    const { registry, notify, readOnly } = useBuilderEnv();
    const factory: BlockFactoryInput = useMemo(() => ({ lineItemColumns: registry.lineItemColumns }), [registry]);
    const [active, setActive] = useState<DragSource | null>(null);
    const [target, setTarget] = useState<DropTarget | null>(null);

    const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor));

    const computeTarget = useCallback(
        (over: Over | null, y: number | null, source: DragSource): DropTarget | null => {
            if (!over || y === null) return null;
            const zone = over.data.current as DropZone | undefined;
            if (!zone) return null;
            const blockDrag = isBlockDrag(source);
            if (zone.target === 'block') {
                const at = findBlock(doc, zone.blockId);
                return at ? { kind: 'block', columnId: at.column.id, index: at.blockIndex + (below(over.rect, y) ? 1 : 0) } : null;
            }
            if (zone.target === 'column') {
                const at = findColumn(doc, zone.columnId);
                return at ? { kind: 'block', columnId: at.column.id, index: at.column.blocks.length } : null;
            }
            if (zone.target === 'section') {
                const at = findSection(doc, zone.sectionId);
                return at ? { kind: 'section', band: at.band, index: at.index + (below(over.rect, y) ? 1 : 0) } : null;
            }
            return { kind: blockDrag ? 'newSection' : 'section', band: zone.band, index: doc[zone.band].length };
        },
        [doc],
    );

    const onDragStart = (e: DragStartEvent) => {
        setActive((e.active.data.current as DragSource) ?? null);
        setTarget(null);
    };

    const onDragMove = (e: DragMoveEvent) => {
        const source = e.active.data.current as DragSource | undefined;
        if (!source) return;
        const next = computeTarget(e.over, pointerY(e.active, e.delta, e.activatorEvent), source);
        setTarget((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
    };

    const finish = () => {
        setActive(null);
        setTarget(null);
    };

    const onDragEnd = (e: DragEndEvent) => {
        const source = e.active.data.current as DragSource | undefined;
        const drop = source ? computeTarget(e.over, pointerY(e.active, e.delta, e.activatorEvent), source) : null;
        finish();
        if (!source || !drop || readOnly) return;

        // Block-like drags
        if (isBlockDrag(source)) {
            const band = drop.kind === 'block' ? findColumn(doc, drop.columnId)?.band : drop.band;
            const type: BlockType =
                source.source === 'palette-block' || source.source === 'canvas-block' ? source.blockType : source.source === 'saved' && source.item.content.kind === 'block' ? source.item.content.block.type : 'text';
            if (!band || !blockAllowedIn(type, band)) {
                notify(`${BLOCK_LABELS[type]} can't be placed in the ${band ? BAND_LABELS[band].toLowerCase() : 'page'}.`, 'warning');
                return;
            }
            if (source.source === 'canvas-block') {
                const from = findBlock(doc, source.blockId);
                if (!from) return;
                if (drop.kind === 'block') {
                    const index = from.column.id === drop.columnId && from.blockIndex < drop.index ? drop.index - 1 : drop.index;
                    if (from.column.id === drop.columnId && index === from.blockIndex) return;
                    edit((d) => void moveBlock(d, source.blockId, drop.columnId, index), { select: { kind: 'block', id: source.blockId } });
                } else {
                    edit(
                        (d) => {
                            const section = createSection([100]);
                            insertSection(d, drop.band, drop.index, section);
                            moveBlock(d, source.blockId, section.columns[0].id, 0);
                        },
                        { select: { kind: 'block', id: source.blockId } },
                    );
                }
                return;
            }
            const block: Block = source.source === 'saved' && source.item.content.kind === 'block' ? cloneBlock(source.item.content.block) : createBlock(type, factory);
            if (drop.kind === 'block') edit((d) => void insertBlock(d, drop.columnId, drop.index, block), { select: { kind: 'block', id: block.id } });
            else edit((d) => insertSection(d, drop.band, drop.index, createSection([100], [[block]])), { select: { kind: 'block', id: block.id } });
            return;
        }

        // Section-like drags
        if (drop.kind === 'block') return;
        const band = drop.band;
        if (source.source === 'canvas-section') {
            const from = findSection(doc, source.sectionId);
            if (!from) return;
            const blocked = from.section.columns.flatMap((c) => c.blocks).find((b) => !blockAllowedIn(b.type, band));
            if (blocked) {
                notify(`This section has a ${BLOCK_LABELS[blocked.type]} block, which can't be placed in the ${BAND_LABELS[band].toLowerCase()}.`, 'warning');
                return;
            }
            const index = from.band === band && from.index < drop.index ? drop.index - 1 : drop.index;
            if (from.band === band && index === from.index) return;
            edit((d) => moveSection(d, source.sectionId, band, index), { select: { kind: 'section', id: source.sectionId } });
            return;
        }
        let section: Section | null = null;
        if (source.source === 'palette-section') section = createSection(source.widths);
        else if (source.source === 'layout') section = PREBUILT_LAYOUTS.find((l) => l.key === source.layoutKey)?.build(factory) ?? null;
        else if (source.source === 'saved' && source.item.content.kind === 'section') section = cloneSection(source.item.content.section);
        if (!section) return;
        const blocked = section.columns.flatMap((c) => c.blocks).find((b) => !blockAllowedIn(b.type, band));
        if (blocked) {
            notify(`This section has a ${BLOCK_LABELS[blocked.type]} block, which can't be placed in the ${BAND_LABELS[band].toLowerCase()}.`, 'warning');
            return;
        }
        const inserted = section;
        edit((d) => insertSection(d, band, drop.index, inserted), { select: { kind: 'section', id: inserted.id } });
    };

    const overlay = active ? dragLabel(active) : null;

    return (
        <DndContext sensors={sensors} collisionDetection={collision} onDragStart={onDragStart} onDragMove={onDragMove} onDragEnd={onDragEnd} onDragCancel={finish}>
            <DraggingContext.Provider value={active}>
                <DropTargetContext.Provider value={target}>{children}</DropTargetContext.Provider>
            </DraggingContext.Provider>
            <DragOverlay dropAnimation={null}>
                {overlay && (
                    <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75, px: 1.25, py: 0.6, borderRadius: '8px', backgroundColor: '#1d4ed8', color: '#fff', boxShadow: '0 6px 18px rgba(15,23,42,0.25)', pointerEvents: 'none' }}>
                        {overlay.icon}
                        <Typography sx={{ fontSize: '0.78rem', fontWeight: 700, whiteSpace: 'nowrap' }}>{overlay.label}</Typography>
                    </Box>
                )}
            </DragOverlay>
        </DndContext>
    );
}
