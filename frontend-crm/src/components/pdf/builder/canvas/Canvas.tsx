'use client';

import React, { memo, useCallback, useRef, useState } from 'react';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import { Box, Tooltip, Typography } from '@mui/material';
import VisibilityOffOutlinedIcon from '@mui/icons-material/VisibilityOffOutlined';
import {
    BLOCK_LABELS,
    PAGE_DIMENSIONS_MM,
    bandBaseCss,
    blockCss,
    columnCss,
    renderBlockContent,
    sectionCss,
    type Band,
    type Block,
    type Column,
    type PdfDocument,
    type Section,
    type Theme,
} from '@/lib/pdf-document';
import { blockName } from '../blockMeta';
import { useActiveDrag, useDropTarget, type DragSource, type DropZone } from '../dnd/BuilderDnd';
import { useBuilder, useBuilderEnv } from '../state/builderState';
import { BAND_LABELS, duplicateBlock, duplicateSection, findBlock, nudge, removeBlock, removeColumn, removeSection, resizeColumnPair } from '../state/docOps';
import { InlineTextEditor } from '../richtext/InlineTextEditor';
import { cssToStyle, useMergedRef } from './cssToStyle';
import { ElementTag, ElementToolbar } from './ElementToolbar';

/**
 * The live page: header / body / footer bands of sections → columns → blocks, each block drawn with the same
 * renderer the PDF uses (editor mode: empty values show as placeholders). Click selects, drag moves, the bars
 * between columns resize them.
 */

const ACCENT = '#2563eb';
const UI_FONT = 'Inter, "Segoe UI", Arial, sans-serif';

const InsertBar = ({ position = 'top' }: { position?: 'top' | 'static' }) => (
    <Box
        aria-hidden
        sx={
            position === 'top'
                ? { position: 'absolute', left: 0, right: 0, top: -2.5, height: 4, borderRadius: 2, backgroundColor: ACCENT, zIndex: 25, pointerEvents: 'none' }
                : { height: 4, borderRadius: 2, backgroundColor: ACCENT, my: 0.25, pointerEvents: 'none' }
        }
    />
);

// ─── Block ──────────────────────────────────────────────────────────────────────

