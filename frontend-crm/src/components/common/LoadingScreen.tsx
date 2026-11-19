"use client";

import { usePathname } from 'next/navigation';
import { Box, CircularProgress, Typography } from '@mui/material';
import { PageSkeleton, type PageSkeletonVariant } from './skeletons';

interface LoadingScreenProps {
    message?: string;
    minHeight?: string | number;
    /**
     * Shape of the placeholder. Defaults to one picked from the route (list / record / form / page);
     * `spinner` keeps the plain centered spinner (e.g. print previews).
     */
    variant?: PageSkeletonVariant | 'spinner';
}

/** Top-level sections that aren't record lists. */
const PAGE_SECTIONS = new Set(['dashboard', 'search', 'settings']);
const FORM_ACTIONS = new Set(['new', 'edit', 'convert', 'quote']);

/** Picks the skeleton for a route: /leads → list, /leads/123 → detail, /leads/new | /leads/123/edit → form. */
function variantForPath(pathname: string | null): PageSkeletonVariant | 'spinner' {
    const parts = (pathname ?? '').split('/').filter(Boolean);
    if (parts.length === 0) return 'page';
    if (parts.includes('print') || parts[0] === 'login') return 'spinner';
    if (parts[0] === 'admin') {
        // /admin/pdf-templates, /admin/document-series → list; their editors → form; the rest → page.
        if (parts.length >= 3) return 'form';
        if (parts[1] === 'pdf-templates' || parts[1] === 'document-series' || parts[1] === 'email-validation') return 'list';
        return 'page';
    }
    if (PAGE_SECTIONS.has(parts[0])) return 'page';
    if (parts.length === 1) return 'list';
    if (parts.some((p) => FORM_ACTIONS.has(p))) return 'form';
    return 'detail';
}

export function LoadingScreen({ message, minHeight = '100vh', variant }: LoadingScreenProps) {
    const pathname = usePathname();
    const resolved = variant ?? variantForPath(pathname);

    if (resolved !== 'spinner') return <PageSkeleton variant={resolved} label={message} />;

    return (
        <Box
            role="status"
            sx={{
                minHeight,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: 'background.default',
                gap: 2,
            }}
        >
            <CircularProgress sx={{ color: 'var(--crm-text-blue-600)' }} />
            {message && (
                <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                    {message}
                </Typography>
            )}
        </Box>
    );
}
