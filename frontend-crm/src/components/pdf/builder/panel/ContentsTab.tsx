'use client';

import React, { useMemo, useState } from 'react';
import { useDraggable } from '@dnd-kit/core';
import { Box, CircularProgress, IconButton, Tooltip, Typography } from '@mui/material';
import WidgetsOutlinedIcon from '@mui/icons-material/WidgetsOutlined';
import DashboardCustomizeOutlinedIcon from '@mui/icons-material/DashboardCustomizeOutlined';
import BookmarksOutlinedIcon from '@mui/icons-material/BookmarksOutlined';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import ViewWeekOutlinedIcon from '@mui/icons-material/ViewWeekOutlined';
import {
    BLOCK_LABELS,
    cloneBlock,
    cloneSection,
    createBlock,
    createSection,
    SECTION_PRESETS,
    type Band,
    type Block,
    type BlockFactoryInput,
    type BlockType,
    type Section,
} from '@/lib/pdf-document';
import { usePdfSavedItems, useRemovePdfSavedItem } from '@/hooks/queries/usePdfTemplates';
import type { PdfSavedItem } from '@/types/pdfTemplate.types';
import { ConfirmDeleteDialog, EmptyState, errorMessage } from '@/components/settings/form-customization/builderUi';
import { BLOCK_DESCRIPTIONS, BLOCK_GROUPS, BLOCK_ICONS } from '../blockMeta';
import type { DragSource } from '../dnd/BuilderDnd';
import { PREBUILT_LAYOUTS } from '../layouts';
import { useBuilder, useBuilderEnv } from '../state/builderState';
import { BAND_LABELS, blockAllowedIn, findBlock, findColumn, findSection, insertBlock, insertSection } from '../state/docOps';

/** "Contents" tab: drag (or click) blocks, empty sections, pre-built layouts and saved items onto the page. */

type SubTab = 'blocks' | 'sections' | 'saved';

const tileSx = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 0.75,
    height: 84,
    borderRadius: '10px',
    border: '1px solid #e2e8f0',
    backgroundColor: '#fff',
    color: '#334155',
    cursor: 'grab',
    userSelect: 'none',
    touchAction: 'none',
    transition: 'border-color 120ms, box-shadow 120ms',
    '&:hover': { borderColor: '#93c5fd', boxShadow: '0 2px 8px rgba(37,99,235,0.12)' },
    '&:focus-visible': { outline: '2px solid #2563eb', outlineOffset: 2 },
} as const;

function DraggableTile({ id, data, onActivate, disabled, children, title, sx }: { id: string; data: DragSource; onActivate: () => void; disabled: boolean; children: React.ReactNode; title: string; sx?: object }) {
    const { setNodeRef, attributes, listeners, isDragging } = useDraggable({ id, data, disabled });
    return (
        <Tooltip title={title} arrow placement="top" enterDelay={500}>
            <Box
                ref={setNodeRef}
                {...attributes}
                {...listeners}
                role="button"
                tabIndex={disabled ? -1 : 0}
                aria-disabled={disabled}
                onClick={() => !disabled && onActivate()}
                onKeyDown={(e) => {
                    if (!disabled && (e.key === 'Enter' || e.key === ' ')) {
                        e.preventDefault();
                        onActivate();
                    }
                }}
                sx={{ ...tileSx, ...(sx ?? {}), opacity: disabled ? 0.5 : isDragging ? 0.4 : 1, cursor: disabled ? 'default' : 'grab' }}
            >
                {children}
            </Box>
        </Tooltip>
    );
}

