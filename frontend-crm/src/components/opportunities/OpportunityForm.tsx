'use client';

import { NO_PAST_DATES } from '@/utils/pastDates';
import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useResetTab } from '@/hooks/useResetTab';
import { followUpEditIssues } from '../forms/FollowUpDecision';
import { useRouter } from 'next/navigation';
import { FormProvider, useWatch } from 'react-hook-form';

// Icons
import ArticleOutlinedIcon from '@mui/icons-material/ArticleOutlined';
import ReceiptLongOutlinedIcon from '@mui/icons-material/ReceiptLongOutlined';

import { type BreadcrumbItem } from '../common/AppBreadcrumbs';
import { AppToast } from '../common/AppToast';
import { setSaveFlash, useSaveFlash } from '@/utils/saveFlash';
import { CommonFormLayout } from '../common/CommonFormLayout';
import { type FormTabDefinition } from '../common/Drawer';
import { useRhfForm } from '../forms/rhf';
import { ROUTES } from '@/config/constants';
import { leadSourceDetailIssues } from '@/utils/leadSource';
import { commissionIssues, documentationIssues, opportunityFormSchema } from '../../validations';
import type { OpportunityFormData } from '@/types/opportunity.types';
import { opportunityService } from '../../services/opportunity.service';
import type { RecordAuditStamp } from '../common/Drawer/RecordAuditFooter';

// Modular Opportunity Form Sections
import {
    OpportunityBasicSection,
    OpportunityLineItemsSection,
} from './sections';
import { FormConfigProvider } from '@/context/FormConfigContext';
import { DynamicModuleCustomFields } from '@/components/forms/DynamicModuleCustomFields';
import { useShowRecordNumber } from '@/hooks/queries/useDocumentSeries';

export type OpportunityTabKey = 'basic' | 'line_items';

// ─── Single Source of Truth for Opportunity Form Tabs ─────────────────────────
export const OPPORTUNITY_FORM_TABS: (FormTabDefinition & { id: OpportunityTabKey })[] = [
    {
        id: 'basic',
        label: 'BASIC',
        icon: <ArticleOutlinedIcon sx={{ fontSize: 18 }} />,
    },
    {
        id: 'line_items',
        label: 'Line Items',
        icon: <ReceiptLongOutlinedIcon sx={{ fontSize: 18 }} />,
    },
];

export interface OpportunityFormProps {
    mode?: 'create' | 'edit' | 'view';
    initialData?: Partial<OpportunityFormData>;
    opportunityId?: string;
    breadcrumbItems?: BreadcrumbItem[];
}

/**
 * A new opportunity's starting values. Text, lookups and line items start empty; dropdowns start on the admin's
 * default option (Form Builder › Dropdowns), which `useRhfForm` applies over the values coded here.
 */
const DEFAULT_OPPORTUNITY_FORM: OpportunityFormData = {
    productCategory: ['Biz Analyst'],
    contact: '',
    organizationName: '',
    contactNumber: '',
    contactEmail: '',
    referredBy: '',
    partnerCompany: '',
    type: 'New Business',
    salesStage: 'Qualification',
    leadSource: 'Website Enquiry',
    // Empty until picked: nobody is credited with the lead on the user's behalf.
    leadGivenBy: '',
    nextFollowupDate: '',
    nextFollowupTime: '',
    followupType: 'Call',
    customerResponse: '',
    remarks: '',
    description: '',
    assignedTo: '',

    // Billing Details
    tallySerialNo: '',
    invoiceNo: '',
    invoiceDate: '',

    // Commission Details
    commission: 'No',
    commissionAmount: '',
    commissionType: '',
    accountName: '',
    accountNo: '',
    bankName: '',
    ifscCode: '',
    panNumber: '',

    // Documentation
    addDocument: 'No',
    documentNo: '',
    documentDate: '',
    documentRemarks: '',
    documentFile: null,

    // Line Items: none until the user adds a product (as on a new quotation or a converted lead).
    currency: 'Indian Rupee: ₹',
    groupName: 'Products & Services',
    lineItems: [],
    lumpSumDiscount: 0,
    totalAmount: 0,
    totalDiscount: 0,
    subtotal: 0,
    totalTax: 0,
    grandTotal: 0,
};

const sameText = (a?: string, b?: string) => (a ?? '').trim().toLowerCase() === (b ?? '').trim().toLowerCase();

/**
 * Drops the saved organization / contact ids once their names change on an edit, so the server links the
 * record to the newly picked (or typed) organization and contact by name instead of keeping the old ones.
 */
function withFreshLinks(values: OpportunityFormData, saved: { organizationName?: string; contact?: string }): OpportunityFormData {
    const organizationChanged = !sameText(values.organizationName, saved.organizationName);
    const contactChanged = organizationChanged || !sameText(values.contact, saved.contact);
    return {
        ...values,
        organizationId: organizationChanged ? '' : values.organizationId,
        contactId: contactChanged ? '' : values.contactId,
    };
}

