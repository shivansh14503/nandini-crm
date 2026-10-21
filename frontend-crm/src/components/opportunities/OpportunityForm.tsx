'use client';

import React, { useState, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';


// Icons
import ArticleOutlinedIcon from '@mui/icons-material/ArticleOutlined';
import ReceiptLongOutlinedIcon from '@mui/icons-material/ReceiptLongOutlined';

import { type BreadcrumbItem } from '../common/AppBreadcrumbs';
import { AppToast } from '../common/AppToast';
import { CommonFormLayout } from '../common/CommonFormLayout';
import { type FormTabDefinition } from '../common/Drawer';
import { ROUTES } from '../../config/constants';
import { validateWithToast, opportunityFormSchema } from '../../validations';
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
    mode?: 'create' | 'edit';
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

    const [form, setForm] = useState<OpportunityFormData>({
        ...DEFAULT_OPPORTUNITY_FORM,
        ...initialData,
    });
    const [activeTab, setActiveTab] = useState<OpportunityTabKey>('basic');
    const [submitting, setSubmitting] = useState(false);
    const [isDirty, setIsDirty] = useState(false);

    const [toast, setToast] = useState<{
        open: boolean;
        message: string;
        severity: 'success' | 'error' | 'info' | 'warning';
    }>({
        open: false,
        message: '',
        severity: 'success',
    });

    const defaultBreadcrumbs: BreadcrumbItem[] = [
        { label: 'Sales' },
        { label: 'Opportunities', href: ROUTES.OPPORTUNITIES },
        {
            label:
                mode === 'edit'
                    ? form.organizationName
                        ? `Edit: ${form.organizationName}`
                        : 'Edit Opportunity'
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
                    setForm(found);
                }
            })
            .catch(() => {});
        return () => {
            active = false;
        };
    }, [opportunityId]);

    const setField = useCallback(
        <K extends keyof OpportunityFormData>(key: K, value: OpportunityFormData[K]) => {
            setForm((prev) => ({ ...prev, [key]: value }));
            setIsDirty(true);
        },
        []
    );

    // ── Submit Logic with Validation ──────────────────────────────────────────
    const handleSubmit = async () => {
        // Run Zod schema validation
        const validation = validateWithToast(opportunityFormSchema, form);
        if (!validation.success) {
            setToast({
                open: true,
                message: validation.error,
                severity: 'error',
            });
            // If the validation error is in basic fields and we're on line items, switch to basic
            if (activeTab !== 'basic') {
                setActiveTab('basic');
            }
            return;
        }

        setSubmitting(true);
        try {
            if (mode === 'create') {
                await opportunityService.createOpportunity(form);
                setToast({
                    open: true,
                    message: 'Opportunity created successfully! Added to your sales pipeline.',
                    severity: 'success',
                });
            } else if (mode === 'edit' && opportunityId) {
                await opportunityService.updateOpportunity(opportunityId, form);
                setToast({
                    open: true,
                    message: 'Opportunity details updated successfully!',
                    severity: 'success',
                });
            }

            setTimeout(() => {
                router.push(ROUTES.OPPORTUNITIES);
            }, 800);
        } catch (err: unknown) {
            const message =
                err instanceof Error
                    ? err.message
                    : 'An error occurred while saving the opportunity.';
            setToast({
                open: true,
                message,
                severity: 'error',
            });
        } finally {
            setSubmitting(false);
        }
    };

    const handleDiscard = () => {
        if (
            isDirty &&
            !confirm('You have unsaved changes. Are you sure you want to discard them?')
        ) {
            return;
        }
        router.push(ROUTES.OPPORTUNITIES);
    };

    return (
        <CommonFormLayout
            breadcrumbItems={breadcrumbItems || defaultBreadcrumbs}
            tabs={OPPORTUNITY_FORM_TABS}
            activeTab={activeTab}
            onTabChange={(tabId) => setActiveTab(tabId as OpportunityTabKey)}
            onCancel={handleDiscard}
            onSave={handleSubmit}
            submitting={submitting}
            saveLabel={mode === 'edit' ? 'Update Opportunity' : 'Save Opportunity'}
            cancelLabel="Cancel"
            disableContentPadding
            toast={
                <AppToast
                    open={toast.open}
                    message={toast.message}
                    severity={toast.severity}
                    onClose={() => setToast((prev) => ({ ...prev, open: false }))}
                />
            }
        >
            {activeTab === 'basic' && (
                <OpportunityBasicSection form={form} setField={setField} />
            )}

            {activeTab === 'line_items' && (
                <OpportunityLineItemsSection form={form} setField={setField} />
            )}
        </CommonFormLayout>
    );
}
