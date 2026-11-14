'use client';

import React, { useState, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Box, Chip, Typography } from '@mui/material';
import RequestQuoteOutlinedIcon from '@mui/icons-material/RequestQuoteOutlined';
import DraftsOutlinedIcon from '@mui/icons-material/DraftsOutlined';
import SendOutlinedIcon from '@mui/icons-material/SendOutlined';
import CheckCircleOutlinedIcon from '@mui/icons-material/CheckCircleOutlined';
import CancelOutlinedIcon from '@mui/icons-material/CancelOutlined';
import ApartmentIcon from '@mui/icons-material/Apartment';
import PersonOutlinedIcon from '@mui/icons-material/PersonOutlined';

import { CommonMasterView } from '../common/CommonMasterView';
import { useTableFilter } from '../common/TableFilter';
import { MasterHeaderActions } from '../common/MasterHeaderActions';
import { buildExtendedSearchConfig } from '../common/buildExtendedSearchConfig';
import { AppToast } from '../common/AppToast';
import { RelatedModulesSidebar, RelatedRecordsTableView } from '../common/Drawer';
import { RelatedSecondaryDrawer, type SecondaryDrawerEntity } from '../common/RelatedSecondaryDrawer';
import { documentNumberColumn, type DataTableColumn, type DataTableFilterItem } from '../common/DataTable';
import { ROUTES } from '@/config/constants';
import { useRelatedModulesForEntity } from '@/config/relatedModules.config';
import type { Quotation } from '@/types/quotation.types';
import { useQuotations, useDeleteQuotation, useBulkDeleteQuotations } from '@/hooks/queries';
import { QuotationDetailDrawer } from './QuotationDetailDrawer';
import { wasModified } from '../common/Drawer/RecordAuditFooter';
import { formatDateTime } from '@/utils/date';

export type QuotationFilterTab = 'all' | 'draft' | 'sent' | 'accepted' | 'rejected';
/** Any column's field key: the table sorts on `row[sortField]`, including columns added from the form. */
export type QuotationSortField = string;

const formatCurrency = (val: number = 0) =>
    new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR',
        maximumFractionDigits: 0,
    }).format(val);

const plainCellSx = { fontSize: '0.78rem', color: 'var(--crm-slate-700)' } as const;

const STAGE_COLORS: Record<string, { bg: string; color: string; border: string }> = {
    Draft: { bg: 'var(--mui-palette-background-hover)', color: 'var(--crm-slate-600)', border: 'var(--mui-palette-border-strong)' },
    Negotiation: { bg: 'var(--mui-palette-warning-soft)', color: 'var(--crm-amber-700)', border: 'var(--mui-palette-warning-softBorder)' },
    Delivered: { bg: 'var(--mui-palette-primary-soft)', color: 'var(--crm-text-blue-700)', border: 'var(--mui-palette-primary-softBorder)' },
    'On Hold': { bg: 'var(--crm-rose-50)', color: 'var(--crm-rose-700)', border: 'var(--crm-rose-200)' },
    Confirmed: { bg: 'var(--mui-palette-success-soft)', color: 'var(--crm-emerald-700)', border: 'var(--mui-palette-success-softBorder)' },
    'Closed Accepted': { bg: 'var(--mui-palette-success-soft)', color: 'var(--crm-emerald-700)', border: 'var(--mui-palette-success-softBorder)' },
    'Closed Lost': { bg: 'var(--mui-palette-error-soft)', color: 'var(--crm-red-700)', border: 'var(--mui-palette-error-softBorder)' },
    'Closed Dead': { bg: 'var(--mui-palette-background-hover)', color: 'var(--mui-palette-text-secondary)', border: 'var(--mui-palette-border-strong)' },
    // Older records still carry the legacy status names.
    Sent: { bg: 'var(--mui-palette-primary-soft)', color: 'var(--crm-text-blue-700)', border: 'var(--mui-palette-primary-softBorder)' },
    Accepted: { bg: 'var(--mui-palette-success-soft)', color: 'var(--crm-emerald-700)', border: 'var(--mui-palette-success-softBorder)' },
    Rejected: { bg: 'var(--mui-palette-error-soft)', color: 'var(--crm-red-700)', border: 'var(--mui-palette-error-softBorder)' },
};

