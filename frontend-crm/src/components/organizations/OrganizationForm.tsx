'use client';

import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { FormProvider, useForm, type Path } from 'react-hook-form';
import { Alert, Typography } from '@mui/material';
// Icons
import ApartmentIcon from '@mui/icons-material/Apartment';
import ArticleOutlinedIcon from '@mui/icons-material/ArticleOutlined';
import PlaceOutlinedIcon from '@mui/icons-material/PlaceOutlined';
import AccountBalanceOutlinedIcon from '@mui/icons-material/AccountBalanceOutlined';

import { type BreadcrumbItem } from '../common/AppBreadcrumbs';
import { AppToast } from '../common/AppToast';
import { CommonFormLayout } from '../common/CommonFormLayout';
import { type FormTabDefinition } from '../common/Drawer';
import { organizationService } from '@/services';
import { ApiClientError } from '@/services/apiClient';
import { useAuth } from '@/context/AuthContext';
import { ROUTES } from '@/config/constants';
import { focusFormField } from '@/utils/formFocus';
import { normalizeAddressFields } from '@/utils/address';
import { validateWithToast, organizationFormSchema } from '../../validations';
import type { OrganizationFormData } from '@/types/organization.types';

// Tab components
import {
    OverviewTab,
    AddressTab,
    TaxBankTab,
} from './tabs';
import { FormConfigProvider } from '@/context/FormConfigContext';
import { DynamicModuleCustomFields } from '@/components/forms/DynamicModuleCustomFields';
import { getFormConfigs } from '@/services/masterData.store';
import { validateConfiguredFields } from '@/utils/formConfig';
import { useDropdownDefaults, withDropdownDefaults } from '@/components/forms/rhf/useDropdownDefaults';
import { withDefaultAssignee } from '@/components/forms/rhf/useRhfForm';

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
];

/** Country/state pairs normalised to the ISO address master when a saved organization is loaded. */
const ORGANIZATION_ADDRESS_PAIRS = [
    ['billingCountry', 'billingState'],
    ['shippingCountry', 'shippingState'],
] as const;

// ─── Default Form State ───────────────────────────────────────────────────────
const DEFAULT_FORM: OrganizationFormData = {
    organizationName: '',
    mailingName: '',
    natureOfBusiness: '',
    accountStatus: 'Active',
    inactivityReason: '',
    tradeName: '',
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
    verifiedAt: '',
    verifiedBy: '',
    activeAmc: false,
    activeCloud: false,
    assignedUser: '',

    // Billing Address
    billingAddress: '',
    billingStreet: '',
    billingCity: '',
    billingState: '',
    billingPostalCode: '',
    billingCountry: 'IN',

    // Shipping Address
    shippingAddress: '',
    shippingStreet: '',
    shippingCity: '',
    shippingState: '',
    shippingPostalCode: '',
    shippingCountry: 'IN',
    copyAddressFromBilling: false,

    // Tax & Bank Details
    registrationType: 'Registered',
    panNumber: '',
    msmeRegnNumber: '',
    accountName: '',
    bankName: '',
    bankIfscCode: '',
    gstNo: '',
    gstNumber: '',
    cinNo: '',
    tanNumber: '',
    accountNumber: '',
    typeOfAccount: '',
    bankAddress: '',

    // Partner Company
    partnerCompanies: [],
    partnerCompany: '',
};

type TabKey = 'overview' | 'address' | 'tax_bank';

// Maps a validation field key to the tab that renders it (unmapped keys stay on the current tab).
const FIELD_TAB_MAP: Record<string, TabKey> = {
    organizationName: 'overview',
    mailingName: 'overview',
    natureOfBusiness: 'overview',
    accountStatus: 'overview',
    inactivityReason: 'overview',
    typeOfEntity: 'overview',
    customerType: 'overview',
    sapCodeTallyId: 'overview',
    showroomBranchCode: 'overview',
    sourceOfLead: 'overview',
    memberOfParentCorp: 'overview',
    numberOfEmployees: 'overview',
    annualTurnover: 'overview',
    description: 'overview',
    tradeName: 'overview',
    billingAddress: 'address',
    billingStreet: 'address',
    billingCity: 'address',
    billingState: 'address',
    billingPostalCode: 'address',
    billingCountry: 'address',
    shippingAddress: 'address',
    shippingStreet: 'address',
    shippingCity: 'address',
    shippingState: 'address',
    shippingPostalCode: 'address',
    registrationType: 'tax_bank',
    panNumber: 'tax_bank',
    msmeRegnNumber: 'tax_bank',
    accountName: 'tax_bank',
    bankName: 'tax_bank',
    bankIfscCode: 'tax_bank',
    gstNo: 'tax_bank',
    gstNumber: 'tax_bank',
    cinNo: 'tax_bank',
    tanNumber: 'tax_bank',
    accountNumber: 'tax_bank',
    typeOfAccount: 'tax_bank',
    bankAddress: 'tax_bank',
    partnerCompanies: 'overview',
    partnerCompany: 'overview',
};

