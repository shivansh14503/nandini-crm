'use client';

import React, { useState, useMemo, useCallback } from 'react';
import { useResetTab } from '@/hooks/useResetTab';
import { useRouter } from 'next/navigation';
import EventBusyOutlinedIcon from '@mui/icons-material/EventBusyOutlined';
import { localToday } from '@/utils/pastDates';
import { isFollowUpExpired } from '../forms/FollowUpDecision';
import { useLeadRatingConfig } from '@/utils/leadRating';
import LocalFireDepartmentOutlinedIcon from '@mui/icons-material/LocalFireDepartmentOutlined';
import TodayOutlinedIcon from '@mui/icons-material/TodayOutlined';
import AccountCircleOutlinedIcon from '@mui/icons-material/AccountCircleOutlined';
import PersonOutlinedIcon from '@mui/icons-material/PersonOutlined';
import { StatusSummaryCards, type StatusSummaryItem } from '../common/StatusSummaryCards';
import { CommonMasterView } from '../common/CommonMasterView';
import { useTableFilter } from '../common/TableFilter';
import { MasterHeaderActions, type MasterExportConfig } from '../common/MasterHeaderActions';
import { buildExtendedSearchConfig } from '../common/buildExtendedSearchConfig';
import { AppToast } from '../common/AppToast';
import { useSaveFlash } from '@/utils/saveFlash';
import { DataImportModal } from '../common/import';
import { type DataTableFilterItem } from '../common/DataTable';
import { ROUTES } from '@/config/constants';
import { useAuth } from '@/context/AuthContext';
import type { Lead } from '@/types/lead.types';
import { useLeads, useBulkDeleteLeads, useDropdownOptionLabel, useMasterData } from '@/hooks/queries';
import type { CsvColumn } from '@/utils/csvExport';
import { exportDate, exportDateTime, exportList, exportUser, selectedOrAll } from '@/utils/exportCells';
import { useShowRecordNumber } from '@/hooks/queries/useDocumentSeries';
import { getLeadStatusBucket, type LeadFilterTab, type LeadStatusBucket } from './master';
import { leadStatusSummaryItems } from './master/leadStatusCards';
import { LeadDetailDrawer } from './LeadDetailDrawer';
import { useSearchScope, useSearchScopedRows } from '../search/SearchScope';
import { ModuleScorecardSummary, useModuleScorecard } from '../common/scorecard/useModuleScorecard';
import { useLeadColumns } from './leadColumns';

/** Stable empty list while the first page loads (keeps memoized filters from recomputing). */
const NO_RECORDS: Lead[] = [];

/** The lead's email addresses for the CSV, primary first, joined with ', '. */
function leadEmails(l: Lead): string {
    const emails = [...(l.emailAddress ?? [])].sort((a, b) => Number(Boolean(b.isPrimary)) - Number(Boolean(a.isPrimary)));
    return exportList(emails.map((e) => e.email), ', ');
}

/** The lead's assignee(s) by display name; several (comma-separated) are joined with ', '. */
function leadAssignees(l: Lead): string {
    return exportList((l.assignedTo || '').split(',').map((u) => exportUser(u.trim())), ', ');
}

