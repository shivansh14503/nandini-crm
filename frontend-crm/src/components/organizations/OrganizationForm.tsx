'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { isSuperAdminRole } from '@/utils/roleAccess';
import { useResetTab } from '@/hooks/useResetTab';
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
import { setSaveFlash } from '@/utils/saveFlash';
import { CommonFormLayout } from '../common/CommonFormLayout';
import { type FormTabDefinition } from '../common/Drawer';
import { organizationService } from '@/services';
import { ApiClientError } from '@/services/apiClient';
import { useAuth } from '@/context/AuthContext';
import { ROUTES } from '@/config/constants';
import { focusFormField } from '@/utils/formFocus';
import { normalizeAddressFields } from '@/utils/address';
import { organizationFormSchema } from '../../validations';
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
import { useFormConfigs } from '@/hooks/queries/useFormConfigs';
import { fieldFormName, moduleFields, validateConfiguredFields, type ConfigValidationIssue } from '@/utils/formConfig';
import type { FormConfigsPayload } from '@/types/formConfig.types';
import type { FormStepwise } from '@/components/forms/formStepwise';
import { useDropdownDefaults, withDropdownDefaults } from '@/components/forms/rhf/useDropdownDefaults';
import { useTaxIdDuplicateCheck } from '@/components/forms/rhf/useTaxIdDuplicateCheck';
import { withDefaultAssignee } from '@/components/forms/rhf/useRhfForm';
import { useShowRecordNumber } from '@/hooks/queries/useDocumentSeries';

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
    natureOfPartner: '',
    sapCodeTallyId: '',
    showroomBranchCode: '',
    leadSource: '',
    memberOf: '',
    numberOfEmployees: '',
    annualTurnover: '',
    addDescriptionAndScope: '',
    accountVerified: false,
    provideSupport: 'Yes',
    verifiedAt: '',
    verifiedBy: '',
    activeAmc: false,
    activeCloud: false,
    assignedTo: '',

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
    // Empty until picked (Form Builder decides whether it's required), so nothing is chosen for the user.
    registrationType: '',
    panNumber: '',
    msmeRegnNumber: '',
    accountName: '',
    bankName: '',
    ifscCode: '',
    gstNumber: '',
    cinNo: '',
    tanNumber: '',
    accountNo: '',
    typeOfAccount: '',
    bankAddress: '',

    // Partner companies saved before the field was removed are kept as they are.
    partnerCompanies: [],
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
    natureOfPartner: 'overview',
    sapCodeTallyId: 'overview',
    showroomBranchCode: 'overview',
    leadSource: 'overview',
    memberOf: 'overview',
    numberOfEmployees: 'overview',
    annualTurnover: 'overview',
    addDescriptionAndScope: 'overview',
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
    ifscCode: 'tax_bank',
    gstNumber: 'tax_bank',
    cinNo: 'tax_bank',
    tanNumber: 'tax_bank',
    accountNo: 'tax_bank',
    typeOfAccount: 'tax_bank',
    bankAddress: 'tax_bank',
};

const FIELD_ORDER = Object.keys(FIELD_TAB_MAP);
const TAB_ORDER: string[] = ORGANIZATION_FORM_TABS.map((t) => t.id);

/** Tab that renders a field: the hand-built tabs first, then the admin configuration (custom fields). */
function issueTab(configs: FormConfigsPayload | null, path: string): string | undefined {
    const builtIn = FIELD_TAB_MAP[path.split('.')[0]];
    if (builtIn) return builtIn;
    return moduleFields(configs, 'organizations').find((f) => fieldFormName(f) === path)?.tabKey;
}

const tabRank = (tab: string | undefined) => {
    const index = tab ? TAB_ORDER.indexOf(tab) : -1;
    return index === -1 ? TAB_ORDER.length : index;
};

/**
 * Every problem blocking a save, in the order the form shows the fields (tab by tab, then top to bottom), so the
 * user is walked through them one at a time instead of being sent to a later tab's rule first.
 */
