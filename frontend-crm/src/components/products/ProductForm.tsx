'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { FormProvider } from 'react-hook-form';
import { Grid, Divider } from '@mui/material';
import InventoryOutlinedIcon from '@mui/icons-material/InventoryOutlined';
import LocalOfferOutlinedIcon from '@mui/icons-material/LocalOfferOutlined';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';

import { type BreadcrumbItem } from '../common/AppBreadcrumbs';
import { type FormTabDefinition } from '../common/Drawer';
import { ROUTES } from '../../config/constants';
import { productFormSchema } from '@/validations';
import type { ProductFormData } from '../../types/product.types';
import { productService } from '@/services';

// Reusable Form Primitives
import {
    CommonFormLayout,
    AppToast,
    SectionLabel,
    RhfTextField,
    RhfSelect,
    RhfPercentageField,
    RhfAmountField,
    useRhfForm,
} from '@/components/forms';

// ─── Option Lists ──────────────────────────────────────────────────────────────
const PRODUCT_CATEGORIES = [
    'Acronis',
    'Biz Analyst',
    'Connect 21',
    'CredFlow',
    'CRM',
    'Data Warehouse',
    'Tally AMC',
    'Tally Customization',
    'Tally On Cloud',
    'Tally Service',
    'Tally Software Service (TSS)',
    'Tally Training',
    'Tally Upgrade',
    'TallyPrime',
    'TallyPrime Server',
    'Teramind',
    'TVU',
];

const PRODUCT_TYPES = [
    'Product',
    'Service',
    'Bundle',
    'Subscription',
    'License',
    'Other',
];

const TAX_TYPES = ['GST', 'IGST', 'None'];
const TAX_RATES = ['0%', '5%', '12%', '18%', '28%'];
const CONTRACT_CREATE_OPTIONS = ['Yes', 'No'];

// ─── Default Form State ────────────────────────────────────────────────────────
const DEFAULT_FORM: ProductFormData = {
    productName: '',
    hsnCode: '',
    category: '',
    type: '',
    manufacturer: '',
    taxType: 'GST',
    taxRate: '',
    discount: '',
    cost: '',
    mrp: '',
    msp: '',
    contractCreate: 'No',
    description: '',
    termsAndConditions: '',
};

