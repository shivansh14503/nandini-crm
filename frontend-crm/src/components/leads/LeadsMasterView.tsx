'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Box, Chip, Typography } from '@mui/material';
import GroupOutlinedIcon from '@mui/icons-material/GroupOutlined';
import LocalFireDepartmentOutlinedIcon from '@mui/icons-material/LocalFireDepartmentOutlined';
import LocalFireDepartmentIcon from '@mui/icons-material/LocalFireDepartment';
import FiberNewOutlinedIcon from '@mui/icons-material/FiberNewOutlined';
import TodayOutlinedIcon from '@mui/icons-material/TodayOutlined';
import AccountCircleOutlinedIcon from '@mui/icons-material/AccountCircleOutlined';
import PersonOutlinedIcon from '@mui/icons-material/PersonOutlined';
import PhoneOutlinedIcon from '@mui/icons-material/PhoneOutlined';
import EmailOutlinedIcon from '@mui/icons-material/EmailOutlined';
import ApartmentIcon from '@mui/icons-material/Apartment';
import CalendarMonthOutlinedIcon from '@mui/icons-material/CalendarMonthOutlined';
import { RecordLink } from '../common/RecordLink';
import { CommonMasterView } from '../common/CommonMasterView';
import { MasterHeaderActions } from '../common/MasterHeaderActions';
import { buildExtendedSearchConfig } from '../common/buildExtendedSearchConfig';
import { AppToast } from '../common/AppToast';
import { DataImportModal } from '../common/import';
import { RelatedModulesSidebar, RelatedRecordsTableView } from '../common/Drawer';
import { RelatedSecondaryDrawer, type SecondaryDrawerEntity } from '../common/RelatedSecondaryDrawer';
import type { DataTableColumn, DataTableFilterItem } from '../common/DataTable';
import { ROUTES } from '../../config/constants';
import { getRelatedModulesForEntity } from '@/config/relatedModules.config';
import type { Lead } from '../../types/lead.types';
import { leadService, subscribeCrmSync } from '@/services';
import type { LeadFilterTab } from './master';
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

    const todayStr = useMemo(() => new Date().toISOString().split('T')[0], []);

    const [importOpen, setImportOpen] = useState(false);

    const loadLeads = useCallback(() => {
        const data = leadService.getAllSync();
        setLeads(data);
        setSelectedDrawerLead((prev) => {
            if (!prev) return null;
            return data.find((l) => l.id === prev.id) || null;
        });
    }, []);

    useEffect(() => {
        let active = true;
        leadService
            .getAll()
            .then((data) => {
                if (active) {
                    setLeads(data);
                    setSelectedDrawerLead((prev) => {
                        if (!prev) return null;
                        return data.find((l) => l.id === prev.id) || null;
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
            loadLeads();
        };
        const handleVisibility = () => {
            if (document.visibilityState === 'visible') {
                loadLeads();
            }
        };

        window.addEventListener('focus', handleFocus);
        document.addEventListener('visibilitychange', handleVisibility);
        const unsubscribe = subscribeCrmSync(loadLeads);

        return () => {
            window.removeEventListener('focus', handleFocus);
            document.removeEventListener('visibilitychange', handleVisibility);
            unsubscribe();
        };
    }, [loadLeads]);

    // ── Filter Tabs Configuration ─────────────────────────────────────────────
    const filterItems: DataTableFilterItem<LeadFilterTab>[] = useMemo(() => {
        return [
            {
                id: 'all',
                label: 'All Leads',
                icon: <GroupOutlinedIcon sx={{ fontSize: 16 }} />,
                count: leads.length,
            },
            {
                id: 'hot',
                label: 'Hot Leads',
                icon: <LocalFireDepartmentOutlinedIcon sx={{ fontSize: 16 }} />,
                count: leads.filter((l) => l.leadType === 'Hot').length,
                activeColor: '#dc2626',
                activeBgColor: '#fef2f2',
                activeBadgeBgColor: '#fee2e2',
            },
            {
                id: 'new',
                label: 'New Enquiries',
                icon: <FiberNewOutlinedIcon sx={{ fontSize: 16 }} />,
                count: leads.filter((l) => l.status === 'New').length,
            },
            {
                id: 'followup_today',
                label: 'Followup Today',
                icon: <TodayOutlinedIcon sx={{ fontSize: 16 }} />,
                count: leads.filter((l) => l.nextFollowupDate === todayStr).length,
                activeColor: '#d97706',
            },
            {
                id: 'my_leads',
                label: 'My Leads',
                icon: <AccountCircleOutlinedIcon sx={{ fontSize: 16 }} />,
                count: leads.filter((l) => (l.assignedTo || '').includes('mittal.sharma')).length,
            },
        ];
    }, [leads, todayStr]);

    // ── Filter Logic ──────────────────────────────────────────────────────────
    const filteredLeads = useMemo(() => {
        return leads.filter((lead) => {
            if (activeTab === 'hot' && lead.leadType !== 'Hot') return false;
            if (activeTab === 'new' && lead.status !== 'New') return false;
            if (activeTab === 'followup_today' && lead.nextFollowupDate !== todayStr) return false;
            if (activeTab === 'my_leads' && !(lead.assignedTo || '').includes('mittal.sharma')) return false;

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
            const valA = ((a as unknown as Record<string, unknown>)[sortField] || '').toString().toLowerCase();
            const valB = ((b as unknown as Record<string, unknown>)[sortField] || '').toString().toLowerCase();
            if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
            if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
            return 0;
        });
    }, [filteredLeads, sortField, sortOrder]);

    const paginatedLeads = useMemo(() => {
        const start = page * rowsPerPage;
        return sortedLeads.slice(start, start + rowsPerPage);
    }, [sortedLeads, page, rowsPerPage]);

    const handleToggleSelectAll = (checked?: boolean) => {
        if (checked) {
            setSelectedIds(paginatedLeads.map((l) => l.id));
        } else {
            setSelectedIds([]);
        }
    };

    const handleToggleSelectRow = (id: string) => {
        setSelectedIds((prev) => (prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]));
    };

    const handleSort = (field: string) => {
        if (sortField === field) {
            setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
        } else {
            setSortField(field);
            setSortOrder('asc');
        }
    };

    const handleBulkDelete = async () => {
        if (selectedIds.length === 0) return;
        if (!confirm(`Are you sure you want to delete ${selectedIds.length} selected lead(s)?`)) return;

        await leadService.deleteBulk(selectedIds);
        setSelectedIds([]);
        loadLeads();
        setToast({
            open: true,
            message: `${selectedIds.length} lead(s) deleted successfully.`,
            severity: 'success',
        });
    };

    // ── Declarative Column Definitions ────────────────────────────────────────
    const columns: DataTableColumn<Lead>[] = useMemo(
        () => [
            {
                id: 'name',
                label: 'LEAD NAME',
                sortable: true,
                minWidth: 200,
                render: (l) => (
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.3 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <PersonOutlinedIcon sx={{ fontSize: 16, color: '#2563eb', flexShrink: 0 }} />
                            <RecordLink
                                href={ROUTES.LEAD_DETAIL(l.id)}
                                onOpen={() => setSelectedDrawerLead(l)}
                                sx={{
                                    fontWeight: 700,
                                    color: '#1d4ed8',
                                    fontSize: '0.82rem',
                                    cursor: 'pointer',
                                    '&:hover': { textDecoration: 'underline' },
                                }}
                            >
                                {l.name}
                            </RecordLink>
                        </Box>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.8, pl: 3 }}>
                            <Chip
                                label={l.leadCode}
                                size="small"
                                sx={{
                                    height: 18,
                                    fontSize: '0.62rem',
                                    fontWeight: 700,
                                    backgroundColor: '#f1f5f9',
                                    color: '#475569',
                                    fontFamily: 'monospace',
                                }}
                            />
                            {l.designation && (
                                <Typography sx={{ fontSize: '0.7rem', color: '#64748b' }} noWrap>
                                    {l.designation}
                                </Typography>
                            )}
                        </Box>
                    </Box>
                ),
            },
            {
                id: 'organizationName',
                label: 'ORGANIZATION',
                sortable: true,
                minWidth: 180,
                render: (l) => (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.8 }}>
                        <ApartmentIcon sx={{ fontSize: 15, color: '#64748b', flexShrink: 0 }} />
                        <Box>
                            <Typography sx={{ fontSize: '0.8rem', color: '#1e293b', fontWeight: 600 }}>
                                {l.organizationName || 'Individual Prospect'}
                            </Typography>
                            {l.primaryCity && (
                                <Typography sx={{ fontSize: '0.7rem', color: '#64748b' }}>
                                    {l.primaryCity}{l.primaryState ? `, ${l.primaryState}` : ''}
                                </Typography>
                            )}
                        </Box>
                    </Box>
                ),
            },
            {
                id: 'mobile',
                label: 'CONTACT INFO',
                sortable: true,
                minWidth: 160,
                render: (l) => (
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.4 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.6 }}>
                            <PhoneOutlinedIcon sx={{ fontSize: 14, color: '#64748b' }} />
                            <Typography sx={{ fontSize: '0.78rem', color: '#334155', fontWeight: 600 }}>
                                {l.mobile || l.otherPhone || '-'}
                            </Typography>
                        </Box>
                        {l.emailAddresses?.[0]?.email && (
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.6 }}>
                                <EmailOutlinedIcon sx={{ fontSize: 13, color: '#94a3b8' }} />
                                <Typography sx={{ fontSize: '0.74rem', color: '#64748b' }} noWrap>
                                    {l.emailAddresses[0].email}
                                </Typography>
                            </Box>
                        )}
                    </Box>
                ),
            },
            {
                id: 'productCategory',
                label: 'PRODUCT / SOLUTION',
                sortable: false,
                minWidth: 170,
                render: (l) => (
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                        {l.productCategory && l.productCategory.length > 0 ? (
                            l.productCategory.map((prod, idx) => (
                                <Chip
                                    key={idx}
                                    label={prod}
                                    size="small"
                                    sx={{
                                        height: 20,
                                        fontSize: '0.68rem',
                                        fontWeight: 600,
                                        backgroundColor: '#f0fdf4',
                                        color: '#166534',
                                        border: '1px solid #bbf7d0',
                                    }}
                                />
                            ))
                        ) : (
                            <Typography sx={{ fontSize: '0.78rem', color: '#94a3b8' }}>-</Typography>
                        )}
                    </Box>
                ),
            },
            {
                id: 'leadType',
                label: 'LEAD TYPE',
                sortable: true,
                minWidth: 110,
                render: (l) => {
                    const isHot = l.leadType === 'Hot';
                    const isWarm = l.leadType === 'Warm';

                    return (
                        <Chip
                            icon={isHot ? <LocalFireDepartmentIcon sx={{ fontSize: '13px !important', color: '#dc2626 !important' }} /> : undefined}
                            label={l.leadType || 'Normal'}
                            size="small"
                            sx={{
                                height: 22,
                                fontSize: '0.72rem',
                                fontWeight: 700,
                                backgroundColor: isHot ? '#fee2e2' : isWarm ? '#fef3c7' : '#f1f5f9',
                                color: isHot ? '#991b1b' : isWarm ? '#92400e' : '#475569',
                                border: isHot ? '1px solid #fecaca' : isWarm ? '1px solid #fde68a' : '1px solid #e2e8f0',
                            }}
                        />
                    );
                },
            },
            {
                id: 'status',
                label: 'STATUS',
                sortable: true,
                minWidth: 120,
                render: (l) => {
                    let bg = '#eff6ff';
                    let color = '#1d4ed8';
                    let border = '#bfdbfe';

                    if (l.status === 'New') {
                        bg = '#eff6ff';
                        color = '#1e40af';
                        border = '#bfdbfe';
                    } else if (l.status === 'Contacted' || l.status === 'In Discussion') {
                        bg = '#f5f3ff';
                        color = '#6d28d9';
                        border = '#ddd6fe';
                    } else if (l.status === 'Demo Scheduled') {
                        bg = '#fdf4ff';
                        color = '#a21caf';
                        border = '#f5d0fe';
                    } else if (l.status === 'Proposal Sent' || l.status === 'Negotiation') {
                        bg = '#fffbeb';
                        color = '#b45309';
                        border = '#fde68a';
                    } else if (l.status === 'Converted') {
                        bg = '#ecfdf5';
                        color = '#047857';
                        border = '#a7f3d0';
                    } else if (l.status.includes('Lost') || l.status.includes('Unqualified')) {
                        bg = '#fef2f2';
                        color = '#b91c1c';
                        border = '#fecaca';
                    }

                    return (
                        <Chip
                            label={l.status || 'New'}
                            size="small"
                            sx={{
                                height: 22,
                                fontSize: '0.72rem',
                                fontWeight: 600,
                                backgroundColor: bg,
                                color: color,
                                border: `1px solid ${border}`,
                            }}
                        />
                    );
                },
            },
            {
                id: 'nextFollowupDate',
                label: 'NEXT FOLLOWUP',
                sortable: true,
                minWidth: 150,
                render: (l) => {
                    const isToday = l.nextFollowupDate === todayStr;

                    return (
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.8 }}>
                            <CalendarMonthOutlinedIcon
                                sx={{
                                    fontSize: 16,
                                    color: isToday ? '#d97706' : '#64748b',
                                }}
                            />
                            <Box>
                                <Typography
                                    sx={{
                                        fontSize: '0.78rem',
                                        fontWeight: isToday ? 700 : 500,
                                        color: isToday ? '#b45309' : '#334155',
                                    }}
                                >
                                    {l.nextFollowupDate || '-'}
                                    {isToday && (
                                        <Box
                                            component="span"
                                            sx={{
                                                ml: 0.6,
                                                px: 0.6,
                                                py: 0.1,
                                                borderRadius: '4px',
                                                fontSize: '0.62rem',
                                                fontWeight: 800,
                                                backgroundColor: '#fef3c7',
                                                color: '#b45309',
                                                border: '1px solid #fde68a',
                                            }}
                                        >
                                            TODAY
                                        </Box>
                                    )}
                                </Typography>
                                {(l.nextFollowupTime || l.followupType) && (
                                    <Typography sx={{ fontSize: '0.7rem', color: '#64748b' }}>
                                        {l.followupType ? `${l.followupType} • ` : ''}
                                        {l.nextFollowupTime || ''}
                                    </Typography>
                                )}
                            </Box>
                        </Box>
                    );
                },
            },
            {
                id: 'assignedTo',
                label: 'ASSIGNED TO',
                sortable: true,
                minWidth: 130,
                render: (l) => (
                    <Typography sx={{ fontSize: '0.78rem', color: '#475569', fontWeight: 500 }}>
                        {l.assignedTo || 'mittal.sharma'}
                    </Typography>
                ),
            },
        ],
        [todayStr]
    );

    const relatedModules = useMemo(() => {
        void leads;
        if (!selectedDrawerLead) return [];
        return getRelatedModulesForEntity('lead', selectedDrawerLead, setActiveRelatedModule);
    }, [selectedDrawerLead, leads]);

    // Falls back to the first module until the user explicitly picks one.
    const effectiveRelatedModule = activeRelatedModule ?? relatedModules[0]?.id ?? null;
    const activeModuleMeta = relatedModules.find((m) => m.id === effectiveRelatedModule);

    // Dismisses the three-panel view and returns to the clean master table.
    const closeThreePanelView = useCallback(() => {
        setSecondaryDrawerEntity(null);
        setSelectedDrawerLead(null);
        setActiveRelatedModule(null);
    }, []);

    return (
        <CommonMasterView<Lead, LeadFilterTab>
            breadcrumbItems={[
                { label: 'Sales' },
                { label: 'Leads' },
            ]}
            filterConfig={{
                filters: filterItems,
                activeFilter: activeTab,
                onFilterChange: (tab) => {
                    setActiveTab(tab);
                    setPage(0);
                },
            }}
            tableId="leads"
            headerActions={() => (
                <MasterHeaderActions
                    onRefresh={() => {
                        loadLeads();
                        setToast({ open: true, message: 'Leads refreshed.', severity: 'info' });
                    }}
                    onNewClick={() => router.push(ROUTES.LEAD_NEW)}
                    newButtonLabel="New Lead"
                    onImportClick={() => setImportOpen(true)}
                />
            )}
            searchConfig={buildExtendedSearchConfig({
                searchQuery,
                onSearchChange: (q) => {
                    setSearchQuery(q);
                    setPage(0);
                },
                searchPlaceholder: 'Search by name, company, phone, product, status...',
                pageIds: paginatedLeads.map((r) => r.id),
                allIds: sortedLeads.map((r) => r.id),
                selectedIds,
                onSelectedIdsChange: setSelectedIds,
                page,
                rowsPerPage,
                totalRecords: sortedLeads.length,
                onPageChange: setPage,
                onBulkDelete: handleBulkDelete,
            })}
            columns={columns}
            data={paginatedLeads}
            keyExtractor={(l) => l.id}
            selectedIds={selectedIds}
            onToggleSelectRow={handleToggleSelectRow}
            onToggleSelectAll={handleToggleSelectAll}
            sortField={sortField}
            sortOrder={sortOrder}
            onSort={handleSort}
            onView={(l) => setSelectedDrawerLead(l)}
            getEditHref={(l) => ROUTES.LEAD_EDIT(l.id)}
            onRowClick={(lead) => setSelectedDrawerLead(lead)}
            activeRowId={selectedDrawerLead?.id}
            viewTooltip="View Lead Details"
            editTooltip="Edit Lead"
            emptyTitle="No leads in pipeline"
            emptyDescription="Record new prospective clients, followups, and product interests to begin converting sales."
            emptyActionLabel="Create Lead"
            onEmptyAction={() => router.push(ROUTES.LEAD_NEW)}
            emptyIcon={<PersonOutlinedIcon sx={{ fontSize: 48, color: '#cbd5e1' }} />}
            minHeight={300}
            pagination={{
                page,
                rowsPerPage,
                totalCount: sortedLeads.length,
                onPageChange: (newPage) => setPage(newPage),
                onRowsPerPageChange: (newRows) => {
                    setRowsPerPage(newRows);
                    setPage(0);
                },
            }}
            relatedSidebar={
                <RelatedModulesSidebar
                    open={Boolean(selectedDrawerLead)}
                    modules={relatedModules}
                    activeModuleId={effectiveRelatedModule ?? undefined}
                    onModuleSelect={(moduleId) => setActiveRelatedModule(moduleId)}
                    collapsed={isLeftSidebarCollapsed}
                    onToggleCollapse={setIsLeftSidebarCollapsed}
                />
            }
            relatedRecordsTable={
                <RelatedRecordsTableView
                    open={Boolean(selectedDrawerLead && effectiveRelatedModule)}
                    moduleId={effectiveRelatedModule || ''}
                    moduleTitle={activeModuleMeta?.label || 'Related Records'}
                    parentRecordId={selectedDrawerLead?.id}
                    parentEntityTitle={selectedDrawerLead?.name || ''}
                    entityData={selectedDrawerLead}
                    entityType="lead"
                    leftOffset={isLeftSidebarCollapsed ? 72 : 260}
                    rightOffset={580}
                    onClose={closeThreePanelView}
                    onRowClick={(row, modId) => setSecondaryDrawerEntity({ type: modId, data: row })}
                />
            }
            drawer={
                <LeadDetailDrawer
                    lead={selectedDrawerLead}
                    open={Boolean(selectedDrawerLead)}
                    onClose={closeThreePanelView}
                    onEdit={(id) => router.push(ROUTES.LEAD_EDIT(id))}
                    onLeadUpdated={(updatedLead) => {
                        setSelectedDrawerLead(updatedLead);
                        loadLeads();
                    }}
                    onShowToast={(message, severity = 'success') => {
                        setToast({ open: true, message, severity });
                    }}
                />
            }
            secondaryDrawer={
                secondaryDrawerEntity ? (
                    <RelatedSecondaryDrawer
                        entity={secondaryDrawerEntity}
                        moduleLabel={activeModuleMeta?.label}
                        parentTitle={selectedDrawerLead?.name}
                        onClose={() => setSecondaryDrawerEntity(null)}
                    />
                ) : null
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
        >
            <DataImportModal
                open={importOpen}
                entity="leads"
                onClose={() => setImportOpen(false)}
                onImported={(count) => {
                    loadLeads();
                    setToast({ open: true, message: `Successfully imported ${count} lead${count === 1 ? '' : 's'}!`, severity: 'success' });
                }}
            />
        </CommonMasterView>
    );
}
