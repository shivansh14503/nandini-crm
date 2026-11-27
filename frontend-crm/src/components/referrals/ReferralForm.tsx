'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { FormProvider, type Path, type UseFormReturn } from 'react-hook-form';
import ConnectWithoutContactOutlinedIcon from '@mui/icons-material/ConnectWithoutContactOutlined';
import ContactPhoneOutlinedIcon from '@mui/icons-material/ContactPhoneOutlined';

import { ApiClientError } from '@/services/apiClient';
import { type BreadcrumbItem } from '../common/AppBreadcrumbs';
import { AppToast } from '../common/AppToast';
import { setSaveFlash } from '@/utils/saveFlash';
import { type FormTabDefinition } from '../common/Drawer';
import type { RecordAuditStamp } from '../common/Drawer/RecordAuditFooter';
import { CommonFormLayout } from '../common/CommonFormLayout';
import { ROUTES } from '@/config/constants';
import { referralService } from '@/services';
import { referralFormSchema } from '@/validations';
import { FIELD_MAX_LENGTH } from '@/config/fieldLimits';
import { CONTACT_DEPARTMENTS, CONTACT_DESIGNATIONS } from '@/types/contact.types';
import { REFERRAL_STATUSES, type ReferralFormData } from '@/types/referral.types';
import {
    FormGrid,
    RhfEmailList,
    RhfLookup,
    RhfPhoneField,
    RhfSelect,
    RhfTextField,
    SectionLabel,
    useRhfForm,
} from '@/components/forms';
import { FormConfigProvider } from '@/context/FormConfigContext';
import { DynamicModuleCustomFields } from '@/components/forms/DynamicModuleCustomFields';

// ─── Single Source of Truth for Referral Form Tabs ─────────────────────────────
export const REFERRAL_FORM_TABS: FormTabDefinition[] = [
    {
        id: 'overview',
        label: 'Overview',
        icon: <ConnectWithoutContactOutlinedIcon sx={{ fontSize: 18, color: 'var(--crm-text-blue-600)' }} />,
    },
];

export interface ReferralFormProps {
    mode?: 'create' | 'edit' | 'view';
    initialData?: Partial<ReferralFormData>;
    referralId?: string;
    breadcrumbItems?: BreadcrumbItem[];
}

export const REFERRAL_DEFAULT_FORM: ReferralFormData = {
    name: '',
    companyName: '',
    mobile: '',
    officePhone: '',
    emailAddress: [
        {
            id: 'email-1',
            email: '',
            isPrimary: true,
            isOptedOut: false,
            isInvalidBounce: false,
        },
    ],
    assignedTo: '',
    designation: '',
    department: '',
    status: 'Active',
};

const STATUS_OPTIONS = [...REFERRAL_STATUSES];

/** The referral form's fields, in one section (the full form and the Referral Search popup's quick create). */
export function ReferralFormFields() {
    return (
        <>
            <SectionLabel icon={<ContactPhoneOutlinedIcon sx={{ fontSize: 18 }} />} label="Referral Details" />
            <FormGrid columns={3}>
                <RhfTextField<ReferralFormData> name="name" label="Name" required personName placeholder="e.g. Rajesh Kumar" />
                <RhfPhoneField<ReferralFormData> name="mobile" label="Mobile" required hint="Primary mobile" placeholder="e.g. 9876543210" />
                <RhfPhoneField<ReferralFormData> name="officePhone" label="Office Phone" placeholder="e.g. 0112345678" />
                {/* Plain text, not an organization picker. */}
                <RhfTextField<ReferralFormData>
                    name="companyName"
                    label="Company Name"
                    uppercase
                    maxLength={FIELD_MAX_LENGTH.organizationName}
                    placeholder="e.g. KHANNA & ASSOCIATES"
                />
                <RhfSelect<ReferralFormData>
                    name="status"
                    label="Status"
                    required
                    hint="Only Active referrals can be picked as Referred By"
                    options={STATUS_OPTIONS}
                    placeholder="Select Status"
                />
                {/* Required by default; the form builder can relax it. */}
                <RhfEmailList name="emailAddress" />
                <RhfSelect<ReferralFormData> name="designation" label="Designation" options={CONTACT_DESIGNATIONS} placeholder="Select Designation" />
                <RhfSelect<ReferralFormData> name="department" label="Department" options={CONTACT_DEPARTMENTS} placeholder="Select Department" />
                <RhfLookup<ReferralFormData> name="assignedTo" label="Assigned to" lookupType="user" required placeholder="Select assigned sales rep" />
            </FormGrid>
            <DynamicModuleCustomFields module="referrals" tabKey="overview" sx={{ px: 0, pb: 0, mt: 3.5 }} />
        </>
    );
}

