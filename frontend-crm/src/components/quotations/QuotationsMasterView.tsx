'use client';

import React, { useState, useMemo, useCallback } from 'react';
import { useResetTab } from '@/hooks/useResetTab';
import { useRouter } from 'next/navigation';
import AccountCircleOutlinedIcon from '@mui/icons-material/AccountCircleOutlined';
import WorkspacePremiumOutlinedIcon from '@mui/icons-material/WorkspacePremiumOutlined';
import FileUploadOutlinedIcon from '@mui/icons-material/FileUploadOutlined';
import { Button } from '@mui/material';

import { ModuleScorecardSummary, useModuleScorecard } from '../common/scorecard/useModuleScorecard';
import { CommonMasterView } from '../common/CommonMasterView';
import { useTableFilter } from '../common/TableFilter';
import { MasterHeaderActions, outlinedHeaderButtonSx, type MasterExportConfig } from '../common/MasterHeaderActions';
import { useMasterPermissions } from '../common/masterPermissions';
import { buildExtendedSearchConfig } from '../common/buildExtendedSearchConfig';
import { AppToast } from '../common/AppToast';
import { DataImportModal } from '../common/import';
import { wasModified } from '../common/Drawer/RecordAuditFooter';
import { useSaveFlash } from '@/utils/saveFlash';
import type { CsvColumn } from '@/utils/csvExport';
import { exportDate, exportDateTime, exportList, exportMoney, exportUser, exportYesNo, selectedOrAll } from '@/utils/exportCells';
import { getCountryNameByCode } from '@/data/addressMaster';
import { type DataTableFilterItem } from '../common/DataTable';
import { ROUTES } from '@/config/constants';
import { useAuth } from '@/context/AuthContext';
import type { Quotation } from '@/types/quotation.types';
import { useQuotations, useDeleteQuotation, useBulkDeleteQuotations, useMasterData } from '@/hooks/queries';
import { useShowRecordNumber } from '@/hooks/queries/useDocumentSeries';
import { QuotationDetailDrawer } from './QuotationDetailDrawer';
import { useSearchScope, useSearchScopedRows } from '../search/SearchScope';
import { useQuotationColumns } from './quotationColumns';

/** Quick-view pills ('all' = none picked); the quote stage lives on the stage cards. */
export type QuotationFilterTab = 'all' | 'high_value' | 'my_quotes';
/** Any column's field key: the table sorts on `row[sortField]`, including columns added from the form. */
export type QuotationSortField = string;

/** Stable empty list while the first page loads (keeps memoized filters from recomputing). */
const NO_RECORDS: Quotation[] = [];
/** "High Value" pill: Grand Total of ₹1 lakh or more, as on Opportunities. */
const HIGH_VALUE = 100000;

/** Assigned users (one username or several, comma-separated) by display name, joined with ', '. */
const exportAssignees = (value: string | null | undefined): string =>
    exportList((value || '').split(',').map((v) => exportUser(v.trim())), ', ');

/** A billing / shipping country (stored as an ISO code, older rows by name) by its name. */
const exportCountry = (value: string | null | undefined): string => (value ? getCountryNameByCode(value) || value : '');

/**
 * The quotations CSV: the table's columns first (same headers, same text: Title falls back to the subject,
 * Opportunity to its number, Quote Stage to the legacy status), then the other useful scalar fields of the quote.
 * The number columns follow the document series' "show number" setting, as the table does.
 */
