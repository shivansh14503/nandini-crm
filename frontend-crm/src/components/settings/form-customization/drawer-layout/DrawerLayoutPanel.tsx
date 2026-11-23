'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Box, Button, ButtonBase, Collapse, Drawer, IconButton, MenuItem, TextField, Tooltip, Typography, useMediaQuery, type Theme } from '@mui/material';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import ArticleOutlinedIcon from '@mui/icons-material/ArticleOutlined';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import ExpandMoreRoundedIcon from '@mui/icons-material/ExpandMoreRounded';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import PlaceOutlinedIcon from '@mui/icons-material/PlaceOutlined';
import RedoRoundedIcon from '@mui/icons-material/RedoRounded';
import RestartAltRoundedIcon from '@mui/icons-material/RestartAltRounded';
import UndoRoundedIcon from '@mui/icons-material/UndoRounded';
import ViewSidebarOutlinedIcon from '@mui/icons-material/ViewSidebarOutlined';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import { useQueryClient } from '@tanstack/react-query';
import { FormFieldsSkeleton } from '@/components/common/skeletons';
import {
    DRAWER_LAYOUTS_QUERY_KEY,
    useDrawerLayouts,
    useDrawerPieces,
    useRemoveDrawerPiece,
    useResetDrawerLayout,
    useSaveDrawerLayout,
    useSaveDrawerPiece,
} from '@/hooks/queries/useDrawerLayouts';
import { auditLogKeys } from '@/hooks/queries/useAuditLogs';
import { usePaginatedLeads } from '@/hooks/queries/useLeads';
import { LIMITS, cloneSection, pruneLayout, type DrawerBadge, type DrawerBlock, type DrawerLayoutDocument, type DrawerLayoutModule, type DrawerSection } from '@/lib/drawer-layout';
import type { FormConfigsPayload } from '@/types/formConfig.types';
import type { DrawerLayoutConfig, DrawerPiece } from '@/types/drawerLayout.types';
import { activeOptionValues, findCategory } from '@/utils/formConfig';
import {
    builtInPiecesFor,
    defaultLayoutFor,
    drawerAddressesFor,
    drawerFieldsFor,
    fieldBlock,
    formatDay,
    newLayoutId,
    newSection,
    useLayoutCtx,
    useLayoutHeader,
    type DrawerFieldDef,
} from '@/components/common/Drawer/layout';
import { ConfirmDeleteDialog, errorMessage, inputSx, primaryButtonSx, secondaryButtonSx, surfaceSx } from '../builderUi';
import { BuilderCanvas, type CanvasTab } from './BuilderCanvas';
import { BuilderPalette } from './BuilderPalette';
import { BuilderSettings } from './BuilderSettings';
import { LayoutDrag, type DragSource, type DropPlan, type DropResult, type DropTarget } from './LayoutDrag';
import { findBlock, findSection, insertBlock, insertSection, moveBlock, placeBadge, placeBlock, placeSection, removeBlock, removeSection, useLayoutEditor, type Selection } from './layoutEditor';
import { SAMPLE_RECORDS, SAMPLE_RECORD_ID } from './sampleRecords';

/**
 * Form Customization → Drawer Layout: the admin designs what a record's side drawer shows (header, badges and each
 * form tab's sections) by dragging fields, blocks and pieces onto a live copy of the drawer. Save puts it live for
 * every user straight away; Reset goes back to the built-in layout.
 */

type Notify = (message: string, severity?: 'success' | 'error' | 'info' | 'warning') => void;

const MODULE_NOUN: Record<DrawerLayoutModule, { one: string; many: string }> = { leads: { one: 'lead', many: 'leads' } };

const TAB_ICONS: Record<string, React.ReactNode> = {
    overview: <ArticleOutlinedIcon sx={{ fontSize: 17 }} />,
    address: <PlaceOutlinedIcon sx={{ fontSize: 17 }} />,
};

const countBlocks = (doc: DrawerLayoutDocument) => Object.values(doc.tabs).reduce((n, sections) => n + sections.reduce((m, s) => m + s.blocks.length, 0), 0);

/** Made-up values for the module's custom fields, so the sample record shows them too. */
function sampleCustomValues(fields: DrawerFieldDef[], configs: FormConfigsPayload): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const f of fields) {
        if (!f.custom) continue;
        const options = activeOptionValues(findCategory(configs, f.categoryKey));
        const values: Partial<Record<DrawerFieldDef['type'], unknown>> = {
            multiselect: options.slice(0, 2),
            select: options[0] ?? 'Option A',
            number: 42,
            amount: 125000,
            percentage: 18,
            date: '2026-12-01',
            phone: '+919812345678',
            email: 'someone@example.com',
            checkbox: true,
            uppercase: 'ABC123',
            pincode: '411001',
            textarea: `Sample notes for ${f.label}.`,
        };
        out[f.key] = f.type in values ? values[f.type] : `Sample ${f.label}`;
    }
    return out;
}

