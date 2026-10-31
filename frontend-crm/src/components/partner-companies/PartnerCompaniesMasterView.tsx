'use client';

import React, { useCallback, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Box, Button, Chip, Typography } from '@mui/material';
import HandshakeOutlinedIcon from '@mui/icons-material/HandshakeOutlined';
import AccountCircleOutlinedIcon from '@mui/icons-material/AccountCircleOutlined';
import ScheduleIcon from '@mui/icons-material/Schedule';
import PhoneOutlinedIcon from '@mui/icons-material/PhoneOutlined';
import EmailOutlinedIcon from '@mui/icons-material/EmailOutlined';
import FileDownloadOutlinedIcon from '@mui/icons-material/FileDownloadOutlined';

import { RecordLink } from '../common/RecordLink';
import { CommonMasterView } from '../common/CommonMasterView';
import { MasterHeaderActions, outlinedHeaderButtonSx } from '../common/MasterHeaderActions';
import { buildExtendedSearchConfig } from '../common/buildExtendedSearchConfig';
import { AppToast } from '../common/AppToast';
import type { DataTableColumn, DataTableFilterItem } from '../common/DataTable';
import { ROUTES } from '@/config/constants';
import { useAuth } from '@/context/AuthContext';
import { getCountryNameByCode } from '@/data/addressMaster';
import { useBulkDeletePartnerCompanies, useMasterData, usePartnerCompanies } from '@/hooks/queries';
import { findCrmUser } from '@/services/masterData.store';
import type { ExtendedPartnerCompany } from '@/types/partner.types';
import { telHref } from '@/utils/contactLinks';
import { downloadCsv, type CsvColumn } from '@/utils/csvExport';
import { formatDateTime } from '@/utils/date';
import { PartnerCompanyDetailDrawer } from './PartnerCompanyDetailDrawer';

export type PartnerCompanyFilterTab = 'all' | 'mine' | 'recently_added';

/** Stable empty list while the first page loads (keeps memoized filters from recomputing). */
const NO_RECORDS: ExtendedPartnerCompany[] = [];
const WEEK_MS = 7 * 86400000;

// Display values shared by the table cells, sorting, search and CSV export.
const primaryEmail = (p: ExtendedPartnerCompany) =>
    (p.emailAddresses?.find((e) => e.isPrimary) ?? p.emailAddresses?.[0])?.email || p.email || '';
const cityOf = (p: ExtendedPartnerCompany) => p.billingCity || p.city || '';
const countryOf = (p: ExtendedPartnerCompany) => getCountryNameByCode(p.billingCountry) || p.billingCountry || '';
const assigneeOf = (p: ExtendedPartnerCompany) => findCrmUser(p.assignedTo)?.name || p.assignedTo || '';
const isRecent = (p: ExtendedPartnerCompany) => Boolean(p.createdAt) && Date.now() - new Date(p.createdAt).getTime() <= WEEK_MS;

/** Sort key per column id; dates sort chronologically, everything else case-insensitively. */
const SORT_VALUE: Record<string, (p: ExtendedPartnerCompany) => string | number> = {
    companyName: (p) => p.companyName.toLowerCase(),
    natureOfPartner: (p) => (p.natureOfPartner || '').toLowerCase(),
    phone: (p) => p.phone || '',
    email: (p) => primaryEmail(p).toLowerCase(),
    city: (p) => cityOf(p).toLowerCase(),
    billingCountry: (p) => countryOf(p).toLowerCase(),
    assignedTo: (p) => assigneeOf(p).toLowerCase(),
    createdAt: (p) => (p.createdAt ? new Date(p.createdAt).getTime() : 0),
};

const CSV_COLUMNS: CsvColumn<ExtendedPartnerCompany>[] = [
    { header: 'Company Name', value: (p) => p.companyName },
    { header: 'Nature of Partner', value: (p) => p.natureOfPartner },
    { header: 'Phone', value: (p) => p.phone },
    { header: 'Email Address', value: primaryEmail },
    { header: 'City', value: cityOf },
    { header: 'Billing Country', value: countryOf },
    { header: 'Assigned to', value: assigneeOf },
    { header: 'Date Created', value: (p) => (p.createdAt ? formatDateTime(p.createdAt) : '') },
];

