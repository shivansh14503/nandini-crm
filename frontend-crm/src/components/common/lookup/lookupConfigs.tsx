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
import type { Opportunity } from '@/types/opportunity.types';
import type { NatureOfCallItem } from '@/types/ticket.types';
import type { PartnerCompany, PartnerCompanyContact } from '@/types/partner.types';
import type { Product } from '@/types/product.types';
import type { Referral } from '@/types/referral.types';
import { CUSTOMER_TYPES, ENTITY_TYPES, NATURE_OF_BUSINESS } from '@/components/organizations/constants';
import { findCrmUser } from '@/services/masterData.store';
import { getCountryNameByCode } from '@/data/addressMaster';
import { formatDateTime } from '@/utils/date';
import { opportunityLabel } from '@/utils/opportunityLabel';
import { splitMulti } from '@/types/lookup.types';
import type { LookupColumn, LookupCopy, LookupFilterField, LookupSearchPredicate } from '@/types/lookup.types';

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
    recordLabel?: { one: string; other: string };
}

/** A preset with a field's own wording (see LookupCopy) applied; unchanged without one. */
export function applyLookupCopy<T>(preset: LookupPreset<T>, copy?: LookupCopy): LookupPreset<T> {
    if (!copy) return preset;
    return {
        ...preset,
        title: copy.title ?? preset.title,
        subtitle: copy.subtitle ?? preset.subtitle,
        emptyMessage: copy.emptyMessage ?? preset.emptyMessage,
        recordLabel: copy.recordLabel ?? preset.recordLabel,
        filterFields: preset.filterFields.map((f) => ({ ...f, ...copy.filters?.[f.key] })),
        columns: preset.columns
            .filter((c) => copy.columns?.[c.id] !== null)
            .map((c) => (copy.columns?.[c.id] ? { ...c, label: copy.columns[c.id] as string } : c)),
    };
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
        { id: 'assignedTo', label: 'User', minWidth: 140, sortable: true, getValue: (o) => userName(o.assignedTo) },
    ],
    filterFields: [
        { key: 'organizationName', label: 'Organization Name', type: 'text', width: 4, placeholder: 'Type organization name...' },
        { key: 'customerType', label: 'Customer Type', type: 'multiselect', width: 4, options: toOptions(CUSTOMER_TYPES) },
        { key: 'natureOfBusiness', label: 'Nature of Business', type: 'multiselect', width: 4, options: toOptions(NATURE_OF_BUSINESS) },
        // Options come from the user directory, which loads after import; OrganizationLookupModal fills them in.
        { key: 'assignedTo', label: 'Assigned to', type: 'multiselect', width: 4, options: [] },
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
        const users = splitMulti(f.assignedTo);
        if (users.length && !users.includes(o.assignedTo ?? '')) return false;
        if (q && !includesQuery(q, o.organizationName, o.customerType, o.natureOfBusiness, o.typeOfEntity, userName(o.assignedTo))) return false;
        return true;
    },
};

/** Filter order of the partner-only organization picker (Partner Company Search). */
const PARTNER_FILTER_ORDER = ['organizationName', 'natureOfPartner', 'typeOfEntity', 'customerType', 'assignedTo'];

/**
 * The organization picker when it offers partner organizations only (its Customer Type locked to Partner, as for a
 * Partner Company): Nature of Partner, the partner's own kind, takes Nature of Business's place as filter and column.
 */
