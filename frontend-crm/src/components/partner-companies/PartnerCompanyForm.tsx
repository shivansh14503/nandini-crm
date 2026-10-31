'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { FormProvider, useWatch, type FieldErrors, type Path } from 'react-hook-form';
import { Box, Divider } from '@mui/material';
import ArticleOutlinedIcon from '@mui/icons-material/ArticleOutlined';
import PlaceOutlinedIcon from '@mui/icons-material/PlaceOutlined';
import ReceiptLongOutlinedIcon from '@mui/icons-material/ReceiptLongOutlined';
import HandshakeOutlinedIcon from '@mui/icons-material/HandshakeOutlined';
import AccountBalanceOutlinedIcon from '@mui/icons-material/AccountBalanceOutlined';

import { type BreadcrumbItem } from '../common/AppBreadcrumbs';
import { AppToast } from '../common/AppToast';
import { CommonFormLayout } from '../common/CommonFormLayout';
import { type FormTabDefinition } from '../common/Drawer';
import { UnsavedChangesModal } from '../common/UnsavedChangesModal';
import {
    FIELD_MAX_LENGTH,
    FormGrid,
    FormGridItem,
    RhfAddressSection,
    RhfEmailList,
    RhfLookup,
    RhfPhoneField,
    RhfSelect,
    RhfTextField,
    RhfUppercaseField,
    SectionLabel,
    useRhfForm,
} from '@/components/forms';
import { ROUTES } from '@/config/constants';
import { useAuth } from '@/context/AuthContext';
import { useFormDraftGuard } from '@/hooks/useFormDraftGuard';
import { ApiClientError, partnerCompanyService } from '@/services';
import { NATURE_OF_PARTNER_OPTIONS, type PartnerCompanyFormData } from '@/types/partner.types';
import { normalizeAddressFields } from '@/utils/address';
import { focusFormField } from '@/utils/formFocus';
import { getFirstErrorMessage, partnerCompanyFormSchema } from '@/validations';

export type PartnerCompanyTabKey = 'company_info' | 'address' | 'statutory';

// ─── Single Source of Truth for Partner Company Form Tabs ─────────────────────
export const PARTNER_COMPANY_FORM_TABS: (FormTabDefinition & { id: PartnerCompanyTabKey })[] = [
    { id: 'company_info', label: 'Company Information', icon: <ArticleOutlinedIcon sx={{ fontSize: 18 }} /> },
    { id: 'address', label: 'Address Information', icon: <PlaceOutlinedIcon sx={{ fontSize: 18 }} /> },
    { id: 'statutory', label: 'Statutory', icon: <ReceiptLongOutlinedIcon sx={{ fontSize: 18 }} /> },
];

const STATUTORY_FIELDS = new Set(['gstNo', 'panNumber', 'cinNo', 'msmeRegnNumber', 'tanNumber']);

/** Tab that renders a field, so validation can take the user to it. */
function tabForField(field: string): PartnerCompanyTabKey {
    if (/^(billing|shipping|copyAddress)/.test(field)) return 'address';
    if (STATUTORY_FIELDS.has(field)) return 'statutory';
    return 'company_info';
}

const DEFAULT_FORM: PartnerCompanyFormData = {
    companyName: '',
    natureOfPartner: '',
    phone: '',
    website: '',
    emailAddresses: [{ id: 'eml-1', email: '', isPrimary: true, isOptedOut: false, isInvalidBounce: false }],
    addDescription: '',
    description: '',
    assignedTo: '',
    principalCompany: '',

    bankName: '',
    bankBranch: '',
    accountNumber: '',
    bankIfscCode: '',

    billingAddress: '',
    billingStreet: '',
    billingCity: '',
    billingState: '',
    billingPostalCode: '',
    billingCountry: 'IN',

    shippingAddress: '',
    shippingStreet: '',
    shippingCity: '',
    shippingState: '',
    shippingPostalCode: '',
    shippingCountry: 'IN',
    copyAddressFromBilling: false,

    gstNo: '',
    panNumber: '',
    cinNo: '',
    msmeRegnNumber: '',
    tanNumber: '',
};

/** Country/state pairs normalised to the ISO address master when a saved partner company is loaded. */
const ADDRESS_PAIRS = [
    ['billingCountry', 'billingState'],
    ['shippingCountry', 'shippingState'],
] as const;

/** Keeps only the form's own keys (the API record also carries id, audit fields and aliases). */
function toFormValues(record: Partial<PartnerCompanyFormData>): PartnerCompanyFormData {
    const values = { ...DEFAULT_FORM };
    for (const key of Object.keys(DEFAULT_FORM) as (keyof PartnerCompanyFormData)[]) {
        const value = record[key];
        if (value !== undefined && value !== null) (values as Record<string, unknown>)[key] = value;
    }
    if (values.emailAddresses.length === 0) values.emailAddresses = DEFAULT_FORM.emailAddresses;
    return normalizeAddressFields(values, ADDRESS_PAIRS);
}

