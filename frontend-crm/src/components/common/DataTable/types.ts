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
    accessor?: keyof T | ((row: T) => any);
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
    onDeleteRow?: (row: T) => void;
    viewTooltip?: string;
    editTooltip?: string;
    deleteTooltip?: string;
    actionsPosition?: 'left' | 'right';
    actionsWidth?: number | string;
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
