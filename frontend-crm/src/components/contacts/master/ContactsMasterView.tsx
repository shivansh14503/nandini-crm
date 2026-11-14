'use client';

import React, { useState, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Box, Chip, Typography } from '@mui/material';
import PersonOutlinedIcon from '@mui/icons-material/PersonOutlined';
import StarBorderIcon from '@mui/icons-material/StarBorder';
import ScheduleIcon from '@mui/icons-material/Schedule';
import AccountCircleOutlinedIcon from '@mui/icons-material/AccountCircleOutlined';
import PhoneOutlinedIcon from '@mui/icons-material/PhoneOutlined';
import EmailOutlinedIcon from '@mui/icons-material/EmailOutlined';
import ApartmentIcon from '@mui/icons-material/Apartment';
import { RecordLink } from '../../common/RecordLink';
import { CommonMasterView } from '../../common/CommonMasterView';
import { useTableFilter } from '../../common/TableFilter';
import { MasterHeaderActions } from '../../common/MasterHeaderActions';
import { buildExtendedSearchConfig } from '../../common/buildExtendedSearchConfig';
import { AppToast } from '../../common/AppToast';
import { DataImportModal } from '../../common/import';
import { RelatedModulesSidebar, RelatedRecordsTableView } from '../../common/Drawer';
import { RelatedSecondaryDrawer, type SecondaryDrawerEntity } from '../../common/RelatedSecondaryDrawer';
import { documentNumberColumn, type DataTableColumn, type DataTableFilterItem } from '../../common/DataTable';
import { ROUTES } from '@/config/constants';
import { useAuth } from '@/context/AuthContext';
import { useRelatedModulesForEntity } from '@/config/relatedModules.config';
import { useContacts, useBulkDeleteContacts, useOrganizations } from '@/hooks/queries';
import { wasModified } from '../../common/Drawer/RecordAuditFooter';
import { formatDateTime } from '@/utils/date';
import { formatPhoneDisplay } from '@/utils/phone';
import type { ExtendedOrganization } from '@/types/organization.types';
import type { Contact } from '@/types/contact.types';
import type { ContactFilterTab } from './types';
import { ContactDetailDrawer } from '../ContactDetailDrawer';


