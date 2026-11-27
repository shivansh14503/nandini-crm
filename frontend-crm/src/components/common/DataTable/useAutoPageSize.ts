'use client';

import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { DataTablePaginationProps } from './types';

/** Page sizes the pagination bar offers when the view doesn't set its own (DataTablePagination's default). */
export const DEFAULT_PAGE_SIZE_OPTIONS = [10, 25, 50];

const STORAGE_PREFIX = 'crm_rows_per_page_';

function readStoredChoice(tableId: string | undefined): number | null {
    if (!tableId || typeof window === 'undefined') return null;
    try {
        const value = Number(window.localStorage.getItem(`${STORAGE_PREFIX}${tableId}`));
        return Number.isFinite(value) && value > 0 ? value : null;
    } catch {
        return null;
    }
}

function writeStoredChoice(tableId: string | undefined, size: number) {
    if (!tableId || typeof window === 'undefined') return;
    try {
        window.localStorage.setItem(`${STORAGE_PREFIX}${tableId}`, String(size));
    } catch {
        // Storage blocked (private mode): the choice still holds for this visit.
    }
}

/**
 * The smallest offered page size that shows every record (50 records → 50), or the largest size when there are
 * more records than that.
 */
export function pickAutoPageSize(totalCount: number, options: readonly number[]): number {
    const sorted = [...options].sort((a, b) => a - b);
    return sorted.find((size) => size >= totalCount) ?? sorted[sorted.length - 1];
}

/**
 * Rows per page that grows with the list: until the user picks a size in the rows-per-page selector, the list
 * uses the smallest page size that fits all its (filtered) records, capped at the largest size offered, and
 * re-picks it whenever the count changes. A size the user picks is kept per table (`tableId`, in localStorage)
 * and is never overridden.
 *
 * Works from the view's own pagination config (`totalCount` it already has, so no extra request). The size is
 * applied in a layout effect, so the first rows painted are already at the right page size (no flicker).
 *
 * Returns the config to render, whose `onRowsPerPageChange` records the user's choice.
 */
export function useAutoPageSize(
    tableId: string | undefined,
    config: DataTablePaginationProps | null,
    loading?: boolean
): DataTablePaginationProps | null {
    const [choice, setChoice] = useState<number | null>(() => readStoredChoice(tableId));
    const options = config?.pageSizeOptions ?? DEFAULT_PAGE_SIZE_OPTIONS;
    // A saved size the list no longer offers is ignored (back to automatic).
    const userSize = choice !== null && options.includes(choice) ? choice : null;
    const total = config?.totalCount ?? 0;
    // While the first load runs the count is not known yet: keep the current size until it is.
    const autoSize = loading || total === 0 ? null : pickAutoPageSize(total, options);

    const rowsPerPage = config?.rowsPerPage;
    const onRowsPerPageChange = config?.onRowsPerPageChange;
    const userSizeApplied = useRef(false);
    useLayoutEffect(() => {
        if (rowsPerPage === undefined || !onRowsPerPageChange) return;
        if (userSize !== null) {
            // Applied once when the list opens; later changes (e.g. the jump after an import) are left alone.
            if (userSizeApplied.current) return;
            userSizeApplied.current = true;
            if (rowsPerPage !== userSize) onRowsPerPageChange(userSize);
            return;
        }
        if (autoSize !== null && rowsPerPage !== autoSize) onRowsPerPageChange(autoSize);
        // onRowsPerPageChange is a fresh arrow each render in the views; it is only called, never tracked.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [userSize, autoSize, rowsPerPage]);

    const handleUserChange = useCallback(
        (size: number) => {
            userSizeApplied.current = true;
            setChoice(size);
            writeStoredChoice(tableId, size);
            onRowsPerPageChange?.(size);
        },
        [tableId, onRowsPerPageChange]
    );

    return useMemo(
        () => (config ? { ...config, onRowsPerPageChange: handleUserChange } : null),
        [config, handleUserChange]
    );
}
