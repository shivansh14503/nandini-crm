'use client';

import React from 'react';
import { Box, IconButton, Tooltip, Typography } from '@mui/material';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import CloseIcon from '@mui/icons-material/Close';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import DragIndicatorRoundedIcon from '@mui/icons-material/DragIndicatorRounded';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import ExtensionOutlinedIcon from '@mui/icons-material/ExtensionOutlined';
import HistoryOutlinedIcon from '@mui/icons-material/HistoryOutlined';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import TuneOutlinedIcon from '@mui/icons-material/TuneOutlined';
import VerifiedIcon from '@mui/icons-material/Verified';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import type { DrawerBlock, DrawerLayoutDocument, DrawerSection } from '@/lib/drawer-layout';
import { getModuleColor, moduleKeyFrom } from '@/theme/moduleColors';
import { RatingBadge } from '@/components/common/RatingBadge';
import {
    BlockBody,
    LayoutTabSections,
    SectionShell,
    blockHasContent,
    blockSpansRow,
    sectionGridSx,
    useLayoutHeader,
    type LayoutCtx,
    type LayoutHeader,
} from '@/components/common/Drawer/layout';
import { DND_HANDLE, dndItem, dndZone, useLayoutDrag } from './LayoutDrag';
import { findBlock, type Selection } from './layoutEditor';

/**
 * The drawer being designed, at its real width. In edit mode every part is selectable and draggable (header badges,
 * sections by their title bar, blocks); in preview mode it renders exactly what users see. While something is being
 * dragged it shows the layout as it will be after the drop (see LayoutDrag), with the dragged item's slot as a gap.
 */

export interface CanvasTab {
    key: string;
    label: string;
    icon: React.ReactNode;
}

const selectedRing = '0 0 0 2px var(--crm-fill-blue-600)';
const hoverRing = '0 0 0 1px var(--crm-blue-300)';

/** How the dragged item's own slot looks: an empty gap for a move, a faint preview of something new. */
type SlotLook = 'gap' | 'preview' | null;

const slotSx = (look: Exclude<SlotLook, null>) => ({
    backgroundColor: 'rgb(var(--crm-accent-rgb) / 0.06)',
    boxShadow: 'none',
    outline: '1.5px dashed var(--crm-blue-300)',
    outlineOffset: '-1.5px',
    '&:hover': { boxShadow: 'none' },
    '& > *': look === 'gap' ? { visibility: 'hidden' } : { opacity: 0.55 },
});

/** Enter / Space selects (the Settings panel then has buttons to move it without dragging). */
const selectOnKey = (onSelect: () => void) => (e: React.KeyboardEvent) => {
    if (e.target !== e.currentTarget || (e.key !== 'Enter' && e.key !== ' ')) return;
    e.preventDefault();
    onSelect();
};

function blockLabel(block: DrawerBlock, ctx: LayoutCtx): string {
    if (block.type === 'field') return block.label.trim() || ctx.fields.get(block.field)?.label || block.field;
    if (block.type === 'address') return ctx.addresses.find((a) => a.prefix === block.prefix)?.label ?? 'Address';
    if (block.type === 'customFields') return 'Other custom fields';
    if (block.type === 'lineItems') return 'Line items';
    if (block.type === 'totals') return 'Totals';
    if (block.type === 'heading') return block.text || 'Heading';
    return block.type === 'text' ? 'Static text' : 'Divider';
}

interface CanvasBlockProps {
    block: DrawerBlock;
    section: DrawerSection;
    ctx: LayoutCtx;
    selected: boolean;
    onSelect: (s: Selection) => void;
    readOnly: boolean;
    slot: SlotLook;
}

/**
 * Re-renders only when something it shows changes (a drag re-renders the canvas each time the slot moves, and most
 * blocks stay as they are). Of its section it only uses the columns and the look.
 */
const CanvasBlock = React.memo(
    CanvasBlockView,
    (a, b) =>
        a.block === b.block &&
        a.ctx === b.ctx &&
        a.selected === b.selected &&
        a.onSelect === b.onSelect &&
        a.readOnly === b.readOnly &&
        a.slot === b.slot &&
        a.section.columns === b.section.columns &&
        a.section.style === b.section.style,
);