/** Stable empty list while the first page loads (keeps memoized filters from recomputing). */
const NO_RECORDS: Contact[] = [];
const NO_ORGANIZATIONS: ExtendedOrganization[] = [];
const plainCellSx = { fontSize: '0.78rem', color: 'var(--crm-slate-700)' } as const;
export function ContactsMasterView() {
    const router = useRouter();
    const { user } = useAuth();
    const currentUsername = user?.username || '';

    const { data: allContacts = NO_RECORDS, refetch } = useContacts();
    const bulkDeleteMutation = useBulkDeleteContacts();
    const [activeTab, setActiveTab] = useState<ContactFilterTab>('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [page, setPage] = useState(0);
    const [rowsPerPage, setRowsPerPage] = useState(10);
    const [sortField, setSortField] = useState<string>('createdAt');
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
    const tableFilter = useTableFilter<Contact>({
        module: 'contacts',
        rows: allContacts,
        onSortChange: (s) => {
            setSortField(s.field);
            setSortOrder(s.order);
        },
        onChange: () => setPage(0),
    });
    /** Records left by the Filter dialog: tabs, counts, search and bulk actions work on these. */
    const contacts = tableFilter.filteredRows;
    // Tracked by id so the drawer always shows the cached copy and closes if the contact is deleted.
    const [drawerContactId, setDrawerContactId] = useState<string | null>(null);

    // Location column: the contact's organization's billing city and state.
    const { data: organizations = NO_ORGANIZATIONS } = useOrganizations();
    const locationOf = useMemo(() => {
        const byId = new Map(organizations.map((o) => [o.id, o]));
        const byName = new Map(organizations.map((o) => [o.organizationName.trim().toLowerCase(), o]));
        return (c: Contact) => {
            const org = (c.organizationId && byId.get(c.organizationId)) || byName.get((c.organizationName || '').trim().toLowerCase());
            return org ? [org.billingCity, org.billingState].filter(Boolean).join(', ') : '';
        };
    }, [organizations]);
    const selectedDrawerContact = useMemo(
        () => (drawerContactId ? contacts.find((c) => c.id === drawerContactId) ?? null : null),
        [contacts, drawerContactId]
    );
    const [activeRelatedModule, setActiveRelatedModule] = useState<string | null>(null);
    const [secondaryDrawerEntity, setSecondaryDrawerEntity] = useState<SecondaryDrawerEntity | null>(null);
    const [isLeftSidebarCollapsed, setIsLeftSidebarCollapsed] = useState<boolean>(false);
    const [toast, setToast] = useState<{
        open: boolean;
        message: string;
        severity: 'success' | 'error' | 'info' | 'warning';
    }>({
        open: false,
        message: '',
        severity: 'success',
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
    const filteredContacts = useMemo(() => {
        let result = contacts;

        if (activeTab === 'primary') {
            result = result.filter((c) => c.isPrimaryContact);
        } else if (activeTab === 'my_contacts') {
            result = currentUsername ? result.filter((c) => c.assignedTo === currentUsername) : [];
        } else if (activeTab === 'recently_added') {
            const oneWeekAgo = new Date().getTime() - 7 * 86400000;
            result = result.filter((c) => new Date(c.createdAt).getTime() >= oneWeekAgo);
        }

        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase().trim();
            result = result.filter((c) => {
                const name = c.name?.toLowerCase() || '';
                const org = c.organizationName?.toLowerCase() || '';
                const mobile = c.mobile || '';
                const email = c.emailAddresses?.[0]?.email?.toLowerCase() || '';
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
                    valA = a.emailAddresses?.[0]?.email ?? '';
                    valB = b.emailAddresses?.[0]?.email ?? '';
                }
                valA = valA.toLowerCase();
                valB = valB.toLowerCase();
                if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
                if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
                return 0;
            });
        }

        return result;
    }, [contacts, activeTab, searchQuery, sortField, sortOrder, currentUsername]);

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

    // ── Declarative Column Definitions ──────────────────────────────────────
    const columns: DataTableColumn<Contact>[] = useMemo(
        () => [
            {
                // Not one of the basic columns; switch it on from Modify Columns.
                ...documentNumberColumn<Contact>({
                    id: 'contactCode',
                    label: 'CONTACT NO.',
                    getNumber: (c) => c.contactCode,
                    getHref: (c) => ROUTES.CONTACT_DETAIL(c.id),
                    onOpen: (c) => setDrawerContactId(c.id),
                }),
                defaultHidden: true,
            },
            {
                id: 'name',
                label: 'NAME',
                sortable: true,
                minWidth: 200,
                render: (c) => (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <PersonOutlinedIcon sx={{ fontSize: 16, color: 'var(--crm-text-blue-600)' }} />
                        <RecordLink
                            href={ROUTES.CONTACT_DETAIL(c.id)}
                            onOpen={() => setDrawerContactId(c.id)}
                            sx={{
                                fontWeight: 700,
                                color: 'var(--crm-text-blue-700)',
                                fontSize: '0.82rem',
                                cursor: 'pointer',
                                '&:hover': { textDecoration: 'underline' },
                            }}
                        >
                            {c.name}
                        </RecordLink>
                        {c.isPrimaryContact && (
                            <Chip
                                label="Primary"
                                size="small"
                                sx={{
                                    height: 18,
                                    fontSize: '0.64rem',
                                    fontWeight: 700,
                                    backgroundColor: 'var(--mui-palette-primary-soft)',
                                    color: 'var(--crm-text-blue-700)',
                                    border: '1px solid var(--mui-palette-primary-softBorder)',
                                }}
                            />
                        )}
                    </Box>
                ),
            },
            {
                id: 'designation',
                label: 'JOB TITLE',
                sortable: true,
                minWidth: 150,
                render: (c) => <Typography sx={plainCellSx}>{c.designation || '-'}</Typography>,
            },
            {
                id: 'organizationName',
                label: 'ORGANIZATION NAME',
                sortable: true,
                minWidth: 180,
                render: (c) => (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.8 }}>
                        <ApartmentIcon sx={{ fontSize: 14, color: 'var(--mui-palette-text-secondary)' }} />
                        <Typography sx={{ fontSize: '0.8rem', color: 'var(--crm-slate-700)', fontWeight: 500 }}>
                            {c.organizationName || '-'}
                        </Typography>
                    </Box>
                ),
            },
            {
                id: 'mobile',
                label: 'MOBILE',
                sortable: true,
                minWidth: 140,
                render: (c) => (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.6 }}>
                        <PhoneOutlinedIcon sx={{ fontSize: 14, color: 'var(--mui-palette-text-muted)' }} />
                        <Typography sx={plainCellSx}>{c.mobile ? formatPhoneDisplay(c.mobile) || c.mobile : '-'}</Typography>
                    </Box>
                ),
            },
            {
                id: 'officePhone',
                label: 'OFFICE PHONE',
                sortable: true,
                minWidth: 140,
                render: (c) => (
                    <Typography sx={plainCellSx}>{c.officePhone ? formatPhoneDisplay(c.officePhone) || c.officePhone : '-'}</Typography>
                ),
            },
            {
                id: 'email',
                fieldKey: 'emailAddresses',
                label: 'EMAIL',
                sortable: false,
                minWidth: 180,
                render: (c) => {
                    const email = (c.emailAddresses?.find((e) => e.isPrimary) ?? c.emailAddresses?.[0])?.email;
                    return (
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.6 }}>
                            <EmailOutlinedIcon sx={{ fontSize: 14, color: 'var(--mui-palette-text-muted)' }} />
                            <Typography sx={plainCellSx}>{email || '-'}</Typography>
                        </Box>
                    );
                },
            },
            {
                // Derived: the linked organization's billing city and state (contacts have no address of their own).
                id: 'location',
                label: 'LOCATION',
                sortable: false,
                minWidth: 150,
                render: (c) => <Typography sx={plainCellSx}>{locationOf(c) || '-'}</Typography>,
            },
            {
                id: 'updatedAt',
                label: 'DATE MODIFIED',
                sortable: true,
                minWidth: 170,
                render: (c) =>
                    wasModified(c) ? (
                        <Typography sx={plainCellSx}>{formatDateTime(c.updatedAt) || '-'}</Typography>
                    ) : (
                        <Typography sx={{ ...plainCellSx, color: 'var(--mui-palette-text-muted)' }}>- - -</Typography>
                    ),
            },
            {
                id: 'createdAt',
                label: 'DATE CREATED',
                sortable: true,
                minWidth: 170,
                render: (c) => <Typography sx={plainCellSx}>{formatDateTime(c.createdAt) || '-'}</Typography>,
            },
        ],
        [locationOf]
    );

    const relatedModules = useRelatedModulesForEntity('contact', selectedDrawerContact, setActiveRelatedModule);

    // Falls back to the first module until the user explicitly picks one.
    const effectiveRelatedModule = activeRelatedModule ?? relatedModules[0]?.id ?? null;
    const activeModuleMeta = relatedModules.find((m) => m.id === effectiveRelatedModule);

    // Dismisses the three-panel view and returns to the clean master table.
    const closeThreePanelView = useCallback(() => {
        setSecondaryDrawerEntity(null);
        setDrawerContactId(null);
        setActiveRelatedModule(null);
    }, []);

    return (
        <CommonMasterView<Contact, ContactFilterTab>
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
            relatedSidebar={
                <RelatedModulesSidebar
                    open={Boolean(selectedDrawerContact)}
                    modules={relatedModules}
                    activeModuleId={effectiveRelatedModule ?? undefined}
                    onModuleSelect={(moduleId) => setActiveRelatedModule(moduleId)}
                    collapsed={isLeftSidebarCollapsed}
                    onToggleCollapse={setIsLeftSidebarCollapsed}
                />
            }
            relatedRecordsTable={
                <RelatedRecordsTableView
                    open={Boolean(selectedDrawerContact && effectiveRelatedModule)}
                    moduleId={effectiveRelatedModule || ''}
                    moduleTitle={activeModuleMeta?.label || 'Related Records'}
                    parentRecordId={selectedDrawerContact?.id}
                    parentEntityTitle={selectedDrawerContact?.name || ''}
                    entityData={selectedDrawerContact}
                    entityType="contact"
                    leftOffset={isLeftSidebarCollapsed ? 72 : 260}
                    rightOffset={580}
                    onClose={closeThreePanelView}
                    onRowClick={(row, modId) => setSecondaryDrawerEntity({ type: modId, data: row })}
                />
            }
            drawer={
                <ContactDetailDrawer
                    contact={selectedDrawerContact}
                    open={Boolean(selectedDrawerContact)}
                    onClose={closeThreePanelView}
                />
            }
            secondaryDrawer={
                secondaryDrawerEntity ? (
                    <RelatedSecondaryDrawer
                        entity={secondaryDrawerEntity}
                        moduleLabel={activeModuleMeta?.label}
                        parentTitle={selectedDrawerContact?.name}
                        onClose={() => setSecondaryDrawerEntity(null)}
                    />
                ) : null
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
