import {
    COUNTRY_OPTIONS,
    DEFAULT_COUNTRY_CODE,
    getSubdivisionsByCountry,
    toPlainName,
} from '../data/addressMaster';

export const APP_CONFIG = {
    appName: 'Nandini Infosys CRM',
    companyName: 'Nandini Infosys',
    logoAlt: 'Nandini Infosys Logo',
    defaultExpiresIn: '8h',
} as const;

export const ROUTES = {
    HOME: '/',
    LOGIN: '/login',
    DASHBOARD: '/dashboard',
    ORGANIZATIONS: '/organizations',
    ORGANIZATION_NEW: '/organizations/new',
    ORGANIZATION_DETAIL: (id: string | number) => `/organizations/${id}`,
    ORGANIZATION_EDIT: (id: string | number) => `/organizations/${id}/edit`,
    CONTACTS: '/contacts',
    CONTACT_NEW: '/contacts/new',
    CONTACT_DETAIL: (id: string | number) => `/contacts/${id}`,
    CONTACT_EDIT: (id: string | number) => `/contacts/${id}/edit`,
    LEADS: '/leads',
    LEAD_NEW: '/leads/new',
    LEAD_DETAIL: (id: string | number) => `/leads/${id}`,
    LEAD_EDIT: (id: string | number) => `/leads/${id}/edit`,
    LEAD_CONVERT: (id: string | number) => `/leads/${id}/convert`,
    OPPORTUNITIES: '/opportunities',
    OPPORTUNITY_NEW: '/opportunities/new',
    OPPORTUNITY_DETAIL: (id: string | number) => `/opportunities/${id}`,
    OPPORTUNITY_EDIT: (id: string | number) => `/opportunities/${id}/edit`,
    OPPORTUNITY_CREATE_QUOTE: (id: string | number) => `/opportunities/${id}/quote`,
    QUOTATIONS: '/quotations',
    QUOTATION_DETAIL: (id: string | number) => `/quotations/${id}`,
    QUOTATION_EDIT: (id: string | number) => `/quotations/${id}/edit`,
    PRODUCTS: '/products',
    PRODUCT_NEW: '/products/new',
    PRODUCT_DETAIL: (id: string | number) => `/products/${id}`,
    PRODUCT_EDIT: (id: string | number) => `/products/${id}/edit`,
    TICKETS: '/tickets',
    TICKET_NEW: '/tickets/new',
    TICKET_DETAIL: (id: string | number) => `/tickets/${id}`,
    TICKET_EDIT: (id: string | number) => `/tickets/${id}/edit`,
};

// ── Address lists (derived from the ISO 3166 address master) ──────────────────
// Kept for backward compatibility while forms move to the country-aware helpers in src/data/addressMaster.ts.
// Values stay plain ASCII ('Haryana', not 'Haryāna') so they keep matching existing saved records.

/**
 * Indian states and union territories, alphabetical, without diacritics.
 * @deprecated Use getStateOptionLabelsForCountry(country) from '@/data/addressMaster'.
 */
export const INDIAN_STATES: string[] = getSubdivisionsByCountry(DEFAULT_COUNTRY_CODE).map((s) =>
    toPlainName(s.subdivisionName)
);

/**
 * Country display names (India first), plus the legacy 'Other' option that older records may hold.
 * @deprecated Use COUNTRY_OPTIONS from '@/data/addressMaster' and store iso2Code.
 */
export const COUNTRIES: string[] = [...COUNTRY_OPTIONS.map((c) => c.countryName), 'Other'];

export const REGISTRATION_TYPES: string[] = [
    'Registered',
    'Unregistered',
    'Composition Scheme',
    'Consumer',
    'Overseas / Export',
    'Special Economic Zone (SEZ)',
];

export const ACCOUNT_TYPES: string[] = [
    'Current Account',
    'Savings Account',
    'Cash Credit (CC)',
    'Overdraft (OD)',
    'Escrow Account',
    'Other',
];