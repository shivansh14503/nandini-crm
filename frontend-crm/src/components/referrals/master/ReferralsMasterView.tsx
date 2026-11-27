'use client';

import React, { useState, useMemo, useCallback } from 'react';
import { useResetTab } from '@/hooks/useResetTab';
import { useRouter } from 'next/navigation';
import ConnectWithoutContactOutlinedIcon from '@mui/icons-material/ConnectWithoutContactOutlined';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutlineOutlined';
import PauseCircleOutlineIcon from '@mui/icons-material/PauseCircleOutlineOutlined';
import AccountCircleOutlinedIcon from '@mui/icons-material/AccountCircleOutlined';
import { CommonMasterView } from '../../common/CommonMasterView';
import { useTableFilter } from '../../common/TableFilter';
import { MasterHeaderActions } from '../../common/MasterHeaderActions';
import { buildExtendedSearchConfig } from '../../common/buildExtendedSearchConfig';
import { AppToast } from '../../common/AppToast';
import { useSaveFlash } from '@/utils/saveFlash';
import { type DataTableFilterItem } from '../../common/DataTable';
import { ROUTES } from '@/config/constants';
import { useAuth } from '@/context/AuthContext';
import { useReferrals, useBulkDeleteReferrals } from '@/hooks/queries';
import { ACTIVE_REFERRAL_STATUS, type Referral } from '@/types/referral.types';
import { ReferralDetailDrawer } from '../ReferralDetailDrawer';
import { useSearchScope, useSearchScopedRows } from '../../search/SearchScope';
import { useReferralColumns } from './referralColumns';
import { ModuleScorecardSummary, useModuleScorecard } from '../../common/scorecard/useModuleScorecard';

export type ReferralFilterTab = 'all' | 'active' | 'inactive' | 'my_referrals';

/** Stable empty list while the first page loads (keeps memoized filters from recomputing). */
const NO_RECORDS: Referral[] = [];