/** Where a click-to-add goes: after the selected block / into the selected column, else a new section at the end of the body. */
function useAppend() {
    const { doc, selection, edit } = useBuilder();
    const { notify } = useBuilderEnv();

    const appendBlock = (block: Block) => {
        const columnId = selection?.kind === 'column' ? selection.id : selection?.kind === 'block' ? findBlock(doc, selection.id)?.column.id : undefined;
        const at = columnId ? findColumn(doc, columnId) : null;
        if (at && blockAllowedIn(block.type, at.band)) {
            const index = selection?.kind === 'block' ? (findBlock(doc, selection.id)?.blockIndex ?? at.column.blocks.length - 1) + 1 : at.column.blocks.length;
            edit((d) => void insertBlock(d, at.column.id, index, block), { select: { kind: 'block', id: block.id } });
            return;
        }
        const band: Band = blockAllowedIn(block.type, 'body') ? 'body' : 'footer';
        edit((d) => insertSection(d, band, d[band].length, createSection([100], [[block]])), { select: { kind: 'block', id: block.id } });
        if (band !== 'body') notify(`${BLOCK_LABELS[block.type]} added to the ${BAND_LABELS[band].toLowerCase()}.`, 'info');
    };

    const appendSection = (section: Section, preferred: Band = 'body') => {
        const selected = selection?.kind === 'section' ? findSection(doc, selection.id) : null;
        const band = selected?.band ?? preferred;
        const blocked = section.columns.flatMap((c) => c.blocks).find((b) => !blockAllowedIn(b.type, band));
        if (blocked) {
            notify(`This section has a ${BLOCK_LABELS[blocked.type]} block, which can't go in the ${BAND_LABELS[band].toLowerCase()}.`, 'warning');
            return;
        }
        const index = selected ? selected.index + 1 : doc[band].length;
        edit((d) => insertSection(d, band, index, section), { select: { kind: 'section', id: section.id } });
    };

    return { appendBlock, appendSection };
}

function BlocksPanel({ factory, disabled }: { factory: BlockFactoryInput; disabled: boolean }) {
    const { appendBlock } = useAppend();
    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {BLOCK_GROUPS.map((group) => (
                <Box key={group.label}>
                    <Typography sx={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.6, color: '#94a3b8', mb: 1 }}>{group.label}</Typography>
                    <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1 }}>
                        {group.types.map((type: BlockType) => {
                            const Icon = BLOCK_ICONS[type];
                            return (
                                <DraggableTile key={type} id={`palette-block:${type}`} data={{ source: 'palette-block', blockType: type }} title={BLOCK_DESCRIPTIONS[type]} disabled={disabled} onActivate={() => appendBlock(createBlock(type, factory))}>
                                    <Icon sx={{ fontSize: 24, color: '#1d4ed8' }} />
                                    <Typography sx={{ fontSize: '0.74rem', fontWeight: 600, textAlign: 'center', lineHeight: 1.2, px: 0.5 }}>{BLOCK_LABELS[type]}</Typography>
                                </DraggableTile>
                            );
                        })}
                    </Box>
                </Box>
            ))}
            <Typography sx={{ fontSize: '0.7rem', color: '#94a3b8' }}>Drag a block onto the page, or click to add it after the selection.</Typography>
        </Box>
    );
}

