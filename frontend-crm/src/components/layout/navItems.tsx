import { Box } from '@mui/material';
import HomeIcon from '@mui/icons-material/Home';
import { getModuleColor, moduleForPath } from '@/theme/moduleColors';
import { ROUTES } from '@/config/constants';
import { isAdminRole } from '@/utils/adminRoles';

export interface NavLinkItem {
    label: string;
    href: string;
    /**
     * Nested routes under this item. The navbar shows them in a flyout to the right (hover, or tap / click the
     * chevron, or ArrowRight); the phone / tablet menu shows them as an inline expandable list. The item's own
     * label still links to `href`.
     */
    children?: readonly NavLinkItem[];
    /** Shown only to admin roles (`isAdminRole`); see `navGroupsFor`. */
    adminOnly?: boolean;
}

export interface NavGroup {
    label: string;
    icon?: React.ReactNode;
    items: readonly NavLinkItem[];
}

/** Main navigation: navbar pills on wide screens, the menu drawer on phones and tablets. */
export const NAV_ITEMS: readonly NavGroup[] = [
    {
        label: 'Home',
        icon: <HomeIcon fontSize="small" />,
        items: [
            { label: 'Dashboard', href: '/dashboard' },
            { label: 'My Activities', href: `${ROUTES.ACTIVITIES}?mine=1` },
            { label: 'Calendar', href: ROUTES.CALENDAR },
        ],
    },
    {
        label: 'Sales',
        items: [
            { label: 'Leads', href: '/leads' },
            { label: 'Opportunities', href: '/opportunities' },
            { label: 'Quotations', href: '/quotations' },
            { label: 'Organizations', href: '/organizations' },
            { label: 'Contacts', href: '/contacts' },
        ],
    },
    {
        label: 'Support',
        items: [
            { label: 'Tickets', href: ROUTES.TICKETS },
            { label: 'Contracts', href: ROUTES.CONTRACTS },
            { label: 'SLA Policies', href: '/dashboard' },
            { label: 'Helpdesk Teams', href: '/dashboard' },
        ],
    },
    {
        label: 'Activities',
        items: [
            {
                label: 'All Activities',
                href: ROUTES.ACTIVITIES,
                children: [
                    { label: 'Calls', href: `${ROUTES.ACTIVITIES}?type=Call` },
                    { label: 'Meetings', href: `${ROUTES.ACTIVITIES}?type=Meeting` },
                    { label: 'Tasks', href: `${ROUTES.ACTIVITIES}?type=Task` },
                    { label: 'Emails', href: `${ROUTES.ACTIVITIES}?type=Email` },
                ],
            },
            { label: 'Calendar', href: ROUTES.CALENDAR },
            { label: 'Documents', href: ROUTES.DOCUMENTS },
        ],
    },
    {
        label: 'Inventory',
        items: [
            { label: 'Product Catalog', href: '/products' },
            { label: 'Categories', href: '/dashboard' },
            { label: 'Stock Movements', href: '/dashboard' },
        ],
    },
    {
        label: 'All',
        items: [
            { label: 'Partner Company', href: ROUTES.PARTNER_COMPANIES },
            { label: 'Referrals', href: ROUTES.REFERRALS },
            { label: 'Reports', href: '/dashboard' },
            { label: 'Integrations', href: ROUTES.API_INTEGRATIONS, adminOnly: true },
        ],
    },
];

/** The navigation a user sees: admin-only items (and groups left empty by them) are dropped for everyone else. */
export function navGroupsFor(role: string | null | undefined): readonly NavGroup[] {
    if (isAdminRole(role)) return NAV_ITEMS;
    const visible = (items: readonly NavLinkItem[]): NavLinkItem[] =>
        items.filter((item) => !item.adminOnly).map((item) => (item.children ? { ...item, children: visible(item.children) } : item));
    return NAV_ITEMS.map((group) => ({ ...group, items: visible(group.items) })).filter((group) => group.items.length > 0);
}

/** Small dot in the module's identity color; non-module items get an empty slot so labels stay aligned. */
export function ModuleDot({ href }: { href: string }) {
    const moduleKey = moduleForPath(href);
    return (
        <Box
            component="span"
            aria-hidden
            sx={{
                width: 7,
                height: 7,
                borderRadius: '50%',
                flexShrink: 0,
                backgroundColor: moduleKey ? getModuleColor(moduleKey).main : 'transparent',
            }}
        />
    );
}