export function ReferralsMasterView() {
    const router = useRouter();
    const { user } = useAuth();
    const currentUsername = user?.username || '';

    // On the global search results page the table shows the matched records instead of this list.
    const embeddedInSearch = Boolean(useSearchScope());
    const { data: allLoaded = NO_RECORDS, refetch, isPending: listPending } = useReferrals(undefined, { enabled: !embeddedInSearch });
    const listLoading = !embeddedInSearch && listPending;
    const allReferrals = useSearchScopedRows(allLoaded);
    const bulkDeleteMutation = useBulkDeleteReferrals();
    const [activeTab, setActiveTab] = useResetTab<ReferralFilterTab>('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [page, setPage] = useState(0);
    const [rowsPerPage, setRowsPerPage] = useState(10);
    const [sortField, setSortField] = useState<string>('createdAt');
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
    const [drawerId, setDrawerId] = useState<string | null>(null);
    const openDrawerRecord = useCallback((record: Referral) => setDrawerId(record.id), []);
    const columns = useReferralColumns(openDrawerRecord);
    const tableFilter = useTableFilter<Referral>({
        module: 'referrals',
        rows: allReferrals,
        columns,
        onSortChange: (s) => {
            setSortField(s.field);
            setSortOrder(s.order);
        },
        onChange: () => setPage(0),
    });
    /** Records left by the Filter dialog: tabs, counts, search and bulk actions work on these. */
    const referrals = tableFilter.filteredRows;
    const selectedDrawerReferral = useMemo(() => (drawerId ? referrals.find((r) => r.id === drawerId) ?? null : null), [referrals, drawerId]);
    const [toast, setToast] = useState<{ open: boolean; message: string; severity: 'success' | 'error' | 'info' | 'warning' }>({
        open: false,
        message: '',
        severity: 'success',
    });

    // Back from the create / edit form: show its "saved" toast here and open the saved record in the drawer.
    useSaveFlash(ROUTES.REFERRALS, (flash) => {
        setToast({ open: true, message: flash.message, severity: flash.severity ?? 'success' });
        if (flash.recordId) setDrawerId(flash.recordId);
    });

    const inTab = useCallback(
        (r: Referral, tab: ReferralFilterTab) => {
            if (tab === 'active') return r.status === ACTIVE_REFERRAL_STATUS;
            if (tab === 'inactive') return r.status !== ACTIVE_REFERRAL_STATUS;
            if (tab === 'my_referrals') return Boolean(currentUsername) && r.assignedTo === currentUsername;
            return true;
        },
        [currentUsername]
    );

    const filterItems: DataTableFilterItem<ReferralFilterTab>[] = useMemo(() => {
        const count = (tab: ReferralFilterTab) => referrals.filter((r) => inTab(r, tab)).length;
        return [
            { id: 'all', label: 'All Referrals', icon: <ConnectWithoutContactOutlinedIcon sx={{ fontSize: 16 }} />, count: referrals.length },
            { id: 'active', label: 'Active', icon: <CheckCircleOutlineIcon sx={{ fontSize: 16 }} />, count: count('active') },
            { id: 'inactive', label: 'Inactive', icon: <PauseCircleOutlineIcon sx={{ fontSize: 16 }} />, count: count('inactive') },
            { id: 'my_referrals', label: 'My Referrals', icon: <AccountCircleOutlinedIcon sx={{ fontSize: 16 }} />, count: count('my_referrals') },
        ];
    }, [referrals, inTab]);

    /** Referrals in the active pill view: the scorecard counts these. */
    const tabReferrals = useMemo(() => referrals.filter((r) => inTab(r, activeTab)), [referrals, inTab, activeTab]);

    // Summary cards, once an admin switches them on under Admin › List Scorecards.
    const goToFirstPage = useCallback(() => setPage(0), []);
    const scorecard = useModuleScorecard<Referral>({ module: 'referrals', rows: tabReferrals, onActiveChange: goToFirstPage });
    const { matches: matchesScorecard } = scorecard;

    const filteredReferrals = useMemo(() => {
        let result = tabReferrals.filter(matchesScorecard);
        const q = searchQuery.toLowerCase().trim();
        if (q) {
            result = result.filter((r) =>
                [r.name, r.companyName, r.mobile, r.officePhone, r.designation, r.status, ...(r.emailAddress ?? []).map((e) => e.email)]
                    .some((v) => (v || '').toLowerCase().includes(q))
            );
        }
        if (sortField) {
            result = [...result].sort((a, b) => {
                const pick = (r: Referral) =>
                    sortField === 'email' ? r.emailAddress?.[0]?.email ?? '' : String((r as unknown as Record<string, unknown>)[sortField] ?? '');
                const valA = pick(a).toLowerCase();
                const valB = pick(b).toLowerCase();
                if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
                if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
                return 0;
            });
        }
        return result;
    }, [tabReferrals, matchesScorecard, searchQuery, sortField, sortOrder]);

    const handleSort = (field: string) => {
        if (sortField === field) {
            setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
        } else {
            setSortField(field);
            setSortOrder('asc');
        }
    };

    const paginated = useMemo(() => {
        const start = page * rowsPerPage;
        return filteredReferrals.slice(start, start + rowsPerPage);
    }, [filteredReferrals, page, rowsPerPage]);

    const handleBulkDelete = async () => {
        if (!window.confirm(`Delete ${selectedIds.length} selected referral(s)?`)) return;
        const count = selectedIds.length;
        try {
            await bulkDeleteMutation.mutateAsync(selectedIds);
            setSelectedIds([]);
            setToast({ open: true, message: `${count} referral(s) deleted successfully.`, severity: 'success' });
        } catch {
            setToast({ open: true, message: 'Failed to delete referrals.', severity: 'error' });
        }
    };

    const closeDrawer = useCallback(() => setDrawerId(null), []);

    return (
        <CommonMasterView<Referral, ReferralFilterTab>
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
            tableId="referrals"
            tableFilter={tableFilter}
            headerActions={() => (
                <MasterHeaderActions
                    onRefresh={async () => {
                        const { isError } = await refetch();
                        setToast(
                            isError
                                ? { open: true, message: 'Failed to refresh referrals.', severity: 'error' }
                                : { open: true, message: 'Referrals refreshed.', severity: 'info' }
                        );
                    }}
                    onNewClick={() => router.push(ROUTES.REFERRAL_NEW)}
                    newButtonLabel="New Referral"
                />
            )}
            searchConfig={buildExtendedSearchConfig({
                searchQuery,
                onSearchChange: (q) => {
                    setSearchQuery(q);
                    setPage(0);
                },
                searchPlaceholder: 'Search by name, company, phone, email...',
                pageIds: paginated.map((r) => r.id),
                allIds: filteredReferrals.map((r) => r.id),
                selectedIds,
                onSelectedIdsChange: setSelectedIds,
                page,
                rowsPerPage,
                totalRecords: filteredReferrals.length,
                onPageChange: setPage,
                onBulkDelete: handleBulkDelete,
            })}
            columns={columns}
            data={paginated}
            keyExtractor={(r) => r.id}
            selectedIds={selectedIds}
            onToggleSelectRow={(id) => setSelectedIds((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]))}
            onToggleSelectAll={(checked) => setSelectedIds(checked ? paginated.map((r) => r.id) : [])}
            sortField={sortField}
            sortOrder={sortOrder}
            onSort={handleSort}
            onView={(r) => router.push(ROUTES.REFERRAL_DETAIL(r.id))}
            getEditHref={(r) => ROUTES.REFERRAL_EDIT(r.id)}
            getRowHref={(r) => ROUTES.REFERRAL_DETAIL(r.id)}
            onRowClick={(r) => setDrawerId(r.id)}
            activeRowId={selectedDrawerReferral?.id}
            viewTooltip="View Referral"
            editTooltip="Edit Referral"
            emptyTitle="No referrals recorded yet"
            emptyDescription="Add the partners, agents and clients who refer business. Active referrals can be picked as Referred By on leads."
            emptyActionLabel="Create Referral"
            onEmptyAction={() => router.push(ROUTES.REFERRAL_NEW)}
            emptyIcon={<ConnectWithoutContactOutlinedIcon sx={{ fontSize: 48, color: 'var(--mui-palette-text-muted)' }} />}
            pagination={{
                page,
                rowsPerPage,
                totalCount: filteredReferrals.length,
                onPageChange: setPage,
                onRowsPerPageChange: (size) => {
                    setRowsPerPage(size);
                    setPage(0);
                },
                hideWhenEmpty: true,
            }}
            drawer={<ReferralDetailDrawer referral={selectedDrawerReferral} open={Boolean(selectedDrawerReferral)} onClose={closeDrawer} />}
            isDrawerOpen={Boolean(selectedDrawerReferral)}
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
