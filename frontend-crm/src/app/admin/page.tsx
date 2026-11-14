'use client';

import React, { useEffect } from 'react';
import NextLink from 'next/link';
import { useRouter } from 'next/navigation';
import { Box, Container, Typography } from '@mui/material';
import AdminPanelSettingsOutlinedIcon from '@mui/icons-material/AdminPanelSettingsOutlined';
import TuneOutlinedIcon from '@mui/icons-material/TuneOutlined';
import PictureAsPdfOutlinedIcon from '@mui/icons-material/PictureAsPdfOutlined';
import AccountTreeOutlinedIcon from '@mui/icons-material/AccountTreeOutlined';
import FormatListNumberedOutlinedIcon from '@mui/icons-material/FormatListNumberedOutlined';
import ManageAccountsOutlinedIcon from '@mui/icons-material/ManageAccountsOutlined';
import SecurityOutlinedIcon from '@mui/icons-material/SecurityOutlined';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import { useAuth } from '@/context/AuthContext';
import { ROUTES } from '@/config/constants';
import { Navbar } from '@/components/layout/Navbar';
import { AppBreadcrumbsBar } from '@/components/common/AppBreadcrumbsBar';
import { EnterpriseFooter } from '@/components/common/EnterpriseFooter';
import { LoadingScreen } from '@/components/common/LoadingScreen';
import { ErrorAlert } from '@/components/common/ErrorAlert';

interface AdminModule {
    key: string;
    title: string;
    description: string;
    icon: React.ReactNode;
    /** Set on modules that are live; the others render as upcoming scaffolds. */
    href?: string;
    badge: { label: string; color: string; backgroundColor: string; borderColor: string };
    highlights: string[];
}

const BADGES = {
    available: { label: 'Available', color: 'var(--crm-emerald-700)', backgroundColor: 'var(--mui-palette-success-soft)', borderColor: 'var(--mui-palette-success-softBorder)' },
    comingSoon: { label: 'Coming Soon', color: 'var(--crm-amber-700)', backgroundColor: 'var(--mui-palette-warning-soft)', borderColor: 'var(--mui-palette-warning-softBorder)' },
    superAdmin: { label: 'Super Admin / Admin', color: 'var(--crm-text-blue-700)', backgroundColor: 'var(--mui-palette-primary-soft)', borderColor: 'var(--mui-palette-primary-softBorder)' },
} as const;

const ADMIN_MODULES: AdminModule[] = [
    {
        key: 'form-customization',
        title: 'Form & Dropdown Customization',
        description:
            'Manage dropdown options, tailor built-in fields (labels, sections, required and visibility rules) and add custom fields for every CRM module, with a full audit trail of admin changes.',
        icon: <TuneOutlinedIcon />,
        href: ROUTES.FORM_CUSTOMIZATION,
        badge: BADGES.available,
        highlights: ['Dropdowns', 'Built-in fields', 'Custom fields', 'Audit trail'],
    },
    {
        key: 'pdf-templates',
        title: 'PDF Templates',
        description:
            'Design the printable layouts used for quotations: page size and margins, which fields and line-item columns appear, company branding, with a live preview against real records.',
        icon: <PictureAsPdfOutlinedIcon />,
        href: ROUTES.PDF_TEMPLATES,
        badge: BADGES.available,
        highlights: ['Templates', 'Field visibility', 'Live preview', 'Branding'],
    },
    {
        key: 'document-series',
        title: 'Document Series',
        description:
            'Control how record numbers are built (e.g. NIPL/L/26-27/1004): a common company prefix, module prefixes, financial year, suffix, digits and starting numbers.',
        icon: <FormatListNumberedOutlinedIcon />,
        href: ROUTES.DOCUMENT_SERIES,
        badge: BADGES.available,
        highlights: ['Company prefix', 'Financial year', 'Suffix', 'Numbering'],
    },
    {
        key: 'roles',
        title: 'Roles & Admin Hierarchy',
        description: 'Define Super Admin, Admin and team roles, and control which administrators can change which modules.',
        icon: <AccountTreeOutlinedIcon />,
        badge: BADGES.superAdmin,
        highlights: ['Role hierarchy', 'Module permissions'],
    },
    {
        key: 'users',
        title: 'User & Access Management',
        description: 'Invite and deactivate users, assign roles and departments, and review sign-in activity.',
        icon: <ManageAccountsOutlinedIcon />,
        badge: BADGES.comingSoon,
        highlights: ['Users', 'Role assignment', 'Sign-in activity'],
    },
    {
        key: 'audit',
        title: 'System Audit & Security',
        description: 'Search the CRM-wide audit log, review failed sign-in attempts and manage security policies.',
        icon: <SecurityOutlinedIcon />,
        badge: BADGES.comingSoon,
        highlights: ['Audit log', 'Security events', 'Policies'],
    },
];

