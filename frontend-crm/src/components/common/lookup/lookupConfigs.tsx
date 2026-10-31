'use client';

import React from 'react';
import { Box, Typography } from '@mui/material';
import CheckIcon from '@mui/icons-material/Check';
import type { CrmUser } from '@/types/user.types';
import { CRM_USER_DEPARTMENTS } from '@/types/user.types';
import type { ExtendedOrganization } from '@/types/organization.types';
import type { Contact } from '@/types/contact.types';
import type { NatureOfCallItem } from '@/types/ticket.types';
import type { PartnerCompany, PartnerCompanyContact } from '@/types/partner.types';
import { ENTITY_TYPES, NATURE_OF_BUSINESS } from '@/components/organizations/constants';
import { INDIAN_STATES } from '@/config/constants';
import { findCrmUser, getCrmUsers } from '@/services/masterData.store';
import { getPartnerCompanies } from '@/services/masterData.store';
import { splitMulti } from '@/types/lookup.types';
import type { LookupColumn, LookupFilterField, LookupSearchPredicate } from '@/types/lookup.types';

export interface LookupPreset<T> {
    title: string;
    subtitle: string;
    searchPlaceholder: string;
    columns: LookupColumn<T>[];
    filterFields: LookupFilterField[];
    searchPredicate: LookupSearchPredicate<T>;
    showSearchBox?: boolean;
    rowsPerPage?: number;
    emptyMessage?: string;
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

/** Case-insensitive "contains" for a free-text filter; an empty filter matches everything. */
const containsText = (value: string | undefined, filter: string | undefined) =>
    !filter || (value || '').toLowerCase().includes(filter.toLowerCase());

/** Full name from the user directory, falling back to the stored username. */
const userName = (username: string | undefined) => findCrmUser(username)?.name || username || '';

const yesNoOptions = [
    { value: '', label: 'All' },
    { value: 'No', label: 'No' },
    { value: 'Yes', label: 'Yes' },
];

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
            options: yesNoOptions,
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

const toOptions = (values: readonly string[]) => values.map((v) => ({ value: v, label: v }));

/** Every email the record carries: corporate emails plus any legacy single-email field. */
const orgEmails = (o: ExtendedOrganization): string[] => {
    const legacy = o as unknown as { email?: string; primaryEmail?: string };
    return [...(o.corporateEmails ?? []).map((e) => e.email), legacy.email, legacy.primaryEmail].filter(
        (e): e is string => !!e
    );
};

export const ORGANIZATION_LOOKUP_PRESET: LookupPreset<ExtendedOrganization> = {
    title: 'Organization Search',
    subtitle: 'Select an organization. Click a row to choose it.',
    searchPlaceholder: '',
    showSearchBox: false,
    rowsPerPage: 10,
    emptyMessage: 'No organizations found matching search criteria',
    columns: [
        { id: 'organizationName', label: 'Name', minWidth: 240, sortable: true, render: (o) => <PrimaryText>{o.organizationName}</PrimaryText> },
        { id: 'customerType', label: 'Customer Type', minWidth: 130, sortable: true },
        { id: 'natureOfBusiness', label: 'Nature of Business', minWidth: 200, sortable: true },
        { id: 'assignedUser', label: 'User', minWidth: 140, sortable: true, getValue: (o) => userName(o.assignedUser) },
    ],
    filterFields: [
        { key: 'organizationName', label: 'Organization Name', type: 'text', width: 6 },
        { key: 'anyEmail', label: 'Any Email', type: 'text', width: 6 },
        { key: 'billingCity', label: 'Billing City', type: 'text', width: 6 },
        { key: 'billingState', label: 'Billing State', type: 'multiselect', width: 6, options: toOptions(INDIAN_STATES) },
        { key: 'natureOfBusiness', label: 'Nature of Business', type: 'multiselect', width: 6, options: toOptions(NATURE_OF_BUSINESS) },
        { key: 'typeOfEntity', label: 'Type of Entity', type: 'multiselect', width: 6, options: toOptions(ENTITY_TYPES) },
        {
            key: 'assignedUser',
            label: 'Assigned to',
            type: 'multiselect',
            width: 6,
            options: getCrmUsers()
                .map((u) => ({ value: u.username, label: u.name || u.username }))
                .sort((a, b) => a.label.localeCompare(b.label)),
        },
    ],
    searchPredicate: (o, f) => {
        if (!containsText(o.organizationName, f.organizationName?.trim())) return false;
        const email = f.anyEmail?.trim();
        if (email && !orgEmails(o).some((e) => containsText(e, email))) return false;
        if (!containsText(o.billingCity, f.billingCity?.trim())) return false;
        const states = splitMulti(f.billingState).map((s) => s.toLowerCase());
        if (states.length && !states.includes((o.billingState || '').toLowerCase())) return false;
        const natures = splitMulti(f.natureOfBusiness);
        if (natures.length && !natures.includes(o.natureOfBusiness)) return false;
        const entities = splitMulti(f.typeOfEntity);
        if (entities.length && !entities.includes(o.typeOfEntity)) return false;
        const users = splitMulti(f.assignedUser);
        if (users.length && !users.includes(o.assignedUser ?? '')) return false;
        return true;
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
        { id: 'organizationName', label: 'Organization Name', minWidth: 200 },
        { id: 'designation', label: 'Designation', minWidth: 150 },
        { id: 'mobile', label: 'Mobile', minWidth: 110 },
        { id: 'officePhone', label: 'Office Phone', minWidth: 110 },
        { id: 'leftJob', label: 'Left Job', minWidth: 80 },
        { id: 'assignedTo', label: 'Assigned to', minWidth: 140, getValue: (c) => userName(c.assignedTo) },
    ],
    filterFields: [
        { key: 'organizationName', label: 'Organization', type: 'text', width: 3 },
        { key: 'leftJob', label: 'Left Job', type: 'select', defaultValue: '', options: yesNoOptions },
    ],
    searchPredicate: (c, f, q) => {
        if (!containsText(c.organizationName, f.organizationName)) return false;
        if (f.leftJob && c.leftJob !== f.leftJob) return false;
        return includesQuery(q, c.name, c.mobile, c.officePhone, primaryEmail(c), c.contactCode);
    },
};

// ─── Nature of Call ───────────────────────────────────────────────────────────

const CALL_PRIORITY_COLORS: Record<NatureOfCallItem['priority'], { color: string; bg: string; border: string }> = {
    High: { color: '#dc2626', bg: '#fef2f2', border: '#fecaca' },
    Medium: { color: '#d97706', bg: '#fffbeb', border: '#fde68a' },
    Low: { color: '#2563eb', bg: '#eff6ff', border: '#bfdbfe' },
};

export const NATURE_OF_CALL_LOOKUP_PRESET: LookupPreset<NatureOfCallItem> = {
    title: 'Search Nature of Calls',
    subtitle: 'Select the nature of call. Click a row to choose it.',
    searchPlaceholder: 'Search call name...',
    columns: [
        { id: 'name', label: 'Name', minWidth: 260, render: (n) => <PrimaryText>{n.name}</PrimaryText> },
        {
            id: 'priority',
            label: 'Priority of Call',
            minWidth: 140,
            render: (n) => {
                const c = CALL_PRIORITY_COLORS[n.priority];
                return (
                    <Box
                        component="span"
                        sx={{ px: 1, py: 0.3, borderRadius: '6px', fontSize: '0.74rem', fontWeight: 700, color: c.color, backgroundColor: c.bg, border: `1px solid ${c.border}` }}
                    >
                        {n.priority}
                    </Box>
                );
            },
        },
    ],
    filterFields: [
        {
            key: 'priority',
            label: 'Priority',
            type: 'select',
            defaultValue: '',
            options: [
                { value: '', label: 'All' },
                { value: 'High', label: 'High' },
                { value: 'Medium', label: 'Medium' },
                { value: 'Low', label: 'Low' },
            ],
        },
    ],
    searchPredicate: (n, f, q) => {
        if (f.priority && n.priority !== f.priority) return false;
        return includesQuery(q, n.name);
    },
};

// ─── Partner Companies ────────────────────────────────────────────────────────

export const PARTNER_COMPANY_LOOKUP_PRESET: LookupPreset<PartnerCompany> = {
    title: 'Partner Company Search',
    subtitle: 'Select a partner company. Click a row to choose it.',
    searchPlaceholder: 'Company, phone or email',
    columns: [
        { id: 'companyName', label: 'Company Name', minWidth: 180, render: (p) => <PrimaryText>{p.companyName}</PrimaryText> },
        { id: 'natureOfPartner', label: 'Nature of Partner', minWidth: 180 },
        { id: 'phone', label: 'Phone', minWidth: 110 },
        { id: 'email', label: 'Email Address', minWidth: 210 },
        { id: 'city', label: 'City', minWidth: 100 },
        { id: 'billingCountry', label: 'Billing Country', minWidth: 110 },
        { id: 'assignedTo', label: 'Assigned to', minWidth: 130, getValue: (p) => userName(p.assignedTo) },
    ],
    filterFields: [
        { key: 'city', label: 'City', type: 'text', placeholder: 'e.g. Delhi' },
        {
            key: 'natureOfPartner',
            label: 'Nature of Partner',
            type: 'select',
            defaultValue: '',
            width: 3,
            options: [
                { value: '', label: 'All' },
                ...[...new Set(getPartnerCompanies().map((p) => p.natureOfPartner))].sort().map((n) => ({ value: n, label: n })),
            ],
        },
    ],
    searchPredicate: (p, f, q) => {
        if (!containsText(p.city, f.city)) return false;
        if (f.natureOfPartner && p.natureOfPartner !== f.natureOfPartner) return false;
        return includesQuery(q, p.companyName, p.phone, p.email);
    },
};

export const PARTNER_COMPANY_CONTACT_LOOKUP_PRESET: LookupPreset<PartnerCompanyContact> = {
    title: 'Partner Company Contact Search',
    subtitle: 'Select a partner contact. Click a row to choose it.',
    searchPlaceholder: 'Name, mobile or email',
    columns: [
        { id: 'name', label: 'Name', minWidth: 160, render: (c) => <PrimaryText>{c.name}</PrimaryText> },
        { id: 'designation', label: 'Designation', minWidth: 140 },
        { id: 'partnerCompany', label: 'Partner Company', minWidth: 160 },
        { id: 'mobile', label: 'Mobile', minWidth: 110 },
        { id: 'officePhone', label: 'Office Phone', minWidth: 110 },
        { id: 'email', label: 'Email Address', minWidth: 210 },
        { id: 'location', label: 'Location', minWidth: 100 },
    ],
    filterFields: [{ key: 'partnerCompany', label: 'Partner Company', type: 'text', width: 3 }],
    searchPredicate: (c, f, q) => {
        if (!containsText(c.partnerCompany, f.partnerCompany)) return false;
        return includesQuery(q, c.name, c.mobile, c.officePhone, c.email);
    },
};
