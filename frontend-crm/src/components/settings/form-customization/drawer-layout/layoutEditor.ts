'use client';

import { useCallback, useMemo, useReducer } from 'react';
import { produce } from 'immer';
import type { DrawerBadge, DrawerBlock, DrawerLayoutDocument, DrawerSection } from '@/lib/drawer-layout';

/**
 * Drawer Layout builder state: the layout being edited, the selection, and undo / redo history. Edits go through
 * immer; typing into a text box (same `coalesceKey` within a second) is one undo step.
 */

export type Selection = { kind: 'header' } | { kind: 'badge'; id: string } | { kind: 'section'; id: string } | { kind: 'block'; id: string };

interface State {
    doc: DrawerLayoutDocument;
    selection: Selection | null;
    past: DrawerLayoutDocument[];
    future: DrawerLayoutDocument[];
    lastEdit: { key: string; at: number } | null;
}

type Action =
    | { type: 'reset'; doc: DrawerLayoutDocument; keepHistory?: boolean }
    | { type: 'edit'; recipe: (draft: DrawerLayoutDocument) => void; coalesceKey?: string; select?: Selection | null }
    | { type: 'select'; selection: Selection | null }
    | { type: 'undo' }
    | { type: 'redo' };

const HISTORY_LIMIT = 100;
const COALESCE_MS = 1000;

// ─── Lookups (work on drafts and plain documents) ───────────────────────────────

export function findSection(doc: DrawerLayoutDocument, id: string): { tab: string; index: number; section: DrawerSection } | null {
    for (const [tab, sections] of Object.entries(doc.tabs)) {
        const index = sections.findIndex((s) => s.id === id);
        if (index >= 0) return { tab, index, section: sections[index] };
    }
    return null;
}

export function findBlock(doc: DrawerLayoutDocument, id: string): { tab: string; section: DrawerSection; index: number; block: DrawerBlock } | null {
    for (const [tab, sections] of Object.entries(doc.tabs)) {
        for (const section of sections) {
            const index = section.blocks.findIndex((b) => b.id === id);
            if (index >= 0) return { tab, section, index, block: section.blocks[index] };
        }
    }
    return null;
}

export function findBadge(doc: DrawerLayoutDocument, id: string): { index: number; badge: DrawerBadge } | null {
    const index = doc.header.badges.findIndex((b) => b.id === id);
    return index >= 0 ? { index, badge: doc.header.badges[index] } : null;
}

function selectionExists(doc: DrawerLayoutDocument, s: Selection | null): boolean {
    if (!s) return false;
    if (s.kind === 'header') return true;
    if (s.kind === 'badge') return Boolean(findBadge(doc, s.id));
    if (s.kind === 'section') return Boolean(findSection(doc, s.id));
    return Boolean(findBlock(doc, s.id));
}

// ─── Mutations (call inside an edit recipe) ─────────────────────────────────────

export function insertSection(doc: DrawerLayoutDocument, tab: string, index: number, section: DrawerSection) {
    const list = (doc.tabs[tab] ??= []);
    list.splice(Math.max(0, Math.min(index, list.length)), 0, section);
}

export function moveSection(doc: DrawerLayoutDocument, id: string, tab: string, index: number) {
    const from = findSection(doc, id);
    if (!from) return;
    doc.tabs[from.tab].splice(from.index, 1);
    insertSection(doc, tab, from.tab === tab && from.index < index ? index - 1 : index, from.section);
}

export function removeSection(doc: DrawerLayoutDocument, id: string) {
    const at = findSection(doc, id);
    if (at) doc.tabs[at.tab].splice(at.index, 1);
}

export function insertBlock(doc: DrawerLayoutDocument, sectionId: string, index: number, block: DrawerBlock) {
    const at = findSection(doc, sectionId);
    if (!at) return;
    const list = doc.tabs[at.tab][at.index].blocks;
    list.splice(Math.max(0, Math.min(index, list.length)), 0, block);
}

export function moveBlock(doc: DrawerLayoutDocument, id: string, sectionId: string, index: number) {
    const from = findBlock(doc, id);
    if (!from) return;
    const sameSection = from.section.id === sectionId;
    from.section.blocks.splice(from.index, 1);
    insertBlock(doc, sectionId, sameSection && from.index < index ? index - 1 : index, from.block);
}

export function removeBlock(doc: DrawerLayoutDocument, id: string) {
    const at = findBlock(doc, id);
    if (at) at.section.blocks.splice(at.index, 1);
}

