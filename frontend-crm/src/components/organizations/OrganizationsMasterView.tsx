'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
    Box,
    Paper,
    Button,
    Menu,
    MenuItem,
    Snackbar,
    Alert,
} from '@mui/material';

// Icons
import AddIcon from '@mui/icons-material/Add';
import FilterListIcon from '@mui/icons-material/FilterList';
import ViewColumnIcon from '@mui/icons-material/ViewColumn';
import FileDownloadOutlinedIcon from '@mui/icons-material/FileDownloadOutlined';

import { ROUTES } from '../../config/constants';
import { AppBreadcrumbs } from '../common/AppBreadcrumbs';
import { AppToast } from '../common/AppToast';
import { EnterpriseFooter } from '../common/EnterpriseFooter';
import {
    getStoredOrganizations,
    saveStoredOrganizations,
    type ExtendedOrganization,
} from '../../data/mockOrganizations';
import { OrganizationDetailDrawer } from './OrganizationDetailDrawer';
import {
    OrganizationsFilterPills,
    OrganizationsTableToolbar,
    OrganizationsTable,
    OrganizationsPagination,
    type FilterTab,
    type SortField,
} from './master';

export function OrganizationsMasterView() {
    const router = useRouter();

    // ── State ─────────────────────────────────────────────────────────────────
    const [organizations, setOrganizations] = useState<ExtendedOrganization[]>([]);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set(['org-004']));
    const [activeTab, setActiveTab] = useState<FilterTab>('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [rowsPerPage, setRowsPerPage] = useState<number>(25);
    const [currentPage, setCurrentPage] = useState<number>(1);
    const [sortField, setSortField] = useState<SortField>('organizationName');
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

    // Detail View Side Drawer
    const [selectedDrawerOrg, setSelectedDrawerOrg] = useState<ExtendedOrganization | null>(null);
    const [toast, setToast] = useState<{ open: boolean; message: string; severity: 'success' | 'info' | 'error' }>({
        open: false,
        message: '',
        severity: 'success',
    });

    useEffect(() => {
        setOrganizations(getStoredOrganizations());
    }, []);

    // ── Filter & Search Logic ─────────────────────────────────────────────────
    const filteredOrganizations = useMemo(() => {
        return organizations.filter((org) => {
            if (activeTab === 'recent' && !org.isRecentlyViewed) return false;
            if (activeTab === 'my' && !org.isMyAccount) return false;
            if (activeTab === 'distributor' && !org.natureOfBusiness?.toLowerCase().includes('distributor')) return false;
            if (activeTab === 'enduser' && org.customerType !== 'End User') return false;

            if (searchQuery.trim()) {
                const q = searchQuery.toLowerCase().trim();
                return (
                    org.organizationName.toLowerCase().includes(q) ||
                    org.natureOfBusiness?.toLowerCase().includes(q) ||
                    org.customerType?.toLowerCase().includes(q) ||
                    org.billingCity?.toLowerCase().includes(q) ||
                    org.billingState?.toLowerCase().includes(q) ||
                    org.billingStreet?.toLowerCase().includes(q) ||
                    org.gstNumber?.toLowerCase().includes(q)
                );
            }
            return true;
        });
    }, [organizations, activeTab, searchQuery]);

    // ── Sort Logic ────────────────────────────────────────────────────────────
    const sortedOrganizations = useMemo(() => {
        return [...filteredOrganizations].sort((a, b) => {
            const valA = ((a as Record<string, any>)[sortField] || '').toString().toLowerCase();
            const valB = ((b as Record<string, any>)[sortField] || '').toString().toLowerCase();
            if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
            if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
            return 0;
        });
    }, [filteredOrganizations, sortField, sortOrder]);

    // ── Pagination Logic ──────────────────────────────────────────────────────
    const totalRecords = sortedOrganizations.length;
    const totalPages = Math.max(1, Math.ceil(totalRecords / rowsPerPage));
    const paginatedOrganizations = useMemo(() => {
        const start = (currentPage - 1) * rowsPerPage;
        return sortedOrganizations.slice(start, start + rowsPerPage);
    }, [sortedOrganizations, currentPage, rowsPerPage]);

    const handleSort = (field: SortField) => {
        if (sortField === field) {
            setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
        } else {
            setSortField(field);
            setSortOrder('asc');
        }
    };

    // ── Selection Logic ───────────────────────────────────────────────────────
    const isAllPageSelected = paginatedOrganizations.length > 0 && paginatedOrganizations.every((o) => selectedIds.has(o.id));
    const isSomePageSelected = paginatedOrganizations.some((o) => selectedIds.has(o.id)) && !isAllPageSelected;

    const toggleSelectRow = (id: string) => {
        const next = new Set(selectedIds);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        setSelectedIds(next);
    };

    const toggleSelectAll = () => {
        const next = new Set(selectedIds);
        if (isAllPageSelected) {
            paginatedOrganizations.forEach((o) => next.delete(o.id));
        } else {
            paginatedOrganizations.forEach((o) => next.add(o.id));
        }
        setSelectedIds(next);
    };

    // ── Bulk Actions ──────────────────────────────────────────────────────────
    const handleBulkAction = (action: 'active' | 'inactive' | 'delete' | 'export') => {
        if (selectedIds.size === 0) {
            setToast({ open: true, message: 'Please select records to perform bulk action.', severity: 'info' });
            return;
        }

        if (action === 'delete') {
            const nextOrgs = organizations.filter((o) => !selectedIds.has(o.id));
            setOrganizations(nextOrgs);
            saveStoredOrganizations(nextOrgs);
            setSelectedIds(new Set());
            setToast({ open: true, message: `${selectedIds.size} organizations deleted.`, severity: 'success' });
        } else if (action === 'active' || action === 'inactive') {
            const status = action === 'active' ? 'Active' : 'Inactive';
            const nextOrgs = organizations.map((o) => (selectedIds.has(o.id) ? { ...o, accountStatus: status as any } : o));
            setOrganizations(nextOrgs);
            saveStoredOrganizations(nextOrgs);
            setToast({ open: true, message: `${selectedIds.size} organizations updated to ${status}.`, severity: 'success' });
        } else if (action === 'export') {
            handleExport(true);
        }
    };

    // ── Export CSV ────────────────────────────────────────────────────────────
    const handleExport = (onlySelected = false) => {
        const recordsToExport = onlySelected
            ? organizations.filter((o) => selectedIds.has(o.id))
            : filteredOrganizations;

        if (recordsToExport.length === 0) {
            setToast({ open: true, message: 'No organizations to export.', severity: 'info' });
            return;
        }

        const headers = ['Account Code', 'Organization Name', 'Nature of Business', 'Customer Type', 'Status', 'Billing Street', 'City', 'State', 'GST Number'];
        const rows = recordsToExport.map((o) => [
            o.accountCode,
            `"${o.organizationName.replace(/"/g, '""')}"`,
            `"${o.natureOfBusiness || ''}"`,
            `"${o.customerType || ''}"`,
            `"${o.accountStatus || ''}"`,
            `"${(o.billingStreet || '').replace(/"/g, '""')}"`,
            `"${o.billingCity || ''}"`,
            `"${o.billingState || ''}"`,
            `"${o.gstNumber || ''}"`,
        ]);

        const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement('a');
        link.setAttribute('href', encodedUri);
        link.setAttribute('download', `organizations_export_${Date.now()}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        setToast({ open: true, message: `Exported ${recordsToExport.length} organizations to CSV.`, severity: 'success' });
    };



    return (
        <Box sx={{ width: '100%', minHeight: 'calc(100vh - 64px)', display: 'flex', flexDirection: 'column', flex: 1 }}>
            {/* ── Page Content Container ───────────────────────────────────── */}
            <Box sx={{ p: { xs: 2, md: 3 }, flex: 1, display: 'flex', flexDirection: 'column', backgroundColor: '#f8fafc' }}>
                {/* ── Permanent Automatic Breadcrumbs ────────────────────────── */}
                <Box sx={{ mb: 2 }}>
                    <AppBreadcrumbs />
                </Box>

                {/* ── Filter View Pills & Right Actions ───────────────────────── */}
                <Box
                    sx={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        flexWrap: 'wrap',
                        gap: 2,
                        mb: 2.5,
                    }}
                >
                    {/* Modular Filter Pills */}
                    <OrganizationsFilterPills
                        activeTab={activeTab}
                        onTabChange={(tab: FilterTab) => {
                            setActiveTab(tab);
                            setCurrentPage(1);
                        }}
                    />

                    {/* Right: Action Buttons */}
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.2 }}>
                        <Button
                            variant="outlined"
                            size="small"
                            startIcon={<FilterListIcon sx={{ fontSize: 16 }} />}
                            onClick={() => setToast({ open: true, message: 'Custom filters active.', severity: 'info' })}
                            sx={{
                                borderColor: '#e2e8f0',
                                color: '#334155',
                                backgroundColor: '#fff',
                                textTransform: 'none',
                                fontWeight: 600,
                                fontSize: '0.8rem',
                                borderRadius: '8px',
                                height: 36,
                                px: 1.8,
                                '&:hover': { borderColor: '#cbd5e1', backgroundColor: '#f8fafc' },
                            }}
                        >
                            Filter / Views
                        </Button>

                        <Button
                            variant="outlined"
                            size="small"
                            startIcon={<ViewColumnIcon sx={{ fontSize: 16 }} />}
                            onClick={() => setToast({ open: true, message: 'Column Manager: All 7 standard columns visible.', severity: 'info' })}
                            sx={{
                                borderColor: '#e2e8f0',
                                color: '#334155',
                                backgroundColor: '#fff',
                                textTransform: 'none',
                                fontWeight: 600,
                                fontSize: '0.8rem',
                                borderRadius: '8px',
                                height: 36,
                                px: 1.8,
                                '&:hover': { borderColor: '#cbd5e1', backgroundColor: '#f8fafc' },
                            }}
                        >
                            Column Manager
                        </Button>

                        <Button
                            variant="outlined"
                            size="small"
                            startIcon={<FileDownloadOutlinedIcon sx={{ fontSize: 16 }} />}
                            onClick={() => handleExport(false)}
                            sx={{
                                borderColor: '#e2e8f0',
                                color: '#334155',
                                backgroundColor: '#fff',
                                textTransform: 'none',
                                fontWeight: 600,
                                fontSize: '0.8rem',
                                borderRadius: '8px',
                                height: 36,
                                px: 1.8,
                                '&:hover': { borderColor: '#cbd5e1', backgroundColor: '#f8fafc' },
                            }}
                        >
                            Export
                        </Button>

                        {/* Single Primary Action: New Organization */}
                        <Button
                            variant="contained"
                            size="small"
                            startIcon={<AddIcon sx={{ fontSize: 16 }} />}
                            onClick={() => router.push(ROUTES.ORGANIZATION_NEW)}
                            sx={{
                                background: 'linear-gradient(135deg, #1d4ed8 0%, #2563eb 100%)',
                                color: '#fff',
                                textTransform: 'none',
                                fontWeight: 700,
                                fontSize: '0.82rem',
                                borderRadius: '8px',
                                height: 36,
                                px: 2,
                                boxShadow: 'none',
                                '&:hover': { background: 'linear-gradient(135deg, #1e40af 0%, #1d4ed8 100%)' },
                            }}
                        >
                            New Organization
                        </Button>
                    </Box>
                </Box>

                {/* ── Modular Table Card (with slight blur when side drawer is open) ─ */}
                <Paper
                    elevation={0}
                    sx={{
                        border: '1px solid #e2e8f0',
                        borderRadius: '10px',
                        backgroundColor: '#fff',
                        overflow: 'hidden',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
                        display: 'flex',
                        flexDirection: 'column',
                        flex: 1,
                        filter: selectedDrawerOrg ? 'blur(1.5px)' : 'none',
                        transition: 'filter 0.25s ease',
                    }}
                >
                    {/* Modular Table Toolbar */}
                    <OrganizationsTableToolbar
                        searchQuery={searchQuery}
                        onSearchChange={(q: string) => {
                            setSearchQuery(q);
                            setCurrentPage(1);
                        }}
                        isAllPageSelected={isAllPageSelected}
                        isSomePageSelected={isSomePageSelected}
                        onToggleSelectAll={toggleSelectAll}
                        onSelectAllMatching={() => setSelectedIds(new Set(organizations.map((o) => o.id)))}
                        onSelectVisible={() => {
                            const next = new Set(selectedIds);
                            paginatedOrganizations.forEach((o) => next.add(o.id));
                            setSelectedIds(next);
                        }}
                        onDeselectAll={() => setSelectedIds(new Set())}
                        totalRecords={totalRecords}
                        currentPage={currentPage}
                        rowsPerPage={rowsPerPage}
                        totalPages={totalPages}
                        onPageChange={setCurrentPage}
                        onBulkAction={handleBulkAction}
                        onFilterClick={() => setToast({ open: true, message: 'Filter panel toggled.', severity: 'info' })}
                        onColumnClick={() => setToast({ open: true, message: 'Layout columns toggled.', severity: 'info' })}
                    />

                    {/* Modular Data Table */}
                    <OrganizationsTable
                        organizations={paginatedOrganizations}
                        selectedIds={selectedIds}
                        onToggleSelectRow={toggleSelectRow}
                        isAllPageSelected={isAllPageSelected}
                        isSomePageSelected={isSomePageSelected}
                        onToggleSelectAll={toggleSelectAll}
                        sortField={sortField}
                        sortOrder={sortOrder}
                        onSort={handleSort}
                        onRowClick={(org) => setSelectedDrawerOrg(org)}
                        activeOrgId={selectedDrawerOrg?.id}
                    />

                    {/* Modular Pagination Footer */}
                    <OrganizationsPagination
                        totalRecords={totalRecords}
                        currentPage={currentPage}
                        rowsPerPage={rowsPerPage}
                        totalPages={totalPages}
                        onPageChange={setCurrentPage}
                        onRowsPerPageChange={(rows: number) => {
                            setRowsPerPage(rows);
                            setCurrentPage(1);
                        }}
                    />
                </Paper>
            </Box>

            {/* ── Modular Enterprise Footer ─────────────────────────────────── */}
            <EnterpriseFooter />

            {/* ── Organization View Side Drawer ─────────────────────────────── */}
            <OrganizationDetailDrawer
                organization={selectedDrawerOrg}
                open={Boolean(selectedDrawerOrg)}
                onClose={() => setSelectedDrawerOrg(null)}
                onEdit={(id) => router.push(ROUTES.ORGANIZATION_EDIT(id))}
            />

            {/* ── Standardized AppToast Notification ────────────────────────── */}
            <AppToast
                open={toast.open}
                message={toast.message}
                severity={toast.severity}
                onClose={() => setToast((t) => ({ ...t, open: false }))}
            />
        </Box>
    );
}
