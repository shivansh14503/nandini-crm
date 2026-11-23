import { Box } from '@mui/material';
import HomeIcon from '@mui/icons-material/Home';
import { getModuleColor, moduleForPath } from '@/theme/moduleColors';
import { ROUTES } from '@/config/constants';

export interface NavLinkItem {
    label: string;
    href: string;
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
            { label: 'My Activities', href: '/dashboard' },
            { label: 'Calendar', href: '/dashboard' },
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
            { label: 'SLA Policies', href: '/dashboard' },
            { label: 'Helpdesk Teams', href: '/dashboard' },
        ],
    },
    {
        label: 'Activities',
        items: [
            { label: 'All Activities', href: '/dashboard' },
            { label: 'Calls', href: '/dashboard' },
            { label: 'Meetings', href: '/dashboard' },
            { label: 'Emails', href: '/dashboard' },
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
            { label: 'Reports', href: '/dashboard' },
            { label: 'Integrations', href: '/dashboard' },
        ],
    },
];

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