function CanvasBlockView({ block, section, ctx, selected, onSelect: onSelectItem, readOnly, slot }: CanvasBlockProps) {
    const onSelect = () => onSelectItem({ kind: 'block', id: block.id });
    const half = section.columns === 2 && !blockSpansRow(block);
    const label = blockLabel(block, ctx);
    const hiddenForRecord = block.type === 'field' && block.hideEmpty && !blockHasContent(block, ctx);

    return (
        <Box
            {...(readOnly ? {} : dndItem('block', block.id, { source: 'canvas-block', blockId: block.id, label }, half))}
            role="button"
            tabIndex={0}
            aria-label={`${label}. ${readOnly ? 'Press Enter to view.' : 'Drag to move, or press Enter to edit.'}`}
            aria-pressed={selected}
            data-layout-selected={selected ? 'true' : undefined}
            onClick={(e) => {
                e.stopPropagation();
                onSelect();
            }}
            onKeyDown={selectOnKey(onSelect)}
            sx={{
                position: 'relative',
                minWidth: 0,
                borderRadius: '8px',
                p: '6px 8px 6px 22px',
                m: '-6px -8px -6px -22px',
                cursor: readOnly ? 'pointer' : 'grab',
                opacity: hiddenForRecord ? 0.5 : 1,
                outline: 'none',
                boxShadow: selected ? selectedRing : 'none',
                backgroundColor: selected ? 'rgb(var(--crm-accent-rgb) / 0.06)' : 'transparent',
                transition: 'box-shadow 0.12s ease, background-color 0.12s ease',
                '&:hover': { boxShadow: selected ? selectedRing : hoverRing, backgroundColor: 'rgb(var(--crm-accent-rgb) / 0.05)' },
                '&:hover .blk-handle, &:focus-visible .blk-handle': { opacity: 1 },
                '&:focus-visible': { boxShadow: selectedRing },
                ...(section.columns === 2 && !half ? { gridColumn: '1 / -1' } : {}),
                ...(slot ? slotSx(slot) : {}),
            }}
        >
            {!readOnly && (
                <Box
                    className="blk-handle"
                    {...DND_HANDLE}
                    aria-hidden
                    sx={{
                        position: 'absolute',
                        left: 0,
                        top: 0,
                        width: 22,
                        height: 32,
                        display: 'flex',
                        justifyContent: 'center',
                        pt: '7px',
                        boxSizing: 'border-box',
                        color: 'var(--mui-palette-text-muted)',
                        cursor: 'grab',
                        touchAction: 'none',
                        opacity: { xs: 0.7, md: selected ? 1 : 0 },
                        transition: 'opacity 0.12s',
                        // Bigger than it looks, so a finger finds it.
                        '&::before': { content: '""', position: 'absolute', inset: '-4px -6px' },
                        '@media (hover: none)': { opacity: 0.8 },
                    }}
                >
                    <DragIndicatorRoundedIcon sx={{ fontSize: 16 }} />
                </Box>
            )}
            <BlockBody
                block={block}
                ctx={ctx}
                section={section}
                placeholder={
                    block.type === 'customFields' ? (
                        <Box sx={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: 0.75, color: 'var(--mui-palette-text-muted)', fontSize: '0.74rem' }}>
                            <TuneOutlinedIcon sx={{ fontSize: 15 }} />
                            Other custom fields: new custom fields marked &ldquo;Visible in Drawer&rdquo; appear here on their own.
                        </Box>
                    ) : undefined
                }
            />
            {hiddenForRecord && (
                <Typography component="span" sx={{ display: 'inline-block', mt: 0.5, fontSize: '0.64rem', color: 'var(--mui-palette-text-muted)', border: '1px dashed var(--mui-palette-border-strong)', borderRadius: '999px', px: 0.75 }}>
                    Hidden for this record (empty)
                </Typography>
            )}
        </Box>
    );
}

