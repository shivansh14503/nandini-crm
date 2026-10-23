'use client';

import React from 'react';
import { Box, GlobalStyles, Paper, SxProps, Theme } from '@mui/material';
import { AppBreadcrumbs, type BreadcrumbItem } from './AppBreadcrumbs';
import { EnterpriseFooter } from './EnterpriseFooter';
import { DrawerStackContext, type DrawerStackContextValue } from './Drawer/DrawerStackContext';
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
     * Left-side related modules sidebar component (rendered alongside the detail drawer).
     */
    relatedSidebar?: React.ReactNode;
    /**
     * Middle panel table displaying records for the selected related module.
     */
    relatedRecordsTable?: React.ReactNode;
    /**
     * Primary side detail drawer component (rendered outside the paper card).
     */
    drawer?: React.ReactNode;
    /**
     * Top stacked secondary detail drawer component (LIFO stack above primary drawer).
     */
    secondaryDrawer?: React.ReactNode;
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
    relatedSidebar,
    relatedRecordsTable,
    drawer,
    secondaryDrawer,
    isDrawerOpen = false,
    toast,
    footer,
    hideFooter = false,
    children,
    sx,
    contentSx,
    paperSx,
}: CommonMasterViewProps<T, TFilter>) {
    const [isRightDrawerCollapsed, setIsRightDrawerCollapsed] = React.useState(false);
    const hasSecondaryDrawer = Boolean(secondaryDrawer);

    // Collapse the whole stack together; expand again whenever the stack changes.
    React.useEffect(() => {
        if (!isDrawerOpen) {
            setIsRightDrawerCollapsed(false);
        }
    }, [isDrawerOpen]);

    React.useEffect(() => {
        if (hasSecondaryDrawer) {
            setIsRightDrawerCollapsed(false);
        }
    }, [hasSecondaryDrawer]);

    const toggleRightDrawerCollapsed = React.useCallback(() => {
        setIsRightDrawerCollapsed((prev) => !prev);
    }, []);

    const resetRightDrawerCollapsed = React.useCallback(() => {
        setIsRightDrawerCollapsed(false);
    }, []);

    const baseDrawerStackValue = React.useMemo<DrawerStackContextValue>(
        () => ({
            isCollapsed: isRightDrawerCollapsed,
            onToggleCollapse: toggleRightDrawerCollapsed,
            onCollapseReset: resetRightDrawerCollapsed,
            showBookmark: !hasSecondaryDrawer,
        }),
        [isRightDrawerCollapsed, toggleRightDrawerCollapsed, resetRightDrawerCollapsed, hasSecondaryDrawer]
    );

    const topDrawerStackValue = React.useMemo<DrawerStackContextValue>(
        () => ({
            isCollapsed: isRightDrawerCollapsed,
            onToggleCollapse: toggleRightDrawerCollapsed,
            onCollapseReset: resetRightDrawerCollapsed,
            showBookmark: true,
        }),
        [isRightDrawerCollapsed, toggleRightDrawerCollapsed, resetRightDrawerCollapsed]
    );

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
                minWidth: 0,
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
                    minWidth: 0,
                    width: '100%',
                    ...contentSx,
                }}
            >
                {/* ── Line 1: Route-Aware Breadcrumbs ── */}
                <Box sx={{ mb: 1.5, minWidth: 0 }}>
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
                            minWidth: 0,
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

                    {/* ── Line 3: Main Table Card (Base z-index: 1) ── */}
                <Paper
                    elevation={0}
                    sx={{
                        position: 'relative',
                        zIndex: 1,
                        border: '1px solid #e2e8f0',
                        borderRadius: '10px',
                        backgroundColor: '#ffffff',
                        display: 'flex',
                        flexDirection: 'column',
                        flex: 1,
                        overflow: 'hidden',
                        minWidth: 0,
                        width: '100%',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                        filter: isDrawerOpen && !isRightDrawerCollapsed ? 'blur(1.5px)' : 'none',
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

            {/* ── Layered LIFO Drawer Stack Z-Index Hierarchy ─────────────── */}
            <GlobalStyles
                styles={{
                    // Primary Right Drawer (z-index: 1290) & Main Backdrop (z-index: 1200)
                    '.MuiModal-root.MuiDrawer-root': {
                        zIndex: '1290 !important',
                        ...(relatedRecordsTable
                            ? {
                                  pointerEvents: 'none',
                              }
                            : {}),
                    },
                    '.MuiModal-root.MuiDrawer-root .MuiDrawer-paper': {
                        pointerEvents: 'auto',
                    },
                    '.MuiModal-root.MuiDrawer-root > .MuiBackdrop-root': {
                        zIndex: -1,
                        ...(relatedRecordsTable
                            ? {
                                  backgroundColor: 'transparent !important',
                                  backdropFilter: 'none !important',
                                  WebkitBackdropFilter: 'none !important',
                                  pointerEvents: 'none !important',
                              }
                            : {}),
                    },
                    // Stacked Secondary Right Drawer (z-index: 1400)
                    '.MuiModal-root.MuiDrawer-root ~ .MuiModal-root.MuiDrawer-root': {
                        zIndex: '1400 !important',
                        pointerEvents: 'none',
                    },
                    '.MuiModal-root.MuiDrawer-root ~ .MuiModal-root.MuiDrawer-root > .MuiBackdrop-root': {
                        backgroundColor: 'transparent !important',
                        backdropFilter: 'none !important',
                        WebkitBackdropFilter: 'none !important',
                        pointerEvents: 'none !important',
                    },
                    '.MuiModal-root.MuiDrawer-root ~ .MuiModal-root.MuiDrawer-root .MuiDrawer-paper': {
                        pointerEvents: 'auto',
                        borderLeft: '1px solid #cbd5e1',
                        boxShadow: '-12px 0 40px rgba(15, 23, 42, 0.22)',
                    },
                }}
            />

            {/* 1. Left Related Modules Sidebar (z-index: 1300) */}
            {relatedSidebar}

            {/* 2. Middle Related Records Table (z-index: 1300, outside Paper blur) */}
            {React.isValidElement<{
                rightOffset?: number;
                isRightDrawerCollapsed?: boolean;
            }>(relatedRecordsTable)
                ? React.cloneElement(relatedRecordsTable, {
                      isRightDrawerCollapsed,
                      rightOffset: isRightDrawerCollapsed
                          ? 28
                          : (relatedRecordsTable.props.rightOffset ?? 560),
                  })
                : relatedRecordsTable}

            {/* 3. Primary Right Detail Drawer (z-index: 1290). Bookmark hidden while a top drawer is stacked. */}
            <DrawerStackContext.Provider value={baseDrawerStackValue}>
                {relatedRecordsTable && React.isValidElement<{ hideBackdrop?: boolean }>(drawer)
                    ? React.cloneElement(drawer, { hideBackdrop: true })
                    : drawer}
            </DrawerStackContext.Provider>

            {/* 4. Top Stacked Secondary Right Detail Drawer (z-index: 1400). Owns the single shared bookmark. */}
            <DrawerStackContext.Provider value={topDrawerStackValue}>
                {React.isValidElement<{ hideBackdrop?: boolean }>(secondaryDrawer)
                    ? React.cloneElement(secondaryDrawer, { hideBackdrop: true })
                    : secondaryDrawer}
            </DrawerStackContext.Provider>

            {/* ── Enterprise CRM Global Footer ─────────────────────────────── */}
            {!hideFooter && (footer || <EnterpriseFooter />)}

            {/* ── Toast Notifications ──────────────────────────────────────── */}
            {toast}
        </Box>
    );
}

export { CommonMasterView as MasterViewLayout };