// ─── Single Source of Truth for Product Form Tabs ─────────────────────────────
export const PRODUCT_FORM_TABS: FormTabDefinition[] = [
    {
        id: 'overview',
        label: 'Overview',
        icon: <InventoryOutlinedIcon sx={{ fontSize: 18, color: '#2563eb' }} />,
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

    const { methods, toast, showToast, closeToast, createSubmitHandler } =
        useRhfForm<ProductFormData>({
            schema: productFormSchema,
            defaultValues: { ...DEFAULT_FORM, ...initialData },
        });

    const { reset, watch, formState } = methods;
    const { isDirty, isSubmitting } = formState;
    const productName = watch('productName');

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
    useEffect(() => {
        if (!productId) return;
        let active = true;
        productService
            .getById(productId)
            .then((found) => {
                if (active && found) {
                    reset({ ...DEFAULT_FORM, ...found });
                }
            })
            .catch(() => {});
        return () => {
            active = false;
        };
    }, [productId, reset]);

    const handleSave = createSubmitHandler(async (values) => {
        try {
            if (mode === 'create') {
                await productService.create(values);
                showToast('Product created successfully!', 'success');
            } else if (productId) {
                await productService.update(productId, values);
                showToast('Product updated successfully!', 'success');
            }
            reset(values);
            setTimeout(() => {
                router.push(ROUTES.PRODUCTS);
            }, 800);
        } catch (err: unknown) {
            showToast(err instanceof Error ? err.message : 'Failed to save product.', 'error');
        }
    });

    const handleDiscard = () => {
        if (mode === 'view') {
            router.push(ROUTES.PRODUCTS);
            return;
        }
        if (isDirty && !window.confirm('Discard unsaved product changes?')) return;
        router.push(ROUTES.PRODUCTS);
    };

    return (
        <FormProvider {...methods}>
            <CommonFormLayout
                breadcrumbItems={breadcrumbItems || defaultBreadcrumbs}
                tabs={PRODUCT_FORM_TABS}
                activeTab="overview"
                onCancel={handleDiscard}
                onSave={mode === 'view' ? () => router.push(ROUTES.PRODUCT_EDIT(productId!)) : handleSave}
                submitting={isSubmitting}
                saveLabel={mode === 'view' ? 'Edit Product' : mode === 'edit' ? 'Update Product' : 'Save Product'}
                cancelLabel={mode === 'view' ? 'Back' : 'Cancel'}
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
                    Section 1: Basic Product Info
                   ════════════════════════════════════════════════ */}
                <SectionLabel
                    icon={<LocalOfferOutlinedIcon sx={{ fontSize: 18 }} />}
                    label="Sale Information"
                />

                <Grid container spacing={3.5}>
                    <Grid size={{ xs: 12, md: 6 }}>
                        <RhfTextField<ProductFormData>
                            name="productName"
                            label="Product Name"
                            required
                            placeholder="Enter product name"
                        />
                    </Grid>
                    <Grid size={{ xs: 12, md: 6 }}>
                        <RhfTextField<ProductFormData>
                            name="hsnCode"
                            label="HSN Code"
                            placeholder="e.g. 84715000"
                        />
                    </Grid>

                    <Grid size={{ xs: 12, md: 6 }}>
                        <RhfSelect<ProductFormData>
                            name="category"
                            label="Category"
                            placeholder="Select Category"
                            options={PRODUCT_CATEGORIES}
                        />
                    </Grid>
                    <Grid size={{ xs: 12, md: 6 }}>
                        <RhfSelect<ProductFormData>
                            name="type"
                            label="Type"
                            placeholder="Select Type"
                            options={PRODUCT_TYPES}
                        />
                    </Grid>

                    <Grid size={{ xs: 12, md: 6 }}>
                        <RhfTextField<ProductFormData>
                            name="manufacturer"
                            label="Manufacturer"
                            placeholder="e.g. Dell Technologies"
                        />
                    </Grid>
                </Grid>

                <Divider sx={{ my: 3.5, borderColor: '#f1f5f9' }} />

                {/* ════════════════════════════════════════════════
                    Section 2: Pricing & Tax
                   ════════════════════════════════════════════════ */}
                <SectionLabel
                    icon={<LocalOfferOutlinedIcon sx={{ fontSize: 18 }} />}
                    label="Pricing & Tax"
                />

                <Grid container spacing={3.5}>
                    <Grid size={{ xs: 12, md: 6 }}>
                        <RhfSelect<ProductFormData>
                            name="taxType"
                            label="Tax Type"
                            placeholder="Select Tax Type"
                            options={TAX_TYPES}
                        />
                    </Grid>
                    <Grid size={{ xs: 12, md: 6 }}>
                        <RhfSelect<ProductFormData>
                            name="taxRate"
                            label="Tax Rate"
                            placeholder="Select Tax Rate"
                            options={TAX_RATES}
                        />
                    </Grid>

                    <Grid size={{ xs: 12, md: 6 }}>
                        <RhfPercentageField<ProductFormData>
                            name="discount"
                            label="Discount (%)"
                            hint="e.g. 10 for 10%"
                            placeholder="0"
                        />
                    </Grid>
                    <Grid size={{ xs: 12, md: 6 }}>
                        <RhfAmountField<ProductFormData>
                            name="cost"
                            label="Cost (₹)"
                            hint="Purchase / landed cost"
                            placeholder="0.00"
                        />
                    </Grid>

                    <Grid size={{ xs: 12, md: 6 }}>
                        <RhfAmountField<ProductFormData>
                            name="mrp"
                            label="MRP (₹)"
                            hint="Maximum Retail Price"
                            placeholder="0.00"
                        />
                    </Grid>
                    <Grid size={{ xs: 12, md: 6 }}>
                        <RhfAmountField<ProductFormData>
                            name="msp"
                            label="MSP (₹)"
                            hint="Minimum Selling Price"
                            placeholder="0.00"
                        />
                    </Grid>

                    <Grid size={{ xs: 12, md: 6 }}>
                        <RhfSelect<ProductFormData>
                            name="contractCreate"
                            label="Contract Create"
                            options={CONTRACT_CREATE_OPTIONS}
                        />
                    </Grid>
                </Grid>

                <Divider sx={{ my: 3.5, borderColor: '#f1f5f9' }} />

                {/* ════════════════════════════════════════════════
                    Section 3: Description & Terms
                   ════════════════════════════════════════════════ */}
                <SectionLabel
                    icon={<DescriptionOutlinedIcon sx={{ fontSize: 18 }} />}
                    label="Description & Terms"
                />

                <Grid container spacing={3.5}>
                    <Grid size={{ xs: 12, md: 6 }}>
                        <RhfTextField<ProductFormData>
                            name="description"
                            label="Description"
                            multiline
                            minRows={4}
                            placeholder="Enter product description..."
                        />
                    </Grid>
                    <Grid size={{ xs: 12, md: 6 }}>
                        <RhfTextField<ProductFormData>
                            name="termsAndConditions"
                            label="Terms and Conditions"
                            multiline
                            minRows={4}
                            placeholder="Enter terms and conditions..."
                        />
                    </Grid>
                </Grid>
            </CommonFormLayout>
        </FormProvider>
    );
}
