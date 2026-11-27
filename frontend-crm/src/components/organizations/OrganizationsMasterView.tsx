'use client';

import React, { useState, useMemo, useCallback } from 'react';
import { useResetTab } from '@/hooks/useResetTab';
import { useRouter } from 'next/navigation';
import { Button } from '@mui/material';
import FileDownloadOutlinedIcon from '@mui/icons-material/FileDownloadOutlined';
import HistoryIcon from '@mui/icons-material/History';
import PersonOutlinedIcon from '@mui/icons-material/PersonOutlined';

import { ROUTES } from '@/config/constants';
import { useAuth } from '@/context/AuthContext';
import { CommonMasterView } from '../common/CommonMasterView';
import { useTableFilter } from '../common/TableFilter';
import { AppToast } from '../common/AppToast';
import { useSaveFlash } from '@/utils/saveFlash';
import { fmtCount, useDisplayFormats } from '@/utils/formats';
import { MasterHeaderActions, outlinedHeaderButtonSx } from '../common/MasterHeaderActions';
import { DataImportModal } from '../common/import';
import { type DataTableFilterItem } from '../common/DataTable';
import { organizationService } from '@/services';
import { useOrganizations, useBulkDeleteOrganizations } from '@/hooks/queries';
import type { ExtendedOrganization } from '@/types/organization.types';
import { OrganizationDetailDrawer } from './OrganizationDetailDrawer';
import type { FilterTab, SortField } from './master';
import { useSearchScope, useSearchScopedRows } from '../search/SearchScope';
import { useOrganizationColumns } from './organizationColumns';
import { ModuleScorecardSummary, useModuleScorecard } from '../common/scorecard/useModuleScorecard';

