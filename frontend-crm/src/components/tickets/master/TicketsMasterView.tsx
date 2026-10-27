'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Box, Typography } from '@mui/material';
import ConfirmationNumberOutlinedIcon from '@mui/icons-material/ConfirmationNumberOutlined';
import PersonOutlinedIcon from '@mui/icons-material/PersonOutlined';
import PendingActionsOutlinedIcon from '@mui/icons-material/PendingActionsOutlined';
import PriorityHighIcon from '@mui/icons-material/PriorityHigh';
import NewReleasesOutlinedIcon from '@mui/icons-material/NewReleasesOutlined';
import { RecordLink } from '../../common/RecordLink';
import { CommonMasterView } from '../../common/CommonMasterView';
import { MasterHeaderActions } from '../../common/MasterHeaderActions';
import { buildExtendedSearchConfig } from '../../common/buildExtendedSearchConfig';
import { AppToast } from '../../common/AppToast';
import type { DataTableColumn, DataTableFilterItem } from '../../common/DataTable';
import { ROUTES } from '../../../config/constants';
import { useAuth } from '@/context/AuthContext';
import { findCrmUser } from '@/data/mockUsers';
import {
    TICKET_PRIORITIES,
    TICKET_STATUSES,
    isTicketOpen,
    isTicketOverdue,
    type Ticket,
} from '@/types/ticket.types';
import { ticketService, subscribeCrmSync } from '@/services';
import type { TicketFilterTab, TicketSortField } from './types';
import { TicketDetailDrawer } from '../TicketDetailDrawer';
import { TicketPriorityPill, TicketStatusPill, formatTicketDue } from '../TicketBadges';

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

