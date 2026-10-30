'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { FormProvider, type FieldErrors } from 'react-hook-form';
import { Box, CircularProgress, Typography, Alert } from '@mui/material';

// Icons
import ArticleOutlinedIcon from '@mui/icons-material/ArticleOutlined';
import ReceiptLongOutlinedIcon from '@mui/icons-material/ReceiptLongOutlined';
import PlaceOutlinedIcon from '@mui/icons-material/PlaceOutlined';

import { type BreadcrumbItem } from '../common/AppBreadcrumbs';
import { AppToast } from '../common/AppToast';
import { CommonFormLayout } from '../common/CommonFormLayout';
import { type FormTabDefinition } from '../common/Drawer';
import { useRhfForm } from '@/components/forms';
import { ROUTES } from '@/config/constants';
import type { Opportunity } from '@/types/opportunity.types';
import type { Quotation, QuotationFormData } from '@/types/quotation.types';
import {
    opportunityService,
    organizationService,
    contactService,
    quotationService,
} from '@/services';
import { quotationFormSchema } from '@/validations';
import {
    QuotationOverviewSection,
    QuotationLineItemsSection,
    QuotationAddressSection,
} from './sections';
import { normalizeAddressFields } from '@/utils/address';

export interface CreateQuoteFormProps {
    mode?: 'create' | 'edit' | 'view';
    quotationId?: string;
    opportunityId?: string;
    initialData?: Partial<QuotationFormData>;
    breadcrumbItems?: BreadcrumbItem[];
}

export type QuotationTabKey = 'overview' | 'line_items' | 'address';

export const QUOTATION_FORM_TABS: (FormTabDefinition & { id: QuotationTabKey })[] = [
    {
        id: 'overview',
        label: 'Overview',
        icon: <ArticleOutlinedIcon sx={{ fontSize: 18 }} />,
    },
    {
        id: 'line_items',
        label: 'Line Items',
        icon: <ReceiptLongOutlinedIcon sx={{ fontSize: 18 }} />,
    },
    {
        id: 'address',
        label: 'Address Information',
        icon: <PlaceOutlinedIcon sx={{ fontSize: 18 }} />,
    },
];

const OVERVIEW_FIELD_KEYS = [
    'quotationTitle',
    'quoteStage',
    'quotationDate',
    'validUntil',
    'remarks',
    'termsAndCondition',
    'termsAndConditionDescription',
    'assignedTo',
    'opportunityName',
    'company',
    'validationPeriod',
    'otherRef',
    'paymentTerms',
    'paymentTermsDescription',
    'preparedFor',
];

const LINE_ITEMS_FIELD_KEYS = [
    'lineItems',
    'currency',
    'groupName',
    'lumpSumDiscount',
    'totalAmount',
    'totalDiscount',
    'subtotal',
    'totalTax',
    'grandTotal',
];

const ADDRESS_FIELD_KEYS = [
    'organizationName',
    'organizationId',
    'contactName',
    'contactId',
    'contactMobile',
    'mailingName',
    'gstNo',
    'contactEmail',
    'billingAddress',
    'billingCity',
    'billingState',
    'billingPostalCode',
    'billingCountry',
    'shippingAddress',
    'shippingCity',
    'shippingState',
    'shippingPostalCode',
    'shippingCountry',
    'copyAddressFromBilling',
];

/** Country/state pairs normalised to the ISO address master when address data is loaded. */
const QUOTATION_ADDRESS_PAIRS = [
    ['billingCountry', 'billingState'],
    ['shippingCountry', 'shippingState'],
] as const;

const EMPTY_DEFAULTS: QuotationFormData = {
    // Tab 1: Overview
    quotationTitle: '',
    quoteStage: 'Draft',
    quotationDate: new Date().toISOString().split('T')[0],
    validUntil: new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
    remarks: '',
    termsAndCondition: 'Standard Terms & Conditions',
    termsAndConditionDescription: '',
    assignedTo: 'mittal.sharma',

    opportunityName: '',
    company: 'Nandini Infosystems',
    validationPeriod: '30 Days',
    otherRef: '',
    paymentTerms: '50% Advance & 50% on Delivery',
    paymentTermsDescription: '',
    preparedFor: 'Customer',

    // Tab 2: Line Items
    currency: 'Indian Rupee: ₹',
    groupName: 'Software Licenses & Add-ons',
    lineItems: [],
    lumpSumDiscount: 0,
    totalAmount: 0,
    totalDiscount: 0,
    subtotal: 0,
    totalTax: 0,
    grandTotal: 0,

    // Tab 3: Address Information
    organizationName: '',
    organizationId: '',
    contactName: '',
    contactId: '',
    contactMobile: '',
    mailingName: '',
    gstNo: '',
    contactEmail: '',

    billingAddress: '',
    billingCity: '',
    billingState: 'Delhi',
    billingPostalCode: '',
    billingCountry: 'IN',

    shippingAddress: '',
    shippingCity: '',
    shippingState: 'Delhi',
    shippingPostalCode: '',
    shippingCountry: 'IN',
    copyAddressFromBilling: true,

    // Context & Aliases
    opportunityId: '',
    opportunityCode: '',
    status: 'Draft',
    quoteDate: new Date().toISOString().split('T')[0],
    quotationSubject: '',
    contactNumber: '',
    emailAddress: '',
    notes: '',
    termsAndConditions: '',
};

