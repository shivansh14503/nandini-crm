'use client';

import React, { useState, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
    Box,
    Paper,
    Grid,
    TextField,
    Divider,
} from '@mui/material';
import InventoryOutlinedIcon from '@mui/icons-material/InventoryOutlined';
import LocalOfferOutlinedIcon from '@mui/icons-material/LocalOfferOutlined';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';

import { type BreadcrumbItem } from '../common/AppBreadcrumbs';
import { AppToast } from '../common/AppToast';
import { ROUTES } from '../../config/constants';
import type { ProductFormData, Product } from '../../types/product.types';
import { getStoredProducts, saveStoredProducts } from '../../data/mockProducts';

// Reusable Form Primitives
import {
    FormHeader,
    FormStickyFooter,
    SectionLabel,
    FormField,
    StyledSelect,
    fieldSx,
} from '../forms';

// ─── Option Lists ──────────────────────────────────────────────────────────────
const PRODUCT_CATEGORIES = [
    'Hardware',
    'Software',
    'Networking',
    'Storage',
    'Security',
    'Cloud Services',
    'Peripherals',
    'Consumables',
    'AMC / Service',
    'Other',
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

// ─── Props ─────────────────────────────────────────────────────────────────────
export interface ProductFormProps {
    mode?: 'create' | 'edit';
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

    const [form, setForm] = useState<ProductFormData>({ ...DEFAULT_FORM, ...initialData });
    const [submitting, setSubmitting] = useState(false);
    const [isDirty, setIsDirty] = useState(false);
    const [toast, setToast] = useState<{
        open: boolean;
        message: string;
        severity: 'success' | 'error' | 'info' | 'warning';
    }>({ open: false, message: '', severity: 'success' });

    const defaultBreadcrumbs: BreadcrumbItem[] = [
        { label: 'Product Catalog' },
        { label: 'Products', href: ROUTES.PRODUCTS },
        {
            label:
                mode === 'edit'
                    ? form.productName
                        ? `Edit: ${form.productName}`
                        : 'Edit Product'
                    : 'Create Product',
        },
    ];

    // ── Populate for edit ─────────────────────────────────────────────────────
    useEffect(() => {
        if (initialData && Object.keys(initialData).length > 0) {
            setForm((prev) => ({ ...prev, ...initialData }));
        } else if (productId) {
            try {
                const list = getStoredProducts();
                const found = list.find((p: Product) => p.id === productId);
                if (found) setForm((prev) => ({ ...prev, ...found }));
            } catch {}
        }
    }, [initialData, productId]);

    // ── Generic field setter ──────────────────────────────────────────────────
    const set = useCallback(<K extends keyof ProductFormData>(key: K, value: ProductFormData[K]) => {
        setForm((prev) => ({ ...prev, [key]: value }));
        setIsDirty(true);
    }, []);

    // ── Discard ───────────────────────────────────────────────────────────────
    const handleDiscard = () => {
        if (isDirty && !window.confirm('Discard unsaved product changes?')) return;
        router.push(ROUTES.PRODUCTS);
    };

    // ── Submit ────────────────────────────────────────────────────────────────
    const handleSubmit = async (redirectAfter = true) => {
        if (!form.productName.trim()) {
            setToast({ open: true, message: 'Product Name is required.', severity: 'error' });
            return;
        }

        setSubmitting(true);
        try {
            const list = getStoredProducts();
            const now = new Date().toISOString();

            let updatedList: Product[];
            const existingIndex = list.findIndex((p: Product) => p.id === productId);

            if (existingIndex >= 0) {
                updatedList = [...list];
                updatedList[existingIndex] = {
                    ...list[existingIndex],
                    ...form,
                    updatedAt: now,
                };
            } else {
                const newProduct: Product = {
                    id: `prod-${Date.now()}`,
                    productCode: `PRD-${Math.floor(1000 + Math.random() * 9000)}`,
                    ...form,
                    createdAt: now,
                    updatedAt: now,
                    createdBy: 'mittal.sharma',
                };
                updatedList = [newProduct, ...list];
            }

            saveStoredProducts(updatedList);
            setToast({
                open: true,
                message: `Product "${form.productName}" saved successfully!`,
                severity: 'success',
            });
            setIsDirty(false);

            if (redirectAfter) {
                setTimeout(() => router.push(ROUTES.PRODUCTS), 700);
            } else {
                setForm(DEFAULT_FORM);
            }
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : 'Failed to save product.';
            setToast({ open: true, message, severity: 'error' });
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <Box sx={{ pb: 8 }}>
            {/* ── Top Header ── */}
            <FormHeader
                breadcrumbItems={breadcrumbItems || defaultBreadcrumbs}
                onDiscard={handleDiscard}
                submitting={submitting}
                discardLabel="Discard"
            />

            {/* ── Main Form Card ── */}
            <Paper
                elevation={0}
                sx={{
                    border: '1px solid #e2e8f0',
                    borderRadius: '12px',
                    overflow: 'hidden',
                    backgroundColor: '#fff',
                }}
            >
                {/* ── Tab Header Bar ── */}
                <Box
                    sx={{
                        backgroundColor: '#f8fafc',
                        borderBottom: '1px solid #e2e8f0',
                        px: 2,
                        py: 1,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 1,
                    }}
                >
                    <Box
                        sx={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 1,
                            px: 2,
                            py: 1,
                            borderRadius: '8px',
                            backgroundColor: '#ffffff',
                            border: '1px solid #d1d5db',
                            boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
                            color: '#1e3a8a',
                            fontWeight: 700,
                            fontSize: '0.84rem',
                        }}
                    >
                        <InventoryOutlinedIcon sx={{ fontSize: 18, color: '#2563eb' }} />
                        OVERVIEW
                    </Box>
                </Box>

                {/* ── Form Content ── */}
                <Box sx={{ p: { xs: 2.5, md: 3.5 } }}>

                    {/* ════════════════════════════════════════════════
                        Section 1: Basic Product Info
                        ════════════════════════════════════════════════ */}
                    <SectionLabel
                        icon={<LocalOfferOutlinedIcon sx={{ fontSize: 18 }} />}
                        label="Sale Information"
                    />

                    {/* Row 1: Product Name | HSN Code */}
                    <Grid container spacing={3.5}>
                        <Grid size={{ xs: 12, md: 6 }}>
                            <FormField label="Product Name" required>
                                <TextField
                                    fullWidth
                                    size="small"
                                    placeholder="Enter product name"
                                    value={form.productName}
                                    onChange={(e) => set('productName', e.target.value)}
                                    sx={fieldSx}
                                    autoFocus
                                />
                            </FormField>
                        </Grid>
                        <Grid size={{ xs: 12, md: 6 }}>
                            <FormField label="HSN Code">
                                <TextField
                                    fullWidth
                                    size="small"
                                    placeholder="e.g. 84715000"
                                    value={form.hsnCode}
                                    onChange={(e) => set('hsnCode', e.target.value)}
                                    sx={fieldSx}
                                />
                            </FormField>
                        </Grid>

                        {/* Row 2: Category | Type */}
                        <Grid size={{ xs: 12, md: 6 }}>
                            <FormField label="Category">
                                <StyledSelect
                                    label="Category"
                                    value={form.category}
                                    onChange={(v) => set('category', v as any)}
                                    options={PRODUCT_CATEGORIES}
                                />
                            </FormField>
                        </Grid>
                        <Grid size={{ xs: 12, md: 6 }}>
                            <FormField label="Type">
                                <StyledSelect
                                    label="Type"
                                    value={form.type}
                                    onChange={(v) => set('type', v as any)}
                                    options={PRODUCT_TYPES}
                                />
                            </FormField>
                        </Grid>

                        {/* Row 3: Manufacturer */}
                        <Grid size={{ xs: 12, md: 6 }}>
                            <FormField label="Manufacturer">
                                <TextField
                                    fullWidth
                                    size="small"
                                    placeholder="e.g. Dell Technologies"
                                    value={form.manufacturer}
                                    onChange={(e) => set('manufacturer', e.target.value)}
                                    sx={fieldSx}
                                />
                            </FormField>
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
                        {/* Row 4: Tax Type | Tax Rate */}
                        <Grid size={{ xs: 12, md: 6 }}>
                            <FormField label="Tax Type">
                                <StyledSelect
                                    label="Tax Type"
                                    value={form.taxType}
                                    onChange={(v) => set('taxType', v as any)}
                                    options={TAX_TYPES}
                                />
                            </FormField>
                        </Grid>
                        <Grid size={{ xs: 12, md: 6 }}>
                            <FormField label="Tax Rate">
                                <StyledSelect
                                    label="Tax Rate"
                                    value={form.taxRate}
                                    onChange={(v) => set('taxRate', v as any)}
                                    options={TAX_RATES}
                                />
                            </FormField>
                        </Grid>

                        {/* Row 5: Discount | Cost */}
                        <Grid size={{ xs: 12, md: 6 }}>
                            <FormField label="Discount (%)" hint="e.g. 10 for 10%">
                                <TextField
                                    fullWidth
                                    size="small"
                                    type="number"
                                    placeholder="0"
                                    value={form.discount}
                                    onChange={(e) => set('discount', e.target.value)}
                                    sx={fieldSx}
                                />
                            </FormField>
                        </Grid>
                        <Grid size={{ xs: 12, md: 6 }}>
                            <FormField label="Cost (₹)" hint="Purchase / landed cost">
                                <TextField
                                    fullWidth
                                    size="small"
                                    type="number"
                                    placeholder="0.00"
                                    value={form.cost}
                                    onChange={(e) => set('cost', e.target.value)}
                                    sx={fieldSx}
                                />
                            </FormField>
                        </Grid>

                        {/* Row 6: MRP | MSP */}
                        <Grid size={{ xs: 12, md: 6 }}>
                            <FormField label="MRP (₹)" hint="Maximum Retail Price">
                                <TextField
                                    fullWidth
                                    size="small"
                                    type="number"
                                    placeholder="0.00"
                                    value={form.mrp}
                                    onChange={(e) => set('mrp', e.target.value)}
                                    sx={fieldSx}
                                />
                            </FormField>
                        </Grid>
                        <Grid size={{ xs: 12, md: 6 }}>
                            <FormField label="MSP (₹)" hint="Minimum Selling Price">
                                <TextField
                                    fullWidth
                                    size="small"
                                    type="number"
                                    placeholder="0.00"
                                    value={form.msp}
                                    onChange={(e) => set('msp', e.target.value)}
                                    sx={fieldSx}
                                />
                            </FormField>
                        </Grid>

                        {/* Row 7: Contract Create */}
                        <Grid size={{ xs: 12, md: 6 }}>
                            <FormField label="Contract Create">
                                <StyledSelect
                                    label="Contract Create"
                                    value={form.contractCreate}
                                    onChange={(v) => set('contractCreate', v)}
                                    options={CONTRACT_CREATE_OPTIONS}
                                />
                            </FormField>
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

                    {/* Row 8: Description | Terms and Conditions – 2-column textarea */}
                    <Grid container spacing={3.5}>
                        <Grid size={{ xs: 12, md: 6 }}>
                            <FormField label="Description">
                                <TextField
                                    fullWidth
                                    multiline
                                    rows={5}
                                    size="small"
                                    placeholder="Enter product description..."
                                    value={form.description}
                                    onChange={(e) => set('description', e.target.value)}
                                    sx={fieldSx}
                                />
                            </FormField>
                        </Grid>
                        <Grid size={{ xs: 12, md: 6 }}>
                            <FormField label="Terms and Conditions">
                                <TextField
                                    fullWidth
                                    multiline
                                    rows={5}
                                    size="small"
                                    placeholder="Enter terms and conditions..."
                                    value={form.termsAndConditions}
                                    onChange={(e) => set('termsAndConditions', e.target.value)}
                                    sx={fieldSx}
                                />
                            </FormField>
                        </Grid>
                    </Grid>
                </Box>
            </Paper>

            {/* ── Sticky Footer ── */}
            <FormStickyFooter
                onCancel={handleDiscard}
                onSave={() => handleSubmit(true)}
                submitting={submitting}
                saveLabel="Save Product"
                cancelLabel="Cancel"
            />

            {/* ── Toast ── */}
            <AppToast
                open={toast.open}
                message={toast.message}
                severity={toast.severity}
                onClose={() => setToast((t) => ({ ...t, open: false }))}
            />
        </Box>
    );
}
