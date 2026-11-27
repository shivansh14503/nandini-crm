'use client';

import { CLOSED_STAGES } from '@/utils/opportunityResponseRules';
import React, { Suspense, useState, useMemo, useCallback } from 'react';
import { useResetTab } from '@/hooks/useResetTab';
import { useRouter } from 'next/navigation';
import TrendingUpOutlinedIcon from '@mui/icons-material/TrendingUpOutlined';
import MonetizationOnOutlinedIcon from '@mui/icons-material/MonetizationOnOutlined';
import TodayOutlinedIcon from '@mui/icons-material/TodayOutlined';
import AccountCircleOutlinedIcon from '@mui/icons-material/AccountCircleOutlined';
import WorkspacePremiumOutlinedIcon from '@mui/icons-material/WorkspacePremiumOutlined';
import { localToday } from '@/utils/pastDates';
import { ModuleScorecardSummary, useModuleScorecard } from '../common/scorecard/useModuleScorecard';
import { CommonMasterView } from '../common/CommonMasterView';
import { useTableFilter } from '../common/TableFilter';
import { MasterHeaderActions } from '../common/MasterHeaderActions';
import { buildExtendedSearchConfig } from '../common/buildExtendedSearchConfig';
import { AppToast } from '../common/AppToast';
import { useSaveFlash } from '@/utils/saveFlash';
import { DataImportModal } from '../common/import';
import { type DataTableFilterItem } from '../common/DataTable';
import { ROUTES } from '@/config/constants';
import { useAuth } from '@/context/AuthContext';
import type { Opportunity } from '@/types/opportunity.types';
import { opportunityAmountBeforeTax } from './master/stageScorecard';
import { useOpportunities, useBulkDeleteOpportunities, useDropdownOptionLabel } from '@/hooks/queries';
import { useShowRecordNumber } from '@/hooks/queries/useDocumentSeries';
import type { OpportunityFilterTab, OpportunitySortField } from './master';
import { OpportunityDetailDrawer } from './OpportunityDetailDrawer';
import { useSearchScope, useSearchScopedRows } from '../search/SearchScope';
import { useOpportunityColumns } from './opportunityColumns';
import { ProductLinkFilter } from './master/ProductLinkFilter';

