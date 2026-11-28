'use client';

import React from 'react';
import { Box, GlobalStyles, Paper, SxProps, Theme } from '@mui/material';
import { AppBreadcrumbs, type BreadcrumbItem } from './AppBreadcrumbs';
import { DrawerStackContext, type DrawerStackContextValue } from './Drawer/DrawerStackContext';
import {
    ColumnVisibilityPopover,
    DataTable,
    DataTableFilterPills,
    DataTablePagination,
    DataTableToolbar,
    type DataTableColumn,
    type DataTableFilterPillsProps,
    type DataTablePaginationProps,
    type DataTableToolbarProps,
    type SortOrder,
    useColumnVisibility,
    MAX_PINNED_COLUMNS,
    useFormFieldColumns,
    isCrmModuleKey,
    TablePageScrollContext,
} from './DataTable';
import { DEFAULT_PAGE_SIZE_OPTIONS, useAutoPageSize } from './DataTable/useAutoPageSize';
import type { CrmModuleKey } from '@/types/formConfig.types';
import { ActiveFilterChips, TableFilterModal, type FilterSortOption, type TableFilterController } from './TableFilter';
import { useSearchScope } from '../search/SearchScope';
import { moduleKeyFrom, moduleTableTintVars } from '@/theme/moduleColors';
import { useScorecardColumns } from './scorecard/scorecardDisplay';
import { useCloseOnOutsideClick } from './Drawer/useCloseOnOutsideClick';
import { ScorecardScrollContext } from './StatusSummaryCards';
import { MasterPermissionsContext, type MasterPermissions } from './masterPermissions';
import { usePermissions } from '@/hooks/usePermissions';
import type { OwnedRecord, PermissionModule } from '@/utils/permissions';
import { onImportFinished } from '@/services/importTracker';
import type { ImportEntityType } from './import/types';

export interface MasterViewHeaderActionsContext {
    /** Opens the shared column visibility popover anchored to the given element. */
    openColumnManager: (anchorEl: HTMLElement) => void;
}

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
     * Optional summary row (e.g. `StatusSummaryCards`) rendered between the breadcrumbs and the filter pills.
     */
    summary?: React.ReactNode;
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
    headerActions?: React.ReactNode | ((ctx: MasterViewHeaderActionsContext) => React.ReactNode);
    /**
     * Identifies this table. When set, column visibility is persisted to localStorage.
     */
    tableId?: string;
    /**
     * Admin › Roles module whose permissions shape the page (default: the module `tableId` names; null for none):
     * New / Import / Export (via MasterHeaderActions), row Edit / Delete, Bulk delete and the empty state's create button
     * show only when the role allows them (Own: only on the user's own or created rows), and a role with View None
     * sees a notice instead of the list.
     */
    permissionModule?: PermissionModule | null;
    /**
     * Form whose fields the column manager offers (every built-in and custom field). Defaults to `tableId` when
     * that is a form module key; pass `null` to offer only the hand-built columns.
     */
    formModule?: CrmModuleKey | null;
    /**
     * Filter dialog (Recent / Advanced) from `useTableFilter`: wires the toolbar's filter button, shows the applied
     * filter as chips above the table and renders the dialog. Pass its `filteredRows` on to the view's own logic.
     */
    tableFilter?: TableFilterController<T>;
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
    getViewHref?: (row: T) => string;
    /** Undefined for a row hides its Edit icon (a record the user may see but not change). */
    getEditHref?: (row: T) => string | undefined;
    onDelete?: (row: T) => void;
    /** False for a row hides its Delete icon (default: every row can be deleted). */
    canDeleteRow?: (row: T) => boolean;
    onRowClick?: (row: T) => void;
    /** Ctrl / Cmd + click on a row opens this URL in a new tab. */
    getRowHref?: (row: T) => string | undefined;
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
    /** First load still running: the table shows skeleton rows instead of the empty state. */
    loading?: boolean;
    /**
     * Custom table component (overrides declarative `DataTable` if provided).
     */
    table?: React.ReactNode;
    /**
     * Table pagination config object or custom ReactNode displayed at the bottom of the table paper.
     */
    pagination?: DataTablePaginationProps | React.ReactNode;
    /**
     * The module this list imports into (the shared import wizard). When an import of it ends with new rows, the
     * list jumps to its largest page size and the first page, so the freshly imported rows are in view. (This jump
     * is not saved as the user's page size; until they pick one, the size follows the record count.)
     */
    importEntity?: ImportEntityType;
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

