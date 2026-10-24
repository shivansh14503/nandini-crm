'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
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
import { AppToast } from '../common/AppToast';
import { RelatedModulesSidebar, RelatedRecordsTableView } from '../common/Drawer';
import { RelatedSecondaryDrawer, type SecondaryDrawerEntity } from '../common/RelatedSecondaryDrawer';
import type { DataTableColumn, DataTableFilterItem } from '../common/DataTable';
import { ROUTES } from '@/config/constants';
import { getRelatedModulesForEntity } from '@/config/relatedModules.config';
import type { Quotation } from '@/types/quotation.types';
import { quotationService, subscribeCrmSync } from '@/services';
import { QuotationDetailDrawer } from './QuotationDetailDrawer';

export type QuotationFilterTab = 'all' | 'draft' | 'sent' | 'accepted' | 'rejected';
export type QuotationSortField = 'quotationCode' | 'organizationName' | 'grandTotal' | 'quoteDate' | 'validUntil' | 'status';

const formatCurrency = (val: number = 0) =>
    new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR',
        maximumFractionDigits: 0,
    }).format(val);

export function QuotationsMasterView() {
    const router = useRouter();

    const [quotations, setQuotations] = useState<Quotation[]>([]);
    const [activeTab, setActiveTab] = useState<QuotationFilterTab>('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [page, setPage] = useState(0);
    const [rowsPerPage, setRowsPerPage] = useState(10);
    const [sortField, setSortField] = useState<QuotationSortField>('quotationCode');
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
    const [selectedDrawerQuotation, setSelectedDrawerQuotation] = useState<Quotation | null>(null);
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

    const loadQuotations = useCallback(() => {
        const data = quotationService.getAllSync();
        setQuotations(data);
        setSelectedDrawerQuotation((prev) => {
            if (!prev) return null;
            return data.find((q) => q.id === prev.id) || null;
        });
    }, []);

    const closeThreePanelView = useCallback(() => {
        setSecondaryDrawerEntity(null);
        setSelectedDrawerQuotation(null);
        setActiveRelatedModule(null);
    }, []);

    const handleDelete = async (id: string) => {
        const quote = quotations.find((q) => q.id === id);
        const label = quote?.quotationCode ? `"${quote.quotationCode}"` : 'this quotation';
        if (!window.confirm(`Are you sure you want to delete ${label}?`)) return;

        await quotationService.delete(id);
        loadQuotations();
        if (selectedDrawerQuotation?.id === id) {
            closeThreePanelView();
        }
        setToast({
            open: true,
            message: 'Quotation deleted successfully.',
            severity: 'success',
        });
    };

    const handleBulkDelete = async () => {
        if (selectedIds.length === 0) return;
        if (!window.confirm(`Are you sure you want to delete ${selectedIds.length} selected quotation(s)?`)) return;

        await quotationService.deleteBulk(selectedIds);
        setSelectedIds([]);
        loadQuotations();
        if (selectedDrawerQuotation && selectedIds.includes(selectedDrawerQuotation.id)) {
            closeThreePanelView();
        }
        setToast({
            open: true,
            message: `${selectedIds.length} quotation(s) deleted successfully.`,
            severity: 'success',
        });
    };

    useEffect(() => {
        let active = true;
        quotationService
            .getAll()
            .then((data) => {
                if (active) {
                    setQuotations(data);
                    setSelectedDrawerQuotation((prev) => {
                        if (!prev) return null;
                        return data.find((q) => q.id === prev.id) || null;
                    });
                }
            })
            .catch(() => {
                loadQuotations();
            });
        return () => {
            active = false;
        };
    }, [loadQuotations]);

    useEffect(() => {
        const handleFocus = () => {
            loadQuotations();
        };
        const handleVisibility = () => {
            if (document.visibilityState === 'visible') {
                loadQuotations();
            }
        };

        window.addEventListener('focus', handleFocus);
        document.addEventListener('visibilitychange', handleVisibility);
        const unsubscribe = subscribeCrmSync(loadQuotations);

        return () => {
            window.removeEventListener('focus', handleFocus);
            document.removeEventListener('visibilitychange', handleVisibility);
            unsubscribe();
        };
    }, [loadQuotations]);

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
                activeColor: '#64748b',
            },
            {
                id: 'sent',
                label: 'Sent',
                icon: <SendOutlinedIcon sx={{ fontSize: 16 }} />,
                count: quotations.filter((q) => q.status === 'Sent').length,
                activeColor: '#2563eb',
            },
            {
                id: 'accepted',
                label: 'Accepted',
                icon: <CheckCircleOutlinedIcon sx={{ fontSize: 16 }} />,
                count: quotations.filter((q) => q.status === 'Accepted').length,
                activeColor: '#059669',
            },
            {
                id: 'rejected',
                label: 'Rejected',
                icon: <CancelOutlinedIcon sx={{ fontSize: 16 }} />,
                count: quotations.filter((q) => q.status === 'Rejected').length,
                activeColor: '#dc2626',
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
            let valA: string | number = '';
            let valB: string | number = '';

            switch (sortField) {
                case 'quotationCode':
                    valA = a.quotationCode || '';
                    valB = b.quotationCode || '';
                    break;
                case 'organizationName':
                    valA = a.organizationName || '';
                    valB = b.organizationName || '';
                    break;
                case 'grandTotal':
                    valA = a.grandTotal || 0;
                    valB = b.grandTotal || 0;
                    break;
                case 'quoteDate':
                    valA = a.quoteDate || '';
                    valB = b.quoteDate || '';
                    break;
                case 'validUntil':
                    valA = a.validUntil || '';
                    valB = b.validUntil || '';
                    break;
                case 'status':
                    valA = a.status || '';
                    valB = b.status || '';
                    break;
                default:
                    valA = a.quotationCode || '';
                    valB = b.quotationCode || '';
            }

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
            {
                id: 'quotationCode',
                label: 'QUOTE CODE',
                sortable: true,
                minWidth: 150,
                render: (row) => (
                    <Typography
                        sx={{
                            fontSize: '0.82rem',
                            fontWeight: 700,
                            color: '#1d4ed8',
                            fontFamily: 'monospace',
                            cursor: 'pointer',
                            '&:hover': { textDecoration: 'underline' },
                        }}
                    >
                        {row.quotationCode}
                    </Typography>
                ),
            },
            {
                id: 'quotationSubject',
                label: 'SUBJECT',
                sortable: false,
                minWidth: 220,
                render: (row) => (
                    <Typography
                        noWrap
                        sx={{
                            fontSize: '0.8rem',
                            fontWeight: 600,
                            color: '#1e293b',
                            maxWidth: 240,
                        }}
                        title={row.quotationSubject}
                    >
                        {row.quotationSubject || 'Quotation'}
                    </Typography>
                ),
            },
            {
                id: 'organizationName',
                label: 'ORGANIZATION',
                sortable: true,
                minWidth: 200,
                render: (row) => (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.8 }}>
                        <ApartmentIcon sx={{ fontSize: 15, color: '#64748b' }} />
                        <Typography
                            noWrap
                            sx={{
                                fontSize: '0.8rem',
                                fontWeight: 500,
                                color: '#334155',
                                maxWidth: 180,
                            }}
                        >
                            {row.organizationName}
                        </Typography>
                    </Box>
                ),
            },
            {
                id: 'contactName',
                label: 'CONTACT PERSON',
                sortable: true,
                minWidth: 160,
                render: (row) => (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.8 }}>
                        <PersonOutlinedIcon sx={{ fontSize: 15, color: '#94a3b8' }} />
                        <Typography sx={{ fontSize: '0.8rem', color: '#475569' }}>
                            {row.contactName}
                        </Typography>
                    </Box>
                ),
            },
            {
                id: 'opportunityCode',
                label: 'OPPORTUNITY',
                sortable: false,
                minWidth: 140,
                render: (row) => (
                    <Typography
                        sx={{
                            fontSize: '0.8rem',
                            fontWeight: 600,
                            color: '#2563eb',
                            fontFamily: 'monospace',
                        }}
                    >
                        {row.opportunityCode || row.opportunityId || '-'}
                    </Typography>
                ),
            },
            {
                id: 'grandTotal',
                label: 'TOTAL AMOUNT',
                sortable: true,
                align: 'right',
                minWidth: 140,
                render: (row) => (
                    <Typography sx={{ fontSize: '0.82rem', fontWeight: 700, color: '#0f172a' }}>
                        {formatCurrency(row.grandTotal)}
                    </Typography>
                ),
            },
            {
                id: 'quoteDate',
                label: 'DATE',
                sortable: true,
                minWidth: 120,
                render: (row) => (
                    <Typography sx={{ fontSize: '0.78rem', color: '#64748b' }}>
                        {row.quoteDate}
                    </Typography>
                ),
            },
            {
                id: 'validUntil',
                label: 'VALID UNTIL',
                sortable: true,
                minWidth: 120,
                render: (row) => (
                    <Typography sx={{ fontSize: '0.78rem', color: '#64748b' }}>
                        {row.validUntil}
                    </Typography>
                ),
            },
            {
                id: 'status',
                label: 'STATUS',
                sortable: true,
                minWidth: 110,
                render: (row) => {
                    const statusMap: Record<string, { bg: string; color: string; border: string }> = {
                        Draft: { bg: '#f1f5f9', color: '#475569', border: '#cbd5e1' },
                        Sent: { bg: '#eff6ff', color: '#1d4ed8', border: '#bfdbfe' },
                        Accepted: { bg: '#ecfdf5', color: '#047857', border: '#a7f3d0' },
                        Rejected: { bg: '#fef2f2', color: '#b91c1c', border: '#fecaca' },
                    };
                    const currentStatus = String(row.quoteStage || row.status || 'Draft');
                    const st = statusMap[currentStatus] || statusMap.Draft;

                    return (
                        <Chip
                            label={currentStatus}
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
        ],
        []
    );

    const handleSort = (field: string) => {
        const isAsc = sortField === field && sortOrder === 'asc';
        setSortOrder(isAsc ? 'desc' : 'asc');
        setSortField(field as QuotationSortField);
    };

    const relatedModules = useMemo(() => {
        void quotations;
        if (!selectedDrawerQuotation) return [];
        return getRelatedModulesForEntity('quotation', selectedDrawerQuotation, setActiveRelatedModule);
    }, [selectedDrawerQuotation, quotations]);

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
            searchConfig={{
                searchQuery,
                onSearchChange: (q) => {
                    setSearchQuery(q);
                    setPage(0);
                },
                searchPlaceholder: 'Search by quote code, customer, subject...',
                // Strictly omit onNewClick so no standalone "New Quotation" button appears
                onRefresh: () => {
                    loadQuotations();
                    setToast({ open: true, message: 'Quotations refreshed.', severity: 'info' });
                },
                refreshTooltip: 'Refresh Quotations',
                selectedCount: selectedIds.length,
                onBulkDelete: handleBulkDelete,
            }}
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
            onView={(quote) => setSelectedDrawerQuotation(quote)}
            onEdit={(quote) => router.push(ROUTES.QUOTATION_EDIT(quote.id))}
            onDelete={(quote) => handleDelete(quote.id)}
            onRowClick={(quote) => setSelectedDrawerQuotation(quote)}
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
