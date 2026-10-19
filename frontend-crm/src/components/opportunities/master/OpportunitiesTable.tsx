'use client';

import React, { useMemo } from 'react';
import {
    Box,
    Chip,
    Typography,
} from '@mui/material';
import TrendingUpOutlinedIcon from '@mui/icons-material/TrendingUpOutlined';
import ApartmentIcon from '@mui/icons-material/Apartment';
import CalendarMonthOutlinedIcon from '@mui/icons-material/CalendarMonthOutlined';
import PersonOutlinedIcon from '@mui/icons-material/PersonOutlined';
import CheckCircleOutlinedIcon from '@mui/icons-material/CheckCircleOutlined';
import type { Opportunity } from '../../../types/opportunity.types';
import { DataTable, type DataTableColumn } from '../../common/DataTable';

export interface OpportunitiesTableProps {
    opportunities: Opportunity[];
    selectedIds: string[];
    onSelectAll: (checked: boolean) => void;
    onSelectOne: (id: string, checked: boolean) => void;
    onViewOpportunity?: (id: string) => void;
    onEditOpportunity: (id: string) => void;
    onNewOpportunity: () => void;
    sortField?: string;
    sortOrder?: 'asc' | 'desc';
    onSort?: (field: string) => void;
    onRowClick?: (opp: Opportunity) => void;
    activeOpportunityId?: string | null;
}

