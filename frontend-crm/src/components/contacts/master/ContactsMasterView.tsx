'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Box, Paper } from '@mui/material';
import { AppBreadcrumbs } from '../../common/AppBreadcrumbs';
import { EnterpriseFooter } from '../../common/EnterpriseFooter';
import { ROUTES } from '../../../config/constants';
import type { Contact } from '../../../types/contact.types';
import { ContactsFilterPills } from './ContactsFilterPills';
import { ContactsTableToolbar } from './ContactsTableToolbar';
import { ContactsTable } from './ContactsTable';
import { ContactsPagination } from './ContactsPagination';
import type { ContactFilterTab } from './types';

const CONTACTS_STORAGE_KEY = 'nandini_crm_contacts_data_v1';

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

    // ── Load Contacts from localStorage / Seed default if empty ─────────────
    const loadContacts = useCallback(() => {
        if (typeof window === 'undefined') return;
        try {
            const raw = localStorage.getItem(CONTACTS_STORAGE_KEY);
            if (raw) {
                const parsed = JSON.parse(raw);
                if (Array.isArray(parsed) && parsed.length > 0) {
                    setContacts(parsed);
                    return;
                }
            }

            // Seed sample enterprise contacts for initial view
            const sampleContacts: Contact[] = [
                {
                    id: 'con-1',
                    contactCode: 'CON-1001',
                    name: 'Rajesh Sharma',
                    organizationName: 'Tata Consultancy Services',
                    mobile: '+91 98112 34567',
                    officePhone: '011-45678901',
                    phone3: '',
                    phone4: '',
                    phone5: '',
                    emailAddresses: [
                        {
                            id: 'em-1',
                            email: 'rajesh.sharma@tcs.com',
                            isPrimary: true,
                            isOptedOut: false,
                            isInvalidBounce: false,
                        },
                    ],
                    assignedTo: 'mittal.sharma',
                    isPrimaryContact: true,
                    designation: 'Managing Director / MD',
                    department: 'Executive Management',
                    location: 'New Delhi HQ',
                    leftJob: 'No',
                    communicationType: ['Call', 'Email'],
                    doNotCall: false,
                    description: 'Key decision maker for enterprise cloud migration contracts.',
                    createdAt: new Date(Date.now() - 86400000 * 2).toISOString(),
                    updatedAt: new Date().toISOString(),
                    createdBy: 'mittal.sharma',
                },
                {
                    id: 'con-2',
                    contactCode: 'CON-1002',
                    name: 'Ananya Deshmukh',
                    organizationName: 'Infosys Limited',
                    mobile: '+91 97234 56789',
                    officePhone: '080-28520261',
                    phone3: '',
                    phone4: '',
                    phone5: '',
                    emailAddresses: [
                        {
                            id: 'em-2',
                            email: 'ananya.d@infosys.com',
                            isPrimary: true,
                            isOptedOut: false,
                            isInvalidBounce: false,
                        },
                    ],
                    assignedTo: 'mittal.sharma',
                    isPrimaryContact: false,
                    designation: 'Purchase Head / Manager',
                    department: 'Procurement & Purchase',
                    location: 'Bangalore Campus',
                    leftJob: 'No',
                    communicationType: ['Email', 'WhatsApp'],
                    doNotCall: false,
                    description: 'Handles software licensing procurement.',
                    createdAt: new Date(Date.now() - 86400000 * 5).toISOString(),
                    updatedAt: new Date().toISOString(),
                    createdBy: 'mittal.sharma',
                },
                {
                    id: 'con-3',
                    contactCode: 'CON-1003',
                    name: 'Vikram Mehta',
                    organizationName: 'Reliance Industries Ltd',
                    mobile: '+91 99887 76655',
                    officePhone: '022-35555000',
                    phone3: '',
                    phone4: '',
                    phone5: '',
                    emailAddresses: [
                        {
                            id: 'em-3',
                            email: 'vikram.mehta@ril.com',
                            isPrimary: true,
                            isOptedOut: false,
                            isInvalidBounce: false,
                        },
                    ],
                    assignedTo: 'rahul.verma',
                    isPrimaryContact: true,
                    designation: 'Chief Technology Officer (CTO)',
                    department: 'Information Technology (IT)',
                    location: 'Mumbai Nariman Point',
                    leftJob: 'No',
                    communicationType: ['Call', 'Meeting'],
                    doNotCall: false,
                    description: 'Digital transformation committee head.',
                    createdAt: new Date(Date.now() - 86400000 * 10).toISOString(),
                    updatedAt: new Date().toISOString(),
                    createdBy: 'rahul.verma',
                },
            ];

            localStorage.setItem(CONTACTS_STORAGE_KEY, JSON.stringify(sampleContacts));
            setContacts(sampleContacts);
        } catch {
            setContacts([]);
        }
    }, []);

    useEffect(() => {
        loadContacts();
    }, [loadContacts]);

    // ── Counts for filter tabs ───────────────────────────────────────────────
    const counts = useMemo(() => {
        const primary = contacts.filter((c) => c.isPrimaryContact).length;
        const myContacts = contacts.filter((c) => c.assignedTo === 'mittal.sharma').length;
        const oneWeekAgo = Date.now() - 7 * 86400000;
        const recentlyAdded = contacts.filter((c) => new Date(c.createdAt).getTime() >= oneWeekAgo).length;

        return {
            all: contacts.length,
            primary,
            myContacts,
            recentlyAdded,
        };
    }, [contacts]);

    // ── Filter & Search Logic ────────────────────────────────────────────────
    const filteredContacts = useMemo(() => {
        let result = contacts;

        // Apply Tab Filter
        if (activeTab === 'primary') {
            result = result.filter((c) => c.isPrimaryContact);
        } else if (activeTab === 'my_contacts') {
            result = result.filter((c) => c.assignedTo === 'mittal.sharma');
        } else if (activeTab === 'recently_added') {
            const oneWeekAgo = Date.now() - 7 * 86400000;
            result = result.filter((c) => new Date(c.createdAt).getTime() >= oneWeekAgo);
        }

        // Apply Search Query
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

        // Apply Sorting
        if (sortField) {
            result = [...result].sort((a, b) => {
                let valA: any = (a as any)[sortField] ?? '';
                let valB: any = (b as any)[sortField] ?? '';
                if (sortField === 'email') {
                    valA = a.emailAddresses?.[0]?.email ?? '';
                    valB = b.emailAddresses?.[0]?.email ?? '';
                }
                if (typeof valA === 'string') valA = valA.toLowerCase();
                if (typeof valB === 'string') valB = valB.toLowerCase();
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

    // ── Paginated Contacts ───────────────────────────────────────────────────
    const paginatedContacts = useMemo(() => {
        const start = page * rowsPerPage;
        return filteredContacts.slice(start, start + rowsPerPage);
    }, [filteredContacts, page, rowsPerPage]);

    // ── Selection Handlers ───────────────────────────────────────────────────
    const handleSelectAll = (checked: boolean) => {
        if (checked) {
            setSelectedIds(paginatedContacts.map((c) => c.id));
        } else {
            setSelectedIds([]);
        }
    };

    const handleSelectOne = (id: string, checked: boolean) => {
        if (checked) {
            setSelectedIds((prev) => [...prev, id]);
        } else {
            setSelectedIds((prev) => prev.filter((item) => item !== id));
        }
    };

    const handleBulkDelete = () => {
        if (!window.confirm(`Delete ${selectedIds.length} selected contact(s)?`)) return;
        const next = contacts.filter((c) => !selectedIds.includes(c.id));
        localStorage.setItem(CONTACTS_STORAGE_KEY, JSON.stringify(next));
        setContacts(next);
        setSelectedIds([]);
    };

    return (
        <Box
            sx={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                backgroundColor: '#f8fafc',
                overflow: 'hidden',
            }}
        >
            {/* ── Top Header with Permanent Breadcrumbs ────────────────────── */}
            <Box
                sx={{
                    px: { xs: 2, md: 3 },
                    pt: 2,
                    pb: 1.5,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: 1.5,
                }}
            >
                {/* Permanent Route-Aware Breadcrumbs */}
                <AppBreadcrumbs />

                {/* Filter Pills */}
                <ContactsFilterPills
                    activeTab={activeTab}
                    onTabChange={(tab) => {
                        setActiveTab(tab);
                        setPage(0);
                    }}
                    counts={counts}
                />
            </Box>

            {/* ── Main Table Card filling remaining space ─────────────────── */}
            <Box
                sx={{
                    px: { xs: 2, md: 3 },
                    pb: 1.5,
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    minHeight: 0,
                }}
            >
                <Paper
                    elevation={0}
                    sx={{
                        border: '1px solid #e2e8f0',
                        borderRadius: '10px',
                        backgroundColor: '#ffffff',
                        display: 'flex',
                        flexDirection: 'column',
                        flex: 1,
                        overflow: 'hidden',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                    }}
                >
                    {/* Toolbar */}
                    <ContactsTableToolbar
                        searchQuery={searchQuery}
                        onSearchChange={(v) => {
                            setSearchQuery(v);
                            setPage(0);
                        }}
                        onNewContact={() => router.push(ROUTES.CONTACT_NEW)}
                        onRefresh={loadContacts}
                        selectedCount={selectedIds.length}
                        onBulkDelete={handleBulkDelete}
                    />

                    {/* Table View */}
                    <ContactsTable
                        contacts={paginatedContacts}
                        selectedIds={selectedIds}
                        onSelectAll={handleSelectAll}
                        onSelectOne={handleSelectOne}
                        onViewContact={(id) => router.push(ROUTES.CONTACT_DETAIL(id))}
                        onEditContact={(id) => router.push(ROUTES.CONTACT_EDIT(id))}
                        onNewContact={() => router.push(ROUTES.CONTACT_NEW)}
                        sortField={sortField}
                        sortOrder={sortOrder}
                        onSort={handleSort}
                    />

                    {/* Pagination */}
                    {filteredContacts.length > 0 && (
                        <ContactsPagination
                            page={page}
                            rowsPerPage={rowsPerPage}
                            totalCount={filteredContacts.length}
                            onPageChange={setPage}
                            onRowsPerPageChange={(size) => {
                                setRowsPerPage(size);
                                setPage(0);
                            }}
                        />
                    )}
                </Paper>
            </Box>

            {/* ── Enterprise Footer ────────────────────────────────────────── */}
            <EnterpriseFooter />
        </Box>
    );
}
