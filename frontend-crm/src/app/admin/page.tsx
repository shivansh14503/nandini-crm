'use client';

import React from 'react';
import NextLink from 'next/link';
import { Box, Container, Typography } from '@mui/material';
import AdminPanelSettingsOutlinedIcon from '@mui/icons-material/AdminPanelSettingsOutlined';
import TuneOutlinedIcon from '@mui/icons-material/TuneOutlined';
import DashboardCustomizeOutlinedIcon from '@mui/icons-material/DashboardCustomizeOutlined';
import PictureAsPdfOutlinedIcon from '@mui/icons-material/PictureAsPdfOutlined';
import AccountTreeOutlinedIcon from '@mui/icons-material/AccountTreeOutlined';
import FormatListNumberedOutlinedIcon from '@mui/icons-material/FormatListNumberedOutlined';
import TranslateOutlinedIcon from '@mui/icons-material/TranslateOutlined';
import ApartmentOutlinedIcon from '@mui/icons-material/ApartmentOutlined';
import MarkEmailReadOutlinedIcon from '@mui/icons-material/MarkEmailReadOutlined';
import EventBusyOutlinedIcon from '@mui/icons-material/EventBusyOutlined';
import HubOutlinedIcon from '@mui/icons-material/HubOutlined';
import ManageAccountsOutlinedIcon from '@mui/icons-material/ManageAccountsOutlined';
import SecurityOutlinedIcon from '@mui/icons-material/SecurityOutlined';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import { useAuth } from '@/context/AuthContext';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { ROUTES } from '@/config/constants';
import { Navbar } from '@/components/layout/Navbar';
import { AppBreadcrumbsBar } from '@/components/common/AppBreadcrumbsBar';
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
        key: 'list-scorecards',
        title: 'List Scorecards',
        description:
            'Choose which lists show summary cards above their records, the dropdown each list counts by, the order and colors of its cards and what they total, with a live preview over real records.',
        icon: <DashboardCustomizeOutlinedIcon />,
        href: ROUTES.LIST_SCORECARDS,
        badge: BADGES.available,
        highlights: ['On / off per list', 'Card order', 'Colors', 'Totals'],
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
        key: 'company-formats',
        title: 'Company Formats',
        description: 'Pick how dates, times and numbers appear across the CRM, PDFs and emails, with a live preview. One setting for everyone.',
        icon: <TranslateOutlinedIcon />,
        href: ROUTES.COMPANY_FORMATS,
        badge: BADGES.available,
        highlights: ['Date', 'Time', 'Number grouping', 'Preview'],
    },
    {
        key: 'company-details',
        title: 'Company Details',
        description: 'Set your company’s state. Line items charge IGST to customers in another state and CGST + SGST within it.',
        icon: <ApartmentOutlinedIcon />,
        href: ROUTES.COMPANY_DETAILS,
        badge: BADGES.available,
        highlights: ['Company State', 'IGST', 'CGST + SGST'],
    },
    {
        key: 'email-validation',
        title: 'Email Validation',
        description:
            'See every saved email address with its check result, re-check the ones you pick in bulk, and decide what happens to risky or invalid addresses.',
        icon: <MarkEmailReadOutlinedIcon />,
        href: ROUTES.EMAIL_VALIDATION,
        badge: BADGES.available,
        highlights: ['Bulk check', 'Risky / invalid', 'Mark bounced', 'History'],
    },
    {
        key: 'holidays',
        title: 'Holidays',
        description:
            'Keep the company holiday list: add or edit holidays, import them from a spreadsheet, and switch them on or off. Active holidays show on everyone\'s calendar.',
        icon: <EventBusyOutlinedIcon />,
        href: ROUTES.HOLIDAYS,
        badge: BADGES.available,
        highlights: ['Holiday list', 'Import', 'Year filter', 'On the calendar'],
    },
    {
        key: 'api-integrations',
        title: 'API Integrations',
        description:
            'Connect the CRM to Google Workspace and Microsoft 365 for calendar sync: app credentials, which activities go to calendars, company email domains, and who is connected.',
        icon: <HubOutlinedIcon />,
        href: ROUTES.API_INTEGRATIONS,
        badge: BADGES.available,
        highlights: ['Google', 'Microsoft 365', 'Zoom', 'Who is connected'],
    },
    {
        key: 'roles',
        title: 'Roles',
        description:
            'Create roles and set what each may view, create, edit, delete, export and import in every module, for all records or only their own, and who opens the admin panel.',
        icon: <AccountTreeOutlinedIcon />,
        href: ROUTES.ADMIN_ROLES,
        badge: BADGES.available,
        highlights: ['Module permissions', 'All or own records', 'Admin panel access'],
    },
    {
        key: 'users',
        title: 'Users',
        description:
            'Add people and set their role, department, job title and manager. Reset passwords, see who signed in last, and deactivate people who leave.',
        icon: <ManageAccountsOutlinedIcon />,
        href: ROUTES.ADMIN_USERS,
        badge: BADGES.available,
        highlights: ['Add users', 'Roles', 'Reset password', 'Deactivate'],
    },
    {
        key: 'audit',
        title: 'System Audit & Security',
        description:
            'Search every change made in the CRM, by whom, when, from which screen and IP, with before / after values. Review failed sign-ins and refused access.',
        icon: <SecurityOutlinedIcon />,
        href: ROUTES.AUDIT_LOG,
        badge: BADGES.available,
        highlights: ['Audit log', 'Before / after', 'Security events', 'Who / where'],
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
    const { user, loading, error, clearError } = useAuth();

    useRequireAuth();

    if (loading) return <LoadingScreen message="Loading administration..." />;
    if (!user) return null;

    return (
        <Box sx={{ minHeight: '100vh', backgroundColor: 'var(--mui-palette-background-subtle)', display: 'flex', flexDirection: 'column' }}>
            <Navbar />
            <ErrorAlert error={error} onClose={clearError} />

            <Container maxWidth="xl" sx={{ pt: 2, pb: 4, flex: 1 }}>
                <AppBreadcrumbsBar items={[{ label: 'Admin' }]} />

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
        </Box>
    );
}
