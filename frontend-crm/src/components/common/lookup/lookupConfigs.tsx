'use client';

import React from 'react';
import { Box, Typography } from '@mui/material';
import CheckIcon from '@mui/icons-material/Check';
import type { CrmUser } from '@/types/user.types';
import { CRM_USER_DEPARTMENTS } from '@/types/user.types';
import type { ExtendedOrganization } from '@/types/organization.types';
import type { Contact } from '@/types/contact.types';
import type { LookupColumn, LookupFilterField, LookupSearchPredicate } from '@/types/lookup.types';

export interface LookupPreset<T> {
    title: string;
    subtitle: string;
    searchPlaceholder: string;
    columns: LookupColumn<T>[];
    filterFields: LookupFilterField[];
    searchPredicate: LookupSearchPredicate<T>;
}

// ─── Shared cell renderers ────────────────────────────────────────────────────

export function StatusChip({ status }: { status: string }) {
    const isActive = status === 'Active';
    const isInactive = status === 'Inactive';
    const bg = isActive ? '#ecfdf5' : isInactive ? '#fef2f2' : '#f1f5f9';
    const color = isActive ? '#059669' : isInactive ? '#dc2626' : '#64748b';
    const border = isActive ? '#a7f3d0' : isInactive ? '#fecaca' : '#e2e8f0';
    const dot = isActive ? '#10b981' : isInactive ? '#ef4444' : '#94a3b8';
    return (
        <Box
            component="span"
            sx={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 0.6,
                px: 0.9,
                py: 0.2,
                borderRadius: '12px',
                fontSize: '0.72rem',
                fontWeight: 700,
                backgroundColor: bg,
                color,
                border: `1px solid ${border}`,
            }}
        >
            <Box component="span" sx={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: dot }} />
            {status || '-'}
        </Box>
    );
}

const PrimaryText = ({ children }: { children: React.ReactNode }) => (
    <Typography sx={{ fontSize: '0.82rem', fontWeight: 700, color: '#1d4ed8', '&:hover': { textDecoration: 'underline' } }}>
        {children}
    </Typography>
);

const includesQuery = (query: string, ...values: (string | undefined)[]) =>
    !query || values.some((v) => (v || '').toLowerCase().includes(query));

const statusOptions = [
    { value: 'Active', label: 'Active' },
    { value: 'Inactive', label: 'Inactive' },
    { value: '', label: 'All' },
];

// ─── Users ────────────────────────────────────────────────────────────────────

export const USER_LOOKUP_PRESET: LookupPreset<CrmUser> = {
    title: 'User Search',
    subtitle: 'Select the user to assign. Click a row to choose it.',
    searchPlaceholder: 'Name or username',
    columns: [
        { id: 'name', label: 'Name', minWidth: 160, render: (u) => <PrimaryText>{u.name}</PrimaryText> },
        { id: 'username', label: 'Username', minWidth: 130 },
        { id: 'department', label: 'Department', minWidth: 110 },
        { id: 'role', label: 'Role', minWidth: 170 },
        { id: 'email', label: 'Email', minWidth: 220 },
        { id: 'status', label: 'Status', render: (u) => <StatusChip status={u.status} /> },
        {
            id: 'onLeave',
            label: 'On Leave',
            align: 'center',
            width: 90,
            getValue: (u) => (u.onLeave ? 'Yes' : 'No'),
            render: (u) =>
                u.onLeave ? (
                    <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                        <CheckIcon
                            aria-label="On leave"
                            sx={{ fontSize: 18, color: '#dc2626', stroke: '#dc2626', strokeWidth: 1 }}
                        />
                    </Box>
                ) : (
                    <Typography component="span" aria-label="Not on leave" sx={{ color: '#cbd5e1', fontSize: '0.85rem' }}>
                        -
                    </Typography>
                ),
        },
    ],
    filterFields: [
        {
            key: 'isGroupUser',
            label: 'Group User',
            type: 'select',
            defaultValue: 'No',
            options: [
                { value: '', label: 'All' },
                { value: 'No', label: 'No' },
                { value: 'Yes', label: 'Yes' },
            ],
        },
        { key: 'status', label: 'Status', type: 'select', defaultValue: 'Active', options: statusOptions },
        {
            key: 'department',
            label: 'Department',
            type: 'select',
            defaultValue: '',
            options: [{ value: '', label: 'All' }, ...CRM_USER_DEPARTMENTS.map((d) => ({ value: d, label: d }))],
        },
    ],
    searchPredicate: (u, f, q) => {
        if (f.isGroupUser && (u.isGroupUser ? 'Yes' : 'No') !== f.isGroupUser) return false;
        if (f.status && u.status !== f.status) return false;
        if (f.department && u.department !== f.department) return false;
        return includesQuery(q, u.name, u.username, u.email);
    },
};

// ─── Organizations ────────────────────────────────────────────────────────────

export const ORGANIZATION_LOOKUP_PRESET: LookupPreset<ExtendedOrganization> = {
    title: 'Organization Search',
    subtitle: 'Select an organization. Click a row to choose it.',
    searchPlaceholder: 'Name, code, city or GST',
    columns: [
        { id: 'organizationName', label: 'Organization Name', minWidth: 220, render: (o) => <PrimaryText>{o.organizationName}</PrimaryText> },
        { id: 'accountCode', label: 'Account Code', minWidth: 110 },
        { id: 'customerType', label: 'Customer Type', minWidth: 120 },
        { id: 'billingCity', label: 'City', minWidth: 110 },
        { id: 'billingState', label: 'State', minWidth: 110 },
        { id: 'accountStatus', label: 'Status', render: (o) => <StatusChip status={o.accountStatus} /> },
    ],
    filterFields: [
        { key: 'accountStatus', label: 'Status', type: 'select', defaultValue: '', options: statusOptions },
        { key: 'billingCity', label: 'City', type: 'text', placeholder: 'e.g. Delhi' },
    ],
    searchPredicate: (o, f, q) => {
        if (f.accountStatus && o.accountStatus !== f.accountStatus) return false;
        if (f.billingCity && !(o.billingCity || '').toLowerCase().includes(f.billingCity.toLowerCase())) return false;
        return includesQuery(q, o.organizationName, o.tradeName, o.accountCode, o.billingCity, o.gstNumber, o.gstNo);
    },
};

// ─── Contacts ─────────────────────────────────────────────────────────────────

const primaryEmail = (c: Contact) => (c.emailAddresses.find((e) => e.isPrimary) ?? c.emailAddresses[0])?.email ?? '';

export const CONTACT_LOOKUP_PRESET: LookupPreset<Contact> = {
    title: 'Contact Search',
    subtitle: 'Select a contact. Click a row to choose it.',
    searchPlaceholder: 'Name, mobile or email',
    columns: [
        { id: 'name', label: 'Name', minWidth: 160, render: (c) => <PrimaryText>{c.name}</PrimaryText> },
        { id: 'organizationName', label: 'Organization', minWidth: 200 },
        { id: 'designation', label: 'Designation', minWidth: 150 },
        { id: 'mobile', label: 'Mobile', minWidth: 110 },
        { id: 'email', label: 'Email', minWidth: 200, getValue: primaryEmail },
    ],
    filterFields: [{ key: 'organizationName', label: 'Organization', type: 'text', width: 3 }],
    searchPredicate: (c, f, q) => {
        if (f.organizationName && !c.organizationName.toLowerCase().includes(f.organizationName.toLowerCase())) return false;
        return includesQuery(q, c.name, c.mobile, primaryEmail(c), c.contactCode);
    },
};
