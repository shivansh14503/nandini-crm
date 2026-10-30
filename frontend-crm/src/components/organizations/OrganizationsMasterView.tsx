'use client';

import React, { useState, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
    Box,
    Button,
    Typography,
} from '@mui/material';
import FileDownloadOutlinedIcon from '@mui/icons-material/FileDownloadOutlined';
import HistoryIcon from '@mui/icons-material/History';
import PersonOutlinedIcon from '@mui/icons-material/PersonOutlined';
import ApartmentIcon from '@mui/icons-material/Apartment';

import { ROUTES } from '@/config/constants';
import { useRelatedModulesForEntity } from '@/config/relatedModules.config';
import { RecordLink } from '../common/RecordLink';
import { useAuth } from '@/context/AuthContext';
import { CommonMasterView } from '../common/CommonMasterView';
import { AppToast } from '../common/AppToast';
import { MasterHeaderActions, outlinedHeaderButtonSx } from '../common/MasterHeaderActions';
import { DataImportModal } from '../common/import';
import {
    RelatedModulesSidebar,
    RelatedRecordsTableView,
    EntityDetailDrawer,
    DrawerSectionCard,
    DrawerMetricGrid,
} from '../common/Drawer';
import type { DataTableColumn, DataTableFilterItem } from '../common/DataTable';
import { organizationService } from '@/services';
import { useOrganizations, useBulkDeleteOrganizations } from '@/hooks/queries';
import type { ExtendedOrganization } from '@/types/organization.types';
import type { Contact } from '@/types/contact.types';
import type { Lead } from '@/types/lead.types';
import type { Opportunity } from '@/types/opportunity.types';
import type { Quotation } from '@/types/quotation.types';
import type { Product } from '@/types/product.types';
import { OrganizationDetailDrawer } from './OrganizationDetailDrawer';
import { ContactDetailDrawer } from '../contacts/ContactDetailDrawer';
import { LeadDetailDrawer } from '../leads/LeadDetailDrawer';
import { OpportunityDetailDrawer } from '../opportunities/OpportunityDetailDrawer';
import { QuotationDetailDrawer } from '../quotations/QuotationDetailDrawer';
import { ProductDetailDrawer } from '../products/ProductDetailDrawer';
import { TicketDetailDrawer } from '../tickets/TicketDetailDrawer';
import type { Ticket } from '@/types/ticket.types';
import type { FilterTab, SortField } from './master';

