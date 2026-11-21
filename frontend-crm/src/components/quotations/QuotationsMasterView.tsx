'use client';

import React, { useState, useMemo, useCallback } from 'react';
import { useResetTab } from '@/hooks/useResetTab';
import { useRouter } from 'next/navigation';
import RequestQuoteOutlinedIcon from '@mui/icons-material/RequestQuoteOutlined';
import DraftsOutlinedIcon from '@mui/icons-material/DraftsOutlined';
import SendOutlinedIcon from '@mui/icons-material/SendOutlined';
import CheckCircleOutlinedIcon from '@mui/icons-material/CheckCircleOutlined';
import CancelOutlinedIcon from '@mui/icons-material/CancelOutlined';

import { CommonMasterView } from '../common/CommonMasterView';
import { useTableFilter } from '../common/TableFilter';
import { MasterHeaderActions } from '../common/MasterHeaderActions';
import { buildExtendedSearchConfig } from '../common/buildExtendedSearchConfig';
import { AppToast } from '../common/AppToast';
import { useSaveFlash } from '@/utils/saveFlash';
import { type DataTableFilterItem } from '../common/DataTable';
import { ROUTES } from '@/config/constants';
import type { Quotation } from '@/types/quotation.types';
import { useQuotations, useDeleteQuotation, useBulkDeleteQuotations } from '@/hooks/queries';
import { useShowRecordNumber } from '@/hooks/queries/useDocumentSeries';
import { QuotationDetailDrawer } from './QuotationDetailDrawer';
import { useSearchScope, useSearchScopedRows } from '../search/SearchScope';
import { useQuotationColumns } from './quotationColumns';

export type QuotationFilterTab = 'all' | 'draft' | 'sent' | 'accepted' | 'rejected';
/** Any column's field key: the table sorts on `row[sortField]`, including columns added from the form. */
export type QuotationSortField = string;

