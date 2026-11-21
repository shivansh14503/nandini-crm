'use client';

import React, { useState, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import EventBusyOutlinedIcon from '@mui/icons-material/EventBusyOutlined';
import { localToday } from '@/utils/pastDates';
import { isFollowUpExpired } from '../forms/FollowUpDecision';
import { useLeadRatingConfig } from '@/utils/leadRating';
import GroupOutlinedIcon from '@mui/icons-material/GroupOutlined';
import LocalFireDepartmentOutlinedIcon from '@mui/icons-material/LocalFireDepartmentOutlined';
import PersonAddAltOutlinedIcon from '@mui/icons-material/PersonAddAltOutlined';
import TodayOutlinedIcon from '@mui/icons-material/TodayOutlined';
import AccountCircleOutlinedIcon from '@mui/icons-material/AccountCircleOutlined';
import PersonOutlinedIcon from '@mui/icons-material/PersonOutlined';
import AutorenewOutlinedIcon from '@mui/icons-material/AutorenewOutlined';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutlineOutlined';
import HighlightOffOutlinedIcon from '@mui/icons-material/HighlightOffOutlined';
import { StatusSummaryCards, StatusSummaryCardsSkeleton, type StatusSummaryItem } from '../common/StatusSummaryCards';
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
import type { Lead } from '@/types/lead.types';
import { useLeads, useBulkDeleteLeads, useDropdownOptionLabel } from '@/hooks/queries';
import { useShowRecordNumber } from '@/hooks/queries/useDocumentSeries';
import { getLeadStatusBucket, type LeadFilterTab, type LeadStatusBucket } from './master';
import { LeadDetailDrawer } from './LeadDetailDrawer';
import { useSearchScope, useSearchScopedRows } from '../search/SearchScope';
import { useModuleScorecard } from '../common/scorecard/useModuleScorecard';
import { useLeadColumns } from './leadColumns';

/** Stable empty list while the first page loads (keeps memoized filters from recomputing). */
const NO_RECORDS: Lead[] = [];
export function LeadsMasterView() {
    const router = useRouter();
    const { user } = useAuth();
    const currentUsername = user?.username || '';
    const leadSourceLabel = useDropdownOptionLabel('shared_lead_source');

    // On the global search results page the table shows the matched records (any owner) instead of this list.
    const embeddedInSearch = Boolean(useSearchScope());
    const { data: leadsLoaded = NO_RECORDS, refetch, isPending: leadsPending } = useLeads(undefined, { enabled: !embeddedInSearch });
    // A disabled query stays "pending" forever, so only count it when this screen actually loads its own list.
    const leadsLoading = !embeddedInSearch && leadsPending;
    const leads = useSearchScopedRows(leadsLoaded);
    const bulkDeleteMutation = useBulkDeleteLeads();
    const [activeTab, setActiveTab] = useState<LeadFilterTab>('all');
    const [statusBucket, setStatusBucket] = useState<LeadStatusBucket>('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [page, setPage] = useState(0);
    const [rowsPerPage, setRowsPerPage] = useState(10);
    // Newest leads first by default.
    const [sortField, setSortField] = useState<string>('createdAt');
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
    const tableFilter = useTableFilter<Lead>({
        module: 'leads',
        rows: leads,
        onSortChange: (s) => {
            setSortField(s.field);
            setSortOrder(s.order);
        },
        onChange: () => setPage(0),
    });
    /** Leads left by the Filter dialog: the tabs, search and counts work on these. */
    const baseLeads = tableFilter.filteredRows;
    // Tracked by id so the drawer always shows the cached copy and closes if the lead is deleted.
    const [drawerLeadId, setDrawerLeadId] = useState<string | null>(null);
    const selectedDrawerLead = useMemo(
        () => (drawerLeadId ? leads.find((l) => l.id === drawerLeadId) ?? null : null),
        [leads, drawerLeadId]
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
    useSaveFlash(ROUTES.LEADS, (flash) => {
        setToast({ open: true, message: flash.message, severity: flash.severity ?? 'success' });
        if (flash.recordId) setDrawerLeadId(flash.recordId);
    });

    // Today on this device's clock (IST for the team), not UTC: UTC's date lags until 05:30 IST.
    const todayStr = useMemo(() => localToday(), []);
    // Overdue: an open lead whose next follow-up has passed (closed leads have none to miss).
    const { closingStatuses } = useLeadRatingConfig();
    const isOverdue = useCallback(
        (l: Lead) => !closingStatuses.has(l.status) && Boolean(l.nextFollowupDate) && isFollowUpExpired({ date: l.nextFollowupDate, time: l.nextFollowupTime ?? '' }),
        [closingStatuses],
    );

    const [importOpen, setImportOpen] = useState(false);

    // ── Quick View Pills ──────────────────────────────────────────────────────
    // Status (All / New / ...) lives on the summary cards; the pills are non-status views and toggle off on re-click.
    const filterItems: DataTableFilterItem<LeadFilterTab>[] = useMemo(() => {
        return [
            {
                id: 'hot',
                label: 'Hot Leads',
                icon: <LocalFireDepartmentOutlinedIcon sx={{ fontSize: 16 }} />,
                count: baseLeads.filter((l) => l.rating === 'Hot').length,
                activeColor: 'var(--mui-palette-error-main)',
                activeBgColor: 'var(--mui-palette-error-soft)',
                activeBadgeBgColor: 'var(--crm-red-100)',
            },
            {
                id: 'followup_today',
                label: 'Followup Today',
                icon: <TodayOutlinedIcon sx={{ fontSize: 16 }} />,
                count: baseLeads.filter((l) => l.nextFollowupDate === todayStr).length,
                activeColor: 'var(--mui-palette-warning-main)',
            },
            {
                id: 'overdue',
                label: 'Overdue',
                icon: <EventBusyOutlinedIcon sx={{ fontSize: 16 }} />,
                count: baseLeads.filter(isOverdue).length,
                activeColor: 'var(--mui-palette-error-main)',
                activeBgColor: 'var(--mui-palette-error-soft)',
                activeBadgeBgColor: 'var(--crm-red-100)',
            },
            {
                id: 'my_leads',
                label: 'My Leads',
                icon: <AccountCircleOutlinedIcon sx={{ fontSize: 16 }} />,
                count: currentUsername ? baseLeads.filter((l) => (l.assignedTo || '').includes(currentUsername)).length : 0,
            },
        ];
    }, [baseLeads, todayStr, currentUsername, isOverdue]);

    // ── Filter Logic ──────────────────────────────────────────────────────────
    /** Leads in the active pill view: the status cards count these, so "My Leads" shows my pipeline. */
    const tabLeads = useMemo(() => {
        return baseLeads.filter((lead) => {
            if (activeTab === 'hot' && lead.rating !== 'Hot') return false;
            if (activeTab === 'followup_today' && lead.nextFollowupDate !== todayStr) return false;
            if (activeTab === 'overdue' && !isOverdue(lead)) return false;
            if (activeTab === 'my_leads' && (!currentUsername || !(lead.assignedTo || '').includes(currentUsername))) return false;
            return true;
        });
    }, [baseLeads, activeTab, todayStr, currentUsername, isOverdue]);

    // ── Scorecard ─────────────────────────────────────────────────────────────
    // An admin-configured scorecard (pencil on "All Leads") replaces the built-in status buckets below.
    const goToFirstPage = useCallback(() => setPage(0), []);
    const showSavedToast = useCallback((message: string) => setToast({ open: true, message, severity: 'success' }), []);
    const leadsIcon = useMemo(() => <GroupOutlinedIcon />, []);
    const scorecard = useModuleScorecard<Lead>({
        module: 'leads',
        rows: tabLeads,
        allLabel: 'All Leads',
        allIcon: leadsIcon,
        onActiveChange: goToFirstPage,
        onSaved: showSavedToast,
    });

    // ── Status Summary Cards (built-in, until a scorecard is configured) ───────
    const statusSummaryItems: StatusSummaryItem<LeadStatusBucket>[] = useMemo(() => {
        const counts = { new: 0, in_process: 0, converted: 0, lost: 0 };
        for (const lead of tabLeads) counts[getLeadStatusBucket(lead.status)] += 1;
        return [
            { id: 'all', label: 'All Leads', count: tabLeads.length, tone: 'brand', icon: <GroupOutlinedIcon />, hint: 'Every status' },
            { id: 'new', label: 'New', count: counts.new, tone: 'brand', icon: <PersonAddAltOutlinedIcon />, hint: 'Not contacted yet' },
            {
                id: 'in_process',
                label: 'In Process',
                count: counts.in_process,
                tone: 'warning',
                icon: <AutorenewOutlinedIcon />,
                hint: 'Contacted to Negotiation',
            },
            { id: 'converted', label: 'Converted', count: counts.converted, tone: 'success', icon: <CheckCircleOutlineIcon />, hint: 'Won' },
            { id: 'lost', label: 'Lost', count: counts.lost, tone: 'error', icon: <HighlightOffOutlinedIcon />, hint: 'Unqualified / Lost' },
        ];
    }, [tabLeads]);

    const showNumber = useShowRecordNumber();
    const { configured: scorecardConfigured, matches: matchesScorecard } = scorecard;
    const filteredLeads = useMemo(() => {
        return tabLeads.filter((lead) => {
            if (scorecardConfigured) {
                if (!matchesScorecard(lead)) return false;
            } else if (statusBucket !== 'all' && getLeadStatusBucket(lead.status) !== statusBucket) return false;

            if (searchQuery.trim()) {
                const q = searchQuery.toLowerCase().trim();
                const inName = lead.name.toLowerCase().includes(q);
                const inCode = showNumber('lead') && lead.leadCode.toLowerCase().includes(q);
                const inOrg = (lead.organizationName || '').toLowerCase().includes(q);
                const inPhone = (lead.mobile || '').includes(q) || (lead.otherPhone || '').includes(q);
                const inEmail = (lead.emailAddress || []).some((e) => e.email.toLowerCase().includes(q));
                const inProduct = (lead.productCategory || []).some((p) => p.toLowerCase().includes(q));
                const inStatus = lead.status.toLowerCase().includes(q);
                const inSource = leadSourceLabel(lead.leadSource).toLowerCase().includes(q);
                const inAssigned = lead.assignedTo.toLowerCase().includes(q);

                return (
                    inName ||
                    inCode ||
                    inOrg ||
                    inPhone ||
                    inEmail ||
                    inProduct ||
                    inStatus ||
                    inSource ||
                    inAssigned
                );
            }

            return true;
        });
    }, [tabLeads, statusBucket, searchQuery, leadSourceLabel, showNumber, scorecardConfigured, matchesScorecard]);

    // ── Sort Logic ────────────────────────────────────────────────────────────
    const sortedLeads = useMemo(() => {
        return [...filteredLeads].sort((a, b) => {
            const valA = ((a as unknown as Record<string, unknown>)[sortField] || '').toString().toLowerCase();
            const valB = ((b as unknown as Record<string, unknown>)[sortField] || '').toString().toLowerCase();
            if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
            if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
            return 0;
        });
    }, [filteredLeads, sortField, sortOrder]);

    const paginatedLeads = useMemo(() => {
        const start = page * rowsPerPage;
        return sortedLeads.slice(start, start + rowsPerPage);
    }, [sortedLeads, page, rowsPerPage]);

    const handleToggleSelectAll = (checked?: boolean) => {
        if (checked) {
            setSelectedIds(paginatedLeads.map((l) => l.id));
        } else {
            setSelectedIds([]);
        }
    };

    const handleToggleSelectRow = (id: string) => {
        setSelectedIds((prev) => (prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]));
    };

    const handleSort = (field: string) => {
        if (sortField === field) {
            setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
        } else {
            setSortField(field);
            setSortOrder('asc');
        }
    };

    const handleBulkDelete = async () => {
        const count = selectedIds.length;
        if (count === 0) return;
        if (!confirm(`Are you sure you want to delete ${count} selected lead(s)?`)) return;

        try {
            await bulkDeleteMutation.mutateAsync(selectedIds);
            setSelectedIds([]);
            setToast({
                open: true,
                message: `${count} lead(s) deleted successfully.`,
                severity: 'success',
            });
        } catch {
            setToast({ open: true, message: 'Failed to delete leads.', severity: 'error' });
        }
    };

    // ── Declarative Column Definitions ────────────────────────────────────────
    const openDrawerRecord = useCallback((record: Lead) => setDrawerLeadId(record.id), []);
    const columns = useLeadColumns(openDrawerRecord);

    // Row clicks only open the drawer; its eye button leads on to the detail page with the related modules.
    const closeDrawer = useCallback(() => setDrawerLeadId(null), []);

    return (
        <CommonMasterView<Lead, LeadFilterTab>
            breadcrumbItems={[
                { label: 'Sales' },
                { label: 'Leads' },
            ]}
            loading={leadsLoading}
            summary={
                leadsLoading || scorecard.loading ? (
                    <StatusSummaryCardsSkeleton count={scorecard.configured ? scorecard.items.length : statusSummaryItems.length} />
                ) : scorecard.configured ? (
                    <StatusSummaryCards<string>
                        items={scorecard.items}
                        activeId={scorecard.activeId}
                        onChange={scorecard.setActiveId}
                        onEdit={scorecard.onEdit}
                    />
                ) : (
                    <StatusSummaryCards<LeadStatusBucket>
                        items={statusSummaryItems}
                        activeId={statusBucket}
                        onChange={(bucket) => {
                            setStatusBucket(bucket);
                            setPage(0);
                        }}
                        onEdit={scorecard.onEdit}
                    />
                )
            }
            filterConfig={{
                filters: filterItems,
                activeFilter: activeTab,
                onFilterChange: (tab) => {
                    setActiveTab((prev) => (prev === tab ? 'all' : tab));
                    setPage(0);
                },
            }}
            tableId="leads"
            tableFilter={tableFilter}
            headerActions={() => (
                <MasterHeaderActions
                    onRefresh={async () => {
                        const { isError } = await refetch();
                        setToast(
                            isError
                                ? { open: true, message: 'Failed to refresh leads.', severity: 'error' }
                                : { open: true, message: 'Leads refreshed.', severity: 'info' }
                        );
                    }}
                    onNewClick={() => router.push(ROUTES.LEAD_NEW)}
                    newButtonLabel="New Lead"
                    onImportClick={() => setImportOpen(true)}
                />
            )}
            searchConfig={buildExtendedSearchConfig({
                searchQuery,
                onSearchChange: (q) => {
                    setSearchQuery(q);
                    setPage(0);
                },
                searchPlaceholder: 'Search by name, company, phone, product, status...',
                pageIds: paginatedLeads.map((r) => r.id),
                allIds: sortedLeads.map((r) => r.id),
                selectedIds,
                onSelectedIdsChange: setSelectedIds,
                page,
                rowsPerPage,
                totalRecords: sortedLeads.length,
                onPageChange: setPage,
                onBulkDelete: handleBulkDelete,
            })}
            columns={columns}
            data={paginatedLeads}
            keyExtractor={(l) => l.id}
            selectedIds={selectedIds}
            onToggleSelectRow={handleToggleSelectRow}
            onToggleSelectAll={handleToggleSelectAll}
            sortField={sortField}
            sortOrder={sortOrder}
            onSort={handleSort}
            onView={(l) => setDrawerLeadId(l.id)}
            getEditHref={(l) => ROUTES.LEAD_EDIT(l.id)}
            getRowHref={(lead) => ROUTES.LEAD_DETAIL(lead.id)}
            onRowClick={(lead) => setDrawerLeadId(lead.id)}
            activeRowId={selectedDrawerLead?.id}
            viewTooltip="View Lead Details"
            editTooltip="Edit Lead"
            emptyTitle="No leads in pipeline"
            emptyDescription="Record new prospective clients, followups, and product interests to begin converting sales."
            emptyActionLabel="Create Lead"
            onEmptyAction={() => router.push(ROUTES.LEAD_NEW)}
            emptyIcon={<PersonOutlinedIcon sx={{ fontSize: 48, color: 'var(--crm-slate-300)' }} />}
            minHeight={300}
            pagination={{
                page,
                rowsPerPage,
                totalCount: sortedLeads.length,
                onPageChange: (newPage) => setPage(newPage),
                onRowsPerPageChange: (newRows) => {
                    setRowsPerPage(newRows);
                    setPage(0);
                },
            }}
            drawer={
                <LeadDetailDrawer
                    lead={selectedDrawerLead}
                    open={Boolean(selectedDrawerLead)}
                    onClose={closeDrawer}
                    onEdit={(id) => router.push(ROUTES.LEAD_EDIT(id))}
                    onShowToast={(message, severity = 'success') => {
                        setToast({ open: true, message, severity });
                    }}
                />
            }
            isDrawerOpen={Boolean(selectedDrawerLead)}
            toast={
                <AppToast
                    open={toast.open}
                    message={toast.message}
                    severity={toast.severity}
                    onClose={() => setToast((prev) => ({ ...prev, open: false }))}
                />
            }
        >
            {scorecard.dialog}
            <DataImportModal
                open={importOpen}
                entity="leads"
                onClose={() => setImportOpen(false)}
                onImported={(count) => {
                    setToast({ open: true, message: `Successfully imported ${count} lead${count === 1 ? '' : 's'}!`, severity: 'success' });
                }}
            />
        </CommonMasterView>
    );
}
