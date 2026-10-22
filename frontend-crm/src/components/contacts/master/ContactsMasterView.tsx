'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Box, Chip, Typography } from '@mui/material';
import PersonOutlinedIcon from '@mui/icons-material/PersonOutlined';
import StarBorderIcon from '@mui/icons-material/StarBorder';
import ScheduleIcon from '@mui/icons-material/Schedule';
import AccountCircleOutlinedIcon from '@mui/icons-material/AccountCircleOutlined';
import PhoneOutlinedIcon from '@mui/icons-material/PhoneOutlined';
import EmailOutlinedIcon from '@mui/icons-material/EmailOutlined';
import ApartmentIcon from '@mui/icons-material/Apartment';
import { CommonMasterView } from '../../common/CommonMasterView';
import { AppToast } from '../../common/AppToast';
import type { DataTableColumn, DataTableFilterItem } from '../../common/DataTable';
import { ROUTES } from '../../../config/constants';
import { contactService, subscribeCrmSync } from '@/services';
import type { Contact } from '../../../types/contact.types';
import type { ContactFilterTab } from './types';
import { ContactDetailDrawer } from '../ContactDetailDrawer';

export function ContactsMasterView() {
    const router = useRouter();

    const [contacts, setContacts] = useState<Contact[]>([]);
    const [activeTab, setActiveTab] = useState<ContactFilterTab>('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [page, setPage] = useState(0);
    const [rowsPerPage, setRowsPerPage] = useState(10);
    const [sortField, setSortField] = useState<string>('name');
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
    const [selectedDrawerContact, setSelectedDrawerContact] = useState<Contact | null>(null);
    const [toast, setToast] = useState<{
        open: boolean;
        message: string;
        severity: 'success' | 'error' | 'info' | 'warning';
    }>({
        open: false,
        message: '',
        severity: 'success',
    });

    // ── Load Contacts via Service Layer ─────────────────────────────────────
    const loadContacts = useCallback(() => {
        const data = contactService.getAllSync();
        setContacts(data);
        setSelectedDrawerContact((prev) => {
            if (!prev) return null;
            return data.find((c) => c.id === prev.id) || null;
        });
    }, []);

    useEffect(() => {
        let active = true;
        contactService
            .getAll()
            .then((data) => {
                if (active) {
                    setContacts(data);
                    setSelectedDrawerContact((prev) => {
                        if (!prev) return null;
                        return data.find((c) => c.id === prev.id) || null;
                    });
                }
            })
            .catch(() => {});
        return () => {
            active = false;
        };
    }, []);

    useEffect(() => {
        const handleFocus = () => {
            loadContacts();
        };
        const handleVisibility = () => {
            if (document.visibilityState === 'visible') {
                loadContacts();
            }
        };

        window.addEventListener('focus', handleFocus);
        document.addEventListener('visibilitychange', handleVisibility);
        const unsubscribe = subscribeCrmSync(loadContacts);

        return () => {
            window.removeEventListener('focus', handleFocus);
            document.removeEventListener('visibilitychange', handleVisibility);
            unsubscribe();
        };
    }, [loadContacts]);

    // ── Filter Tabs Configuration ────────────────────────────────────────────
    const filterItems: DataTableFilterItem<ContactFilterTab>[] = useMemo(() => {
        const primary = contacts.filter((c) => c.isPrimaryContact).length;
        const myContacts = contacts.filter((c) => c.assignedTo === 'mittal.sharma').length;
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
    }, [contacts]);

    // ── Filter & Search Logic ────────────────────────────────────────────────
    const filteredContacts = useMemo(() => {
        let result = contacts;

        if (activeTab === 'primary') {
            result = result.filter((c) => c.isPrimaryContact);
        } else if (activeTab === 'my_contacts') {
            result = result.filter((c) => c.assignedTo === 'mittal.sharma');
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
    }, [contacts, activeTab, searchQuery, sortField, sortOrder]);

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
        await contactService.deleteBulk(selectedIds);
        loadContacts();
        setSelectedIds([]);
        setToast({
            open: true,
            message: `${count} contact(s) deleted successfully.`,
            severity: 'success',
        });
    };

    // ── Declarative Column Definitions ──────────────────────────────────────
    const columns: DataTableColumn<Contact>[] = useMemo(
        () => [
            {
                id: 'name',
                label: 'NAME',
                sortable: true,
                minWidth: 200,
                render: (c) => (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <PersonOutlinedIcon sx={{ fontSize: 16, color: '#2563eb' }} />
                        <Typography
                            onClick={(e) => {
                                e.stopPropagation();
                                setSelectedDrawerContact(c);
                            }}
                            sx={{
                                fontWeight: 700,
                                color: '#1d4ed8',
                                fontSize: '0.82rem',
                                cursor: 'pointer',
                                '&:hover': { textDecoration: 'underline' },
                            }}
                        >
                            {c.name}
                        </Typography>
                        {c.isPrimaryContact && (
                            <Chip
                                label="Primary"
                                size="small"
                                sx={{
                                    height: 18,
                                    fontSize: '0.64rem',
                                    fontWeight: 700,
                                    backgroundColor: '#eff6ff',
                                    color: '#1d4ed8',
                                    border: '1px solid #bfdbfe',
                                }}
                            />
                        )}
                    </Box>
                ),
            },
            {
                id: 'organizationName',
                label: 'ORGANIZATION',
                sortable: true,
                minWidth: 180,
                render: (c) => (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.8 }}>
                        <ApartmentIcon sx={{ fontSize: 14, color: '#64748b' }} />
                        <Typography sx={{ fontSize: '0.8rem', color: '#334155', fontWeight: 500 }}>
                            {c.organizationName || '-'}
                        </Typography>
                    </Box>
                ),
            },
            {
                id: 'mobile',
                label: 'MOBILE / PHONE',
                sortable: true,
                minWidth: 150,
                render: (c) => (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.6 }}>
                        <PhoneOutlinedIcon sx={{ fontSize: 14, color: '#94a3b8' }} />
                        <Typography sx={{ fontSize: '0.8rem', color: '#475569' }}>
                            {c.mobile || c.officePhone || '-'}
                        </Typography>
                    </Box>
                ),
            },
            {
                id: 'email',
                label: 'EMAIL',
                sortable: true,
                minWidth: 180,
                render: (c) => (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.6 }}>
                        <EmailOutlinedIcon sx={{ fontSize: 14, color: '#94a3b8' }} />
                        <Typography sx={{ fontSize: '0.8rem', color: '#475569' }}>
                            {c.emailAddresses?.[0]?.email || '-'}
                        </Typography>
                    </Box>
                ),
            },
            {
                id: 'designation',
                label: 'DESIGNATION',
                sortable: true,
                minWidth: 160,
                render: (c) => (
                    <Typography sx={{ fontSize: '0.78rem', color: '#334155', fontWeight: 500 }}>
                        {c.designation || c.department || '-'}
                    </Typography>
                ),
            },
            {
                id: 'assignedTo',
                label: 'ASSIGNED TO',
                sortable: true,
                minWidth: 140,
                render: (c) => (
                    <Typography sx={{ fontSize: '0.78rem', color: '#64748b' }}>
                        {c.assignedTo || 'mittal.sharma'}
                    </Typography>
                ),
            },
        ],
        []
    );

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
            searchConfig={{
                searchQuery,
                onSearchChange: (v) => {
                    setSearchQuery(v);
                    setPage(0);
                },
                searchPlaceholder: 'Search by name, organization, phone, email...',
                searchWidth: { xs: '100%', sm: 300 },
                onNewClick: () => router.push(ROUTES.CONTACT_NEW),
                newButtonLabel: 'New Contact',
                onRefresh: () => {
                    loadContacts();
                    setToast({ open: true, message: 'Contacts refreshed.', severity: 'info' });
                },
                refreshTooltip: 'Refresh Contacts',
                selectedCount: selectedIds.length,
                onBulkDelete: handleBulkDelete,
            }}
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
            onEdit={(c) => router.push(ROUTES.CONTACT_EDIT(c.id))}
            onRowClick={(c) => setSelectedDrawerContact(c)}
            activeRowId={selectedDrawerContact?.id}
            viewTooltip="View Contact"
            editTooltip="Edit Contact"
            emptyTitle="No contacts recorded yet"
            emptyDescription="Create your first contact person and link them to an active organization account."
            emptyActionLabel="Create Contact"
            onEmptyAction={() => router.push(ROUTES.CONTACT_NEW)}
            emptyIcon={<PersonOutlinedIcon sx={{ fontSize: 48, color: '#cbd5e1' }} />}
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
                    onClose={() => setSelectedDrawerContact(null)}
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
        />
    );
}