function ModuleCard({ module }: { module: AdminModule }) {
    const active = Boolean(module.href);
    return (
        <Box
            component={active ? NextLink : 'div'}
            href={module.href}
            aria-disabled={active ? undefined : true}
            sx={{
                display: 'flex',
                flexDirection: 'column',
                gap: 1.5,
                p: 2.5,
                height: '100%',
                borderRadius: '12px',
                border: '1px solid var(--mui-palette-border-main)',
                backgroundColor: 'var(--mui-palette-background-paper)',
                color: 'inherit',
                textDecoration: 'none',
                transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
                ...(active
                    ? {
                          cursor: 'pointer',
                          '&:hover, &:focus-visible': {
                              borderColor: 'var(--crm-blue-300)',
                              boxShadow: '0 4px 16px rgb(var(--crm-accent-rgb) / 0.10)',
                              outline: 'none',
                          },
                          '&:hover .admin-card-cta, &:focus-visible .admin-card-cta': { gap: 1 },
                      }
                    : { backgroundColor: 'var(--mui-palette-background-subtle)' }),
            }}
        >
            <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 1.5 }}>
                <Box
                    sx={{
                        width: 40,
                        height: 40,
                        borderRadius: '10px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                        backgroundColor: active ? 'var(--mui-palette-primary-soft)' : 'var(--mui-palette-background-hover)',
                        border: `1px solid ${active ? 'var(--mui-palette-primary-softBorder)' : 'var(--mui-palette-border-main)'}`,
                        color: active ? 'var(--crm-text-blue-600)' : 'var(--mui-palette-text-secondary)',
                    }}
                >
                    {module.icon}
                </Box>
                <Box
                    component="span"
                    sx={{
                        px: 1.1,
                        py: 0.3,
                        borderRadius: '9999px',
                        fontSize: '0.68rem',
                        fontWeight: 700,
                        whiteSpace: 'nowrap',
                        color: module.badge.color,
                        backgroundColor: module.badge.backgroundColor,
                        border: `1px solid ${module.badge.borderColor}`,
                    }}
                >
                    {module.badge.label}
                </Box>
            </Box>

            <Box>
                <Typography component="h2" sx={{ fontSize: '0.95rem', fontWeight: 700, color: active ? 'var(--crm-slate-900)' : 'var(--crm-slate-700)' }}>
                    {module.title}
                </Typography>
                <Typography sx={{ fontSize: '0.8rem', color: 'var(--mui-palette-text-secondary)', mt: 0.5, lineHeight: 1.55 }}>{module.description}</Typography>
            </Box>

            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
                {module.highlights.map((h) => (
                    <Box
                        key={h}
                        component="span"
                        sx={{ px: 1, py: 0.25, borderRadius: '6px', fontSize: '0.7rem', fontWeight: 600, color: 'var(--crm-slate-600)', backgroundColor: 'var(--mui-palette-background-subtle)', border: '1px solid var(--mui-palette-border-main)' }}
                    >
                        {h}
                    </Box>
                ))}
            </Box>

            <Box sx={{ mt: 'auto', pt: 1.5, borderTop: '1px dashed var(--mui-palette-border-main)' }}>
                {active ? (
                    <Box
                        className="admin-card-cta"
                        sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, fontSize: '0.8rem', fontWeight: 700, color: 'var(--crm-text-blue-600)', transition: 'gap 0.15s ease' }}
                    >
                        Open module
                        <ArrowForwardRoundedIcon sx={{ fontSize: 16 }} />
                    </Box>
                ) : (
                    <Typography sx={{ fontSize: '0.76rem', fontWeight: 600, color: 'var(--mui-palette-text-muted)' }}>Planned for an upcoming release</Typography>
                )}
            </Box>
        </Box>
    );
}

/** Administration hub: entry point for admin / super-admin customization modules. */
export default function AdminHubPage() {
    const router = useRouter();
    const { user, loading, error, clearError, isAuthenticated } = useAuth();

    useEffect(() => {
        if (!loading && !isAuthenticated) {
            router.push(ROUTES.LOGIN);
        }
    }, [isAuthenticated, loading, router]);

    if (loading) return <LoadingScreen message="Loading administration..." />;
    if (!user) return null;

    return (
        <Box sx={{ minHeight: '100vh', backgroundColor: 'var(--mui-palette-background-subtle)', display: 'flex', flexDirection: 'column' }}>
            <Navbar />
            <ErrorAlert error={error} onClose={clearError} />

            <Container maxWidth="xl" sx={{ pt: 2, pb: 4, flex: 1 }}>
                <AppBreadcrumbsBar items={[{ label: 'Administration' }, { label: 'Admin' }]} />

                <Box sx={{ mb: 2.5, p: { xs: 2, md: 3 }, borderRadius: '12px', border: '1px solid var(--mui-palette-border-main)', backgroundColor: 'var(--mui-palette-background-paper)', display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
                    <Box
                        sx={{
                            width: 40,
                            height: 40,
                            borderRadius: '10px',
                            backgroundColor: 'var(--mui-palette-primary-soft)',
                            border: '1px solid var(--mui-palette-primary-softBorder)',
                            color: 'var(--crm-text-blue-600)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                        }}
                    >
                        <AdminPanelSettingsOutlinedIcon />
                    </Box>
                    <Box sx={{ minWidth: 0 }}>
                        <Typography component="h1" sx={{ fontWeight: 700, fontSize: '1.15rem', color: 'var(--crm-slate-900)' }}>
                            Administration Hub
                        </Typography>
                        <Typography sx={{ fontSize: '0.82rem', color: 'var(--mui-palette-text-secondary)', mt: 0.25 }}>
                            Configure how Nandini CRM works for your organization. Signed in as{' '}
                            <strong style={{ color: 'var(--crm-slate-700)' }}>{user.username}</strong> ({user.role}).
                        </Typography>
                    </Box>
                </Box>

                <Box
                    sx={{
                        display: 'grid',
                        gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))', lg: 'repeat(4, minmax(0, 1fr))' },
                        gap: 2,
                    }}
                >
                    {ADMIN_MODULES.map((module) => (
                        <ModuleCard key={module.key} module={module} />
                    ))}
                </Box>
            </Container>

            <EnterpriseFooter />
        </Box>
    );
}