const getNatureBadgeStyle = (nature: string = '') => {
    const n = nature.toLowerCase();
    if (n.includes('education')) return { backgroundColor: '#f3e8ff', color: '#7e22ce', border: '1px solid #d8b4fe' };
    if (n.includes('construction')) return { backgroundColor: '#fff7ed', color: '#c2410c', border: '1px solid #fed7aa' };
    if (n.includes('distributor') || n.includes('trading') || n.includes('wholesale')) return { backgroundColor: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe' };
    if (n.includes('transportation') || n.includes('logistics')) return { backgroundColor: '#ecfeff', color: '#0e7490', border: '1px solid #a5f3fc' };
    if (n.includes('consulting')) return { backgroundColor: '#eef2ff', color: '#4338ca', border: '1px solid #c7d2fe' };
    if (n.includes('it') || n.includes('software')) return { backgroundColor: '#f0f9ff', color: '#0284c7', border: '1px solid #bae6fd' };
    if (n.includes('manufacturing')) return { backgroundColor: '#ecfdf5', color: '#047857', border: '1px solid #a7f3d0' };
    if (n.includes('healthcare')) return { backgroundColor: '#fff1f2', color: '#be123c', border: '1px solid #fecdd3' };
    if (n.includes('retail')) return { backgroundColor: '#fefce8', color: '#a16207', border: '1px solid #fef08a' };
    return { backgroundColor: '#f8fafc', color: '#475569', border: '1px solid #cbd5e1' };
};

const formatNatureLabel = (nature: string = '') => {
    if (nature.includes('Distributor / Trading / Wholesale')) return 'Distributor/Trading';
    return nature;
};


/** Stable empty list while the first page loads (keeps memoized filters from recomputing). */
const NO_RECORDS: ExtendedOrganization[] = [];
export function OrganizationsMasterView() {
    const router = useRouter();
    const { user } = useAuth();
    const isAdmin = user?.role?.toLowerCase() === 'admin';

    // ── State ─────────────────────────────────────────────────────────────────
    const { data: organizations = NO_RECORDS, refetch } = useOrganizations();
    const bulkDeleteMutation = useBulkDeleteOrganizations();
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [activeTab, setActiveTab] = useState<FilterTab>('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [rowsPerPage, setRowsPerPage] = useState<number>(25);
    const [currentPage, setCurrentPage] = useState<number>(1);
    const [sortField, setSortField] = useState<SortField>('organizationName');
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

    // Detail View Side Drawer & Three-Panel LIFO Stack State
    // Tracked by id so the drawer always shows the cached copy and closes if the organization is deleted.
    const [drawerOrgId, setDrawerOrgId] = useState<string | null>(null);
    const selectedDrawerOrg = useMemo(
        () => (drawerOrgId ? organizations.find((o) => o.id === drawerOrgId) ?? null : null),
        [organizations, drawerOrgId]
    );
    const [activeRelatedModule, setActiveRelatedModule] = useState<string>('contacts');
    const [secondaryDrawerEntity, setSecondaryDrawerEntity] = useState<{
        type: string;
        data: Record<string, unknown>;
    } | null>(null);
    const [isLeftSidebarCollapsed, setIsLeftSidebarCollapsed] = useState<boolean>(false);
    const [toast, setToast] = useState<{ open: boolean; message: string; severity: 'success' | 'info' | 'error' }>({
        open: false,
        message: '',
        severity: 'success',
    });

    const closeThreePanelView = useCallback(() => {
        // Dismiss the three-panel view and return to the normal master table.
        // CommonMasterView resets its shared drawer-collapse state when isDrawerOpen becomes false.
        setSecondaryDrawerEntity(null);
        setDrawerOrgId(null);
        setActiveRelatedModule('contacts');
    }, []);

    const relatedModules = useRelatedModulesForEntity('organization', selectedDrawerOrg, setActiveRelatedModule);

    const activeModuleMeta = useMemo(
        () => relatedModules.find((m) => m.id === activeRelatedModule) || relatedModules[0],
        [relatedModules, activeRelatedModule]
    );

    const renderSecondaryDrawer = () => {
        if (!secondaryDrawerEntity) return null;
        const { type, data } = secondaryDrawerEntity;
        const closeSecondary = () => setSecondaryDrawerEntity(null);

        if (type === 'contacts') {
            return (
                <ContactDetailDrawer
                    contact={data as unknown as Contact}
                    open
                    onClose={closeSecondary}
                />
            );
        }
        if (type === 'leads') {
            return (
                <LeadDetailDrawer
                    lead={data as unknown as Lead}
                    open
                    onClose={closeSecondary}
                    onEdit={(id) => router.push(ROUTES.LEAD_EDIT(id))}
                />
            );
        }
        if (type === 'opportunities') {
            return (
                <OpportunityDetailDrawer
                    opportunity={data as unknown as Opportunity}
                    open
                    onClose={closeSecondary}
                    onEdit={(id) => router.push(ROUTES.OPPORTUNITY_EDIT(id))}
                />
            );
        }
        if (type === 'quotations') {
            return (
                <QuotationDetailDrawer
                    quotation={data as unknown as Quotation}
                    open
                    onClose={closeSecondary}
                    onEdit={(id) => router.push(ROUTES.QUOTATION_EDIT(id))}
                />
            );
        }
        if (type === 'tickets') {
            return (
                <TicketDetailDrawer
                    ticket={data as unknown as Ticket}
                    open
                    onClose={closeSecondary}
                />
            );
        }
        if (type === 'products') {
            return (
                <ProductDetailDrawer
                    product={data as unknown as Product}
                    open
                    onClose={closeSecondary}
                />
            );
        }

        const recordTitle = String(
            data.subject ||
                data.name ||
                data.contractTitle ||
                data.partnerName ||
                data.ticketNumber ||
                activeModuleMeta?.label ||
                'Related Record'
        );

        const detailFields = Object.entries(data)
            .filter(([key]) => key !== 'id')
            .map(([key, val]) => ({
                label: key.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase()),
                value: String(val ?? '-'),
            }));

        return (
            <EntityDetailDrawer
                open
                onClose={closeSecondary}
                title={recordTitle}
                subtitle={`${activeModuleMeta?.label || 'Module'} • ${selectedDrawerOrg?.organizationName || ''}`}
                statusText="Linked Record Verified"
                tabs={[
                    {
                        id: 'overview',
                        label: 'Overview',
                        icon: <ApartmentIcon sx={{ fontSize: 16 }} />,
                        content: (
                            <DrawerSectionCard title={`${activeModuleMeta?.label || 'Record'} Details`}>
                                <DrawerMetricGrid items={detailFields} />
                            </DrawerSectionCard>
                        ),
                    },
                ]}
            />
        );
    };

    const [importOpen, setImportOpen] = useState(false);

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
            const valA = ((a as unknown as Record<string, unknown>)[sortField] || '').toString().toLowerCase();
            const valB = ((b as unknown as Record<string, unknown>)[sortField] || '').toString().toLowerCase();
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

    // ── Bulk Actions ──────────────────────────────────────────────────────────
    const handleBulkAction = async (action: 'active' | 'inactive' | 'delete' | 'export') => {
        if (selectedIds.size === 0) {
            setToast({ open: true, message: 'Please select records to perform bulk action.', severity: 'info' });
            return;
        }

        if (action === 'delete') {
            const count = selectedIds.size;
            if (!window.confirm(`Delete ${count} selected organization(s)?`)) return;
            try {
                await bulkDeleteMutation.mutateAsync(Array.from(selectedIds));
                if (drawerOrgId && selectedIds.has(drawerOrgId)) {
                    closeThreePanelView();
                }
                setSelectedIds(new Set());
                setToast({ open: true, message: `${count} organizations deleted.`, severity: 'success' });
            } catch {
                setToast({ open: true, message: 'Failed to delete organizations.', severity: 'error' });
            }
        } else if (action === 'active' || action === 'inactive') {
            const status = action === 'active' ? 'Active' : 'Inactive';
            try {
                // Saves through the service, whose sync notification refreshes the organizations cache.
                const updated = await organizationService.updateStatusBulk(selectedIds, status);
                setToast({ open: true, message: `${updated.length} organizations updated to ${status}.`, severity: 'success' });
            } catch (err) {
                setToast({
                    open: true,
                    message: err instanceof Error ? err.message : 'Failed to update organization status.',
                    severity: 'error',
                });
            }
        } else if (action === 'export') {
            handleExport(true);
        }
    };

    // ── Filter Pills Configuration ────────────────────────────────────────────
    const filterItems: DataTableFilterItem<FilterTab>[] = useMemo(
        () => [
            {
                id: 'all',
                label: 'All Organizations',
                count: organizations.length,
            },
            {
                id: 'recent',
                label: 'Recently Viewed',
                icon: <HistoryIcon sx={{ fontSize: 15, color: '#94a3b8' }} />,
                count: organizations.filter((o) => o.isRecentlyViewed).length,
            },
            {
                id: 'my',
                label: 'My Accounts',
                icon: <PersonOutlinedIcon sx={{ fontSize: 16, color: '#94a3b8' }} />,
            },
            {
                id: 'distributor',
                label: 'Distributor/Trading',
                dotColor: '#2563eb',
            },
            {
                id: 'enduser',
                label: 'End User',
                dotColor: '#10b981',
            },
        ],
        [organizations]
    );

    // ── Declarative Column Definitions ────────────────────────────────────────
    const columns: DataTableColumn<ExtendedOrganization>[] = useMemo(
        () => [
            {
                id: 'organizationName',
                category: 'basic',
                locked: true,
                label: 'ORGANIZATION NAME',
                sortable: true,
                minWidth: 240,
                render: (org) => (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.2 }}>
                        <Box
                            sx={{
                                width: 28,
                                height: 28,
                                borderRadius: '6px',
                                backgroundColor: '#eff6ff',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: '#2563eb',
                                flexShrink: 0,
                            }}
                        >
                            <ApartmentIcon sx={{ fontSize: 16 }} />
                        </Box>
                        <Box>
                            <RecordLink
                                href={ROUTES.ORGANIZATION_DETAIL(org.id)}
                                onOpen={() => setDrawerOrgId(org.id)}
                                sx={{
                                    fontSize: '0.82rem',
                                    fontWeight: 700,
                                    color: '#1d4ed8',
                                    cursor: 'pointer',
                                    lineHeight: 1.3,
                                    '&:hover': { textDecoration: 'underline' },
                                }}
                            >
                                {org.organizationName}
                            </RecordLink>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.2 }}>
                                {org.tradeName && org.tradeName !== org.organizationName && (
                                    <Typography sx={{ fontSize: '0.7rem', color: '#94a3b8' }}>{org.tradeName}</Typography>
                                )}
                                {org.accountVerified && (
                                    <Box
                                        component="span"
                                        sx={{
                                            fontSize: '0.62rem',
                                            fontWeight: 700,
                                            color: '#059669',
                                            backgroundColor: '#ecfdf5',
                                            px: 0.6,
                                            py: 0.1,
                                            borderRadius: '4px',
                                            border: '1px solid #a7f3d0',
                                        }}
                                    >
                                        Verified
                                    </Box>
                                )}
                            </Box>
                        </Box>
                    </Box>
                ),
            },
            {
                id: 'natureOfBusiness',
                category: 'basic',
                label: 'NATURE OF BUSINESS',
                sortable: true,
                minWidth: 160,
                render: (org) => {
                    const badge = getNatureBadgeStyle(org.natureOfBusiness);
                    return (
                        <Box
                            component="span"
                            sx={{
                                display: 'inline-block',
                                px: 1,
                                py: 0.3,
                                borderRadius: '6px',
                                fontSize: '0.72rem',
                                fontWeight: 600,
                                ...badge,
                            }}
                        >
                            {formatNatureLabel(org.natureOfBusiness)}
                        </Box>
                    );
                },
            },
            {
                id: 'customerType',
                category: 'basic',
                label: 'CUSTOMER TYPE',
                sortable: true,
                minWidth: 130,
                render: (org) => (
                    <Box
                        component="span"
                        sx={{
                            display: 'inline-block',
                            px: 1,
                            py: 0.25,
                            borderRadius: '6px',
                            fontSize: '0.72rem',
                            fontWeight: 600,
                            backgroundColor: '#f1f5f9',
                            color: '#334155',
                            border: '1px solid #e2e8f0',
                        }}
                    >
                        {org.customerType}
                    </Box>
                ),
            },
            {
                id: 'accountStatus',
                category: 'basic',
                label: 'STATUS',
                sortable: true,
                minWidth: 110,
                render: (org) => {
                    const isActive = org.accountStatus === 'Active';
                    return (
                        <Box
                            component="span"
                            sx={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 0.6,
                                px: 0.9,
                                py: 0.25,
                                borderRadius: '12px',
                                fontSize: '0.72rem',
                                fontWeight: 700,
                                backgroundColor: isActive ? '#ecfdf5' : '#fef3c7',
                                color: isActive ? '#059669' : '#d97706',
                                border: isActive ? '1px solid #a7f3d0' : '1px solid #fde68a',
                            }}
                        >
                            <Box
                                component="span"
                                sx={{
                                    width: 6,
                                    height: 6,
                                    borderRadius: '50%',
                                    backgroundColor: isActive ? '#10b981' : '#f59e0b',
                                }}
                            />
                            {org.accountStatus}
                        </Box>
                    );
                },
            },
            {
                id: 'billingStreet',
                category: 'more',
                label: 'BILLING STREET',
                sortable: true,
                minWidth: 160,
                render: (org) => (
                    <Typography noWrap sx={{ fontSize: '0.78rem', color: '#475569', maxWidth: 200 }}>
                        {org.billingStreet || '-'}
                    </Typography>
                ),
            },
            {
                id: 'billingCity',
                category: 'more',
                label: 'BILLING CITY',
                sortable: true,
                minWidth: 120,
                render: (org) => (
                    <Typography sx={{ fontSize: '0.78rem', color: '#475569' }}>
                        {org.billingCity || '-'}
                    </Typography>
                ),
            },
            {
                id: 'billingState',
                category: 'more',
                label: 'BILLING STATE',
                sortable: true,
                minWidth: 120,
                render: (org) => (
                    <Typography sx={{ fontSize: '0.78rem', color: '#475569' }}>
                        {org.billingState || '-'}
                    </Typography>
                ),
            },
            {
                id: 'annualTurnover',
                category: 'more',
                label: 'ANNUAL TURNOVER',
                sortable: true,
                minWidth: 130,
                render: (org) => (
                    <Typography sx={{ fontSize: '0.78rem', fontWeight: 600, color: '#334155' }}>
                        {org.annualTurnover || '-'}
                    </Typography>
                ),
            },
            {
                id: 'assignedUser',
                category: 'more',
                label: 'ASSIGNED USER',
                sortable: true,
                minWidth: 140,
                render: (org) => (
                    <Typography sx={{ fontSize: '0.78rem', color: '#64748b' }}>
                        {org.assignedUser || '-'}
                    </Typography>
                ),
            },
        ],
        []
    );

    const headerActions = (
        <MasterHeaderActions
            onRefresh={async () => {
                const { isError } = await refetch();
                setToast(
                    isError
                        ? { open: true, message: 'Failed to refresh organizations.', severity: 'error' }
                        : { open: true, message: 'Organizations refreshed.', severity: 'info' }
                );
            }}
            onNewClick={() => router.push(ROUTES.ORGANIZATION_NEW)}
            newButtonLabel="New Organization"
            onImportClick={() => setImportOpen(true)}
        >
            <Button
                variant="outlined"
                size="small"
                startIcon={<FileDownloadOutlinedIcon sx={{ fontSize: 16 }} />}
                onClick={() => handleExport(false)}
                sx={outlinedHeaderButtonSx}
            >
                Export
            </Button>
        </MasterHeaderActions>
    );

    return (
        <CommonMasterView<ExtendedOrganization, FilterTab>
            filterConfig={{
                filters: filterItems,
                activeFilter: activeTab,
                onFilterChange: (tab) => {
                    setActiveTab(tab);
                    setCurrentPage(1);
                },
                variant: 'pill',
            }}
            tableId="organizations"
            headerActions={headerActions}
            searchConfig={{
                variant: 'extended',
                searchQuery,
                onSearchChange: (q) => {
                    setSearchQuery(q);
                    setCurrentPage(1);
                },
                searchPlaceholder: 'Search within table...',
                isAllPageSelected,
                isSomePageSelected,
                onToggleSelectAll: toggleSelectAll,
                onSelectAllMatching: () => setSelectedIds(new Set(organizations.map((o) => o.id))),
                onSelectVisible: () => {
                    const next = new Set(selectedIds);
                    paginatedOrganizations.forEach((o) => next.add(o.id));
                    setSelectedIds(next);
                },
                onDeselectAll: () => setSelectedIds(new Set()),
                totalRecords,
                displayTotalRecords: totalRecords.toLocaleString('en-IN'),
                currentPage,
                rowsPerPage,
                totalPages,
                onPageChange: setCurrentPage,
                bulkActionItems: [
                    { id: 'active', label: 'Mark as Active', onClick: () => handleBulkAction('active') },
                    { id: 'inactive', label: 'Mark as Inactive', onClick: () => handleBulkAction('inactive') },
                    { id: 'export', label: 'Export Selected to CSV', onClick: () => handleBulkAction('export') },
                    { id: 'delete', label: 'Delete Selected', color: 'error', onClick: () => handleBulkAction('delete') },
                ],
            }}
            columns={columns}
            data={paginatedOrganizations}
            keyExtractor={(org) => org.id}
            selectedIds={selectedIds}
            onToggleSelectRow={toggleSelectRow}
            onToggleSelectAll={toggleSelectAll}
            isAllSelected={isAllPageSelected}
            isIndeterminate={isSomePageSelected}
            sortField={sortField}
            sortOrder={sortOrder}
            onSort={(field) => handleSort(field as SortField)}
            onView={(org) => router.push(ROUTES.ORGANIZATION_DETAIL(org.id))}
            getEditHref={(org) =>
                org.accountStatus === 'Inactive' && !isAdmin
                    ? ROUTES.ORGANIZATION_DETAIL(org.id)
                    : ROUTES.ORGANIZATION_EDIT(org.id)
            }
            onEdit={(org) => {
                if (org.accountStatus === 'Inactive' && !isAdmin) {
                    setToast({ open: true, message: 'This organization is inactive. Only an Admin can edit it.', severity: 'info' });
                }
            }}
            onRowClick={(org) => setDrawerOrgId(org.id)}
            activeRowId={selectedDrawerOrg?.id}
            viewTooltip="View Details"
            editTooltip="Edit Organization"
            emptyTitle="No organizations found"
            emptyDescription="No organizations match your current search and filter criteria."
            emptyActionLabel="Create Organization"
            onEmptyAction={() => router.push(ROUTES.ORGANIZATION_NEW)}
            pagination={{
                variant: 'full',
                page: currentPage - 1,
                rowsPerPage,
                totalCount: totalRecords,
                displayTotalCount: totalRecords.toLocaleString('en-IN'),
                entityLabel: 'Organizations',
                pageSizeOptions: [10, 25, 50, 100],
                onPageChange: (pageZeroBased) => setCurrentPage(pageZeroBased + 1),
                onRowsPerPageChange: (rows) => {
                    setRowsPerPage(rows);
                    setCurrentPage(1);
                },
            }}
            relatedSidebar={
                <RelatedModulesSidebar
                    open={Boolean(selectedDrawerOrg)}
                    logoSrc="/images/NIPL-Updated-Logo-Large.png"
                    modules={relatedModules}
                    activeModuleId={activeRelatedModule}
                    onModuleSelect={(moduleId) => setActiveRelatedModule(moduleId)}
                    collapsed={isLeftSidebarCollapsed}
                    onToggleCollapse={setIsLeftSidebarCollapsed}
                />
            }
            relatedRecordsTable={
                <RelatedRecordsTableView
                    open={Boolean(selectedDrawerOrg)}
                    moduleId={activeRelatedModule}
                    moduleTitle={activeModuleMeta?.label || 'Related Records'}
                    parentEntityTitle={selectedDrawerOrg?.organizationName || ''}
                    parentRecordId={selectedDrawerOrg?.id}
                    entityData={selectedDrawerOrg}
                    entityType="organization"
                    leftOffset={isLeftSidebarCollapsed ? 72 : 260}
                    rightOffset={580}
                    onClose={closeThreePanelView}
                    onRowClick={(clickedRow, modId) =>
                        setSecondaryDrawerEntity({ type: modId, data: clickedRow })
                    }
                />
            }
            drawer={
                <OrganizationDetailDrawer
                    organization={selectedDrawerOrg}
                    open={Boolean(selectedDrawerOrg)}
                    hideBackdrop={true}
                    onClose={closeThreePanelView}
                    onEdit={(id) => router.push(ROUTES.ORGANIZATION_EDIT(id))}
                />
            }
            secondaryDrawer={renderSecondaryDrawer()}
            isDrawerOpen={Boolean(selectedDrawerOrg)}
            toast={
                <AppToast
                    open={toast.open}
                    message={toast.message}
                    severity={toast.severity}
                    onClose={() => setToast((t) => ({ ...t, open: false }))}
                />
            }
        >
            <DataImportModal
                open={importOpen}
                entity="organizations"
                onClose={() => setImportOpen(false)}
                onImported={(count) => {
                    setToast({ open: true, message: `Successfully imported ${count} organization${count === 1 ? '' : 's'}!`, severity: 'success' });
                }}
            />
        </CommonMasterView>
    );
}