export default function OpportunityForm({
    mode = 'create',
    initialData,
    opportunityId,
    breadcrumbItems,
}: OpportunityFormProps) {
    const router = useRouter();
    const [activeTab, setActiveTab] = useResetTab<OpportunityTabKey>('basic');
    const [audit, setAudit] = useState<RecordAuditStamp>();
    const [recordCode, setRecordCode] = useState('');
    const showNumber = useShowRecordNumber();

    // True while the "keep or reschedule the follow-up" popup awaits an answer (see OpportunityBasicSection).
    const followUpDecisionPending = useRef(false);
    const setFollowUpPending = useCallback((pending: boolean) => {
        followUpDecisionPending.current = pending;
    }, []);
    const { methods, toast, showToast, closeToast, createSubmitHandler, stepwise } =
        useRhfForm<OpportunityFormData>({
            schema: opportunityFormSchema,
            noPastDates: NO_PAST_DATES.opportunity,
            extraRules: (values) => [
                ...commissionIssues(values),
                ...documentationIssues(values),
                ...leadSourceDetailIssues(values),
                ...(mode === 'edit' ? followUpEditIssues(values, followUpDecisionPending.current) : []),
            ],
            module: 'opportunities',
            defaultValues: { ...DEFAULT_OPPORTUNITY_FORM, ...initialData },
            dropdownDefaults: { enabled: mode === 'create', keep: initialData },
            assigneeField: 'assignedTo',
        });

    const { reset, control, formState } = methods;
    const { isDirty, isSubmitting } = formState;
    const orgName = useWatch({ control, name: 'organizationName' });

    const defaultBreadcrumbs: BreadcrumbItem[] = [
        { label: 'Sales' },
        { label: 'Opportunities', href: ROUTES.OPPORTUNITIES },
        {
            label:
                mode !== 'create'
                    ? orgName
                        ? `${mode === 'view' ? 'View' : 'Edit'}: ${orgName}`
                        : `${mode === 'view' ? 'View' : 'Edit'} Opportunity`
                    : 'Create Opportunity',
        },
    ];

    // Populate data when editing
    // True until the saved record arrives (view / edit), so the form shows skeleton fields, not empty ones.
    const [recordLoading, setRecordLoading] = useState(Boolean(opportunityId));
    useEffect(() => {
        if (!opportunityId) return;
        let active = true;
        opportunityService
            .getById(opportunityId)
            .then((found) => {
                if (active && found) {
                    // Every edit records a fresh customer response, so the edit form starts without one.
                    reset(mode === 'edit' ? { ...found, customerResponse: '', remarks: '' } : found);
                    setRecordCode(found.opportunityCode ?? '');
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
    }, [opportunityId, reset, mode]);

    // A lead conversion lands on the new opportunity's detail page with its message (see ConvertLeadForm).
    useSaveFlash(opportunityId ? ROUTES.OPPORTUNITY_DETAIL(opportunityId) : '', (flash) => showToast(flash.message, flash.severity));

    // ── Submit Logic with Validation ──────────────────────────────────────────
    const handleSave = createSubmitHandler(async (values) => {
        try {
            let saved: { id: string } | undefined;
            let message = '';
            if (mode === 'create') {
                saved = await opportunityService.create(values);
                message = 'Opportunity created successfully! Added to your sales pipeline.';
            } else if (mode === 'edit' && opportunityId) {
                saved = await opportunityService.update(opportunityId, withFreshLinks(values, formState.defaultValues ?? {}));
                message = 'Opportunity details updated successfully!';
            }

            reset(values);
            if (message) setSaveFlash({ listPath: ROUTES.OPPORTUNITIES, message, severity: 'success', recordId: saved?.id ?? opportunityId });
            router.push(ROUTES.OPPORTUNITIES);
        } catch (err: unknown) {
            showToast(
                err instanceof Error ? err.message : 'An error occurred while saving the opportunity.',
                'error'
            );
        }
    });

    const handleDiscard = () => {
        router.push(ROUTES.OPPORTUNITIES);
    };

    return (
        <FormProvider {...methods}>
            <FormConfigProvider module="opportunities">
                <CommonFormLayout
                    loading={recordLoading}
                    isDirty={isDirty}
                    breadcrumbItems={breadcrumbItems || defaultBreadcrumbs}
                    tabs={OPPORTUNITY_FORM_TABS}
                    activeTab={activeTab}
                    onTabChange={(tabId) => setActiveTab(tabId as OpportunityTabKey)}
                    onCancel={handleDiscard}
                    onSave={mode === 'view' ? () => router.push(ROUTES.OPPORTUNITY_EDIT(opportunityId!)) : handleSave}
                    submitting={isSubmitting}
                    saveLabel={mode === 'view' ? 'Edit Opportunity' : mode === 'edit' ? 'Update Opportunity' : 'Save Opportunity'}
                    stepwise={{ ...stepwise, fieldTab: (path) => (path.startsWith('lineItems') ? 'line_items' : undefined) }}
                    cancelLabel={mode === 'view' ? 'Back' : 'Cancel'}
                    recordView={{
                        title: orgName || '',
                        code: showNumber('opportunity') ? recordCode : undefined,
                        editHref: opportunityId ? ROUTES.OPPORTUNITY_EDIT(opportunityId) : undefined,
                        editLabel: 'Edit Opportunity',
                        backHref: ROUTES.OPPORTUNITIES,
                        audit,
                    }}
                    mode={mode}
                    disableContentPadding
                    toast={
                        <AppToast
                            open={toast.open}
                            message={toast.message}
                            severity={toast.severity}
                            onClose={closeToast}
                        />
                    }
                >
                    <div hidden={activeTab !== 'basic'}>
                        <OpportunityBasicSection notify={showToast} onDecisionPendingChange={setFollowUpPending} />
                        <DynamicModuleCustomFields module="opportunities" tabKey="basic" />
                    </div>

                    <div hidden={activeTab !== 'line_items'}>
                        <OpportunityLineItemsSection />
                        <DynamicModuleCustomFields module="opportunities" tabKey="line_items" />
                    </div>
                </CommonFormLayout>
            </FormConfigProvider>
        </FormProvider>
    );
}
