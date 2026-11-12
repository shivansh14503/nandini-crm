'use client';

import React, { createContext, useCallback, useContext, useMemo, useReducer } from 'react';
import { produce } from 'immer';
import type { PdfDocument, RenderOptions, SavedItemContent } from '@/lib/pdf-document';
import type { PdfFieldRegistry, PdfModule, PdfRenderContext } from '@/types/pdfTemplate.types';
import { selectionExists, type Selection } from './docOps';

/**
 * Builder state: the document being edited, the canvas selection, and undo / redo history. Edits go through
 * immer, so untouched sections / blocks keep their identity and memoised canvas views don't re-render.
 */

export type PanelTab = 'contents' | 'styling';

interface State {
    doc: PdfDocument;
    selection: Selection | null;
    /** Block whose text is being edited inline (TipTap). */
    editingBlockId: string | null;
    panelTab: PanelTab;
    past: PdfDocument[];
    future: PdfDocument[];
    lastEdit: { key: string; at: number } | null;
}

type Action =
    | { type: 'reset'; doc: PdfDocument }
    | { type: 'edit'; recipe: (draft: PdfDocument) => void; coalesceKey?: string; select?: Selection | null }
    | { type: 'select'; selection: Selection | null }
    | { type: 'editText'; blockId: string | null }
    | { type: 'panelTab'; tab: PanelTab }
    | { type: 'undo' }
    | { type: 'redo' };

const HISTORY_LIMIT = 100;
/** Edits with the same key within this window (typing, dragging a slider) share one undo step. */
const COALESCE_MS = 1000;

function keepSelection(doc: PdfDocument, selection: Selection | null): Selection | null {
    return selectionExists(doc, selection) ? selection : null;
}

function reducer(state: State, action: Action): State {
    switch (action.type) {
        case 'reset':
            return { ...state, doc: action.doc, selection: null, editingBlockId: null, panelTab: 'contents', past: [], future: [], lastEdit: null };
        case 'edit': {
            const next = produce(state.doc, action.recipe);
            const selection = action.select !== undefined ? action.select : keepSelection(next, state.selection);
            if (next === state.doc) return action.select !== undefined ? { ...state, selection, panelTab: selection ? 'styling' : state.panelTab } : state;
            const now = Date.now();
            const coalesce = Boolean(action.coalesceKey && state.lastEdit && state.lastEdit.key === action.coalesceKey && now - state.lastEdit.at < COALESCE_MS);
            return {
                ...state,
                doc: next,
                selection,
                panelTab: action.select ? 'styling' : selection ? state.panelTab : 'contents',
                past: coalesce ? state.past : [...state.past, state.doc].slice(-HISTORY_LIMIT),
                future: [],
                lastEdit: action.coalesceKey ? { key: action.coalesceKey, at: now } : null,
            };
        }
        case 'select':
            if (state.selection?.kind === action.selection?.kind && state.selection?.id === action.selection?.id) return state;
            return {
                ...state,
                selection: action.selection,
                editingBlockId: action.selection?.kind === 'block' && action.selection.id === state.editingBlockId ? state.editingBlockId : null,
                panelTab: action.selection ? 'styling' : 'contents',
            };
        case 'editText':
            return { ...state, editingBlockId: action.blockId, ...(action.blockId ? { selection: { kind: 'block', id: action.blockId } as Selection, panelTab: 'styling' as PanelTab } : {}) };
        case 'panelTab':
            return { ...state, panelTab: action.tab };
        case 'undo': {
            const previous = state.past[state.past.length - 1];
            if (!previous) return state;
            return { ...state, doc: previous, past: state.past.slice(0, -1), future: [state.doc, ...state.future], selection: keepSelection(previous, state.selection), editingBlockId: null, lastEdit: null };
        }
        case 'redo': {
            const next = state.future[0];
            if (!next) return state;
            return { ...state, doc: next, past: [...state.past, state.doc], future: state.future.slice(1), selection: keepSelection(next, state.selection), editingBlockId: null, lastEdit: null };
        }
        default:
            return state;
    }
}

export interface BuilderApi {
    doc: PdfDocument;
    selection: Selection | null;
    editingBlockId: string | null;
    panelTab: PanelTab;
    canUndo: boolean;
    canRedo: boolean;
    edit: (recipe: (draft: PdfDocument) => void, options?: { coalesceKey?: string; select?: Selection | null }) => void;
    select: (selection: Selection | null) => void;
    setEditingBlock: (blockId: string | null) => void;
    setPanelTab: (tab: PanelTab) => void;
    undo: () => void;
    redo: () => void;
    reset: (doc: PdfDocument) => void;
}

