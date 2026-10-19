'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { CommonMasterView } from '../../common/CommonMasterView';
import { AppToast } from '../../common/AppToast';
import { ROUTES } from '../../../config/constants';
import type { Contact } from '../../../types/contact.types';
import { ContactsFilterPills } from './ContactsFilterPills';
import { ContactsTableToolbar } from './ContactsTableToolbar';
import { ContactsTable } from './ContactsTable';
import { ContactsPagination } from './ContactsPagination';
import type { ContactFilterTab } from './types';
import { ContactDetailDrawer } from '../ContactDetailDrawer';

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
        const count = selectedIds.length;
        const next = contacts.filter((c) => !selectedIds.includes(c.id));
        localStorage.setItem(CONTACTS_STORAGE_KEY, JSON.stringify(next));
        setContacts(next);
        setSelectedIds([]);
        setToast({
            open: true,
            message: `${count} contact(s) deleted successfully.`,
            severity: 'success',
        });
    };

    return (
        <CommonMasterView
            filters={
                <ContactsFilterPills
                    activeTab={activeTab}
                    onTabChange={(tab) => {
                        setActiveTab(tab);
                        setPage(0);
                    }}
                    counts={counts}
                />
            }
            toolbar={
                <ContactsTableToolbar
                    searchQuery={searchQuery}
                    onSearchChange={(v) => {
                        setSearchQuery(v);
                        setPage(0);
                    }}
                    onNewContact={() => router.push(ROUTES.CONTACT_NEW)}
                    onRefresh={() => {
                        loadContacts();
                        setToast({ open: true, message: 'Contacts refreshed.', severity: 'info' });
                    }}
                    selectedCount={selectedIds.length}
                    onBulkDelete={handleBulkDelete}
                />
            }
            table={
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
                    onRowClick={(contact) => setSelectedDrawerContact(contact)}
                    activeContactId={selectedDrawerContact?.id}
                />
            }
            pagination={
                filteredContacts.length > 0 ? (
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
                ) : null
            }
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
