'use client';

import { NO_PAST_DATES } from '@/utils/pastDates';
import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { FormProvider, type Path } from 'react-hook-form';
import ArticleOutlinedIcon from '@mui/icons-material/ArticleOutlined';
import PlaceOutlinedIcon from '@mui/icons-material/PlaceOutlined';

import { type BreadcrumbItem } from '../common/AppBreadcrumbs';
import { AppToast } from '../common/AppToast';
import { setSaveFlash } from '@/utils/saveFlash';
import { CommonFormLayout } from '../common/CommonFormLayout';
import { type FormTabDefinition } from '../common/Drawer';
import { useRhfForm, useTaxIdDuplicateCheck } from '../forms/rhf';
import { ROUTES } from '@/config/constants';
import { leadFormSchema } from '../../validations';
import type { LeadFormData } from '@/types/lead.types';
import { ApiClientError, leadService } from '@/services';
import type { RecordAuditStamp } from '../common/Drawer/RecordAuditFooter';
import { normalizeAddressFields } from '@/utils/address';

// Modular Lead Form Sections
import {
    LeadOverviewSection,
    LeadAddressSection,
} from './sections';
import { FormConfigProvider } from '@/context/FormConfigContext';
import { DynamicModuleCustomFields } from '@/components/forms/DynamicModuleCustomFields';
import { useShowRecordNumber } from '@/hooks/queries/useDocumentSeries';

export type LeadTabKey = 'overview' | 'address';

// ─── Single Source of Truth for Lead Form Tabs ────────────────────────────────
export const LEAD_FORM_TABS: (FormTabDefinition & { id: LeadTabKey })[] = [
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
];

export interface LeadFormProps {
    mode?: 'create' | 'edit' | 'view';
    initialData?: Partial<LeadFormData>;
    leadId?: string;
    breadcrumbItems?: BreadcrumbItem[];
}

const DEFAULT_FORM: LeadFormData = {
    name: '',
    mobile: '',
    emailAddresses: [
        {
            id: 'eml-1',
            email: '',
            isPrimary: true,
            isOptedOut: false,
            isInvalidBounce: false,
        },
    ],
    mailingName: '',
    tradeName: '',
    designation: '',
    leadSource: 'Website Enquiry',
    productCategory: ['Biz Analyst'],
    followupType: 'Call',
    addDescription: '',
    registrationType: '',
    gstNo: '',
    turnover: '',
    assignedTo: '',

    otherPhone: '',
    organizationName: '',
    department: 'Executive Management',
    leadType: 'Hot',
    status: 'New',
    nextFollowupDate: '',
    nextFollowupTime: '',
    description: '',
    noOfEmployee: '',
    referredBy: '',

    primaryAddress: '',
    primaryCity: '',
    primaryState: '',
    primaryPostalCode: '',
    primaryCountry: 'IN',

    otherAddress: '',
    otherCity: '',
    otherState: '',
    otherPostalCode: '',
    otherCountry: 'IN',
    copyAddressFromLeft: false,
};

/** Country/state pairs normalised to the ISO address master when a saved lead is loaded. */
const LEAD_ADDRESS_PAIRS = [
    ['primaryCountry', 'primaryState'],
    ['otherCountry', 'otherState'],
] as const;

