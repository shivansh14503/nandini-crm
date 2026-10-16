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
};