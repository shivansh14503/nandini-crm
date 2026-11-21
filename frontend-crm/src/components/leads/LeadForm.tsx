'use client';

import { NO_PAST_DATES } from '@/utils/pastDates';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { followUpEditIssues, followUpSlotIssues, type FollowUpDecision } from '../forms/FollowUpDecision';
import { useLeadRatingConfig } from '@/utils/leadRating';
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

function omitKeys<T extends object>(values: T, keys: (keyof T)[]): Partial<T> {
    return Object.fromEntries(Object.entries(values).filter(([key]) => !keys.includes(key as keyof T))) as Partial<T>;
}

const DEFAULT_FORM: LeadFormData = {
    name: '',
    mobile: '',
    emailAddress: [
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
    customerResponse: '',
    remarks: '',
    registrationType: '',
    gstNumber: '',
    turnover: '',
    assignedTo: '',

    otherPhone: '',
    organizationName: '',
    department: 'Executive Management',
    leadType: '',
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

    // True while the "keep or reschedule the follow-up" popup awaits an answer (see LeadOverviewSection).
    const followUpDecisionPending = useRef(false);
    const setFollowUpPending = useCallback((pending: boolean) => {
        followUpDecisionPending.current = pending;
    }, []);
    // The keep / new answer the save sends with a recorded follow-up (the server checks it again).
    const [followUpDecision, setFollowUpDecision] = useState<FollowUpDecision | null>(null);

    // Rating rules (closing statuses) and the saved lead's status / Rating; read when the form validates.
    const ratingConfig = useLeadRatingConfig();
    const ratingConfigRef = useRef(ratingConfig);
    useEffect(() => {
        ratingConfigRef.current = ratingConfig;
    }, [ratingConfig]);
    const [saved, setSaved] = useState<{ status: string; rating: string }>({ status: '', rating: '' });
    const savedRef = useRef(saved);
    useEffect(() => {
        savedRef.current = saved;
    }, [saved]);
    /** What a lead edit does with these values (docs/lead-rating-rules.md §3). */
    const editKind = (values: LeadFormData) => {
        const closing = ratingConfigRef.current.closingStatuses;
        const isClosing = closing.has(values.status ?? '');
        const wasClosed = closing.has(savedRef.current.status);
        const response = Boolean(values.customerResponse?.trim());
        return { isClosing, wasClosed, response };
    };

    const { methods, toast, showToast, closeToast, createSubmitHandler } = useRhfForm<LeadFormData>({
        schema: leadFormSchema,
        noPastDates: NO_PAST_DATES.followup,
        // A new lead's first follow-up and every rescheduled one must be later than now when Save is clicked.
        extraRules:
            mode === 'edit'
                ? (values) => {
                      const { isClosing, wasClosed } = editKind(values);
                      return followUpEditIssues(values, followUpDecisionPending.current, {
                          // Optional for a details-only edit; needed to close a lead or to reopen one.
                          requireResponse: isClosing ? !wasClosed : wasClosed,
                          skipFollowUp: isClosing,
                          responseMessage: isClosing ? 'Pick a Customer Response to close the lead.' : 'Pick a Customer Response to reopen the lead.',
                      });
                  }
                : mode === 'create'
                  ? (values) => followUpSlotIssues(values)
                  : undefined,
        // A details-only edit records no follow-up (no Remarks needed); closing a lead schedules none.
        relaxedFields:
            mode === 'edit'
                ? (values) => {
                      const { isClosing, response } = editKind(values);
                      if (isClosing) return ['nextFollowupDate', 'nextFollowupTime'];
                      return response ? [] : ['remarks', 'customerResponse'];
                  }
                : undefined,
        module: 'leads',
        defaultValues: { ...DEFAULT_FORM, ...initialData },
        dropdownDefaults: { enabled: mode === 'create', keep: initialData },
        assigneeField: 'assignedTo',
    });
    // Leads carry a GSTIN only (no PAN); flag one another open lead uses as soon as it's fully typed.
    useTaxIdDuplicateCheck(methods, { owner: 'lead', excludeId: leadId, fields: ['gstNumber'], enabled: mode !== 'view' });
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
                    const loaded = normalizeAddressFields(found, LEAD_ADDRESS_PAIRS);
                    // A follow-up is recorded with a fresh response and remarks; left empty, the edit changes details only.
                    reset(mode === 'edit' ? { ...loaded, customerResponse: '', remarks: '' } : loaded);
                    setSaved({ status: found.status ?? '', rating: found.rating ?? '' });
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
    }, [leadId, reset, mode]);

    const handleSave = createSubmitHandler(async (values) => {
        try {
            const editing = mode === 'edit' && Boolean(leadId);
            const isClosing = ratingConfig.closingStatuses.has(values.status ?? '');
            const response = Boolean(values.customerResponse?.trim());
            // Details only: the stored response, remarks and follow-up stay (the server keeps them too).
            const payload: Partial<LeadFormData> & { followUpDecision?: FollowUpDecision } = !editing
                ? values
                : !response
                  ? omitKeys(values, ['customerResponse', 'remarks', 'nextFollowupDate', 'nextFollowupTime'])
                  : isClosing
                    ? values
                    : { ...values, followUpDecision: followUpDecision ?? undefined };
            const result = editing ? await leadService.update(leadId!, payload) : await leadService.create(values);
            reset(values);
            const rated = result?.rating ? ` Rating: ${result.rating}.` : '';
            setSaveFlash({
                listPath: ROUTES.LEADS,
                message: editing
                    ? response
                        ? `Follow-up recorded.${rated}`
                        : 'Lead details updated successfully!'
                    : `Lead created successfully! Added to your sales pipeline.${rated}`,
                severity: 'success',
                recordId: result?.id ?? leadId,
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
                        <LeadOverviewSection
                            leadId={leadId}
                            notify={showToast}
                            onDecisionPendingChange={setFollowUpPending}
                            onDecisionChange={setFollowUpDecision}
                            savedStatus={saved.status}
                            savedRating={saved.rating}
                        />
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
