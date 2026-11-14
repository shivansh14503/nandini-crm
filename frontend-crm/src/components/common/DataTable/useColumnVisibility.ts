'use client';

import { useCallback, useMemo, useState, useSyncExternalStore } from 'react';
import type { DataTableColumn } from './types';

const STORAGE_PREFIX = 'crm_columns_';
const CHANGE_EVENT = 'crm-column-visibility-change';

const storageKey = (tableId: string) => `${STORAGE_PREFIX}${tableId}`;

/** Most columns that can be pinned at once, so frozen columns never take over the screen. */
export const MAX_PINNED_COLUMNS = 4;

/**
 * Explicit choices that differ from each column's default: `hidden` lists columns shown by default that the user
 * hid, `shown` lists `defaultHidden` columns the user switched on. Columns added later keep their own default.
 * `pinned` lists the columns frozen at the table's left edge, in the order they were pinned.
 */
interface VisibilityPrefs {
    hidden: string[];
    shown: string[];
    pinned: string[];
}

const EMPTY_PREFS: VisibilityPrefs = { hidden: [], shown: [], pinned: [] };

function readRaw(tableId: string | undefined): string {
    if (!tableId) return '';
    try {
        return window.localStorage.getItem(storageKey(tableId)) ?? '';
    } catch {
        return '';
    }
}

function writeRaw(tableId: string, prefs: VisibilityPrefs): void {
    try {
        window.localStorage.setItem(storageKey(tableId), JSON.stringify(prefs));
    } catch {
        // Storage unavailable (private mode / quota): ignore, preference just won't persist.
    }
    window.dispatchEvent(new Event(CHANGE_EVENT));
}

function subscribe(onChange: () => void): () => void {
    window.addEventListener('storage', onChange);
    window.addEventListener(CHANGE_EVENT, onChange);
    return () => {
        window.removeEventListener('storage', onChange);
        window.removeEventListener(CHANGE_EVENT, onChange);
    };
}

const strings = (value: unknown): string[] =>
    Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];

function parsePrefs(raw: string): VisibilityPrefs | null {
    if (!raw) return null;
    try {
        const parsed: unknown = JSON.parse(raw);
        // Legacy format: a plain list of hidden column ids.
        if (Array.isArray(parsed)) return { ...EMPTY_PREFS, hidden: strings(parsed) };
        if (parsed && typeof parsed === 'object') {
            const obj = parsed as Record<string, unknown>;
            return { hidden: strings(obj.hidden), shown: strings(obj.shown), pinned: strings(obj.pinned) };
        }
        return null;
    } catch {
        return null;
    }
}

export interface ColumnVisibility<T> {
    visibleColumnIds: Set<string>;
    /** Visible columns in display order: pinned ones first (flagged `pinned`, in pin order), then the rest. */
    activeColumns: DataTableColumn<T>[];
    /** Pinned (frozen) column ids, in pin order. */
    pinnedColumnIds: string[];
    toggleColumn: (columnId: string) => void;
    /** Shows or hides several columns at once (locked columns and the last visible column are kept). */
    setColumnsVisible: (columnIds: string[], visible: boolean) => void;
    /** Pins a column (showing it if hidden) or unpins it. Ignored past MAX_PINNED_COLUMNS. */
    togglePin: (columnId: string) => void;
    resetDefaults: () => void;
}

/**
 * Tracks which table columns are visible and which are pinned. Persists to localStorage
 * (`crm_columns_${tableId}`) when `tableId` is given; hydration-safe because the server snapshot is always
 * "nothing stored".
 */
