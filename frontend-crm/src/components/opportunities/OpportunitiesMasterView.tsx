'use client';

import React, { useState, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Box, Chip, Typography } from '@mui/material';
import TrendingUpOutlinedIcon from '@mui/icons-material/TrendingUpOutlined';
import MonetizationOnOutlinedIcon from '@mui/icons-material/MonetizationOnOutlined';
import CheckCircleOutlinedIcon from '@mui/icons-material/CheckCircleOutlined';
import ScheduleIcon from '@mui/icons-material/Schedule';
import AccountCircleOutlinedIcon from '@mui/icons-material/AccountCircleOutlined';
import WorkspacePremiumOutlinedIcon from '@mui/icons-material/WorkspacePremiumOutlined';
import ApartmentIcon from '@mui/icons-material/Apartment';
import CalendarMonthOutlinedIcon from '@mui/icons-material/CalendarMonthOutlined';
import { RecordLink } from '../common/RecordLink';
import { CommonMasterView } from '../common/CommonMasterView';
import { useTableFilter } from '../common/TableFilter';
import { MasterHeaderActions } from '../common/MasterHeaderActions';
import { buildExtendedSearchConfig } from '../common/buildExtendedSearchConfig';
import { AppToast } from '../common/AppToast';
import { DataImportModal } from '../common/import';
import { RelatedModulesSidebar, RelatedRecordsTableView } from '../common/Drawer';
import { RelatedSecondaryDrawer, type SecondaryDrawerEntity } from '../common/RelatedSecondaryDrawer';
import { documentNumberColumn, type DataTableColumn, type DataTableFilterItem } from '../common/DataTable';
import { ROUTES } from '@/config/constants';
import { useAuth } from '@/context/AuthContext';
import { useRelatedModulesForEntity } from '@/config/relatedModules.config';
import type { Opportunity } from '@/types/opportunity.types';
import { useOpportunities, useBulkDeleteOpportunities, useQuotations, useDropdownOptionLabel } from '@/hooks/queries';
import type { Quotation } from '@/types/quotation.types';
import { formatDateTime } from '@/utils/date';
import type { OpportunityFilterTab, OpportunitySortField } from './master';
import { OpportunityDetailDrawer } from './OpportunityDetailDrawer';

const formatCurrency = (val: number) =>
    new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR',
        maximumFractionDigits: 0,
    }).format(val);

const plainCellSx = { fontSize: '0.78rem', color: '#334155' } as const;

/** Yes / No cell for derived flags (Quote Created, Quote Sent). */
function YesNo({ value }: { value: boolean }) {
    return (
        <Typography sx={{ fontSize: '0.76rem', fontWeight: 600, color: value ? '#047857' : '#94a3b8' }}>
            {value ? 'Yes' : 'No'}
        </Typography>
    );
}

const NO_QUOTES: Quotation[] = [];