function buildQuotationCsvColumns(showQuoteNumber: boolean, showOpportunityNumber: boolean): CsvColumn<Quotation>[] {
    return [
        ...(showQuoteNumber ? [{ header: 'Quotation Number', value: (q: Quotation) => q.quotationCode }] : []),
        { header: 'Title', value: (q) => q.quotationTitle || q.quotationSubject || '' },
        { header: 'Opportunity', value: (q) => q.opportunity || (showOpportunityNumber ? q.opportunityCode : '') || '' },
        ...(showOpportunityNumber ? [{ header: 'Opportunity Number', value: (q: Quotation) => q.opportunityCode }] : []),
        { header: 'Revised', value: (q) => exportYesNo(wasModified(q)) },
        { header: 'Quote Stage', value: (q) => String(q.quoteStage || q.status || 'Draft') },
        { header: 'Contact', value: (q) => q.contact },
        { header: 'Organization', value: (q) => q.organizationName },
        { header: 'Grand Total', value: (q) => exportMoney(q.grandTotal) },
        { header: 'Valid Until', value: (q) => exportDate(q.validUntil) },
        { header: 'User', value: (q) => exportAssignees(q.assignedTo) },
        // Export cells keep one fixed format whatever the company display formats.
        { header: 'Date Created', value: (q) => exportDateTime(q.createdAt) },
        { header: 'Quotation Date', value: (q) => exportDate(q.quotationDate || q.quoteDate) },
        { header: 'Company', value: (q) => q.company },
        { header: 'Validation Period', value: (q) => q.validationPeriod },
        { header: 'Prepared For', value: (q) => q.preparedFor },
        { header: 'Payment Terms', value: (q) => q.paymentTerms },
        { header: 'Terms and Conditions', value: (q) => q.termsAndCondition || q.termsAndConditions },
        { header: 'Other Reference', value: (q) => q.otherRef },
        { header: 'Currency', value: (q) => q.currency },
        { header: 'Gross Amount', value: (q) => exportMoney(q.totalAmount) },
        { header: 'Total Discount', value: (q) => exportMoney(q.totalDiscount) },
        { header: 'Total Taxable Amount', value: (q) => exportMoney(q.subtotal) },
        { header: 'Lump Sum Discount', value: (q) => exportMoney(q.lumpSumDiscount) },
        { header: 'Total Tax', value: (q) => exportMoney(q.totalTax) },
        { header: 'Round Off', value: (q) => exportMoney(q.roundOffAmount) },
        { header: 'Contact Number', value: (q) => q.contactNumber },
        { header: 'Contact Email', value: (q) => q.contactEmail },
        { header: 'GST Number', value: (q) => q.gstNumber },
        { header: 'Billing City', value: (q) => q.billingCity },
        { header: 'Billing State', value: (q) => q.billingState },
        { header: 'Billing Country', value: (q) => exportCountry(q.billingCountry) },
        { header: 'Shipping City', value: (q) => q.shippingCity },
        { header: 'Shipping State', value: (q) => q.shippingState },
        { header: 'Shipping Country', value: (q) => exportCountry(q.shippingCountry) },
        { header: 'Created By', value: (q) => exportUser(q.createdBy) },
        { header: 'Last Modified', value: (q) => exportDateTime(q.updatedAt) },
    ];
}

/**
 * Import button for the quotations list. Quotations have no New button (they are created from an opportunity), so
 * MasterHeaderActions' New / Import split button never shows here; this outlined button takes its place, shown only
 * when the role may both create and import quotations (the same rule as the split button).
 */
function QuotationImportButton({ onClick }: { onClick: () => void }) {
    const { canCreate, canImport } = useMasterPermissions();
    if (!canCreate || !canImport) return null;
    return (
        <Button
            variant="outlined"
            size="small"
            startIcon={<FileUploadOutlinedIcon sx={{ fontSize: 16 }} />}
            onClick={onClick}
            sx={outlinedHeaderButtonSx}
        >
            Import
        </Button>
    );
}