export function DrawerLayoutPanel({
    module,
    configs,
    canEdit,
    notify,
    formDraftDirty,
    onDirtyChange,
}: {
    module: DrawerLayoutModule;
    /** The saved form configuration: a layout can only use fields that are saved. */
    configs: FormConfigsPayload;
    canEdit: boolean;
    notify: Notify;
    formDraftDirty: boolean;
    onDirtyChange: (dirty: boolean) => void;
}) {
    const { data, isLoading, error, refetch } = useDrawerLayouts();
    if (isLoading) {
        return (
            <Box role="status" aria-label="Loading the drawer layout" sx={{ ...surfaceSx, p: { xs: 2, md: 3 } }}>
                <FormFieldsSkeleton fields={8} />
            </Box>
        );
    }
    if (error && !data) {
        return (
            <Alert
                severity="error"
                sx={{ borderRadius: '8px' }}
                action={
                    <Button color="inherit" size="small" onClick={() => void refetch()}>
                        Retry
                    </Button>
                }
            >
                Couldn&apos;t load the drawer layout: {errorMessage(error)}
            </Alert>
        );
    }
    return (
        <LayoutBuilder
            key={module}
            module={module}
            configs={configs}
            saved={data?.[module] ?? null}
            canEdit={canEdit}
            notify={notify}
            formDraftDirty={formDraftDirty}
            onDirtyChange={onDirtyChange}
        />
    );
}

