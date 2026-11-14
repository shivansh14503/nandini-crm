'use client';

import React from 'react';
import { Box, IconButton, Tooltip, Typography } from '@mui/material';
import PhoneInTalkOutlinedIcon from '@mui/icons-material/PhoneInTalkOutlined';
import SmsOutlinedIcon from '@mui/icons-material/SmsOutlined';
import WhatsAppIcon from '@mui/icons-material/WhatsApp';
import { smsHref, telHref, whatsappHref } from '@/utils/contactLinks';
import type { CrmUser } from '@/types/user.types';
import { CRM_USER_DEPARTMENTS } from '@/types/user.types';
import type { ExtendedOrganization } from '@/types/organization.types';
import type { Contact } from '@/types/contact.types';
import type { NatureOfCallItem } from '@/types/ticket.types';
import type { PartnerCompany, PartnerCompanyContact } from '@/types/partner.types';
import { CUSTOMER_TYPES, ENTITY_TYPES, NATURE_OF_BUSINESS } from '@/components/organizations/constants';
import { findCrmUser } from '@/services/masterData.store';
import { getCountryNameByCode } from '@/data/addressMaster';
import { formatDateTime } from '@/utils/date';
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
    const bg = isActive ? 'var(--mui-palette-success-soft)' : isInactive ? 'var(--mui-palette-error-soft)' : 'var(--mui-palette-background-hover)';
    const color = isActive ? 'var(--crm-emerald-600)' : isInactive ? 'var(--mui-palette-error-main)' : 'var(--mui-palette-text-secondary)';
    const border = isActive ? 'var(--mui-palette-success-softBorder)' : isInactive ? 'var(--mui-palette-error-softBorder)' : 'var(--mui-palette-border-main)';
    const dot = isActive ? 'var(--crm-emerald-500)' : isInactive ? 'var(--crm-red-500)' : 'var(--mui-palette-text-muted)';
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
    <Typography sx={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--crm-blue-700)', '&:hover': { textDecoration: 'underline' } }}>
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
    ],
    filterFields: [
        {
            key: 'isGroupUser',
            label: 'Group User',
            type: 'select',
            defaultValue: 'No',
            options: yesNoOptions,
        },
        {
            key: 'department',
            label: 'Department',
            type: 'select',
            defaultValue: '',
            options: [{ value: '', label: 'All' }, ...CRM_USER_DEPARTMENTS.map((d) => ({ value: d, label: d }))],
        },
    ],
    searchPredicate: (u, f, q) => {
        // Only active users can be assigned; there is deliberately no way to list inactive ones.
        if (u.status !== 'Active') return false;
        if (f.isGroupUser && (u.isGroupUser ? 'Yes' : 'No') !== f.isGroupUser) return false;
        if (f.department && u.department !== f.department) return false;
        return includesQuery(q, u.name, u.username, u.email);
    },
};

// ─── Organizations ────────────────────────────────────────────────────────────

const toOptions = (values: readonly string[]) => values.map((v) => ({ value: v, label: v }));

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
        { id: 'typeOfEntity', label: 'Type of Entity', minWidth: 150, sortable: true },
        { id: 'assignedUser', label: 'User', minWidth: 140, sortable: true, getValue: (o) => userName(o.assignedUser) },
    ],
    filterFields: [
        { key: 'organizationName', label: 'Organization Name', type: 'text', width: 4, placeholder: 'Type organization name...' },
        { key: 'customerType', label: 'Customer Type', type: 'multiselect', width: 4, options: toOptions(CUSTOMER_TYPES) },
        { key: 'natureOfBusiness', label: 'Nature of Business', type: 'multiselect', width: 4, options: toOptions(NATURE_OF_BUSINESS) },
        // Options come from the user directory, which loads after import; OrganizationLookupModal fills them in.
        { key: 'assignedUser', label: 'Assigned to', type: 'multiselect', width: 4, options: [] },
        { key: 'typeOfEntity', label: 'Type of Entity', type: 'multiselect', width: 4, options: toOptions(ENTITY_TYPES) },
    ],
    searchPredicate: (o, f, q) => {
        if (!containsText(o.organizationName, f.organizationName?.trim())) return false;
        const customerTypes = splitMulti(f.customerType);
        if (customerTypes.length && !customerTypes.includes(o.customerType)) return false;
        const natures = splitMulti(f.natureOfBusiness);
        if (natures.length && !natures.includes(o.natureOfBusiness)) return false;
        const entities = splitMulti(f.typeOfEntity);
        if (entities.length && !entities.includes(o.typeOfEntity)) return false;
        const users = splitMulti(f.assignedUser);
        if (users.length && !users.includes(o.assignedUser ?? '')) return false;
        if (q && !includesQuery(q, o.organizationName, o.customerType, o.natureOfBusiness, o.typeOfEntity, userName(o.assignedUser))) return false;
        return true;
    },
};

