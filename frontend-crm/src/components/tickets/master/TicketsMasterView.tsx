'use client';

import React, { useState, useMemo, useCallback } from 'react';
import { useResetTab } from '@/hooks/useResetTab';
import { useRouter } from 'next/navigation';
import ConfirmationNumberOutlinedIcon from '@mui/icons-material/ConfirmationNumberOutlined';
import PersonOutlinedIcon from '@mui/icons-material/PersonOutlined';
import PendingActionsOutlinedIcon from '@mui/icons-material/PendingActionsOutlined';
import PriorityHighIcon from '@mui/icons-material/PriorityHigh';
import NewReleasesOutlinedIcon from '@mui/icons-material/NewReleasesOutlined';
import { CommonMasterView } from '../../common/CommonMasterView';
import { useTableFilter } from '../../common/TableFilter';
import { MasterHeaderActions } from '../../common/MasterHeaderActions';
import { buildExtendedSearchConfig } from '../../common/buildExtendedSearchConfig';
import { AppToast } from '../../common/AppToast';
import { useSaveFlash } from '@/utils/saveFlash';
import { DataImportModal } from '../../common/import';
import { type DataTableFilterItem } from '../../common/DataTable';
import { ROUTES } from '@/config/constants';
import { useAuth } from '@/context/AuthContext';
import { findCrmUser } from '@/services/masterData.store';
import { TICKET_PRIORITIES, TICKET_STATUSES, isTicketOpen, type Ticket } from '@/types/ticket.types';
import { useTickets, useBulkDeleteTickets } from '@/hooks/queries';
import { useShowRecordNumber } from '@/hooks/queries/useDocumentSeries';
import type { TicketFilterTab, TicketSortField } from './types';
import { TicketDetailDrawer } from '../TicketDetailDrawer';
import { useSearchScope, useSearchScopedRows } from '../../search/SearchScope';
import { useTicketColumns } from './ticketColumns';
import { ModuleScorecardSummary, useModuleScorecard } from '../../common/scorecard/useModuleScorecard';

const RECENTLY_ADDED_DAYS = 7;
const DAY_MS = 86400000;

const isHighPriority = (t: Ticket) => t.ticketPriority === 'High' || t.ticketPriority === 'Urgent';
const isRecent = (t: Ticket, now: number) => now - new Date(t.createdAt).getTime() <= RECENTLY_ADDED_DAYS * DAY_MS;
const assigneeName = (username: string) => findCrmUser(username)?.name || username;

/** Sort keys that aren't plain alphabetical: priority/status by workflow order, due date chronologically. */
const sortValue = (t: Ticket, field: TicketSortField): string | number => {
    switch (field) {
        case 'ticketPriority':
            return TICKET_PRIORITIES.indexOf(t.ticketPriority);
        case 'ticketStatus':
            return TICKET_STATUSES.indexOf(t.ticketStatus);
        case 'dueDate':
            return t.dueDate ? new Date(t.dueDate).getTime() : Number.MAX_SAFE_INTEGER;
        case 'ticketNumber':
            return parseInt(t.ticketNumber.replace(/\D/g, ''), 10) || 0;
        case 'assignedTo':
            return assigneeName(t.assignedTo).toLowerCase();
        default:
            return (t[field] || '').toString().toLowerCase();
    }
};