function SectionsPanel({ factory, disabled }: { factory: BlockFactoryInput; disabled: boolean }) {
    const { appendSection } = useAppend();
    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Box>
                <Typography sx={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.6, color: '#94a3b8', mb: 1 }}>Empty columns</Typography>
                <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
                    {SECTION_PRESETS.map((preset) => (
                        <DraggableTile
                            key={preset.key}
                            id={`palette-section:${preset.key}`}
                            data={{ source: 'palette-section', widths: preset.widths, label: preset.label }}
                            title={preset.description}
                            disabled={disabled}
                            onActivate={() => appendSection(createSection(preset.widths))}
                            sx={{ height: 'auto', alignItems: 'stretch', p: 1.25, gap: 1 }}
                        >
                            <Typography sx={{ fontSize: '0.76rem', fontWeight: 700, color: '#0f172a' }}>{preset.label}</Typography>
                            <Box sx={{ display: 'flex', gap: '4px', height: 22 }}>
                                {preset.widths.map((w, i) => (
                                    <Box key={i} sx={{ flex: w, borderRadius: '3px', border: '1px dashed #93c5fd', backgroundColor: '#eff6ff' }} />
                                ))}
                            </Box>
                            <Typography sx={{ fontSize: '0.66rem', color: '#64748b' }}>{preset.description}</Typography>
                        </DraggableTile>
                    ))}
                </Box>
            </Box>
            <Box>
                <Typography sx={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.6, color: '#94a3b8', mb: 1 }}>Pre-built layouts</Typography>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                    {PREBUILT_LAYOUTS.map((layout) => (
                        <DraggableTile
                            key={layout.key}
                            id={`layout:${layout.key}`}
                            data={{ source: 'layout', layoutKey: layout.key, label: layout.label }}
                            title={`Goes in the ${BAND_LABELS[layout.band].toLowerCase()}`}
                            disabled={disabled}
                            onActivate={() => appendSection(layout.build(factory), layout.band)}
                            sx={{ height: 'auto', flexDirection: 'row', justifyContent: 'flex-start', p: 1.25, gap: 1.25 }}
                        >
                            <ViewWeekOutlinedIcon sx={{ color: '#1d4ed8', fontSize: 22 }} />
                            <Box sx={{ minWidth: 0 }}>
                                <Typography sx={{ fontSize: '0.8rem', fontWeight: 700, color: '#0f172a' }}>
                                    {layout.label}
                                    {layout.band !== 'body' && (
                                        <Box component="span" sx={{ ml: 0.75, fontSize: '0.62rem', fontWeight: 700, color: '#7c3aed', backgroundColor: '#f5f3ff', px: 0.5, borderRadius: '4px', textTransform: 'uppercase' }}>
                                            {BAND_LABELS[layout.band]}
                                        </Box>
                                    )}
                                </Typography>
                                <Typography sx={{ fontSize: '0.7rem', color: '#64748b' }}>{layout.description}</Typography>
                            </Box>
                        </DraggableTile>
                    ))}
                </Box>
            </Box>
        </Box>
    );
}

function SavedPanel({ disabled }: { disabled: boolean }) {
    const { module, notify } = useBuilderEnv();
    const { appendBlock, appendSection } = useAppend();
    const saved = usePdfSavedItems(module);
    const remove = useRemovePdfSavedItem(module);
    const [toDelete, setToDelete] = useState<PdfSavedItem | null>(null);

    if (saved.isLoading) return <CircularProgress size={22} sx={{ mx: 'auto', mt: 4, display: 'block' }} />;
    if (saved.error) return <Typography sx={{ fontSize: '0.8rem', color: '#b91c1c' }}>{errorMessage(saved.error, 'The library could not be loaded.')}</Typography>;
    const items = saved.data ?? [];
    if (items.length === 0) {
        return <EmptyState icon={<BookmarksOutlinedIcon />} title="No saved items yet" description="Select a section or block on the page and click the bookmark icon to save it here. Saved items are shared by all quotation templates." />;
    }

    const insert = (item: PdfSavedItem) => (item.content.kind === 'section' ? appendSection(cloneSection(item.content.section)) : appendBlock(cloneBlock(item.content.block)));

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {items.map((item) => {
                const Icon = item.content.kind === 'block' ? BLOCK_ICONS[item.content.block.type] : ViewWeekOutlinedIcon;
                return (
                    <Box key={item.id} sx={{ position: 'relative' }}>
                        <DraggableTile id={`saved:${item.id}`} data={{ source: 'saved', item }} title="Drag onto the page or click to insert a copy" disabled={disabled} onActivate={() => insert(item)} sx={{ height: 'auto', flexDirection: 'row', justifyContent: 'flex-start', p: 1.25, pr: 5, gap: 1.25 }}>
                            <Icon sx={{ color: '#1d4ed8', fontSize: 22 }} />
                            <Box sx={{ minWidth: 0 }}>
                                <Typography noWrap sx={{ fontSize: '0.8rem', fontWeight: 700, color: '#0f172a' }}>
                                    {item.name}
                                </Typography>
                                <Typography sx={{ fontSize: '0.68rem', color: '#64748b' }}>
                                    {item.content.kind === 'section' ? `Section · ${item.content.section.columns.length} column${item.content.section.columns.length > 1 ? 's' : ''}` : `${BLOCK_LABELS[item.content.block.type]} block`} · by {item.createdBy}
                                </Typography>
                            </Box>
                        </DraggableTile>
                        <Tooltip title="Delete from library" arrow>
                            <IconButton size="small" aria-label={`Delete ${item.name} from the library`} disabled={disabled} onClick={() => setToDelete(item)} sx={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', '&:hover': { color: '#dc2626' } }}>
                                <DeleteOutlineRoundedIcon sx={{ fontSize: 18 }} />
                            </IconButton>
                        </Tooltip>
                    </Box>
                );
            })}
            <Typography sx={{ fontSize: '0.7rem', color: '#94a3b8' }}>Inserting places a copy: editing it never changes other templates.</Typography>
            <ConfirmDeleteDialog
                open={Boolean(toDelete)}
                title={`Delete “${toDelete?.name ?? ''}” from the library?`}
                confirmLabel="Delete"
                onClose={() => setToDelete(null)}
                onConfirm={() => {
                    const item = toDelete;
                    setToDelete(null);
                    if (!item) return;
                    remove.mutate(item.id, { onSuccess: () => notify('Removed from the library'), onError: (err) => notify(errorMessage(err), 'error') });
                }}
            >
                Templates that already use a copy of it are not affected.
            </ConfirmDeleteDialog>
        </Box>
    );
}