const BlockView = memo(function BlockView({ block, column, index, band, theme }: { block: Block; column: Column; index: number; band: Band; theme: Theme }) {
    const { selection, select, edit, editingBlockId, setEditingBlock } = useBuilder();
    const { context, renderOptions, readOnly, saveToLibrary, notify } = useBuilderEnv();
    const target = useDropTarget();
    const selected = selection?.kind === 'block' && selection.id === block.id;
    const editing = editingBlockId === block.id && (block.type === 'title' || block.type === 'text') && !readOnly;
    const [editingLabel, setEditingLabel] = useState(false);

    const { attributes, listeners, setNodeRef: setDragRef, isDragging } = useDraggable({
        id: `block:${block.id}`,
        data: { source: 'canvas-block', blockId: block.id, blockType: block.type } satisfies DragSource,
        disabled: readOnly || editing || editingLabel,
    });

    /**
     * Line-items column headings and totals row labels are edited in place: the cell becomes editable, Enter / click
     * away saves, Esc cancels. Item values come from each quotation, so they can't be edited here.
     */
    const editTableLabel = (eventTarget: HTMLElement) => {
        if (block.type !== 'lineItems' && block.type !== 'totals') return false;
        const cell = eventTarget.closest<HTMLElement>('th[data-col], th[data-total]');
        if (!cell) {
            if (eventTarget.closest('td')) {
                notify(
                    block.type === 'lineItems'
                        ? 'Item values come from each quotation, so they are edited on the quotation. Here you can rename, show, hide, resize and align columns (double-click a heading to rename it).'
                        : 'Amounts come from each quotation. Double-click a label (e.g. “Grand Total”) to rename it.',
                    'info',
                );
            }
            return true;
        }
        const colKey = cell.dataset.col;
        const totalKey = cell.dataset.total;
        const original = cell.textContent ?? '';
        setEditingLabel(true);
        cell.contentEditable = 'true';
        cell.style.outline = `2px solid ${ACCENT}`;
        cell.style.cursor = 'text';
        cell.focus();
        const range = document.createRange();
        range.selectNodeContents(cell);
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(range);

        const finish = (save: boolean) => {
            cell.removeEventListener('keydown', onKey);
            cell.removeEventListener('blur', onBlur);
            cell.contentEditable = 'false';
            cell.style.outline = '';
            cell.style.cursor = '';
            setEditingLabel(false);
            const text = (cell.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 60);
            if (!save || text === original.trim()) {
                cell.textContent = original;
                return;
            }
            edit((d) => {
                const at = findBlock(d, block.id);
                if (at?.block.type === 'lineItems' && colKey) {
                    const col = at.block.props.columns.find((c) => c.key === colKey);
                    if (col) col.label = text;
                } else if (at?.block.type === 'totals' && totalKey) {
                    const row = at.block.props.rows.find((r) => r.key === totalKey);
                    if (row) row.label = text;
                }
            });
        };
        const onKey = (ev: KeyboardEvent) => {
            ev.stopPropagation();
            if (ev.key === 'Enter') {
                ev.preventDefault();
                finish(true);
                cell.blur();
            } else if (ev.key === 'Escape') {
                ev.preventDefault();
                finish(false);
                cell.blur();
            }
        };
        const onBlur = () => finish(true);
        cell.addEventListener('keydown', onKey);
        cell.addEventListener('blur', onBlur);
        return true;
    };
    const { setNodeRef: setDropRef } = useDroppable({ id: `drop-block:${block.id}`, data: { target: 'block', blockId: block.id, columnId: column.id } satisfies DropZone });
    const nodeRef = useMergedRef(setDragRef, setDropRef);

    const { html, empty } = renderBlockContent(block, context, theme, renderOptions);
    const hiddenInPdf = empty && Boolean(block.hideIfEmpty);
    const showBar = target?.kind === 'block' && target.columnId === column.id && target.index === index;

    return (
        <Box
            ref={nodeRef}
            {...(editing || editingLabel ? {} : attributes)}
            {...(editing || editingLabel ? {} : listeners)}
            role="button"
            tabIndex={-1}
            aria-label={blockName(block)}
            aria-pressed={selected}
            data-block-id={block.id}
            onClick={(e) => {
                e.stopPropagation();
                select({ kind: 'block', id: block.id });
            }}
            onDoubleClick={(e) => {
                e.stopPropagation();
                if (readOnly) return;
                if (block.type === 'title' || block.type === 'text') setEditingBlock(block.id);
                else editTableLabel(e.target as HTMLElement);
            }}
            sx={{
                position: 'relative',
                cursor: readOnly ? 'pointer' : editing ? 'text' : 'grab',
                opacity: isDragging ? 0.35 : hiddenInPdf ? 0.55 : 1,
                outline: selected ? `2px solid ${ACCENT}` : 'none',
                outlineOffset: 1,
                '&:hover': selected ? {} : { outline: '1px dashed #60a5fa', outlineOffset: 1 },
            }}
        >
            {showBar && <InsertBar />}
            {selected && <ElementTag label={BLOCK_LABELS[block.type]} selected />}
            {selected && !readOnly && !editing && (
                <ElementToolbar
                    label={BLOCK_LABELS[block.type]}
                    handleListeners={listeners}
                    handleAttributes={attributes}
                    onUp={index > 0 ? () => edit((d) => nudge(d, { kind: 'block', id: block.id }, -1)) : undefined}
                    onDown={index < column.blocks.length - 1 ? () => edit((d) => nudge(d, { kind: 'block', id: block.id }, 1)) : undefined}
                    onDuplicate={() => {
                        let id: string | null = null;
                        edit((d) => {
                            id = duplicateBlock(d, block.id);
                        });
                        if (id) select({ kind: 'block', id });
                    }}
                    onSave={() => saveToLibrary({ kind: 'block', block }, blockName(block))}
                    onDelete={() => edit((d) => removeBlock(d, block.id), { select: null })}
                    placement={band === 'header' ? 'bottom' : 'top'}
                />
            )}
            {hiddenInPdf && (
                <Tooltip title="Empty for this record, so it's hidden in the PDF" arrow>
                    <VisibilityOffOutlinedIcon sx={{ position: 'absolute', top: 0, right: 0, fontSize: 12, color: '#94a3b8', zIndex: 5 }} />
                </Tooltip>
            )}
            {editing ? (
                <Box style={cssToStyle(blockCss(block, theme))}>
                    <InlineTextEditor block={block as Extract<Block, { type: 'title' | 'text' }>} theme={theme} />
                </Box>
            ) : (
                // The renderer escapes every value and builds styles only from validated numbers / enums / colours.
                <div style={cssToStyle(blockCss(block, theme))} dangerouslySetInnerHTML={{ __html: html }} />
            )}
        </Box>
    );
});

