'use client';

import { useState, useCallback, useMemo, useEffect } from 'react';
import { useRouter } from 'next/navigation';
// Icons
import ArticleOutlinedIcon from '@mui/icons-material/ArticleOutlined';
import PlaceOutlinedIcon from '@mui/icons-material/PlaceOutlined';
import AccountBalanceOutlinedIcon from '@mui/icons-material/AccountBalanceOutlined';
import WorkspacePremiumOutlinedIcon from '@mui/icons-material/WorkspacePremiumOutlined';

import { type BreadcrumbItem } from '../common/AppBreadcrumbs';
import { AppToast } from '../common/AppToast';
import { CommonFormLayout } from '../common/CommonFormLayout';
import { type FormTabDefinition } from '../common/Drawer';
import { organizationService } from '@/services';
import { ROUTES } from '../../config/constants';
import { validateWithToast, organizationFormSchema } from '../../validations';
import type {
    OrganizationFormData,
    CorporateEmail,
} from '../../types/organization.types';

// Tab components
import {
    OverviewTab,
    AddressTab,
    TaxBankTab,
    PartnerLicensingTab,
} from './tabs';

// ─── Single Source of Truth for Organization Form Tabs ──────────────────────────
export const ORGANIZATION_FORM_TABS: (FormTabDefinition & { id: TabKey })[] = [
    {
        id: 'overview',
        label: 'Overview',
        icon: <ArticleOutlinedIcon sx={{ fontSize: 18 }} />,
    },
    {
        id: 'address',
        label: 'Address Information',
        icon: <PlaceOutlinedIcon sx={{ fontSize: 18 }} />,
    },
    {
        id: 'tax_bank',
        label: 'Tax & Bank Details',
        icon: <AccountBalanceOutlinedIcon sx={{ fontSize: 18 }} />,
        hasDot: true,
    },
    {
        id: 'partner_licensing',
        label: 'Partner Company',
        icon: <WorkspacePremiumOutlinedIcon sx={{ fontSize: 18 }} />,
    },
];

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
        if (!organizationId) return;
        let active = true;
        organizationService
            .getById(organizationId)
            .then((found) => {
                if (active && found) {
                    setForm((prev) => ({ ...prev, ...found }));
                }
            })
            .catch(() => {});
        return () => {
            active = false;
        };
    }, [organizationId]);

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
                await organizationService.create(form);
                setToast({ open: true, message: 'Organization created successfully!', severity: 'success' });
                if (redirectAfter) {
                    setTimeout(() => router.push(ROUTES.ORGANIZATIONS), 800);
                } else {
                    setForm(DEFAULT_FORM);
                    setIsDirty(false);
                }
            } else if (mode === 'edit' && organizationId) {
                await organizationService.update(organizationId, form);
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

    // ─── Tabs Configuration (derived from ORGANIZATION_FORM_TABS) ───────────────
    const tabs = useMemo(() => [
        {
            ...ORGANIZATION_FORM_TABS[0],
            badge: `${progressCount}/10 done`,
        },
        {
            ...ORGANIZATION_FORM_TABS[1],
            sublabel: form.billingCity || form.shippingCity ? '(Configured)' : '(3 Locs)',
        },
        ORGANIZATION_FORM_TABS[2],
        ORGANIZATION_FORM_TABS[3],
    ], [progressCount, form.billingCity, form.shippingCity]);

    return (
        <CommonFormLayout
            breadcrumbItems={breadcrumbItems || defaultBreadcrumbs}
            tabs={tabs}
            activeTab={activeTab}
            onTabChange={(tabId) => setActiveTab(tabId as TabKey)}
            onCancel={handleDiscard}
            onSave={() => handleSubmit(true)}
            submitting={submitting}
            saveLabel={mode === 'edit' ? 'Update Organization' : 'Save Organization'}
            cancelLabel="Cancel"
            disableContentPadding
            toast={
                <AppToast
                    open={toast.open}
                    message={toast.message}
                    severity={toast.severity}
                    onClose={() => setToast((t) => ({ ...t, open: false }))}
                />
            }
        >

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
        </CommonFormLayout>
    );
}