export function CreateQuoteForm({
    mode = 'create',
    quotationId,
    opportunityId,
    initialData,
    breadcrumbItems,
}: CreateQuoteFormProps) {
    const router = useRouter();
    const isEdit = mode !== 'create';
    const [quotation, setQuotation] = useState<Quotation | null>(null);
    const [opportunity, setOpportunity] = useState<Opportunity | null>(null);
    const [loading, setLoading] = useState<boolean>(() =>
        mode !== 'create' ? Boolean(quotationId) : Boolean(opportunityId)
    );
    const [activeTab, setActiveTab] = useState<QuotationTabKey>('overview');
    const [addressPrepopulated, setAddressPrepopulated] = useState(true);

    const { methods, toast, showToast, closeToast } =
        useRhfForm<QuotationFormData>({
            schema: quotationFormSchema,
            defaultValues: { ...EMPTY_DEFAULTS, ...initialData },
        });

    const { reset, handleSubmit, formState } = methods;
    const { isDirty, isSubmitting } = formState;

    useEffect(() => {
        let active = true;

        if (isEdit) {
            if (!quotationId) return;

            quotationService
                .getById(quotationId)
                .then((found) => {
                    if (!active) return;
                    if (!found) {
                        showToast('Quotation record not found.', 'error');
                        setTimeout(() => router.push(ROUTES.QUOTATIONS), 1200);
                        return;
                    }
                    setQuotation(found);
                    reset(
                        normalizeAddressFields<QuotationFormData>(
                            { ...EMPTY_DEFAULTS, ...found, ...initialData },
                            QUOTATION_ADDRESS_PAIRS
                        )
                    );
                })
                .catch((err) => {
                    if (active) {
                        showToast(
                            err instanceof Error ? err.message : 'Failed to load quotation details.',
                            'error'
                        );
                    }
                })
                .finally(() => {
                    if (active) setLoading(false);
                });

            return () => {
                active = false;
            };
        }

        // Create mode: load from opportunity
        if (!opportunityId) return;

        opportunityService
            .getById(opportunityId)
            .then(async (found) => {
                if (!active) return;
                if (!found) {
                    showToast('Opportunity record not found.', 'error');
                    return;
                }
                setOpportunity(found);

                // Look up linked organization & contact to prefill address: by id when linked, otherwise
                // a name search (server-side in API mode) narrowed to an exact, case-insensitive match.
                const sameText = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
                const [org, contact] = await Promise.all([
                    found.organizationId
                        ? organizationService.getById(found.organizationId)
                        : organizationService
                              .getAll({ search: found.organizationName })
                              .then((orgs) => orgs.find((o) => sameText(o.organizationName, found.organizationName))),
                    found.contactId
                        ? contactService.getById(found.contactId)
                        : contactService
                              .getAll({ search: found.contactName })
                              .then((contacts) => contacts.find((c) => sameText(c.name, found.contactName))),
                ]);
                if (!active) return;

                const defaults = quotationService.buildQuotationDefaultsFromOpportunity(
                    found,
                    org,
                    contact
                );

                if (!defaults.billingAddress || !defaults.billingCity || !defaults.billingPostalCode) {
                    setAddressPrepopulated(false);
                }

                reset({
                    ...defaults,
                    ...initialData,
                });
            })
            .catch((err) => {
                if (active) {
                    showToast(
                        err instanceof Error ? err.message : 'Failed to load opportunity details.',
                        'error'
                    );
                }
            })
            .finally(() => {
                if (active) setLoading(false);
            });

        return () => {
            active = false;
        };
    }, [isEdit, quotationId, opportunityId, initialData, reset, router, showToast]);

    const defaultBreadcrumbs: BreadcrumbItem[] = isEdit
        ? [
              { label: 'Sales' },
              { label: 'Quotations', href: ROUTES.QUOTATIONS },
              {
                  label: quotation?.quotationCode
                      ? `${mode === 'view' ? 'View' : 'Edit'}: ${quotation.quotationCode}`
                      : `${mode === 'view' ? 'View' : 'Edit'} Quotation`,
              },
          ]
        : [
              { label: 'Sales' },
              { label: 'Opportunities', href: ROUTES.OPPORTUNITIES },
              {
                  label: opportunity?.opportunityCode
                      ? `Quote: ${opportunity.opportunityCode}`
                      : 'Create Quote',
              },
          ];

    // Helper to find first error message from FieldErrors
    const getFirstErrorText = (errors: FieldErrors<QuotationFormData>): string | null => {
        for (const key of Object.keys(errors)) {
            const err = (errors as Record<string, unknown>)[key];
            if (err && typeof err === 'object' && 'message' in err && typeof err.message === 'string') {
                return err.message;
            }
            if (Array.isArray(err) && err[0]?.message) {
                return String(err[0].message);
            }
        }
        return null;
    };

    // On invalid submit: auto-switch activeTab to the first tab containing an error & surface in toast
    const onInvalidSubmit = useCallback(
        (errors: FieldErrors<QuotationFormData>) => {
            const errorKeys = Object.keys(errors);

            const hasOverviewError = errorKeys.some((k) => OVERVIEW_FIELD_KEYS.includes(k));
            const hasLineItemsError = errorKeys.some((k) => LINE_ITEMS_FIELD_KEYS.includes(k));
            const hasAddressError = errorKeys.some((k) => ADDRESS_FIELD_KEYS.includes(k));

            if (hasOverviewError) {
                setActiveTab('overview');
            } else if (hasLineItemsError) {
                setActiveTab('line_items');
            } else if (hasAddressError) {
                setActiveTab('address');
            }

            const firstMsg = getFirstErrorText(errors) || 'Please correct the highlighted validation errors.';
            showToast(firstMsg, 'error');
        },
        [showToast]
    );

    const onValidSubmit = async (values: QuotationFormData) => {
        try {
            if (isEdit && quotationId) {
                const updated = await quotationService.update(quotationId, values);
                showToast(
                    `Quotation "${updated?.quotationCode || quotation?.quotationCode || quotationId}" updated successfully!`,
                    'success'
                );
                reset(values);
                setTimeout(() => {
                    router.push(ROUTES.QUOTATIONS);
                }, 800);
            } else if (opportunityId) {
                const result = await quotationService.createQuotationFromOpportunity(
                    opportunityId,
                    values
                );
                showToast(
                    `Quotation "${result.quotationCode}" created successfully for ${result.organizationName}!`,
                    'success'
                );
                reset(values);
                setTimeout(() => {
                    router.push(ROUTES.QUOTATIONS);
                }, 900);
            } else {
                const created = await quotationService.create(values);
                showToast(`Quotation "${created.quotationCode}" created successfully!`, 'success');
                reset(values);
                setTimeout(() => {
                    router.push(ROUTES.QUOTATIONS);
                }, 900);
            }
        } catch (err: unknown) {
            showToast(
                err instanceof Error
                    ? err.message
                    : isEdit
                    ? 'Failed to update quotation.'
                    : 'Failed to create quotation.',
                'error'
            );
        }
    };

    const handleSave = handleSubmit(onValidSubmit, onInvalidSubmit);

    const handleDiscard = () => {
        if (mode === 'view') {
            router.push(ROUTES.QUOTATIONS);
            return;
        }
        if (isDirty && !window.confirm('Discard unsaved quotation data?')) return;
        router.push(isEdit ? ROUTES.QUOTATIONS : ROUTES.OPPORTUNITIES);
    };

    if (loading) {
        return (
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', py: 12 }}>
                <CircularProgress size={36} sx={{ color: '#2563eb' }} />
                <Typography sx={{ ml: 2, color: '#64748b', fontSize: '0.9rem' }}>
                    {isEdit ? 'Loading quotation details...' : 'Loading opportunity and commercial details...'}
                </Typography>
            </Box>
        );
    }

    return (
        <FormProvider {...methods}>
            <CommonFormLayout
                breadcrumbItems={breadcrumbItems || defaultBreadcrumbs}
                tabs={QUOTATION_FORM_TABS}
                activeTab={activeTab}
                onTabChange={(tabId) => setActiveTab(tabId as QuotationTabKey)}
                onCancel={handleDiscard}
                onSave={mode === 'view' ? () => router.push(ROUTES.QUOTATION_EDIT(quotationId!)) : handleSave}
                submitting={isSubmitting}
                saveLabel={mode === 'view' ? 'Edit Quotation' : isEdit ? 'Update Quotation' : 'Save Quotation'}
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
                {!addressPrepopulated && (
                    <Box sx={{ p: 2.5, pb: 0 }}>
                        <Alert severity="info">
                            <strong>Address Requirement:</strong> Please ensure the complete billing address
                            (Street, City, State, and PIN code) is provided in the &quot;Address Information&quot; tab.
                            Quotation generation requires a valid invoice address.
                        </Alert>
                    </Box>
                )}

                {/* ── Keep all 3 panels mounted to preserve React Hook Form state across tabs ── */}
                <div hidden={activeTab !== 'overview'}>
                    <QuotationOverviewSection />
                </div>

                <div hidden={activeTab !== 'line_items'}>
                    <QuotationLineItemsSection />
                </div>

                <div hidden={activeTab !== 'address'}>
                    <QuotationAddressSection />
                </div>
            </CommonFormLayout>
        </FormProvider>
    );
}

export default CreateQuoteForm;