// ─── Column ─────────────────────────────────────────────────────────────────────

const ColumnView = memo(function ColumnView({ column, band, theme, onlyColumn }: { column: Column; band: Band; theme: Theme; onlyColumn: boolean }) {
    const { selection, select, edit } = useBuilder();
    const { readOnly } = useBuilderEnv();
    const target = useDropTarget();
    const active = useActiveDrag();
    const { setNodeRef, isOver } = useDroppable({ id: `drop-column:${column.id}`, data: { target: 'column', columnId: column.id } satisfies DropZone });
    const selected = selection?.kind === 'column' && selection.id === column.id;
    const endBar = target?.kind === 'block' && target.columnId === column.id && target.index === column.blocks.length;
    const style = cssToStyle(columnCss(column, theme));

    return (
        <td
            ref={setNodeRef}
            style={{ ...style, position: 'relative', outline: selected ? `2px solid ${ACCENT}` : isOver && active ? '1px dashed #60a5fa' : undefined, outlineOffset: -2 }}
            onClick={(e) => {
                e.stopPropagation();
                select({ kind: 'column', id: column.id });
            }}
        >
            {selected && <ElementTag label="Column" selected />}
            {selected && !readOnly && (
                <ElementToolbar
                    label={onlyColumn ? 'Column (deletes the section)' : 'Column'}
                    onDelete={() => edit((d) => removeColumn(d, column.id), { select: null })}
                    placement={band === 'header' ? 'bottom' : 'top'}
                />
            )}
            {column.blocks.map((block, i) => (
                <BlockView key={block.id} block={block} column={column} index={i} band={band} theme={theme} />
            ))}
            {column.blocks.length === 0 && (
                <Box sx={{ minHeight: '9mm', border: '1px dashed #cbd5e1', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: '8pt', fontFamily: UI_FONT, backgroundColor: isOver ? '#eff6ff' : 'transparent' }}>
                    Drop blocks here
                </Box>
            )}
            {endBar && column.blocks.length > 0 && <InsertBar position="static" />}
        </td>
    );
});

// ─── Section ────────────────────────────────────────────────────────────────────

function ColumnResizer({ section, index, leftPct }: { section: Section; index: number; leftPct: number }) {
    const { edit } = useBuilder();
    const { readOnly } = useBuilderEnv();
    const start = useRef<{ x: number; width: number; left: number } | null>(null);

    const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
        if (readOnly) return;
        e.preventDefault();
        e.stopPropagation();
        const table = (e.currentTarget.parentElement as HTMLElement).querySelector('table');
        if (!table) return;
        start.current = { x: e.clientX, width: table.getBoundingClientRect().width, left: section.columns[index].widthPct };
        e.currentTarget.setPointerCapture(e.pointerId);
    };
    const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
        const s = start.current;
        if (!s || !s.width) return;
        const next = Math.round(s.left + ((e.clientX - s.x) / s.width) * 100);
        edit((d) => resizeColumnPair(d, section.id, index, next), { coalesceKey: `resize:${section.id}:${index}` });
    };
    const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
        start.current = null;
        if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    };

    const a = section.columns[index];
    const b = section.columns[index + 1];
    return (
        <Tooltip title={`${Math.round(a.widthPct)}% / ${Math.round(b.widthPct)}% — drag to resize`} arrow placement="top">
            <Box
                role="separator"
                aria-orientation="vertical"
                aria-label="Resize columns"
                aria-valuenow={Math.round(a.widthPct)}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onClick={(e) => e.stopPropagation()}
                sx={{
                    position: 'absolute',
                    top: 0,
                    bottom: 0,
                    left: `calc(${leftPct}% - 5px)`,
                    width: 10,
                    cursor: readOnly ? 'default' : 'col-resize',
                    zIndex: 15,
                    display: 'flex',
                    justifyContent: 'center',
                    '&::after': { content: '""', width: 2, height: '100%', backgroundColor: ACCENT, opacity: 0.35, borderRadius: 1 },
                    '&:hover::after': { opacity: 1 },
                    touchAction: 'none',
                }}
            />
        </Tooltip>
    );
}