export default function LeadForm({
    mode = 'create',
    initialData,
    leadId,
    breadcrumbItems,
}: LeadFormProps) {
    const router = useRouter();
    const [activeTab, setActiveTab] = useState<LeadTabKey>('overview');
    const [audit, setAudit] = useState<RecordAuditStamp>();
    const [recordCode, setRecordCode] = useState('');
    const showNumber = useShowRecordNumber();

    const { methods, toast, showToast, closeToast, createSubmitHandler } = useRhfForm<LeadFormData>({
        schema: leadFormSchema,
        noPastDates: NO_PAST_DATES.followup,
        module: 'leads',
        defaultValues: { ...DEFAULT_FORM, ...initialData },
        dropdownDefaults: { enabled: mode === 'create', keep: initialData },
        assigneeField: 'assignedTo',
    });
    // Leads carry a GSTIN only (no PAN); flag one another open lead uses as soon as it's fully typed.
    useTaxIdDuplicateCheck(methods, { owner: 'lead', excludeId: leadId, fields: ['gstNo'], enabled: mode !== 'view' });
    const { reset, watch, formState } = methods;
    const { isDirty, isSubmitting } = formState;
    const leadName = watch('name');

    const defaultBreadcrumbs: BreadcrumbItem[] = [
        { label: 'Sales' },
        { label: 'Leads', href: ROUTES.LEADS },
        { label: mode !== 'create' ? (leadName ? `${mode === 'view' ? 'View' : 'Edit'}: ${leadName}` : `${mode === 'view' ? 'View' : 'Edit'} Lead`) : 'Create Lead' },
    ];

    // Populate data when editing
    // True until the saved record arrives (view / edit), so the form shows skeleton fields, not empty ones.
    const [recordLoading, setRecordLoading] = useState(Boolean(leadId));
    useEffect(() => {
        if (!leadId) return;
        let active = true;
        leadService
            .getById(leadId)
            .then((found) => {
                if (active && found) {
                    reset(normalizeAddressFields(found, LEAD_ADDRESS_PAIRS));
                    setRecordCode(found.leadCode ?? '');
                    setAudit({ createdAt: found.createdAt, createdBy: found.createdBy, updatedAt: found.updatedAt, updatedBy: found.updatedBy });
                }
            })
            .catch(() => {})
            .finally(() => {
                if (active) setRecordLoading(false);
            });
        return () => {
            active = false;
        };
    }, [leadId, reset]);

    const handleSave = createSubmitHandler(async (values) => {
        try {
            const editing = mode === 'edit' && Boolean(leadId);
            const saved = editing ? await leadService.update(leadId!, values) : await leadService.create(values);
            reset(values);
            setSaveFlash({
                listPath: ROUTES.LEADS,
                message: editing ? 'Lead details updated successfully!' : 'Lead created successfully! Added to your sales pipeline.',
                severity: 'success',
                recordId: saved?.id ?? leadId,
            });
            router.push(ROUTES.LEADS);
        } catch (err: unknown) {
            let message = err instanceof Error ? err.message : 'An error occurred while saving the lead.';
            if (err instanceof ApiClientError) {
                // 409 / 400 responses name the offending fields (e.g. a GSTIN another lead uses): mark them inline.
                const fieldErrors = (err.details?.errors ?? []).filter((e) => e.path?.[0]);
                fieldErrors.forEach((fieldErr) => {
                    methods.setError(fieldErr.path.join('.') as Path<LeadFormData>, { type: 'server', message: fieldErr.message });
                });
                if (fieldErrors.length > 0) {
                    message = fieldErrors[0].message || message;
                    // Address fields live on their own tab; everything else is on Overview.
                    setActiveTab(/^(primary|other)/.test(String(fieldErrors[0].path[0])) ? 'address' : 'overview');
                }
            }
            showToast(message, 'error');
        }
    });

    const handleDiscard = () => {
        router.push(ROUTES.LEADS);
    };

    return (
        <FormProvider {...methods}>
            <FormConfigProvider module="leads">
                <CommonFormLayout
                    loading={recordLoading}
                    isDirty={isDirty}
                    breadcrumbItems={breadcrumbItems || defaultBreadcrumbs}
                    tabs={LEAD_FORM_TABS}
                    activeTab={activeTab}
                    onTabChange={(tabId) => setActiveTab(tabId as LeadTabKey)}
                    onCancel={handleDiscard}
                    onSave={mode === 'view' ? () => router.push(ROUTES.LEAD_EDIT(leadId!)) : handleSave}
                    submitting={isSubmitting}
                    saveLabel={mode === 'view' ? 'Edit Lead' : mode === 'edit' ? 'Update Lead' : 'Save Lead'}
                    cancelLabel={mode === 'view' ? 'Back' : 'Cancel'}
                    recordView={{
                        title: leadName || '',
                        code: showNumber('lead') ? recordCode : undefined,
                        editHref: leadId ? ROUTES.LEAD_EDIT(leadId) : undefined,
                        editLabel: 'Edit Lead',
                        backHref: ROUTES.LEADS,
                        audit,                    }}
                    mode={mode}
                    disableContentPadding
                    toast={<AppToast open={toast.open} message={toast.message} severity={toast.severity} onClose={closeToast} />}
                >
                    {/* Keep both panels mounted so validation state of hidden tab is preserved */}
                    <div hidden={activeTab !== 'overview'}>
                        <LeadOverviewSection leadId={leadId} />
                        <DynamicModuleCustomFields module="leads" tabKey="overview" />
                    </div>
                    <div hidden={activeTab !== 'address'}>
                        <LeadAddressSection />
                        <DynamicModuleCustomFields module="leads" tabKey="address" />
                    </div>
                </CommonFormLayout>
            </FormConfigProvider>
        </FormProvider>
    );
}
