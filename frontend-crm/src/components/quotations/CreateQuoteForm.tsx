'use client';

import { NO_PAST_DATES } from '@/utils/pastDates';
import React, { useEffect, useState, useCallback } from 'react';
import { useResetTab } from '@/hooks/useResetTab';
import { useRouter } from 'next/navigation';
import { FormProvider, type FieldErrors } from 'react-hook-form';
import { Box, Alert } from '@mui/material';

// Icons
import ArticleOutlinedIcon from '@mui/icons-material/ArticleOutlined';
import ReceiptLongOutlinedIcon from '@mui/icons-material/ReceiptLongOutlined';
import PlaceOutlinedIcon from '@mui/icons-material/PlaceOutlined';

import { type BreadcrumbItem } from '../common/AppBreadcrumbs';
import { AppToast } from '../common/AppToast';
import { setSaveFlash } from '@/utils/saveFlash';
import { CommonFormLayout } from '../common/CommonFormLayout';
import { BreadcrumbsSkeleton, FormCardSkeleton, RecordDetailSkeleton } from '../common/skeletons';
import { type FormTabDefinition } from '../common/Drawer';
import { useRhfForm, withDefaultAssignee, withDropdownDefaults } from '@/components/forms';
import { useAuth } from '@/context/AuthContext';
import { getFormConfigs } from '@/services/masterData.store';
import { findCategory } from '@/utils/formConfig';
import { PAYMENT_TERMS_DESCRIPTIONS, TERMS_TEMPLATE_DESCRIPTIONS } from '@/types/quotation.types';
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
import { FormConfigProvider } from '@/context/FormConfigContext';
import { DynamicModuleCustomFields } from '@/components/forms/DynamicModuleCustomFields';
import { PdfActionsButton } from '@/components/pdf/PdfActionsButton';
import { useShowRecordNumber } from '@/hooks/queries/useDocumentSeries';

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
    'opportunity',
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
    'lumpSumDiscount',
    'roundOff',
    'totalAmount',
    'totalDiscount',
    'subtotal',
    'actualBeforeTax',
    'totalTax',
    'gstType',
    'roundOffAmount',
    'grandTotal',
];

const ADDRESS_FIELD_KEYS = [
    'organizationName',
    'organizationId',
    'contact',
    'contactId',
    'contactNumber',
    'mailingName',
    'gstNumber',
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

/** Tab that renders a field (line item paths like `lineItems.0.quantity` go by their first key). */
function quotationFieldTab(path: string): QuotationTabKey | undefined {
    const key = path.split('.')[0];
    if (OVERVIEW_FIELD_KEYS.includes(key)) return 'overview';
    if (LINE_ITEMS_FIELD_KEYS.includes(key)) return 'line_items';
    if (ADDRESS_FIELD_KEYS.includes(key)) return 'address';
    return undefined;
}

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
    assignedTo: '',

    opportunity: '',
    company: 'Nandini Infosystems',
    validationPeriod: '30 Days',
    otherRef: '',
    paymentTerms: '50% Advance & 50% on Delivery',
    paymentTermsDescription: '',
    preparedFor: 'Customer',

    // Tab 2: Line Items
    currency: 'Indian Rupee: ₹',
    // The editor always shows one empty line (a quotation needs at least one filled line).
    lineItems: [],
    lumpSumDiscount: 0,
    roundOff: true,
    totalAmount: 0,
    totalDiscount: 0,
    subtotal: 0,
    actualBeforeTax: 0,
    totalTax: 0,
    gstType: null,
    roundOffAmount: 0,
    grandTotal: 0,

    // Tab 3: Address Information
    organizationName: '',
    organizationId: '',
    contact: '',
    contactId: '',
    contactNumber: '',
    mailingName: '',
    gstNumber: '',
    contactEmail: '',

    billingAddress: '',
    billingCity: '',
    billingState: '',
    billingPostalCode: '',
    billingCountry: 'IN',

    shippingAddress: '',
    shippingCity: '',
    shippingState: '',
    shippingPostalCode: '',
    shippingCountry: 'IN',
    copyAddressFromBilling: true,

    // Context & Aliases
    opportunityId: '',
    opportunityCode: '',
    status: 'Draft',
    quoteDate: new Date().toISOString().split('T')[0],
    quotationSubject: '',
    notes: '',
    termsAndConditions: '',
};