const cellTextSx = { fontSize: '0.8rem', color: '#475569' } as const;

export function PartnerCompaniesMasterView() {
    const router = useRouter();
    const { user } = useAuth();
    const currentUsername = user?.username || '';
    // Re-renders once the user directory loads, so "Assigned to" shows full names.
    useMasterData();

    const { data: partners = NO_RECORDS, refetch } = usePartnerCompanies();
    const bulkDeleteMutation = useBulkDeletePartnerCompanies();
    const [activeTab, setActiveTab] = useState<PartnerCompanyFilterTab>('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [page, setPage] = useState(0);
    const [rowsPerPage, setRowsPerPage] = useState(10);
    const [sortField, setSortField] = useState<string>('companyName');
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
    // Tracked by id so the drawer always shows the cached copy and closes if the record is deleted.
    const [drawerId, setDrawerId] = useState<string | null>(null);
    const drawerRecord = useMemo(() => (drawerId ? partners.find((p) => p.id === drawerId) ?? null : null), [partners, drawerId]);
    const [toast, setToast] = useState<{ open: boolean; message: string; severity: 'success' | 'error' | 'info' | 'warning' }>({
        open: false,
        message: '',
        severity: 'success',
    });

    // ── Filter tabs ──────────────────────────────────────────────────────────
    const filterItems: DataTableFilterItem<PartnerCompanyFilterTab>[] = useMemo(
        () => [
            { id: 'all', label: 'All Partner Companies', icon: <HandshakeOutlinedIcon sx={{ fontSize: 16 }} />, count: partners.length },
            {
                id: 'mine',
                label: 'My Partners',
                icon: <AccountCircleOutlinedIcon sx={{ fontSize: 16 }} />,
                count: currentUsername ? partners.filter((p) => p.assignedTo === currentUsername).length : 0,
            },
            { id: 'recently_added', label: 'Recently Added', icon: <ScheduleIcon sx={{ fontSize: 16 }} />, count: partners.filter(isRecent).length },
        ],
        [partners, currentUsername]
    );

    // ── Filter, search & sort ────────────────────────────────────────────────
    const filtered = useMemo(() => {
        let result = partners;
        if (activeTab === 'mine') result = currentUsername ? result.filter((p) => p.assignedTo === currentUsername) : [];
        else if (activeTab === 'recently_added') result = result.filter(isRecent);

        const q = searchQuery.trim().toLowerCase();
        if (q) {
            result = result.filter((p) =>
                [p.companyName, p.natureOfPartner, p.phone, primaryEmail(p), cityOf(p), countryOf(p), assigneeOf(p), p.principalCompany].some((v) =>
                    (v || '').toLowerCase().includes(q)
                )
            );
        }

        const sortValue = SORT_VALUE[sortField];
        if (sortValue) {
            const dir = sortOrder === 'asc' ? 1 : -1;
            result = [...result].sort((a, b) => {
                const x = sortValue(a);
                const y = sortValue(b);
                return x < y ? -dir : x > y ? dir : 0;
            });
        }
        return result;
    }, [partners, activeTab, searchQuery, sortField, sortOrder, currentUsername]);

    const paginated = useMemo(() => filtered.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage), [filtered, page, rowsPerPage]);

    const handleSort = (field: string) => {
        if (sortField === field) {
            setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
        } else {
            setSortField(field);
            setSortOrder('asc');
        }
    };

    const handleBulkDelete = async () => {
        if (!window.confirm(`Delete ${selectedIds.length} selected partner compan${selectedIds.length === 1 ? 'y' : 'ies'}?`)) return;
        const count = selectedIds.length;
        try {
            await bulkDeleteMutation.mutateAsync(selectedIds);
            setSelectedIds([]);
            setToast({ open: true, message: `${count} partner compan${count === 1 ? 'y' : 'ies'} deleted successfully.`, severity: 'success' });
        } catch {
            setToast({ open: true, message: 'Failed to delete partner companies.', severity: 'error' });
        }
    };

    const handleExport = () => {
        // Selected rows when there is a selection, otherwise everything matching the current filter / search.
        const rows = selectedIds.length > 0 ? filtered.filter((p) => selectedIds.includes(p.id)) : filtered;
        if (rows.length === 0) {
            setToast({ open: true, message: 'There are no partner companies to export.', severity: 'info' });
            return;
        }
        downloadCsv(`partner-companies-${new Date().toISOString().slice(0, 10)}.csv`, rows, CSV_COLUMNS);
        setToast({ open: true, message: `Exported ${rows.length} partner compan${rows.length === 1 ? 'y' : 'ies'}.`, severity: 'success' });
    };

    // ── Columns ──────────────────────────────────────────────────────────────
    const columns: DataTableColumn<ExtendedPartnerCompany>[] = useMemo(
        () => [
            {
                id: 'companyName',
                label: 'COMPANY NAME',
                sortable: true,
                locked: true,
                minWidth: 220,
                render: (p) => (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <HandshakeOutlinedIcon sx={{ fontSize: 16, color: '#2563eb' }} />
                        <RecordLink
                            href={ROUTES.PARTNER_COMPANY_DETAIL(p.id)}
                            onOpen={() => setDrawerId(p.id)}
                            sx={{ fontWeight: 700, color: '#1d4ed8', fontSize: '0.82rem', cursor: 'pointer', '&:hover': { textDecoration: 'underline' } }}
                        >
                            {p.companyName}
                        </RecordLink>
                    </Box>
                ),
            },
            {
                id: 'natureOfPartner',
                label: 'NATURE OF PARTNER',
                sortable: true,
                minWidth: 170,
                render: (p) =>
                    p.natureOfPartner ? (
                        <Chip
                            label={p.natureOfPartner}
                            size="small"
                            sx={{ height: 22, fontSize: '0.7rem', fontWeight: 700, backgroundColor: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe' }}
                        />
                    ) : (
                        <Typography sx={cellTextSx}>-</Typography>
                    ),
            },
            {
                id: 'phone',
                label: 'PHONE',
                sortable: true,
                minWidth: 150,
                render: (p) =>
                    p.phone ? (
                        <Box
                            component="a"
                            href={telHref(p.phone)}
                            onClick={(e: React.MouseEvent) => e.stopPropagation()}
                            sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.6, ...cellTextSx, textDecoration: 'none', '&:hover': { color: '#1d4ed8' } }}
                        >
                            <PhoneOutlinedIcon sx={{ fontSize: 14, color: '#94a3b8' }} />
                            {p.phone}
                        </Box>
                    ) : (
                        <Typography sx={cellTextSx}>-</Typography>
                    ),
            },
            {
                id: 'email',
                label: 'EMAIL ADDRESS',
                sortable: true,
                minWidth: 200,
                render: (p) => (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.6 }}>
                        <EmailOutlinedIcon sx={{ fontSize: 14, color: '#94a3b8' }} />
                        <Typography sx={cellTextSx}>{primaryEmail(p) || '-'}</Typography>
                    </Box>
                ),
            },
            { id: 'city', label: 'CITY', sortable: true, minWidth: 120, render: (p) => <Typography sx={cellTextSx}>{cityOf(p) || '-'}</Typography> },
            {
                id: 'billingCountry',
                label: 'BILLING COUNTRY',
                sortable: true,
                minWidth: 130,
                render: (p) => <Typography sx={cellTextSx}>{countryOf(p) || '-'}</Typography>,
            },
            {
                id: 'assignedTo',
                label: 'ASSIGNED TO',
                sortable: true,
                minWidth: 140,
                render: (p) => <Typography sx={{ fontSize: '0.78rem', color: '#64748b' }}>{assigneeOf(p) || '-'}</Typography>,
            },
            {
                id: 'createdAt',
                label: 'DATE CREATED',
                sortable: true,
                minWidth: 150,
                render: (p) => <Typography sx={{ fontSize: '0.78rem', color: '#64748b' }}>{p.createdAt ? formatDateTime(p.createdAt) : '-'}</Typography>,
            },
        ],
        []
    );

    const closeDrawer = useCallback(() => setDrawerId(null), []);

    return (
        <CommonMasterView<ExtendedPartnerCompany, PartnerCompanyFilterTab>
            breadcrumbItems={[{ label: 'All' }, { label: 'Partner Companies' }]}
            filterConfig={{
                filters: filterItems,
                activeFilter: activeTab,
                onFilterChange: (tab) => {
                    setActiveTab(tab);
                    setPage(0);
                },
            }}
            tableId="partner-companies"
            headerActions={() => (
                <MasterHeaderActions
                    onRefresh={async () => {
                        const { isError } = await refetch();
                        setToast(
                            isError
                                ? { open: true, message: 'Failed to refresh partner companies.', severity: 'error' }
                                : { open: true, message: 'Partner companies refreshed.', severity: 'info' }
                        );
                    }}
                    onNewClick={() => router.push(ROUTES.PARTNER_COMPANY_NEW)}
                    newButtonLabel="New Partner Company"
                >
                    <Button
                        variant="outlined"
                        size="small"
                        startIcon={<FileDownloadOutlinedIcon sx={{ fontSize: 16 }} />}
                        onClick={handleExport}
                        sx={outlinedHeaderButtonSx}
                    >
                        Export
                    </Button>
                </MasterHeaderActions>
            )}
            searchConfig={buildExtendedSearchConfig({
                searchQuery,
                onSearchChange: (q) => {
                    setSearchQuery(q);
                    setPage(0);
                },
                searchPlaceholder: 'Search by name, nature, phone, email, city...',
                pageIds: paginated.map((r) => r.id),
                allIds: filtered.map((r) => r.id),
                selectedIds,
                onSelectedIdsChange: setSelectedIds,
                page,
                rowsPerPage,
                totalRecords: filtered.length,
                onPageChange: setPage,
                onBulkDelete: handleBulkDelete,
            })}
            columns={columns}
            data={paginated}
            keyExtractor={(p) => p.id}
            selectedIds={selectedIds}
            onToggleSelectRow={(id) => setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))}
            onToggleSelectAll={(checked) => setSelectedIds(checked ? paginated.map((p) => p.id) : [])}
            sortField={sortField}
            sortOrder={sortOrder}
            onSort={handleSort}
            onView={(p) => router.push(ROUTES.PARTNER_COMPANY_DETAIL(p.id))}
            getEditHref={(p) => ROUTES.PARTNER_COMPANY_EDIT(p.id)}
            onRowClick={(p) => setDrawerId(p.id)}
            activeRowId={drawerRecord?.id}
            viewTooltip="View Partner Company"
            editTooltip="Edit Partner Company"
            emptyTitle="No partner companies yet"
            emptyDescription="Add the channel and referral partners you work with to track them across tickets and organizations."
            emptyActionLabel="Create Partner Company"
            onEmptyAction={() => router.push(ROUTES.PARTNER_COMPANY_NEW)}
            emptyIcon={<HandshakeOutlinedIcon sx={{ fontSize: 48, color: '#cbd5e1' }} />}
            pagination={{
                page,
                rowsPerPage,
                totalCount: filtered.length,
                onPageChange: setPage,
                onRowsPerPageChange: (size) => {
                    setRowsPerPage(size);
                    setPage(0);
                },
                hideWhenEmpty: true,
            }}
            drawer={<PartnerCompanyDetailDrawer partnerCompany={drawerRecord} open={Boolean(drawerRecord)} onClose={closeDrawer} />}
            isDrawerOpen={Boolean(drawerRecord)}
            toast={<AppToast open={toast.open} message={toast.message} severity={toast.severity} onClose={() => setToast((prev) => ({ ...prev, open: false }))} />}
        />
    );
}
