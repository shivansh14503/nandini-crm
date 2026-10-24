'use client';

import React, { useState, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { FormProvider } from 'react-hook-form';

// Icons
import ArticleOutlinedIcon from '@mui/icons-material/ArticleOutlined';
import ReceiptLongOutlinedIcon from '@mui/icons-material/ReceiptLongOutlined';

import { type BreadcrumbItem } from '../common/AppBreadcrumbs';
import { AppToast } from '../common/AppToast';
import { CommonFormLayout } from '../common/CommonFormLayout';
import { type FormTabDefinition } from '../common/Drawer';
import { useRhfForm } from '../forms/rhf';
import { ROUTES } from '../../config/constants';
import { opportunityFormSchema } from '../../validations';
import type { OpportunityFormData } from '../../types/opportunity.types';
import { opportunityService } from '../../services/opportunity.service';

// Modular Opportunity Form Sections
import {
    OpportunityBasicSection,
    OpportunityLineItemsSection,
} from './sections';

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

const DEFAULT_OPPORTUNITY_FORM: OpportunityFormData = {
    productCategory: ['Biz Analyst'],
    contactName: '',
    organizationName: '',
    contactNumber: '',
    emailAddress: '',
    referredBy: '',
    type: 'New Business',
    salesStage: 'Qualification',
    leadSource: 'Website Enquiry',
    leadGivenBy: 'Direct Inbound Marketing',
    nextFollowupDate: new Date(Date.now() + 86400000).toISOString().split('T')[0],
    nextFollowupTime: '11:00 AM',
    followupType: 'Call',
    addDescription: '',
    description: '',
    assignedTo: 'mittal.sharma',

    // Billing Details
    tallySerialNo: '',
    invoiceNo: '',
    invoiceDate: '',

    // Commission Details
    commission: 'Standard (10%)',

    // Document
    addDocument: 'No',

    // Line Items
    currency: 'Indian Rupee: ₹',
    groupName: 'Products & Services',
    lineItems: [
        {
            id: 'line-1',
            productId: 'prod-tally',
            productName: 'TallyPrime Silver (Single User)',
            quantity: 1,
            amount: 22500,
            discount: 0,
            discountType: 'percentage',
            salePrice: 22500,
            taxRate: 'GST 18%',
            taxAmount: 4050,
            total: 26550,
            description: 'Standard single-user perpetual license for accounting & compliance',
            note: '',
        },
    ],
    lumpSumDiscount: 0,
    totalAmount: 22500,
    totalDiscount: 0,
    subtotal: 22500,
    totalTax: 4050,
    grandTotal: 26550,
};

export default function OpportunityForm({
    mode = 'create',
    initialData,
    opportunityId,
    breadcrumbItems,
}: OpportunityFormProps) {
    const router = useRouter();
    const [activeTab, setActiveTab] = useState<OpportunityTabKey>('basic');

    const { methods, toast, showToast, closeToast, createSubmitHandler } =
        useRhfForm<OpportunityFormData>({
            schema: opportunityFormSchema,
            defaultValues: { ...DEFAULT_OPPORTUNITY_FORM, ...initialData },
        });

    const { reset, watch, setValue, formState } = methods;
    const { isDirty, isSubmitting } = formState;
    const orgName = watch('organizationName');

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
    useEffect(() => {
        if (!opportunityId) return;
        let active = true;
        opportunityService
            .getById(opportunityId)
            .then((found) => {
                if (active && found) {
                    reset(found);
                }
            })
            .catch(() => {});
        return () => {
            active = false;
        };
    }, [opportunityId, reset]);

    const setField = useCallback(
        <K extends keyof OpportunityFormData>(key: K, value: OpportunityFormData[K]) => {
            setValue(key, value as never, {
                shouldDirty: true,
                shouldValidate: true,
            });
        },
        [setValue]
    );

    // ── Submit Logic with Validation ──────────────────────────────────────────
    const handleSave = createSubmitHandler(async (values) => {
        try {
            if (mode === 'create') {
                await opportunityService.createOpportunity(values);
                showToast('Opportunity created successfully! Added to your sales pipeline.', 'success');
            } else if (mode === 'edit' && opportunityId) {
                await opportunityService.updateOpportunity(opportunityId, values);
                showToast('Opportunity details updated successfully!', 'success');
            }

            reset(values);
            setTimeout(() => {
                router.push(ROUTES.OPPORTUNITIES);
            }, 800);
        } catch (err: unknown) {
            showToast(
                err instanceof Error ? err.message : 'An error occurred while saving the opportunity.',
                'error'
            );
        }
    });

    const handleDiscard = () => {
        if (mode === 'view') {
            router.push(ROUTES.OPPORTUNITIES);
            return;
        }
        if (
            isDirty &&
            !confirm('You have unsaved changes. Are you sure you want to discard them?')
        ) {
            return;
        }
        router.push(ROUTES.OPPORTUNITIES);
    };

    const formValues = watch();

    return (
        <FormProvider {...methods}>
            <CommonFormLayout
                breadcrumbItems={breadcrumbItems || defaultBreadcrumbs}
                tabs={OPPORTUNITY_FORM_TABS}
                activeTab={activeTab}
                onTabChange={(tabId) => setActiveTab(tabId as OpportunityTabKey)}
                onCancel={handleDiscard}
                onSave={mode === 'view' ? () => router.push(ROUTES.OPPORTUNITY_EDIT(opportunityId!)) : handleSave}
                submitting={isSubmitting}
                saveLabel={mode === 'view' ? 'Edit Opportunity' : mode === 'edit' ? 'Update Opportunity' : 'Save Opportunity'}
                cancelLabel={mode === 'view' ? 'Back' : 'Cancel'}
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
                    <OpportunityBasicSection form={formValues} setField={setField} />
                </div>

                <div hidden={activeTab !== 'line_items'}>
                    <OpportunityLineItemsSection />
                </div>
            </CommonFormLayout>
        </FormProvider>
    );
}
