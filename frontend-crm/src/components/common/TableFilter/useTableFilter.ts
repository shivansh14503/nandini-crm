'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { tableFilterService } from '@/services/tableFilter.service';
import type { CrmModuleKey } from '@/types/formConfig.types';
import { activeConditionCount, applyCriteria, cleanCriteria } from './applyFilter';
import { useTableFilterFields, type ModuleFilterFields } from './filterFields';
import type { FilterCriteria, FilterSort, TableFilterLists } from './types';

const EMPTY_LISTS: TableFilterLists = { recent: [], saved: [] };
const listKey = (module: CrmModuleKey) => ['table-filters', module] as const;
/** The applied filter survives leaving the list and coming back (same browser tab). */
const sessionKey = (module: CrmModuleKey) => `crm.tableFilter.${module}`;

function readSession(module: CrmModuleKey): FilterCriteria | null {
    try {
        const raw = sessionStorage.getItem(sessionKey(module));
        const parsed = raw ? (JSON.parse(raw) as FilterCriteria) : null;
        return parsed && typeof parsed === 'object' && parsed.conditions ? parsed : null;
    } catch {
        return null;
    }
}

function writeSession(module: CrmModuleKey, criteria: FilterCriteria | null) {
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
    /** Called when a filter with an "Order by" is applied (hide Order by when omitted). */
    onSortChange?: (sort: FilterSort) => void;
    /** Called whenever the applied filter changes, e.g. to go back to the first page. */
    onChange?: () => void;
}

export interface TableFilterController<T = unknown> {
    module: CrmModuleKey;
    fields: ModuleFilterFields;
    /** Applied filter (null = none). */
    criteria: FilterCriteria | null;
    activeCount: number;
    filteredRows: T[];
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
    /** How many loaded records a draft filter would keep (live count in the dialog). */
    countMatches: (criteria: FilterCriteria) => number;
}

/**
 * State of a list's Filter dialog: the applied filter, the rows it keeps, and the user's recent / saved filters.
 * Filtering runs here over the loaded rows; pass `filteredRows` on to the tab, search, sort and pagination logic.
 */
export function useTableFilter<T>({ module, rows, onSortChange, onChange }: UseTableFilterOptions<T>): TableFilterController<T> {
    const fields = useTableFilterFields(module);
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
        const restored = readSession(module);
        if (restored) {
            // Syncing from sessionStorage, which can't be read during server rendering (would mismatch hydration).
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setCriteriaState(restored);
            if (restored.sort) onSortRef.current?.(restored.sort);
        }
    }, [module]);

    const setCriteria = useCallback(
        (next: FilterCriteria | null) => {
            setCriteriaState(next);
            writeSession(module, next);
            onChangeRef.current?.();
        },
        [module]
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

    const filteredRows = useMemo(() => applyCriteria(rows, criteria, fields.byKey), [rows, criteria, fields.byKey]);

    return {
        module,
        fields,
        criteria,
        activeCount: activeConditionCount(criteria),
        filteredRows,
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
        countMatches: (c) => applyCriteria(rows, c, fields.byKey).length,
    };
}
