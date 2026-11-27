import React from 'react';
import type { ColumnFilterSpec } from '../TableFilter/types';

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
    /** Cannot be hidden from the column manager (e.g. the primary Name/Code column). */
    locked?: boolean;
    /**
     * Form field (FormFieldDefinition.fieldKey) this column already shows, when it differs from `id`. Keeps the
     * column manager from adding a second column for the same field.
     */
    fieldKey?: string;
    /** Column manager heading for columns generated from form fields (the form section label). */
    group?: string;
    /** Place within the column manager: form tab first, then the field's position in the form. */
    groupOrder?: number;
    /**
     * Frozen at the table's left edge while it scrolls sideways. Set by the column manager (pins come first in the
     * column list); not meant to be set in column definitions.
     */
    pinned?: boolean;
    /**
     * The cell holds its own controls (buttons, a tel: link…): it gets no row link, so those stay clickable and the
     * browser's menu over them is theirs. Record links (RecordLink) don't need this.
     */
    interactive?: boolean;
    /**
     * How the list's Filter dialog filters this column when it isn't a form field (form fields are filtered from the
     * form config). `false`: not offered (the same data is already a filter under another field).
     */
    filter?: ColumnFilterSpec<T> | false;
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
    /** Applied filter conditions, shown as a badge on the filter button. */
    filterCount?: number;
    /** Receives the clicked button so the column manager popover can anchor to it. */
    onColumnClick?: (anchorEl: HTMLElement) => void;
    /** Leaves out the search-within-table box (e.g. tables on the global search results page). */
    hideSearch?: boolean;
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
    /** Undefined for a row hides its Edit icon (a record the user may see but not change). */
    getEditHref?: (row: T) => string | undefined;
    onDeleteRow?: (row: T) => void;
    /** False for a row hides its Delete icon (default: every row can be deleted). */
    canDeleteRow?: (row: T) => boolean;
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
    /** The record's full-page URL: Ctrl / Cmd + click anywhere on the row opens it in a new tab. */
    getRowHref?: (row: T) => string | undefined;
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
    /** First load still running: shows skeleton rows under the real header instead of the empty state. */
    loading?: boolean;
}
