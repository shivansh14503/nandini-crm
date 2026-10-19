'use client';

import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import ArticleOutlinedIcon from '@mui/icons-material/ArticleOutlined';
import PlaceOutlinedIcon from '@mui/icons-material/PlaceOutlined';

import { type BreadcrumbItem } from '../common/AppBreadcrumbs';
import { AppToast } from '../common/AppToast';
import { CommonFormLayout } from '../common/CommonFormLayout';
import { type FormTabDefinition } from '../common/Drawer';
import { ROUTES } from '../../config/constants';
import { validateWithToast, leadFormSchema } from '../../validations';
import type { LeadFormData, Lead } from '../../types/lead.types';
import {
    getStoredLeadById,
    addStoredLead,
    updateStoredLead,
} from '../../data/mockLeads';

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
    mode?: 'create' | 'edit';
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
    primaryCountry: 'India',
    primaryLatitude: '0.00000000',

    otherAddress: '',
    otherCity: '',
    otherState: 'Delhi',
    otherPostalCode: '',
    otherCountry: 'India',
    copyAddressFromLeft: false,
    otherLongitude: '0.00000000',
};

export default function LeadForm({
    mode = 'create',
    initialData,
    leadId,
    breadcrumbItems,
}: LeadFormProps) {
    const router = useRouter();

    const [form, setForm] = useState<LeadFormData>({ ...DEFAULT_FORM, ...initialData });
    const [activeTab, setActiveTab] = useState<LeadTabKey>('overview');
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
        { label: 'Leads', href: ROUTES.LEADS },
        { label: mode === 'edit' ? (form.name ? `Edit: ${form.name}` : 'Edit Lead') : 'Create Lead' },
    ];

    // Populate data when editing
    useEffect(() => {
        if (initialData && Object.keys(initialData).length > 0) {
            setForm((prev) => ({ ...prev, ...initialData }));
        } else if (leadId) {
            const found = getStoredLeadById(leadId);
            if (found) {
                setForm(found);
            }
        }
    }, [initialData, leadId]);

    const setField = useCallback(<K extends keyof LeadFormData>(key: K, value: LeadFormData[K]) => {
        setForm((prev) => ({ ...prev, [key]: value }));
        setIsDirty(true);
    }, []);

    // ── Submit Logic with Validation ──────────────────────────────────────────
    const handleSubmit = async () => {
        // Run Zod schema validation
        const validation = validateWithToast(leadFormSchema, form);
        if (!validation.success) {
            setToast({
                open: true,
                message: validation.error,
                severity: 'error',
            });
            return;
        }

        setSubmitting(true);
        try {
            if (mode === 'create') {
                addStoredLead(form);
                setToast({
                    open: true,
                    message: 'Lead created successfully! Added to your sales pipeline.',
                    severity: 'success',
                });
            } else if (mode === 'edit' && leadId) {
                updateStoredLead(leadId, form);
                setToast({
                    open: true,
                    message: 'Lead details updated successfully!',
                    severity: 'success',
                });
            }

            setTimeout(() => {
                router.push(ROUTES.LEADS);
            }, 800);
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : 'An error occurred while saving the lead.';
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
        if (isDirty && !confirm('You have unsaved changes. Are you sure you want to discard them?')) {
            return;
        }
        router.push(ROUTES.LEADS);
    };

    return (
        <CommonFormLayout
            breadcrumbItems={breadcrumbItems || defaultBreadcrumbs}
            tabs={LEAD_FORM_TABS}
            activeTab={activeTab}
            onTabChange={(tabId) => setActiveTab(tabId as LeadTabKey)}
            onCancel={handleDiscard}
            onSave={handleSubmit}
            submitting={submitting}
            saveLabel={mode === 'edit' ? 'Update Lead' : 'Save Lead'}
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
            {activeTab === 'overview' && (
                <LeadOverviewSection form={form} setField={setField} />
            )}

            {activeTab === 'address' && (
                <LeadAddressSection form={form} setField={setField} />
            )}
        </CommonFormLayout>
    );
}
