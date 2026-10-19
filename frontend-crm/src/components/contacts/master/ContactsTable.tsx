'use client';

import React, { useMemo } from 'react';
import {
    Box,
    Chip,
    IconButton,
    Tooltip,
    Typography,
} from '@mui/material';
import PersonOutlinedIcon from '@mui/icons-material/PersonOutlined';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import PhoneOutlinedIcon from '@mui/icons-material/PhoneOutlined';
import EmailOutlinedIcon from '@mui/icons-material/EmailOutlined';
import ApartmentIcon from '@mui/icons-material/Apartment';
import type { Contact } from '../../../types/contact.types';
import { DataTable, type DataTableColumn } from '../../common/DataTable';

export interface ContactsTableProps {
    contacts: Contact[];
    selectedIds: string[];
    onSelectAll: (checked: boolean) => void;
    onSelectOne: (id: string, checked: boolean) => void;
    onViewContact?: (id: string) => void;
    onEditContact: (id: string) => void;
    onNewContact: () => void;
    sortField?: string;
    sortOrder?: 'asc' | 'desc';
    onSort?: (field: string) => void;
    onRowClick?: (contact: Contact) => void;
    activeContactId?: string | null;
}

export function ContactsTable({
    contacts,
    selectedIds,
    onSelectAll,
    onSelectOne,
    onViewContact,
    onEditContact,
    onNewContact,
    sortField,
    sortOrder,
    onSort,
    onRowClick,
    activeContactId,
}: ContactsTableProps) {
    // Declarative Column Definitions for Contacts
    const columns: DataTableColumn<Contact>[] = useMemo(
        () => [
            {
                id: 'name',
                label: 'NAME',
                sortable: true,
                minWidth: 200,
                render: (c) => (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <PersonOutlinedIcon sx={{ fontSize: 16, color: '#2563eb' }} />
                        <Typography
                            onClick={(e) => {
                                e.stopPropagation();
                                if (onRowClick) {
                                    onRowClick(c);
                                } else if (onViewContact) {
                                    onViewContact(c.id);
                                } else {
                                    onEditContact(c.id);
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
                            {c.name}
                        </Typography>
                        {c.isPrimaryContact && (
                            <Chip
                                label="Primary"
                                size="small"
                                sx={{
                                    height: 18,
                                    fontSize: '0.64rem',
                                    fontWeight: 700,
                                    backgroundColor: '#eff6ff',
                                    color: '#1d4ed8',
                                    border: '1px solid #bfdbfe',
                                }}
                            />
                        )}
                    </Box>
                ),
            },
            {
                id: 'organizationName',
                label: 'ORGANIZATION',
                sortable: true,
                minWidth: 180,
                render: (c) => (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.8 }}>
                        <ApartmentIcon sx={{ fontSize: 14, color: '#64748b' }} />
                        <Typography sx={{ fontSize: '0.8rem', color: '#334155', fontWeight: 500 }}>
                            {c.organizationName || '-'}
                        </Typography>
                    </Box>
                ),
            },
            {
                id: 'mobile',
                label: 'MOBILE / PHONE',
                sortable: true,
                minWidth: 150,
                render: (c) => (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.6 }}>
                        <PhoneOutlinedIcon sx={{ fontSize: 14, color: '#94a3b8' }} />
                        <Typography sx={{ fontSize: '0.8rem', color: '#475569' }}>
                            {c.mobile || c.officePhone || '-'}
                        </Typography>
                    </Box>
                ),
            },
            {
                id: 'email',
                label: 'EMAIL',
                sortable: true,
                minWidth: 180,
                render: (c) => (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.6 }}>
                        <EmailOutlinedIcon sx={{ fontSize: 14, color: '#94a3b8' }} />
                        <Typography sx={{ fontSize: '0.8rem', color: '#475569' }}>
                            {c.emailAddresses?.[0]?.email || '-'}
                        </Typography>
                    </Box>
                ),
            },
            {
                id: 'designation',
                label: 'DESIGNATION',
                sortable: true,
                minWidth: 160,
                render: (c) => (
                    <Typography sx={{ fontSize: '0.78rem', color: '#334155', fontWeight: 500 }}>
                        {c.designation || c.department || '-'}
                    </Typography>
                ),
            },
            {
                id: 'assignedTo',
                label: 'ASSIGNED TO',
                sortable: true,
                minWidth: 140,
                render: (c) => (
                    <Typography sx={{ fontSize: '0.78rem', color: '#64748b' }}>
                        {c.assignedTo || 'mittal.sharma'}
                    </Typography>
                ),
            },
        ],
        [onEditContact, onViewContact, onRowClick]
    );

    return (
        <DataTable<Contact>
            data={contacts}
            columns={columns}
            keyExtractor={(c) => c.id}
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
            onViewRow={(c) => (onViewContact ? onViewContact(c.id) : onEditContact(c.id))}
            onEditRow={(c) => onEditContact(c.id)}
            onRowClick={onRowClick}
            activeRowId={activeContactId}
            viewTooltip="View Contact"
            editTooltip="Edit Contact"
            actionsPosition="left"
            actionsWidth={70}
            actionsHeaderLabel="ACTIONS"
            emptyTitle="No contacts recorded yet"
            emptyDescription="Create your first contact person and link them to an active organization account."
            emptyActionLabel="Create Contact"
            onEmptyAction={onNewContact}
            emptyIcon={<PersonOutlinedIcon sx={{ fontSize: 48, color: '#cbd5e1' }} />}
            minHeight={280}
        />
    );
}
