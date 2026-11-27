'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { tableFilterService } from '@/services/tableFilter.service';
import { moduleNavLabel, type CrmModuleKey } from '@/types/formConfig.types';
import { activeConditionCount, applyCriteria, cleanCriteria } from './applyFilter';
import { useTableFilterFields, type ModuleFilterFields } from './filterFields';
import type { FilterCriteria, FilterSort, TableFilterLists, TableFilterScope } from './types';
import { useSearchScope } from '../../search/SearchScope';
import type { DataTableColumn } from '../DataTable/types';

const EMPTY_LISTS: TableFilterLists = { recent: [], saved: [] };
const listKey = (module: TableFilterScope) => ['table-filters', module] as const;
/** The applied filter survives leaving the list and coming back (same browser tab). */
const sessionKey = (module: TableFilterScope) => `crm.tableFilter.${module}`;

function readSession(module: TableFilterScope): FilterCriteria | null {
    try {
        const raw = sessionStorage.getItem(sessionKey(module));
        const parsed = raw ? (JSON.parse(raw) as FilterCriteria) : null;
        return parsed && typeof parsed === 'object' && parsed.conditions ? parsed : null;
    } catch {
        return null;
    }
}

function writeSession(module: TableFilterScope, criteria: FilterCriteria | null) {
    try {
        if (criteria) sessionStorage.setItem(sessionKey(module), JSON.stringify(criteria));
        else sessionStorage.removeItem(sessionKey(module));
    } catch {
        // Storage blocked: the filter just won't survive navigation.
    }
}

export interface UseTableFilterOptions<T> {
    module: CrmModuleKey;
    /** Every loaded record of the list (before tabs, search and pagination). */
    rows: T[];
    /** The list's columns: those that aren't form fields become filters through their `filter` spec. */
    columns?: DataTableColumn<T>[];
    /** Called when a filter with an "Order by" is applied (hide Order by when omitted). */
    onSortChange?: (sort: FilterSort) => void;
    /** Called whenever the applied filter changes, e.g. to go back to the first page. */
    onChange?: () => void;
}

export interface TableFilterController<T = unknown> {
    /** Where recent / saved filters are kept. */
    module: TableFilterScope;
    /** Dialog title: "Filter {title}". */
    title: string;
    fields: ModuleFilterFields;
    /** Applied filter (null = none). */
    criteria: FilterCriteria | null;
    activeCount: number;
    filteredRows: T[];
    /** Records the applied filter keeps; null when the filter runs on the server (no count). */
    matchCount: number | null;
    isOpen: boolean;
    open: () => void;
    close: () => void;
    lists: TableFilterLists;
    listsLoading: boolean;
    canSort: boolean;
    /** Applies (and records as recent) a filter; one with no complete condition clears instead. */
    apply: (criteria: FilterCriteria) => void;
    clear: () => void;
    removeCondition: (key: string) => void;
    save: (name: string, criteria: FilterCriteria) => Promise<void>;
    removeSaved: (id: string) => Promise<void>;
    /** Drops conditions on unknown fields and incomplete ones. */
    clean: (criteria: FilterCriteria) => FilterCriteria;
    /** How many loaded records a draft filter would keep (live count in the dialog); null when unknown. */
    countMatches: (criteria: FilterCriteria) => number | null;
}

/**
 * State of a list's Filter dialog: the applied filter, the rows it keeps, and the user's recent / saved filters.
 * Filtering runs here over the loaded rows; pass `filteredRows` on to the tab, search, sort and pagination logic.
 */
export function useTableFilter<T>(options: UseTableFilterOptions<T>): TableFilterController<T> {
    const fields = useTableFilterFields(options.module, options.columns);
    return useFilterController({ ...options, title: moduleNavLabel(options.module), fields });
}

export interface UseFilterControllerOptions<T> {
    module: TableFilterScope;
    title: string;
    fields: ModuleFilterFields;
    /** Loaded rows to filter in the browser; leave out when the filter runs on the server (read `criteria`). */
    rows?: T[];
    onSortChange?: (sort: FilterSort) => void;
    onChange?: () => void;
}

const NO_ROWS: never[] = [];