/** The form hook both referral forms use: same schema, defaults (dropdown defaults, the user as assignee) and rules. */
export function useReferralRhfForm(mode: 'create' | 'edit' | 'view', initialData?: Partial<ReferralFormData>) {
    return useRhfForm<ReferralFormData>({
        schema: referralFormSchema,
        module: 'referrals',
        defaultValues: { ...REFERRAL_DEFAULT_FORM, ...initialData },
        dropdownDefaults: { enabled: mode === 'create', keep: initialData },
        assigneeField: 'assignedTo',
    });
}

/** Puts a 400 / 409 response's field errors on the form; returns the message to show. */
export function applyReferralSaveError(err: unknown, methods: UseFormReturn<ReferralFormData>): string {
    let message = err instanceof Error ? err.message : 'Failed to save referral.';
    if (err instanceof ApiClientError) {
        // 400 / 409 responses name the offending fields (e.g. a mobile already used by another referral).
        const fieldErrors = (err.details?.errors ?? []).filter((e) => e.path?.[0]);
        fieldErrors.forEach((fieldErr) => {
            methods.setError(fieldErr.path.join('.') as Path<ReferralFormData>, { type: 'server', message: fieldErr.message });
        });
        if (fieldErrors.length > 0) message = fieldErrors[0].message || message;
    }
    return message;
}

export default function ReferralForm({ mode = 'create', initialData, referralId, breadcrumbItems }: ReferralFormProps) {
    const router = useRouter();

    const { methods, toast, showToast, closeToast, createSubmitHandler, stepwise } = useReferralRhfForm(mode, initialData);
    const { reset, watch, formState } = methods;
    const { isDirty, isSubmitting } = formState;
    const referralName = watch('name');
    const [audit, setAudit] = useState<RecordAuditStamp>();

    const verb = mode === 'view' ? 'View' : 'Edit';
    const defaultBreadcrumbs: BreadcrumbItem[] = [
        { label: 'All' },
        { label: 'Referrals', href: ROUTES.REFERRALS },
        { label: mode !== 'create' ? (referralName ? `${verb}: ${referralName}` : `${verb} Referral`) : 'Create Referral' },
    ];

    // True until the saved record arrives (view / edit), so the form shows skeleton fields, not empty ones.
    const [recordLoading, setRecordLoading] = useState(Boolean(referralId));
    useEffect(() => {
        if (!referralId) return;
        let active = true;
        referralService
            .getById(referralId)
            .then((found) => {
                if (active && found) {
                    reset({ ...REFERRAL_DEFAULT_FORM, ...found });
                    setAudit({ createdAt: found.createdAt, createdBy: found.createdBy, updatedAt: found.updatedAt, updatedBy: found.updatedBy, assignedTo: found.assignedTo });
                }
            })
            .catch(() => {})
            .finally(() => {
                if (active) setRecordLoading(false);
            });
        return () => {
            active = false;
        };
    }, [referralId, reset]);

    const handleSave = createSubmitHandler(async (values) => {
        try {
            const updated = referralId ? await referralService.update(referralId, values) : null;
            const saved = updated ?? (await referralService.create(values));
            reset(values);
            setSaveFlash({
                listPath: ROUTES.REFERRALS,
                message: `Referral "${values.name}" ${updated ? 'updated' : 'created'} successfully!`,
                severity: 'success',
                recordId: saved?.id,
            });
            router.push(ROUTES.REFERRALS);
        } catch (err: unknown) {
            showToast(applyReferralSaveError(err, methods), 'error');
        }
    });

    return (
        <FormProvider {...methods}>
            <FormConfigProvider module="referrals">
                <CommonFormLayout
                    loading={recordLoading}
                    isDirty={isDirty}
                    breadcrumbItems={breadcrumbItems || defaultBreadcrumbs}
                    tabs={REFERRAL_FORM_TABS}
                    activeTab="overview"
                    onCancel={() => router.push(ROUTES.REFERRALS)}
                    onSave={mode === 'view' ? () => router.push(ROUTES.REFERRAL_EDIT(referralId!)) : handleSave}
                    submitting={isSubmitting}
                    saveLabel={mode === 'view' ? 'Edit Referral' : mode === 'edit' ? 'Update Referral' : 'Save Referral'}
                    stepwise={stepwise}
                    cancelLabel={mode === 'view' ? 'Back' : 'Cancel'}
                    recordView={{
                        title: referralName || '',
                        editHref: referralId ? ROUTES.REFERRAL_EDIT(referralId) : undefined,
                        editLabel: 'Edit Referral',
                        backHref: ROUTES.REFERRALS,
                        audit,
                    }}
                    mode={mode}
                    toast={<AppToast open={toast.open} message={toast.message} severity={toast.severity} onClose={closeToast} />}
                >
                    <ReferralFormFields />
                </CommonFormLayout>
            </FormConfigProvider>
        </FormProvider>
    );
}
