'use client';

import React from 'react';
import { Box, Paper, SxProps, Theme } from '@mui/material';
import { AppBreadcrumbs, type BreadcrumbItem } from './AppBreadcrumbs';
import { EnterpriseFooter } from './EnterpriseFooter';
import {
    DataTable,
    DataTableFilterPills,
    DataTablePagination,
    DataTableToolbar,
    type DataTableColumn,
    type DataTableFilterPillsProps,
    type DataTablePaginationProps,
    type DataTableToolbarProps,
    type SortOrder,
} from './DataTable';

export interface CommonMasterViewProps<T = unknown, TFilter extends string = string> {
    /**
     * Optional custom breadcrumb elements. If omitted, AppBreadcrumbs is used with optional `breadcrumbItems`.
     */
    breadcrumbs?: React.ReactNode;
    /**
     * Optional breadcrumb items passed to AppBreadcrumbs if custom breadcrumbs element is omitted.
     */
    breadcrumbItems?: BreadcrumbItem[];
    /**
     * Declarative filter pills configuration.
     */
    filterConfig?: DataTableFilterPillsProps<TFilter>;
    /**
     * Custom filter controls (overrides `filterConfig` if provided).
     */
    filters?: React.ReactNode;
    /**
     * Optional action controls rendered on the right side of the filter row (e.g. Export, Filter/Views).
     */
    headerActions?: React.ReactNode;
    /**
     * Declarative search & toolbar configuration.
     */
    searchConfig?: DataTableToolbarProps;
    /**
     * Custom toolbar component (overrides `searchConfig` if provided).
     */
    toolbar?: React.ReactNode;
    /**
     * Generic table columns definition.
     */
    columns?: DataTableColumn<T>[];
    /**
     * Generic table row data.
     */
    data?: T[];
    /**
     * Unique key extractor for table rows.
     */
    keyExtractor?: (row: T, index: number) => string;
    /**
     * Row selection props.
     */
    selectable?: boolean;
    selectedIds?: Set<string> | string[];
    onToggleSelectRow?: (id: string) => void;
    onToggleSelectAll?: (checked?: boolean) => void;
    isAllSelected?: boolean;
    isIndeterminate?: boolean;
    /**
     * Sorting props.
     */
    sortField?: string;
    sortOrder?: SortOrder;
    onSort?: (field: string) => void;
    /**
     * Row action handlers.
     */
    onView?: (row: T) => void;
    onEdit?: (row: T) => void;
    onDelete?: (row: T) => void;
    onRowClick?: (row: T) => void;
    activeRowId?: string | null;
    viewTooltip?: string;
    editTooltip?: string;
    deleteTooltip?: string;
    actionsPosition?: 'left' | 'right';
    actionsWidth?: number | string;
    actionsHeaderLabel?: string;
    /**
     * Empty state customization.
     */
    emptyState?: React.ReactNode;
    emptyIcon?: React.ReactNode;
    emptyTitle?: string;
    emptyDescription?: string;
    emptyActionLabel?: string;
    onEmptyAction?: () => void;
    minHeight?: number | string;
    /**
     * Custom table component (overrides declarative `DataTable` if provided).
     */
    table?: React.ReactNode;
    /**
     * Table pagination config object or custom ReactNode displayed at the bottom of the table paper.
     */
    pagination?: DataTablePaginationProps | React.ReactNode;
    /**
     * Side detail drawer component (rendered outside the paper card).
     */
    drawer?: React.ReactNode;
    /**
     * Whether a side detail drawer is currently open, used to apply subtle blur to the background table.
     */
    isDrawerOpen?: boolean;
    /**
     * Toast notification component (e.g. AppToast).
     */
    toast?: React.ReactNode;
    /**
     * Optional custom footer. If omitted and `hideFooter` is false, EnterpriseFooter is rendered.
     */
    footer?: React.ReactNode;
    /**
     * Set to true to hide the EnterpriseFooter.
     */
    hideFooter?: boolean;
    /**
     * Children rendered inside the table paper card (useful if not passing `table` prop directly).
     */
    children?: React.ReactNode;
    /**
     * Custom sx styling for outer page container.
     */
    sx?: SxProps<Theme>;
    /**
     * Custom sx styling for the inner content container.
     */
    contentSx?: SxProps<Theme>;
    /**
     * Custom sx styling for the Paper table container.
     */
    paperSx?: SxProps<Theme>;
}

function isPaginationConfig(
    value: DataTablePaginationProps | React.ReactNode
): value is DataTablePaginationProps {
    return (
        typeof value === 'object' &&
        value !== null &&
        !React.isValidElement(value) &&
        'page' in value &&
        'rowsPerPage' in value &&
        'totalCount' in value &&
        'onPageChange' in value
    );
}

/**
 * CommonMasterView provides a unified, generic, declarative page template for all master CRM views:
 * 1. Line 1: Route-aware Breadcrumbs.
 * 2. Line 2: Filter pills (`filterConfig`) and optional right-aligned header actions.
 * 3. Line 3: Standard Paper table card housing Toolbar (`searchConfig`), `DataTable<T>`, and `DataTablePagination`.
 * 4. Outside: Detail drawer, standard Enterprise CRM Footer, and Toast notifications.
 */