/** Desktop width of the record drawer (EntityDetailDrawer's default `md` width). */
const DRAWER_WIDTH = 580;

/** 'NEXT FOLLOWUP DATE' → 'Next Followup Date'. */
function titleCaseHeader(label: string): string {
    if (label !== label.toUpperCase()) return label;
    return label.toLowerCase().replace(/(^|[\s\-/(&])([a-z])/g, (_, sep: string, ch: string) => sep + ch.toUpperCase());
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
 * 4. Outside: Detail drawer and Toast notifications.
 */
export function CommonMasterView<T = unknown, TFilter extends string = string>({
    breadcrumbs,
    breadcrumbItems,
    summary,
    filterConfig,
    filters,
    headerActions,
    tableId,
    permissionModule: permissionModuleProp,
    formModule,
    tableFilter,
    searchConfig: searchConfigProp,
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
    onEdit: onEditProp,
    getViewHref,
    getEditHref: getEditHrefProp,
    onDelete: onDeleteProp,
    canDeleteRow: canDeleteRowProp,
    onRowClick,
    getRowHref,
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
    onEmptyAction: onEmptyActionProp,
    minHeight = 280,
    loading,
    table,
    pagination,
    importEntity,
    relatedSidebar,
    relatedRecordsTable,
    drawer,
    secondaryDrawer,
    isDrawerOpen = false,
    toast,
    children,
    sx,
    contentSx,
    paperSx,
}: CommonMasterViewProps<T, TFilter>) {
    // ── Role permissions (Admin › Roles) ──
    const { level, canRecord } = usePermissions();
    const permissionModule = permissionModuleProp === undefined ? (moduleKeyFrom(tableId) ?? null) : permissionModuleProp;
    const levelFor = (action: 'view' | 'create' | 'edit' | 'delete' | 'export' | 'import') => (permissionModule ? level(permissionModule, action) : 'all');
    const viewLevel = levelFor('view');
    const editLevel = levelFor('edit');
    const deleteLevel = levelFor('delete');
    const masterPermissions = React.useMemo<MasterPermissions>(
        () => ({ canCreate: levelFor('create') !== 'none', canImport: levelFor('import') !== 'none', canExport: levelFor('export') !== 'none' }),
        // levelFor reads `level` and the module only.
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [level, permissionModule],
    );
    const ownsRow = (action: 'edit' | 'delete', row: T) => (permissionModule ? canRecord(permissionModule, action, row as OwnedRecord) : true);
    const onEdit = editLevel === 'none' ? undefined : onEditProp;
    const getEditHref =
        editLevel === 'none' || !getEditHrefProp
            ? undefined
            : editLevel === 'own'
              ? (row: T) => (ownsRow('edit', row) ? getEditHrefProp(row) : undefined)
              : getEditHrefProp;
    const onDelete = deleteLevel === 'none' ? undefined : onDeleteProp;
    const canDeleteRow =
        deleteLevel === 'own' ? (row: T) => ownsRow('delete', row) && (canDeleteRowProp?.(row) ?? true) : canDeleteRowProp;
    const onEmptyAction = masterPermissions.canCreate ? onEmptyActionProp : undefined;
    const searchConfig =
        searchConfigProp && deleteLevel === 'none' && searchConfigProp.onBulkDelete ? { ...searchConfigProp, onBulkDelete: undefined } : searchConfigProp;

    const [isRightDrawerCollapsed, setIsRightDrawerCollapsed] = React.useState(false);
    // A secondary drawer is only active when it is mounted with a populated entity
    const hasSecondaryDrawer = Boolean(
        secondaryDrawer &&
            (!React.isValidElement<{ entity?: unknown }>(secondaryDrawer) ||
                Boolean(secondaryDrawer.props.entity))
    );

    // Collapse the whole stack together; expand again whenever the stack changes (drawer closed, or a secondary
    // drawer stacked). Adjusted during render rather than in an effect, so no extra render pass.
    const [prevDrawerOpen, setPrevDrawerOpen] = React.useState(isDrawerOpen);
    const [prevHasSecondary, setPrevHasSecondary] = React.useState(hasSecondaryDrawer);
    if (isDrawerOpen !== prevDrawerOpen) {
        setPrevDrawerOpen(isDrawerOpen);
        if (!isDrawerOpen) setIsRightDrawerCollapsed(false);
    }
    if (hasSecondaryDrawer !== prevHasSecondary) {
        setPrevHasSecondary(hasSecondaryDrawer);
        if (hasSecondaryDrawer) setIsRightDrawerCollapsed(false);
    }

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
            // No collapse tab on list pages: the drawer sits beside the table and closes with its ✕.
            showBookmark: false,
            // Non-modal: the table stays scrollable and clickable, so another row can be opened in the drawer.
            persistent: true,
        }),
        [isRightDrawerCollapsed, toggleRightDrawerCollapsed, resetRightDrawerCollapsed]
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

    // Embedded in the global search results page: just the table card (see SearchScope).
    const searchScope = useSearchScope();
    const embedded = Boolean(searchScope);
    const drawerClose = React.isValidElement<{ onClose?: () => void }>(drawer) ? drawer.props.onClose : undefined;
    // A click elsewhere on the page (not on a table row or inside the drawer) closes the record drawer. Not while a
    // second drawer or the related-records table is stacked on it: those have their own close flow.
    useCloseOnOutsideClick(isDrawerOpen && !hasSecondaryDrawer && !relatedRecordsTable, drawerClose);
    React.useEffect(() => {
        if (searchScope && isDrawerOpen && drawerClose) searchScope.claimDrawer(tableId ?? '', drawerClose);
    }, [searchScope, isDrawerOpen, drawerClose, tableId]);

    const resolvedFormModule = formModule === undefined ? (isCrmModuleKey(tableId) ? tableId : undefined) : (formModule ?? undefined);
    // Form-field columns, then the scorecard colors on its field's column (when the admin enabled them).
    const allColumns = useScorecardColumns<T>(useFormFieldColumns<T>(columns, resolvedFormModule), resolvedFormModule);
    const {
        orderedColumns,
        visibleColumnIds,
        activeColumns,
        pinnedColumnIds,
        toggleColumn,
        setColumnsVisible,
        togglePin,
        reorderColumns,
        reorderPinned,
        resetDefaults,
    } = useColumnVisibility<T>(allColumns, tableId);
    const [columnAnchorEl, setColumnAnchorEl] = React.useState<HTMLElement | null>(null);
    const openColumnManager = React.useCallback((el: HTMLElement) => setColumnAnchorEl(el), []);
    const closeColumnManager = React.useCallback(() => setColumnAnchorEl(null), []);

    const resolvedHeaderActions =
        typeof headerActions === 'function' ? headerActions({ openColumnManager }) : headerActions;

    const resolvedFilters =
        filters ?? (filterConfig ? <DataTableFilterPills<TFilter> {...filterConfig} /> : null);

    const resolvedToolbar =
        toolbar ??
        (searchConfig ? (
            embedded ? (
                // Search results tables: selection and Bulk Action only (no search box, filter, column manager or
                // top pager; the pagination bar below the table stays).
                <DataTableToolbar {...searchConfig} hideSearch onFilterClick={undefined} onColumnClick={undefined} onPageChange={undefined} />
            ) : (
                <DataTableToolbar
                    {...searchConfig}
                    onFilterClick={searchConfig.onFilterClick ?? tableFilter?.open}
                    filterCount={searchConfig.filterCount ?? tableFilter?.activeCount}
                    onColumnClick={searchConfig.onColumnClick ?? (columns ? openColumnManager : undefined)}
                />
            )
        ) : null);

    // "Order by" offers the sortable columns (built-in and form-field ones), by their header text.
    const filterSortOptions = React.useMemo<FilterSortOption[]>(() => {
        const seen = new Set<string>();
        return (allColumns ?? [])
            .filter((c) => c.sortable)
            .map((c) => ({ field: c.sortKey ?? c.id, label: typeof c.label === 'string' ? titleCaseHeader(c.label) : c.id }))
            .filter((o) => (seen.has(o.field) ? false : (seen.add(o.field), true)));
    }, [allColumns]);

    const tableModule = moduleKeyFrom(tableId);
    const resolvedTable =
        table ??
        (columns && data ? (
            <DataTable<T>
                data={data}
                columns={activeColumns}
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
                getViewHref={getViewHref}
                getEditHref={getEditHref}
                onDeleteRow={onDelete}
                canDeleteRow={canDeleteRow}
                onRowClick={onRowClick}
                getRowHref={getRowHref}
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
                loading={loading}
            />
        ) : null);

    // After an import of this module: show as many rows as the list allows, from the first page (newest first).
    const paginationConfig = isPaginationConfig(pagination) ? pagination : null;
    const paginationRef = React.useRef(paginationConfig);
    React.useEffect(() => {
        paginationRef.current = paginationConfig;
    });
    React.useEffect(() => {
        if (!importEntity) return;
        return onImportFinished((item) => {
            const current = paginationRef.current;
            if (item.entity !== importEntity || item.created === 0 || !current) return;
            const largest = Math.max(...(current.pageSizeOptions ?? DEFAULT_PAGE_SIZE_OPTIONS));
            if (current.rowsPerPage < largest) current.onRowsPerPageChange(largest);
            else current.onPageChange(0);
        });
    }, [importEntity]);

    // Rows per page grows with the record count until the user picks a size (kept per list).
    const autoPagination = useAutoPageSize(tableId, paginationConfig, loading);
    const resolvedPagination = autoPagination ? (
        <DataTablePagination {...autoPagination} />
    ) : isPaginationConfig(pagination) ? null : (
        pagination
    );

    if (viewLevel === 'none') {
        return (
            <Box sx={{ flex: 1, px: { xs: 2, md: 3 }, pt: 2, pb: 2, minWidth: 0, backgroundColor: 'var(--mui-palette-background-subtle)', ...sx }}>
                {!embedded && (
                    <Box sx={{ mb: 1.5, minWidth: 0 }}>
                        {breadcrumbs || <AppBreadcrumbs items={breadcrumbItems} />}
                    </Box>
                )}
                <Paper
                    elevation={0}
                    sx={{
                        p: { xs: 2.5, md: 4 },
                        borderRadius: '12px',
                        border: '1px solid var(--mui-palette-border-main)',
                        backgroundColor: 'var(--mui-palette-background-paper)',
                        color: 'var(--mui-palette-text-secondary)',
                        fontSize: '0.88rem',
                        textAlign: 'center',
                    }}
                >
                    Your role doesn’t give access to this module. Ask an administrator if you need it.
                </Paper>
            </Box>
        );
    }

    return (
        <MasterPermissionsContext.Provider value={masterPermissions}>
        <Box
            sx={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                // List pages fill at least the space below the navbar and grow with their rows: the whole page
                // scrolls (the table is part of it, with no scrollbar of its own).
                ...(embedded ? { minHeight: 0 } : {}),
                backgroundColor: embedded ? 'transparent' : 'var(--mui-palette-background-subtle)',
                width: '100%',
                minWidth: 0,
                ...sx,
            }}
        >
            {/* ── Main Page Content ────────────────────────────────────────── */}
            <Box
                sx={{
                    pl: embedded ? 0 : { xs: 2, md: 3 },
                    // On wide screens the open drawer sits beside the table instead of covering its right side:
                    // drawer (580) + its 12px inset + a 12px gap, the same gaps the floating navbar keeps.
                    pr: embedded
                        ? { xs: 0, lg: isDrawerOpen && !isRightDrawerCollapsed ? `${DRAWER_WIDTH}px` : 0 }
                        : { xs: 2, md: 3, lg: isDrawerOpen && !isRightDrawerCollapsed ? `${DRAWER_WIDTH + 24}px` : 3 },
                    transition: 'padding-right 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                    pt: embedded ? 0 : 2,
                    pb: embedded ? 0 : 2,
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    ...(embedded ? { minHeight: 0 } : {}),
                    minWidth: 0,
                    width: '100%',
                    ...contentSx,
                }}
            >
                {/* ── Line 1: Route-Aware Breadcrumbs ── */}
                {!embedded && (
                    <Box sx={{ mb: 1.5, minWidth: 0 }}>
                        {breadcrumbs || <AppBreadcrumbs items={breadcrumbItems} />}
                    </Box>
                )}

                {/* While the drawer narrows the list (lg+), the scorecards scroll sideways instead of wrapping. */}
                {!embedded && summary && (
                    <ScorecardScrollContext.Provider value={isDrawerOpen && !isRightDrawerCollapsed}>
                        {summary}
                    </ScorecardScrollContext.Provider>
                )}

                {/* ── Line 2: All Filters & Optional Header Actions ── */}
                {!embedded && (resolvedFilters || resolvedHeaderActions) && (
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
                        {resolvedHeaderActions && (
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                                {resolvedHeaderActions}
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
                        border: '1px solid var(--mui-palette-border-main)',
                        borderRadius: '10px',
                        backgroundColor: 'var(--mui-palette-background-paper)',
                        display: 'flex',
                        flexDirection: 'column',
                        flex: embedded ? 'none' : 1,
                        overflow: 'hidden',
                        minWidth: 0,
                        width: '100%',
                        // The card stretches to the bottom of the window and grows with the table (page scroll).
                        boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                        ...paperSx,
                    }}
                >
                    {columns && (
                        <ColumnVisibilityPopover<T>
                            columns={orderedColumns}
                            onSetColumnsVisible={setColumnsVisible}
                            pinnedColumnIds={pinnedColumnIds}
                            onTogglePin={togglePin}
                            onReorderColumns={reorderColumns}
                            onReorderPinned={reorderPinned}
                            maxPinned={MAX_PINNED_COLUMNS}
                            visibleColumnIds={visibleColumnIds}
                            onToggleColumn={toggleColumn}
                            onResetDefaults={resetDefaults}
                            anchorEl={columnAnchorEl}
                            onClose={closeColumnManager}
                            tableId={tableId}
                        />
                    )}

                    {/* Search & Action Toolbar */}
                    {resolvedToolbar}

                    {tableFilter && (
                        <>
                            <ActiveFilterChips controller={tableFilter as TableFilterController} />
                            <TableFilterModal controller={tableFilter as TableFilterController} sortOptions={filterSortOptions} />
                        </>
                    )}

                    {/* Table View */}
                    {/* Module tint on the table header and rows (read by DataTable); display: contents keeps the layout. */}
                    <Box sx={{ display: 'contents', ...(tableModule && moduleTableTintVars(tableModule)) }}>
                        <TablePageScrollContext.Provider value={!embedded}>{resolvedTable}</TablePageScrollContext.Provider>
                    </Box>
                    {children}

                    {/* Pagination Bar */}
                    {resolvedPagination}
                </Paper>
            </Box>

            {/* ── Layered LIFO Drawer Stack Z-Index Hierarchy ─────────────── */}
            <GlobalStyles
                styles={{
                    // Primary Right Drawer (z-index: 1310) - Elevates above Middle Panel (1290)
                    '.MuiModal-root.MuiDrawer-root': {
                        zIndex: '1310 !important',
                        ...(relatedRecordsTable
                            ? {
                                  pointerEvents: 'none',
                              }
                            : {}),
                    },
                    '.MuiModal-root.MuiDrawer-root .MuiDrawer-paper': {
                        pointerEvents: 'auto',
                        boxShadow: '-8px 0 32px rgba(15, 23, 42, 0.12)', // Cast a clean drawer shadow over middle panel
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
                        borderLeft: '1px solid var(--mui-palette-border-strong)',
                        boxShadow: '-12px 0 40px rgba(15, 23, 42, 0.22)',
                    },
                }}
            />

            {/* 1. Left Related Modules Sidebar (z-index: 1300) */}
            {relatedSidebar}

            {/* 2. Middle Related Records Table (z-index: 1290, outside Paper blur) */}
            {React.isValidElement<{
                rightOffset?: number;
                isRightDrawerCollapsed?: boolean;
            }>(relatedRecordsTable)
                ? React.cloneElement(relatedRecordsTable, {
                      isRightDrawerCollapsed,
                      rightOffset: isRightDrawerCollapsed
                          ? 0
                          : (relatedRecordsTable.props.rightOffset ?? DRAWER_WIDTH + 24), // floating drawer + 12px inset + 12px gap
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

            {/* ── Toast Notifications ──────────────────────────────────────── */}
            {toast}
        </Box>
        </MasterPermissionsContext.Provider>
    );
}

export { CommonMasterView as MasterViewLayout };