/** Stable empty list while the first page loads (keeps memoized filters from recomputing). */
const NO_RECORDS: Quotation[] = [];
export function QuotationsMasterView() {
    const router = useRouter();

    const { data: allQuotations = NO_RECORDS, refetch } = useQuotations();
    const deleteMutation = useDeleteQuotation();
    const bulkDeleteMutation = useBulkDeleteQuotations();
    const [activeTab, setActiveTab] = useState<QuotationFilterTab>('all');
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
    const [activeRelatedModule, setActiveRelatedModule] = useState<string | null>(null);
    const [secondaryDrawerEntity, setSecondaryDrawerEntity] = useState<SecondaryDrawerEntity | null>(null);
    const [isLeftSidebarCollapsed, setIsLeftSidebarCollapsed] = useState<boolean>(false);
    const [toast, setToast] = useState<{
        open: boolean;
        message: string;
        severity: 'success' | 'error' | 'info' | 'warning';
    }>({
        open: false,
        message: '',
        severity: 'success',
    });

    const closeThreePanelView = useCallback(() => {
        setSecondaryDrawerEntity(null);
        setDrawerQuotationId(null);
        setActiveRelatedModule(null);
    }, []);

    const handleDelete = async (id: string) => {
        const quote = quotations.find((q) => q.id === id);
        const label = quote?.quotationCode ? `"${quote.quotationCode}"` : 'this quotation';
        if (!window.confirm(`Are you sure you want to delete ${label}?`)) return;

        try {
            await deleteMutation.mutateAsync(id);
            if (drawerQuotationId === id) {
                closeThreePanelView();
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
                closeThreePanelView();
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
                    (item.quotationCode && item.quotationCode.toLowerCase().includes(q)) ||
                    (item.organizationName && item.organizationName.toLowerCase().includes(q)) ||
                    (item.contactName && item.contactName.toLowerCase().includes(q)) ||
                    (item.quotationTitle && item.quotationTitle.toLowerCase().includes(q)) ||
                    (item.quotationSubject && item.quotationSubject.toLowerCase().includes(q)) ||
                    (item.opportunityCode && item.opportunityCode.toLowerCase().includes(q))
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
    }, [quotations, activeTab, searchQuery, sortField, sortOrder]);

    const paginatedQuotations = useMemo(() => {
        const start = page * rowsPerPage;
        return filteredQuotations.slice(start, start + rowsPerPage);
    }, [filteredQuotations, page, rowsPerPage]);

    // ── Columns ───────────────────────────────────────────────────────────────
    const columns: DataTableColumn<Quotation>[] = useMemo(
        () => [
            documentNumberColumn<Quotation>({
                id: 'quotationCode',
                label: 'QUOTATION NUMBER',
                getNumber: (row) => row.quotationCode,
                getHref: (row) => ROUTES.QUOTATION_DETAIL(row.id),
                onOpen: (row) => setDrawerQuotationId(row.id),
            }),
            {
                id: 'quotationTitle',
                label: 'TITLE',
                sortable: true,
                minWidth: 200,
                render: (row) => (
                    <Typography sx={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--mui-palette-text-primary)' }}>
                        {row.quotationTitle || row.quotationSubject || '-'}
                    </Typography>
                ),
            },
            {
                id: 'opportunityName',
                label: 'OPPORTUNITY',
                sortable: true,
                minWidth: 160,
                render: (row) => (
                    <Typography sx={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--crm-text-blue-600)' }}>
                        {row.opportunityName || row.opportunityCode || '-'}
                    </Typography>
                ),
            },
            {
                // Derived: the quotation was edited after it was first saved.
                id: 'revised',
                label: 'REVISED',
                sortable: false,
                minWidth: 100,
                render: (row) => {
                    const revised = wasModified(row);
                    return (
                        <Typography sx={{ fontSize: '0.76rem', fontWeight: 600, color: revised ? 'var(--crm-amber-700)' : 'var(--mui-palette-text-muted)' }}>
                            {revised ? 'Yes' : 'No'}
                        </Typography>
                    );
                },
            },
            {
                id: 'quoteStage',
                label: 'QUOTE STAGE',
                sortable: true,
                minWidth: 130,
                render: (row) => {
                    const stage = String(row.quoteStage || row.status || 'Draft');
                    const st = STAGE_COLORS[stage] ?? STAGE_COLORS.Draft;
                    return (
                        <Chip
                            label={stage}
                            size="small"
                            sx={{
                                backgroundColor: st.bg,
                                color: st.color,
                                border: `1px solid ${st.border}`,
                                fontWeight: 700,
                                fontSize: '0.72rem',
                                height: 22,
                            }}
                        />
                    );
                },
            },
            {
                id: 'contactName',
                label: 'CONTACT',
                sortable: true,
                minWidth: 150,
                render: (row) => (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.8 }}>
                        <PersonOutlinedIcon sx={{ fontSize: 15, color: 'var(--mui-palette-text-muted)' }} />
                        <Typography sx={{ fontSize: '0.8rem', color: 'var(--crm-slate-600)' }}>{row.contactName || '-'}</Typography>
                    </Box>
                ),
            },
            {
                id: 'organizationName',
                label: 'ORGANIZATION',
                sortable: true,
                minWidth: 180,
                render: (row) => (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.8 }}>
                        <ApartmentIcon sx={{ fontSize: 15, color: 'var(--mui-palette-text-secondary)' }} />
                        <Typography sx={{ fontSize: '0.8rem', fontWeight: 500, color: 'var(--crm-slate-700)' }}>
                            {row.organizationName || '-'}
                        </Typography>
                    </Box>
                ),
            },
            {
                id: 'grandTotal',
                label: 'GRAND TOTAL',
                sortable: true,
                align: 'right',
                minWidth: 130,
                render: (row) => (
                    <Typography sx={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--crm-slate-900)' }}>
                        {formatCurrency(row.grandTotal)}
                    </Typography>
                ),
            },
            {
                id: 'validUntil',
                label: 'VALID UNTIL',
                sortable: true,
                minWidth: 120,
                render: (row) => <Typography sx={plainCellSx}>{row.validUntil || '-'}</Typography>,
            },
            {
                id: 'assignedTo',
                label: 'USER',
                sortable: true,
                minWidth: 120,
                render: (row) => <Typography sx={plainCellSx}>{row.assignedTo || '-'}</Typography>,
            },
            {
                id: 'createdAt',
                label: 'DATE CREATED',
                sortable: true,
                minWidth: 170,
                render: (row) => <Typography sx={plainCellSx}>{formatDateTime(row.createdAt) || '-'}</Typography>,
            },
        ],
        []
    );

    const handleSort = (field: string) => {
        const isAsc = sortField === field && sortOrder === 'asc';
        setSortOrder(isAsc ? 'desc' : 'asc');
        setSortField(field as QuotationSortField);
    };

    const relatedModules = useRelatedModulesForEntity('quotation', selectedDrawerQuotation, setActiveRelatedModule);

    // Falls back to the first module until the user explicitly picks one.
    const effectiveRelatedModule = activeRelatedModule ?? relatedModules[0]?.id ?? null;
    const activeModuleMeta = relatedModules.find((m) => m.id === effectiveRelatedModule);

    return (
        <CommonMasterView<Quotation, QuotationFilterTab>
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
            relatedSidebar={
                <RelatedModulesSidebar
                    open={Boolean(selectedDrawerQuotation)}
                    modules={relatedModules}
                    activeModuleId={effectiveRelatedModule ?? undefined}
                    onModuleSelect={(moduleId) => setActiveRelatedModule(moduleId)}
                    collapsed={isLeftSidebarCollapsed}
                    onToggleCollapse={setIsLeftSidebarCollapsed}
                />
            }
            relatedRecordsTable={
                <RelatedRecordsTableView
                    open={Boolean(selectedDrawerQuotation && effectiveRelatedModule)}
                    moduleId={effectiveRelatedModule || ''}
                    moduleTitle={activeModuleMeta?.label || 'Related Records'}
                    parentRecordId={selectedDrawerQuotation?.id}
                    parentEntityTitle={selectedDrawerQuotation?.quotationCode || selectedDrawerQuotation?.quotationSubject || ''}
                    entityData={selectedDrawerQuotation}
                    entityType="quotation"
                    leftOffset={isLeftSidebarCollapsed ? 72 : 260}
                    rightOffset={580}
                    onClose={closeThreePanelView}
                    onRowClick={(row, modId) => setSecondaryDrawerEntity({ type: modId, data: row })}
                />
            }
            drawer={
                <QuotationDetailDrawer
                    quotation={selectedDrawerQuotation}
                    open={Boolean(selectedDrawerQuotation)}
                    onClose={closeThreePanelView}
                    onEdit={(id) => router.push(ROUTES.QUOTATION_EDIT(id))}
                    onShowToast={(message, severity = 'success') => {
                        setToast({ open: true, message, severity });
                    }}
                />
            }
            secondaryDrawer={
                secondaryDrawerEntity ? (
                    <RelatedSecondaryDrawer
                        entity={secondaryDrawerEntity}
                        moduleLabel={activeModuleMeta?.label}
                        parentTitle={selectedDrawerQuotation?.quotationCode || selectedDrawerQuotation?.quotationSubject}
                        onClose={() => setSecondaryDrawerEntity(null)}
                    />
                ) : null
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