export function CommonMasterView<T = unknown, TFilter extends string = string>({
    breadcrumbs,
    breadcrumbItems,
    filterConfig,
    filters,
    headerActions,
    searchConfig,
    toolbar,
    columns,
    data,
    keyExtractor,
    selectable = true,
    selectedIds,
    onToggleSelectRow,
    onToggleSelectAll,
    isAllSelected,
    isIndeterminate,
    sortField,
    sortOrder,
    onSort,
    onView,
    onEdit,
    onDelete,
    onRowClick,
    activeRowId,
    viewTooltip,
    editTooltip,
    deleteTooltip,
    actionsPosition = 'left',
    actionsWidth = 70,
    actionsHeaderLabel = 'ACTIONS',
    emptyState,
    emptyIcon,
    emptyTitle,
    emptyDescription,
    emptyActionLabel,
    onEmptyAction,
    minHeight = 280,
    table,
    pagination,
    drawer,
    isDrawerOpen = false,
    toast,
    footer,
    hideFooter = false,
    children,
    sx,
    contentSx,
    paperSx,
}: CommonMasterViewProps<T, TFilter>) {
    const resolvedFilters =
        filters ?? (filterConfig ? <DataTableFilterPills<TFilter> {...filterConfig} /> : null);

    const resolvedToolbar =
        toolbar ?? (searchConfig ? <DataTableToolbar {...searchConfig} /> : null);

    const resolvedTable =
        table ??
        (columns && data ? (
            <DataTable<T>
                data={data}
                columns={columns}
                keyExtractor={keyExtractor}
                selectable={selectable}
                selectedIds={selectedIds}
                onToggleSelectRow={onToggleSelectRow}
                onToggleSelectAll={onToggleSelectAll}
                isAllSelected={isAllSelected}
                isIndeterminate={isIndeterminate}
                sortField={sortField}
                sortOrder={sortOrder}
                onSort={onSort}
                onViewRow={onView}
                onEditRow={onEdit}
                onDeleteRow={onDelete}
                onRowClick={onRowClick}
                activeRowId={activeRowId}
                viewTooltip={viewTooltip}
                editTooltip={editTooltip}
                deleteTooltip={deleteTooltip}
                actionsPosition={actionsPosition}
                actionsWidth={actionsWidth}
                actionsHeaderLabel={actionsHeaderLabel}
                emptyState={emptyState}
                emptyIcon={emptyIcon}
                emptyTitle={emptyTitle}
                emptyDescription={emptyDescription}
                emptyActionLabel={emptyActionLabel}
                onEmptyAction={onEmptyAction}
                minHeight={minHeight}
            />
        ) : null);

    const resolvedPagination = isPaginationConfig(pagination) ? (
        <DataTablePagination {...pagination} />
    ) : (
        pagination
    );

    return (
        <Box
            sx={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                minHeight: 'calc(100vh - 64px)',
                backgroundColor: '#f8fafc',
                width: '100%',
                ...sx,
            }}
        >
            {/* ── Main Page Content ────────────────────────────────────────── */}
            <Box
                sx={{
                    px: { xs: 2, md: 3 },
                    pt: 2,
                    pb: 2,
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    minHeight: 0,
                    ...contentSx,
                }}
            >
                {/* ── Line 1: Route-Aware Breadcrumbs ── */}
                <Box sx={{ mb: 1.5 }}>
                    {breadcrumbs || <AppBreadcrumbs items={breadcrumbItems} />}
                </Box>

                {/* ── Line 2: All Filters & Optional Header Actions ── */}
                {(resolvedFilters || headerActions) && (
                    <Box
                        sx={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            flexWrap: 'wrap',
                            gap: 1.5,
                            mb: 2,
                        }}
                    >
                        <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 1, minWidth: 0 }}>
                            {resolvedFilters}
                        </Box>
                        {headerActions && (
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                                {headerActions}
                            </Box>
                        )}
                    </Box>
                )}

                {/* ── Line 3: Main Table Card ── */}
                <Paper
                    elevation={0}
                    sx={{
                        border: '1px solid #e2e8f0',
                        borderRadius: '10px',
                        backgroundColor: '#ffffff',
                        display: 'flex',
                        flexDirection: 'column',
                        flex: 1,
                        overflow: 'hidden',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                        filter: isDrawerOpen ? 'blur(1.5px)' : 'none',
                        transition: 'filter 0.2s ease-in-out',
                        ...paperSx,
                    }}
                >
                    {/* Search & Action Toolbar */}
                    {resolvedToolbar}

                    {/* Table View */}
                    {resolvedTable}
                    {children}

                    {/* Pagination Bar */}
                    {resolvedPagination}
                </Paper>
            </Box>

            {/* ── Modular Detail Drawer ────────────────────────────────────── */}
            {drawer}

            {/* ── Enterprise CRM Global Footer ─────────────────────────────── */}
            {!hideFooter && (footer || <EnterpriseFooter />)}

            {/* ── Toast Notifications ──────────────────────────────────────── */}
            {toast}
        </Box>
    );
}

export { CommonMasterView as MasterViewLayout };