export function partnerOrganizationPreset(
    preset: LookupPreset<ExtendedOrganization>,
    natureOptions: readonly { value: string; label: string }[],
    natureLabel: (value: string) => string = (v) => v
): LookupPreset<ExtendedOrganization> {
    const filterFields = preset.filterFields.map((f) =>
        f.key === 'natureOfBusiness' ? { key: 'natureOfPartner', label: 'Nature of Partner', type: 'multiselect' as const, width: f.width, options: [...natureOptions] } : f
    );
    const rank = (key: string) => {
        const i = PARTNER_FILTER_ORDER.indexOf(key);
        return i === -1 ? PARTNER_FILTER_ORDER.length : i;
    };
    return {
        ...preset,
        // Partner pickers lay their filters out in their own order (stable sort: unlisted filters keep theirs, last).
        filterFields: [...filterFields].sort((a, b) => rank(a.key) - rank(b.key)),
        columns: preset.columns.map((c) =>
            c.id === 'natureOfBusiness'
                ? { id: 'natureOfPartner', label: 'Nature of Partner', minWidth: c.minWidth, sortable: true, getValue: (o: ExtendedOrganization) => natureLabel(o.natureOfPartner ?? '') }
                : c
        ),
        searchPredicate: (o, f, q) => {
            const natures = splitMulti(f.natureOfPartner);
            if (natures.length && !natures.includes(o.natureOfPartner ?? '')) return false;
            if (q && !includesQuery(q, o.organizationName, o.customerType, natureLabel(o.natureOfPartner ?? ''), o.typeOfEntity, userName(o.assignedTo))) return false;
            return preset.searchPredicate(o, { ...f, natureOfBusiness: '' }, '');
        },
    };
}

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
        if (email && !c.emailAddress.some((e) => containsText(e.email, email))) return false;
        const leftJob = splitMulti(f.leftJob);
        if (leftJob.length && !leftJob.includes(c.leftJob)) return false;
        const owners = splitMulti(f.assignedTo);
        if (owners.length && !owners.includes(c.assignedTo)) return false;
        return true;
    },
};

// ─── Opportunities ────────────────────────────────────────────────────────────