/** Read-mostly facts the builder components need (not part of undo history). */
export interface BuilderEnv {
    module: PdfModule;
    registry: PdfFieldRegistry;
    /** Record / sample context with the document's company details applied. */
    context: PdfRenderContext;
    renderOptions: RenderOptions;
    readOnly: boolean;
    notify: (message: string, severity?: 'success' | 'error' | 'info' | 'warning') => void;
    /** Opens the "Save to library" dialog for a section / block. */
    saveToLibrary: (content: SavedItemContent, suggestedName: string) => void;
}

const BuilderContext = createContext<BuilderApi | null>(null);
const EnvContext = createContext<BuilderEnv | null>(null);

/** Company details in the canvas come from the document's theme (the server does the same when printing). */
export function contextWithTheme(base: PdfRenderContext, theme: PdfDocument['theme']): PdfRenderContext {
    const company = (base.company && typeof base.company === 'object' ? base.company : {}) as Record<string, unknown>;
    const record = (base.record && typeof base.record === 'object' ? base.record : {}) as Record<string, unknown>;
    return {
        ...base,
        company: {
            ...company,
            companyName: theme.companyName || (typeof record.issuingCompany === 'string' ? record.issuingCompany : ''),
            companyAddress: theme.companyAddress,
            companyPhone: theme.companyPhone,
            companyEmail: theme.companyEmail,
            companyGstin: theme.companyGstin,
            companyWebsite: theme.companyWebsite,
        },
    };
}

export function BuilderProvider({
    initialDoc,
    env: envInput,
    baseContext,
    children,
}: {
    initialDoc: PdfDocument;
    env: Omit<BuilderEnv, 'context'>;
    /** Record / sample context from the API (company details are taken from the document). */
    baseContext: PdfRenderContext;
    children: React.ReactNode;
}) {
    const [state, dispatch] = useReducer(reducer, undefined, () => ({
        doc: initialDoc,
        selection: null,
        editingBlockId: null,
        panelTab: 'contents' as PanelTab,
        past: [],
        future: [],
        lastEdit: null,
    }));

    const edit = useCallback<BuilderApi['edit']>((recipe, options = {}) => dispatch({ type: 'edit', recipe, ...options }), []);
    const select = useCallback((selection: Selection | null) => dispatch({ type: 'select', selection }), []);
    const setEditingBlock = useCallback((blockId: string | null) => dispatch({ type: 'editText', blockId }), []);
    const setPanelTab = useCallback((tab: PanelTab) => dispatch({ type: 'panelTab', tab }), []);
    const undo = useCallback(() => dispatch({ type: 'undo' }), []);
    const redo = useCallback(() => dispatch({ type: 'redo' }), []);
    const reset = useCallback((doc: PdfDocument) => dispatch({ type: 'reset', doc }), []);

    const api = useMemo<BuilderApi>(
        () => ({
            doc: state.doc,
            selection: state.selection,
            editingBlockId: state.editingBlockId,
            panelTab: state.panelTab,
            canUndo: state.past.length > 0,
            canRedo: state.future.length > 0,
            edit,
            select,
            setEditingBlock,
            setPanelTab,
            undo,
            redo,
            reset,
        }),
        [state, edit, select, setEditingBlock, setPanelTab, undo, redo, reset],
    );

    const theme = state.doc.theme;
    const context = useMemo(() => contextWithTheme(baseContext, theme), [baseContext, theme]);
    const env = useMemo<BuilderEnv>(() => ({ ...envInput, context }), [envInput, context]);

    return (
        <EnvContext.Provider value={env}>
            <BuilderContext.Provider value={api}>{children}</BuilderContext.Provider>
        </EnvContext.Provider>
    );
}

export function useBuilder(): BuilderApi {
    const api = useContext(BuilderContext);
    if (!api) throw new Error('useBuilder must be used inside BuilderProvider');
    return api;
}

export function useBuilderEnv(): BuilderEnv {
    const env = useContext(EnvContext);
    if (!env) throw new Error('useBuilderEnv must be used inside BuilderProvider');
    return env;
}