export function LeadsMasterView() {
    const router = useRouter();
    const { user } = useAuth();
    const currentUsername = user?.username || '';
    const leadSourceLabel = useDropdownOptionLabel('shared_lead_source');
    const customerResponseLabel = useDropdownOptionLabel('lead_customer_response');
    // Re-renders once the user directory loads, so the export's User column shows full names.
    useMasterData();

    // On the global search results page the table shows the matched records (any owner) instead of this list.
    const embeddedInSearch = Boolean(useSearchScope());
    const { data: leadsLoaded = NO_RECORDS, refetch, isPending: leadsPending } = useLeads(undefined, { enabled: !embeddedInSearch });
    // A disabled query stays "pending" forever, so only count it when this screen actually loads its own list.
    const leadsLoading = !embeddedInSearch && leadsPending;
    const leads = useSearchScopedRows(leadsLoaded);
    const bulkDeleteMutation = useBulkDeleteLeads();
    const [activeTab, setActiveTab] = useResetTab<LeadFilterTab>('all');
    const [statusBucket, setStatusBucket] = useState<LeadStatusBucket>('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [page, setPage] = useState(0);
    const [rowsPerPage, setRowsPerPage] = useState(10);
    // Newest leads first by default.
    const [sortField, setSortField] = useState<string>('createdAt');
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
    // Tracked by id so the drawer always shows the cached copy and closes if the lead is deleted.
    const [drawerLeadId, setDrawerLeadId] = useState<string | null>(null);
    // ── Declarative Column Definitions ────────────────────────────────────────
    const openDrawerRecord = useCallback((record: Lead) => setDrawerLeadId(record.id), []);
    const columns = useLeadColumns(openDrawerRecord);
    const tableFilter = useTableFilter<Lead>({
        module: 'leads',
        rows: leads,
        columns,
        onSortChange: (s) => {
            setSortField(s.field);
            setSortOrder(s.order);
        },
        onChange: () => setPage(0),
    });
    /** Leads left by the Filter dialog: the tabs, search and counts work on these. */
    const baseLeads = tableFilter.filteredRows;
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
    // A scorecard set up under Admin › List Scorecards replaces the built-in status buckets below (or, switched
    // off, hides both).
    const goToFirstPage = useCallback(() => setPage(0), []);
    const scorecard = useModuleScorecard<Lead>({ module: 'leads', rows: tabLeads, onActiveChange: goToFirstPage });

    // ── Status Summary Cards (built-in, until a scorecard is configured) ───────
    const statusSummaryItems: StatusSummaryItem<LeadStatusBucket>[] = useMemo(() => leadStatusSummaryItems(tabLeads), [tabLeads]);

    const showNumber = useShowRecordNumber();
    const { configured: scorecardConfigured, hidden: scorecardHidden, matches: matchesScorecard } = scorecard;
    const filteredLeads = useMemo(() => {
        return tabLeads.filter((lead) => {
            if (scorecardConfigured) {
                if (!matchesScorecard(lead)) return false;
            } else if (!scorecardHidden && statusBucket !== 'all' && getLeadStatusBucket(lead.status) !== statusBucket) return false;

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
    }, [tabLeads, statusBucket, searchQuery, leadSourceLabel, showNumber, scorecardConfigured, scorecardHidden, matchesScorecard]);

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

    // ── CSV Export ────────────────────────────────────────────────────────────
    // The table's columns first (same headers, display text), then the other scalar fields of the lead.
    const csvColumns: CsvColumn<Lead>[] = useMemo(
        () => [
            ...(showNumber('lead') ? [{ header: 'Lead Number', value: (l: Lead) => l.leadCode }] : []),
            { header: 'Name', value: (l) => l.name },
            { header: 'Rating', value: (l) => l.rating },
            { header: 'Lead Source', value: (l) => leadSourceLabel(l.leadSource) },
            { header: 'Product Category', value: (l) => exportList(l.productCategory, ', ') },
            { header: 'Organization Name', value: (l) => l.organizationName },
            { header: 'Status', value: (l) => l.status },
            { header: 'Email', value: leadEmails },
            { header: 'Mobile', value: (l) => l.mobile },
            { header: 'Latest Remarks', value: (l) => l.remarks },
            { header: 'Next Followup Date', value: (l) => exportDate(l.nextFollowupDate) },
            { header: 'User', value: leadAssignees },
            // Export cells keep one fixed format whatever the company display formats.
            { header: 'Date Created', value: (l) => exportDateTime(l.createdAt) },
            { header: 'Next Followup Time', value: (l) => l.nextFollowupTime },
            { header: 'Followup Type', value: (l) => l.followupType },
            { header: 'Customer Response', value: (l) => customerResponseLabel(l.customerResponse) },
            { header: 'Lead Type', value: (l) => l.leadType },
            { header: 'Designation', value: (l) => l.designation },
            { header: 'Department', value: (l) => l.department },
            { header: 'Other Phone', value: (l) => l.otherPhone },
            { header: 'Mailing Name', value: (l) => l.mailingName },
            { header: 'Trade Name', value: (l) => l.tradeName },
            { header: 'Registration Type', value: (l) => l.registrationType },
            { header: 'GST Number', value: (l) => l.gstNumber },
            { header: 'Turnover', value: (l) => l.turnover },
            { header: 'No of Employee', value: (l) => l.noOfEmployee },
            { header: 'Referred By', value: (l) => l.referredBy },
            { header: 'Partner Company', value: (l) => l.partnerCompany },
            { header: 'City', value: (l) => l.primaryCity },
            { header: 'State', value: (l) => l.primaryState },
            { header: 'Postal Code', value: (l) => l.primaryPostalCode },
            { header: 'Country', value: (l) => l.primaryCountry },
            { header: 'Created By', value: (l) => exportUser(l.createdBy) },
        ],
        [showNumber, leadSourceLabel, customerResponseLabel]
    );
    const exportConfig: MasterExportConfig<Lead> = {
        fileName: 'leads',
        noun: { singular: 'lead', plural: 'leads' },
        // Selected rows if any, else every lead matching the current view (all pages), in the table's order.
        rows: () => selectedOrAll(sortedLeads, selectedIds, leads),
        columns: csvColumns,
        onNotify: (message, severity) => setToast({ open: true, message, severity }),
    };

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

    // Row clicks only open the drawer; its eye button leads on to the detail page with the related modules.
    const closeDrawer = useCallback(() => setDrawerLeadId(null), []);

    return (
        <CommonMasterView<Lead, LeadFilterTab>
            importEntity="leads"
            breadcrumbItems={[
                { label: 'Sales' },
                { label: 'Leads' },
            ]}
            loading={leadsLoading}
            summary={
                <ModuleScorecardSummary
                    state={scorecard}
                    loading={leadsLoading}
                    fallbackCount={statusSummaryItems.length}
                    fallback={
                        <StatusSummaryCards<LeadStatusBucket>
                            items={statusSummaryItems}
                            activeId={statusBucket}
                            onChange={(bucket) => {
                                setStatusBucket(bucket);
                                setPage(0);
                            }}
                            settingsHref={scorecard.settingsHref}
                        />
                    }
                />
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
                    exportConfig={exportConfig}
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
            <DataImportModal
                open={importOpen}
                entity="leads"
                onClose={() => setImportOpen(false)}
            />
        </CommonMasterView>
    );
}
