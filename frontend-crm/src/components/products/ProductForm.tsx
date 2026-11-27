'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { FormProvider } from 'react-hook-form';
import { Divider } from '@mui/material';
import InventoryOutlinedIcon from '@mui/icons-material/InventoryOutlined';
import LocalOfferOutlinedIcon from '@mui/icons-material/LocalOfferOutlined';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';

import { type BreadcrumbItem } from '../common/AppBreadcrumbs';
import { type FormTabDefinition } from '../common/Drawer';
import { ROUTES } from '@/config/constants';

import { setSaveFlash } from '@/utils/saveFlash';
import { productFormSchema } from '@/validations';
import { ACTIVE_PRODUCT_STATUS, type ProductFormData } from '@/types/product.types';
import { productService } from '@/services';
import { useProductManufacturers } from '@/hooks/queries/useProducts';
import { FORM_CONFIGS_QUERY_KEY, useDropdownOptions } from '@/hooks/queries/useFormConfigs';
import { PRODUCT_CATEGORIES } from '@/types/lead.types';

// Reusable Form Primitives
import {
    CommonFormLayout,
    AppToast,
    FIELD_MAX_LENGTH,
    FormGrid,
    FormGridItem,
    SectionLabel,
    RhfTextField,
    RhfSelect,
    RhfPercentageField,
    RhfAmountField,
    RhfSuggestField,
    useRhfForm,
} from '@/components/forms';
import { FormConfigProvider } from '@/context/FormConfigContext';
import { DynamicModuleCustomFields } from '@/components/forms/DynamicModuleCustomFields';
import { useShowRecordNumber } from '@/hooks/queries/useDocumentSeries';
import { ProductStatusSection, type SavedProductStatus } from './ProductStatusSection';
import { LINE_ITEM_TAX_RATE_CATEGORY, LINE_ITEM_TAX_RATES } from '@/lib/line-items';

// ─── Option Lists ──────────────────────────────────────────────────────────────
// Fallbacks only: inside the FormConfigProvider every dropdown offers the admin's options. Product Category is the
// shared list of leads and opportunities (shared_product_category), with the same fallback.
const PRODUCT_TYPES = [
    'Product',
    'Software',
    'Service',
    'Bundle',
    'Subscription',
    'License',
    'Other',
];

/** The Manufacturer dropdown (Form Builder › Dropdowns): a new manufacturer typed here is added to it on save. */
const MANUFACTURER_CATEGORY = 'product_manufacturer';
const NO_MANUFACTURERS: readonly string[] = [];
const CONTRACT_CREATE_OPTIONS = ['Yes', 'No'];

// ─── Default Form State ────────────────────────────────────────────────────────
const DEFAULT_FORM: ProductFormData = {
    productName: '',
    hsnCode: '',
    productCategory: '',
    type: '',
    manufacturer: '',
    taxRate: '',
    discount: '',
    cost: '',
    mrp: '',
    msp: '',
    contractCreate: 'No',
    description: '',
    termsAndConditions: '',
    status: ACTIVE_PRODUCT_STATUS,
    inactivityReason: '',
};

// ─── Single Source of Truth for Product Form Tabs ─────────────────────────────
export const PRODUCT_FORM_TABS: FormTabDefinition[] = [
    {
        id: 'overview',
        label: 'Overview',
        icon: <InventoryOutlinedIcon sx={{ fontSize: 18, color: 'var(--crm-text-blue-600)' }} />,
    },
];

// ─── Props ─────────────────────────────────────────────────────────────────────
export interface ProductFormProps {
    mode?: 'create' | 'edit' | 'view';
    initialData?: Partial<ProductFormData>;
    productId?: string;
    breadcrumbItems?: BreadcrumbItem[];
}