export function QuotationsMasterView() {
    const router = useRouter();
    const { user } = useAuth();
    const currentUsername = user?.username || '';
    // Re-renders once the user directory loads, so the export writes users by full name.
    useMasterData();

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
    const [importOpen, setImportOpen] = useState(false);
    const [page, setPage] = useState(0);
    const [rowsPerPage, setRowsPerPage] = useState(10);
    const [sortField, setSortField] = useState<QuotationSortField>('createdAt');
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
    // Tracked by id so the drawer always shows the cached copy and closes if the quotation is deleted.
    const [drawerQuotationId, setDrawerQuotationId] = useState<string | null>(null);
    // ── Columns ───────────────────────────────────────────────────────────────
    const openDrawerRecord = useCallback((record: Quotation) => setDrawerQuotationId(record.id), []);
    const columns = useQuotationColumns(openDrawerRecord);
    const tableFilter = useTableFilter<Quotation>({
        module: 'quotations',
        rows: allQuotations,
        columns,
        onSortChange: (s) => {
            setSortField(s.field as QuotationSortField);
            setSortOrder(s.order);
        },
        onChange: () => setPage(0),
    });
    /** Records left by the Filter dialog: tabs, counts, search and bulk actions work on these. */
    const quotations = tableFilter.filteredRows;
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

    // ── Quick View Pills ──────────────────────────────────────────────────────
    // The quote stage (All / Draft / ...) lives on the stage cards; the pills are other views and toggle off on
    // re-click, as on Opportunities.
    const isMine = useCallback(
        (q: Quotation) => Boolean(currentUsername) && (q.assignedTo || '').includes(currentUsername),
        [currentUsername]
    );
    const filterItems: DataTableFilterItem<QuotationFilterTab>[] = useMemo(() => {
        return [
            {
                id: 'high_value',
                label: 'High Value (₹1L+)',
                icon: <WorkspacePremiumOutlinedIcon sx={{ fontSize: 16 }} />,
                count: quotations.filter((q) => (Number(q.grandTotal) || 0) >= HIGH_VALUE).length,
                activeColor: 'var(--crm-violet-600)',
            },
            {
                id: 'my_quotes',
                label: 'My Quotes',
                icon: <AccountCircleOutlinedIcon sx={{ fontSize: 16 }} />,
                count: quotations.filter(isMine).length,
            },
        ];
    }, [quotations, isMine]);

    /** Quotations in the active pill view: the stage cards count these, so "My Quotes" shows my quotes by stage. */
    const tabQuotations = useMemo(() => {
        if (activeTab === 'high_value') return quotations.filter((q) => (Number(q.grandTotal) || 0) >= HIGH_VALUE);
        if (activeTab === 'my_quotes') return quotations.filter(isMine);
        return quotations;
    }, [quotations, activeTab, isMine]);

    // ── Stage Cards ───────────────────────────────────────────────────────────
    // One card per quote stage with its count and Grand Total, until an admin sets up other cards (or switches them
    // off) under Admin › List Scorecards.
    const goToFirstPage = useCallback(() => setPage(0), []);
    const scorecard = useModuleScorecard<Quotation>({ module: 'quotations', rows: tabQuotations, onActiveChange: goToFirstPage });

    // ── Filtering Logic ───────────────────────────────────────────────────────
    const showNumber = useShowRecordNumber();
    const { matches: matchesScorecard } = scorecard;
    const filteredQuotations = useMemo(() => {
        let result = tabQuotations.filter(matchesScorecard);

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
    }, [tabQuotations, matchesScorecard, searchQuery, sortField, sortOrder, showNumber]);

    const paginatedQuotations = useMemo(() => {
        const start = page * rowsPerPage;
        return filteredQuotations.slice(start, start + rowsPerPage);
    }, [filteredQuotations, page, rowsPerPage]);


    const csvColumns = useMemo(
        () => buildQuotationCsvColumns(showNumber('quotation'), showNumber('opportunity')),
        [showNumber]
    );
    const exportConfig: MasterExportConfig<Quotation> = {
        fileName: 'quotations',
        noun: { singular: 'quotation', plural: 'quotations' },
        rows: () => selectedOrAll(filteredQuotations, selectedIds, allQuotations),
        columns: csvColumns,
        onNotify: (message, severity) => setToast({ open: true, message, severity }),
    };

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
            summary={<ModuleScorecardSummary state={scorecard} loading={listLoading} />}
            filterConfig={{
                filters: filterItems,
                activeFilter: activeTab,
                onFilterChange: (tab) => {
                    setActiveTab((prev) => (prev === tab ? 'all' : tab));
                    setPage(0);
                },
            }}
            tableId="quotations"
            importEntity="quotations"
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
                    exportConfig={exportConfig}
                >
                    <QuotationImportButton onClick={() => setImportOpen(true)} />
                </MasterHeaderActions>
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
        >
            <DataImportModal
                open={importOpen}
                entity="quotations"
                onClose={() => setImportOpen(false)}
            />
        </CommonMasterView>
    );
}