const CanvasSection = React.memo(function CanvasSection({
    section,
    ctx,
    selection,
    onSelect,
    onRemove: onRemoveSection,
    readOnly,
    dragItemId,
    dragLook,
    receiving,
}: {
    section: DrawerSection;
    ctx: LayoutCtx;
    selection: Selection | null;
    onSelect: (s: Selection) => void;
    onRemove: (id: string) => void;
    readOnly: boolean;
    /** The item being dragged (shown as its slot when it is this section or one of its blocks). */
    dragItemId: string | null;
    dragLook: Exclude<SlotLook, null>;
    /** A block is being dragged into this section from elsewhere. */
    receiving: boolean;
}) {
    const slot = dragItemId === section.id ? dragLook : null;
    const onRemove = () => onRemoveSection(section.id);
    const selected = selection?.kind === 'section' && selection.id === section.id;
    const title = section.title.trim() || 'Untitled section';
    const select = () => onSelect({ kind: 'section', id: section.id });

    return (
        <Box
            {...(readOnly ? {} : dndItem('section', section.id, { source: 'canvas-section', sectionId: section.id, label: title }))}
            data-layout-selected={selected ? 'true' : undefined}
            sx={{
                position: 'relative',
                borderRadius: '10px',
                cursor: readOnly ? 'pointer' : 'grab',
                boxShadow: selected ? selectedRing : receiving ? '0 0 0 2px rgb(var(--crm-accent-rgb) / 0.35)' : 'none',
                transition: 'box-shadow 0.15s ease',
                '&:hover': { boxShadow: selected ? selectedRing : receiving ? '0 0 0 2px rgb(var(--crm-accent-rgb) / 0.35)' : hoverRing },
                ...(slot ? slotSx(slot) : {}),
            }}
            onClick={(e) => {
                e.stopPropagation();
                select();
            }}
        >
            <SectionShell
                section={{ ...section, title }}
                action={
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        {section.piece && section.piece.toLowerCase() !== section.title.trim().toLowerCase() && (
                            <Tooltip title={`Started from the "${section.piece}" piece`} arrow>
                                <Box
                                    component="span"
                                    sx={{
                                        display: { xs: 'none', sm: 'inline-flex' },
                                        alignItems: 'center',
                                        gap: 0.3,
                                        fontSize: '0.62rem',
                                        fontWeight: 600,
                                        px: 0.75,
                                        borderRadius: '999px',
                                        color: 'var(--crm-text-blue-700)',
                                        backgroundColor: 'var(--mui-palette-primary-soft)',
                                        border: '1px solid var(--mui-palette-primary-softBorder)',
                                        maxWidth: 150,
                                        whiteSpace: 'nowrap',
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                    }}
                                >
                                    <ExtensionOutlinedIcon sx={{ fontSize: 11 }} />
                                    {section.piece}
                                </Box>
                            </Tooltip>
                        )}
                        {!readOnly && (
                            <>
                                <Tooltip title="Drag to move this section" arrow>
                                    <Box
                                        {...DND_HANDLE}
                                        role="button"
                                        tabIndex={0}
                                        aria-label={`Section ${title}. Drag to move, or press Enter to select it.`}
                                        onKeyDown={selectOnKey(select)}
                                        sx={{
                                            display: 'grid',
                                            placeItems: 'center',
                                            width: 32,
                                            height: 32,
                                            borderRadius: '6px',
                                            cursor: 'grab',
                                            touchAction: 'none',
                                            color: 'var(--mui-palette-text-muted)',
                                            outline: 'none',
                                            '&:hover': { color: 'var(--crm-text-blue-700)', backgroundColor: 'var(--mui-palette-primary-soft)' },
                                            '&:focus-visible': { boxShadow: '0 0 0 3px rgb(var(--crm-accent-rgb) / 0.22)' },
                                        }}
                                    >
                                        <DragIndicatorRoundedIcon sx={{ fontSize: 18 }} />
                                    </Box>
                                </Tooltip>
                                <Tooltip title="Remove section" arrow>
                                    <IconButton
                                        size="small"
                                        aria-label={`Remove section ${title}`}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onRemove();
                                        }}
                                        sx={{ p: 0.25, color: 'var(--mui-palette-text-muted)', '&:hover': { color: 'var(--mui-palette-error-main)', backgroundColor: 'var(--mui-palette-error-soft)' } }}
                                    >
                                        <DeleteOutlineRoundedIcon sx={{ fontSize: 17 }} />
                                    </IconButton>
                                </Tooltip>
                            </>
                        )}
                    </Box>
                }
            >
                <Box {...dndZone('section-body')} sx={{ ...(sectionGridSx(section.columns) as object), position: 'relative', minHeight: 36, cursor: 'pointer' }}>
                    {section.blocks.map((block) => (
                        <CanvasBlock
                            key={block.id}
                            block={block}
                            section={section}
                            ctx={ctx}
                            selected={selection?.kind === 'block' && selection.id === block.id}
                            onSelect={onSelect}
                            readOnly={readOnly}
                            slot={dragItemId === block.id ? dragLook : null}
                        />
                    ))}
                    {section.blocks.length === 0 && (
                        <Box sx={{ gridColumn: '1 / -1', border: '1.5px dashed var(--mui-palette-border-strong)', borderRadius: '8px', p: 1.5, textAlign: 'center', fontSize: '0.76rem', color: 'var(--mui-palette-text-muted)' }}>
                            Drop fields or blocks here
                        </Box>
                    )}
                </Box>
            </SectionShell>
        </Box>
    );
});

