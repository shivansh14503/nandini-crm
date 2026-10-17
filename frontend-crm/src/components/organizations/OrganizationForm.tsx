'use client';

import { useState, useCallback, useMemo, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
    Box,
    Paper,
    Typography,
    Button,
    Alert,
    CircularProgress,
    Snackbar,
} from '@mui/material';

// Icons
import ArticleOutlinedIcon from '@mui/icons-material/ArticleOutlined';
import PlaceOutlinedIcon from '@mui/icons-material/PlaceOutlined';
import AccountBalanceOutlinedIcon from '@mui/icons-material/AccountBalanceOutlined';
import WorkspacePremiumOutlinedIcon from '@mui/icons-material/WorkspacePremiumOutlined';
import CloseIcon from '@mui/icons-material/Close';
import BookmarkBorderIcon from '@mui/icons-material/BookmarkBorder';
import SyncIcon from '@mui/icons-material/Sync';

import { AppBreadcrumbs, type BreadcrumbItem } from '../common/AppBreadcrumbs';
import { AppToast } from '../common/AppToast';
import { FormHeader, FormStickyFooter } from '../forms';
import { organizationService } from '../../services/organization.service';
import { ROUTES } from '../../config/constants';
import { validateWithToast, organizationFormSchema } from '../../validations';
import type {
    OrganizationFormData,
    CorporateEmail,
} from '../../types/organization.types';
import {
    getStoredOrganizationById,
    updateStoredOrganization,
    getStoredOrganizations,
    saveStoredOrganizations,
    type ExtendedOrganization,
} from '../../data/mockOrganizations';

// Tab components
import {
    OverviewTab,
    AddressTab,
    TaxBankTab,
    PartnerLicensingTab,
} from './tabs';

// ─── Default Form State ───────────────────────────────────────────────────────
const DEFAULT_FORM: OrganizationFormData = {
    organizationName: '',
    mailingName: '',
    natureOfBusiness: '',
    accountStatus: '',
    typeOfEntity: '',
    customerType: '',
    sapCodeTallyId: '',
    showroomBranchCode: '',
    sourceOfLead: '',
    memberOfParentCorp: '',
    numberOfEmployees: '',
    annualTurnover: '',
    description: '',
    accountVerified: false,
    provideSupport: 'Yes',
    corporateEmails: [],

    // Billing Address
    billingStreet: '',
    billingCity: '',
    billingState: '',
    billingPostalCode: '',
    billingCountry: 'India',
    billingLatitude: '0.00000000',

    // Shipping Address
    shippingStreet: '',
    shippingCity: '',
    shippingState: '',
    shippingPostalCode: '',
    shippingCountry: 'India',
    shippingLongitude: '0.00000000',
    copyAddressFromBilling: false,

    // Tax & Bank Details
    registrationType: 'Registered',
    panNumber: '',
    msmeRegnNumber: '',
    accountName: '',
    bankName: '',
    bankIfscCode: '',
    gstNumber: '',
    cinNo: '',
    tanNumber: '',
    accountNumber: '',
    typeOfAccount: '',
    bankAddress: '',

    // Partner Company
    partnerCompanies: [],
};

type TabKey = 'overview' | 'address' | 'tax_bank' | 'partner_licensing';

// ─── Component Props ──────────────────────────────────────────────────────────
export interface OrganizationFormProps {
    mode?: 'create' | 'edit';
    initialData?: Partial<OrganizationFormData>;
    organizationId?: string;
    breadcrumbItems?: BreadcrumbItem[];
}

