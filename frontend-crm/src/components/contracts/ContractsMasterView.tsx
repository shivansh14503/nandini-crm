'use client';

import React, { useState, useMemo, useCallback } from 'react';
import { useResetTab } from '@/hooks/useResetTab';
import { useRouter } from 'next/navigation';
import HistoryEduOutlinedIcon from '@mui/icons-material/HistoryEduOutlined';
import AccountCircleOutlinedIcon from '@mui/icons-material/AccountCircleOutlined';
import EventBusyOutlinedIcon from '@mui/icons-material/EventBusyOutlined';

import { ModuleScorecardSummary, useModuleScorecard } from '../common/scorecard/useModuleScorecard';
import { CommonMasterView } from '../common/CommonMasterView';
import { useTableFilter } from '../common/TableFilter';
import { MasterHeaderActions } from '../common/MasterHeaderActions';
import { buildExtendedSearchConfig } from '../common/buildExtendedSearchConfig';
import { AppToast } from '../common/AppToast';
import { type DataTableFilterItem } from '../common/DataTable';
import { useSaveFlash } from '@/utils/saveFlash';
import { localToday } from '@/utils/pastDates';
import { ROUTES } from '@/config/constants';
import { useAuth } from '@/context/AuthContext';
import { findCrmUser } from '@/services/masterData.store';
import type { Contract } from '@/types/contract.types';
import { useContracts, useDeleteContract, useBulkDeleteContracts } from '@/hooks/queries';
import { useShowRecordNumber } from '@/hooks/queries/useDocumentSeries';
import { useSearchScope, useSearchScopedRows } from '../search/SearchScope';
import { ContractDetailDrawer } from './ContractDetailDrawer';
import { useContractColumns } from './contractColumns';
import { isContractExpiringSoon } from './contractDates';

/** Quick-view pills ('all' = none picked); the status lives on the status cards. */
export type ContractFilterTab = 'all' | 'my_contracts' | 'expiring_soon';
/** Any column's field key: the table sorts on the row's value, including columns added from the form. */
export type ContractSortField = string;

const userName = (username: string | undefined) => (username ? findCrmUser(username)?.name || username : '');

/** Sort keys that aren't plain text: amounts as numbers, people by full name. */
const sortValue = (c: Contract, field: ContractSortField): string | number => {
    switch (field) {
        case 'contractValue':
        case 'billAmount':
            // Contracts without an amount sort below any amount.
            return c[field] ? Number(c[field]) || 0 : -1;
        case 'assignedTo':
        case 'createdBy':
            return userName(c[field]).toLowerCase();
        default:
            return String((c as unknown as Record<string, unknown>)[field] ?? '').toLowerCase();
    }
};

/** Stable empty list while the first page loads (keeps memoized filters from recomputing). */
const NO_RECORDS: Contract[] = [];

