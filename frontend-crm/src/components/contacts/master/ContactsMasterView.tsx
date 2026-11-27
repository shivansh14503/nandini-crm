'use client';

import React, { useState, useMemo, useCallback } from 'react';
import { useResetTab } from '@/hooks/useResetTab';
import { useRouter } from 'next/navigation';
import PersonOutlinedIcon from '@mui/icons-material/PersonOutlined';
import StarBorderIcon from '@mui/icons-material/StarBorder';
import ScheduleIcon from '@mui/icons-material/Schedule';
import AccountCircleOutlinedIcon from '@mui/icons-material/AccountCircleOutlined';
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
import { useContacts, useBulkDeleteContacts } from '@/hooks/queries';
import type { Contact } from '@/types/contact.types';
import type { ContactFilterTab } from './types';
import { ContactDetailDrawer } from '../ContactDetailDrawer';
import { useSearchScope, useSearchScopedRows } from '../../search/SearchScope';
import { useContactColumns } from './contactColumns';
import { ModuleScorecardSummary, useModuleScorecard } from '../../common/scorecard/useModuleScorecard';

/** Stable empty list while the first page loads (keeps memoized filters from recomputing). */
const NO_RECORDS: Contact[] = [];
export function ContactsMasterView() {
    const router = useRouter();
    const { user } = useAuth();
    const currentUsername = user?.username || '';

    // On the global search results page the table shows the matched records (any owner) instead of this list.
    const embeddedInSearch = Boolean(useSearchScope());
    const { data: allContactsLoaded = NO_RECORDS, refetch, isPending: listPending } = useContacts(undefined, { enabled: !embeddedInSearch });
    // A disabled query stays "pending" forever, so only count it when this screen loads its own list.
    const listLoading = !embeddedInSearch && listPending;
    const allContacts = useSearchScopedRows(allContactsLoaded);
    const bulkDeleteMutation = useBulkDeleteContacts();
    const [activeTab, setActiveTab] = useResetTab<ContactFilterTab>('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [page, setPage] = useState(0);
    const [rowsPerPage, setRowsPerPage] = useState(10);
    const [sortField, setSortField] = useState<string>('createdAt');
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
    // Tracked by id so the drawer always shows the cached copy and closes if the contact is deleted.
    const [drawerContactId, setDrawerContactId] = useState<string | null>(null);
    // ── Declarative Column Definitions ──────────────────────────────────────
    const openDrawerRecord = useCallback((record: Contact) => setDrawerContactId(record.id), []);
    const columns = useContactColumns(openDrawerRecord);
    const tableFilter = useTableFilter<Contact>({
        module: 'contacts',
        rows: allContacts,
        columns,
        onSortChange: (s) => {
            setSortField(s.field);
            setSortOrder(s.order);
        },
        onChange: () => setPage(0),
    });
    /** Records left by the Filter dialog: tabs, counts, search and bulk actions work on these. */
    const contacts = tableFilter.filteredRows;

    const selectedDrawerContact = useMemo(
        () => (drawerContactId ? contacts.find((c) => c.id === drawerContactId) ?? null : null),
        [contacts, drawerContactId]
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
    useSaveFlash(ROUTES.CONTACTS, (flash) => {
        setToast({ open: true, message: flash.message, severity: flash.severity ?? 'success' });
        if (flash.recordId) setDrawerContactId(flash.recordId);
    });

    const [importOpen, setImportOpen] = useState(false);

    // ── Filter Tabs Configuration ────────────────────────────────────────────
    const filterItems: DataTableFilterItem<ContactFilterTab>[] = useMemo(() => {
        const primary = contacts.filter((c) => c.isPrimaryContact).length;
        const myContacts = currentUsername ? contacts.filter((c) => c.assignedTo === currentUsername).length : 0;
        const oneWeekAgo = new Date().getTime() - 7 * 86400000;
        const recentlyAdded = contacts.filter((c) => new Date(c.createdAt).getTime() >= oneWeekAgo).length;

        return [
            {
                id: 'all',
                label: 'All Contacts',
                icon: <PersonOutlinedIcon sx={{ fontSize: 16 }} />,
                count: contacts.length,
            },
            {
                id: 'primary',
                label: 'Primary Contacts',
                icon: <StarBorderIcon sx={{ fontSize: 16 }} />,
                count: primary,
            },
            {
                id: 'my_contacts',
                label: 'My Contacts',
                icon: <AccountCircleOutlinedIcon sx={{ fontSize: 16 }} />,
                count: myContacts,
            },
            {
                id: 'recently_added',
                label: 'Recently Added',
                icon: <ScheduleIcon sx={{ fontSize: 16 }} />,
                count: recentlyAdded,
            },
        ];
    }, [contacts, currentUsername]);

    // ── Filter & Search Logic ────────────────────────────────────────────────
    /** Contacts in the active pill view: the scorecard counts these. */
    const tabContacts = useMemo(() => {
        if (activeTab === 'primary') return contacts.filter((c) => c.isPrimaryContact);
        if (activeTab === 'my_contacts') return currentUsername ? contacts.filter((c) => c.assignedTo === currentUsername) : [];
        if (activeTab === 'recently_added') {
            const oneWeekAgo = new Date().getTime() - 7 * 86400000;
            return contacts.filter((c) => new Date(c.createdAt).getTime() >= oneWeekAgo);
        }
        return contacts;
    }, [contacts, activeTab, currentUsername]);

    // Summary cards, once an admin switches them on under Admin › List Scorecards.
    const goToFirstPage = useCallback(() => setPage(0), []);
    const scorecard = useModuleScorecard<Contact>({ module: 'contacts', rows: tabContacts, onActiveChange: goToFirstPage });
    const { matches: matchesScorecard } = scorecard;

    const filteredContacts = useMemo(() => {
        let result = tabContacts.filter(matchesScorecard);

        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase().trim();
            result = result.filter((c) => {
                const name = c.name?.toLowerCase() || '';
                const org = c.organizationName?.toLowerCase() || '';
                const mobile = c.mobile || '';
                const email = c.emailAddress?.[0]?.email?.toLowerCase() || '';
                const designation = c.designation?.toLowerCase() || '';
                return (
                    name.includes(q) ||
                    org.includes(q) ||
                    mobile.includes(q) ||
                    email.includes(q) ||
                    designation.includes(q)
                );
            });
        }

        if (sortField) {
            result = [...result].sort((a, b) => {
                let valA: string | number = String((a as unknown as Record<string, unknown>)[sortField] ?? '');
                let valB: string | number = String((b as unknown as Record<string, unknown>)[sortField] ?? '');
                if (sortField === 'email') {
                    valA = a.emailAddress?.[0]?.email ?? '';
                    valB = b.emailAddress?.[0]?.email ?? '';
                }
                valA = valA.toLowerCase();
                valB = valB.toLowerCase();
                if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
                if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
                return 0;
            });
        }

        return result;
    }, [tabContacts, matchesScorecard, searchQuery, sortField, sortOrder]);

    const handleSort = (field: string) => {
        if (sortField === field) {
            setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
        } else {
            setSortField(field);
            setSortOrder('asc');
        }
    };

    const paginatedContacts = useMemo(() => {
        const start = page * rowsPerPage;
        return filteredContacts.slice(start, start + rowsPerPage);
    }, [filteredContacts, page, rowsPerPage]);

    const handleToggleSelectRow = (id: string) => {
        setSelectedIds((prev) =>
            prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
        );
    };

    const handleToggleSelectAll = (checked?: boolean) => {
        if (checked) {
            setSelectedIds(paginatedContacts.map((c) => c.id));
        } else {
            setSelectedIds([]);
        }
    };

    const handleBulkDelete = async () => {
        if (!window.confirm(`Delete ${selectedIds.length} selected contact(s)?`)) return;
        const count = selectedIds.length;
        try {
            await bulkDeleteMutation.mutateAsync(selectedIds);
            setSelectedIds([]);
            setToast({
                open: true,
                message: `${count} contact(s) deleted successfully.`,
                severity: 'success',
            });
        } catch {
            setToast({ open: true, message: 'Failed to delete contacts.', severity: 'error' });
        }
    };

    // Row clicks only open the drawer; its eye button leads on to the detail page with the related modules.
    const closeDrawer = useCallback(() => setDrawerContactId(null), []);

    return (
        <CommonMasterView<Contact, ContactFilterTab>
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
            tableId="contacts"
            tableFilter={tableFilter}
            headerActions={() => (
                <MasterHeaderActions
                    onRefresh={async () => {
                        const { isError } = await refetch();
                        setToast(
                            isError
                                ? { open: true, message: 'Failed to refresh contacts.', severity: 'error' }
                                : { open: true, message: 'Contacts refreshed.', severity: 'info' }
                        );
                    }}
                    onNewClick={() => router.push(ROUTES.CONTACT_NEW)}
                    newButtonLabel="New Contact"
                    onImportClick={() => setImportOpen(true)}
                />
            )}
            searchConfig={buildExtendedSearchConfig({
                searchQuery,
                onSearchChange: (q) => {
                    setSearchQuery(q);
                    setPage(0);
                },
                searchPlaceholder: 'Search by name, organization, phone, email...',
                pageIds: paginatedContacts.map((r) => r.id),
                allIds: filteredContacts.map((r) => r.id),
                selectedIds,
                onSelectedIdsChange: setSelectedIds,
                page,
                rowsPerPage,
                totalRecords: filteredContacts.length,
                onPageChange: setPage,
                onBulkDelete: handleBulkDelete,
            })}
            columns={columns}
            data={paginatedContacts}
            keyExtractor={(c) => c.id}
            selectedIds={selectedIds}
            onToggleSelectRow={handleToggleSelectRow}
            onToggleSelectAll={handleToggleSelectAll}
            sortField={sortField}
            sortOrder={sortOrder}
            onSort={handleSort}
            onView={(c) => router.push(ROUTES.CONTACT_DETAIL(c.id))}
            getEditHref={(c) => ROUTES.CONTACT_EDIT(c.id)}
            getRowHref={(c) => ROUTES.CONTACT_DETAIL(c.id)}
            onRowClick={(c) => setDrawerContactId(c.id)}
            activeRowId={selectedDrawerContact?.id}
            viewTooltip="View Contact"
            editTooltip="Edit Contact"
            emptyTitle="No contacts recorded yet"
            emptyDescription="Create your first contact person and link them to an active organization account."
            emptyActionLabel="Create Contact"
            onEmptyAction={() => router.push(ROUTES.CONTACT_NEW)}
            emptyIcon={<PersonOutlinedIcon sx={{ fontSize: 48, color: 'var(--crm-slate-300)' }} />}
            pagination={{
                page,
                rowsPerPage,
                totalCount: filteredContacts.length,
                onPageChange: setPage,
                onRowsPerPageChange: (size) => {
                    setRowsPerPage(size);
                    setPage(0);
                },
                hideWhenEmpty: true,
            }}
            drawer={
                <ContactDetailDrawer
                    contact={selectedDrawerContact}
                    open={Boolean(selectedDrawerContact)}
                    onClose={closeDrawer}
                />
            }
            isDrawerOpen={Boolean(selectedDrawerContact)}
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
                entity="contacts"
                onClose={() => setImportOpen(false)}
                onImported={(count) => {
                    setToast({ open: true, message: `Successfully imported ${count} contact${count === 1 ? '' : 's'}!`, severity: 'success' });
                }}
            />
        </CommonMasterView>
    );
}
