'use client';

import React, { useMemo } from 'react';
import {
    Box,
    Chip,
    Typography,
} from '@mui/material';
import PersonOutlinedIcon from '@mui/icons-material/PersonOutlined';
import PhoneOutlinedIcon from '@mui/icons-material/PhoneOutlined';
import EmailOutlinedIcon from '@mui/icons-material/EmailOutlined';
import ApartmentIcon from '@mui/icons-material/Apartment';
import CalendarMonthOutlinedIcon from '@mui/icons-material/CalendarMonthOutlined';
import LocalFireDepartmentIcon from '@mui/icons-material/LocalFireDepartment';
import type { Lead } from '../../../types/lead.types';
import { DataTable, type DataTableColumn } from '../../common/DataTable';

export interface LeadsTableProps {
    leads: Lead[];
    selectedIds: string[];
    onSelectAll: (checked: boolean) => void;
    onSelectOne: (id: string, checked: boolean) => void;
    onViewLead?: (id: string) => void;
    onEditLead: (id: string) => void;
    onNewLead: () => void;
    sortField?: string;
    sortOrder?: 'asc' | 'desc';
    onSort?: (field: string) => void;
    onRowClick?: (lead: Lead) => void;
    activeLeadId?: string | null;
}

export function LeadsTable({
    leads,
    selectedIds,
    onSelectAll,
    onSelectOne,
    onViewLead,
    onEditLead,
    onNewLead,
    sortField,
    sortOrder,
    onSort,
    onRowClick,
    activeLeadId,
}: LeadsTableProps) {
    const todayStr = useMemo(() => new Date().toISOString().split('T')[0], []);

    // Declarative Column Definitions for Leads
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
                            <Typography
                                onClick={(e) => {
                                    e.stopPropagation();
                                    if (onRowClick) {
                                        onRowClick(l);
                                    } else if (onViewLead) {
                                        onViewLead(l.id);
                                    } else {
                                        onEditLead(l.id);
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
                                {l.name}
                            </Typography>
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
        [onEditLead, onViewLead, onRowClick, todayStr]
    );

    return (
        <DataTable<Lead>
            data={leads}
            columns={columns}
            keyExtractor={(l) => l.id}
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
            onViewRow={(l) => (onViewLead ? onViewLead(l.id) : onEditLead(l.id))}
            onEditRow={(l) => onEditLead(l.id)}
            onRowClick={onRowClick}
            activeRowId={activeLeadId}
            viewTooltip="View Lead Details"
            editTooltip="Edit Lead"
            actionsPosition="left"
            actionsWidth={70}
            actionsHeaderLabel="ACTIONS"
            emptyTitle="No leads in pipeline"
            emptyDescription="Record new prospective clients, followups, and product interests to begin converting sales."
            emptyActionLabel="Create Lead"
            onEmptyAction={onNewLead}
            emptyIcon={<PersonOutlinedIcon sx={{ fontSize: 48, color: '#cbd5e1' }} />}
            minHeight={300}
        />
    );
}
