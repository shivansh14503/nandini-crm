'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { FormProvider } from 'react-hook-form';
import ArticleOutlinedIcon from '@mui/icons-material/ArticleOutlined';
import PlaceOutlinedIcon from '@mui/icons-material/PlaceOutlined';

import { type BreadcrumbItem } from '../common/AppBreadcrumbs';
import { AppToast } from '../common/AppToast';
import { CommonFormLayout } from '../common/CommonFormLayout';
import { type FormTabDefinition } from '../common/Drawer';
import { useRhfForm } from '../forms/rhf';
import { ROUTES } from '@/config/constants';
import { leadFormSchema } from '../../validations';
import type { LeadFormData } from '@/types/lead.types';
import { leadService } from '@/services';
import { normalizeAddressFields } from '@/utils/address';

// Modular Lead Form Sections
import {
    LeadOverviewSection,
    LeadAddressSection,
} from './sections';

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
    designation: '',
    leadSource: 'Website Enquiry',
    productCategory: ['Biz Analyst'],
    followupType: 'Call',
    addDescription: '',
    registrationType: 'Registered',
    turnover: '₹5 Cr – ₹25 Cr',
    assignedTo: 'mittal.sharma',

    otherPhone: '',
    organizationName: '',
    department: 'Executive Management',
    leadType: 'Hot',
    status: 'New',
    nextFollowupDate: new Date(Date.now() + 86400000).toISOString().split('T')[0], // Tomorrow
    nextFollowupTime: '11:00 AM',
    description: '',
    noOfEmployee: '11 – 50 Staff Members',
    referredBy: '',

    primaryAddress: '',
    primaryCity: '',
    primaryState: 'Delhi',
    primaryPostalCode: '',
    primaryCountry: 'IN',

    otherAddress: '',
    otherCity: '',
    otherState: 'Delhi',
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

    const { methods, toast, showToast, closeToast, createSubmitHandler } = useRhfForm<LeadFormData>({
        schema: leadFormSchema,
        defaultValues: { ...DEFAULT_FORM, ...initialData },
    });
    const { reset, watch, formState } = methods;
    const { isDirty, isSubmitting } = formState;
    const leadName = watch('name');

    const defaultBreadcrumbs: BreadcrumbItem[] = [
        { label: 'Sales' },
        { label: 'Leads', href: ROUTES.LEADS },
        { label: mode !== 'create' ? (leadName ? `${mode === 'view' ? 'View' : 'Edit'}: ${leadName}` : `${mode === 'view' ? 'View' : 'Edit'} Lead`) : 'Create Lead' },
    ];

    // Populate data when editing
    useEffect(() => {
        if (!leadId) return;
        let active = true;
        leadService
            .getById(leadId)
            .then((found) => {
                if (active && found) reset(normalizeAddressFields(found, LEAD_ADDRESS_PAIRS));
            })
            .catch(() => {});
        return () => {
            active = false;
        };
    }, [leadId, reset]);

    const handleSave = createSubmitHandler(async (values) => {
        try {
            if (mode === 'edit' && leadId) {
                await leadService.update(leadId, values);
                showToast('Lead details updated successfully!', 'success');
            } else {
                await leadService.create(values);
                showToast('Lead created successfully! Added to your sales pipeline.', 'success');
            }
            reset(values);
            setTimeout(() => router.push(ROUTES.LEADS), 800);
        } catch (err: unknown) {
            showToast(err instanceof Error ? err.message : 'An error occurred while saving the lead.', 'error');
        }
    });

    const handleDiscard = () => {
        if (mode === 'view') {
            router.push(ROUTES.LEADS);
            return;
        }
        if (isDirty && !confirm('You have unsaved changes. Are you sure you want to discard them?')) {
            return;
        }
        router.push(ROUTES.LEADS);
    };

    return (
        <FormProvider {...methods}>
            <CommonFormLayout
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
                    editHref: leadId ? ROUTES.LEAD_EDIT(leadId) : undefined,
                    editLabel: 'Edit Lead',
                    backHref: ROUTES.LEADS,
                }}
                mode={mode}
                disableContentPadding
                toast={<AppToast open={toast.open} message={toast.message} severity={toast.severity} onClose={closeToast} />}
            >
                {/* Keep both panels mounted so validation state of hidden tab is preserved */}
                <div hidden={activeTab !== 'overview'}>
                    <LeadOverviewSection />
                </div>
                <div hidden={activeTab !== 'address'}>
                    <LeadAddressSection />
                </div>
            </CommonFormLayout>
        </FormProvider>
    );
}
