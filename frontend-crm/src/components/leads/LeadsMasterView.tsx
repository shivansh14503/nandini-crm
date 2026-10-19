'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { CommonMasterView } from '../common/CommonMasterView';
import { AppToast } from '../common/AppToast';
import { ROUTES } from '../../config/constants';
import type { Lead } from '../../types/lead.types';
import {
    getStoredLeads,
    deleteStoredLead,
    deleteMultipleStoredLeads,
} from '../../data/mockLeads';
import {
    LeadsFilterPills,
    LeadsTableToolbar,
    LeadsTable,
    LeadsPagination,
    type LeadFilterTab,
    type LeadSortField,
} from './master';
import { LeadDetailDrawer } from './LeadDetailDrawer';

export function LeadsMasterView() {
    const router = useRouter();

    const [leads, setLeads] = useState<Lead[]>([]);
    const [activeTab, setActiveTab] = useState<LeadFilterTab>('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [page, setPage] = useState(0);
    const [rowsPerPage, setRowsPerPage] = useState(10);
    const [sortField, setSortField] = useState<string>('name');
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
    const [selectedDrawerLead, setSelectedDrawerLead] = useState<Lead | null>(null);
    const [toast, setToast] = useState<{
        open: boolean;
        message: string;
        severity: 'success' | 'error' | 'info' | 'warning';
    }>({
        open: false,
        message: '',
        severity: 'success',
    });

    const todayStr = useMemo(() => new Date().toISOString().split('T')[0], []);

    // ── Load Leads from localStorage ──────────────────────────────────────────
    const loadLeads = useCallback(() => {
        setLeads(getStoredLeads());
    }, []);

    useEffect(() => {
        loadLeads();
    }, [loadLeads]);

    // ── Compute Tab Counts ────────────────────────────────────────────────────
    const counts = useMemo(() => {
        return {
            all: leads.length,
            hot: leads.filter((l) => l.leadType === 'Hot').length,
            newLeads: leads.filter((l) => l.status === 'New').length,
            followupToday: leads.filter((l) => l.nextFollowupDate === todayStr).length,
            myLeads: leads.filter((l) => (l.assignedTo || '').includes('mittal.sharma')).length,
        };
    }, [leads, todayStr]);

    // ── Filter Logic ──────────────────────────────────────────────────────────
    const filteredLeads = useMemo(() => {
        return leads.filter((lead) => {
            // Filter Tab condition
            if (activeTab === 'hot' && lead.leadType !== 'Hot') return false;
            if (activeTab === 'new' && lead.status !== 'New') return false;
            if (activeTab === 'followup_today' && lead.nextFollowupDate !== todayStr) return false;
            if (activeTab === 'my_leads' && !(lead.assignedTo || '').includes('mittal.sharma')) return false;

            // Search query condition
            if (searchQuery.trim()) {
                const q = searchQuery.toLowerCase().trim();
                const inName = lead.name.toLowerCase().includes(q);
                const inCode = lead.leadCode.toLowerCase().includes(q);
                const inOrg = (lead.organizationName || '').toLowerCase().includes(q);
                const inPhone = (lead.mobile || '').includes(q) || (lead.otherPhone || '').includes(q);
                const inEmail = (lead.emailAddresses || []).some((e) => e.email.toLowerCase().includes(q));
                const inProduct = (lead.productCategory || []).some((p) => p.toLowerCase().includes(q));
                const inStatus = lead.status.toLowerCase().includes(q);
                const inSource = lead.leadSource.toLowerCase().includes(q);
                const inAssigned = lead.assignedTo.toLowerCase().includes(q);

                return (
                    inName ||
                    inCode ||
                    inOrg ||
                    inPhone ||
                    inEmail ||
                    inProduct ||
                    inStatus ||
                    inSource ||
                    inAssigned
                );
            }

            return true;
        });
    }, [leads, activeTab, searchQuery, todayStr]);

    // ── Sort Logic ────────────────────────────────────────────────────────────
    const sortedLeads = useMemo(() => {
        return [...filteredLeads].sort((a, b) => {
            const valA = ((a as Record<string, any>)[sortField] || '').toString().toLowerCase();
            const valB = ((b as Record<string, any>)[sortField] || '').toString().toLowerCase();
            if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
            if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
            return 0;
        });
    }, [filteredLeads, sortField, sortOrder]);

    // ── Paginated Leads ───────────────────────────────────────────────────────
    const paginatedLeads = useMemo(() => {
        const start = page * rowsPerPage;
        return sortedLeads.slice(start, start + rowsPerPage);
    }, [sortedLeads, page, rowsPerPage]);

    // ── Selection Handlers ────────────────────────────────────────────────────
    const handleSelectAll = (checked: boolean) => {
        if (checked) {
            setSelectedIds(paginatedLeads.map((l) => l.id));
        } else {
            setSelectedIds([]);
        }
    };

    const handleSelectOne = (id: string, checked: boolean) => {
        setSelectedIds((prev) => (checked ? [...prev, id] : prev.filter((i) => i !== id)));
    };

    // ── Sort Handler ──────────────────────────────────────────────────────────
    const handleSort = (field: string) => {
        if (sortField === field) {
            setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
        } else {
            setSortField(field);
            setSortOrder('asc');
        }
    };

    // ── Bulk Delete Handler ───────────────────────────────────────────────────
    const handleBulkDelete = () => {
        if (selectedIds.length === 0) return;
        if (!confirm(`Are you sure you want to delete ${selectedIds.length} selected lead(s)?`)) return;

        deleteMultipleStoredLeads(selectedIds);
        setSelectedIds([]);
        loadLeads();
        setToast({
            open: true,
            message: `${selectedIds.length} lead(s) deleted successfully.`,
            severity: 'success',
        });
    };

    return (
        <CommonMasterView
            breadcrumbItems={[
                { label: 'Sales' },
                { label: 'Leads' },
            ]}
            filters={
                <LeadsFilterPills
                    activeTab={activeTab}
                    onTabChange={(tab) => {
                        setActiveTab(tab);
                        setPage(0);
                    }}
                    counts={counts}
                />
            }
            toolbar={
                <LeadsTableToolbar
                    searchQuery={searchQuery}
                    onSearchChange={(q) => {
                        setSearchQuery(q);
                        setPage(0);
                    }}
                    onNewLead={() => router.push(ROUTES.LEAD_NEW)}
                    onRefresh={() => {
                        loadLeads();
                        setToast({ open: true, message: 'Leads refreshed.', severity: 'info' });
                    }}
                    selectedCount={selectedIds.length}
                    onBulkDelete={handleBulkDelete}
                />
            }
            table={
                <LeadsTable
                    leads={paginatedLeads}
                    selectedIds={selectedIds}
                    onSelectAll={handleSelectAll}
                    onSelectOne={handleSelectOne}
                    onViewLead={(id) => {
                        const found = leads.find((l) => l.id === id);
                        if (found) setSelectedDrawerLead(found);
                    }}
                    onEditLead={(id) => router.push(ROUTES.LEAD_EDIT(id))}
                    onNewLead={() => router.push(ROUTES.LEAD_NEW)}
                    sortField={sortField}
                    sortOrder={sortOrder}
                    onSort={handleSort}
                    onRowClick={(lead) => setSelectedDrawerLead(lead)}
                    activeLeadId={selectedDrawerLead?.id}
                />
            }
            pagination={
                <LeadsPagination
                    page={page}
                    rowsPerPage={rowsPerPage}
                    totalCount={sortedLeads.length}
                    onPageChange={(newPage) => setPage(newPage)}
                    onRowsPerPageChange={(newRows) => {
                        setRowsPerPage(newRows);
                        setPage(0);
                    }}
                />
            }
            drawer={
                <LeadDetailDrawer
                    lead={selectedDrawerLead}
                    open={Boolean(selectedDrawerLead)}
                    onClose={() => setSelectedDrawerLead(null)}
                    onEdit={(id) => router.push(ROUTES.LEAD_EDIT(id))}
                />
            }
            isDrawerOpen={Boolean(selectedDrawerLead)}
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