export function ContractsMasterView() {
    const router = useRouter();
    const { user } = useAuth();
    const currentUsername = user?.username || '';

    // On the global search results page the table shows the matched records (any owner) instead of this list.
    const embeddedInSearch = Boolean(useSearchScope());
    const { data: allContractsLoaded = NO_RECORDS, dataUpdatedAt, refetch, isPending: listPending } = useContracts(undefined, { enabled: !embeddedInSearch });
    // A disabled query stays "pending" forever, so only count it when this screen loads its own list.
    const listLoading = !embeddedInSearch && listPending;
    const allContracts = useSearchScopedRows(allContractsLoaded);
    const deleteMutation = useDeleteContract();
    const bulkDeleteMutation = useBulkDeleteContracts();
    const [activeTab, setActiveTab] = useResetTab<ContractFilterTab>('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [page, setPage] = useState(0);
    const [rowsPerPage, setRowsPerPage] = useState(10);
    const [sortField, setSortField] = useState<ContractSortField>('createdAt');
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
    const tableFilter = useTableFilter<Contract>({
        module: 'contracts',
        rows: allContracts,
        onSortChange: (s) => {
            setSortField(s.field);
            setSortOrder(s.order);
        },
        onChange: () => setPage(0),
    });
    /** Records left by the Filter dialog: pills, cards, search and bulk actions work on these. */
    const contracts = tableFilter.filteredRows;
    // Tracked by id so the drawer always shows the cached copy and closes if the contract is deleted.
    const [drawerContractId, setDrawerContractId] = useState<string | null>(null);
    const selectedDrawerContract = useMemo(
        () => (drawerContractId ? contracts.find((c) => c.id === drawerContractId) ?? null : null),
        [contracts, drawerContractId]
    );
    const [toast, setToast] = useState<{ open: boolean; message: string; severity: 'success' | 'error' | 'info' | 'warning' }>({
        open: false,
        message: '',
        severity: 'success',
    });

    // Back from the create / edit form: show its "saved" toast here and open the saved record in the drawer.
    useSaveFlash(ROUTES.CONTRACTS, (flash) => {
        setToast({ open: true, message: flash.message, severity: flash.severity ?? 'success' });
        if (flash.recordId) setDrawerContractId(flash.recordId);
    });

    // Row clicks only open the drawer; its eye button leads on to the detail page with the related modules.
    const closeDrawer = useCallback(() => setDrawerContractId(null), []);
    const showNumber = useShowRecordNumber();

    const handleDelete = async (contract: Contract) => {
        const label = showNumber('contract') && contract.contractNumber ? `"${contract.contractNumber}"` : 'this contract';
        if (!window.confirm(`Are you sure you want to delete ${label}?`)) return;
        try {
            await deleteMutation.mutateAsync(contract.id);
            if (drawerContractId === contract.id) closeDrawer();
            setToast({ open: true, message: 'Contract deleted successfully.', severity: 'success' });
        } catch {
            setToast({ open: true, message: 'Failed to delete contract.', severity: 'error' });
        }
    };

    const handleBulkDelete = async () => {
        const count = selectedIds.length;
        if (count === 0) return;
        if (!window.confirm(`Are you sure you want to delete ${count} selected contract(s)?`)) return;
        try {
            await bulkDeleteMutation.mutateAsync(selectedIds);
            if (drawerContractId && selectedIds.includes(drawerContractId)) closeDrawer();
            setSelectedIds([]);
            setToast({ open: true, message: `${count} contract(s) deleted successfully.`, severity: 'success' });
        } catch {
            setToast({ open: true, message: 'Failed to delete contracts.', severity: 'error' });
        }
    };

    // ── Quick View Pills ──────────────────────────────────────────────────────
    // The status lives on the status cards; the pills are other views and toggle off on re-click, as on Quotations.
    // "Today" moves with the list's last load, so a list left open past midnight counts from the new day once it refreshes.
    const today = useMemo(() => localToday(dataUpdatedAt ? new Date(dataUpdatedAt) : undefined), [dataUpdatedAt]);
    const isMine = useCallback((c: Contract) => Boolean(currentUsername) && c.assignedTo === currentUsername, [currentUsername]);
    const isExpiringSoon = useCallback((c: Contract) => isContractExpiringSoon(c, today), [today]);
    const filterItems: DataTableFilterItem<ContractFilterTab>[] = useMemo(
        () => [
            {
                id: 'my_contracts',
                label: 'My Contracts',
                icon: <AccountCircleOutlinedIcon sx={{ fontSize: 16 }} />,
                count: contracts.filter(isMine).length,
            },
            {
                id: 'expiring_soon',
                label: 'Expiring in 30 Days',
                icon: <EventBusyOutlinedIcon sx={{ fontSize: 16 }} />,
                count: contracts.filter(isExpiringSoon).length,
                activeColor: 'var(--crm-amber-700)',
            },
        ],
        [contracts, isMine, isExpiringSoon]
    );

    /** Contracts in the active pill view: the status cards count these, so "My Contracts" shows mine by status. */
    const tabContracts = useMemo(() => {
        if (activeTab === 'my_contracts') return contracts.filter(isMine);
        if (activeTab === 'expiring_soon') return contracts.filter(isExpiringSoon);
        return contracts;
    }, [contracts, activeTab, isMine, isExpiringSoon]);

    // ── Status Cards ──────────────────────────────────────────────────────────
    // One card per contract status with its count and Contract Value. Admins recolor / hide statuses, count by
    // another dropdown or total another amount (or switch the cards off) under Admin › List Scorecards.
    const goToFirstPage = useCallback(() => setPage(0), []);
    const scorecard = useModuleScorecard<Contract>({ module: 'contracts', rows: tabContracts, onActiveChange: goToFirstPage });

    // ── Filter & Sort ─────────────────────────────────────────────────────────
    const { matches: matchesScorecard } = scorecard;
    const filteredContracts = useMemo(() => {
        const q = searchQuery.toLowerCase().trim();
        const result = tabContracts.filter((c) => {
            if (!matchesScorecard(c)) return false;
            if (!q) return true;
            return [
                showNumber('contract') ? c.contractNumber : '',
                c.contractTitle,
                c.organizationName,
                c.contact,
                c.opportunity,
                c.assignedTo,
                userName(c.assignedTo),
            ].some((v) => (v || '').toLowerCase().includes(q));
        });

        const dir = sortOrder === 'asc' ? 1 : -1;
        return result.sort((a, b) => {
            const va = sortValue(a, sortField);
            const vb = sortValue(b, sortField);
            const diff = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb), undefined, { numeric: true });
            return diff * dir;
        });
    }, [tabContracts, matchesScorecard, searchQuery, sortField, sortOrder, showNumber]);

    const paginatedContracts = useMemo(() => {
        const start = page * rowsPerPage;
        return filteredContracts.slice(start, start + rowsPerPage);
    }, [filteredContracts, page, rowsPerPage]);

    // ── Columns ───────────────────────────────────────────────────────────────
    const openDrawerRecord = useCallback((record: Contract) => setDrawerContractId(record.id), []);
    const columns = useContractColumns(openDrawerRecord);

    const handleSort = (field: string) => {
        const isAsc = sortField === field && sortOrder === 'asc';
        setSortOrder(isAsc ? 'desc' : 'asc');
        setSortField(field);
    };

    return (
        <CommonMasterView<Contract, ContractFilterTab>
            loading={listLoading}
            breadcrumbItems={[{ label: 'Support' }, { label: 'Contracts' }]}
            summary={<ModuleScorecardSummary state={scorecard} loading={listLoading} />}
            filterConfig={{
                filters: filterItems,
                activeFilter: activeTab,
                onFilterChange: (tab) => {
                    setActiveTab((prev) => (prev === tab ? 'all' : tab));
                    setPage(0);
                },
            }}
            tableId="contracts"
            tableFilter={tableFilter}
            headerActions={() => (
                <MasterHeaderActions
                    onRefresh={async () => {
                        const { isError } = await refetch();
                        setToast(
                            isError
                                ? { open: true, message: 'Failed to refresh contracts.', severity: 'error' }
                                : { open: true, message: 'Contracts refreshed.', severity: 'info' }
                        );
                    }}
                    onNewClick={() => router.push(ROUTES.CONTRACT_NEW)}
                    newButtonLabel="New Contract"
                />
            )}
            searchConfig={buildExtendedSearchConfig({
                searchQuery,
                onSearchChange: (q) => {
                    setSearchQuery(q);
                    setPage(0);
                },
                searchPlaceholder: 'Search by title, organization, contact, opportunity...',
                pageIds: paginatedContracts.map((r) => r.id),
                allIds: filteredContracts.map((r) => r.id),
                selectedIds,
                onSelectedIdsChange: setSelectedIds,
                page,
                rowsPerPage,
                totalRecords: filteredContracts.length,
                onPageChange: setPage,
                onBulkDelete: handleBulkDelete,
            })}
            columns={columns}
            data={paginatedContracts}
            keyExtractor={(c) => c.id}
            selectedIds={selectedIds}
            onToggleSelectRow={(id) => setSelectedIds((prev) => (prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]))}
            onToggleSelectAll={(checked) => setSelectedIds(checked ? paginatedContracts.map((c) => c.id) : [])}
            sortField={sortField}
            sortOrder={sortOrder}
            onSort={handleSort}
            onView={(c) => router.push(ROUTES.CONTRACT_DETAIL(c.id))}
            getEditHref={(c) => ROUTES.CONTRACT_EDIT(c.id)}
            onDelete={handleDelete}
            getRowHref={(c) => ROUTES.CONTRACT_DETAIL(c.id)}
            onRowClick={(c) => setDrawerContractId(c.id)}
            activeRowId={selectedDrawerContract?.id}
            viewTooltip="View Contract"
            editTooltip="Edit Contract"
            deleteTooltip="Delete Contract"
            emptyTitle="No contracts found"
            emptyDescription="No contracts match your current search and filter criteria."
            emptyActionLabel="New Contract"
            onEmptyAction={() => router.push(ROUTES.CONTRACT_NEW)}
            emptyIcon={<HistoryEduOutlinedIcon sx={{ fontSize: 48, color: 'var(--crm-slate-300)' }} />}
            pagination={{
                page,
                rowsPerPage,
                totalCount: filteredContracts.length,
                entityLabel: 'Contracts',
                pageSizeOptions: [10, 25, 50],
                onPageChange: setPage,
                onRowsPerPageChange: (n) => {
                    setRowsPerPage(n);
                    setPage(0);
                },
            }}
            drawer={
                <ContractDetailDrawer
                    contract={selectedDrawerContract}
                    open={Boolean(selectedDrawerContract)}
                    onClose={closeDrawer}
                    onEdit={(id) => router.push(ROUTES.CONTRACT_EDIT(id))}
                />
            }
            isDrawerOpen={Boolean(selectedDrawerContract)}
            toast={
                <AppToast
                    open={toast.open}
                    message={toast.message}
                    severity={toast.severity}
                    onClose={() => setToast((prev) => ({ ...prev, open: false }))}
                />
            }
        >
        </CommonMasterView>
    );
}