function CanvasBadge({ id, label, item, selected, onSelect, readOnly, slot }: { id: string; label: string; item: NonNullable<LayoutHeader['badges'][number]['item']>; selected: boolean; onSelect: () => void; readOnly: boolean; slot: SlotLook }) {
    return (
        <Box
            // Small enough to be its own grip on touch screens.
            {...(readOnly ? {} : { ...dndItem('badge', id, { source: 'canvas-badge', badgeId: id, label }, true), ...DND_HANDLE })}
            role="button"
            tabIndex={0}
            aria-label={`Badge ${label}. ${readOnly ? 'Press Enter to view.' : 'Drag to reorder, or press Enter to edit.'}`}
            onClick={(e) => {
                e.stopPropagation();
                onSelect();
            }}
            onKeyDown={selectOnKey(onSelect)}
            sx={{
                position: 'relative',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 0.5,
                backgroundColor: item.backgroundColor,
                color: item.color,
                border: `1px solid ${item.borderColor}`,
                px: 1.2,
                py: 0.35,
                borderRadius: '9999px',
                fontSize: '0.7rem',
                fontWeight: 700,
                cursor: readOnly ? 'pointer' : 'grab',
                touchAction: readOnly ? undefined : 'none',
                boxShadow: selected ? '0 0 0 2px var(--mui-palette-background-paper), 0 0 0 4px var(--crm-fill-blue-600)' : 'none',
                outline: 'none',
                '&:focus-visible': { boxShadow: '0 0 0 3px rgb(var(--crm-accent-rgb) / 0.35)' },
                ...(slot ? { ...slotSx(slot), borderColor: 'transparent' } : {}),
            }}
        >
            {item.icon}
            <span>{item.label}</span>
        </Box>
    );
}

