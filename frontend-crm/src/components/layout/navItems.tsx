import { Box } from '@mui/material';
import HomeIcon from '@mui/icons-material/Home';
import { getModuleColor, moduleForPath } from '@/theme/moduleColors';
import { ROUTES } from '@/config/constants';
import { isAdminUser } from '@/utils/adminRoles';
import { levelOf, type PermissionModule } from '@/utils/permissions';
import type { User } from '@/types/auth.types';

export interface NavLinkItem {
    label: string;
    href: string;
    /**
     * Nested routes under this item. The navbar shows them in a flyout to the right (hover, or tap / click the
     * chevron, or ArrowRight); the phone / tablet menu shows them as an inline expandable list. The item's own
     * label still links to `href`.
     */
    children?: readonly NavLinkItem[];
    /** Shown only to roles with the admin panel (`isAdminUser`); see `navGroupsFor`. */
    adminOnly?: boolean;
    /** Shown only when the role may view this module (Admin › Roles); see `navGroupsFor`. */
    module?: PermissionModule;
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
            { label: 'My Activities', href: `${ROUTES.ACTIVITIES}?mine=1`, module: 'activities' },
            { label: 'Calendar', href: ROUTES.CALENDAR, module: 'activities' },
        ],
    },
    {
        label: 'Sales',
        items: [
            { label: 'Leads', href: '/leads', module: 'leads' },
            { label: 'Opportunities', href: '/opportunities', module: 'opportunities' },
            { label: 'Quotations', href: '/quotations', module: 'quotations' },
            { label: 'Organizations', href: '/organizations', module: 'organizations' },
            { label: 'Contacts', href: '/contacts', module: 'contacts' },
        ],
    },
    {
        label: 'Support',
        items: [
            { label: 'Tickets', href: ROUTES.TICKETS, module: 'tickets' },
            { label: 'Contracts', href: ROUTES.CONTRACTS, module: 'contracts' },
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
                module: 'activities',
                children: [
                    { label: 'Calls', href: `${ROUTES.ACTIVITIES}?type=Call` },
                    { label: 'Meetings', href: `${ROUTES.ACTIVITIES}?type=Meeting` },
                    { label: 'Tasks', href: `${ROUTES.ACTIVITIES}?type=Task` },
                    { label: 'Emails', href: `${ROUTES.ACTIVITIES}?type=Email` },
                ],
            },
            { label: 'Calendar', href: ROUTES.CALENDAR, module: 'activities' },
            { label: 'Documents', href: ROUTES.DOCUMENTS, module: 'documents' },
        ],
    },
    {
        label: 'Inventory',
        items: [
            { label: 'Product Catalog', href: '/products', module: 'products' },
            { label: 'Categories', href: '/dashboard' },
            { label: 'Stock Movements', href: '/dashboard' },
        ],
    },
    {
        label: 'All',
        items: [
            { label: 'Partner Company', href: ROUTES.PARTNER_COMPANIES, module: 'partnerCompanies' },
            { label: 'Referrals', href: ROUTES.REFERRALS, module: 'referrals' },
            { label: 'Reports', href: '/dashboard' },
            { label: 'Integrations', href: ROUTES.API_INTEGRATIONS, adminOnly: true },
        ],
    },
];

/**
 * The navigation a user sees: admin-only items are dropped for roles without the admin panel, module items for
 * modules the role can't view (Admin › Roles), and groups left empty by them.
 */
export function navGroupsFor(user: Pick<User, 'role' | 'access'> | null | undefined): readonly NavGroup[] {
    const admin = isAdminUser(user);
    const permissions = user?.access?.permissions;
    const allowed = (item: NavLinkItem) =>
        (admin || !item.adminOnly) && (!item.module || !permissions || levelOf(permissions, item.module, 'view') !== 'none');
    const visible = (items: readonly NavLinkItem[]): NavLinkItem[] =>
        items.filter(allowed).map((item) => (item.children ? { ...item, children: visible(item.children) } : item));
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
