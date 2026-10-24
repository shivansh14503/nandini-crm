'use client';

import { useCallback, useMemo, useState, useSyncExternalStore } from 'react';
import type { DataTableColumn } from './types';

const STORAGE_PREFIX = 'crm_columns_';
const CHANGE_EVENT = 'crm-column-visibility-change';

const storageKey = (tableId: string) => `${STORAGE_PREFIX}${tableId}`;

function readRaw(tableId: string | undefined): string {
    if (!tableId) return '';
    try {
        return window.localStorage.getItem(storageKey(tableId)) ?? '';
    } catch {
        return '';
    }
}

function writeRaw(tableId: string, hidden: string[]): void {
    try {
        window.localStorage.setItem(storageKey(tableId), JSON.stringify(hidden));
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

function parseHidden(raw: string): string[] | null {
    if (!raw) return null;
    try {
        const parsed: unknown = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : null;
    } catch {
        return null;
    }
}

export interface ColumnVisibility<T> {
    visibleColumnIds: Set<string>;
    activeColumns: DataTableColumn<T>[];
    toggleColumn: (columnId: string) => void;
    resetDefaults: () => void;
}

/**
 * Tracks which table columns are hidden. Hidden ids (not visible ids) are stored so that
 * columns added later default to visible. Persists to localStorage (`crm_columns_${tableId}`) when `tableId` is given;
 * hydration-safe because the server snapshot is always "nothing stored".
 */
export function useColumnVisibility<T>(
    columns: DataTableColumn<T>[] | undefined,
    tableId?: string
): ColumnVisibility<T> {
    const [localHidden, setLocalHidden] = useState<string[] | null>(null);
    const storedRaw = useSyncExternalStore(
        subscribe,
        () => readRaw(tableId),
        () => ''
    );

    const allColumns = useMemo(() => columns ?? [], [columns]);

    const defaultHidden = useMemo(
        () => allColumns.filter((c) => c.defaultHidden).map((c) => c.id),
        [allColumns]
    );

    const hiddenIds = useMemo(() => {
        const explicit = tableId ? parseHidden(storedRaw) : localHidden;
        const hidden = new Set(explicit ?? defaultHidden);
        allColumns.forEach((c) => {
            if (c.locked) hidden.delete(c.id);
        });
        const anyVisible = allColumns.some((c) => !hidden.has(c.id));
        // Never allow an empty table: fall back to showing every column.
        return anyVisible ? hidden : new Set<string>();
    }, [tableId, storedRaw, localHidden, defaultHidden, allColumns]);

    const visibleColumnIds = useMemo(
        () => new Set(allColumns.filter((c) => !hiddenIds.has(c.id)).map((c) => c.id)),
        [allColumns, hiddenIds]
    );

    const activeColumns = useMemo(
        () => allColumns.filter((c) => visibleColumnIds.has(c.id)),
        [allColumns, visibleColumnIds]
    );

    const commit = useCallback(
        (hidden: string[]) => {
            if (tableId) writeRaw(tableId, hidden);
            else setLocalHidden(hidden);
        },
        [tableId]
    );

    const toggleColumn = useCallback(
        (columnId: string) => {
            if (allColumns.find((c) => c.id === columnId)?.locked) return;
            const next = new Set(hiddenIds);
            if (next.has(columnId)) {
                next.delete(columnId);
            } else {
                // Guard: keep at least one column visible.
                if (visibleColumnIds.size <= 1) return;
                next.add(columnId);
            }
            commit([...next]);
        },
        [allColumns, hiddenIds, visibleColumnIds, commit]
    );

    const resetDefaults = useCallback(() => commit(defaultHidden), [commit, defaultHidden]);

    return { visibleColumnIds, activeColumns, toggleColumn, resetDefaults };
}