export function BuilderCanvas({
    doc,
    ctx,
    tabs,
    tab,
    onTab,
    mode,
    selection,
    onSelect,
    onRemoveSection,
    onAddBadge,
    readOnly,
    footer,
}: {
    doc: DrawerLayoutDocument;
    ctx: LayoutCtx;
    tabs: CanvasTab[];
    tab: string;
    onTab: (tab: string) => void;
    mode: 'edit' | 'preview';
    selection: Selection | null;
    onSelect: (s: Selection | null) => void;
    onRemoveSection: (id: string) => void;
    onAddBadge: () => void;
    readOnly: boolean;
    footer: React.ReactNode;
}) {
    const edit = mode === 'edit';
    const moduleColor = getModuleColor(moduleKeyFrom(ctx.module) ?? 'leads');
    const { preview, itemId, source: dragging, target: t, attachRoot } = useLayoutDrag();
    // While dragging, the layout as it will be after the drop.
    const view = preview ?? doc;
    const header = useLayoutHeader(view, ctx, true);
    const sections = view.tabs[tab] ?? [];
    const dropping = edit && !readOnly;
    const dragLook = dragging?.source.startsWith('canvas-') ? 'gap' : 'preview';
    const slotOf = (id: string): SlotLook => (itemId === id ? dragLook : null);
    // The section a block is being dragged into, when that's not where it came from.
    const into = t?.kind === 'block' ? t.sectionId : t?.kind === 'newSection' ? (view.tabs[t.tab]?.[t.index]?.id ?? null) : null;
    const home = dragging?.source === 'canvas-block' ? (findBlock(doc, dragging.blockId)?.section.id ?? null) : null;
    const headerSelected = selection?.kind === 'header';
    const initials = header.title
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((w) => w[0]?.toUpperCase())
        .join('');

    return (
        <Box
            ref={attachRoot}
            onClick={() => edit && onSelect(null)}
            sx={{
                width: '100%',
                maxWidth: 560,
                mx: 'auto',
                backgroundColor: 'var(--mui-palette-background-paper)',
                border: '1px solid var(--mui-palette-border-main)',
                borderRadius: '14px',
                overflow: 'hidden',
                boxShadow: '0 12px 32px rgb(15 23 42 / 0.10)',
            }}
        >
            {/* Header */}
            <Box
                onClick={(e) => {
                    if (!edit) return;
                    e.stopPropagation();
                    onSelect({ kind: 'header' });
                }}
                sx={{
                    position: 'relative',
                    px: { xs: 2, sm: 2.5 },
                    pt: 2,
                    pb: 2,
                    borderTop: `3px solid ${moduleColor.main}`,
                    background: `linear-gradient(180deg, ${moduleColor.soft} 0%, transparent 100%)`,
                    borderBottom: '1px solid var(--mui-palette-border-light)',
                    cursor: edit ? 'pointer' : 'default',
                    boxShadow: headerSelected ? 'inset 0 0 0 2px var(--crm-fill-blue-600)' : 'none',
                    '&:hover': edit && !headerSelected ? { boxShadow: 'inset 0 0 0 1px var(--crm-blue-300)' } : undefined,
                }}
            >
                <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 1.5 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, minWidth: 0 }}>
                        <Box
                            sx={{
                                width: 48,
                                height: 48,
                                borderRadius: '10px',
                                background: header.avatarBg,
                                color: '#ffffff',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontWeight: 800,
                                fontSize: '1.05rem',
                                flexShrink: 0,
                                boxShadow: '0 4px 14px rgb(var(--crm-accent-rgb) / 0.28)',
                            }}
                        >
                            {header.avatarIcon ?? initials}
                        </Box>
                        <Box sx={{ minWidth: 0 }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.8 }}>
                                <Typography noWrap sx={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--crm-slate-900)', letterSpacing: '-0.01em', lineHeight: 1.25 }}>
                                    {header.title}
                                </Typography>
                                <VerifiedIcon sx={{ fontSize: 18, color: 'var(--crm-text-blue-600)', flexShrink: 0 }} />
                            </Box>
                            {header.subtitle && (
                                <Typography noWrap sx={{ fontSize: '0.8rem', color: 'var(--mui-palette-text-secondary)', fontWeight: 500, mt: 0.3 }}>
                                    {header.subtitle}
                                </Typography>
                            )}
                        </Box>
                    </Box>
                    <Box sx={{ flexShrink: 0 }}>
                        <Box aria-hidden sx={{ display: 'flex', gap: 0.5, color: 'var(--mui-palette-text-muted)' }}>
                            {[EditOutlinedIcon, VisibilityOutlinedIcon, CloseIcon].map((Icon, i) => (
                                <Box key={i} sx={{ width: 30, height: 30, borderRadius: '8px', border: '1px solid var(--mui-palette-border-main)', display: { xs: i === 1 ? 'none' : 'grid', sm: 'grid' }, placeItems: 'center' }}>
                                    <Icon sx={{ fontSize: 17 }} />
                                </Box>
                            ))}
                        </Box>
                    </Box>
                </Box>

                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mt: 1.8 }}>
                <Box {...(dropping ? dndZone('badges') : {})} sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 0.8, minHeight: 26, position: 'relative', flex: 1, minWidth: 0 }}>
                    {header.badges.map(({ badge, item }) =>
                        item ? (
                            edit ? (
                                <CanvasBadge
                                    key={badge.id}
                                    id={badge.id}
                                    label={item.label}
                                    item={item}
                                    selected={selection?.kind === 'badge' && selection.id === badge.id}
                                    onSelect={() => onSelect({ kind: 'badge', id: badge.id })}
                                    readOnly={readOnly}
                                    slot={slotOf(badge.id)}
                                />
                            ) : (
                                <Box
                                    key={badge.id}
                                    sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, backgroundColor: item.backgroundColor, color: item.color, border: `1px solid ${item.borderColor}`, px: 1.2, py: 0.35, borderRadius: '9999px', fontSize: '0.7rem', fontWeight: 700 }}
                                >
                                    {item.icon}
                                    <span>{item.label}</span>
                                </Box>
                            )
                        ) : null,
                    )}
                    {edit && !readOnly && (
                        <Box
                            component="button"
                            type="button"
                            onClick={(e: React.MouseEvent) => {
                                e.stopPropagation();
                                onAddBadge();
                            }}
                            sx={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 0.3,
                                px: 1,
                                py: 0.3,
                                borderRadius: '9999px',
                                border: '1px dashed var(--mui-palette-border-strong)',
                                backgroundColor: 'transparent',
                                color: 'var(--mui-palette-text-secondary)',
                                fontSize: '0.7rem',
                                fontWeight: 600,
                                cursor: 'pointer',
                                fontFamily: 'inherit',
                                '&:hover': { borderColor: 'var(--crm-blue-300)', backgroundColor: 'var(--mui-palette-primary-soft)', color: 'var(--crm-text-blue-700)' },
                            }}
                        >
                            <AddRoundedIcon sx={{ fontSize: 14 }} />
                            Badge
                        </Box>
                    )}
                </Box>
                {header.rating && (
                    <Box sx={{ flexShrink: 0 }}>
                        <RatingBadge rating={header.rating.value} reason={header.rating.reason} variant="block" />
                    </Box>
                )}
                </Box>
            </Box>

            {/* Tabs (mirror the form's tabs; Changes is built in) */}
            <Box role="tablist" sx={{ display: 'flex', gap: 0.5, px: 1.5, py: 1, overflowX: 'auto', borderBottom: '1px solid var(--mui-palette-border-main)', backgroundColor: 'var(--mui-palette-background-subtle)' }}>
                {[...tabs, { key: '__changes', label: 'Changes', icon: <HistoryOutlinedIcon sx={{ fontSize: 17 }} /> }].map((t) => {
                    const on = t.key === tab;
                    const empty = t.key !== '__changes' && (view.tabs[t.key]?.length ?? 0) === 0;
                    return (
                        <Box
                            key={t.key}
                            role="tab"
                            aria-selected={on}
                            tabIndex={0}
                            onClick={(e) => {
                                e.stopPropagation();
                                onTab(t.key);
                            }}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault();
                                    onTab(t.key);
                                }
                            }}
                            sx={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 0.6,
                                px: 1.25,
                                py: 0.6,
                                borderRadius: '8px',
                                fontSize: '0.78rem',
                                fontWeight: 600,
                                whiteSpace: 'nowrap',
                                cursor: 'pointer',
                                border: on ? '1px solid var(--mui-palette-border-strong)' : '1px solid transparent',
                                backgroundColor: on ? 'var(--mui-palette-background-paper)' : 'transparent',
                                color: on ? 'var(--crm-text-blue-900)' : 'var(--mui-palette-text-secondary)',
                                opacity: empty && !on ? 0.6 : 1,
                                '&:hover': on ? undefined : { backgroundColor: 'var(--mui-palette-primary-soft)', color: 'var(--crm-text-blue-700)' },
                                '&:focus-visible': { outline: 'none', boxShadow: '0 0 0 3px rgb(var(--crm-accent-rgb) / 0.22)' },
                            }}
                        >
                            {t.icon}
                            {t.label}
                            {t.key === '__changes' && <LockOutlinedIcon sx={{ fontSize: 13, color: 'var(--mui-palette-text-muted)' }} />}
                        </Box>
                    );
                })}
            </Box>

            {/* Body */}
            <Box sx={{ p: { xs: 1.5, sm: 2 }, backgroundColor: 'var(--mui-palette-background-default)', minHeight: 320 }}>
                {tab === '__changes' ? (
                    <Box sx={{ textAlign: 'center', py: 6, px: 2, color: 'var(--mui-palette-text-secondary)' }}>
                        <HistoryOutlinedIcon sx={{ fontSize: 28, color: 'var(--mui-palette-text-muted)' }} />
                        <Typography sx={{ fontWeight: 700, fontSize: '0.88rem', color: 'var(--crm-slate-900)', mt: 1 }}>Changes</Typography>
                        <Typography sx={{ fontSize: '0.8rem', mt: 0.5 }}>Built-in tab with the record&apos;s history. It is always last and isn&apos;t part of the layout.</Typography>
                    </Box>
                ) : edit ? (
                    <Box {...(dropping ? dndZone('tab', tab) : {})} sx={{ display: 'flex', flexDirection: 'column', gap: 2, position: 'relative' }}>
                        {sections.map((section) => (
                            <CanvasSection
                                key={section.id}
                                section={section}
                                ctx={ctx}
                                selection={selection}
                                onSelect={onSelect}
                                onRemove={onRemoveSection}
                                readOnly={readOnly}
                                dragItemId={itemId}
                                dragLook={dragLook}
                                receiving={into === section.id && into !== home}
                            />
                        ))}
                        {!readOnly && (
                            <Box
                                {...dndZone('new-section')}
                                sx={{
                                    position: 'relative',
                                    border: '1.5px dashed var(--mui-palette-border-strong)',
                                    borderRadius: '10px',
                                    p: 2,
                                    textAlign: 'center',
                                    fontSize: '0.78rem',
                                    color: 'var(--mui-palette-text-muted)',
                                }}
                            >
                                {sections.length === 0 ? 'This tab is hidden from users until it has a section. ' : ''}
                                Drop a field, block or piece here to start a new section
                            </Box>
                        )}
                    </Box>
                ) : (
                    <LayoutTabSections sections={sections} ctx={ctx} />
                )}
            </Box>

            {footer}
        </Box>
    );
}