function collectOrganizationIssues(configs: FormConfigsPayload | null, data: OrganizationFormData): ConfigValidationIssue[] {
    const issues: ConfigValidationIssue[] = [];
    const parsed = organizationFormSchema.safeParse(data);
    if (!parsed.success) {
        for (const issue of parsed.error.issues) {
            const [head, key] = issue.path.map(String);
            issues.push({ path: head === 'customFields' && key ? `${head}.${key}` : (head ?? ''), message: issue.message });
        }
    }
    issues.push(...validateConfiguredFields(configs, 'organizations', data));

    const fields = moduleFields(configs, 'organizations');
    const position = (path: string) => {
        const configured = fields.find((f) => fieldFormName(f) === path);
        if (configured) return configured.sortOrder;
        const index = FIELD_ORDER.indexOf(path);
        return 1_000_000 + (index === -1 ? FIELD_ORDER.length : index);
    };
    const seen = new Set<string>();
    return issues
        .filter((issue) => issue.path && !seen.has(issue.path) && seen.add(issue.path))
        .map((issue, index) => ({ issue, index, tab: tabRank(issueTab(configs, issue.path)), pos: position(issue.path) }))
        .sort((a, b) => a.tab - b.tab || a.pos - b.pos || a.index - b.index)
        .map(({ issue }) => issue);
}

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
    // Admin, and Super Admin (full access everywhere), may open and edit an inactive account.
    const isAdmin = user?.role?.toLowerCase() === 'admin' || isSuperAdminRole(user?.role);

    // A new record starts from the admin's dropdown defaults (Form Builder › Dropdowns); read once, like useForm.
    const [startValues] = useState<OrganizationFormData>(() =>
        mode === 'create'
            ? withDefaultAssignee(
                  withDropdownDefaults(getFormConfigs(), 'organizations', { ...DEFAULT_FORM, ...initialData }, initialData),
                  'assignedTo',
                  user?.username,
              )
            : { ...DEFAULT_FORM, ...initialData },
    );
    const [form, setForm] = useState<OrganizationFormData>(startValues);
    // Lock is based on the status as last saved, so deactivating mid-edit doesn't lock the user out of their own unsaved change.
    const [recordCode, setRecordCode] = useState('');
    const showNumber = useShowRecordNumber();
    const [persistedStatus, setPersistedStatus] = useState(initialData?.accountStatus ?? 'Active');
    const [activeTab, setActiveTab] = useResetTab<TabKey>(initialTab);
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
    const formConfigs = useFormConfigs();
    // GSTIN / PAN another organization already uses are flagged as soon as they're fully typed.
    useTaxIdDuplicateCheck(methods, { owner: 'organization', excludeId: organizationId, enabled: mode !== 'view' });
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
    // True until the saved record arrives (view / edit), so the form shows skeleton fields, not empty ones.
    const [recordLoading, setRecordLoading] = useState(Boolean(organizationId));
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
                        gstNumber: found.gstNumber || '',
                        // Mailing name always mirrors the organization name; older records may lack a trade name.
                        mailingName: found.organizationName,
                        tradeName: found.tradeName || found.organizationName,
                    }, ORGANIZATION_ADDRESS_PAIRS);
                    setAudit({
                        createdAt: found.createdAt,
                        createdBy: found.createdBy,
                        updatedAt: found.updatedAt,
                        updatedBy: found.updatedBy,
                    });
                    baselineRef.current = { ...DEFAULT_FORM, ...normalized };
                    setRecordCode(found.accountCode ?? '');
                    setPersistedStatus(normalized.accountStatus);
                    setForm((prev) => ({ ...prev, ...normalized }));
                    methods.reset(normalized);
                }
            })
            .catch(() => {})
            .finally(() => {
                if (active) setRecordLoading(false);
            });
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

    // ── Submit logic with Zod Validation ──────────────────────────────────────
    /** The values a save sends: the local mirror with the form's values on top, normalised. */
    const buildSubmitData = (): OrganizationFormData => {
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
        return currentData;
    };

    /**
     * Schema rules + admin form rules (required custom fields, built-in fields made required, custom field formats),
     * in the form's order. A name the live check already found taken comes first: no round-trip to be told again.
     */
    const collectIssues = (data: OrganizationFormData): ConfigValidationIssue[] => {
        const issues = collectOrganizationIssues(formConfigs, data);
        const nameError = methods.getFieldState('organizationName').error;
        if (nameError?.type === 'duplicate') {
            const message = nameError.message || 'An organization with this name already exists.';
            return [{ path: 'organizationName', message }, ...issues.filter((i) => i.path !== 'organizationName')];
        }
        return issues;
    };

    // Switches to the tab that renders the field (if needed) and focuses it; unknown fields stay on the current tab.
    const revealField = (fieldName: string) => {
        const targetTab = issueTab(formConfigs, fieldName) as TabKey | undefined;
        if (targetTab && targetTab !== activeTab) {
            pendingFocusField.current = fieldName;
            setActiveTab(targetTab);
        } else {
            focusFormField(fieldName);
        }
    };

    /** Flags one issue on its field (keeping an error already there, e.g. the duplicate name), says why and goes to it. */
    const reportIssue = (issue: ConfigValidationIssue) => {
        const path = issue.path as Path<OrganizationFormData>;
        if (!methods.getFieldState(path).error) methods.setError(path, { type: 'custom', message: issue.message });
        setToast({ open: true, message: issue.message, severity: 'error' });
        revealField(issue.path);
    };

    // Save / "Next" checks of CommonFormLayout (Next on a new organization until every required field is in).
    const stepwise: FormStepwise = {
        issues: () => collectIssues(buildSubmitData()),
        notify: (message) => setToast({ open: true, message, severity: 'error' }),
        fieldTab: (path) => FIELD_TAB_MAP[path.split('.')[0]],
    };

    const handleSubmit = async (redirectAfter: boolean) => {
        if (isLocked) return;
        const currentData = buildSubmitData();
        const [firstIssue] = collectIssues(currentData);
        if (firstIssue) {
            reportIssue(firstIssue);
            return;
        }
        setSubmitting(true);
        try {
            if (mode === 'create') {
                const created = await organizationService.create(currentData as OrganizationFormData);
                setIsDirty(false);
                if (redirectAfter) {
                    setSaveFlash({ listPath: ROUTES.ORGANIZATIONS, message: 'Organization created successfully!', severity: 'success', recordId: created?.id });
                    router.push(ROUTES.ORGANIZATIONS);
                } else {
                    setToast({ open: true, message: 'Organization created successfully!', severity: 'success' });
                    const fresh = withDefaultAssignee(
                        withDropdownDefaults(getFormConfigs(), 'organizations', DEFAULT_FORM),
                        'assignedTo',
                        user?.username,
                    );
                    setForm(fresh);
                    methods.reset(fresh);
                    setIsDirty(false);
                }
            } else if (mode === 'edit' && organizationId) {
                await organizationService.update(organizationId, currentData as OrganizationFormData);
                setIsDirty(false);
                setSaveFlash({ listPath: ROUTES.ORGANIZATIONS, message: 'Organization updated successfully!', severity: 'success', recordId: organizationId });
                router.push(ROUTES.ORGANIZATIONS);
            }
        } catch (err: unknown) {
            let message = err instanceof Error ? err.message : 'Something went wrong. Please try again.';
            if (err instanceof ApiClientError) {
                // 409 / 400 responses name the offending fields: mark them inline and take the user to the first one.
                const fieldErrors = (err.details?.errors ?? []).filter((e) => e.path?.[0]);
                // Nested paths (e.g. ['customFields', 'region']) join into the RHF name of that input.
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

    return (
        <FormProvider {...methods}>
            <FormConfigProvider module="organizations">
                <CommonFormLayout
                    loading={recordLoading}
                    isDirty={isDirty}
                    onDiscard={handleGuardDiscard}
                    breadcrumbItems={breadcrumbItems || defaultBreadcrumbs}
                    tabs={ORGANIZATION_FORM_TABS}
                    activeTab={activeTab}
                    onTabChange={(tabId) => setActiveTab(tabId as TabKey)}
                    onCancel={handleDiscard}
                    onSave={effectiveMode === 'view' ? () => router.push(ROUTES.ORGANIZATION_EDIT(organizationId!)) : () => handleSubmit(true)}
                    stepwise={isLocked ? undefined : stepwise}
                    recordView={{
                        title: form.organizationName,
                        code: showNumber('organization') ? recordCode : undefined,
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