export function useColumnVisibility<T>(
    columns: DataTableColumn<T>[] | undefined,
    tableId?: string
): ColumnVisibility<T> {
    const [localPrefs, setLocalPrefs] = useState<VisibilityPrefs | null>(null);
    const storedRaw = useSyncExternalStore(
        subscribe,
        () => readRaw(tableId),
        () => ''
    );

    const allColumns = useMemo(() => columns ?? [], [columns]);
    const prefs = useMemo<VisibilityPrefs>(
        () => (tableId ? parsePrefs(storedRaw) : localPrefs) ?? EMPTY_PREFS,
        [tableId, storedRaw, localPrefs]
    );

    const visibleColumnIds = useMemo(() => {
        const hidden = new Set(prefs.hidden);
        const shown = new Set(prefs.shown);
        const isVisible = (c: DataTableColumn<T>) =>
            Boolean(c.locked) || (c.defaultHidden ? shown.has(c.id) : !hidden.has(c.id));
        const visible = allColumns.filter(isVisible);
        // Never allow an empty table: fall back to the default set (or every column).
        const fallback = allColumns.filter((c) => !c.defaultHidden || c.locked);
        return new Set((visible.length > 0 ? visible : fallback.length > 0 ? fallback : allColumns).map((c) => c.id));
    }, [allColumns, prefs]);

    // Only pins of columns that exist and are visible count (a pinned column is always shown, see togglePin).
    const pinnedColumnIds = useMemo(
        () => prefs.pinned.filter((id) => visibleColumnIds.has(id)).slice(0, MAX_PINNED_COLUMNS),
        [prefs.pinned, visibleColumnIds]
    );

    const activeColumns = useMemo(() => {
        const byId = new Map(allColumns.map((c) => [c.id, c]));
        const pinned = pinnedColumnIds.map((id) => ({ ...byId.get(id)!, pinned: true }));
        const pinnedSet = new Set(pinnedColumnIds);
        const rest = allColumns.filter((c) => visibleColumnIds.has(c.id) && !pinnedSet.has(c.id));
        return [...pinned, ...rest];
    }, [allColumns, visibleColumnIds, pinnedColumnIds]);

    const commit = useCallback(
        (next: VisibilityPrefs) => {
            if (tableId) writeRaw(tableId, next);
            else setLocalPrefs(next);
        },
        [tableId]
    );

    /** `prefs` with the given columns shown / hidden (hiding also unpins). */
    const withVisibility = useCallback(
        (base: VisibilityPrefs, columnIds: string[], visible: boolean): VisibilityPrefs => {
            const hidden = new Set(base.hidden);
            const shown = new Set(base.shown);
            const pinned = [...base.pinned];
            let visibleCount = visibleColumnIds.size;
            for (const id of columnIds) {
                const column = allColumns.find((c) => c.id === id);
                if (!column || column.locked || visibleColumnIds.has(id) === visible) continue;
                if (!visible) {
                    // Guard: keep at least one column visible.
                    if (visibleCount <= 1) continue;
                    visibleCount--;
                    const at = pinned.indexOf(id);
                    if (at >= 0) pinned.splice(at, 1);
                } else {
                    visibleCount++;
                }
                if (column.defaultHidden) {
                    if (visible) shown.add(id);
                    else shown.delete(id);
                } else if (visible) {
                    hidden.delete(id);
                } else {
                    hidden.add(id);
                }
            }
            return { hidden: [...hidden], shown: [...shown], pinned };
        },
        [allColumns, visibleColumnIds]
    );

    const setColumnsVisible = useCallback(
        (columnIds: string[], visible: boolean) => commit(withVisibility(prefs, columnIds, visible)),
        [commit, withVisibility, prefs]
    );

    const toggleColumn = useCallback(
        (columnId: string) => setColumnsVisible([columnId], !visibleColumnIds.has(columnId)),
        [setColumnsVisible, visibleColumnIds]
    );

    const togglePin = useCallback(
        (columnId: string) => {
            if (pinnedColumnIds.includes(columnId)) {
                commit({ ...prefs, pinned: pinnedColumnIds.filter((id) => id !== columnId) });
                return;
            }
            if (pinnedColumnIds.length >= MAX_PINNED_COLUMNS) return;
            // A pinned column is always visible: show it first if it was hidden.
            const next = withVisibility(prefs, [columnId], true);
            commit({ ...next, pinned: [...pinnedColumnIds, columnId] });
        },
        [commit, prefs, pinnedColumnIds, withVisibility]
    );

    const resetDefaults = useCallback(() => commit(EMPTY_PREFS), [commit]);

    return { visibleColumnIds, activeColumns, pinnedColumnIds, toggleColumn, setColumnsVisible, togglePin, resetDefaults };
}
