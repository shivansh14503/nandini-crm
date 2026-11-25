/**
 * Module identity colors. Each CRM module has one hue, defined as CSS variables in color-scale.css
 * (`--crm-module-<key>-main|text|soft|border`) with separate light and dark values.
 *
 * Use them for a light tint that tells modules apart (search results, nav menus, drawer headers),
 * never for buttons, hovers, focus rings or links: those stay on the brand accent.
 */
export type ModuleKey =
    | 'leads'
    | 'opportunities'
    | 'quotations'
    | 'organizations'
    | 'contacts'
    | 'tickets'
    | 'contracts'
    | 'activities'
    | 'products'
    | 'partnerCompanies'
    | 'referrals';

export interface ModuleColor {
    /** Icons, accent strips, dots. */
    main: string;
    /** Text that sits on the soft tint. */
    text: string;
    /** Tinted surface (badge, icon tile, header band). */
    soft: string;
    /** Border for tinted surfaces. */
    border: string;
}

const CSS_NAME: Record<ModuleKey, string> = {
    leads: 'leads',
    opportunities: 'opportunities',
    quotations: 'quotations',
    organizations: 'organizations',
    contacts: 'contacts',
    tickets: 'tickets',
    contracts: 'contracts',
    activities: 'activities',
    products: 'products',
    partnerCompanies: 'partner-companies',
    referrals: 'referrals',
};

const build = (key: ModuleKey): ModuleColor => {
    const name = CSS_NAME[key];
    return {
        main: `var(--crm-module-${name}-main)`,
        text: `var(--crm-module-${name}-text)`,
        soft: `var(--crm-module-${name}-soft)`,
        border: `var(--crm-module-${name}-border)`,
    };
};

export const MODULE_COLORS: Record<ModuleKey, ModuleColor> = Object.fromEntries(
    (Object.keys(CSS_NAME) as ModuleKey[]).map((key) => [key, build(key)])
) as Record<ModuleKey, ModuleColor>;

export const getModuleColor = (key: ModuleKey): ModuleColor => MODULE_COLORS[key];

/** Module for a table / module id in any spelling ('partner-companies', 'partner_companies', 'quotes', …). */
export const moduleKeyFrom = (id: string | undefined): ModuleKey | undefined => {
    if (!id) return undefined;
    const compact = id.trim().toLowerCase().replace(/[-_\s]/g, '');
    if (compact === 'quotes') return 'quotations';
    return (Object.keys(CSS_NAME) as ModuleKey[]).find((key) => key.toLowerCase() === compact);
};

/**
 * CSS variables that tint a DataTable rendered inside this element (DataTable reads them, falling back to its
 * neutral colors). Spread into the wrapper's `sx`: only the header takes the module tint; rows stay on the plain surface.
 */
export const moduleTableTintVars = (key: ModuleKey) => {
    // Mixed from -main onto the paper (both opaque, so frozen columns still cover what scrolls under them).
    const { main } = MODULE_COLORS[key];
    const mix = (percent: number) => `color-mix(in srgb, ${main} ${percent}%, var(--mui-palette-background-paper))`;
    return {
        '--crm-table-header-bg': mix(12),
        '--crm-table-header-border': mix(30),
    } as const;
};

/** Module for a route path such as `/leads/123`, or undefined for pages outside the CRM modules. */
const ROUTE_PREFIX: [string, ModuleKey][] = [
    ['/leads', 'leads'],
    ['/opportunities', 'opportunities'],
    ['/quotations', 'quotations'],
    ['/organizations', 'organizations'],
    ['/contacts', 'contacts'],
    ['/tickets', 'tickets'],
    ['/contracts', 'contracts'],
    ['/products', 'products'],
    ['/partner-companies', 'partnerCompanies'],
    ['/referrals', 'referrals'],
];

export const moduleForPath = (href: string): ModuleKey | undefined =>
    ROUTE_PREFIX.find(([prefix]) => href === prefix || href.startsWith(`${prefix}/`))?.[1];