/** Stable empty list while the first page loads (keeps memoized filters from recomputing). */
const NO_RECORDS: ExtendedOrganization[] = [];
export function OrganizationsMasterView() {
    const router = useRouter();
    const { user } = useAuth();
    const isAdmin = user?.role?.toLowerCase() === 'admin';
    // The record totals below follow the company number grouping (Indian until it is changed).
    useDisplayFormats();

    // ── State ─────────────────────────────────────────────────────────────────
    // On the global search results page the table shows the matched records (any owner) instead of this list.
    const embeddedInSearch = Boolean(useSearchScope());
    const { data: allOrganizationsLoaded = NO_RECORDS, refetch, isPending: listPending } = useOrganizations(undefined, { enabled: !embeddedInSearch });
    // A disabled query stays "pending" forever, so only count it when this screen loads its own list.
    const listLoading = !embeddedInSearch && listPending;
    const allOrganizations = useSearchScopedRows(allOrganizationsLoaded);
    const bulkDeleteMutation = useBulkDeleteOrganizations();
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [activeTab, setActiveTab] = useResetTab<FilterTab>('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [rowsPerPage, setRowsPerPage] = useState<number>(25);
    const [currentPage, setCurrentPage] = useState<number>(1);
    const [sortField, setSortField] = useState<SortField>('createdAt');
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
    // Detail View Side Drawer
    // Tracked by id so the drawer always shows the cached copy and closes if the organization is deleted.
    const [drawerOrgId, setDrawerOrgId] = useState<string | null>(null);
    // ── Declarative Column Definitions ────────────────────────────────────────
    const openDrawerRecord = useCallback((record: ExtendedOrganization) => setDrawerOrgId(record.id), []);
    const columns = useOrganizationColumns(openDrawerRecord);
    const tableFilter = useTableFilter<ExtendedOrganization>({
        module: 'organizations',
        rows: allOrganizations,
        columns,
        onSortChange: (s) => {
            setSortField(s.field as SortField);
            setSortOrder(s.order);
        },
        onChange: () => setCurrentPage(1),
    });
    /** Records left by the Filter dialog: tabs, counts, search and bulk actions work on these. */
    const organizations = tableFilter.filteredRows;

    const selectedDrawerOrg = useMemo(
        () => (drawerOrgId ? organizations.find((o) => o.id === drawerOrgId) ?? null : null),
        [organizations, drawerOrgId]
    );
    const [toast, setToast] = useState<{ open: boolean; message: string; severity: 'success' | 'info' | 'error' }>({
        open: false,
        message: '',
        severity: 'success',
    });

    // Back from the create / edit form: show its "saved" toast here and open the saved record in the drawer.
    useSaveFlash(ROUTES.ORGANIZATIONS, (flash) => {
        setToast({ open: true, message: flash.message, severity: flash.severity ?? 'success' });
        if (flash.recordId) setDrawerOrgId(flash.recordId);
    });

    // Row clicks only open the drawer; its eye button leads on to the detail page with the related modules.
    const closeDrawer = useCallback(() => setDrawerOrgId(null), []);

    const [importOpen, setImportOpen] = useState(false);

    // ── Filter & Search Logic ─────────────────────────────────────────────────
    /** Organizations in the active pill view: the scorecard counts these. */
    const tabOrganizations = useMemo(() => {
        return organizations.filter((org) => {
            if (activeTab === 'recent' && !org.isRecentlyViewed) return false;
            if (activeTab === 'my' && !org.isMyAccount) return false;
            if (activeTab === 'distributor' && !org.natureOfBusiness?.toLowerCase().includes('distributor')) return false;
            if (activeTab === 'enduser' && org.customerType !== 'End User') return false;
            return true;
        });
    }, [organizations, activeTab]);

    // Summary cards, once an admin switches them on under Admin › List Scorecards.
    const goToFirstPage = useCallback(() => setCurrentPage(1), []);
    const scorecard = useModuleScorecard<ExtendedOrganization>({ module: 'organizations', rows: tabOrganizations, onActiveChange: goToFirstPage });
    const { matches: matchesScorecard } = scorecard;

    const filteredOrganizations = useMemo(() => {
        return tabOrganizations.filter((org) => {
            if (!matchesScorecard(org)) return false;

            if (searchQuery.trim()) {
                const q = searchQuery.toLowerCase().trim();
                return (
                    org.organizationName.toLowerCase().includes(q) ||
                    org.natureOfBusiness?.toLowerCase().includes(q) ||
                    org.customerType?.toLowerCase().includes(q) ||
                    org.billingCity?.toLowerCase().includes(q) ||
                    org.billingState?.toLowerCase().includes(q) ||
                    org.billingStreet?.toLowerCase().includes(q) ||
                    org.gstNumber?.toLowerCase().includes(q)
                );
            }
            return true;
        });
    }, [tabOrganizations, matchesScorecard, searchQuery]);

    // ── Sort Logic ────────────────────────────────────────────────────────────
    const sortedOrganizations = useMemo(() => {
        return [...filteredOrganizations].sort((a, b) => {
            const valA = ((a as unknown as Record<string, unknown>)[sortField] || '').toString().toLowerCase();
            const valB = ((b as unknown as Record<string, unknown>)[sortField] || '').toString().toLowerCase();
            if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
            if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
            return 0;
        });
    }, [filteredOrganizations, sortField, sortOrder]);

    // ── Pagination Logic ──────────────────────────────────────────────────────
    const totalRecords = sortedOrganizations.length;
    const totalPages = Math.max(1, Math.ceil(totalRecords / rowsPerPage));
    const paginatedOrganizations = useMemo(() => {
        const start = (currentPage - 1) * rowsPerPage;
        return sortedOrganizations.slice(start, start + rowsPerPage);
    }, [sortedOrganizations, currentPage, rowsPerPage]);

    const handleSort = (field: SortField) => {
        if (sortField === field) {
            setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
        } else {
            setSortField(field);
            setSortOrder('asc');
        }
    };

    // ── Selection Logic ───────────────────────────────────────────────────────
    const isAllPageSelected = paginatedOrganizations.length > 0 && paginatedOrganizations.every((o) => selectedIds.has(o.id));
    const isSomePageSelected = paginatedOrganizations.some((o) => selectedIds.has(o.id)) && !isAllPageSelected;

    const toggleSelectRow = (id: string) => {
        const next = new Set(selectedIds);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        setSelectedIds(next);
    };

    const toggleSelectAll = () => {
        const next = new Set(selectedIds);
        if (isAllPageSelected) {
            paginatedOrganizations.forEach((o) => next.delete(o.id));
        } else {
            paginatedOrganizations.forEach((o) => next.add(o.id));
        }
        setSelectedIds(next);
    };

    // ── Export CSV ────────────────────────────────────────────────────────────
    const handleExport = (onlySelected = false) => {
        const recordsToExport = onlySelected
            ? organizations.filter((o) => selectedIds.has(o.id))
            : filteredOrganizations;

        if (recordsToExport.length === 0) {
            setToast({ open: true, message: 'No organizations to export.', severity: 'info' });
            return;
        }

        const headers = ['Organization Name', 'Nature of Business', 'Customer Type', 'Status', 'Billing Street', 'City', 'State', 'GST Number'];
        const rows = recordsToExport.map((o) => [
            `"${o.organizationName.replace(/"/g, '""')}"`,
            `"${o.natureOfBusiness || ''}"`,
            `"${o.customerType || ''}"`,
            `"${o.accountStatus || ''}"`,
            `"${(o.billingStreet || '').replace(/"/g, '""')}"`,
            `"${o.billingCity || ''}"`,
            `"${o.billingState || ''}"`,
            `"${o.gstNumber || ''}"`,
        ]);

        const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement('a');
        link.setAttribute('href', encodedUri);
        link.setAttribute('download', `organizations_export_${Date.now()}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        setToast({ open: true, message: `Exported ${recordsToExport.length} organizations to CSV.`, severity: 'success' });
    };

    // ── Bulk Actions ──────────────────────────────────────────────────────────
    const handleBulkAction = async (action: 'active' | 'inactive' | 'delete' | 'export') => {
        if (selectedIds.size === 0) {
            setToast({ open: true, message: 'Please select records to perform bulk action.', severity: 'info' });
            return;
        }

        if (action === 'delete') {
            const count = selectedIds.size;
            if (!window.confirm(`Delete ${count} selected organization(s)?`)) return;
            try {
                await bulkDeleteMutation.mutateAsync(Array.from(selectedIds));
                if (drawerOrgId && selectedIds.has(drawerOrgId)) {
                    closeDrawer();
                }
                setSelectedIds(new Set());
                setToast({ open: true, message: `${count} organizations deleted.`, severity: 'success' });
            } catch {
                setToast({ open: true, message: 'Failed to delete organizations.', severity: 'error' });
            }
        } else if (action === 'active' || action === 'inactive') {
            const status = action === 'active' ? 'Active' : 'Inactive';
            try {
                // Saves through the service, whose sync notification refreshes the organizations cache.
                const updated = await organizationService.updateStatusBulk(selectedIds, status);
                setToast({ open: true, message: `${updated.length} organizations updated to ${status}.`, severity: 'success' });
            } catch (err) {
                setToast({
                    open: true,
                    message: err instanceof Error ? err.message : 'Failed to update organization status.',
                    severity: 'error',
                });
            }
        } else if (action === 'export') {
            handleExport(true);
        }
    };

    // ── Filter Pills Configuration ────────────────────────────────────────────
    const filterItems: DataTableFilterItem<FilterTab>[] = useMemo(
        () => [
            {
                id: 'all',
                label: 'All Organizations',
                count: organizations.length,
            },
            {
                id: 'recent',
                label: 'Recently Viewed',
                icon: <HistoryIcon sx={{ fontSize: 15, color: 'var(--mui-palette-text-muted)' }} />,
                count: organizations.filter((o) => o.isRecentlyViewed).length,
            },
            {
                id: 'my',
                label: 'My Accounts',
                icon: <PersonOutlinedIcon sx={{ fontSize: 16, color: 'var(--mui-palette-text-muted)' }} />,
            },
            {
                id: 'distributor',
                label: 'Distributor/Trading',
                dotColor: 'var(--mui-palette-primary-main)',
            },
            {
                id: 'enduser',
                label: 'End User',
                dotColor: 'var(--crm-emerald-500)',
            },
        ],
        [organizations]
    );


    const headerActions = (
        <MasterHeaderActions
            onRefresh={async () => {
                const { isError } = await refetch();
                setToast(
                    isError
                        ? { open: true, message: 'Failed to refresh organizations.', severity: 'error' }
                        : { open: true, message: 'Organizations refreshed.', severity: 'info' }
                );
            }}
            onNewClick={() => router.push(ROUTES.ORGANIZATION_NEW)}
            newButtonLabel="New Organization"
            onImportClick={() => setImportOpen(true)}
        >
            <Button
                variant="outlined"
                size="small"
                startIcon={<FileDownloadOutlinedIcon sx={{ fontSize: 16 }} />}
                onClick={() => handleExport(false)}
                sx={outlinedHeaderButtonSx}
            >
                Export
            </Button>
        </MasterHeaderActions>
    );

    return (
        <CommonMasterView<ExtendedOrganization, FilterTab>
            loading={listLoading}
            summary={<ModuleScorecardSummary state={scorecard} loading={listLoading} />}
            filterConfig={{
                filters: filterItems,
                activeFilter: activeTab,
                onFilterChange: (tab) => {
                    setActiveTab(tab);
                    setCurrentPage(1);
                },
                variant: 'pill',
            }}
            tableId="organizations"
            tableFilter={tableFilter}
            headerActions={headerActions}
            searchConfig={{
                variant: 'extended',
                searchQuery,
                onSearchChange: (q) => {
                    setSearchQuery(q);
                    setCurrentPage(1);
                },
                searchPlaceholder: 'Search within table...',
                isAllPageSelected,
                isSomePageSelected,
                onToggleSelectAll: toggleSelectAll,
                onSelectAllMatching: () => setSelectedIds(new Set(organizations.map((o) => o.id))),
                onSelectVisible: () => {
                    const next = new Set(selectedIds);
                    paginatedOrganizations.forEach((o) => next.add(o.id));
                    setSelectedIds(next);
                },
                onDeselectAll: () => setSelectedIds(new Set()),
                totalRecords,
                displayTotalRecords: fmtCount(totalRecords),
                currentPage,
                rowsPerPage,
                totalPages,
                onPageChange: setCurrentPage,
                bulkActionItems: [
                    { id: 'active', label: 'Mark as Active', onClick: () => handleBulkAction('active') },
                    { id: 'inactive', label: 'Mark as Inactive', onClick: () => handleBulkAction('inactive') },
                    { id: 'export', label: 'Export Selected to CSV', onClick: () => handleBulkAction('export') },
                    { id: 'delete', label: 'Delete Selected', color: 'error', onClick: () => handleBulkAction('delete') },
                ],
            }}
            columns={columns}
            data={paginatedOrganizations}
            keyExtractor={(org) => org.id}
            selectedIds={selectedIds}
            onToggleSelectRow={toggleSelectRow}
            onToggleSelectAll={toggleSelectAll}
            isAllSelected={isAllPageSelected}
            isIndeterminate={isSomePageSelected}
            sortField={sortField}
            sortOrder={sortOrder}
            onSort={(field) => handleSort(field as SortField)}
            onView={(org) => router.push(ROUTES.ORGANIZATION_DETAIL(org.id))}
            getEditHref={(org) =>
                org.accountStatus === 'Inactive' && !isAdmin
                    ? ROUTES.ORGANIZATION_DETAIL(org.id)
                    : ROUTES.ORGANIZATION_EDIT(org.id)
            }
            onEdit={(org) => {
                if (org.accountStatus === 'Inactive' && !isAdmin) {
                    setToast({ open: true, message: 'This organization is inactive. Only an Admin can edit it.', severity: 'info' });
                }
            }}
            getRowHref={(org) => ROUTES.ORGANIZATION_DETAIL(org.id)}
            onRowClick={(org) => setDrawerOrgId(org.id)}
            activeRowId={selectedDrawerOrg?.id}
            viewTooltip="View Details"
            editTooltip="Edit Organization"
            emptyTitle="No organizations found"
            emptyDescription="No organizations match your current search and filter criteria."
            emptyActionLabel="Create Organization"
            onEmptyAction={() => router.push(ROUTES.ORGANIZATION_NEW)}
            pagination={{
                variant: 'full',
                page: currentPage - 1,
                rowsPerPage,
                totalCount: totalRecords,
                displayTotalCount: fmtCount(totalRecords),
                entityLabel: 'Organizations',
                pageSizeOptions: [10, 25, 50, 100],
                onPageChange: (pageZeroBased) => setCurrentPage(pageZeroBased + 1),
                onRowsPerPageChange: (rows) => {
                    setRowsPerPage(rows);
                    setCurrentPage(1);
                },
            }}
            drawer={
                <OrganizationDetailDrawer
                    organization={selectedDrawerOrg}
                    open={Boolean(selectedDrawerOrg)}
                    onClose={closeDrawer}
                    onEdit={(id) => router.push(ROUTES.ORGANIZATION_EDIT(id))}
                />
            }
            isDrawerOpen={Boolean(selectedDrawerOrg)}
            toast={
                <AppToast
                    open={toast.open}
                    message={toast.message}
                    severity={toast.severity}
                    onClose={() => setToast((t) => ({ ...t, open: false }))}
                />
            }
        >
            <DataImportModal
                open={importOpen}
                entity="organizations"
                onClose={() => setImportOpen(false)}
                onImported={(count) => {
                    setToast({ open: true, message: `Successfully imported ${count} organization${count === 1 ? '' : 's'}!`, severity: 'success' });
                }}
            />
        </CommonMasterView>
    );
}