/**
 * A quotation built from an opportunity, with the admin's dropdown defaults (stage, company, terms, …) in place
 * of the builder's fixed ones. A terms / payment template that changes brings its own description (empty when the
 * dropdown has no default). Values in `keep` are left as they are.
 */
function withAdminQuoteDefaults(values: QuotationFormData, keep?: Partial<QuotationFormData>): QuotationFormData {
    const configs = getFormConfigs();
    const next = withDropdownDefaults(configs, 'quotations', values, keep);
    const describe = (categoryKey: string, value: string, fallback: Record<string, string>): string => {
        if (!value) return '';
        const meta = findCategory(configs, categoryKey)?.options.find((o) => o.value === value)?.meta?.description;
        return typeof meta === 'string' && meta ? meta : (fallback[value] ?? '');
    };
    if (next.termsAndCondition !== values.termsAndCondition) {
        next.termsAndConditionDescription = describe('quote_terms_template', next.termsAndCondition, TERMS_TEMPLATE_DESCRIPTIONS);
    }
    if (next.paymentTerms !== values.paymentTerms) {
        next.paymentTermsDescription = describe('quote_payment_terms', next.paymentTerms, PAYMENT_TERMS_DESCRIPTIONS);
    }
    return next;
}

/** The first message in a (possibly nested) error tree, e.g. a line item's `lineItems.0.rate`. */
function getFirstErrorText(errors: unknown): string | null {
    if (!errors || typeof errors !== 'object') return null;
    if ('message' in errors && typeof (errors as { message?: unknown }).message === 'string' && (errors as { message: string }).message) {
        return (errors as { message: string }).message;
    }
    for (const [key, value] of Object.entries(errors as Record<string, unknown>)) {
        if (key === 'ref' || key === 'types') continue; // RHF's DOM ref and per-rule messages
        const found = getFirstErrorText(value);
        if (found) return found;
    }
    return null;
}