export function ContentsTab() {
    const { registry, readOnly } = useBuilderEnv();
    const [tab, setTab] = useState<SubTab>('blocks');
    const factory = useMemo<BlockFactoryInput>(() => ({ lineItemColumns: registry.lineItemColumns }), [registry]);
    const tabs: { key: SubTab; label: string; icon: React.ReactNode }[] = [
        { key: 'blocks', label: 'Blocks', icon: <WidgetsOutlinedIcon sx={{ fontSize: 17 }} /> },
        { key: 'sections', label: 'Sections', icon: <DashboardCustomizeOutlinedIcon sx={{ fontSize: 17 }} /> },
        { key: 'saved', label: 'Saved', icon: <BookmarksOutlinedIcon sx={{ fontSize: 17 }} /> },
    ];

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: 0, flex: 1 }}>
            <Box role="tablist" aria-label="Contents" sx={{ display: 'flex', gap: 0.5, m: 1.5, p: 0.5, borderRadius: '10px', backgroundColor: '#f1f5f9' }}>
                {tabs.map((t) => {
                    const active = t.key === tab;
                    return (
                        <Box
                            key={t.key}
                            role="tab"
                            tabIndex={0}
                            aria-selected={active}
                            onClick={() => setTab(t.key)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault();
                                    setTab(t.key);
                                }
                            }}
                            sx={{
                                flex: 1,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: 0.6,
                                py: 0.8,
                                borderRadius: '8px',
                                cursor: 'pointer',
                                fontSize: '0.8rem',
                                fontWeight: 600,
                                color: active ? '#1d4ed8' : '#64748b',
                                backgroundColor: active ? '#fff' : 'transparent',
                                boxShadow: active ? '0 1px 3px rgba(15,23,42,0.08)' : 'none',
                            }}
                        >
                            {t.icon}
                            {t.label}
                        </Box>
                    );
                })}
            </Box>
            <Box role="tabpanel" sx={{ flex: 1, minHeight: 0, overflowY: 'auto', px: 1.5, pb: 2 }}>
                {tab === 'blocks' && <BlocksPanel factory={factory} disabled={readOnly} />}
                {tab === 'sections' && <SectionsPanel factory={factory} disabled={readOnly} />}
                {tab === 'saved' && <SavedPanel disabled={readOnly} />}
            </Box>
        </Box>
    );
}