export const OPPORTUNITY_LOOKUP_PRESET: LookupPreset<Opportunity> = {
    title: 'Opportunity Search',
    subtitle: 'Select an opportunity. Click a row to choose it.',
    searchPlaceholder: 'Name, organization, contact or number',
    rowsPerPage: 10,
    emptyMessage: 'No opportunities found matching search criteria',
    columns: [
        // Only while opportunity numbers are shown (OpportunityLookupModal drops it otherwise).
        { id: 'opportunityCode', label: 'Number', minWidth: 120, sortable: true },
        { id: 'opportunityName', label: 'Name', minWidth: 220, sortable: true, getValue: opportunityLabel, render: (o) => <PrimaryText>{opportunityLabel(o)}</PrimaryText> },
        { id: 'organizationName', label: 'Organization', minWidth: 200, sortable: true },
        { id: 'contact', label: 'Contact', minWidth: 150, sortable: true },
        { id: 'salesStage', label: 'Sales Stage', minWidth: 140, sortable: true },
        { id: 'assignedTo', label: 'Assigned to', minWidth: 140, sortable: true, getValue: (o) => userName(o.assignedTo) },
    ],
    filterFields: [
        { key: 'organizationName', label: 'Organization Name', type: 'text', width: 4, placeholder: 'Organization...' },
        // Options come from the form configuration and the user directory; OpportunityLookupModal fills them in.
        { key: 'salesStage', label: 'Sales Stage', type: 'multiselect', width: 4, options: [] },
        { key: 'assignedTo', label: 'Assigned to', type: 'multiselect', width: 4, options: [] },
    ],
    searchPredicate: (o, f, q) => {
        if (!containsText(o.organizationName, f.organizationName?.trim())) return false;
        const stages = splitMulti(f.salesStage);
        if (stages.length && !stages.includes(o.salesStage)) return false;
        const owners = splitMulti(f.assignedTo);
        if (owners.length && !owners.includes(o.assignedTo)) return false;
        return includesQuery(q, opportunityLabel(o), o.organizationName, o.contact, o.opportunityCode);
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
        { id: 'partnerName', label: 'Partner Name', minWidth: 180, sortable: true, render: (p) => <PrimaryText>{p.partnerName}</PrimaryText> },
        { id: 'natureOfPartner', label: 'Nature of Partner', minWidth: 170, sortable: true },
        { id: 'officePhone', label: 'Office Phone', minWidth: 120, sortable: true },
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
        { key: 'partnerName', label: 'Partner Name', type: 'text', width: 4, placeholder: 'Search partner name...' },
        { key: 'phone', label: 'Any Phone', type: 'text', width: 4, placeholder: 'Search phone...' },
        { key: 'city', label: 'City', type: 'text', width: 4, placeholder: 'e.g. Delhi, Karnal...' },
        // Options depend on master data that loads after import; PartnerCompanyLookupModal fills them in.
        { key: 'natureOfPartner', label: 'Nature of Partner', type: 'multiselect', width: 6, options: [] },
        { key: 'assignedTo', label: 'Assigned to', type: 'multiselect', width: 6, options: [] },
    ],
    searchPredicate: (p, f) => {
        if (!containsText(p.partnerName, f.partnerName?.trim())) return false;
        if (!containsText(p.officePhone, f.phone?.trim())) return false;
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

// ─── Referrals (Referred By) ──────────────────────────────────────────────────

const primaryEmail = (r: Referral) => (r.emailAddress?.find((e) => e.isPrimary) ?? r.emailAddress?.[0])?.email ?? '';

/** Referred By picker: lists the Active referrals (ReferralLookupModal passes only those). */
export const REFERRAL_LOOKUP_PRESET: LookupPreset<Referral> = {
    title: 'Referral Search',
    subtitle: 'Select an active referral. Click a row to choose it.',
    searchPlaceholder: 'Name, organization, mobile or email',
    rowsPerPage: 10,
    columns: [
        { id: 'name', label: 'Name', minWidth: 170, sortable: true, render: (r) => <PrimaryText>{r.name}</PrimaryText> },
        { id: 'organizationName', label: 'Organization', minWidth: 180, sortable: true },
        { id: 'mobile', label: 'Mobile', minWidth: 120, sortable: true },
        { id: 'email', label: 'Email Address', minWidth: 200, getValue: primaryEmail },
        { id: 'designation', label: 'Designation', minWidth: 130, sortable: true },
        { id: 'assignedTo', label: 'Assigned to', minWidth: 140, sortable: true, getValue: (r) => userName(r.assignedTo) },
    ],
    filterFields: [
        { key: 'name', label: 'Name', type: 'text', width: 4, placeholder: 'Search referral name...' },
        { key: 'organizationName', label: 'Organization', type: 'text', width: 4, placeholder: 'Search organization...' },
        { key: 'phone', label: 'Any Phone', type: 'text', width: 4, placeholder: 'Search phone...' },
    ],
    searchPredicate: (r, f, q) => {
        if (!containsText(r.name, f.name?.trim())) return false;
        if (!containsText(r.organizationName, f.organizationName?.trim())) return false;
        if (f.phone?.trim() && !containsPhone(r.mobile, f.phone) && !containsPhone(r.officePhone, f.phone)) return false;
        return includesQuery(q, r.name, r.organizationName, r.mobile, r.officePhone, primaryEmail(r));
    },
};

// ─── Products (line items) ────────────────────────────────────────────────────

/** A product's MRP as the catalog shows it (₹27,000.00); empty when it has none. */
export function formatProductMrp(mrp: string | number | undefined): string {
    const n = Number(mrp);
    return mrp === '' || mrp === undefined || !Number.isFinite(n)
        ? ''
        : `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export const PRODUCT_LOOKUP_PRESET: LookupPreset<Product> = {
    title: 'Product Catalog',
    subtitle: 'Search by category or product name. Click a row to add it to the line.',
    searchPlaceholder: '',
    showSearchBox: false,
    rowsPerPage: 10,
    emptyMessage: 'No products found matching search criteria',
    columns: [
        { id: 'productName', label: 'Name', minWidth: 240, sortable: true, render: (p) => <PrimaryText>{p.productName}</PrimaryText> },
        { id: 'category', label: 'Category', minWidth: 150, sortable: true },
        { id: 'hsnCode', label: 'HSN Code', minWidth: 100, sortable: true },
        { id: 'mrp', label: 'MRP', minWidth: 120, align: 'right', sortable: true, getValue: (p) => formatProductMrp(p.mrp) },
        {
            id: 'description',
            label: 'Description',
            minWidth: 220,
            render: (p) => (
                <Typography sx={{ fontSize: '0.8rem', color: 'var(--mui-palette-text-secondary)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                    {p.description}
                </Typography>
            ),
        },
    ],
    filterFields: [
        // Options are the categories of the loaded products; ProductLookupModal fills them in.
        { key: 'category', label: 'Category', type: 'multiselect', width: 6, options: [] },
        { key: 'productName', label: 'Product Name', type: 'text', width: 6, placeholder: 'Type product name...' },
    ],
    searchPredicate: (p, f) => {
        const categories = splitMulti(f.category);
        if (categories.length && !categories.includes(p.category)) return false;
        return containsText(p.productName, f.productName?.trim());
    },
};