// ─── Contacts ─────────────────────────────────────────────────────────────────

/** A contact row in the picker: the contact plus its organization's Customer Type (looked up by the modal). */
export type ContactLookupRow = Contact & { customerType: string };

/** Digits only, so "98100 12345", "+91-9810012345" and "9810012345" all match a typed "98100". */
const phoneDigits = (value: string | undefined) => (value ?? '').replace(/\D/g, '');
const containsPhone = (value: string | undefined, filter: string | undefined) => {
    const wanted = phoneDigits(filter);
    return !wanted || phoneDigits(value).includes(wanted);
};

/** Mobile number with call / SMS / WhatsApp shortcuts (call and SMS hidden when the contact is on Do Not Call). */
function ContactMobileCell({ contact }: { contact: Contact }) {
    if (!contact.mobile) return <>-</>;
    const actions = [
        ...(contact.doNotCall
            ? []
            : [
                  { label: 'Call', href: telHref(contact.mobile), icon: <PhoneInTalkOutlinedIcon sx={{ fontSize: 14 }} />, color: 'var(--crm-text-blue-600)' },
                  { label: 'Send SMS', href: smsHref(contact.mobile), icon: <SmsOutlinedIcon sx={{ fontSize: 14 }} />, color: 'var(--crm-violet-600)' },
              ]),
        { label: 'WhatsApp', href: whatsappHref(contact.mobile), icon: <WhatsAppIcon sx={{ fontSize: 14 }} />, color: 'var(--mui-palette-success-main)', external: true },
    ].filter((a) => a.href);
    return (
        <Box>
            <Box sx={{ display: 'flex', gap: 0.5, mb: 0.3 }}>
                {actions.map((a) => (
                    <Tooltip key={a.label} title={a.label}>
                        <IconButton
                            component="a"
                            href={a.href}
                            aria-label={`${a.label} ${contact.name}`}
                            size="small"
                            // A shortcut, not a pick: don't select the row.
                            onClick={(e: React.MouseEvent) => e.stopPropagation()}
                            onKeyDown={(e: React.KeyboardEvent) => e.stopPropagation()}
                            {...('external' in a && a.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                            sx={{ width: 24, height: 24, color: a.color, border: '1px solid var(--mui-palette-border-main)', borderRadius: '6px' }}
                        >
                            {a.icon}
                        </IconButton>
                    </Tooltip>
                ))}
            </Box>
            <Typography sx={{ fontSize: '0.8rem', color: 'var(--crm-slate-600)' }}>{contact.mobile}</Typography>
        </Box>
    );
}

export const CONTACT_LOOKUP_PRESET: LookupPreset<ContactLookupRow> = {
    title: 'Contact Search',
    subtitle: 'Select a contact. Click a row to choose it.',
    searchPlaceholder: '',
    showSearchBox: false,
    rowsPerPage: 10,
    emptyMessage: 'No contacts found matching search criteria',
    columns: [
        { id: 'name', label: 'Name', minWidth: 160, sortable: true, render: (c) => <PrimaryText>{c.name}</PrimaryText> },
        { id: 'organizationName', label: 'Organization Name', minWidth: 190, sortable: true },
        { id: 'customerType', label: 'Customer Type', minWidth: 120, sortable: true },
        { id: 'mobile', label: 'Mobile', minWidth: 130, sortable: true, render: (c) => <ContactMobileCell contact={c} /> },
        { id: 'officePhone', label: 'Office Phone', minWidth: 120, sortable: true },
        { id: 'leftJob', label: 'Left Job', minWidth: 80, sortable: true },
        { id: 'assignedTo', label: 'Assigned to', minWidth: 140, sortable: true, getValue: (c) => userName(c.assignedTo) },
    ],
    filterFields: [
        { key: 'name', label: 'Name', type: 'text', width: 4, placeholder: 'Contact name...' },
        { key: 'mobile', label: 'Mobile', type: 'text', width: 4, placeholder: 'Mobile number...' },
        { key: 'leftJob', label: 'Left Job', type: 'multiselect', width: 4, options: toOptions(['No', 'Yes']) },
        { key: 'officePhone', label: 'Office Phone', type: 'text', width: 4, placeholder: 'Office phone...' },
        { key: 'email', label: 'Any Email', type: 'text', width: 4, placeholder: 'Any of the contact’s emails...' },
        { key: 'organizationName', label: 'Organization Name', type: 'text', width: 4, placeholder: 'Organization...' },
        // Options come from the user directory, which loads after import; ContactLookupModal fills them in.
        { key: 'assignedTo', label: 'Assigned to', type: 'multiselect', width: 4, options: [] },
    ],
    searchPredicate: (c, f) => {
        if (!containsText(c.name, f.name?.trim())) return false;
        if (!containsPhone(c.mobile, f.mobile)) return false;
        if (!containsPhone(c.officePhone, f.officePhone)) return false;
        if (!containsText(c.organizationName, f.organizationName?.trim())) return false;
        const email = f.email?.trim();
        if (email && !c.emailAddresses.some((e) => containsText(e.email, email))) return false;
        const leftJob = splitMulti(f.leftJob);
        if (leftJob.length && !leftJob.includes(c.leftJob)) return false;
        const owners = splitMulti(f.assignedTo);
        if (owners.length && !owners.includes(c.assignedTo)) return false;
        return true;
    },
};

// ─── Nature of Call ───────────────────────────────────────────────────────────

const CALL_PRIORITY_COLORS: Record<NatureOfCallItem['priority'], { color: string; bg: string; border: string }> = {
    High: { color: 'var(--mui-palette-error-main)', bg: 'var(--mui-palette-error-soft)', border: 'var(--mui-palette-error-softBorder)' },
    Medium: { color: 'var(--mui-palette-warning-main)', bg: 'var(--mui-palette-warning-soft)', border: 'var(--mui-palette-warning-softBorder)' },
    Low: { color: 'var(--crm-text-blue-600)', bg: 'var(--mui-palette-primary-soft)', border: 'var(--mui-palette-primary-softBorder)' },
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
    searchPlaceholder: '',
    showSearchBox: false,
    rowsPerPage: 10,
    columns: [
        { id: 'companyName', label: 'Company Name', minWidth: 180, sortable: true, render: (p) => <PrimaryText>{p.companyName}</PrimaryText> },
        { id: 'natureOfPartner', label: 'Nature of Partner', minWidth: 170, sortable: true },
        { id: 'phone', label: 'Phone', minWidth: 120, sortable: true },
        { id: 'email', label: 'Email Address', minWidth: 200 },
        { id: 'city', label: 'City', minWidth: 110, sortable: true },
        {
            id: 'billingCountry',
            label: 'Billing Country',
            minWidth: 120,
            sortable: true,
            getValue: (p) => getCountryNameByCode(p.billingCountry) || p.billingCountry || '',
        },
        { id: 'assignedTo', label: 'Assigned to', minWidth: 140, sortable: true, getValue: (p) => userName(p.assignedTo) },
        { id: 'createdAt', label: 'Date Created', minWidth: 140, sortable: true, getValue: (p) => (p.createdAt ? formatDateTime(p.createdAt) : '-') },
    ],
    filterFields: [
        { key: 'companyName', label: 'Partner Name', type: 'text', width: 4, placeholder: 'Search partner name...' },
        { key: 'phone', label: 'Any Phone', type: 'text', width: 4, placeholder: 'Search phone...' },
        { key: 'city', label: 'City', type: 'text', width: 4, placeholder: 'e.g. Delhi, Karnal...' },
        // Options depend on master data that loads after import; PartnerCompanyLookupModal fills them in.
        { key: 'natureOfPartner', label: 'Nature of Partner', type: 'multiselect', width: 6, options: [] },
        { key: 'assignedTo', label: 'Assigned to', type: 'multiselect', width: 6, options: [] },
    ],
    searchPredicate: (p, f) => {
        if (!containsText(p.companyName, f.companyName?.trim())) return false;
        if (!containsText(p.phone, f.phone?.trim())) return false;
        if (!containsText(p.city, f.city?.trim())) return false;
        const natures = splitMulti(f.natureOfPartner);
        if (natures.length && !natures.includes(p.natureOfPartner)) return false;
        const owners = splitMulti(f.assignedTo);
        if (owners.length && !owners.includes(p.assignedTo)) return false;
        return true;
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