export function moveBadge(doc: DrawerLayoutDocument, id: string, index: number) {
    const from = findBadge(doc, id);
    if (!from) return;
    const list = doc.header.badges;
    list.splice(from.index, 1);
    list.splice(Math.max(0, Math.min(from.index < index ? index - 1 : index, list.length)), 0, from.badge);
}

/**
 * Puts an existing block / section / badge at `index` of the list it ends up in, counted without the item itself
 * (what a drag shows: the slot it lands in). The move helpers above count with the item still at its old place.
 */
export function placeBlock(doc: DrawerLayoutDocument, id: string, sectionId: string, index: number) {
    const from = findBlock(doc, id);
    if (from) moveBlock(doc, id, sectionId, from.section.id === sectionId && from.index <= index ? index + 1 : index);
}

export function placeSection(doc: DrawerLayoutDocument, id: string, tab: string, index: number) {
    const from = findSection(doc, id);
    if (from) moveSection(doc, id, tab, from.tab === tab && from.index <= index ? index + 1 : index);
}

export function placeBadge(doc: DrawerLayoutDocument, id: string, index: number) {
    const from = findBadge(doc, id);
    if (from) moveBadge(doc, id, from.index <= index ? index + 1 : index);
}

// ─── Reducer ────────────────────────────────────────────────────────────────────

function reducer(state: State, action: Action): State {
    switch (action.type) {
        case 'reset':
            return action.keepHistory
                ? { ...state, doc: action.doc, past: [...state.past, state.doc].slice(-HISTORY_LIMIT), future: [], lastEdit: null, selection: selectionExists(action.doc, state.selection) ? state.selection : null }
                : { doc: action.doc, selection: null, past: [], future: [], lastEdit: null };
        case 'edit': {
            const next = produce(state.doc, action.recipe);
            const selection = action.select !== undefined ? action.select : selectionExists(next, state.selection) ? state.selection : null;
            if (next === state.doc) return action.select !== undefined ? { ...state, selection } : state;
            const now = Date.now();
            const coalesce = Boolean(action.coalesceKey && state.lastEdit?.key === action.coalesceKey && now - state.lastEdit.at < COALESCE_MS);
            return {
                doc: next,
                selection,
                past: coalesce ? state.past : [...state.past, state.doc].slice(-HISTORY_LIMIT),
                future: [],
                lastEdit: action.coalesceKey ? { key: action.coalesceKey, at: now } : null,
            };
        }
        case 'select':
            return { ...state, selection: action.selection };
        case 'undo': {
            const previous = state.past.at(-1);
            if (!previous) return state;
            return { ...state, doc: previous, past: state.past.slice(0, -1), future: [state.doc, ...state.future], lastEdit: null, selection: selectionExists(previous, state.selection) ? state.selection : null };
        }
        case 'redo': {
            const next = state.future[0];
            if (!next) return state;
            return { ...state, doc: next, past: [...state.past, state.doc], future: state.future.slice(1), lastEdit: null, selection: selectionExists(next, state.selection) ? state.selection : null };
        }
        default:
            return state;
    }
}

export interface LayoutEditor {
    doc: DrawerLayoutDocument;
    selection: Selection | null;
    canUndo: boolean;
    canRedo: boolean;
    edit: (recipe: (draft: DrawerLayoutDocument) => void, options?: { coalesceKey?: string; select?: Selection | null }) => void;
    select: (selection: Selection | null) => void;
    /** Replace the document: a fresh start (load) or, with keepHistory, an undoable change (reset to built-in). */
    reset: (doc: DrawerLayoutDocument, keepHistory?: boolean) => void;
    undo: () => void;
    redo: () => void;
}

export function useLayoutEditor(initial: DrawerLayoutDocument): LayoutEditor {
    const [state, dispatch] = useReducer(reducer, initial, (doc): State => ({ doc, selection: null, past: [], future: [], lastEdit: null }));
    const edit = useCallback<LayoutEditor['edit']>((recipe, options) => dispatch({ type: 'edit', recipe, coalesceKey: options?.coalesceKey, select: options?.select }), []);
    const select = useCallback((selection: Selection | null) => dispatch({ type: 'select', selection }), []);
    const reset = useCallback((doc: DrawerLayoutDocument, keepHistory?: boolean) => dispatch({ type: 'reset', doc, keepHistory }), []);
    const undo = useCallback(() => dispatch({ type: 'undo' }), []);
    const redo = useCallback(() => dispatch({ type: 'redo' }), []);
    return useMemo(
        () => ({ doc: state.doc, selection: state.selection, canUndo: state.past.length > 0, canRedo: state.future.length > 0, edit, select, reset, undo, redo }),
        [state, edit, select, reset, undo, redo],
    );
}
