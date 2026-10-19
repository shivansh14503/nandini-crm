'use client';

import React, { useMemo } from 'react';
import NextLink from 'next/link';
import { usePathname } from 'next/navigation';
import {
    Breadcrumbs as MuiBreadcrumbs,
    Link as MuiLink,
    Typography,
    SxProps,
    Theme,
} from '@mui/material';
import NavigateNextIcon from '@mui/icons-material/NavigateNext';

export interface BreadcrumbItem {
    label: string;
    href?: string;
}

export interface AppBreadcrumbsProps {
    items?: BreadcrumbItem[];
    separator?: React.ReactNode;
    sx?: SxProps<Theme>;
}

// Module mapping for CRM sections
const ROUTE_MODULE_MAP: Record<string, string> = {
    // Sales
    organizations: 'Sales',
    organisation: 'Sales',
    contacts: 'Sales',
    contact: 'Sales',
    opportunities: 'Sales',
    deals: 'Sales',
    leads: 'Sales',
    customers: 'Sales',
    accounts: 'Sales',
    quotations: 'Sales',
    quotes: 'Sales',
    invoices: 'Sales',
    orders: 'Sales',
    sales: 'Sales',

    // Support
    tickets: 'Support',
    cases: 'Support',
    sla: 'Support',
    helpdesk: 'Support',
    support: 'Support',
    services: 'Support',

    // Activities
    activities: 'Activities',
    tasks: 'Activities',
    calls: 'Activities',
    meetings: 'Activities',
    emails: 'Activities',
    calendar: 'Activities',

    // Inventory
    inventory: 'Inventory',
    products: 'Inventory',
    items: 'Inventory',
    stock: 'Inventory',
    warehouse: 'Inventory',
    categories: 'Inventory',

    // Analytics & Settings
    reports: 'Analytics',
    analytics: 'Analytics',
    settings: 'Settings',
    profile: 'Settings',
    integrations: 'Settings',
    users: 'Administration',
    admin: 'Administration',
    dashboard: 'Home',
    home: 'Home',
};

// Formatter for route segment labels
function formatSegmentLabel(segment: string): string {
    if (!segment) return '';
    const lower = segment.toLowerCase();
    if (lower === 'new') return 'Create & Edit View';
    if (lower === 'edit') return 'Edit View';
    if (lower === 'organizations' || lower === 'organisation') return 'Organizations';
    if (lower === 'contacts' || lower === 'contact') return 'Contacts';
    if (lower === 'leads' || lower === 'lead') return 'Leads';
    if (lower === 'opportunities' || lower === 'deals') return 'Opportunities';
    if (lower === 'dashboard') return 'Dashboard';
    
    // Check if it's an ID (digits or uuid format)
    if (/^[0-9a-f]{8}-[0-9a-f]{4}/i.test(segment) || /^\d+$/.test(segment)) {
        return `Record #${segment.slice(0, 8)}`;
    }

    // Capitalize words separated by hyphens or underscores
    return segment
        .split(/[-_]/)
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(' ');
}

export function useAutoBreadcrumbs(customItems?: BreadcrumbItem[]): BreadcrumbItem[] {
    const pathname = usePathname();

    return useMemo(() => {
        if (customItems && customItems.length > 0) {
            return customItems;
        }

        if (!pathname || pathname === '/') {
            return [{ label: 'Home', href: '/' }, { label: 'Dashboard' }];
        }

        const segments = pathname.split('/').filter(Boolean);
        if (segments.length === 0) {
            return [{ label: 'Home', href: '/' }];
        }

        const items: BreadcrumbItem[] = [];
        const primarySegment = segments[0].toLowerCase();
        const moduleName = ROUTE_MODULE_MAP[primarySegment] || 'Sales';

        // 1. Module Level (e.g. Sales, Support, Home)
        items.push({ label: moduleName });

        // 2. Build cumulative breadcrumb trail
        let cumulativePath = '';
        segments.forEach((seg, index) => {
            cumulativePath += `/${seg}`;
            const isLast = index === segments.length - 1;
            const label = formatSegmentLabel(seg);

            items.push({
                label,
                href: isLast ? undefined : cumulativePath,
            });
        });

        return items;
    }, [pathname, customItems]);
}

function BreadcrumbsView({
    items,
    separator = <NavigateNextIcon fontSize="small" sx={{ color: '#9ca3af', fontSize: 16 }} />,
    sx,
}: {
    items: BreadcrumbItem[];
    separator?: React.ReactNode;
    sx?: SxProps<Theme>;
}) {
    return (
        <MuiBreadcrumbs
            separator={separator}
            aria-label="breadcrumb"
            sx={{
                fontSize: '0.8rem',
                '& .MuiBreadcrumbs-separator': {
                    mx: 0.75,
                },
                ...sx,
            }}
        >
            {items.map((item, index) => {
                const isLast = index === items.length - 1;

                if (isLast) {
                    return (
                        <Typography
                            key={`${item.label}-${index}`}
                            sx={{
                                fontSize: '0.8rem',
                                color: '#1e293b',
                                fontWeight: 700,
                            }}
                        >
                            {item.label}
                        </Typography>
                    );
                }

                if (item.href) {
                    return (
                        <MuiLink
                            key={`${item.label}-${index}`}
                            component={NextLink}
                            href={item.href}
                            underline="hover"
                            sx={{
                                fontSize: '0.8rem',
                                color: '#6b7280',
                                transition: 'color 0.15s ease',
                                '&:hover': { color: '#2563EB' },
                            }}
                        >
                            {item.label}
                        </MuiLink>
                    );
                }

                return (
                    <Typography
                        key={`${item.label}-${index}`}
                        sx={{
                            fontSize: '0.8rem',
                            color: '#6b7280',
                        }}
                    >
                        {item.label}
                    </Typography>
                );
            })}
        </MuiBreadcrumbs>
    );
}

function DynamicBreadcrumbs({
    separator,
    sx,
}: Omit<AppBreadcrumbsProps, 'items'>) {
    const breadcrumbItems = useAutoBreadcrumbs();
    return <BreadcrumbsView items={breadcrumbItems} separator={separator} sx={sx} />;
}

export function AppBreadcrumbs({
    items,
    separator = <NavigateNextIcon fontSize="small" sx={{ color: '#9ca3af', fontSize: 16 }} />,
    sx,
}: AppBreadcrumbsProps) {
    // If static custom items are provided, render directly without triggering usePathname
    if (items && items.length > 0) {
        return <BreadcrumbsView items={items} separator={separator} sx={sx} />;
    }

    // Wrap dynamic pathname breadcrumb in Suspense to satisfy Next.js prerendering requirements
    return (
        <React.Suspense
            fallback={
                <BreadcrumbsView
                    items={[{ label: 'Home' }]}
                    separator={separator}
                    sx={sx}
                />
            }
        >
            <DynamicBreadcrumbs separator={separator} sx={sx} />
        </React.Suspense>
    );
}
