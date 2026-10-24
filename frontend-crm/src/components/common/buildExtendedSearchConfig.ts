import type { DataTableToolbarProps } from './DataTable';

export interface ExtendedSearchConfigOptions {
    searchQuery: string;
    onSearchChange: (value: string) => void;
    searchPlaceholder: string;
    /** Ids of the rows on the current page. */
    pageIds: string[];
    /** Ids of every row matching the current filters (all pages). */
    allIds: string[];
    selectedIds: string[];
    onSelectedIdsChange: (ids: string[]) => void;
    /** Zero-based current page. */
    page: number;
    rowsPerPage: number;
    totalRecords: number;
    onPageChange: (zeroBasedPage: number) => void;
    onBulkDelete?: () => void;
}

/**
 * Builds the Organizations-style extended toolbar config (select dropdown, bulk actions,
 * search and mini pager) for master views that keep zero-based pages and string[] selection.
 */
export function buildExtendedSearchConfig({
    searchQuery,
    onSearchChange,
    searchPlaceholder,
    pageIds,
    allIds,
    selectedIds,
    onSelectedIdsChange,
    page,
    rowsPerPage,
    totalRecords,
    onPageChange,
    onBulkDelete,
}: ExtendedSearchConfigOptions): DataTableToolbarProps {
    const selected = new Set(selectedIds);
    const selectedOnPage = pageIds.filter((id) => selected.has(id)).length;
    const isAllPageSelected = pageIds.length > 0 && selectedOnPage === pageIds.length;

    return {
        variant: 'extended',
        searchQuery,
        onSearchChange,
        searchPlaceholder,
        isAllPageSelected,
        isSomePageSelected: selectedOnPage > 0 && !isAllPageSelected,
        onToggleSelectAll: () => onSelectedIdsChange(isAllPageSelected ? [] : pageIds),
        onSelectAllMatching: () => onSelectedIdsChange(allIds),
        onSelectVisible: () => onSelectedIdsChange([...new Set([...selectedIds, ...pageIds])]),
        onDeselectAll: () => onSelectedIdsChange([]),
        totalRecords,
        currentPage: page + 1,
        rowsPerPage,
        totalPages: Math.max(1, Math.ceil(totalRecords / rowsPerPage)),
        onPageChange: (oneBasedPage) => onPageChange(oneBasedPage - 1),
        bulkActionItems: onBulkDelete
            ? [{ id: 'delete', label: 'Delete Selected', color: 'error', onClick: onBulkDelete }]
            : [],
    };
}