/** Stable empty list while the first page loads (keeps memoized filters from recomputing). */
const NO_RECORDS: Ticket[] = [];
export function TicketsMasterView() {
    const router = useRouter();
    const { user } = useAuth();
    const currentUsername = user?.username || '';

    // On the global search results page the table shows the matched records (any owner) instead of this list.
    const embeddedInSearch = Boolean(useSearchScope());
    const { data: allTicketsLoaded = NO_RECORDS, dataUpdatedAt: now, refetch, isPending: listPending } = useTickets(undefined, { enabled: !embeddedInSearch });
    // A disabled query stays "pending" forever, so only count it when this screen loads its own list.
    const listLoading = !embeddedInSearch && listPending;
    const allTickets = useSearchScopedRows(allTicketsLoaded);
    const bulkDeleteMutation = useBulkDeleteTickets();
    const [activeTab, setActiveTab] = useResetTab<TicketFilterTab>('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [page, setPage] = useState(0);
    const [rowsPerPage, setRowsPerPage] = useState(25);
    const [sortField, setSortField] = useState<TicketSortField>('ticketNumber');
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
    const tableFilter = useTableFilter<Ticket>({
        module: 'tickets',
        rows: allTickets,
        onSortChange: (s) => {
            setSortField(s.field as TicketSortField);
            setSortOrder(s.order);
        },
        onChange: () => setPage(0),
    });
    /** Records left by the Filter dialog: tabs, counts, search and bulk actions work on these. */
    const tickets = tableFilter.filteredRows;
    // Tracked by id so the drawer always shows the cached copy and closes if the ticket is deleted.
    const [drawerTicketId, setDrawerTicketId] = useState<string | null>(null);
    const selectedDrawerTicket = useMemo(
        () => (drawerTicketId ? tickets.find((t) => t.id === drawerTicketId) ?? null : null),
        [tickets, drawerTicketId]
    );
    const [importOpen, setImportOpen] = useState(false);
    const [toast, setToast] = useState<{ open: boolean; message: string; severity: 'success' | 'info' | 'error' }>({
        open: false,
        message: '',
        severity: 'success',
    });

    // Back from the create / edit form: show its "saved" toast here and open the saved record in the drawer.
    useSaveFlash(ROUTES.TICKETS, (flash) => {
        setToast({ open: true, message: flash.message, severity: flash.severity ?? 'success' });
        if (flash.recordId) setDrawerTicketId(flash.recordId);
    });

    const matchesTab = useCallback(
        (t: Ticket, tab: TicketFilterTab) => {
            switch (tab) {
                case 'my':
                    return t.assignedTo === currentUsername;
                case 'open':
                    return isTicketOpen(t);
                case 'high_priority':
                    return isHighPriority(t);
                case 'recently_added':
                    return isRecent(t, now);
                default:
                    return true;
            }
        },
        [currentUsername, now]
    );

    const showNumber = useShowRecordNumber();

    // ── Filter Logic ──────────────────────────────────────────────────────────
    /** Tickets in the active pill view: the scorecard counts these. */
    const tabTickets = useMemo(() => tickets.filter((t) => matchesTab(t, activeTab)), [tickets, activeTab, matchesTab]);

    // Summary cards, once an admin switches them on under Admin › List Scorecards.
    const goToFirstPage = useCallback(() => setPage(0), []);
    const scorecard = useModuleScorecard<Ticket>({ module: 'tickets', rows: tabTickets, onActiveChange: goToFirstPage });
    const { matches: matchesScorecard } = scorecard;

    const filteredTickets = useMemo(() => {
        const q = searchQuery.toLowerCase().trim();
        return tabTickets.filter((t) => {
            if (!matchesScorecard(t)) return false;
            if (!q) return true;
            return [
                showNumber('ticket') ? t.ticketNumber : '',
                t.ticketSubject,
                t.organizationName,
                t.contact,
                t.contactNumber,
                t.natureOfCall,
                t.ticketStatus,
                t.assignedTo,
                assigneeName(t.assignedTo),
            ].some((v) => (v || '').toLowerCase().includes(q));
        });
    }, [tabTickets, matchesScorecard, searchQuery, showNumber]);

    // ── Sort Logic ────────────────────────────────────────────────────────────
    const sortedTickets = useMemo(() => {
        const dir = sortOrder === 'asc' ? 1 : -1;
        return [...filteredTickets].sort((a, b) => {
            const va = sortValue(a, sortField);
            const vb = sortValue(b, sortField);
            if (va < vb) return -dir;
            if (va > vb) return dir;
            return 0;
        });
    }, [filteredTickets, sortField, sortOrder]);

    // ── Pagination ────────────────────────────────────────────────────────────
    const paginatedTickets = useMemo(() => {
        const start = page * rowsPerPage;
        return sortedTickets.slice(start, start + rowsPerPage);
    }, [sortedTickets, page, rowsPerPage]);

    const handleSort = (field: string) => {
        const next = field as TicketSortField;
        if (sortField === next) {
            setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
        } else {
            setSortField(next);
            setSortOrder('asc');
        }
    };

    const handleToggleSelectAll = (checked?: boolean) => {
        setSelectedIds(checked ? paginatedTickets.map((t) => t.id) : []);
    };

    const handleToggleSelectRow = (id: string) => {
        setSelectedIds((prev) => (prev.includes(id) ? prev.filter((sid) => sid !== id) : [...prev, id]));
    };

    const handleBulkDelete = async () => {
        const count = selectedIds.length;
        if (count === 0) return;
        if (!window.confirm(`Delete ${count} ticket(s)?`)) return;
        try {
            await bulkDeleteMutation.mutateAsync(selectedIds);
            setSelectedIds([]);
            setToast({ open: true, message: `${count} ticket(s) deleted.`, severity: 'success' });
        } catch {
            setToast({ open: true, message: 'Failed to delete tickets.', severity: 'error' });
        }
    };

    // ── Filter Tabs Configuration ─────────────────────────────────────────────
    const filterItems: DataTableFilterItem<TicketFilterTab>[] = useMemo(() => {
        const count = (tab: TicketFilterTab) => tickets.filter((t) => matchesTab(t, tab)).length;
        return [
            { id: 'all', label: 'All Tickets', icon: <ConfirmationNumberOutlinedIcon sx={{ fontSize: 16 }} />, count: tickets.length },
            { id: 'my', label: 'My Tickets', icon: <PersonOutlinedIcon sx={{ fontSize: 16 }} />, count: count('my') },
            { id: 'open', label: 'Open Tickets', icon: <PendingActionsOutlinedIcon sx={{ fontSize: 16 }} />, count: count('open') },
            { id: 'high_priority', label: 'High Priority', icon: <PriorityHighIcon sx={{ fontSize: 16 }} />, count: count('high_priority') },
            { id: 'recently_added', label: 'Recently Added', icon: <NewReleasesOutlinedIcon sx={{ fontSize: 16 }} />, count: count('recently_added') },
        ];
    }, [tickets, matchesTab]);

    // ── Declarative Column Definitions ────────────────────────────────────────
    const openDrawerRecord = useCallback((record: Ticket) => setDrawerTicketId(record.id), []);
    const columns = useTicketColumns(openDrawerRecord, now);

    // Row clicks only open the drawer; its eye button leads on to the detail page with the related modules.
    const closeDrawer = useCallback(() => setDrawerTicketId(null), []);

    return (
        <CommonMasterView<Ticket, TicketFilterTab>
            loading={listLoading}
            summary={<ModuleScorecardSummary state={scorecard} loading={listLoading} />}
            filterConfig={{
                filters: filterItems,
                activeFilter: activeTab,
                onFilterChange: (tab) => {
                    setActiveTab(tab);
                    setPage(0);
                },
            }}
            tableId="tickets"
            tableFilter={tableFilter}
            headerActions={() => (
                <MasterHeaderActions
                    onRefresh={async () => {
                        const { isError } = await refetch();
                        setToast(
                            isError
                                ? { open: true, message: 'Failed to refresh tickets.', severity: 'error' }
                                : { open: true, message: 'Tickets refreshed.', severity: 'info' }
                        );
                    }}
                    onNewClick={() => router.push(ROUTES.TICKET_NEW)}
                    newButtonLabel="New Ticket"
                    onImportClick={() => setImportOpen(true)}
                />
            )}
            searchConfig={buildExtendedSearchConfig({
                searchQuery,
                onSearchChange: (q) => {
                    setSearchQuery(q);
                    setPage(0);
                },
                searchPlaceholder: 'Search by ticket #, subject, organization, contact...',
                pageIds: paginatedTickets.map((r) => r.id),
                allIds: sortedTickets.map((r) => r.id),
                selectedIds,
                onSelectedIdsChange: setSelectedIds,
                page,
                rowsPerPage,
                totalRecords: sortedTickets.length,
                onPageChange: setPage,
                onBulkDelete: handleBulkDelete,
            })}
            columns={columns}
            data={paginatedTickets}
            keyExtractor={(t) => t.id}
            selectedIds={selectedIds}
            onToggleSelectRow={handleToggleSelectRow}
            onToggleSelectAll={handleToggleSelectAll}
            sortField={sortField}
            sortOrder={sortOrder}
            onSort={handleSort}
            onView={(t) => router.push(ROUTES.TICKET_DETAIL(t.id))}
            getEditHref={(t) => ROUTES.TICKET_EDIT(t.id)}
            getRowHref={(t) => ROUTES.TICKET_DETAIL(t.id)}
            onRowClick={(t) => setDrawerTicketId(t.id)}
            activeRowId={selectedDrawerTicket?.id}
            viewTooltip="View Ticket"
            editTooltip="Edit Ticket"
            emptyTitle="No tickets found"
            emptyDescription="No support tickets match your current search and filter criteria."
            emptyActionLabel="Log Ticket"
            onEmptyAction={() => router.push(ROUTES.TICKET_NEW)}
            emptyIcon={<ConfirmationNumberOutlinedIcon sx={{ fontSize: 48, color: 'var(--crm-slate-300)' }} />}
            pagination={{
                page,
                rowsPerPage,
                totalCount: sortedTickets.length,
                onPageChange: setPage,
                onRowsPerPageChange: (n) => {
                    setRowsPerPage(n);
                    setPage(0);
                },
            }}
            drawer={
                <TicketDetailDrawer
                    ticket={selectedDrawerTicket}
                    open={Boolean(selectedDrawerTicket)}
                    onClose={closeDrawer}
                />
            }
            isDrawerOpen={Boolean(selectedDrawerTicket)}
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
                entity="tickets"
                onClose={() => setImportOpen(false)}
                onImported={(count) => {
                    setToast({ open: true, message: `Successfully imported ${count} ticket${count === 1 ? '' : 's'}!`, severity: 'success' });
                }}
            />
        </CommonMasterView>
    );
}
