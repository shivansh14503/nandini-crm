'use client';

import React, { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
    Box,
    Typography,
} from '@mui/material';
import ApartmentIcon from '@mui/icons-material/Apartment';

import { ROUTES } from '../../../config/constants';
import type { ExtendedOrganization } from '../../../data/mockOrganizations';
import type { SortField } from './types';
import { DataTable, type DataTableColumn } from '../../common/DataTable';

export interface OrganizationsTableProps {
    organizations: ExtendedOrganization[];
    selectedIds: Set<string>;
    onToggleSelectRow: (id: string) => void;
    isAllPageSelected: boolean;
    isSomePageSelected: boolean;
    onToggleSelectAll: () => void;
    sortField: SortField;
    sortOrder: 'asc' | 'desc';
    onSort: (field: SortField) => void;
    onRowClick?: (org: ExtendedOrganization) => void;
    activeOrgId?: string | null;
}

export function OrganizationsTable({
    organizations,
    selectedIds,
    onToggleSelectRow,
    isAllPageSelected,
    isSomePageSelected,
    onToggleSelectAll,
    sortField,
    sortOrder,
    onSort,
    onRowClick,
    activeOrgId,
}: OrganizationsTableProps) {
    const router = useRouter();

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
        if (nature.includes('Distributor / Wholesale Trading')) return 'Distributor/Trading';
        return nature;
    };

    // Declarative Column Definitions for Organizations
    const columns: DataTableColumn<ExtendedOrganization>[] = useMemo(
        () => [
            {
                id: 'organizationName',
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
                            <Typography
                                onClick={(e) => {
                                    e.stopPropagation();
                                    if (onRowClick) {
                                        onRowClick(org);
                                    } else {
                                        router.push(ROUTES.ORGANIZATION_DETAIL(org.id));
                                    }
                                }}
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
                            </Typography>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.2 }}>
                                <Typography sx={{ fontSize: '0.7rem', color: '#94a3b8', fontFamily: 'monospace' }}>
                                    {org.accountCode}
                                </Typography>
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
                label: 'ASSIGNED USER',
                sortable: true,
                minWidth: 140,
                render: (org) => (
                    <Typography sx={{ fontSize: '0.78rem', color: '#64748b' }}>
                        {org.assignedUser || 'mittal.sharma'}
                    </Typography>
                ),
            },
        ],
        [router, onRowClick]
    );

    return (
        <DataTable<ExtendedOrganization>
            data={organizations}
            columns={columns}
            keyExtractor={(org) => org.id}
            selectable={true}
            selectedIds={selectedIds}
            onToggleSelectRow={onToggleSelectRow}
            onToggleSelectAll={onToggleSelectAll}
            isAllSelected={isAllPageSelected}
            isIndeterminate={isSomePageSelected}
            sortField={sortField}
            sortOrder={sortOrder}
            onSort={(field) => onSort(field as SortField)}
            onViewRow={(org) => router.push(ROUTES.ORGANIZATION_DETAIL(org.id))}
            onEditRow={(org) => router.push(ROUTES.ORGANIZATION_EDIT(org.id))}
            onRowClick={onRowClick}
            activeRowId={activeOrgId}
            viewTooltip="View Details"
            editTooltip="Edit Organization"
            actionsPosition="left"
            actionsWidth={70}
            actionsHeaderLabel="ACTIONS"
            emptyTitle="No organizations found"
            emptyDescription="No organizations match your current search and filter criteria."
            emptyActionLabel="Create Organization"
            onEmptyAction={() => router.push(ROUTES.ORGANIZATION_NEW)}
            minHeight={280}
        />
    );
}