export function TicketsMasterView() {
    const router = useRouter();
    const { user } = useAuth();
    const currentUsername = user?.username || 'mittal.sharma';

    const [tickets, setTickets] = useState<Ticket[]>([]);
    // Reference time for "recent" / "overdue"; refreshed whenever the data reloads.
    const [now, setNow] = useState(() => Date.now());
    const [activeTab, setActiveTab] = useState<TicketFilterTab>('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [page, setPage] = useState(0);
    const [rowsPerPage, setRowsPerPage] = useState(25);
    const [sortField, setSortField] = useState<TicketSortField>('ticketNumber');
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
    const [selectedDrawerTicket, setSelectedDrawerTicket] = useState<Ticket | null>(null);
    const [toast, setToast] = useState<{ open: boolean; message: string; severity: 'success' | 'info' | 'error' }>({
        open: false,
        message: '',
        severity: 'success',
    });

    const loadTickets = useCallback(() => {
        const data = ticketService.getAllSync();
        setTickets(data);
        setNow(Date.now());
        setSelectedDrawerTicket((prev) => (prev ? data.find((t) => t.id === prev.id) || null : null));
    }, []);

    useEffect(() => {
        let active = true;
        ticketService
            .getAll()
            .then((data) => {
                if (active) setTickets(data);
            })
            .catch(() => {});
        return () => {
            active = false;
        };
    }, []);

    useEffect(() => subscribeCrmSync(loadTickets), [loadTickets]);

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

    // ── Filter Logic ──────────────────────────────────────────────────────────
    const filteredTickets = useMemo(() => {
        const q = searchQuery.toLowerCase().trim();
        return tickets.filter((t) => {
            if (!matchesTab(t, activeTab)) return false;
            if (!q) return true;
            return [
                t.ticketNumber,
                t.ticketSubject,
                t.organizationName,
                t.contactPersonName,
                t.contactNumber,
                t.natureOfCall,
                t.ticketStatus,
                t.assignedTo,
                assigneeName(t.assignedTo),
            ].some((v) => (v || '').toLowerCase().includes(q));
        });
    }, [tickets, activeTab, searchQuery, matchesTab]);

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
        await ticketService.deleteBulk(selectedIds);
        if (selectedDrawerTicket && selectedIds.includes(selectedDrawerTicket.id)) {
            setSelectedDrawerTicket(null);
        }
        loadTickets();
        setSelectedIds([]);
        setToast({ open: true, message: `${count} ticket(s) deleted.`, severity: 'success' });
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
    const columns: DataTableColumn<Ticket>[] = useMemo(
        () => [
            {
                id: 'ticketNumber',
                label: 'TICKET',
                sortable: true,
                locked: true,
                minWidth: 260,
                render: (t) => (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <ConfirmationNumberOutlinedIcon sx={{ fontSize: 16, color: '#7c3aed', flexShrink: 0 }} />
                        <Box sx={{ minWidth: 0 }}>
                            <RecordLink
                                href={ROUTES.TICKET_DETAIL(t.id)}
                                onOpen={() => setSelectedDrawerTicket(t)}
                                sx={{
                                    fontWeight: 700,
                                    color: '#1d4ed8',
                                    fontSize: '0.82rem',
                                    fontFamily: 'monospace',
                                    cursor: 'pointer',
                                    lineHeight: 1.2,
                                    '&:hover': { textDecoration: 'underline' },
                                }}
                            >
                                {t.ticketNumber}
                            </RecordLink>
                            <Typography noWrap sx={{ fontSize: '0.74rem', color: '#64748b', maxWidth: 260 }}>
                                {t.ticketSubject || t.problemReported}
                            </Typography>
                        </Box>
                    </Box>
                ),
            },
            {
                id: 'organizationName',
                label: 'ORGANIZATION',
                sortable: true,
                minWidth: 200,
                render: (t) => (
                    <Typography noWrap sx={{ fontSize: '0.8rem', fontWeight: 600, color: '#334155', maxWidth: 240 }}>
                        {t.organizationName || '-'}
                    </Typography>
                ),
            },
            {
                id: 'contactPersonName',
                label: 'CONTACT',
                sortable: true,
                minWidth: 150,
                render: (t) => (
                    <Box>
                        <Typography sx={{ fontSize: '0.8rem', color: '#334155', lineHeight: 1.3 }}>{t.contactPersonName || '-'}</Typography>
                        {t.contactNumber && <Typography sx={{ fontSize: '0.72rem', color: '#94a3b8' }}>{t.contactNumber}</Typography>}
                    </Box>
                ),
            },
            {
                id: 'ticketPriority',
                label: 'PRIORITY',
                sortable: true,
                minWidth: 100,
                render: (t) => <TicketPriorityPill priority={t.ticketPriority} />,
            },
            {
                id: 'ticketStatus',
                label: 'STATUS',
                sortable: true,
                minWidth: 140,
                render: (t) => <TicketStatusPill status={t.ticketStatus} />,
            },
            {
                id: 'natureOfCall',
                label: 'NATURE OF CALL',
                sortable: true,
                minWidth: 150,
                render: (t) => <Typography sx={{ fontSize: '0.78rem', color: '#475569' }}>{t.natureOfCall || '-'}</Typography>,
            },
            {
                id: 'dueDate',
                label: 'DUE DATE',
                sortable: true,
                minWidth: 170,
                render: (t) => {
                    const overdue = isTicketOverdue(t, now);
                    return (
                        <Box>
                            <Typography sx={{ fontSize: '0.78rem', fontWeight: overdue ? 700 : 500, color: overdue ? '#dc2626' : '#475569' }}>
                                {formatTicketDue(t.dueDate)}
                            </Typography>
                            {overdue && <Typography sx={{ fontSize: '0.68rem', fontWeight: 700, color: '#dc2626' }}>Overdue</Typography>}
                        </Box>
                    );
                },
            },
            {
                id: 'assignedTo',
                label: 'ASSIGNED TO',
                sortable: true,
                minWidth: 140,
                render: (t) => <Typography sx={{ fontSize: '0.78rem', color: '#475569' }}>{assigneeName(t.assignedTo) || '-'}</Typography>,
            },
        ],
        [now]
    );

    return (
        <CommonMasterView<Ticket, TicketFilterTab>
            filterConfig={{
                filters: filterItems,
                activeFilter: activeTab,
                onFilterChange: (tab) => {
                    setActiveTab(tab);
                    setPage(0);
                },
            }}
            tableId="tickets"
            headerActions={() => (
                <MasterHeaderActions
                    onRefresh={() => {
                        loadTickets();
                        setToast({ open: true, message: 'Tickets refreshed.', severity: 'info' });
                    }}
                    onNewClick={() => router.push(ROUTES.TICKET_NEW)}
                    newButtonLabel="New Ticket"
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
            onRowClick={(t) => setSelectedDrawerTicket(t)}
            activeRowId={selectedDrawerTicket?.id}
            viewTooltip="View Ticket"
            editTooltip="Edit Ticket"
            emptyTitle="No tickets found"
            emptyDescription="No support tickets match your current search and filter criteria."
            emptyActionLabel="Log Ticket"
            onEmptyAction={() => router.push(ROUTES.TICKET_NEW)}
            emptyIcon={<ConfirmationNumberOutlinedIcon sx={{ fontSize: 48, color: '#cbd5e1' }} />}
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
                    onClose={() => setSelectedDrawerTicket(null)}
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
        />
    );
}