export function CreateQuoteForm({
    mode = 'create',
    quotationId,
    opportunityId,
    initialData,
    breadcrumbItems,
}: CreateQuoteFormProps) {
    const router = useRouter();
    const username = useAuth().user?.username;
    const isEdit = mode !== 'create';
    const [quotation, setQuotation] = useState<Quotation | null>(null);
    const showNumber = useShowRecordNumber();
    const [opportunity, setOpportunity] = useState<Opportunity | null>(null);
    const [loading, setLoading] = useState<boolean>(() =>
        mode !== 'create' ? Boolean(quotationId) : Boolean(opportunityId)
    );
    const [activeTab, setActiveTab] = useResetTab<QuotationTabKey>('overview');
    const [addressPrepopulated, setAddressPrepopulated] = useState(true);

    const { methods, toast, showToast, closeToast, stepwise } =
        useRhfForm<QuotationFormData>({
            schema: quotationFormSchema,
            noPastDates: NO_PAST_DATES.quotation,
            module: 'quotations',
            defaultValues: { ...EMPTY_DEFAULTS, ...initialData },
            dropdownDefaults: { enabled: mode === 'create', keep: initialData },
            assigneeField: 'assignedTo',
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
                              .getAll({ search: found.contact })
                              .then((contacts) => contacts.find((c) => sameText(c.name, found.contact))),
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

                // Assigned to follows the opportunity's owner; without one, the logged-in user.
                reset(
                    withDefaultAssignee(
                        { ...withAdminQuoteDefaults(defaults, initialData), ...initialData },
                        'assignedTo',
                        username
                    )
                );
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
    }, [isEdit, quotationId, opportunityId, initialData, reset, router, showToast, username]);

    const defaultBreadcrumbs: BreadcrumbItem[] = isEdit
        ? [
              { label: 'Sales' },
              { label: 'Quotations', href: ROUTES.QUOTATIONS },
              {
                  label: showNumber('quotation') && quotation?.quotationCode
                      ? `${mode === 'view' ? 'View' : 'Edit'}: ${quotation.quotationCode}`
                      : `${mode === 'view' ? 'View' : 'Edit'} Quotation`,
              },
          ]
        : [
              { label: 'Sales' },
              { label: 'Opportunities', href: ROUTES.OPPORTUNITIES },
              {
                  label: showNumber('opportunity') && opportunity?.opportunityCode
                      ? `Quote: ${opportunity.opportunityCode}`
                      : 'Create Quote',
              },
          ];

    // Helper to find first error message from FieldErrors
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
                reset(values);
                setSaveFlash({
                    listPath: ROUTES.QUOTATIONS,
                    message: showNumber('quotation')
                        ? `Quotation "${updated?.quotationCode || quotation?.quotationCode || quotationId}" updated successfully!`
                        : 'Quotation updated successfully!',
                    severity: 'success',
                    recordId: updated?.id ?? quotationId,
                });
                router.push(ROUTES.QUOTATIONS);
            } else if (opportunityId) {
                const result = await quotationService.createQuotationFromOpportunity(
                    opportunityId,
                    values
                );
                reset(values);
                setSaveFlash({
                    listPath: ROUTES.QUOTATIONS,
                    message: showNumber('quotation')
                        ? `Quotation "${result.quotationCode}" created successfully for ${result.organizationName}!`
                        : `Quotation created successfully for ${result.organizationName}!`,
                    severity: 'success',
                    recordId: result.id,
                });
                router.push(ROUTES.QUOTATIONS);
            } else {
                const created = await quotationService.create(values);
                reset(values);
                setSaveFlash({
                    listPath: ROUTES.QUOTATIONS,
                    message: showNumber('quotation') ? `Quotation "${created.quotationCode}" created successfully!` : 'Quotation created successfully!',
                    severity: 'success',
                    recordId: created?.id,
                });
                router.push(ROUTES.QUOTATIONS);
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
        router.push(mode === 'view' || isEdit ? ROUTES.QUOTATIONS : ROUTES.OPPORTUNITIES);
    };

    if (loading) {
        return (
            <Box role="status" aria-label={isEdit ? 'Loading quotation details' : 'Loading opportunity and commercial details'}>
                <BreadcrumbsSkeleton />
                {mode === 'view' ? <RecordDetailSkeleton /> : <FormCardSkeleton />}
            </Box>
        );
    }

    return (
        <FormProvider {...methods}>
            <FormConfigProvider module="quotations">
                <CommonFormLayout
                    isDirty={isDirty}
                    breadcrumbItems={breadcrumbItems || defaultBreadcrumbs}
                    tabs={QUOTATION_FORM_TABS}
                    activeTab={activeTab}
                    onTabChange={(tabId) => setActiveTab(tabId as QuotationTabKey)}
                    onCancel={handleDiscard}
                    onSave={mode === 'view' ? () => router.push(ROUTES.QUOTATION_EDIT(quotationId!)) : handleSave}
                    submitting={isSubmitting}
                    saveLabel={mode === 'view' ? 'Edit Quotation' : isEdit ? 'Update Quotation' : 'Save Quotation'}
                    stepwise={{ ...stepwise, fieldTab: quotationFieldTab }}
                    cancelLabel={mode === 'view' ? 'Back' : 'Cancel'}
                    mode={mode}
                    headerExtra={mode === 'view' && quotationId ? <PdfActionsButton module="QUOTATION" recordId={quotationId} /> : undefined}
                    recordView={{
                        title: quotation?.organizationName || quotation?.quotationSubject || 'Quotation',
                        code: showNumber('quotation') ? quotation?.quotationCode : undefined,
                        subtitle: quotation?.quotationSubject && quotation.organizationName ? quotation.quotationSubject : undefined,
                        avatarIcon: <ReceiptLongOutlinedIcon sx={{ fontSize: 28 }} />,
                        editHref: quotationId ? ROUTES.QUOTATION_EDIT(quotationId) : undefined,
                        editLabel: 'Edit Quotation',
                        backHref: ROUTES.QUOTATIONS,
                        audit: quotation
                            ? { createdAt: quotation.createdAt, createdBy: quotation.createdBy, updatedAt: quotation.updatedAt, updatedBy: quotation.updatedBy }
                            : undefined,
                    }}
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
                        <DynamicModuleCustomFields module="quotations" tabKey="overview" />
                    </div>

                    <div hidden={activeTab !== 'line_items'}>
                        <QuotationLineItemsSection />
                        <DynamicModuleCustomFields module="quotations" tabKey="line_items" />
                    </div>

                    <div hidden={activeTab !== 'address'}>
                        <QuotationAddressSection />
                        <DynamicModuleCustomFields module="quotations" tabKey="address" />
                    </div>
                </CommonFormLayout>
            </FormConfigProvider>
        </FormProvider>
    );
}

export default CreateQuoteForm;