export default function OrganizationForm({
    mode = 'create',
    initialData,
    organizationId,
    breadcrumbItems,
}: OrganizationFormProps) {
    const router = useRouter();

    const [form, setForm] = useState<OrganizationFormData>({ ...DEFAULT_FORM, ...initialData });
    const [activeTab, setActiveTab] = useState<TabKey>('overview');
    const [submitting, setSubmitting] = useState(false);
    const [isDirty, setIsDirty] = useState(false);
    const [toast, setToast] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({
        open: false,
        message: '',
        severity: 'success',
    });

    const defaultBreadcrumbs: BreadcrumbItem[] = [
        { label: 'Sales' },
        { label: 'Organizations', href: ROUTES.ORGANIZATIONS },
        { label: mode === 'edit' ? (form.organizationName ? `Edit: ${form.organizationName}` : 'Edit Organization') : 'Create & Edit View' },
    ];

    // Populate data when editing
    useEffect(() => {
        if (initialData && Object.keys(initialData).length > 0) {
            setForm((prev) => ({ ...prev, ...initialData }));
        } else if (organizationId) {
            const stored = getStoredOrganizationById(organizationId);
            if (stored) {
                setForm((prev) => ({ ...prev, ...stored }));
            } else {
                organizationService.getById(organizationId)
                    .then((res) => {
                        if (res.data) setForm((prev) => ({ ...prev, ...res.data }));
                    })
                    .catch(() => {});
            }
        }
    }, [initialData, organizationId]);

    // ── Field updaters ────────────────────────────────────────────────────────
    const set = useCallback(
        <K extends keyof OrganizationFormData>(key: K, value: OrganizationFormData[K]) => {
            setForm((prev) => {
                const next = { ...prev, [key]: value };
                if (next.copyAddressFromBilling) {
                    if (key === 'billingStreet') next.shippingStreet = value as string;
                    if (key === 'billingCity') next.shippingCity = value as string;
                    if (key === 'billingState') next.shippingState = value as string;
                    if (key === 'billingPostalCode') next.shippingPostalCode = value as string;
                    if (key === 'billingCountry') next.shippingCountry = value as string;
                }
                return next;
            });
            setIsDirty(true);
        },
        []
    );

    const handleCopyAddressToggle = (checked: boolean) => {
        setForm((prev) => ({
            ...prev,
            copyAddressFromBilling: checked,
            ...(checked
                ? {
                      shippingStreet: prev.billingStreet || '',
                      shippingCity: prev.billingCity || '',
                      shippingState: prev.billingState || '',
                      shippingPostalCode: prev.billingPostalCode || '',
                      shippingCountry: prev.billingCountry || 'India',
                  }
                : {}),
        }));
        setIsDirty(true);
    };

    // ── Email management ──────────────────────────────────────────────────────
    const addEmail = () => {
        const newEmail: CorporateEmail = {
            id: crypto.randomUUID(),
            email: '',
            isPrimary: form.corporateEmails.length === 0,
            isOptedOut: false,
            isInvalidBounce: false,
        };
        set('corporateEmails', [...form.corporateEmails, newEmail]);
    };

    const updateEmail = (id: string, updated: CorporateEmail) => {
        set(
            'corporateEmails',
            form.corporateEmails.map((e) => (e.id === id ? updated : e))
        );
    };

    const removeEmail = (id: string) => {
        set(
            'corporateEmails',
            form.corporateEmails.filter((e) => e.id !== id)
        );
    };

    // ── Calculation of completion progress ────────────────────────────────────
    const progressCount = useMemo(() => {
        let count = 0;
        if (form.organizationName.trim()) count++;
        if (form.natureOfBusiness) count++;
        if (form.accountStatus) count++;
        if (form.typeOfEntity) count++;
        if (form.customerType) count++;
        if (form.sapCodeTallyId.trim()) count++;
        if (form.sourceOfLead) count++;
        if (form.corporateEmails.length > 0) count++;
        if (form.annualTurnover) count++;
        if (form.description.trim()) count++;
        return Math.min(count, 10);
    }, [form]);

    // ── Submit logic with Zod Validation ──────────────────────────────────────
    const handleSubmit = async (redirectAfter: boolean) => {
        const validation = validateWithToast(organizationFormSchema, form);
        if (!validation.success) {
            setToast({ open: true, message: validation.error, severity: 'error' });
            return;
        }
        setSubmitting(true);
        try {
            if (mode === 'create') {
                let createdOrg: ExtendedOrganization;
                try {
                    const res = await organizationService.create(form);
                    createdOrg = res.data;
                } catch {
                    createdOrg = {
                        ...form,
                        id: `org-${Date.now()}`,
                        accountCode: `ORG-${Math.floor(10000 + Math.random() * 90000)}`,
                        createdAt: new Date().toISOString(),
                        updatedAt: new Date().toISOString(),
                        createdBy: 'mittal.sharma',
                        isRecentlyViewed: true,
                        isMyAccount: true,
                    };
                }
                const existing = getStoredOrganizations();
                saveStoredOrganizations([createdOrg, ...existing]);
                setToast({ open: true, message: 'Organization created successfully!', severity: 'success' });
                if (redirectAfter) {
                    setTimeout(() => router.push(ROUTES.ORGANIZATIONS), 800);
                } else {
                    setForm(DEFAULT_FORM);
                    setIsDirty(false);
                }
            } else if (mode === 'edit' && organizationId) {
                updateStoredOrganization(organizationId, form);
                try {
                    await organizationService.update(organizationId, form);
                } catch {
                    // Local persistence succeeded
                }
                setToast({ open: true, message: 'Organization updated successfully!', severity: 'success' });
                setTimeout(() => router.push(ROUTES.ORGANIZATIONS), 800);
            }
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : 'Something went wrong. Please try again.';
            setToast({ open: true, message, severity: 'error' });
        } finally {
            setSubmitting(false);
        }
    };

    const handleDiscard = () => {
        if (isDirty && !confirm('You have unsaved changes. Are you sure you want to discard them?')) return;
        router.push(ROUTES.ORGANIZATIONS);
    };

    // ─── Tabs Configuration ───────────────────────────────────────────────────
    const tabs = [
        {
            id: 'overview' as const,
            label: 'Overview',
            icon: <ArticleOutlinedIcon sx={{ fontSize: 18 }} />,
            badge: `${progressCount}/10 done`,
        },
        {
            id: 'address' as const,
            label: 'Address Information',
            icon: <PlaceOutlinedIcon sx={{ fontSize: 18 }} />,
            sublabel: form.billingCity || form.shippingCity ? '(Configured)' : '(3 Locs)',
        },
        {
            id: 'tax_bank' as const,
            label: 'Tax & Bank Details',
            icon: <AccountBalanceOutlinedIcon sx={{ fontSize: 18 }} />,
            hasDot: true,
        },
        {
            id: 'partner_licensing' as const,
            label: 'Partner Company',
            icon: <WorkspacePremiumOutlinedIcon sx={{ fontSize: 18 }} />,
        },
    ];

    return (
        <Box sx={{ pb: 7 }}>
            {/* ── Top Header & Actions with Permanent Breadcrumbs ─────────────── */}
            <FormHeader
                breadcrumbItems={breadcrumbItems || defaultBreadcrumbs}
                onDiscard={handleDiscard}
                submitting={submitting}
                discardLabel="Discard"
            />

            {/* ── Main Form Card with Tabs ──────────────────────────────────── */}
            <Paper
                elevation={0}
                sx={{
                    border: '1px solid #e2e8f0',
                    borderRadius: '12px',
                    overflow: 'hidden',
                    backgroundColor: '#fff',
                }}
            >
                {/* ── Tabs Bar ──────────────────────────────────────────────── */}
                <Box
                    sx={{
                        backgroundColor: '#f8fafc',
                        borderBottom: '1px solid #e2e8f0',
                        px: 2,
                        py: 1,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 1,
                        overflowX: 'auto',
                    }}
                >
                    {tabs.map((tab) => {
                        const isActive = activeTab === tab.id;
                        return (
                            <Box
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id)}
                                sx={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 1,
                                    px: 2,
                                    py: 1,
                                    borderRadius: '8px',
                                    cursor: 'pointer',
                                    userSelect: 'none',
                                    whiteSpace: 'nowrap',
                                    transition: 'all 0.15s ease-in-out',
                                    backgroundColor: isActive ? '#ffffff' : 'transparent',
                                    border: isActive ? '1px solid #d1d5db' : '1px solid transparent',
                                    boxShadow: isActive ? '0 1px 3px rgba(0,0,0,0.06)' : 'none',
                                    color: isActive ? '#1e3a8a' : '#64748b',
                                    fontWeight: isActive ? 600 : 500,
                                    fontSize: '0.84rem',
                                    '&:hover': {
                                        backgroundColor: isActive ? '#ffffff' : '#f1f5f9',
                                        color: isActive ? '#1e3a8a' : '#1e293b',
                                    },
                                }}
                            >
                                <Box
                                    sx={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        color: isActive ? '#2563eb' : '#64748b',
                                    }}
                                >
                                    {tab.icon}
                                </Box>
                                <Typography sx={{ fontSize: '0.84rem', fontWeight: 'inherit', color: 'inherit' }}>
                                    {tab.label}
                                </Typography>

                                {tab.badge && (
                                    <Box
                                        sx={{
                                            px: 1,
                                            py: 0.2,
                                            borderRadius: '9999px',
                                            border: '1px solid #93c5fd',
                                            backgroundColor: '#eff6ff',
                                            color: '#2563eb',
                                            fontSize: '0.72rem',
                                            fontWeight: 600,
                                            lineHeight: 1.2,
                                        }}
                                    >
                                        {tab.badge}
                                    </Box>
                                )}

                                {tab.sublabel && (
                                    <Typography
                                        component="span"
                                        sx={{ fontSize: '0.76rem', color: '#94a3b8', fontWeight: 400 }}
                                    >
                                        {tab.sublabel}
                                    </Typography>
                                )}

                                {tab.hasDot && (
                                    <Box
                                        sx={{
                                            width: 7,
                                            height: 7,
                                            borderRadius: '50%',
                                            backgroundColor: '#f97316',
                                            ml: 0.5,
                                        }}
                                    />
                                )}
                            </Box>
                        );
                    })}
                </Box>

                {/* ── Tab Content Panels ────────────────────────────────────── */}
                {activeTab === 'overview' && (
                    <OverviewTab
                        form={form}
                        set={set}
                        addEmail={addEmail}
                        updateEmail={updateEmail}
                        removeEmail={removeEmail}
                    />
                )}

                {activeTab === 'address' && (
                    <AddressTab
                        form={form}
                        set={set}
                        handleCopyAddressToggle={handleCopyAddressToggle}
                    />
                )}

                {activeTab === 'tax_bank' && (
                    <TaxBankTab
                        form={form}
                        set={set}
                    />
                )}

                {activeTab === 'partner_licensing' && (
                    <PartnerLicensingTab
                        form={form}
                        set={set}
                    />
                )}
            </Paper>

            {/* ── Bottom Sticky Action Bar ──────────────────────────────────── */}
            <FormStickyFooter
                onCancel={handleDiscard}
                onSave={() => handleSubmit(true)}
                submitting={submitting}
                saveLabel="Save Organization"
                cancelLabel="Cancel"
            />

            {/* ── Consistent Top-Right Toast ──────────────────────────────────── */}
            <AppToast
                open={toast.open}
                message={toast.message}
                severity={toast.severity}
                onClose={() => setToast((t) => ({ ...t, open: false }))}
            />
        </Box>
    );
}