/** Stable empty list while the first page loads (keeps memoized filters from recomputing). */
const NO_RECORDS: Opportunity[] = [];
/** Still in the pipeline (not closed won / lost). */
/** Closed Won / Closed Lost are system Sales Stage options (they can't be removed), shared with the form. */
const isOpen = (o: Opportunity) => !CLOSED_STAGES.has(o.salesStage);
export function OpportunitiesMasterView() {
    const router = useRouter();
    const { user } = useAuth();
    const currentUsername = user?.username || '';
    const leadSourceLabel = useDropdownOptionLabel('shared_lead_source');

    // On the global search results page the table shows the matched records (any owner) instead of this list.
    const embeddedInSearch = Boolean(useSearchScope());
    const { data: allOpportunitiesLoaded = NO_RECORDS, refetch, isPending: listPending } = useOpportunities(undefined, { enabled: !embeddedInSearch });
    // A disabled query stays "pending" forever, so only count it when this screen loads its own list.
    const listLoading = !embeddedInSearch && listPending;
    const allOpportunities = useSearchScopedRows(allOpportunitiesLoaded);
    const bulkDeleteMutation = useBulkDeleteOpportunities();
    const [activeTab, setActiveTab] = useResetTab<OpportunityFilterTab>('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [page, setPage] = useState(0);
    const [rowsPerPage, setRowsPerPage] = useState(10);
    const [sortField, setSortField] = useState<OpportunitySortField>('createdAt');
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
    // Tracked by id so the drawer always shows the cached copy and closes if the deal is deleted.
    const [drawerOppId, setDrawerOppId] = useState<string | null>(null);
    // ── Declarative Column Definitions ────────────────────────────────────────
    const openDrawerRecord = useCallback((record: Opportunity) => setDrawerOppId(record.id), []);
    const columns = useOpportunityColumns(openDrawerRecord);
    const tableFilter = useTableFilter<Opportunity>({
        module: 'opportunities',
        rows: allOpportunities,
        columns,
        onSortChange: (s) => {
            setSortField(s.field as OpportunitySortField);
            setSortOrder(s.order);
        },
        onChange: () => setPage(0),
    });
    /** Records left by the Filter dialog: tabs, counts, search and bulk actions work on these. */
    const opportunities = tableFilter.filteredRows;
    const selectedDrawerOpp = useMemo(
        () => (drawerOppId ? opportunities.find((o) => o.id === drawerOppId) ?? null : null),
        [opportunities, drawerOppId]
    );
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

    // Back from the create / edit form: show its "saved" toast here and open the saved record in the drawer.
    useSaveFlash(ROUTES.OPPORTUNITIES, (flash) => {
        setToast({ open: true, message: flash.message, severity: flash.severity ?? 'success' });
        if (flash.recordId) setDrawerOppId(flash.recordId);
    });

    // Today on this device's clock (IST for the team), not UTC: UTC's date lags until 05:30 IST.
    const todayStr = useMemo(() => localToday(), []);

    // ── Quick View Pills ──────────────────────────────────────────────────────
    // The sales stage (All / Qualification / ...) lives on the stage cards; the pills are other views and toggle
    // off on re-click, as on Leads.
    const filterItems: DataTableFilterItem<OpportunityFilterTab>[] = useMemo(() => {
        return [
            {
                id: 'open',
                label: 'Active Pipeline',
                icon: <MonetizationOnOutlinedIcon sx={{ fontSize: 16 }} />,
                count: opportunities.filter(isOpen).length,
                activeColor: 'var(--mui-palette-primary-main)',
            },
            {
                id: 'followup_today',
                label: 'Followup Today',
                icon: <TodayOutlinedIcon sx={{ fontSize: 16 }} />,
                count: opportunities.filter((o) => o.nextFollowupDate === todayStr).length,
                activeColor: 'var(--mui-palette-warning-main)',
            },
            {
                id: 'high_value',
                label: 'High Value (₹1L+)',
                icon: <WorkspacePremiumOutlinedIcon sx={{ fontSize: 16 }} />,
                count: opportunities.filter((o) => (o.grandTotal || 0) >= 100000).length,
                activeColor: 'var(--crm-violet-600)',
            },
            {
                id: 'my_deals',
                label: 'My Deals',
                icon: <AccountCircleOutlinedIcon sx={{ fontSize: 16 }} />,
                count: currentUsername ? opportunities.filter((o) => (o.assignedTo || '').includes(currentUsername)).length : 0,
            },
        ];
    }, [opportunities, currentUsername, todayStr]);

    // ── Filter Logic ──────────────────────────────────────────────────────────
    /** Deals in the active pill view: the stage cards count these, so "My Deals" shows my pipeline. */
    const tabOpportunities = useMemo(() => {
        return opportunities.filter((opp) => {
            if (activeTab === 'open' && !isOpen(opp)) return false;
            if (activeTab === 'followup_today' && opp.nextFollowupDate !== todayStr) return false;
            if (activeTab === 'high_value' && (opp.grandTotal || 0) < 100000) return false;
            if (activeTab === 'my_deals' && (!currentUsername || !(opp.assignedTo || '').includes(currentUsername))) return false;
            return true;
        });
    }, [opportunities, activeTab, todayStr, currentUsername]);

    // ── Stage Cards ───────────────────────────────────────────────────────────
    // One card per sales stage with its count and value before tax, until an admin sets up other cards (or switches
    // them off) under Admin › List Scorecards.
    const goToFirstPage = useCallback(() => setPage(0), []);
    const scorecard = useModuleScorecard<Opportunity>({ module: 'opportunities', rows: tabOpportunities, onActiveChange: goToFirstPage });

    const showNumber = useShowRecordNumber();
    const { matches: matchesScorecard } = scorecard;
    const filteredOpportunities = useMemo(() => {
        return tabOpportunities.filter((opp) => {
            if (!matchesScorecard(opp)) return false;

            if (searchQuery.trim()) {
                const q = searchQuery.toLowerCase().trim();
                const inOrg = opp.organizationName.toLowerCase().includes(q);
                const inCode = showNumber('opportunity') && opp.opportunityCode.toLowerCase().includes(q);
                const inContact = opp.contact.toLowerCase().includes(q);
                const inPhone = (opp.contactNumber ?? '').includes(q);
                const inEmail = (opp.contactEmail || '').toLowerCase().includes(q);
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
    }, [tabOpportunities, matchesScorecard, searchQuery, leadSourceLabel, showNumber]);

    // ── Sort Logic ────────────────────────────────────────────────────────────
    const sortedOpportunities = useMemo(() => {
        return [...filteredOpportunities].sort((a, b) => {
            if (sortField === 'grandTotal' || sortField === 'subtotal') {
                // The `subtotal` column shows Actual (Before Tax).
                const amountOf = (o: Opportunity) => (sortField === 'subtotal' ? opportunityAmountBeforeTax(o) : Number(o.grandTotal) || 0);
                const valA = amountOf(a);
                const valB = amountOf(b);
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
                    closeDrawer();
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

    // Row clicks only open the drawer; its eye button leads on to the detail page with the related modules.
    const closeDrawer = useCallback(() => setDrawerOppId(null), []);

    return (
        <CommonMasterView<Opportunity, OpportunityFilterTab>
            importEntity="opportunities"
            loading={listLoading}
            summary={<ModuleScorecardSummary state={scorecard} loading={listLoading} />}
            filterConfig={{
                filters: filterItems,
                activeFilter: activeTab,
                onFilterChange: (tab) => {
                    setActiveTab((prev) => (prev === tab ? 'all' : tab));
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
            getRowHref={(opp) => ROUTES.OPPORTUNITY_DETAIL(opp.id)}
            onRowClick={(opp) => setDrawerOppId(opp.id)}
            activeRowId={selectedDrawerOpp?.id}
            viewTooltip="View Deal Details"
            editTooltip="Edit Opportunity"
            emptyTitle="No opportunities in pipeline"
            emptyDescription="Create your first deal opportunity and track it from qualification to closed won."
            emptyActionLabel="Create Opportunity"
            onEmptyAction={() => router.push(ROUTES.OPPORTUNITY_NEW)}
            emptyIcon={<TrendingUpOutlinedIcon sx={{ fontSize: 48, color: 'var(--crm-slate-300)' }} />}
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
            drawer={
                <OpportunityDetailDrawer
                    opportunity={selectedDrawerOpp}
                    open={Boolean(selectedDrawerOpp)}
                    onClose={closeDrawer}
                    onEdit={handleEdit}
                />
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
            {/* A product's usage counts link here (?product=…&outcome=…): open the list with that filter applied. */}
            {!embeddedInSearch && (
                <Suspense fallback={null}>
                    <ProductLinkFilter apply={tableFilter.apply} />
                </Suspense>
            )}
            <DataImportModal
                open={importOpen}
                entity="opportunities"
                onClose={() => setImportOpen(false)}
            />
        </CommonMasterView>
    );
}
