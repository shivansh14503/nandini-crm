'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { CommonMasterView } from '../common/CommonMasterView';
import { AppToast } from '../common/AppToast';
import { ROUTES } from '../../config/constants';
import type { Opportunity } from '../../types/opportunity.types';
import { opportunityService } from '../../services/opportunity.service';
import {
    OpportunitiesFilterPills,
    OpportunitiesTableToolbar,
    OpportunitiesTable,
    OpportunitiesPagination,
    type OpportunityFilterTab,
    type OpportunitySortField,
} from './master';
import { OpportunityDetailDrawer } from './OpportunityDetailDrawer';

export function OpportunitiesMasterView() {
    const router = useRouter();

    const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
    const [activeTab, setActiveTab] = useState<OpportunityFilterTab>('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [page, setPage] = useState(0);
    const [rowsPerPage, setRowsPerPage] = useState(10);
    const [sortField, setSortField] = useState<OpportunitySortField>('createdAt');
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
    const [selectedDrawerOpp, setSelectedDrawerOpp] = useState<Opportunity | null>(null);
    const [toast, setToast] = useState<{
        open: boolean;
        message: string;
        severity: 'success' | 'error' | 'info' | 'warning';
    }>({
        open: false,
        message: '',
        severity: 'success',
    });

    // ── Load Opportunities from service ───────────────────────────────────────
    const loadOpportunities = useCallback(() => {
        const data = opportunityService.getAllOpportunities();
        setOpportunities(data);
    }, []);

    useEffect(() => {
        loadOpportunities();
    }, [loadOpportunities]);

    // ── Compute Tab Counts ────────────────────────────────────────────────────
    const counts = useMemo(() => {
        return {
            all: opportunities.length,
            open: opportunities.filter(
                (o) => !['Closed Won', 'Closed Lost'].includes(o.salesStage)
            ).length,
            closingSoon: opportunities.filter((o) =>
                ['Proposal/Price Quote', 'Negotiation/Review'].includes(o.salesStage)
            ).length,
            won: opportunities.filter((o) => o.salesStage === 'Closed Won').length,
            highValue: opportunities.filter((o) => (o.grandTotal || 0) >= 100000).length,
            myDeals: opportunities.filter((o) =>
                (o.assignedTo || '').includes('mittal.sharma')
            ).length,
        };
    }, [opportunities]);

    // ── Filter Logic ──────────────────────────────────────────────────────────
    const filteredOpportunities = useMemo(() => {
        return opportunities.filter((opp) => {
            // Filter Tab condition
            if (activeTab === 'open' && ['Closed Won', 'Closed Lost'].includes(opp.salesStage)) {
                return false;
            }
            if (
                activeTab === 'closing_soon' &&
                !['Proposal/Price Quote', 'Negotiation/Review'].includes(opp.salesStage)
            ) {
                return false;
            }
            if (activeTab === 'won' && opp.salesStage !== 'Closed Won') {
                return false;
            }
            if (activeTab === 'high_value' && (opp.grandTotal || 0) < 100000) {
                return false;
            }
            if (activeTab === 'my_deals' && !(opp.assignedTo || '').includes('mittal.sharma')) {
                return false;
            }

            // Search query condition
            if (searchQuery.trim()) {
                const q = searchQuery.toLowerCase().trim();
                const inOrg = opp.organizationName.toLowerCase().includes(q);
                const inCode = opp.opportunityCode.toLowerCase().includes(q);
                const inContact = opp.contactName.toLowerCase().includes(q);
                const inPhone = opp.contactNumber.includes(q);
                const inEmail = (opp.emailAddress || '').toLowerCase().includes(q);
                const inStage = opp.salesStage.toLowerCase().includes(q);
                const inType = opp.type.toLowerCase().includes(q);
                const inSource = opp.leadSource.toLowerCase().includes(q);
                const inAssigned = opp.assignedTo.toLowerCase().includes(q);
                const inProduct = (opp.productCategory || []).some((p) =>
                    p.toLowerCase().includes(q)
                );

                return (
                    inOrg ||
                    inCode ||
                    inContact ||
                    inPhone ||
                    inEmail ||
                    inStage ||
                    inType ||
                    inSource ||
                    inAssigned ||
                    inProduct
                );
            }

            return true;
        });
    }, [opportunities, activeTab, searchQuery]);

    // ── Sort Logic ────────────────────────────────────────────────────────────
    const sortedOpportunities = useMemo(() => {
        return [...filteredOpportunities].sort((a, b) => {
            if (sortField === 'grandTotal') {
                const valA = a.grandTotal || 0;
                const valB = b.grandTotal || 0;
                return sortOrder === 'asc' ? valA - valB : valB - valA;
            }

            const valA = ((a as Record<string, any>)[sortField] || '').toString().toLowerCase();
            const valB = ((b as Record<string, any>)[sortField] || '').toString().toLowerCase();
            if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
            if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
            return 0;
        });
    }, [filteredOpportunities, sortField, sortOrder]);

    // ── Paginated Opportunities ───────────────────────────────────────────────
    const paginatedOpportunities = useMemo(() => {
        const start = page * rowsPerPage;
        return sortedOpportunities.slice(start, start + rowsPerPage);
    }, [sortedOpportunities, page, rowsPerPage]);

    // ── Handlers ──────────────────────────────────────────────────────────────
    const handleSort = (field: OpportunitySortField) => {
        if (sortField === field) {
            setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
        } else {
            setSortField(field);
            setSortOrder('asc');
        }
    };

    const handleSelectRow = (id: string) => {
        setSelectedIds((prev) =>
            prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
        );
    };

    const handleSelectAll = (checked: boolean) => {
        if (checked) {
            setSelectedIds(paginatedOpportunities.map((o) => o.id));
        } else {
            setSelectedIds([]);
        }
    };

    const handleView = (opp: Opportunity) => {
        setSelectedDrawerOpp(opp);
    };

    const handleEdit = (id: string) => {
        router.push(ROUTES.OPPORTUNITY_EDIT(id));
    };

    const handleDelete = async (id: string) => {
        if (confirm('Are you sure you want to delete this opportunity?')) {
            try {
                await opportunityService.deleteOpportunity(id);
                loadOpportunities();
                if (selectedDrawerOpp?.id === id) {
                    setSelectedDrawerOpp(null);
                }
                setToast({
                    open: true,
                    message: 'Opportunity deleted successfully.',
                    severity: 'success',
                });
            } catch (err) {
                setToast({
                    open: true,
                    message: 'Failed to delete opportunity.',
                    severity: 'error',
                });
            }
        }
    };

    const handleBulkDelete = async () => {
        if (
            confirm(
                `Are you sure you want to delete ${selectedIds.length} selected opportunities?`
            )
        ) {
            try {
                await opportunityService.bulkDeleteOpportunities(selectedIds);
                setSelectedIds([]);
                loadOpportunities();
                setToast({
                    open: true,
                    message: `${selectedIds.length} opportunities deleted successfully.`,
                    severity: 'success',
                });
            } catch (err) {
                setToast({
                    open: true,
                    message: 'Failed to bulk delete opportunities.',
                    severity: 'error',
                });
            }
        }
    };

    return (
        <CommonMasterView
            filters={
                <OpportunitiesFilterPills
                    activeTab={activeTab}
                    onTabChange={(tab) => {
                        setActiveTab(tab);
                        setPage(0);
                    }}
                    counts={counts}
                />
            }
            toolbar={
                <OpportunitiesTableToolbar
                    searchQuery={searchQuery}
                    onSearchChange={(q) => {
                        setSearchQuery(q);
                        setPage(0);
                    }}
                    onNewOpportunity={() => router.push(ROUTES.OPPORTUNITY_NEW)}
                    selectedCount={selectedIds.length}
                    onBulkDelete={handleBulkDelete}
                    onRefresh={() => {
                        loadOpportunities();
                        setToast({ open: true, message: 'Opportunities refreshed.', severity: 'info' });
                    }}
                />
            }
            table={
                <OpportunitiesTable
                    opportunities={paginatedOpportunities}
                    selectedIds={selectedIds}
                    sortField={sortField}
                    sortOrder={sortOrder}
                    onSort={(f) => handleSort(f as OpportunitySortField)}
                    onSelectOne={(id) => handleSelectRow(id)}
                    onSelectAll={handleSelectAll}
                    onViewOpportunity={(id) => {
                        const found = opportunities.find((o) => o.id === id);
                        if (found) setSelectedDrawerOpp(found);
                    }}
                    onEditOpportunity={handleEdit}
                    onNewOpportunity={() => router.push(ROUTES.OPPORTUNITY_NEW)}
                    onRowClick={(opp) => setSelectedDrawerOpp(opp)}
                    activeOpportunityId={selectedDrawerOpp?.id}
                />
            }
            pagination={
                sortedOpportunities.length > 0 ? (
                    <OpportunitiesPagination
                        page={page}
                        rowsPerPage={rowsPerPage}
                        totalCount={sortedOpportunities.length}
                        onPageChange={setPage}
                        onRowsPerPageChange={(r) => {
                            setRowsPerPage(r);
                            setPage(0);
                        }}
                    />
                ) : null
            }
            drawer={
                <OpportunityDetailDrawer
                    opportunity={selectedDrawerOpp}
                    open={Boolean(selectedDrawerOpp)}
                    onClose={() => setSelectedDrawerOpp(null)}
                    onEdit={handleEdit}
                />
            }
            isDrawerOpen={Boolean(selectedDrawerOpp)}
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