const sectionDividerSx = { my: 3.5, borderColor: '#f1f5f9' } as const;
const panelSx = { p: { xs: 2.5, md: 3.5 } } as const;

export interface PartnerCompanyFormProps {
    mode?: 'create' | 'edit' | 'view';
    initialData?: Partial<PartnerCompanyFormData>;
    partnerCompanyId?: string;
    breadcrumbItems?: BreadcrumbItem[];
}

export default function PartnerCompanyForm({
    mode = 'create',
    initialData,
    partnerCompanyId,
    breadcrumbItems,
}: PartnerCompanyFormProps) {
    const router = useRouter();
    const { user } = useAuth();
    const [activeTab, setActiveTab] = useState<PartnerCompanyTabKey>('company_info');
    const pendingFocusField = useRef<string | null>(null);

    // New records default to the signed-in user as owner.
    const initialValues = useMemo<PartnerCompanyFormData>(
        () => toFormValues({ ...DEFAULT_FORM, assignedTo: mode === 'create' ? user?.username ?? '' : '', ...initialData }),
        // Computed once per mount: later changes must not reset what the user typed.
        // eslint-disable-next-line react-hooks/exhaustive-deps
        []
    );
    // Values "Discard" resets to: blank for create, the last loaded record for edit.
    const [baseline, setBaseline] = useState<PartnerCompanyFormData>(initialValues);
    // In edit mode drafts are restored only after the saved record has loaded, so they aren't overwritten by it.
    const [recordLoaded, setRecordLoaded] = useState(!partnerCompanyId);

    const { methods, toast, showToast, closeToast } = useRhfForm<PartnerCompanyFormData>({
        schema: partnerCompanyFormSchema,
        defaultValues: initialValues,
    });
    const { reset, control, formState, handleSubmit, setError } = methods;
    const { isDirty, isSubmitting } = formState;
    const watchedValues = useWatch({ control }) as PartnerCompanyFormData;
    const companyName = watchedValues.companyName ?? '';

    const { clearDraft, confirmDiscard, discardModalOpen, handleKeepEditing, handleDiscardAndLeave } =
        useFormDraftGuard<PartnerCompanyFormData>({
            draftKey: mode === 'create' ? 'crm_draft_partner_company_new' : `crm_draft_partner_company_${partnerCompanyId}`,
            isDirty,
            currentValues: watchedValues,
            defaultValues: baseline,
            onRestoreDraft: (draft) => {
                // keepDefaultValues: the restored draft still counts as unsaved changes.
                reset(toFormValues(draft), { keepDefaultValues: true });
                showToast('Unsaved draft restored from your previous session.', 'info');
            },
            enabled: mode !== 'view' && recordLoaded,
            navigate: (href) => router.push(href),
            onDiscard: () => {
                reset(baseline);
                setActiveTab('company_info');
            },
        });

    const defaultBreadcrumbs: BreadcrumbItem[] = [
        { label: 'All' },
        { label: 'Partner Companies', href: ROUTES.PARTNER_COMPANIES },
        {
            label:
                mode === 'create'
                    ? 'Create Partner Company'
                    : companyName
                      ? `${mode === 'view' ? 'View' : 'Edit'}: ${companyName}`
                      : `${mode === 'view' ? 'View' : 'Edit'} Partner Company`,
        },
    ];

    // Load the saved record when editing / viewing.
    useEffect(() => {
        if (!partnerCompanyId) return;
        let active = true;
        partnerCompanyService
            .getById(partnerCompanyId)
            .then((found) => {
                if (!active || !found) return;
                const values = toFormValues(found);
                setBaseline(values);
                reset(values);
            })
            .catch(() => {})
            .finally(() => {
                if (active) setRecordLoaded(true);
            });
        return () => {
            active = false;
        };
    }, [partnerCompanyId, reset]);

    // After a validation-driven tab switch, focus the field once the new tab is visible.
    useEffect(() => {
        const field = pendingFocusField.current;
        if (!field) return;
        pendingFocusField.current = null;
        const frame = requestAnimationFrame(() => {
            if (!focusFormField(field)) methods.setFocus(field as Path<PartnerCompanyFormData>);
        });
        return () => cancelAnimationFrame(frame);
    }, [activeTab, methods]);

    /** Switches to the tab that renders `field` (if needed) and focuses it. */
    const revealField = (field: string) => {
        const target = tabForField(field);
        if (target !== activeTab) {
            pendingFocusField.current = field;
            setActiveTab(target);
        } else if (!focusFormField(field)) {
            methods.setFocus(field as Path<PartnerCompanyFormData>);
        }
    };

    const handleInvalid = (errors: FieldErrors<PartnerCompanyFormData>) => {
        showToast(getFirstErrorMessage(errors) ?? 'Please correct the highlighted fields.', 'error');
        const firstField = Object.keys(errors)[0];
        if (firstField) revealField(firstField);
    };

    const handleValid = async (values: PartnerCompanyFormData) => {
        try {
            if (mode === 'edit' && partnerCompanyId) {
                await partnerCompanyService.update(partnerCompanyId, values);
                showToast(`Partner company "${values.companyName}" updated successfully!`, 'success');
            } else {
                await partnerCompanyService.create(values);
                showToast(`Partner company "${values.companyName}" created successfully!`, 'success');
            }
            clearDraft();
            reset(values);
            setTimeout(() => router.push(ROUTES.PARTNER_COMPANIES), 800);
        } catch (err: unknown) {
            let message = err instanceof Error ? err.message : 'Failed to save partner company.';
            if (err instanceof ApiClientError) {
                // 409 / 400 responses name the offending fields: mark them inline and take the user to the first one.
                const fieldErrors = (err.details?.errors ?? []).filter((e) => e.path?.[0]);
                fieldErrors.forEach((fieldErr) => {
                    setError(fieldErr.path[0] as Path<PartnerCompanyFormData>, { type: 'server', message: fieldErr.message });
                });
                if (fieldErrors.length > 0) {
                    message = fieldErrors[0].message || message;
                    revealField(fieldErrors[0].path[0]);
                }
            }
            showToast(message, 'error');
        }
    };

    // Built at click time: the handlers touch refs (pending focus), which must not be read during render.
    const handleSave = () => handleSubmit(handleValid, handleInvalid)();

    const handleCancel = () => {
        if (mode === 'view') {
            router.push(ROUTES.PARTNER_COMPANIES);
            return;
        }
        confirmDiscard(() => router.push(ROUTES.PARTNER_COMPANIES));
    };

    return (
        <FormProvider {...methods}>
            <CommonFormLayout
                breadcrumbItems={breadcrumbItems || defaultBreadcrumbs}
                tabs={PARTNER_COMPANY_FORM_TABS}
                activeTab={activeTab}
                onTabChange={(tabId) => setActiveTab(tabId as PartnerCompanyTabKey)}
                onCancel={handleCancel}
                onSave={mode === 'view' ? () => router.push(ROUTES.PARTNER_COMPANY_EDIT(partnerCompanyId!)) : handleSave}
                submitting={isSubmitting}
                saveLabel={mode === 'view' ? 'Edit Partner Company' : mode === 'edit' ? 'Update Partner Company' : 'Save Partner Company'}
                cancelLabel={mode === 'view' ? 'Back' : 'Cancel'}
                recordView={{
                    title: companyName,
                    subtitle: [watchedValues.natureOfPartner, watchedValues.billingCity].filter(Boolean).join(' • '),
                    avatarIcon: <HandshakeOutlinedIcon sx={{ fontSize: 28 }} />,
                    editHref: partnerCompanyId ? ROUTES.PARTNER_COMPANY_EDIT(partnerCompanyId) : undefined,
                    editLabel: 'Edit Partner Company',
                    backHref: ROUTES.PARTNER_COMPANIES,
                }}
                mode={mode}
                disableContentPadding
                toast={<AppToast open={toast.open} message={toast.message} severity={toast.severity} onClose={closeToast} />}
            >
                <UnsavedChangesModal
                    open={discardModalOpen}
                    onKeepEditing={handleKeepEditing}
                    onDiscardAndLeave={handleDiscardAndLeave}
                    description="You have unsaved changes. If you leave now, they will be discarded."
                />

                {/* All panels stay mounted so hidden tabs keep their field state and can be focused after a switch. */}
                <Box hidden={activeTab !== 'company_info'} sx={panelSx}>
                    <SectionLabel icon={<HandshakeOutlinedIcon sx={{ fontSize: 18 }} />} label="Company Details" sx={{ mb: 2 }} />
                    <FormGrid columns={3}>
                        <RhfTextField<PartnerCompanyFormData>
                            name="companyName"
                            label="Partner Name"
                            required
                            placeholder="e.g. Computer Care"
                            maxLength={FIELD_MAX_LENGTH.organizationName}
                        />
                        <RhfSelect<PartnerCompanyFormData>
                            name="natureOfPartner"
                            label="Nature of Partner"
                            required
                            options={[...NATURE_OF_PARTNER_OPTIONS]}
                            placeholder="Select Nature of Partner"
                        />
                        <RhfPhoneField<PartnerCompanyFormData> name="phone" label="Office Phone" required placeholder="e.g. 9876543210" />
                        <RhfTextField<PartnerCompanyFormData> name="website" label="Website" placeholder="https://" maxLength={200} />
                        <RhfLookup<PartnerCompanyFormData>
                            name="assignedTo"
                            label="Assigned to"
                            lookupType="user"
                            placeholder="Select assigned user"
                        />
                        <RhfLookup<PartnerCompanyFormData>
                            name="principalCompany"
                            label="Principal Company"
                            lookupType="organization"
                            placeholder="Search or select principal company..."
                        />
                        <FormGridItem span="full">
                            <RhfEmailList name="emailAddresses" label="Email Address" required />
                        </FormGridItem>
                    </FormGrid>
                    <FormGrid columns={2}>
                        <RhfTextField<PartnerCompanyFormData>
                            name="addDescription"
                            label="Add Description"
                            multiline
                            minRows={3}
                            maxRows={6}
                            placeholder="Short note about this partner..."
                            maxLength={FIELD_MAX_LENGTH.longText}
                        />
                        <RhfTextField<PartnerCompanyFormData>
                            name="description"
                            label="Description"
                            multiline
                            minRows={3}
                            maxRows={6}
                            placeholder="Partnership scope, products covered, terms..."
                            maxLength={FIELD_MAX_LENGTH.longText}
                        />
                    </FormGrid>

                    <Divider sx={sectionDividerSx} />

                    <SectionLabel icon={<AccountBalanceOutlinedIcon sx={{ fontSize: 18 }} />} label="BANK DETAILS" sx={{ mb: 2 }} />
                    <FormGrid columns={4}>
                        <RhfTextField<PartnerCompanyFormData> name="bankName" label="Bank Name" placeholder="e.g. HDFC Bank, SBI" maxLength={FIELD_MAX_LENGTH.personName} />
                        <RhfTextField<PartnerCompanyFormData> name="bankBranch" label="Branch" placeholder="e.g. Connaught Place, New Delhi" maxLength={150} />
                        <RhfTextField<PartnerCompanyFormData>
                            name="accountNumber"
                            label="Account No"
                            placeholder="e.g. 50200012345678"
                            numericOnly
                            maxLength={FIELD_MAX_LENGTH.bankAccount}
                        />
                        <RhfUppercaseField<PartnerCompanyFormData>
                            name="bankIfscCode"
                            label="IFSC Code"
                            placeholder="e.g. HDFC0001234"
                            maxLength={FIELD_MAX_LENGTH.ifsc}
                        />
                    </FormGrid>
                </Box>

                <Box hidden={activeTab !== 'address'} sx={panelSx}>
                    <RhfAddressSection<PartnerCompanyFormData>
                        billingTitle="Billing Address"
                        shippingTitle="Shipping Address"
                        copyLabel="Copy address from left"
                        required
                    />
                </Box>

                <Box hidden={activeTab !== 'statutory'} sx={panelSx}>
                    <SectionLabel
                        icon={<ReceiptLongOutlinedIcon sx={{ fontSize: 18 }} />}
                        label="Statutory & Tax Identification"
                        sx={{ mb: 2 }}
                    />
                    <FormGrid columns={3}>
                        <RhfUppercaseField<PartnerCompanyFormData> name="gstNo" label="GST Number" placeholder="e.g. 06AFZFS3757G1Z9" maxLength={FIELD_MAX_LENGTH.gstin} />
                        <RhfUppercaseField<PartnerCompanyFormData> name="panNumber" label="PAN Number" placeholder="e.g. ABCDE1234F" maxLength={FIELD_MAX_LENGTH.pan} />
                        <RhfUppercaseField<PartnerCompanyFormData> name="cinNo" label="CIN No" placeholder="e.g. U74999DL2020PTC123456" maxLength={FIELD_MAX_LENGTH.cin} />
                        <RhfUppercaseField<PartnerCompanyFormData>
                            name="msmeRegnNumber"
                            label="MSME Regn. Number"
                            placeholder="e.g. UDYAM-DL-01-0012345"
                            maxLength={FIELD_MAX_LENGTH.msme}
                        />
                        <RhfUppercaseField<PartnerCompanyFormData> name="tanNumber" label="TAN Number" placeholder="e.g. DELM12345E" maxLength={FIELD_MAX_LENGTH.tan} />
                    </FormGrid>
                </Box>
            </CommonFormLayout>
        </FormProvider>
    );
}