/**
 * The Filter dialog's state for any field set: useTableFilter for the module lists, or a screen whose filter runs on
 * the server (Admin › Audit Log), which passes no `rows` and sends `criteria` with its own requests.
 */
export function useFilterController<T>({ module, title, fields, rows, onSortChange, onChange }: UseFilterControllerOptions<T>): TableFilterController<T> {
    const serverSide = rows === undefined;
    // In the global search results the list starts unfiltered and leaves the list page's applied filter alone.
    const embedded = Boolean(useSearchScope());
    const queryClient = useQueryClient();
    const [criteria, setCriteriaState] = useState<FilterCriteria | null>(null);
    const [isOpen, setIsOpen] = useState(false);

    const onChangeRef = useRef(onChange);
    const onSortRef = useRef(onSortChange);
    useEffect(() => {
        onChangeRef.current = onChange;
        onSortRef.current = onSortChange;
    });

    // Restore after mount (sessionStorage isn't available during server rendering).
    useEffect(() => {
        if (embedded) return;
        const restored = readSession(module);
        if (restored) {
            // Syncing from sessionStorage, which can't be read during server rendering (would mismatch hydration).
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setCriteriaState(restored);
            if (restored.sort) onSortRef.current?.(restored.sort);
        }
    }, [module, embedded]);

    const setCriteria = useCallback(
        (next: FilterCriteria | null) => {
            setCriteriaState(next);
            if (!embedded) writeSession(module, next);
            onChangeRef.current?.();
        },
        [module, embedded]
    );

    const listsQuery = useQuery({
        queryKey: listKey(module),
        queryFn: () => tableFilterService.list(module),
        staleTime: 5 * 60 * 1000,
    });
    const setLists = useCallback((lists: TableFilterLists) => queryClient.setQueryData(listKey(module), lists), [queryClient, module]);

    const recordRecent = useMutation({
        mutationFn: (c: FilterCriteria) => tableFilterService.recordRecent(module, c),
        onSuccess: setLists,
    });
    const saveMutation = useMutation({
        mutationFn: ({ name, c }: { name: string; c: FilterCriteria }) => tableFilterService.save(module, name, c),
        onSuccess: setLists,
    });
    const removeMutation = useMutation({
        mutationFn: (id: string) => tableFilterService.remove(id),
        onSuccess: setLists,
    });

    const clean = useCallback((c: FilterCriteria) => cleanCriteria(c, fields.byKey), [fields.byKey]);

    const apply = useCallback(
        (next: FilterCriteria) => {
            const cleaned = clean(next);
            const hasConditions = activeConditionCount(cleaned) > 0;
            if (cleaned.sort) onSortRef.current?.(cleaned.sort);
            if (!hasConditions) {
                setCriteria(null);
                return;
            }
            setCriteria(cleaned);
            // Remembering it is best-effort: the filter is already applied.
            recordRecent.mutate(cleaned);
        },
        [clean, setCriteria, recordRecent]
    );

    const clear = useCallback(() => setCriteria(null), [setCriteria]);

    const removeCondition = useCallback(
        (key: string) => {
            if (!criteria) return;
            const conditions = { ...criteria.conditions };
            delete conditions[key];
            setCriteria(Object.keys(conditions).length ? { ...criteria, conditions } : null);
        },
        [criteria, setCriteria]
    );

    const filteredRows = useMemo(() => (rows ? applyCriteria(rows, criteria, fields.byKey) : (NO_ROWS as T[])), [rows, criteria, fields.byKey]);

    return {
        module,
        title,
        fields,
        criteria,
        activeCount: activeConditionCount(criteria),
        filteredRows,
        matchCount: serverSide ? null : filteredRows.length,
        isOpen,
        open: useCallback(() => setIsOpen(true), []),
        close: useCallback(() => setIsOpen(false), []),
        lists: listsQuery.data ?? EMPTY_LISTS,
        listsLoading: listsQuery.isLoading,
        canSort: Boolean(onSortChange),
        apply,
        clear,
        removeCondition,
        save: async (name, c) => {
            await saveMutation.mutateAsync({ name, c: clean(c) });
        },
        removeSaved: async (id) => {
            await removeMutation.mutateAsync(id);
        },
        clean,
        countMatches: (c) => (rows ? applyCriteria(rows, c, fields.byKey).length : null),
    };
}