export default function ProductForm({
    mode = 'create',
    initialData,
    productId,
    breadcrumbItems,
}: ProductFormProps) {
    const router = useRouter();
    const queryClient = useQueryClient();

    const { methods, toast, showToast, closeToast, createSubmitHandler, stepwise } =
        useRhfForm<ProductFormData>({
            schema: productFormSchema,
            module: 'products',
            defaultValues: { ...DEFAULT_FORM, ...initialData },
            dropdownDefaults: { enabled: mode === 'create', keep: initialData },
        });

    const { reset, watch, formState } = methods;
    const { isDirty, isSubmitting } = formState;
    const productName = watch('productName');
    const [recordCode, setRecordCode] = useState('');
    // The saved Status (with Inactive Since and who set it), shown by the Status section.
    const [savedStatus, setSavedStatus] = useState<SavedProductStatus | null>(null);
    const showNumber = useShowRecordNumber();
    // Manufacturer: the options of the Manufacturer dropdown, with how many products carry each (only the editable
    // form asks for the counts). Manufacturers on products from before the dropdown are offered too.
    const manufacturerOptions = useDropdownOptions(MANUFACTURER_CATEGORY, NO_MANUFACTURERS, 'products');
    // The Tax Rate dropdown: the same options line items offer as GST (Jira CRM-111).
    const taxRateOptions = useDropdownOptions(LINE_ITEM_TAX_RATE_CATEGORY, LINE_ITEM_TAX_RATES, 'products');
    const { data: manufacturers, isLoading: manufacturersLoading } = useProductManufacturers(mode !== 'view');
    const manufacturerSuggestions = React.useMemo(() => {
        const counts = new Map((manufacturers ?? []).map((m) => [m.name.toLowerCase(), m.products]));
        const names = [...manufacturerOptions];
        const seen = new Set(names.map((n) => n.toLowerCase()));
        for (const m of manufacturers ?? []) if (!seen.has(m.name.toLowerCase())) names.push(m.name);
        return names.map((value) => {
            const count = counts.get(value.toLowerCase());
            return { value, detail: count ? `${count} ${count === 1 ? 'product' : 'products'}` : undefined };
        });
    }, [manufacturerOptions, manufacturers]);

    const defaultBreadcrumbs: BreadcrumbItem[] = [
        { label: 'Inventory' },
        { label: 'Products', href: ROUTES.PRODUCTS },
        {
            label:
                mode !== 'create'
                    ? productName
                        ? `${mode === 'view' ? 'View' : 'Edit'}: ${productName}`
                        : `${mode === 'view' ? 'View' : 'Edit'} Product`
                    : 'Create Product',
        },
    ];

    // Populate data when editing
    // True until the saved record arrives (view / edit), so the form shows skeleton fields, not empty ones.
    const [recordLoading, setRecordLoading] = useState(Boolean(productId));
    useEffect(() => {
        if (!productId) return;
        let active = true;
        productService
            .getById(productId)
            .then((found) => {
                if (active && found) {
                    reset({ ...DEFAULT_FORM, ...found });
                    setRecordCode(found.productCode ?? '');
                    setSavedStatus({ status: found.status, inactiveSince: found.inactiveSince, inactivatedBy: found.inactivatedBy });
                }
            })
            .catch(() => {})
            .finally(() => {
                if (active) setRecordLoading(false);
            });
        return () => {
            active = false;
        };
    }, [productId, reset]);

    const handleSave = createSubmitHandler(async (values) => {
        try {
            let saved: { id: string } | undefined;
            let message = '';
            if (mode === 'create') {
                saved = await productService.create(values);
                message = 'Product created successfully!';
            } else if (productId) {
                saved = await productService.update(productId, values);
                message = 'Product updated successfully!';
            }
            reset(values);
            // A new manufacturer was added to the Manufacturer dropdown: offer it on the next product right away.
            if (values.manufacturer?.trim()) void queryClient.invalidateQueries({ queryKey: FORM_CONFIGS_QUERY_KEY });
            if (message) setSaveFlash({ listPath: ROUTES.PRODUCTS, message, severity: 'success', recordId: saved?.id ?? productId });
            router.push(ROUTES.PRODUCTS);
        } catch (err: unknown) {
            showToast(err instanceof Error ? err.message : 'Failed to save product.', 'error');
        }
    });

    const handleDiscard = () => {
        router.push(ROUTES.PRODUCTS);
    };

    return (
        <FormProvider {...methods}>
            <FormConfigProvider module="products">
                <CommonFormLayout
                    loading={recordLoading}
                    isDirty={isDirty}
                    breadcrumbItems={breadcrumbItems || defaultBreadcrumbs}
                    tabs={PRODUCT_FORM_TABS}
                    activeTab="overview"
                    onCancel={handleDiscard}
                    onSave={mode === 'view' ? () => router.push(ROUTES.PRODUCT_EDIT(productId!)) : handleSave}
                    submitting={isSubmitting}
                    saveLabel={mode === 'view' ? 'Edit Product' : mode === 'edit' ? 'Update Product' : 'Save Product'}
                    stepwise={stepwise}
                    cancelLabel={mode === 'view' ? 'Back' : 'Cancel'}
                    recordView={{
                        title: productName || '',
                        code: showNumber('product') ? recordCode : undefined,
                        editHref: productId ? ROUTES.PRODUCT_EDIT(productId) : undefined,
                        editLabel: 'Edit Product',
                        backHref: ROUTES.PRODUCTS,
                    }}
                    mode={mode}
                    toast={
                        <AppToast
                            open={toast.open}
                            message={toast.message}
                            severity={toast.severity}
                            onClose={closeToast}
                        />
                    }
                >
                    {/* ════════════════════════════════════════════════
                        Section 1: Product Information
                       ════════════════════════════════════════════════ */}
                    <SectionLabel
                        icon={<LocalOfferOutlinedIcon sx={{ fontSize: 18 }} />}
                        label="Product Information"
                    />

                    <FormGrid columns={3} sx={{ mt: 1 }}>
                        <RhfTextField<ProductFormData>
                            name="productName"
                            label="Product Name"
                            required
                            placeholder="Enter product name"
                        />
                        <RhfSelect<ProductFormData>
                            name="productCategory"
                            label="Product Category"
                            placeholder="Select Product Category"
                            options={PRODUCT_CATEGORIES}
                        />
                        <RhfSelect<ProductFormData>
                            name="type"
                            label="Type"
                            placeholder="Select Type"
                            options={PRODUCT_TYPES}
                        />
                        {/* Pick a manufacturer of the dropdown, or type a new one (saving adds it to the dropdown). */}
                        <RhfSuggestField<ProductFormData>
                            name="manufacturer"
                            label="Manufacturer"
                            placeholder="Pick or type a manufacturer"
                            suggestions={manufacturerSuggestions}
                            loading={manufacturersLoading && manufacturerSuggestions.length === 0}
                            fieldSize="md"
                            maxLength={FIELD_MAX_LENGTH.personName}
                        />
                        <RhfTextField<ProductFormData>
                            name="hsnCode"
                            label="HSN Code"
                            placeholder="e.g. 84715000"
                        />
                    </FormGrid>

                    <Divider sx={{ my: 3.5, borderColor: 'var(--mui-palette-border-light)' }} />

                    {/* ════════════════════════════════════════════════
                        Section 2: Pricing & Tax
                       ════════════════════════════════════════════════ */}
                    <SectionLabel
                        icon={<LocalOfferOutlinedIcon sx={{ fontSize: 18 }} />}
                        label="Pricing & Tax"
                    />

                    <FormGrid columns={3} sx={{ mt: 1 }}>
                        {/* ── Prices ── */}
                        <RhfAmountField<ProductFormData>
                            name="cost"
                            label="Cost (₹)"
                            hint="Purchase / landed cost"
                            placeholder="0.00"
                            fieldSize="sm"
                        />
                        <RhfAmountField<ProductFormData>
                            name="mrp"
                            label="MRP (₹)"
                            hint="Maximum Retail Price"
                            placeholder="0.00"
                            fieldSize="sm"
                        />
                        <RhfAmountField<ProductFormData>
                            name="msp"
                            label="MSP (₹)"
                            hint="Minimum Selling Price"
                            placeholder="0.00"
                            fieldSize="sm"
                        />

                        {/* ── Tax ── */}
                        <RhfSelect<ProductFormData>
                            name="taxRate"
                            label="Tax Rate"
                            placeholder="Select Tax Rate"
                            options={taxRateOptions}
                        />
                        <RhfPercentageField<ProductFormData>
                            name="discount"
                            label="Discount (%)"
                            hint="e.g. 10 for 10%"
                            placeholder="0"
                        />

                        <RhfSelect<ProductFormData>
                            name="contractCreate"
                            label="Contract Create"
                            options={CONTRACT_CREATE_OPTIONS}
                        />
                    </FormGrid>

                    <Divider sx={{ my: 3.5, borderColor: 'var(--mui-palette-border-light)' }} />

                    {/* ════════════════════════════════════════════════
                        Section 3: Description & Terms
                       ════════════════════════════════════════════════ */}
                    <SectionLabel
                        icon={<DescriptionOutlinedIcon sx={{ fontSize: 18 }} />}
                        label="Description & Terms"
                    />

                    <FormGrid columns={2} sx={{ mt: 1 }}>
                        <FormGridItem>
                            <RhfTextField<ProductFormData>
                                name="description"
                                label="Description"
                                multiline
                                placeholder="Enter product description..."
                            />
                        </FormGridItem>
                        <FormGridItem>
                            <RhfTextField<ProductFormData>
                                name="termsAndConditions"
                                label="Terms and Conditions"
                                multiline
                                placeholder="Enter terms and conditions..."
                            />
                        </FormGridItem>
                    </FormGrid>
                    {/* A new product starts Active: the Status is changed when editing (Admins only). */}
                    {mode !== 'create' && <ProductStatusSection saved={savedStatus} />}
                    <DynamicModuleCustomFields module="products" tabKey="overview" sx={{ px: 0, pb: 0, mt: 3.5 }} />
                </CommonFormLayout>
            </FormConfigProvider>
        </FormProvider>
    );
}