function LayoutBuilder({
    module,
    configs,
    saved,
    canEdit,
    notify,
    formDraftDirty,
    onDirtyChange,
}: {
    module: DrawerLayoutModule;
    configs: FormConfigsPayload;
    saved: DrawerLayoutConfig | null;
    canEdit: boolean;
    notify: Notify;
    formDraftDirty: boolean;
    onDirtyChange: (dirty: boolean) => void;
}) {
    const readOnly = !canEdit;
    const noun = MODULE_NOUN[module];
    const queryClient = useQueryClient();
    const fields = useMemo(() => drawerFieldsFor(configs, module), [configs, module]);
    const fieldMap = useMemo(() => new Map(fields.map((f) => [f.key, f])), [fields]);
    const addresses = useMemo(() => drawerAddressesFor(configs, module), [configs, module]);

    // ─── Saved layout ↔ editor ──────────────────────────────────────────────────
    const load = useCallback(
        (config: DrawerLayoutConfig | null) => {
            if (!config) return { doc: defaultLayoutFor(module), version: null as number | null, removed: 0 };
            const addressSet = new Set(addresses.map((a) => a.prefix));
            const { doc, removed } = pruneLayout(config.layout, (k) => fieldMap.has(k), (p) => addressSet.has(p), defaultLayoutFor(module).header.titleField);
            return { doc, version: config.version as number | null, removed };
        },
        [module, fieldMap, addresses],
    );
    const [base, setBase] = useState(() => load(saved));
    const editor = useLayoutEditor(base.doc);
    const { doc, selection, edit, select, reset, undo, redo, canUndo, canRedo } = editor;
    const dirty = useMemo(() => doc !== base.doc && JSON.stringify(doc) !== JSON.stringify(base.doc), [doc, base.doc]);
    const serverVersion = saved?.version ?? null;
    /** Someone saved (or reset) the layout since it was loaded here. */
    const outdated = serverVersion !== base.version;

    useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);
    useEffect(() => () => onDirtyChange(false), [onDirtyChange]);

    const loadLatest = useCallback(() => {
        const next = load(saved);
        setBase(next);
        reset(next.doc);
    }, [load, saved, reset]);

    // A newer save from another admin (or tab) replaces the layout here unless there are edits to keep (adjusting
    // state while rendering, as React recommends over an effect: the next render sees base.version caught up).
    if (outdated && !dirty) loadLatest();

    // ─── Server actions ─────────────────────────────────────────────────────────
    const saveLayout = useSaveDrawerLayout(module);
    const resetLayout = useResetDrawerLayout(module);
    const piecesQuery = useDrawerPieces(module, canEdit);
    const savePiece = useSaveDrawerPiece(module);
    const removePiece = useRemoveDrawerPiece(module);
    const builtInPieces = useMemo(() => builtInPiecesFor(module), [module]);
    const [confirmReset, setConfirmReset] = useState(false);
    const [pieceToDelete, setPieceToDelete] = useState<DrawerPiece | null>(null);

    const handleSave = async () => {
        try {
            const result = await saveLayout.mutateAsync({ layout: doc, version: base.version });
            setBase({ doc, version: result.version, removed: 0 });
            notify(`Drawer layout saved: every ${noun.one} drawer shows it now.`, 'success');
            void queryClient.invalidateQueries({ queryKey: auditLogKeys.all });
        } catch (err) {
            notify(errorMessage(err, "Couldn't save the drawer layout."), 'error');
            void queryClient.invalidateQueries({ queryKey: DRAWER_LAYOUTS_QUERY_KEY });
        }
    };

    const handleReset = async () => {
        setConfirmReset(false);
        try {
            await resetLayout.mutateAsync();
            const builtIn = defaultLayoutFor(module);
            setBase({ doc: builtIn, version: null, removed: 0 });
            reset(builtIn);
            void queryClient.invalidateQueries({ queryKey: auditLogKeys.all });
            notify(`${noun.many[0].toUpperCase()}${noun.many.slice(1)} are back on the built-in drawer layout.`, 'success');
        } catch (err) {
            notify(errorMessage(err, "Couldn't reset the drawer layout."), 'error');
        }
    };

    const handleSavePiece = async (name: string, section: DrawerSection) => {
        try {
            await savePiece.mutateAsync({ name, section: { ...section, piece: undefined } });
            notify(`Saved “${name}” to Pieces.`, 'success');
            return true;
        } catch (err) {
            notify(errorMessage(err, "Couldn't save the piece."), 'error');
            return false;
        }
    };

    const handleRemovePiece = async () => {
        const piece = pieceToDelete;
        setPieceToDelete(null);
        if (!piece) return;
        try {
            await removePiece.mutateAsync(piece.id);
            notify(`Deleted the “${piece.name}” piece. Sections already on the drawer stay as they are.`, 'success');
        } catch (err) {
            notify(errorMessage(err, "Couldn't delete the piece."), 'error');
        }
    };

    // ─── Preview record, tabs, mode ─────────────────────────────────────────────
    // The 25 most recent leads to preview with (one page, not the whole list).
    const leadsQuery = usePaginatedLeads({ page: 1, limit: 25 }, { enabled: module === 'leads' });
    const records = useMemo(() => (module === 'leads' ? ((leadsQuery.data?.data ?? []) as unknown as Record<string, unknown>[]) : []), [module, leadsQuery.data]);
    const [sampleId, setSampleId] = useState(SAMPLE_RECORD_ID);
    const record = useMemo(() => {
        const picked = sampleId === SAMPLE_RECORD_ID ? undefined : records.find((r) => r.id === sampleId);
        return picked ?? { ...SAMPLE_RECORDS[module], customFields: sampleCustomValues(fields, configs) };
    }, [sampleId, records, module, fields, configs]);

    const ctx = useLayoutCtx(module, record, doc, undefined, configs);
    const header = useLayoutHeader(doc, ctx, true);

    const tabs: CanvasTab[] = useMemo(
        () =>
            (configs.moduleTabs?.[module]?.length ? configs.moduleTabs[module] : [{ key: 'overview', label: 'Overview' }]).map((t) => ({
                key: t.key,
                label: t.label,
                icon: TAB_ICONS[t.key] ?? <ArticleOutlinedIcon sx={{ fontSize: 17 }} />,
            })),
        [configs, module],
    );
    const [selectedTab, setTab] = useState(tabs[0]?.key ?? 'overview');
    const tab = selectedTab === '__changes' || tabs.some((t) => t.key === selectedTab) ? selectedTab : (tabs[0]?.key ?? 'overview');
    const [mode, setMode] = useState<'edit' | 'preview'>('edit');

    const wide = useMediaQuery((t: Theme) => t.breakpoints.up('lg'));
    const phone = useMediaQuery((t: Theme) => t.breakpoints.down('md'));
    const [sidePanel, setSidePanel] = useState<'add' | 'settings'>('add');
    const [paletteOpen, setPaletteOpen] = useState(false);

    const handleSelect = useCallback(
        (s: Selection | null) => {
            select(s);
            if (s) setSidePanel('settings');
        },
        [select],
    );

    // ─── Building blocks ────────────────────────────────────────────────────────
    const warn = (message: string) => notify(message, 'warning');
    /** Why the drawer has no room for more items here, if it hasn't. */
    const roomError = (blocks: number, sectionId?: string, newSectionTab?: string): string | null => {
        if (countBlocks(doc) + blocks > LIMITS.totalBlocks) return `A drawer can have at most ${LIMITS.totalBlocks} items.`;
        const section = sectionId ? findSection(doc, sectionId)?.section : undefined;
        if (section && section.blocks.length + 1 > LIMITS.blocksPerSection) return `A section can have at most ${LIMITS.blocksPerSection} items.`;
        if (newSectionTab && (doc.tabs[newSectionTab]?.length ?? 0) >= LIMITS.sectionsPerTab) return `A tab can have at most ${LIMITS.sectionsPerTab} sections.`;
        return null;
    };

    const makeBlock = (source: DragSource): DrawerBlock | null => {
        if (source.source === 'field') {
            const type = fieldMap.get(source.key)?.type ?? 'text';
            return fieldBlock(source.key, type, { width: type === 'textarea' || type === 'multiselect' ? 'full' : 'half' });
        }
        if (source.source !== 'block') return null;
        const id = newLayoutId('b');
        switch (source.blockType) {
            case 'heading':
                return { id, type: 'heading', text: 'Heading' };
            case 'text':
                return { id, type: 'text', text: 'Add a note for your team here.' };
            case 'divider':
                return { id, type: 'divider' };
            case 'address':
                return { id, type: 'address', prefix: source.prefix ?? addresses[0]?.prefix ?? 'primary', emptyText: '' };
            case 'customFields':
                return { id, type: 'customFields' };
            default:
                return null;
        }
    };

    /** Title of a section started by dropping a block on the tab. */
    const sectionTitleFor = (source: DragSource): string => {
        if (source.source === 'field' || (source.source === 'block' && source.blockType === 'address')) return source.label.toUpperCase();
        if (source.source === 'block' && source.blockType === 'customFields') return 'MORE DETAILS';
        if (source.source === 'canvas-block') return source.label.toUpperCase();
        return '';
    };

    /** A piece's section with fresh ids, minus fields the form no longer has. */
    const makePieceSection = (pieceId: string): DrawerSection | null => {
        const builtIn = builtInPieces.find((p) => p.id === pieceId);
        const stored = builtIn ? null : piecesQuery.data?.find((p) => p.id === pieceId);
        const section = builtIn ? builtIn.make() : stored ? { ...cloneSection(stored.section, newLayoutId), piece: stored.name } : null;
        if (!section) return null;
        const addressSet = new Set(addresses.map((a) => a.prefix));
        const blocks = section.blocks.filter((b) => (b.type === 'field' ? fieldMap.has(b.field) : b.type === 'address' ? addressSet.has(b.prefix) : true));
        return { ...section, blocks };
    };

    const newBadge = (field: string): DrawerBadge => ({
        id: newLayoutId('g'),
        field,
        prefix: field === 'rating' ? 'Rating: ' : '',
        style: field === 'rating' || field === 'status' ? 'auto' : 'neutral',
        hideEmpty: true,
    });

    const addBadge = (field?: string) => {
        if (doc.header.badges.length >= LIMITS.badges) return warn(`The header can have at most ${LIMITS.badges} badges.`);
        const used = new Set(doc.header.badges.map((b) => b.field));
        const key = field ?? fields.find((f) => !used.has(f.key) && f.key !== doc.header.titleField && !f.custom)?.key ?? fields[0]?.key;
        if (!key) return;
        const badge = newBadge(key);
        edit((d) => void d.header.badges.push(badge), { select: { kind: 'badge', id: badge.id } });
        setSidePanel('settings');
    };

    // ─── Drop / add ─────────────────────────────────────────────────────────────
    /**
     * What dropping `source` on each target does. New items are made once, here, so the live preview while dragging
     * and the drop itself use the same ids (the dropped item is the one the admin watched move into place).
     */
    const prepareDrop = (source: DragSource): DropPlan => {
        const block = makeBlock(source);
        const started = newSection(sectionTitleFor(source), source.source === 'block' && source.blockType === 'customFields' ? 2 : 1);
        const section = source.source === 'section' ? newSection('NEW SECTION', source.columns) : source.source === 'piece' ? makePieceSection(source.pieceId) : null;
        const badge = source.source === 'field' ? newBadge(source.key) : null;
        // Each drop inserts its own copy: an object handed to an immer draft would otherwise be changed in place.
        const copy = <T,>(value: T): T => structuredClone(value);

        return (target) => {
            switch (target.kind) {
                case 'block': {
                    if (source.source === 'canvas-block') {
                        const from = findBlock(doc, source.blockId);
                        if (!from) return null;
                        const error = from.section.id === target.sectionId ? null : roomError(0, target.sectionId);
                        if (error) return { error };
                        return { itemId: source.blockId, recipe: (d) => placeBlock(d, source.blockId, target.sectionId, target.index) };
                    }
                    if (!block) return null;
                    const error = roomError(1, target.sectionId);
                    if (error) return { error };
                    return { itemId: block.id, select: { kind: 'block', id: block.id }, recipe: (d) => insertBlock(d, target.sectionId, target.index, copy(block)) };
                }
                case 'newSection': {
                    if (source.source === 'canvas-block') {
                        const error = roomError(0, undefined, target.tab);
                        if (error) return { error };
                        return {
                            itemId: source.blockId,
                            createdSectionId: started.id,
                            select: { kind: 'block', id: source.blockId },
                            recipe: (d) => {
                                insertSection(d, target.tab, target.index, copy(started));
                                moveBlock(d, source.blockId, started.id, 0);
                            },
                        };
                    }
                    if (!block) return null;
                    const error = roomError(1, undefined, target.tab);
                    if (error) return { error };
                    return {
                        itemId: block.id,
                        createdSectionId: started.id,
                        select: { kind: 'block', id: block.id },
                        recipe: (d) => insertSection(d, target.tab, target.index, { ...copy(started), blocks: [copy(block)] }),
                    };
                }
                case 'section': {
                    if (source.source === 'canvas-section') return { itemId: source.sectionId, recipe: (d) => placeSection(d, source.sectionId, target.tab, target.index) };
                    if (!section) return null;
                    const error = roomError(section.blocks.length, undefined, target.tab);
                    if (error) return { error };
                    return { itemId: section.id, select: { kind: 'section', id: section.id }, recipe: (d) => insertSection(d, target.tab, target.index, copy(section)) };
                }
                case 'badge': {
                    if (source.source === 'canvas-badge') return { itemId: source.badgeId, recipe: (d) => placeBadge(d, source.badgeId, target.index) };
                    if (!badge) return null;
                    if (doc.header.badges.length >= LIMITS.badges) return { error: `The header can have at most ${LIMITS.badges} badges.` };
                    return { itemId: badge.id, select: { kind: 'badge', id: badge.id }, recipe: (d) => void d.header.badges.splice(target.index, 0, copy(badge)) };
                }
            }
        };
    };

    const commitDrop = (result: Extract<DropResult, { recipe: unknown }>) => {
        if (readOnly) return;
        edit(result.recipe, result.select ? { select: result.select } : undefined);
    };

    /** The + of a palette item: into the selected section (after the selected field), or a new section at the end of the tab. */
    const onAdd = (source: DragSource) => {
        if (readOnly) return;
        const workTab = tab === '__changes' ? (tabs[0]?.key ?? 'overview') : tab;
        if (workTab !== tab) setTab(workTab);
        if (mode === 'preview') setMode('edit');
        const selectedBlock = selection?.kind === 'block' ? findBlock(doc, selection.id) : null;
        const selectedSection = selection?.kind === 'section' ? findSection(doc, selection.id) : selectedBlock ? findSection(doc, selectedBlock.section.id) : null;
        const inTab = selectedSection && selectedSection.tab === workTab ? selectedSection : null;
        const isBlock = source.source === 'field' || source.source === 'block';
        let target: DropTarget;
        if (isBlock && inTab) {
            target = { kind: 'block', sectionId: inTab.section.id, index: selectedBlock && selectedBlock.section.id === inTab.section.id ? selectedBlock.index + 1 : inTab.section.blocks.length };
        } else if (isBlock) {
            target = { kind: 'newSection', tab: workTab, index: doc.tabs[workTab]?.length ?? 0 };
        } else {
            target = { kind: 'section', tab: workTab, index: inTab ? inTab.index + 1 : (doc.tabs[workTab]?.length ?? 0) };
        }
        const result = prepareDrop(source)(target);
        if (!result) return;
        if ('error' in result) return warn(result.error);
        commitDrop(result);
        // Bring the new item (the editor selects it) into view once it has rendered.
        window.setTimeout(() => document.querySelector('[data-layout-selected="true"]')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 80);
    };

    const onRemove = useCallback(
        (s: Selection) => {
            if (readOnly) return;
            if (s.kind === 'badge') edit((d) => void (d.header.badges = d.header.badges.filter((b) => b.id !== s.id)), { select: null });
            if (s.kind === 'block') edit((d) => removeBlock(d, s.id), { select: null });
            if (s.kind === 'section') {
                const at = findSection(doc, s.id);
                edit((d) => removeSection(d, s.id), { select: null });
                if (at && at.section.blocks.length > 0) notify(`Removed “${at.section.title.trim() || 'Untitled section'}”. Ctrl + Z brings it back.`, 'info');
            }
        },
        [readOnly, edit, doc, notify],
    );

    // Keyboard: Delete removes the selection, Esc clears it, Ctrl + Z / Ctrl + Shift + Z (or Ctrl + Y) undo and redo.
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            const target = e.target as HTMLElement | null;
            if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) || target.closest('[role="dialog"],[role="menu"],[role="listbox"]'))) return;
            const key = e.key.toLowerCase();
            if ((e.ctrlKey || e.metaKey) && key === 'z' && !readOnly) {
                e.preventDefault();
                if (e.shiftKey) redo();
                else undo();
            } else if ((e.ctrlKey || e.metaKey) && key === 'y' && !readOnly) {
                e.preventDefault();
                redo();
            } else if ((e.key === 'Delete' || e.key === 'Backspace') && selection && selection.kind !== 'header' && !readOnly && mode === 'edit') {
                e.preventDefault();
                onRemove(selection);
            } else if (e.key === 'Escape' && selection) {
                select(null);
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [selection, readOnly, mode, undo, redo, select, onRemove]);

    // ─── Rendering ──────────────────────────────────────────────────────────────
    const customFieldsPlaced = useMemo(() => Object.values(doc.tabs).some((sections) => sections.some((s) => s.blocks.some((b) => b.type === 'customFields'))), [doc]);
    const saving = saveLayout.isPending || resetLayout.isPending;

    const palette = (
        <BuilderPalette
            fields={fields}
            addresses={addresses}
            placed={ctx.placed}
            customFieldsPlaced={customFieldsPlaced}
            builtInPieces={builtInPieces}
            savedPieces={piecesQuery.data ?? []}
            piecesLoading={piecesQuery.isLoading}
            onAdd={onAdd}
            onRemovePiece={setPieceToDelete}
            readOnly={readOnly}
        />
    );

    const settings = (onClose?: () => void) => (
        <BuilderSettings
            editor={{ ...editor, select: handleSelect }}
            fields={fields}
            addresses={addresses}
            tabs={tabs}
            readOnly={readOnly}
            notify={notify}
            title={header.title}
            hotAvatarAvailable={module === 'leads'}
            onAddBadge={() => addBadge()}
            onRemove={onRemove}
            onShowTab={setTab}
            onSavePiece={handleSavePiece}
            savingPiece={savePiece.isPending}
            onClose={onClose}
        />
    );

    const canvas = (
        <BuilderCanvas
            doc={doc}
            ctx={ctx}
            tabs={tabs}
            tab={tab}
            onTab={setTab}
            mode={mode}
            selection={selection}
            onSelect={handleSelect}
            onRemoveSection={(id) => onRemove({ kind: 'section', id })}
            onAddBadge={() => addBadge()}
            readOnly={readOnly}
            footer={
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 2, py: 1.25, borderTop: '1px solid var(--mui-palette-border-main)', backgroundColor: 'var(--mui-palette-background-paper)' }}>
                    <LockOutlinedIcon sx={{ fontSize: 14, color: 'var(--mui-palette-text-muted)' }} />
                    <Typography sx={{ fontSize: '0.74rem', color: 'var(--mui-palette-text-muted)' }}>Footer buttons stay as they are for now.</Typography>
                </Box>
            }
        />
    );

    const sideSx = { ...surfaceSx, p: 1.5, minWidth: 0 } as const;
    const stickySx = wide || !phone ? ({ position: 'sticky', top: 16, maxHeight: 'calc(100vh - 32px)', overflowY: 'auto', alignSelf: 'start' } as const) : {};

    return (
        <LayoutDrag doc={doc} disabled={readOnly || mode === 'preview'} prepare={prepareDrop} onCommit={commitDrop} onReject={warn}>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                <Toolbar
                    noun={noun.one}
                    saved={saved}
                    dirty={dirty}
                    readOnly={readOnly}
                    saving={saving}
                    mode={mode}
                    onMode={(m) => {
                        setMode(m);
                        if (m === 'preview') select(null);
                    }}
                    canUndo={canUndo}
                    canRedo={canRedo}
                    onUndo={undo}
                    onRedo={redo}
                    sampleId={sampleId}
                    onSample={setSampleId}
                    records={records}
                    onDiscard={() => reset(base.doc, true)}
                    onReset={() => setConfirmReset(true)}
                    onSave={() => void handleSave()}
                />

                {outdated && dirty && (
                    <Alert
                        severity="warning"
                        sx={{ borderRadius: '8px' }}
                        action={
                            <Button color="inherit" size="small" onClick={loadLatest}>
                                Load theirs
                            </Button>
                        }
                    >
                        {saved ? `${saved.updatedBy ?? 'Another admin'} saved this layout after you opened it.` : 'Another admin reset this layout after you opened it.'} Load their
                        version (your unsaved changes are dropped), or keep editing and save over it after reloading.
                    </Alert>
                )}
                {base.removed > 0 && (
                    <Alert severity="info" sx={{ borderRadius: '8px' }}>
                        {base.removed} item{base.removed === 1 ? '' : 's'} of the saved layout used fields the form no longer has, so {base.removed === 1 ? "it's" : "they're"} left out. Save to
                        tidy the layout up.
                    </Alert>
                )}
                {formDraftDirty && canEdit && (
                    <Alert severity="info" sx={{ borderRadius: '8px' }}>
                        You have unsaved form changes. New or renamed fields show up here once those changes are saved.
                    </Alert>
                )}
                {readOnly && (
                    <Alert severity="info" sx={{ borderRadius: '8px' }}>
                        Only admins can change the drawer layout. You can look around and preview it.
                    </Alert>
                )}

                {wide ? (
                    <Box sx={{ display: 'grid', gridTemplateColumns: readOnly ? 'minmax(0, 1fr) 320px' : '280px minmax(0, 1fr) 320px', gap: 2, alignItems: 'start' }}>
                        {!readOnly && <Box sx={{ ...sideSx, ...stickySx }}>{palette}</Box>}
                        <Box sx={{ minWidth: 0 }}>{canvas}</Box>
                        <Box sx={{ ...sideSx, ...stickySx, p: 2 }}>{settings()}</Box>
                    </Box>
                ) : !phone ? (
                    <Box sx={{ display: 'grid', gridTemplateColumns: '300px minmax(0, 1fr)', gap: 2, alignItems: 'start' }}>
                        <Box sx={{ ...sideSx, ...stickySx }}>
                            {!readOnly && (
                                <SegmentedTabs
                                    value={sidePanel}
                                    onChange={setSidePanel}
                                    options={[
                                        ['add', 'Add'],
                                        ['settings', 'Settings'],
                                    ]}
                                />
                            )}
                            <Box sx={{ mt: readOnly ? 0 : 1.5 }}>{sidePanel === 'add' && !readOnly ? palette : settings()}</Box>
                        </Box>
                        <Box sx={{ minWidth: 0 }}>{canvas}</Box>
                    </Box>
                ) : (
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                        {!readOnly && mode === 'edit' && (
                            <Box sx={sideSx}>
                                <ButtonBase
                                    onClick={() => setPaletteOpen((o) => !o)}
                                    aria-expanded={paletteOpen}
                                    sx={{ width: '100%', justifyContent: 'space-between', gap: 1, fontFamily: 'inherit', borderRadius: '8px', p: 0.5 }}
                                >
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                        <AddRoundedIcon sx={{ fontSize: 18, color: 'var(--crm-text-blue-600)' }} />
                                        <Typography sx={{ fontSize: '0.86rem', fontWeight: 700, color: 'var(--crm-slate-900)' }}>Add fields, blocks or pieces</Typography>
                                    </Box>
                                    <ExpandMoreRoundedIcon sx={{ color: 'var(--mui-palette-text-secondary)', transform: paletteOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
                                </ButtonBase>
                                <Collapse in={paletteOpen} unmountOnExit>
                                    <Box sx={{ mt: 1.25, maxHeight: '55vh', overflowY: 'auto' }}>{palette}</Box>
                                </Collapse>
                            </Box>
                        )}
                        {canvas}
                        <Drawer
                            anchor="bottom"
                            open={Boolean(selection) && mode === 'edit'}
                            onClose={() => select(null)}
                            slotProps={{ paper: { sx: { borderTopLeftRadius: '16px', borderTopRightRadius: '16px', maxHeight: '75vh', p: 2, pb: 3, backgroundColor: 'var(--mui-palette-background-paper)' } } }}
                        >
                            <Box aria-hidden sx={{ width: 40, height: 4, borderRadius: '2px', backgroundColor: 'var(--mui-palette-border-strong)', mx: 'auto', mb: 1.5 }} />
                            {settings(() => select(null))}
                        </Drawer>
                    </Box>
                )}
            </Box>

            <ConfirmDeleteDialog open={confirmReset} title={`Reset ${noun.one} drawers to the built-in layout?`} confirmLabel="Reset for everyone" onConfirm={() => void handleReset()} onClose={() => setConfirmReset(false)}>
                <span>
                    The saved layout is removed and every {noun.one} drawer goes back to the built-in one straight away. Pieces saved to the library stay.
                </span>
            </ConfirmDeleteDialog>
            <ConfirmDeleteDialog open={Boolean(pieceToDelete)} title="Delete this saved piece?" onConfirm={() => void handleRemovePiece()} onClose={() => setPieceToDelete(null)}>
                <span>
                    “{pieceToDelete?.name}” is removed from Pieces for all admins. Sections already on the drawer stay as they are.
                </span>
            </ConfirmDeleteDialog>
        </LayoutDrag>
    );
}

function SegmentedTabs<K extends string>({ value, onChange, options }: { value: K; onChange: (v: K) => void; options: readonly (readonly [K, string])[] }) {
    return (
        <Box role="tablist" sx={{ display: 'grid', gridTemplateColumns: `repeat(${options.length}, 1fr)`, gap: 0.5, p: 0.4, borderRadius: '9px', backgroundColor: 'var(--mui-palette-background-subtle)', border: '1px solid var(--mui-palette-border-main)' }}>
            {options.map(([key, label]) => {
                const on = key === value;
                return (
                    <ButtonBase
                        key={key}
                        role="tab"
                        aria-selected={on}
                        onClick={() => onChange(key)}
                        sx={{
                            py: 0.6,
                            borderRadius: '7px',
                            fontSize: '0.8rem',
                            fontWeight: 600,
                            fontFamily: 'inherit',
                            border: on ? '1px solid var(--mui-palette-border-strong)' : '1px solid transparent',
                            backgroundColor: on ? 'var(--mui-palette-background-paper)' : 'transparent',
                            color: on ? 'var(--crm-text-blue-900)' : 'var(--mui-palette-text-secondary)',
                            '&:hover': on ? undefined : { backgroundColor: 'var(--mui-palette-primary-soft)', color: 'var(--crm-text-blue-700)' },
                            '&:focus-visible': { boxShadow: '0 0 0 3px rgb(var(--crm-accent-rgb) / 0.22)' },
                        }}
                    >
                        {label}
                    </ButtonBase>
                );
            })}
        </Box>
    );
}

const toolIconSx = {
    border: '1px solid var(--mui-palette-border-main)',
    borderRadius: '8px',
    color: 'var(--mui-palette-text-secondary)',
    backgroundColor: 'var(--mui-palette-background-paper)',
    transition: 'all 0.15s ease',
    '&:hover': { borderColor: 'var(--crm-blue-300)', backgroundColor: 'var(--mui-palette-primary-soft)', color: 'var(--crm-text-blue-700)' },
} as const;

function Toolbar({
    noun,
    saved,
    dirty,
    readOnly,
    saving,
    mode,
    onMode,
    canUndo,
    canRedo,
    onUndo,
    onRedo,
    sampleId,
    onSample,
    records,
    onDiscard,
    onReset,
    onSave,
}: {
    noun: string;
    saved: DrawerLayoutConfig | null;
    dirty: boolean;
    readOnly: boolean;
    saving: boolean;
    mode: 'edit' | 'preview';
    onMode: (m: 'edit' | 'preview') => void;
    canUndo: boolean;
    canRedo: boolean;
    onUndo: () => void;
    onRedo: () => void;
    sampleId: string;
    onSample: (id: string) => void;
    records: Record<string, unknown>[];
    onDiscard: () => void;
    onReset: () => void;
    onSave: () => void;
}) {
    const status = dirty ? 'Unsaved changes' : saved ? `Saved by ${saved.updatedBy ?? 'an admin'} on ${formatDay(saved.updatedAt.slice(0, 10))}` : 'Built-in layout';
    return (
        <Box sx={{ ...surfaceSx, px: { xs: 1.5, md: 2 }, py: 1.25, display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0, flex: '1 1 220px' }}>
                <Box sx={{ width: 34, height: 34, borderRadius: '9px', display: 'grid', placeItems: 'center', backgroundColor: 'var(--mui-palette-primary-soft)', color: 'var(--crm-text-blue-600)', flexShrink: 0 }}>
                    <ViewSidebarOutlinedIcon sx={{ fontSize: 19 }} />
                </Box>
                <Box sx={{ minWidth: 0 }}>
                    <Typography sx={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--crm-slate-900)' }}>Drawer layout</Typography>
                    <Typography noWrap sx={{ fontSize: '0.72rem', color: dirty ? 'var(--crm-orange-700)' : 'var(--mui-palette-text-secondary)', fontWeight: dirty ? 600 : 400 }}>
                        {status}
                    </Typography>
                </Box>
            </Box>

            <TextField
                select
                size="small"
                label="Preview with"
                value={records.some((r) => r.id === sampleId) ? sampleId : SAMPLE_RECORD_ID}
                onChange={(e) => onSample(e.target.value)}
                sx={{ ...inputSx, flex: '1 1 200px', maxWidth: { sm: 280 }, minWidth: 0 }}
            >
                <MenuItem value={SAMPLE_RECORD_ID} sx={{ fontSize: '0.84rem' }}>
                    Sample {noun} (made up)
                </MenuItem>
                {records.map((r) => (
                    <MenuItem key={String(r.id)} value={String(r.id)} sx={{ fontSize: '0.84rem' }}>
                        {[r.name, r.leadCode].filter(Boolean).join(' · ') || String(r.id)}
                    </MenuItem>
                ))}
            </TextField>

            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                <Box role="radiogroup" aria-label="Mode" sx={{ display: 'flex', p: 0.4, borderRadius: '9px', backgroundColor: 'var(--mui-palette-background-subtle)', border: '1px solid var(--mui-palette-border-main)' }}>
                    {(
                        [
                            ['edit', 'Edit', <EditOutlinedIcon key="e" sx={{ fontSize: 16 }} />],
                            ['preview', 'Preview', <VisibilityOutlinedIcon key="p" sx={{ fontSize: 16 }} />],
                        ] as const
                    ).map(([key, label, icon]) => {
                        const on = mode === key;
                        return (
                            <ButtonBase
                                key={key}
                                role="radio"
                                aria-checked={on}
                                onClick={() => onMode(key)}
                                sx={{
                                    display: 'inline-flex',
                                    gap: 0.5,
                                    px: 1.1,
                                    py: 0.5,
                                    borderRadius: '7px',
                                    fontSize: '0.78rem',
                                    fontWeight: 600,
                                    fontFamily: 'inherit',
                                    border: on ? '1px solid var(--mui-palette-border-strong)' : '1px solid transparent',
                                    backgroundColor: on ? 'var(--mui-palette-background-paper)' : 'transparent',
                                    color: on ? 'var(--crm-text-blue-900)' : 'var(--mui-palette-text-secondary)',
                                    '&:hover': on ? undefined : { backgroundColor: 'var(--mui-palette-primary-soft)', color: 'var(--crm-text-blue-700)' },
                                    '&:focus-visible': { boxShadow: '0 0 0 3px rgb(var(--crm-accent-rgb) / 0.22)' },
                                }}
                            >
                                {icon}
                                {label}
                            </ButtonBase>
                        );
                    })}
                </Box>
                {!readOnly && (
                    <>
                        <Tooltip title="Undo (Ctrl + Z)" arrow>
                            <span>
                                <IconButton size="small" aria-label="Undo" disabled={!canUndo || saving} onClick={onUndo} sx={toolIconSx}>
                                    <UndoRoundedIcon sx={{ fontSize: 18 }} />
                                </IconButton>
                            </span>
                        </Tooltip>
                        <Tooltip title="Redo (Ctrl + Shift + Z)" arrow>
                            <span>
                                <IconButton size="small" aria-label="Redo" disabled={!canRedo || saving} onClick={onRedo} sx={toolIconSx}>
                                    <RedoRoundedIcon sx={{ fontSize: 18 }} />
                                </IconButton>
                            </span>
                        </Tooltip>
                    </>
                )}
            </Box>

            {!readOnly && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, ml: { md: 'auto' }, flexWrap: 'wrap' }}>
                    {dirty && (
                        <Button size="small" variant="outlined" disabled={saving} onClick={onDiscard} sx={secondaryButtonSx}>
                            Discard
                        </Button>
                    )}
                    {saved && (
                        <Tooltip title={`Remove the saved layout: every ${noun} drawer goes back to the built-in one`} arrow>
                            <span>
                                <Button size="small" variant="outlined" disabled={saving} startIcon={<RestartAltRoundedIcon sx={{ fontSize: 17 }} />} onClick={onReset} sx={secondaryButtonSx}>
                                    Reset to built-in
                                </Button>
                            </span>
                        </Tooltip>
                    )}
                    <Tooltip title={dirty ? 'Goes live for every user straight away' : 'No unsaved changes'} arrow>
                        <span>
                            <Button
                                size="small"
                                variant="contained"
                                disabled={!dirty || saving}
                                onClick={onSave}
                                sx={{ ...primaryButtonSx, px: 2, '&.Mui-disabled': { background: 'var(--mui-palette-background-hover)', color: 'var(--mui-palette-text-muted)' } }}
                            >
                                {saving ? 'Saving…' : 'Save layout'}
                            </Button>
                        </span>
                    </Tooltip>
                </Box>
            )}
        </Box>
    );
}