// ─── Component Props ──────────────────────────────────────────────────────────
export interface OrganizationFormProps {
    mode?: 'create' | 'edit' | 'view';
    initialData?: Partial<OrganizationFormData>;
    organizationId?: string;
    breadcrumbItems?: BreadcrumbItem[];
    /** Tab shown first (this form mounts only the active tab). */
    initialTab?: TabKey;
}

export default function OrganizationForm({
    mode = 'create',
    initialData,
    organizationId,
    breadcrumbItems,
    initialTab = 'overview',
}: OrganizationFormProps) {
    const router = useRouter();
    const { user } = useAuth();
    const isAdmin = user?.role?.toLowerCase() === 'admin';

    // A new record starts from the admin's dropdown defaults (Form Builder › Dropdowns); read once, like useForm.
    const [startValues] = useState<OrganizationFormData>(() =>
        mode === 'create'
            ? withDefaultAssignee(
                  withDropdownDefaults(getFormConfigs(), 'organizations', { ...DEFAULT_FORM, ...initialData }, initialData),
                  'assignedUser',
                  user?.username,
              )
            : { ...DEFAULT_FORM, ...initialData },
    );
    const [form, setForm] = useState<OrganizationFormData>(startValues);
    // Lock is based on the status as last saved, so deactivating mid-edit doesn't lock the user out of their own unsaved change.
    const [persistedStatus, setPersistedStatus] = useState(initialData?.accountStatus ?? 'Active');
    const [activeTab, setActiveTab] = useState<TabKey>(initialTab);
    const [audit, setAudit] = useState<{ createdAt?: string; createdBy?: string; updatedAt?: string; updatedBy?: string }>({});
    const pendingFocusField = useRef<string | null>(null);
    // Values "Discard" resets to: blank for create, the last loaded record for edit.
    const baselineRef = useRef<OrganizationFormData>(startValues);
    const [submitting, setSubmitting] = useState(false);
    const [isDirty, setIsDirty] = useState(false);
    const [toast, setToast] = useState<{ open: boolean; message: string; severity: 'success' | 'error' | 'info' }>({
        open: false,
        message: '',
        severity: 'success',
    });

    const methods = useForm<OrganizationFormData>({
        defaultValues: startValues,
        mode: 'onTouched',
    });
    // Configuration loaded (or changed) after the form opened: untouched dropdowns follow, in the mirror too.
    useDropdownDefaults(methods, 'organizations', {
        enabled: mode === 'create',
        keep: initialData,
        onApply: (values) => {
            setForm((prev) => ({ ...prev, ...values }));
            baselineRef.current = { ...baselineRef.current, ...values };
        },
    });

    const isInactive = mode !== 'create' && persistedStatus === 'Inactive';
    const isLocked = isInactive && !isAdmin;
    const effectiveMode = isLocked ? 'view' : mode;

    // "Discard & Leave" (CommonFormLayout's unsaved-changes guard) resets the local mirror of the form too.
    const handleGuardDiscard = () => {
        const baseline = baselineRef.current;
        setForm(baseline);
        methods.reset(baseline);
        setIsDirty(false);
        setActiveTab('overview');
    };

    const defaultBreadcrumbs: BreadcrumbItem[] = [
        { label: 'Sales' },
        { label: 'Organizations', href: ROUTES.ORGANIZATIONS },
        { label: mode !== 'create' ? (form.organizationName ? `${mode === 'view' ? 'View' : 'Edit'}: ${form.organizationName}` : `${mode === 'view' ? 'View' : 'Edit'} Organization`) : 'Create & Edit View' },
    ];

    // After a validation-driven tab switch, focus the field once the new tab has rendered.
    useEffect(() => {
        const field = pendingFocusField.current;
        if (!field) return;
        pendingFocusField.current = null;
        const frame = requestAnimationFrame(() => focusFormField(field));
        return () => cancelAnimationFrame(frame);
    }, [activeTab]);

    // Populate data when editing
    useEffect(() => {
        if (!organizationId) return;
        let active = true;
        organizationService
            .getById(organizationId)
            .then((found) => {
                if (active && found) {
                    const normalized: OrganizationFormData = normalizeAddressFields<OrganizationFormData>({
                        ...found,
                        accountStatus: found.accountStatus === 'Inactive' ? 'Inactive' : 'Active',
                        billingAddress: found.billingAddress || found.billingStreet || '',
                        shippingAddress: found.shippingAddress || found.shippingStreet || '',
                        gstNo: found.gstNo || found.gstNumber || '',
                        // Mailing name always mirrors the organization name; older records may lack a trade name.
                        mailingName: found.organizationName,
                        tradeName: found.tradeName || found.organizationName,
                        partnerCompany: found.partnerCompanies?.[0] || '',
                    }, ORGANIZATION_ADDRESS_PAIRS);
                    setAudit({
                        createdAt: found.createdAt,
                        createdBy: found.createdBy,
                        updatedAt: found.updatedAt,
                        updatedBy: found.updatedBy,
                    });
                    baselineRef.current = { ...DEFAULT_FORM, ...normalized };
                    setPersistedStatus(normalized.accountStatus);
                    setForm((prev) => ({ ...prev, ...normalized }));
                    methods.reset(normalized);
                }
            })
            .catch(() => {});
        return () => {
            active = false;
        };
    }, [organizationId, methods]);

    // ── Field updaters ────────────────────────────────────────────────────────
    const set = useCallback(
        <K extends keyof OrganizationFormData>(key: K, value: OrganizationFormData[K]) => {
            setForm((prev) => {
                const next = { ...prev, [key]: value };
                if (next.copyAddressFromBilling) {
                    if (key === 'billingStreet' || key === 'billingAddress') {
                        next.shippingStreet = value as string;
                        next.shippingAddress = value as string;
                    }
                    if (key === 'billingCity') next.shippingCity = value as string;
                    if (key === 'billingState') next.shippingState = value as string;
                    if (key === 'billingPostalCode') next.shippingPostalCode = value as string;
                    if (key === 'billingCountry') next.shippingCountry = value as string;
                }
                return next;
            });
            methods.setValue(key as Path<OrganizationFormData>, value as never, {
                shouldDirty: true,
                shouldValidate: true,
            });
            setIsDirty(true);
        },
        [methods]
    );

    const handleCopyAddressToggle = (checked: boolean) => {
        const billingAddr = form.billingAddress || form.billingStreet || '';
        setForm((prev) => ({
            ...prev,
            copyAddressFromBilling: checked,
            ...(checked
                ? {
                      shippingStreet: billingAddr,
                      shippingAddress: billingAddr,
                      shippingCity: prev.billingCity || '',
                      shippingState: prev.billingState || '',
                      shippingPostalCode: prev.billingPostalCode || '',
                      shippingCountry: prev.billingCountry || 'IN',
                  }
                : {}),
        }));
        methods.setValue('copyAddressFromBilling', checked, { shouldDirty: true });
        if (checked) {
            methods.setValue('shippingAddress', billingAddr, { shouldDirty: true });
            methods.setValue('shippingStreet', billingAddr, { shouldDirty: true });
            methods.setValue('shippingCity', form.billingCity || '', { shouldDirty: true });
            methods.setValue('shippingState', form.billingState || '', { shouldDirty: true });
            methods.setValue('shippingPostalCode', form.billingPostalCode || '', { shouldDirty: true });
            methods.setValue('shippingCountry', form.billingCountry || 'IN', { shouldDirty: true });
        }
        setIsDirty(true);
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
        if (form.tradeName?.trim()) count++;
        if (form.annualTurnover) count++;
        if (form.description.trim()) count++;
        return Math.min(count, 10);
    }, [form]);

    // ── Submit logic with Zod Validation ──────────────────────────────────────
    const handleSubmit = async (redirectAfter: boolean) => {
        if (isLocked) return;
        const currentData = { ...form, ...methods.getValues() };
        // Mailing name is not editable: it is always the organization name.
        currentData.mailingName = currentData.organizationName;
        if (!currentData.billingAddress && currentData.billingStreet) {
            currentData.billingAddress = currentData.billingStreet;
        }
        if (!currentData.billingStreet && currentData.billingAddress) {
            currentData.billingStreet = currentData.billingAddress;
        }
        if (!currentData.shippingAddress && currentData.shippingStreet) {
            currentData.shippingAddress = currentData.shippingStreet;
        }
        if (!currentData.shippingStreet && currentData.shippingAddress) {
            currentData.shippingStreet = currentData.shippingAddress;
        }
        if (!currentData.gstNo && currentData.gstNumber) {
            currentData.gstNo = currentData.gstNumber;
        }
        if (!currentData.gstNumber && currentData.gstNo) {
            currentData.gstNumber = currentData.gstNo;
        }

        // The single Partner Company lookup owns the first entry; any further saved partners are kept behind it.
        const partner = currentData.partnerCompany?.trim() ?? '';
        const otherPartners = (currentData.partnerCompanies ?? []).slice(1).filter((p) => p !== partner);
        currentData.partnerCompanies = partner ? [partner, ...otherPartners] : [];

        // Switches to the tab that renders the field (if needed) and focuses it.
        const revealField = (fieldName: string) => {
            const targetTab = FIELD_TAB_MAP[fieldName];
            if (targetTab && targetTab !== activeTab) {
                pendingFocusField.current = fieldName;
                setActiveTab(targetTab);
            } else {
                focusFormField(fieldName);
            }
        };

        // The live check already found this name taken: don't round-trip just to be told again.
        const nameError = methods.getFieldState('organizationName').error;
        if (nameError?.type === 'duplicate') {
            setToast({ open: true, message: nameError.message || 'An organization with this name already exists.', severity: 'error' });
            revealField('organizationName');
            return;
        }

        const validation = validateWithToast(organizationFormSchema, currentData);
        if (!validation.success) {
            setToast({ open: true, message: validation.error, severity: 'error' });
            if (validation.fieldName) revealField(validation.fieldName);
            return;
        }

        // Admin form rules: required custom fields, built-in fields made required, custom field formats.
        const configIssues = validateConfiguredFields(getFormConfigs(), 'organizations', currentData);
        if (configIssues.length > 0) {
            for (const issue of configIssues) {
                methods.setError(issue.path as Path<OrganizationFormData>, { type: 'custom', message: issue.message });
            }
            const first = configIssues[0];
            setToast({ open: true, message: first.message, severity: 'error' });
            const customKey = first.path.startsWith('customFields.') ? first.path.slice('customFields.'.length) : undefined;
            const customTab = customKey
                ? (getFormConfigs()?.fieldsByModule.organizations.find((f) => f.fieldKey === customKey)?.tabKey as TabKey | undefined)
                : undefined;
            if (customTab && customTab !== activeTab) {
                pendingFocusField.current = first.path;
                setActiveTab(customTab);
            } else {
                revealField(first.path);
            }
            return;
        }
        setSubmitting(true);
        try {
            if (mode === 'create') {
                await organizationService.create(currentData as OrganizationFormData);
                setIsDirty(false);
                setToast({ open: true, message: 'Organization created successfully!', severity: 'success' });
                if (redirectAfter) {
                    setTimeout(() => router.push(ROUTES.ORGANIZATIONS), 800);
                } else {
                    const fresh = withDefaultAssignee(
                        withDropdownDefaults(getFormConfigs(), 'organizations', DEFAULT_FORM),
                        'assignedUser',
                        user?.username,
                    );
                    setForm(fresh);
                    methods.reset(fresh);
                    setIsDirty(false);
                }
            } else if (mode === 'edit' && organizationId) {
                await organizationService.update(organizationId, currentData as OrganizationFormData);
                setIsDirty(false);
                setToast({ open: true, message: 'Organization updated successfully!', severity: 'success' });
                setTimeout(() => router.push(ROUTES.ORGANIZATIONS), 800);
            }
        } catch (err: unknown) {
            let message = err instanceof Error ? err.message : 'Something went wrong. Please try again.';
            if (err instanceof ApiClientError) {
                // 409 / 400 responses name the offending fields: mark them inline and take the user to the first one.
                const fieldErrors = (err.details?.errors ?? []).filter((e) => e.path?.[0]);
                // Nested paths (e.g. ['customFields', 'cf_region']) join into the RHF name of that input.
                fieldErrors.forEach((fieldErr) => {
                    methods.setError(fieldErr.path.join('.') as Path<OrganizationFormData>, { type: 'server', message: fieldErr.message });
                });
                if (fieldErrors.length > 0) {
                    message = fieldErrors[0].message || message;
                    revealField(fieldErrors[0].path.join('.'));
                }
            }
            setToast({ open: true, message, severity: 'error' });
        } finally {
            setSubmitting(false);
        }
    };

    // While dirty, CommonFormLayout asks "Keep Editing" / "Discard & Leave" before this runs.
    const handleDiscard = () => router.push(ROUTES.ORGANIZATIONS);

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
    ], [progressCount, form.billingCity, form.shippingCity]);

    return (
        <FormProvider {...methods}>
            <FormConfigProvider module="organizations">
                <CommonFormLayout
                    isDirty={isDirty}
                    onDiscard={handleGuardDiscard}
                    breadcrumbItems={breadcrumbItems || defaultBreadcrumbs}
                    tabs={tabs}
                    activeTab={activeTab}
                    onTabChange={(tabId) => setActiveTab(tabId as TabKey)}
                    onCancel={handleDiscard}
                    onSave={effectiveMode === 'view' ? () => router.push(ROUTES.ORGANIZATION_EDIT(organizationId!)) : () => handleSubmit(true)}
                    recordView={{
                        title: form.organizationName,
                        subtitle: [form.tradeName, [form.billingCity, form.billingState].filter(Boolean).join(', ')]
                            .filter(Boolean)
                            .join(' • '),
                        avatarIcon: <ApartmentIcon sx={{ fontSize: 28 }} />,
                        verified: form.accountVerified,
                        statusLabel: form.accountStatus || undefined,
                        statusColor: form.accountStatus === 'Inactive' ? 'var(--mui-palette-text-secondary)' : 'var(--mui-palette-success-main)',
                        editHref: organizationId ? ROUTES.ORGANIZATION_EDIT(organizationId) : undefined,
                        editLabel: 'Edit Organization',
                        editDisabled: isLocked,
                        editDisabledTooltip: 'Only Admins can edit inactive organizations',
                        backHref: ROUTES.ORGANIZATIONS,
                        audit,
                    }}
                    saveDisabled={isLocked}
                    saveDisabledTooltip="Only Admins can edit inactive organizations"
                    banner={
                        isLocked ? (
                            <Alert severity="warning" sx={{ mb: 2.5, borderRadius: '8px' }}>
                                <Typography sx={{ fontWeight: 700, fontSize: '0.85rem' }}>This organization is Inactive</Typography>
                                <Typography sx={{ fontSize: '0.8rem', mt: 0.5 }}>
                                    <strong>Reason:</strong> {form.inactivityReason || 'No reason specified'}
                                </Typography>
                                <Typography sx={{ fontSize: '0.75rem', color: 'var(--mui-palette-text-secondary)', mt: 0.5 }}>
                                    This record is locked. Only users with the <strong>Admin</strong> role can edit or reactivate this account.
                                </Typography>
                            </Alert>
                        ) : isInactive ? (
                            <Alert severity="info" sx={{ mb: 2.5, borderRadius: '8px' }}>
                                <strong>Inactive Organization (Admin Override):</strong> Reason: {form.inactivityReason || 'N/A'}. You have administrative privileges to edit or reactivate this organization.
                            </Alert>
                        ) : undefined
                    }
                    submitting={submitting}
                    saveLabel={effectiveMode === 'view' ? 'Edit Organization' : mode === 'edit' ? 'Update Organization' : 'Save Organization'}
                    cancelLabel={effectiveMode === 'view' ? 'Back' : 'Cancel'}
                    mode={effectiveMode}
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
                            organizationId={organizationId}
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

                    {/* Admin-added custom fields of the active tab */}
                    <DynamicModuleCustomFields key={activeTab} module="organizations" tabKey={activeTab} />

                </CommonFormLayout>
            </FormConfigProvider>
        </FormProvider>
    );
}
