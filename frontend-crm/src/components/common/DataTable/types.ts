import React from 'react';

export type SortOrder = 'asc' | 'desc';

export interface DataTableColumn<T> {
    id: string;
    label: string;
    width?: number | string;
    minWidth?: number | string;
    align?: 'left' | 'center' | 'right';
    sortable?: boolean;
    sortKey?: string;
    render?: (row: T, index: number) => React.ReactNode;
    accessor?: keyof T | ((row: T) => React.ReactNode);
    /** Hidden on first load and after Reset in the column manager. */
    defaultHidden?: boolean;
    /** Column manager section. Defaults to 'basic'. */
    category?: 'basic' | 'more';
    /** Cannot be hidden from the column manager (e.g. the primary Name/Code column). */
    locked?: boolean;
}

export interface DataTableFilterItem<TFilter extends string = string> {
    id: TFilter;
    label: string;
    count?: number;
    icon?: React.ReactElement;
    activeColor?: string;
    activeBgColor?: string;
    activeBadgeBgColor?: string;
    dotColor?: string;
}

export interface DataTableFilterPillsProps<TFilter extends string = string> {
    filters: DataTableFilterItem<TFilter>[];
    activeFilter: TFilter;
    onFilterChange: (filterId: TFilter) => void;
    variant?: 'chip' | 'pill';
}

export interface DataTableBulkActionItem {
    id: string;
    label: string;
    color?: 'inherit' | 'error';
    onClick: () => void;
}

export interface DataTableToolbarProps {
    searchQuery: string;
    onSearchChange: (value: string) => void;
    searchPlaceholder?: string;
    searchWidth?: number | string | Record<string, number | string>;
    onNewClick?: () => void;
    newButtonLabel?: string;
    onRefresh?: () => void;
    refreshTooltip?: string;
    selectedCount?: number;
    onBulkDelete?: () => void;
    bulkDeleteLabel?: string;
    extraActions?: React.ReactNode;
    // Extended toolbar options (used by Organizations table toolbar)
    variant?: 'standard' | 'extended';
    isAllPageSelected?: boolean;
    isSomePageSelected?: boolean;
    onToggleSelectAll?: () => void;
    onSelectAllMatching?: () => void;
    onSelectVisible?: () => void;
    onDeselectAll?: () => void;
    totalRecords?: number;
    displayTotalRecords?: string | number;
    currentPage?: number;
    rowsPerPage?: number;
    totalPages?: number;
    onPageChange?: (page: number) => void;
    bulkActionItems?: DataTableBulkActionItem[];
    onFilterClick?: () => void;
    /** Receives the clicked button so the column manager popover can anchor to it. */
    onColumnClick?: (anchorEl: HTMLElement) => void;
}

export interface DataTablePaginationProps {
    page: number;
    rowsPerPage: number;
    totalCount: number;
    onPageChange: (newPage: number) => void;
    onRowsPerPageChange: (newRowsPerPage: number) => void;
    pageSizeOptions?: number[];
    variant?: 'compact' | 'full';
    entityLabel?: string;
    displayTotalCount?: string | number;
    hideWhenEmpty?: boolean;
}

export interface DataTableProps<T> {
    data: T[];
    columns: DataTableColumn<T>[];
    keyExtractor?: (row: T, index: number) => string;

    // Selection
    selectable?: boolean;
    selectedIds?: Set<string> | string[];
    onToggleSelectRow?: (id: string) => void;
    onToggleSelectAll?: (checked?: boolean) => void;
    isAllSelected?: boolean;
    isIndeterminate?: boolean;

    // Sorting
    sortField?: string;
    sortOrder?: SortOrder;
    onSort?: (field: string) => void;

    // Actions Column
    renderActions?: (row: T, index: number) => React.ReactNode;
    onViewRow?: (row: T) => void;
    onEditRow?: (row: T) => void;
    /** Real-link URLs for the action icons (enables open-in-new-tab). */
    getViewHref?: (row: T) => string;
    getEditHref?: (row: T) => string;
    onDeleteRow?: (row: T) => void;
    viewTooltip?: string;
    editTooltip?: string;
    deleteTooltip?: string;
    actionsPosition?: 'left' | 'right';
    actionsWidth?: number | string;
    /** Horizontal alignment of the actions header and cells. Defaults to 'center'. */
    actionsAlign?: 'left' | 'center' | 'right';
    actionsHeaderLabel?: string;

    // Row interaction
    onRowClick?: (row: T) => void;
    activeRowId?: string | null;

    // Empty state customization
    emptyState?: React.ReactNode;
    emptyIcon?: React.ReactNode;
    emptyTitle?: string;
    emptyDescription?: string;
    emptyActionLabel?: string;
    onEmptyAction?: () => void;

    // Container styling
    minHeight?: number | string;
    stickyHeader?: boolean;
}