const SectionView = memo(function SectionView({ section, band, index, count, theme }: { section: Section; band: Band; index: number; count: number; theme: Theme }) {
    const { selection, select, edit } = useBuilder();
    const { readOnly, saveToLibrary } = useBuilderEnv();
    const target = useDropTarget();
    const selected = selection?.kind === 'section' && selection.id === section.id;
    const childSelected = Boolean(selection && selection.kind !== 'section' && section.columns.some((c) => c.id === selection.id || c.blocks.some((b) => b.id === selection.id)));
    const { attributes, listeners, setNodeRef: setDragRef, setActivatorNodeRef, isDragging } = useDraggable({
        id: `section:${section.id}`,
        data: { source: 'canvas-section', sectionId: section.id, label: `Section ${index + 1}` } satisfies DragSource,
        disabled: readOnly,
    });
    const { setNodeRef: setDropRef } = useDroppable({ id: `drop-section:${section.id}`, data: { target: 'section', sectionId: section.id, band } satisfies DropZone });
    const nodeRef = useMergedRef(setDragRef, setDropRef);
    const showBar = (target?.kind === 'section' || target?.kind === 'newSection') && target.band === band && target.index === index;

    let cumulative = 0;
    const boundaries = section.columns.slice(0, -1).map((c) => (cumulative += c.widthPct));

    return (
        <Box
            ref={nodeRef}
            onClick={(e) => {
                e.stopPropagation();
                select({ kind: 'section', id: section.id });
            }}
            sx={{
                position: 'relative',
                opacity: isDragging ? 0.35 : 1,
                outline: selected ? `2px solid ${ACCENT}` : childSelected ? '1px dashed #93c5fd' : 'none',
                outlineOffset: 2,
                '&:hover': selected ? {} : { outline: '1px dashed #93c5fd', outlineOffset: 2 },
                '&:hover > .section-tag': { display: 'block' },
            }}
        >
            {showBar && <InsertBar />}
            <Box className="section-tag" sx={{ display: selected ? 'block' : 'none' }}>
                <ElementTag label={`Section ${index + 1}`} selected={selected} />
            </Box>
            {selected && !readOnly && (
                <ElementToolbar
                    label={`Section ${index + 1}`}
                    handleRef={setActivatorNodeRef}
                    handleListeners={listeners}
                    handleAttributes={attributes}
                    onUp={index > 0 ? () => edit((d) => nudge(d, { kind: 'section', id: section.id }, -1)) : undefined}
                    onDown={index < count - 1 ? () => edit((d) => nudge(d, { kind: 'section', id: section.id }, 1)) : undefined}
                    onDuplicate={() => {
                        let id: string | null = null;
                        edit((d) => {
                            id = duplicateSection(d, section.id);
                        });
                        if (id) select({ kind: 'section', id });
                    }}
                    onSave={() => saveToLibrary({ kind: 'section', section }, `Section (${section.columns.length} column${section.columns.length > 1 ? 's' : ''})`)}
                    onDelete={() => edit((d) => removeSection(d, section.id), { select: null })}
                    placement={band === 'header' ? 'bottom' : 'top'}
                />
            )}
            <div style={cssToStyle(sectionCss(section, theme))}>
                <Box sx={{ position: 'relative' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
                        <tbody>
                            <tr>
                                {section.columns.map((column) => (
                                    <ColumnView key={column.id} column={column} band={band} theme={theme} onlyColumn={section.columns.length === 1} />
                                ))}
                            </tr>
                        </tbody>
                    </table>
                    {(selected || childSelected) && boundaries.map((left, i) => <ColumnResizer key={section.columns[i].id} section={section} index={i} leftPct={left} />)}
                </Box>
            </div>
        </Box>
    );
});

// ─── Bands & page ───────────────────────────────────────────────────────────────

function BandView({ doc, band }: { doc: PdfDocument; band: Band }) {
    const target = useDropTarget();
    const active = useActiveDrag();
    const { setNodeRef, isOver } = useDroppable({ id: `drop-band:${band}`, data: { target: 'band', band } satisfies DropZone });
    const sections = doc[band];
    const endBar = (target?.kind === 'section' || target?.kind === 'newSection') && target.band === band && target.index === sections.length;
    const m = doc.page.margins;
    const isBody = band === 'body';

    return (
        <Box
            ref={setNodeRef}
            sx={{
                position: 'relative',
                pr: `${m.right}mm`,
                pl: `${m.left}mm`,
                py: isBody ? '4mm' : '3mm',
                ...(band === 'header' ? { minHeight: `${Math.max(m.top, 12)}mm`, borderBottom: '1px dashed #cbd5e1', backgroundColor: '#fbfdff' } : {}),
                ...(band === 'footer' ? { minHeight: `${Math.max(m.bottom, 12)}mm`, borderTop: '1px dashed #cbd5e1', backgroundColor: '#fbfdff' } : {}),
                ...(isOver && active ? { backgroundColor: '#eff6ff' } : {}),
            }}
        >
            <Typography
                component="span"
                sx={{ position: 'absolute', left: 6, [band === 'footer' ? 'bottom' : 'top']: 4, fontFamily: UI_FONT, fontSize: '9px', fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase', color: '#94a3b8', pointerEvents: 'none', zIndex: 1 }}
            >
                {BAND_LABELS[band]}
                {!isBody ? ' · every page' : ''}
            </Typography>
            <Box sx={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 0 }}>
                {sections.map((section, i) => (
                    <SectionView key={section.id} section={section} band={band} index={i} count={sections.length} theme={doc.theme} />
                ))}
                {sections.length === 0 && (
                    <Box sx={{ border: '1.5px dashed #cbd5e1', borderRadius: '6px', p: '4mm', textAlign: 'center', color: '#94a3b8', fontFamily: UI_FONT, fontSize: '8.5pt' }}>
                        {isBody ? 'Drag sections or blocks here' : `Drag a section or block here to repeat it in the ${BAND_LABELS[band].toLowerCase()}`}
                    </Box>
                )}
                {endBar && sections.length > 0 && <InsertBar position="static" />}
            </Box>
        </Box>
    );
}

export function Canvas({ zoom }: { zoom: number }) {
    const { doc, select } = useBuilder();
    const dims = PAGE_DIMENSIONS_MM[doc.page.size];
    const landscape = doc.page.orientation === 'landscape';
    const width = landscape ? dims.height : dims.width;
    const height = landscape ? dims.width : dims.height;
    const m = doc.page.margins;
    const pageContent = Math.max(height - m.top - m.bottom, 20);
    const onBackgroundClick = useCallback(() => select(null), [select]);

    return (
        <Box onClick={onBackgroundClick} sx={{ flex: 1, minWidth: 0, minHeight: 0, overflow: 'auto', backgroundColor: '#e8edf3', backgroundImage: 'radial-gradient(#cbd5e1 1px, transparent 1px)', backgroundSize: '16px 16px', p: { xs: 2, md: 4 } }}>
            <Box
                data-testid="pdf-canvas-page"
                style={{ ...cssToStyle(bandBaseCss(doc.theme)), zoom }}
                sx={{
                    width: `${width}mm`,
                    minHeight: `${height}mm`,
                    mx: 'auto',
                    my: 2,
                    backgroundColor: '#fff',
                    boxShadow: '0 4px 24px rgba(15,23,42,0.12)',
                    fontFamily: "'Noto Sans', 'Segoe UI', Arial, sans-serif",
                    display: 'flex',
                    flexDirection: 'column',
                    '& *': { boxSizing: 'border-box' },
                    '& table': { borderCollapse: 'collapse', width: '100%' },
                    '& p': { m: 0 },
                    '& img': { maxWidth: '100%' },
                }}
            >
                <BandView doc={doc} band="header" />
                <Box
                    sx={{
                        flex: 1,
                        position: 'relative',
                        // Approximate page-break guides every printable page height.
                        backgroundImage: `repeating-linear-gradient(to bottom, transparent 0, transparent calc(${pageContent}mm - 1px), #fca5a5 calc(${pageContent}mm - 1px), #fca5a5 ${pageContent}mm)`,
                        backgroundPosition: '0 4mm',
                    }}
                >
                    <BandView doc={doc} band="body" />
                </Box>
                <BandView doc={doc} band="footer" />
            </Box>
        </Box>
    );
}