/** Stable empty list while the first page loads (keeps memoized filters from recomputing). */
const NO_RECORDS: Quotation[] = [];
export function QuotationsMasterView() {
    const router = useRouter();

    // On the global search results page the table shows the matched records (any owner) instead of this list.
    const embeddedInSearch = Boolean(useSearchScope());
    const { data: allQuotationsLoaded = NO_RECORDS, refetch, isPending: listPending } = useQuotations(undefined, { enabled: !embeddedInSearch });
    // A disabled query stays "pending" forever, so only count it when this screen loads its own list.
    const listLoading = !embeddedInSearch && listPending;
    const allQuotations = useSearchScopedRows(allQuotationsLoaded);
    const deleteMutation = useDeleteQuotation();
    const bulkDeleteMutation = useBulkDeleteQuotations();
    const [activeTab, setActiveTab] = useResetTab<QuotationFilterTab>('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [page, setPage] = useState(0);
    const [rowsPerPage, setRowsPerPage] = useState(10);
    const [sortField, setSortField] = useState<QuotationSortField>('createdAt');
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
    const tableFilter = useTableFilter<Quotation>({
        module: 'quotations',
        rows: allQuotations,
        onSortChange: (s) => {
            setSortField(s.field as QuotationSortField);
            setSortOrder(s.order);
        },
        onChange: () => setPage(0),
    });
    /** Records left by the Filter dialog: tabs, counts, search and bulk actions work on these. */
    const quotations = tableFilter.filteredRows;
    // Tracked by id so the drawer always shows the cached copy and closes if the quotation is deleted.
    const [drawerQuotationId, setDrawerQuotationId] = useState<string | null>(null);
    const selectedDrawerQuotation = useMemo(
        () => (drawerQuotationId ? quotations.find((q) => q.id === drawerQuotationId) ?? null : null),
        [quotations, drawerQuotationId]
    );
    const [toast, setToast] = useState<{
        open: boolean;
        message: string;
        severity: 'success' | 'error' | 'info' | 'warning';
    }>({
        open: false,
        message: '',
        severity: 'success',
    });

    // Back from the create / edit form: show its "saved" toast here and open the saved record in the drawer.
    useSaveFlash(ROUTES.QUOTATIONS, (flash) => {
        setToast({ open: true, message: flash.message, severity: flash.severity ?? 'success' });
        if (flash.recordId) setDrawerQuotationId(flash.recordId);
    });

    // Row clicks only open the drawer; its eye button leads on to the detail page with the related modules.
    const closeDrawer = useCallback(() => setDrawerQuotationId(null), []);

    const handleDelete = async (id: string) => {
        const quote = quotations.find((q) => q.id === id);
        const label = showNumber('quotation') && quote?.quotationCode ? `"${quote.quotationCode}"` : 'this quotation';
        if (!window.confirm(`Are you sure you want to delete ${label}?`)) return;

        try {
            await deleteMutation.mutateAsync(id);
            if (drawerQuotationId === id) {
                closeDrawer();
            }
            setToast({
                open: true,
                message: 'Quotation deleted successfully.',
                severity: 'success',
            });
        } catch {
            setToast({ open: true, message: 'Failed to delete quotation.', severity: 'error' });
        }
    };

    const handleBulkDelete = async () => {
        const count = selectedIds.length;
        if (count === 0) return;
        if (!window.confirm(`Are you sure you want to delete ${count} selected quotation(s)?`)) return;

        try {
            await bulkDeleteMutation.mutateAsync(selectedIds);
            if (drawerQuotationId && selectedIds.includes(drawerQuotationId)) {
                closeDrawer();
            }
            setSelectedIds([]);
            setToast({
                open: true,
                message: `${count} quotation(s) deleted successfully.`,
                severity: 'success',
            });
        } catch {
            setToast({ open: true, message: 'Failed to delete quotations.', severity: 'error' });
        }
    };

    // ── Filter Tabs Configuration ─────────────────────────────────────────────
    const filterItems: DataTableFilterItem<QuotationFilterTab>[] = useMemo(() => {
        return [
            {
                id: 'all',
                label: 'All Quotations',
                icon: <RequestQuoteOutlinedIcon sx={{ fontSize: 16 }} />,
                count: quotations.length,
            },
            {
                id: 'draft',
                label: 'Draft',
                icon: <DraftsOutlinedIcon sx={{ fontSize: 16 }} />,
                count: quotations.filter((q) => q.status === 'Draft').length,
                activeColor: 'var(--mui-palette-text-secondary)',
            },
            {
                id: 'sent',
                label: 'Sent',
                icon: <SendOutlinedIcon sx={{ fontSize: 16 }} />,
                count: quotations.filter((q) => q.status === 'Sent').length,
                activeColor: 'var(--mui-palette-primary-main)',
            },
            {
                id: 'accepted',
                label: 'Accepted',
                icon: <CheckCircleOutlinedIcon sx={{ fontSize: 16 }} />,
                count: quotations.filter((q) => q.status === 'Accepted').length,
                activeColor: 'var(--crm-emerald-600)',
            },
            {
                id: 'rejected',
                label: 'Rejected',
                icon: <CancelOutlinedIcon sx={{ fontSize: 16 }} />,
                count: quotations.filter((q) => q.status === 'Rejected').length,
                activeColor: 'var(--mui-palette-error-main)',
            },
        ];
    }, [quotations]);

    // ── Filtering Logic ───────────────────────────────────────────────────────
    const showNumber = useShowRecordNumber();
    const filteredQuotations = useMemo(() => {
        let result = [...quotations];

        if (activeTab === 'draft') {
            result = result.filter((q) => q.status === 'Draft');
        } else if (activeTab === 'sent') {
            result = result.filter((q) => q.status === 'Sent');
        } else if (activeTab === 'accepted') {
            result = result.filter((q) => q.status === 'Accepted');
        } else if (activeTab === 'rejected') {
            result = result.filter((q) => q.status === 'Rejected');
        }

        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase().trim();
            result = result.filter(
                (item) =>
                    (showNumber('quotation') && item.quotationCode && item.quotationCode.toLowerCase().includes(q)) ||
                    (item.organizationName && item.organizationName.toLowerCase().includes(q)) ||
                    (item.contact && item.contact.toLowerCase().includes(q)) ||
                    (item.quotationTitle && item.quotationTitle.toLowerCase().includes(q)) ||
                    (item.quotationSubject && item.quotationSubject.toLowerCase().includes(q)) ||
                    (showNumber('opportunity') && item.opportunityCode && item.opportunityCode.toLowerCase().includes(q))
            );
        }

        // Sorting
        result.sort((a, b) => {
            // Any column's field key: numbers compare as numbers, everything else as text.
            const valA = (a as unknown as Record<string, unknown>)[sortField] ?? '';
            const valB = (b as unknown as Record<string, unknown>)[sortField] ?? '';

            if (typeof valA === 'number' && typeof valB === 'number') {
                return sortOrder === 'asc' ? valA - valB : valB - valA;
            }
            return sortOrder === 'asc'
                ? String(valA).localeCompare(String(valB))
                : String(valB).localeCompare(String(valA));
        });

        return result;
    }, [quotations, activeTab, searchQuery, sortField, sortOrder, showNumber]);

    const paginatedQuotations = useMemo(() => {
        const start = page * rowsPerPage;
        return filteredQuotations.slice(start, start + rowsPerPage);
    }, [filteredQuotations, page, rowsPerPage]);

    // ── Columns ───────────────────────────────────────────────────────────────
    const openDrawerRecord = useCallback((record: Quotation) => setDrawerQuotationId(record.id), []);
    const columns = useQuotationColumns(openDrawerRecord);

    const handleSort = (field: string) => {
        const isAsc = sortField === field && sortOrder === 'asc';
        setSortOrder(isAsc ? 'desc' : 'asc');
        setSortField(field as QuotationSortField);
    };

    return (
        <CommonMasterView<Quotation, QuotationFilterTab>
            loading={listLoading}
            breadcrumbItems={[
                { label: 'Sales' },
                { label: 'Quotations' },
            ]}
            filterConfig={{
                filters: filterItems,
                activeFilter: activeTab,
                onFilterChange: (tab) => {
                    setActiveTab(tab);
                    setPage(0);
                },
                variant: 'pill',
            }}
            tableId="quotations"
            tableFilter={tableFilter}
            headerActions={() => (
                <MasterHeaderActions
                    onRefresh={async () => {
                        const { isError } = await refetch();
                        setToast(
                            isError
                                ? { open: true, message: 'Failed to refresh quotations.', severity: 'error' }
                                : { open: true, message: 'Quotations refreshed.', severity: 'info' }
                        );
                    }}
                />
            )}
            searchConfig={buildExtendedSearchConfig({
                searchQuery,
                onSearchChange: (q) => {
                    setSearchQuery(q);
                    setPage(0);
                },
                searchPlaceholder: 'Search by quote code, customer, subject...',
                pageIds: paginatedQuotations.map((r) => r.id),
                allIds: filteredQuotations.map((r) => r.id),
                selectedIds,
                onSelectedIdsChange: setSelectedIds,
                page,
                rowsPerPage,
                totalRecords: filteredQuotations.length,
                onPageChange: setPage,
                onBulkDelete: handleBulkDelete,
            })}
            columns={columns}
            data={paginatedQuotations}
            keyExtractor={(item) => item.id}
            selectedIds={selectedIds}
            onToggleSelectRow={(id) => {
                setSelectedIds((prev) =>
                    prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
                );
            }}
            onToggleSelectAll={(checked) => {
                if (checked) {
                    setSelectedIds(paginatedQuotations.map((q) => q.id));
                } else {
                    setSelectedIds([]);
                }
            }}
            sortField={sortField}
            sortOrder={sortOrder}
            onSort={handleSort}
            onView={(quote) => setDrawerQuotationId(quote.id)}
            getEditHref={(quote) => ROUTES.QUOTATION_EDIT(quote.id)}
            onDelete={(quote) => handleDelete(quote.id)}
            getRowHref={(quote) => ROUTES.QUOTATION_DETAIL(quote.id)}
            onRowClick={(quote) => setDrawerQuotationId(quote.id)}
            activeRowId={selectedDrawerQuotation?.id}
            viewTooltip="View Quotation Details"
            editTooltip="Edit Quotation"
            deleteTooltip="Delete Quotation"
            // Strictly omit onEmptyAction and emptyActionLabel so no "+ New Quotation" button appears
            emptyTitle="No quotations found"
            emptyDescription="Quotations can be created directly from an Opportunity via the 'Create Quote' action."
            pagination={{
                page,
                rowsPerPage,
                totalCount: filteredQuotations.length,
                entityLabel: 'Quotations',
                pageSizeOptions: [10, 25, 50],
                onPageChange: (newPage) => setPage(newPage),
                onRowsPerPageChange: (newRows) => {
                    setRowsPerPage(newRows);
                    setPage(0);
                },
            }}
            drawer={
                <QuotationDetailDrawer
                    quotation={selectedDrawerQuotation}
                    open={Boolean(selectedDrawerQuotation)}
                    onClose={closeDrawer}
                    onEdit={(id) => router.push(ROUTES.QUOTATION_EDIT(id))}
                    onShowToast={(message, severity = 'success') => {
                        setToast({ open: true, message, severity });
                    }}
                />
            }
            isDrawerOpen={Boolean(selectedDrawerQuotation)}
            toast={
                <AppToast
                    open={toast.open}
                    message={toast.message}
                    severity={toast.severity}
                    onClose={() => setToast((prev) => ({ ...prev, open: false }))}
                />
            }
        />
    );
}