/** Stable empty list while the first page loads (keeps memoized filters from recomputing). */
const NO_RECORDS: Opportunity[] = [];
export function OpportunitiesMasterView() {
    const router = useRouter();
    const { user } = useAuth();
    const currentUsername = user?.username || '';
    const leadSourceLabel = useDropdownOptionLabel('shared_lead_source');

    const { data: allOpportunities = NO_RECORDS, refetch } = useOpportunities();
    const bulkDeleteMutation = useBulkDeleteOpportunities();
    const [activeTab, setActiveTab] = useState<OpportunityFilterTab>('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [page, setPage] = useState(0);
    const [rowsPerPage, setRowsPerPage] = useState(10);
    const [sortField, setSortField] = useState<OpportunitySortField>('createdAt');
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
    const tableFilter = useTableFilter<Opportunity>({
        module: 'opportunities',
        rows: allOpportunities,
        onSortChange: (s) => {
            setSortField(s.field as OpportunitySortField);
            setSortOrder(s.order);
        },
        onChange: () => setPage(0),
    });
    /** Records left by the Filter dialog: tabs, counts, search and bulk actions work on these. */
    const opportunities = tableFilter.filteredRows;
    // Tracked by id so the drawer always shows the cached copy and closes if the deal is deleted.
    const [drawerOppId, setDrawerOppId] = useState<string | null>(null);
    const selectedDrawerOpp = useMemo(
        () => (drawerOppId ? opportunities.find((o) => o.id === drawerOppId) ?? null : null),
        [opportunities, drawerOppId]
    );
    const [activeRelatedModule, setActiveRelatedModule] = useState<string | null>(null);
    const [secondaryDrawerEntity, setSecondaryDrawerEntity] = useState<SecondaryDrawerEntity | null>(null);
    const [isLeftSidebarCollapsed, setIsLeftSidebarCollapsed] = useState<boolean>(false);
    const [importOpen, setImportOpen] = useState(false);
    const [toast, setToast] = useState<{
        open: boolean;
        message: string;
        severity: 'success' | 'error' | 'info' | 'warning';
    }>({
        open: false,
        message: '',
        severity: 'success',
    });

    // Quotations per deal, for the Quote Created / Quote Sent columns.
    const { data: quotations = NO_QUOTES } = useQuotations();
    const quotesByOpp = useMemo(() => {
        const map = new Map<string, Quotation[]>();
        for (const q of quotations) {
            if (!q.opportunityId) continue;
            map.set(q.opportunityId, [...(map.get(q.opportunityId) ?? []), q]);
        }
        return map;
    }, [quotations]);

    const todayStr = useMemo(() => new Date().toISOString().split('T')[0], []);

    // ── Filter Tabs Configuration ─────────────────────────────────────────────
    const filterItems: DataTableFilterItem<OpportunityFilterTab>[] = useMemo(() => {
        return [
            {
                id: 'all',
                label: 'All Opportunities',
                icon: <TrendingUpOutlinedIcon sx={{ fontSize: 16 }} />,
                count: opportunities.length,
            },
            {
                id: 'open',
                label: 'Active Pipeline',
                icon: <MonetizationOnOutlinedIcon sx={{ fontSize: 16 }} />,
                count: opportunities.filter(
                    (o) => !['Closed Won', 'Closed Lost'].includes(o.salesStage)
                ).length,
                activeColor: '#2563eb',
            },
            {
                id: 'closing_soon',
                label: 'Followup Today',
                icon: <ScheduleIcon sx={{ fontSize: 16 }} />,
                count: opportunities.filter((o) =>
                    ['Proposal/Price Quote', 'Negotiation'].includes(o.salesStage)
                ).length,
                activeColor: '#d97706',
            },
            {
                id: 'won',
                label: 'Closed Won',
                icon: <CheckCircleOutlinedIcon sx={{ fontSize: 16 }} />,
                count: opportunities.filter((o) => o.salesStage === 'Closed Won').length,
                activeColor: '#16a34a',
            },
            {
                id: 'high_value',
                label: 'High Value (₹1L+)',
                icon: <WorkspacePremiumOutlinedIcon sx={{ fontSize: 16 }} />,
                count: opportunities.filter((o) => (o.grandTotal || 0) >= 100000).length,
                activeColor: '#7c3aed',
            },
            {
                id: 'my_deals',
                label: 'My Deals',
                icon: <AccountCircleOutlinedIcon sx={{ fontSize: 16 }} />,
                count: currentUsername ? opportunities.filter((o) => (o.assignedTo || '').includes(currentUsername)).length : 0,
            },
        ];
    }, [opportunities, currentUsername]);

    // ── Filter Logic ──────────────────────────────────────────────────────────
    const filteredOpportunities = useMemo(() => {
        return opportunities.filter((opp) => {
            if (activeTab === 'open' && ['Closed Won', 'Closed Lost'].includes(opp.salesStage)) {
                return false;
            }
            if (
                activeTab === 'closing_soon' &&
                !['Proposal/Price Quote', 'Negotiation'].includes(opp.salesStage)
            ) {
                return false;
            }
            if (activeTab === 'won' && opp.salesStage !== 'Closed Won') {
                return false;
            }
            if (activeTab === 'high_value' && (opp.grandTotal || 0) < 100000) {
                return false;
            }
            if (activeTab === 'my_deals' && (!currentUsername || !(opp.assignedTo || '').includes(currentUsername))) {
                return false;
            }

            if (searchQuery.trim()) {
                const q = searchQuery.toLowerCase().trim();
                const inOrg = opp.organizationName.toLowerCase().includes(q);
                const inCode = opp.opportunityCode.toLowerCase().includes(q);
                const inContact = opp.contactName.toLowerCase().includes(q);
                const inPhone = opp.contactNumber.includes(q);
                const inEmail = (opp.emailAddress || '').toLowerCase().includes(q);
                const inStage = opp.salesStage.toLowerCase().includes(q);
                const inType = opp.type.toLowerCase().includes(q);
                const inSource = leadSourceLabel(opp.leadSource).toLowerCase().includes(q);
                const inAssigned = opp.assignedTo.toLowerCase().includes(q);
                const inProduct = (opp.productCategory || []).some((p) =>
                    p.toLowerCase().includes(q)
                );

                return (
                    inOrg ||
                    inCode ||
                    inContact ||
                    inPhone ||
                    inEmail ||
                    inStage ||
                    inType ||
                    inSource ||
                    inAssigned ||
                    inProduct
                );
            }

            return true;
        });
    }, [opportunities, activeTab, searchQuery, currentUsername, leadSourceLabel]);

    // ── Sort Logic ────────────────────────────────────────────────────────────
    const sortedOpportunities = useMemo(() => {
        return [...filteredOpportunities].sort((a, b) => {
            if (sortField === 'grandTotal' || sortField === 'subtotal') {
                const valA = Number(a[sortField]) || 0;
                const valB = Number(b[sortField]) || 0;
                return sortOrder === 'asc' ? valA - valB : valB - valA;
            }

            const valA = ((a as unknown as Record<string, unknown>)[sortField] || '').toString().toLowerCase();
            const valB = ((b as unknown as Record<string, unknown>)[sortField] || '').toString().toLowerCase();
            if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
            if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
            return 0;
        });
    }, [filteredOpportunities, sortField, sortOrder]);

    const paginatedOpportunities = useMemo(() => {
        const start = page * rowsPerPage;
        return sortedOpportunities.slice(start, start + rowsPerPage);
    }, [sortedOpportunities, page, rowsPerPage]);

    const handleSort = (field: OpportunitySortField) => {
        if (sortField === field) {
            setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
        } else {
            setSortField(field);
            setSortOrder('asc');
        }
    };

    const handleSelectRow = (id: string) => {
        setSelectedIds((prev) =>
            prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
        );
    };

    const handleSelectAll = (checked?: boolean) => {
        if (checked) {
            setSelectedIds(paginatedOpportunities.map((o) => o.id));
        } else {
            setSelectedIds([]);
        }
    };

    const handleEdit = useCallback(
        (id: string) => {
            router.push(ROUTES.OPPORTUNITY_EDIT(id));
        },
        [router]
    );

    const handleBulkDelete = async () => {
        const count = selectedIds.length;
        if (count === 0) return;
        if (
            confirm(
                `Are you sure you want to delete ${count} selected opportunities?`
            )
        ) {
            try {
                await bulkDeleteMutation.mutateAsync(selectedIds);
                if (drawerOppId && selectedIds.includes(drawerOppId)) {
                    closeThreePanelView();
                }
                setSelectedIds([]);
                setToast({
                    open: true,
                    message: `${count} opportunities deleted successfully.`,
                    severity: 'success',
                });
            } catch {
                setToast({
                    open: true,
                    message: 'Failed to bulk delete opportunities.',
                    severity: 'error',
                });
            }
        }
    };

    // ── Declarative Column Definitions ────────────────────────────────────────
    const columns: DataTableColumn<Opportunity>[] = useMemo(
        () => [
            {
                id: 'assignedTo',
                label: 'USER',
                sortable: true,
                minWidth: 120,
                render: (o) => <Typography sx={plainCellSx}>{o.assignedTo || '-'}</Typography>,
            },
            {
                // Derived: the deal has at least one quotation linked to it.
                id: 'quoteCreated',
                label: 'QUOTE CREATED',
                sortable: false,
                minWidth: 120,
                render: (o) => <YesNo value={(quotesByOpp.get(o.id)?.length ?? 0) > 0} />,
            },
            documentNumberColumn<Opportunity>({
                id: 'opportunityCode',
                label: 'OPP NUMBER',
                getNumber: (o) => o.opportunityCode,
                getHref: (o) => ROUTES.OPPORTUNITY_DETAIL(o.id),
                onOpen: (o) => setDrawerOppId(o.id),
            }),
            {
                id: 'opportunityName',
                label: 'NAME',
                sortable: true,
                minWidth: 180,
                render: (o) => (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <TrendingUpOutlinedIcon sx={{ fontSize: 16, color: '#2563eb', flexShrink: 0 }} />
                        <RecordLink
                            href={ROUTES.OPPORTUNITY_DETAIL(o.id)}
                            onOpen={() => setDrawerOppId(o.id)}
                            sx={{
                                fontWeight: 700,
                                color: '#1d4ed8',
                                fontSize: '0.82rem',
                                cursor: 'pointer',
                                '&:hover': { textDecoration: 'underline' },
                            }}
                        >
                            {o.opportunityName || o.organizationName || o.opportunityCode}
                        </RecordLink>
                    </Box>
                ),
            },
            {
                id: 'organizationName',
                label: 'ORGANIZATION NAME',
                sortable: true,
                minWidth: 180,
                render: (o) => (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.8 }}>
                        <ApartmentIcon sx={{ fontSize: 15, color: '#64748b', flexShrink: 0 }} />
                        <Typography sx={{ fontSize: '0.8rem', color: '#1e293b', fontWeight: 600 }}>
                            {o.organizationName || '-'}
                        </Typography>
                    </Box>
                ),
            },
            {
                id: 'productCategory',
                label: 'PRODUCT CATEGORY',
                sortable: false,
                minWidth: 170,
                render: (o) => (
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                        {o.productCategory && o.productCategory.length > 0 ? (
                            o.productCategory.map((cat, idx) => (
                                <Chip
                                    key={idx}
                                    label={cat}
                                    size="small"
                                    sx={{
                                        height: 20,
                                        fontSize: '0.66rem',
                                        fontWeight: 600,
                                        backgroundColor: '#eff6ff',
                                        color: '#1d4ed8',
                                        border: '1px solid #bfdbfe',
                                    }}
                                />
                            ))
                        ) : (
                            <Typography sx={{ fontSize: '0.78rem', color: '#94a3b8' }}>-</Typography>
                        )}
                    </Box>
                ),
            },
            {
                id: 'type',
                label: 'TYPE',
                sortable: true,
                minWidth: 130,
                render: (o) => <Typography sx={plainCellSx}>{o.type || '-'}</Typography>,
            },
            {
                id: 'nextFollowupDate',
                label: 'NEXT FOLLOWUP DATE',
                sortable: true,
                minWidth: 140,
                render: (o) => {
                    const isToday = o.nextFollowupDate === todayStr;

                    return (
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.8 }}>
                            <CalendarMonthOutlinedIcon
                                sx={{
                                    fontSize: 16,
                                    color: isToday ? '#d97706' : '#64748b',
                                }}
                            />
                            <Box>
                                <Typography
                                    sx={{
                                        fontSize: '0.78rem',
                                        fontWeight: isToday ? 700 : 500,
                                        color: isToday ? '#b45309' : '#334155',
                                    }}
                                >
                                    {o.nextFollowupDate || '-'}
                                    {isToday && (
                                        <Box
                                            component="span"
                                            sx={{
                                                ml: 0.6,
                                                px: 0.6,
                                                py: 0.1,
                                                borderRadius: '4px',
                                                fontSize: '0.62rem',
                                                fontWeight: 800,
                                                backgroundColor: '#fef3c7',
                                                color: '#b45309',
                                                border: '1px solid #fde68a',
                                            }}
                                        >
                                            TODAY
                                        </Box>
                                    )}
                                </Typography>
                                {o.followupType && (
                                    <Typography sx={{ fontSize: '0.7rem', color: '#64748b' }}>
                                        {o.followupType} {o.nextFollowupTime ? `• ${o.nextFollowupTime}` : ''}
                                    </Typography>
                                )}
                            </Box>
                        </Box>
                    );
                },
            },
            {
                id: 'salesStage',
                label: 'SALES STAGE',
                sortable: true,
                minWidth: 150,
                render: (o) => {
                    let bg = '#eff6ff';
                    let color = '#1d4ed8';
                    let border = '#bfdbfe';

                    if (o.salesStage === 'Closed Won') {
                        bg = '#ecfdf5';
                        color = '#047857';
                        border = '#a7f3d0';
                    } else if (o.salesStage === 'Closed Lost') {
                        bg = '#fef2f2';
                        color = '#b91c1c';
                        border = '#fecaca';
                    } else if (o.salesStage.includes('Proposal') || o.salesStage.includes('Negotiation')) {
                        bg = '#fffbeb';
                        color = '#b45309';
                        border = '#fde68a';
                    } else if (o.salesStage.includes('Value') || o.salesStage.includes('Needs')) {
                        bg = '#f5f3ff';
                        color = '#6d28d9';
                        border = '#ddd6fe';
                    }

                    return (
                        <Chip
                            label={o.salesStage}
                            size="small"
                            icon={
                                o.salesStage === 'Closed Won' ? (
                                    <CheckCircleOutlinedIcon
                                        sx={{ fontSize: '13px !important', color: '#047857 !important' }}
                                    />
                                ) : undefined
                            }
                            sx={{
                                height: 22,
                                fontSize: '0.72rem',
                                fontWeight: 600,
                                backgroundColor: bg,
                                color: color,
                                border: `1px solid ${border}`,
                            }}
                        />
                    );
                },
            },
            {
                // Line items after discount, before tax.
                id: 'subtotal',
                label: 'ACTUAL (BEFORE TAX)',
                sortable: true,
                minWidth: 150,
                render: (o) => (
                    <Typography sx={{ fontSize: '0.82rem', fontWeight: 700, color: '#0f172a' }}>
                        {formatCurrency(o.subtotal ?? (o.grandTotal || 0) - (o.totalTax || 0))}
                    </Typography>
                ),
            },
            {
                // No remarks log on deals: "Add Description" is the note updated on each follow-up (as on leads).
                id: 'addDescription',
                label: 'LATEST REMARKS',
                sortable: false,
                minWidth: 220,
                width: 280,
                render: (o) => <Typography sx={plainCellSx}>{o.addDescription || '-'}</Typography>,
            },
            {
                // Derived: a linked quotation has moved past Draft.
                id: 'quoteSent',
                label: 'QUOTE SENT',
                sortable: false,
                minWidth: 110,
                render: (o) => <YesNo value={(quotesByOpp.get(o.id) ?? []).some((q) => q.quoteStage && q.quoteStage !== 'Draft')} />,
            },
            {
                id: 'createdAt',
                label: 'DATE CREATED',
                sortable: true,
                minWidth: 170,
                render: (o) => <Typography sx={plainCellSx}>{formatDateTime(o.createdAt) || '-'}</Typography>,
            },
        ],
        [todayStr, quotesByOpp]
    );

    const relatedModules = useRelatedModulesForEntity('opportunity', selectedDrawerOpp, setActiveRelatedModule);

    // Falls back to the first module until the user explicitly picks one.
    const effectiveRelatedModule = activeRelatedModule ?? relatedModules[0]?.id ?? null;
    const activeModuleMeta = relatedModules.find((m) => m.id === effectiveRelatedModule);

    // Dismisses the three-panel view and returns to the clean master table.
    const closeThreePanelView = useCallback(() => {
        setSecondaryDrawerEntity(null);
        setDrawerOppId(null);
        setActiveRelatedModule(null);
    }, []);

    return (
        <CommonMasterView<Opportunity, OpportunityFilterTab>
            filterConfig={{
                filters: filterItems,
                activeFilter: activeTab,
                onFilterChange: (tab) => {
                    setActiveTab(tab);
                    setPage(0);
                },
            }}
            tableId="opportunities"
            tableFilter={tableFilter}
            headerActions={() => (
                <MasterHeaderActions
                    onRefresh={async () => {
                        const { isError } = await refetch();
                        setToast(
                            isError
                                ? { open: true, message: 'Failed to refresh opportunities.', severity: 'error' }
                                : { open: true, message: 'Opportunities refreshed.', severity: 'info' }
                        );
                    }}
                    onNewClick={() => router.push(ROUTES.OPPORTUNITY_NEW)}
                    newButtonLabel="New Opportunity"
                    onImportClick={() => setImportOpen(true)}
                />
            )}
            searchConfig={buildExtendedSearchConfig({
                searchQuery,
                onSearchChange: (q) => {
                    setSearchQuery(q);
                    setPage(0);
                },
                searchPlaceholder: 'Search by deal, company, contact, stage, amount...',
                pageIds: paginatedOpportunities.map((r) => r.id),
                allIds: sortedOpportunities.map((r) => r.id),
                selectedIds,
                onSelectedIdsChange: setSelectedIds,
                page,
                rowsPerPage,
                totalRecords: sortedOpportunities.length,
                onPageChange: setPage,
                onBulkDelete: handleBulkDelete,
            })}
            columns={columns}
            data={paginatedOpportunities}
            keyExtractor={(o) => o.id}
            selectedIds={selectedIds}
            onToggleSelectRow={handleSelectRow}
            onToggleSelectAll={handleSelectAll}
            sortField={sortField}
            sortOrder={sortOrder}
            onSort={(f) => handleSort(f as OpportunitySortField)}
            onView={(o) => setDrawerOppId(o.id)}
            getEditHref={(o) => ROUTES.OPPORTUNITY_EDIT(o.id)}
            onRowClick={(opp) => setDrawerOppId(opp.id)}
            activeRowId={selectedDrawerOpp?.id}
            viewTooltip="View Deal Details"
            editTooltip="Edit Opportunity"
            emptyTitle="No opportunities in pipeline"
            emptyDescription="Create your first deal opportunity and track it from qualification to closed won."
            emptyActionLabel="Create Opportunity"
            onEmptyAction={() => router.push(ROUTES.OPPORTUNITY_NEW)}
            emptyIcon={<TrendingUpOutlinedIcon sx={{ fontSize: 48, color: '#cbd5e1' }} />}
            minHeight={300}
            pagination={{
                page,
                rowsPerPage,
                totalCount: sortedOpportunities.length,
                onPageChange: setPage,
                onRowsPerPageChange: (r) => {
                    setRowsPerPage(r);
                    setPage(0);
                },
                hideWhenEmpty: true,
            }}
            relatedSidebar={
                <RelatedModulesSidebar
                    open={Boolean(selectedDrawerOpp)}
                    modules={relatedModules}
                    activeModuleId={effectiveRelatedModule ?? undefined}
                    onModuleSelect={(moduleId) => setActiveRelatedModule(moduleId)}
                    collapsed={isLeftSidebarCollapsed}
                    onToggleCollapse={setIsLeftSidebarCollapsed}
                />
            }
            relatedRecordsTable={
                <RelatedRecordsTableView
                    open={Boolean(selectedDrawerOpp && effectiveRelatedModule)}
                    moduleId={effectiveRelatedModule || ''}
                    moduleTitle={activeModuleMeta?.label || 'Related Records'}
                    parentRecordId={selectedDrawerOpp?.id}
                    parentEntityTitle={selectedDrawerOpp?.opportunityCode || selectedDrawerOpp?.organizationName || ''}
                    entityData={selectedDrawerOpp}
                    entityType="opportunity"
                    leftOffset={isLeftSidebarCollapsed ? 72 : 260}
                    rightOffset={580}
                    onClose={closeThreePanelView}
                    onRowClick={(row, modId) => setSecondaryDrawerEntity({ type: modId, data: row })}
                />
            }
            drawer={
                <OpportunityDetailDrawer
                    opportunity={selectedDrawerOpp}
                    open={Boolean(selectedDrawerOpp)}
                    onClose={closeThreePanelView}
                    onEdit={handleEdit}
                />
            }
            secondaryDrawer={
                secondaryDrawerEntity ? (
                    <RelatedSecondaryDrawer
                        entity={secondaryDrawerEntity}
                        moduleLabel={activeModuleMeta?.label}
                        parentTitle={selectedDrawerOpp?.opportunityCode || selectedDrawerOpp?.organizationName}
                        onClose={() => setSecondaryDrawerEntity(null)}
                    />
                ) : null
            }
            isDrawerOpen={Boolean(selectedDrawerOpp)}
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
                entity="opportunities"
                onClose={() => setImportOpen(false)}
                onImported={(count) => {
                    setToast({ open: true, message: `Successfully imported ${count} opportunit${count === 1 ? 'y' : 'ies'}!`, severity: 'success' });
                }}
            />
        </CommonMasterView>
    );
}