export function OpportunitiesTable({
    opportunities,
    selectedIds,
    onSelectAll,
    onSelectOne,
    onViewOpportunity,
    onEditOpportunity,
    onNewOpportunity,
    sortField,
    sortOrder,
    onSort,
    onRowClick,
    activeOpportunityId,
}: OpportunitiesTableProps) {
    const todayStr = useMemo(() => new Date().toISOString().split('T')[0], []);

    // Format currency in Indian numbering system
    const formatCurrency = (val: number) => {
        return new Intl.NumberFormat('en-IN', {
            style: 'currency',
            currency: 'INR',
            maximumFractionDigits: 0,
        }).format(val);
    };

    const columns: DataTableColumn<Opportunity>[] = useMemo(
        () => [
            {
                id: 'opportunityCode',
                label: 'DEAL / CODE',
                sortable: true,
                minWidth: 190,
                render: (o) => (
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.3 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <TrendingUpOutlinedIcon sx={{ fontSize: 16, color: '#2563eb', flexShrink: 0 }} />
                            <Typography
                                onClick={(e) => {
                                    e.stopPropagation();
                                    if (onRowClick) {
                                        onRowClick(o);
                                    } else if (onViewOpportunity) {
                                        onViewOpportunity(o.id);
                                    } else {
                                        onEditOpportunity(o.id);
                                    }
                                }}
                                sx={{
                                    fontWeight: 700,
                                    color: '#1d4ed8',
                                    fontSize: '0.82rem',
                                    cursor: 'pointer',
                                    '&:hover': { textDecoration: 'underline' },
                                }}
                            >
                                {o.opportunityCode}
                            </Typography>
                        </Box>
                        <Box sx={{ pl: 3 }}>
                            <Typography sx={{ fontSize: '0.72rem', color: '#64748b' }} noWrap>
                                {o.groupName || 'Primary Solution'}
                            </Typography>
                        </Box>
                    </Box>
                ),
            },
            {
                id: 'organizationName',
                label: 'ORGANIZATION & CONTACT',
                sortable: true,
                minWidth: 200,
                render: (o) => (
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.3 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.8 }}>
                            <ApartmentIcon sx={{ fontSize: 15, color: '#64748b', flexShrink: 0 }} />
                            <Typography sx={{ fontSize: '0.8rem', color: '#1e293b', fontWeight: 600 }}>
                                {o.organizationName}
                            </Typography>
                        </Box>
                        {o.contactName && (
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.6, pl: 2.8 }}>
                                <PersonOutlinedIcon sx={{ fontSize: 13, color: '#94a3b8' }} />
                                <Typography sx={{ fontSize: '0.72rem', color: '#64748b' }} noWrap>
                                    {o.contactName} ({o.contactNumber})
                                </Typography>
                            </Box>
                        )}
                    </Box>
                ),
            },
            {
                id: 'salesStage',
                label: 'SALES STAGE',
                sortable: true,
                minWidth: 150,
                render: (o) => {
                    let bg = '#eff6ff';
                    let color = '#1d4ed8';
                    let border = '#bfdbfe';

                    if (o.salesStage === 'Closed Won') {
                        bg = '#ecfdf5';
                        color = '#047857';
                        border = '#a7f3d0';
                    } else if (o.salesStage === 'Closed Lost') {
                        bg = '#fef2f2';
                        color = '#b91c1c';
                        border = '#fecaca';
                    } else if (o.salesStage.includes('Proposal') || o.salesStage.includes('Negotiation')) {
                        bg = '#fffbeb';
                        color = '#b45309';
                        border = '#fde68a';
                    } else if (o.salesStage.includes('Value') || o.salesStage.includes('Needs')) {
                        bg = '#f5f3ff';
                        color = '#6d28d9';
                        border = '#ddd6fe';
                    }

                    return (
                        <Chip
                            label={o.salesStage}
                            size="small"
                            icon={o.salesStage === 'Closed Won' ? <CheckCircleOutlinedIcon sx={{ fontSize: '13px !important', color: '#047857 !important' }} /> : undefined}
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
                id: 'grandTotal',
                label: 'DEAL VALUE',
                sortable: true,
                minWidth: 130,
                render: (o) => (
                    <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                        <Typography sx={{ fontSize: '0.84rem', fontWeight: 700, color: '#0f172a' }}>
                            {formatCurrency(o.grandTotal || 0)}
                        </Typography>
                        {o.lineItems && o.lineItems.length > 0 && (
                            <Typography sx={{ fontSize: '0.68rem', color: '#64748b' }}>
                                {o.lineItems.length} line item(s)
                            </Typography>
                        )}
                    </Box>
                ),
            },
            {
                id: 'productCategory',
                label: 'PRODUCT CATEGORY',
                sortable: false,
                minWidth: 170,
                render: (o) => (
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                        {o.productCategory && o.productCategory.length > 0 ? (
                            o.productCategory.map((cat, idx) => (
                                <Chip
                                    key={idx}
                                    label={cat}
                                    size="small"
                                    sx={{
                                        height: 20,
                                        fontSize: '0.66rem',
                                        fontWeight: 600,
                                        backgroundColor: '#eff6ff',
                                        color: '#1d4ed8',
                                        border: '1px solid #bfdbfe',
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
                id: 'type',
                label: 'TYPE & SOURCE',
                sortable: true,
                minWidth: 150,
                render: (o) => (
                    <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                        <Typography sx={{ fontSize: '0.78rem', color: '#334155', fontWeight: 600 }}>
                            {o.type || 'New Business'}
                        </Typography>
                        <Typography sx={{ fontSize: '0.7rem', color: '#64748b' }}>
                            via {o.leadSource}
                        </Typography>
                    </Box>
                ),
            },
            {
                id: 'nextFollowupDate',
                label: 'NEXT FOLLOWUP',
                sortable: true,
                minWidth: 140,
                render: (o) => {
                    const isToday = o.nextFollowupDate === todayStr;

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
                                    {o.nextFollowupDate || '-'}
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
                                {o.followupType && (
                                    <Typography sx={{ fontSize: '0.7rem', color: '#64748b' }}>
                                        {o.followupType} {o.nextFollowupTime ? `• ${o.nextFollowupTime}` : ''}
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
                render: (o) => (
                    <Typography sx={{ fontSize: '0.78rem', color: '#475569', fontWeight: 500 }}>
                        {o.assignedTo || 'mittal.sharma'}
                    </Typography>
                ),
            },
        ],
        [onEditOpportunity, onViewOpportunity, onRowClick, todayStr]
    );

    return (
        <DataTable<Opportunity>
            data={opportunities}
            columns={columns}
            keyExtractor={(o) => o.id}
            selectable={true}
            selectedIds={selectedIds}
            onToggleSelectRow={(id) => {
                const isSelected = selectedIds.includes(id);
                onSelectOne(id, !isSelected);
            }}
            onToggleSelectAll={(checked) => onSelectAll(!!checked)}
            sortField={sortField}
            sortOrder={sortOrder}
            onSort={onSort}
            onViewRow={(o) => (onViewOpportunity ? onViewOpportunity(o.id) : onEditOpportunity(o.id))}
            onEditRow={(o) => onEditOpportunity(o.id)}
            onRowClick={onRowClick}
            activeRowId={activeOpportunityId}
            viewTooltip="View Deal Details"
            editTooltip="Edit Opportunity"
            actionsPosition="left"
            actionsWidth={70}
            actionsHeaderLabel="ACTIONS"
            emptyTitle="No opportunities in pipeline"
            emptyDescription="Create your first deal opportunity and track it from qualification to closed won."
            emptyActionLabel="Create Opportunity"
            onEmptyAction={onNewOpportunity}
            emptyIcon={<TrendingUpOutlinedIcon sx={{ fontSize: 48, color: '#cbd5e1' }} />}
            minHeight={300}
        />
    );
}
