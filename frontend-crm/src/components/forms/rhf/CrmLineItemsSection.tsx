'use client';

import React, { useCallback, useMemo, useState } from 'react';
import {
    Box,
    Typography,
    TextField,
    Button,
    IconButton,
    Select,
    MenuItem,
    FormControl,
    Tooltip,
    Divider,
    Paper,
    Alert,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import ClearIcon from '@mui/icons-material/Clear';
import { useFormContext, useWatch, type Path, type PathValue } from 'react-hook-form';

import { FormField, fieldSx } from '../FormField';
import { LookupField } from '../LookupField';
import { ProductLookupModal } from '@/components/common/lookup/PresetLookupModals';
import { useProducts } from '@/hooks/queries/useProducts';
import type { Product } from '@/types/product.types';
import { FIELD_MAX_LENGTH, FIELD_SIZE_WIDTH } from '../fieldSizing';
import { useFormMode } from '@/context/FormModeContext';
import { CrmLineItemsReadOnly } from './CrmLineItemsReadOnly';
import { fmtMoney, fmtNumber, useDisplayFormats } from '@/utils/formats';
import {
    OPPORTUNITY_CURRENCIES,
    OPPORTUNITY_TAX_RATES,
    type OpportunityLineItem,
} from '@/types/opportunity.types';

export type CrmLineItem = OpportunityLineItem;

export interface CrmLineItemsValues {
    currency: string;
    groupName: string;
    lineItems: OpportunityLineItem[];
    lumpSumDiscount: number;
    totalAmount?: number;
    totalDiscount?: number;
    subtotal?: number;
    totalTax?: number;
    grandTotal?: number;
}

// Backward compatibility alias
export type CrmLineItemsData = CrmLineItemsValues;

export interface CrmLineItemsEditorProps {
    value: CrmLineItemsValues;
    onChange: <K extends keyof CrmLineItemsValues>(field: K, val: CrmLineItemsValues[K]) => void;
    error?: string;
}

export interface CrmLineItemsSectionProps {
    value?: CrmLineItemsValues;
    onChange?: <K extends keyof CrmLineItemsValues>(field: K, val: CrmLineItemsValues[K]) => void;
    form?: Partial<CrmLineItemsValues>;
    setField?: <K extends keyof CrmLineItemsValues>(key: K, value: CrmLineItemsValues[K]) => void;
    error?: string;
}

/** The line's tax rate for a catalog product (`GST 18%`, or `--None--` when it carries no tax). */
function productTaxRate(product: Product): string {
    if (product.taxType === 'None') return '--None--';
    const rate = product.taxRate ? `GST ${product.taxRate}` : '';
    return OPPORTUNITY_TAX_RATES.includes(rate) ? rate : 'GST 18%';
}

const NO_PRODUCTS: Product[] = [];

/** Line-item amounts keep up to 3 decimals (as typed), in the company number grouping. */
const LINE_MONEY = { minDecimals: 0, maxDecimals: 3 } as const;

export function parseTaxRate(taxRateStr: string): number {
    if (!taxRateStr || taxRateStr === '--None--' || taxRateStr === 'GST 0%') return 0;
    const match = taxRateStr.match(/(\d+)%/);
    return match ? Number(match[1]) : 0;
}

export const DEFAULT_LINE_ITEMS_VALUES: CrmLineItemsValues = {
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

// ══════════════════════════════════════════════════════════════════════
// COMPONENT A: CrmLineItemsEditor (Pure Controlled UI — Zero RHF Hooks)
// ══════════════════════════════════════════════════════════════════════
export function CrmLineItemsEditor({ value, onChange, error }: CrmLineItemsEditorProps) {
    const isView = useFormMode().mode === 'view';
    // Amounts are formatted while rendering: re-render when the company formats change.
    useDisplayFormats();
    const currency = value.currency || 'Indian Rupee: ₹';
    const groupName = value.groupName || '';
    const lineItems = Array.isArray(value.lineItems) ? value.lineItems : [];
    const lumpSumDiscount = value.lumpSumDiscount || 0;
    const totalAmount = value.totalAmount ?? 0;
    const totalDiscount = value.totalDiscount ?? 0;
    const subtotal = value.subtotal ?? 0;
    const totalTax = value.totalTax ?? 0;
    const grandTotal = value.grandTotal ?? 0;

    // ── Helper to recalculate all totals from line items ──────────────────────────
    const recalculateTotals = useCallback(
        (items: OpportunityLineItem[], lumpSum: number) => {
            let grossAmount = 0;
            let grossDiscount = 0;
            let grossSubtotal = 0;
            let grossTax = 0;

            items.forEach((item) => {
                const qty = item.quantity || 1;
                const baseAmount = item.amount * qty;
                grossAmount += baseAmount;

                let discVal = 0;
                if (item.discountType === 'percentage') {
                    discVal = (baseAmount * (item.discount || 0)) / 100;
                } else {
                    discVal = (item.discount || 0) * qty;
                }
                grossDiscount += discVal;

                const lineSubtotal = Math.max(0, baseAmount - discVal);
                grossSubtotal += lineSubtotal;

                const taxPercent = parseTaxRate(item.taxRate);
                const lineTax = (lineSubtotal * taxPercent) / 100;
                grossTax += lineTax;
            });

            const computedGrandTotal = Math.max(0, grossSubtotal + grossTax - (lumpSum || 0));

            onChange('lineItems', items);
            onChange('totalAmount', Math.round(grossAmount));
            onChange('totalDiscount', Math.round(grossDiscount));
            onChange('subtotal', Math.round(grossSubtotal));
            onChange('totalTax', Math.round(grossTax));
            onChange('grandTotal', Math.round(computedGrandTotal));
        },
        [onChange]
    );

    // ── Add new product line item ────────────────────────────────────────────────
    const handleAddLineItem = () => {
        const newItem: OpportunityLineItem = {
            id: `line-${Date.now()}`,
            productId: '',
            productName: '',
            quantity: 1,
            amount: 0,
            discount: 0,
            discountType: 'percentage',
            salePrice: 0,
            taxRate: 'GST 18%',
            taxAmount: 0,
            total: 0,
            description: '',
            note: '',
        };
        const updated = [...lineItems, newItem];
        recalculateTotals(updated, lumpSumDiscount);
    };

    // ── Remove product line item ────────────────────────────────────────────────
    const handleRemoveLineItem = (index: number) => {
        const updated = lineItems.filter((_, i) => i !== index);
        recalculateTotals(updated, lumpSumDiscount);
    };

    // ── Update specific line item ───────────────────────────────────────────────
    const handleUpdateLineItem = (index: number, updates: Partial<OpportunityLineItem>) => {
        const updated = lineItems.map((item, i) => {
            if (i !== index) return item;
            const merged: OpportunityLineItem = { ...item, ...updates };

            const qty = merged.quantity || 1;
            const baseAmount = merged.amount;
            let discPerUnit = 0;
            if (merged.discountType === 'percentage') {
                discPerUnit = (baseAmount * (merged.discount || 0)) / 100;
            } else {
                discPerUnit = merged.discount || 0;
            }
            const salePrice = Math.max(0, baseAmount - discPerUnit);
            const lineSubtotal = salePrice * qty;
            const taxPercent = parseTaxRate(merged.taxRate);
            const lineTax = (lineSubtotal * taxPercent) / 100;
            const lineTotal = lineSubtotal + lineTax;

            return {
                ...merged,
                salePrice: Math.round(salePrice),
                taxAmount: Math.round(lineTax),
                total: Math.round(lineTotal),
            };
        });

        recalculateTotals(updated, lumpSumDiscount);
    };

    // ── Select product from the catalog (Product Catalog popup or a typed name) ─
    const { data: productData } = useProducts();
    const products = useMemo(() => (productData ?? NO_PRODUCTS).filter((p) => p.isActive !== false), [productData]);
    const productNames = useMemo(() => products.map((p) => p.productName), [products]);
    // Line whose Product Catalog popup is open.
    const [catalogLine, setCatalogLine] = useState<number | null>(null);

    /** Fills the line from a catalog product: name, MRP as the unit price, tax rate and (when empty) description. */
    const handleSelectProduct = (index: number, product: Product) => {
        const amount = Math.max(0, Number(product.mrp) || 0);
        handleUpdateLineItem(index, {
            productId: product.id,
            productName: product.productName,
            amount,
            salePrice: amount,
            taxRate: productTaxRate(product),
            ...(lineItems[index]?.description?.trim() ? {} : { description: product.description || '' }),
        });
    };

    /** A typed name: a catalog product's exact name fills the line from it; anything else is kept as a custom item. */
    const handleProductNameChange = (index: number, name: string) => {
        const match = products.find((p) => p.productName.trim().toLowerCase() === name.trim().toLowerCase());
        if (match && name === match.productName) handleSelectProduct(index, match);
        else handleUpdateLineItem(index, { productName: name, productId: '' });
    };

    // ── Handle lump sum discount update ─────────────────────────────────────────
    const handleLumpSumChange = (val: number) => {
        onChange('lumpSumDiscount', val);
        recalculateTotals(lineItems, val);
    };

    if (isView) return <CrmLineItemsReadOnly value={value} />;

    return (
        <Box sx={{ p: { xs: 2, md: 3 } }}>
            <ProductLookupModal
                open={catalogLine !== null}
                onClose={() => setCatalogLine(null)}
                selectedValue={catalogLine !== null ? lineItems[catalogLine]?.productName : undefined}
                onSelect={(product) => {
                    if (catalogLine !== null) handleSelectProduct(catalogLine, product);
                    setCatalogLine(null);
                }}
            />
            {error && (
                <Alert severity="error" sx={{ mb: 3 }}>
                    {error}
                </Alert>
            )}

            {/* ════════════ TOP SETTINGS (Currency) ════════════ */}
            <FormField name="currency" label="Currency" size="sm" hint="Base billing currency" sx={{ mb: 3 }}>
                <FormControl size="small" fullWidth sx={fieldSx}>
                    <Select
                        value={currency}
                        onChange={(e) => onChange('currency', e.target.value)}
                    >
                        {OPPORTUNITY_CURRENCIES.map((cur) => (
                            <MenuItem key={cur} value={cur}>
                                {cur}
                            </MenuItem>
                        ))}
                    </Select>
                </FormControl>
            </FormField>

            {/* ════════════ LINE ITEMS SECTION ════════════ */}
            <Paper
                variant="outlined"
                sx={{
                    p: 2.5,
                    borderRadius: '8px',
                    backgroundColor: 'var(--mui-palette-background-paper)',
                    border: '1px solid var(--mui-palette-border-strong)',
                    mb: 4,
                }}
            >
                <Typography sx={{ fontSize: '0.92rem', fontWeight: 700, color: 'var(--mui-palette-text-primary)', mb: 2 }}>
                    Line Items
                </Typography>

                {/* Group Name input */}
                <FormField
                    name="groupName"
                    label="Group Name"
                    size="lg"
                    hint="Logical bundle name (e.g. Products / Software / AMC)"
                    sx={{ mb: 3 }}
                >
                    <TextField
                        fullWidth
                        size="small"
                        value={groupName}
                        onChange={(e) => onChange('groupName', e.target.value)}
                        placeholder="e.g. Software Licenses & Add-ons"
                        sx={fieldSx}
                        slotProps={{ htmlInput: { maxLength: FIELD_MAX_LENGTH.shortText } }}
                    />
                </FormField>

                {/* Dynamic Line items table container */}
                <Box sx={{ overflowX: 'auto', mb: 2 }}>
                    {lineItems.length === 0 ? (
                        <Box
                            sx={{
                                p: 4,
                                textAlign: 'center',
                                backgroundColor: 'var(--mui-palette-background-subtle)',
                                border: '1px dashed var(--mui-palette-border-strong)',
                                borderRadius: '8px',
                            }}
                        >
                            <Typography sx={{ fontSize: '0.86rem', color: 'var(--mui-palette-text-secondary)', mb: 1.5 }}>
                                No product line items added yet. Click below to add products or services.
                            </Typography>
                            <Button
                                variant="contained"
                                startIcon={<AddIcon />}
                                onClick={handleAddLineItem}
                                sx={{
                                    backgroundColor: 'var(--crm-fill-blue-600)',
                                    color: '#ffffff',
                                    textTransform: 'none',
                                    fontWeight: 700,
                                    fontSize: '0.82rem',
                                    px: 2.5,
                                    '&:hover': { backgroundColor: 'var(--crm-fill-blue-700)' },
                                }}
                            >
                                Add Product Line
                            </Button>
                        </Box>
                    ) : (
                        <Box sx={{ minWidth: 960 }}>
                            {/* Table Header Row */}
                            <Box
                                sx={{
                                    display: 'grid',
                                    gridTemplateColumns: '70px 2.2fr 1.1fr 1.5fr 1.1fr 1.5fr 1.1fr 40px',
                                    gap: 1.5,
                                    px: 1.5,
                                    py: 1,
                                    backgroundColor: 'var(--mui-palette-background-hover)',
                                    borderRadius: '6px 6px 0 0',
                                    border: '1px solid var(--mui-palette-border-main)',
                                    borderBottom: 'none',
                                    fontSize: '0.74rem',
                                    fontWeight: 700,
                                    color: 'var(--crm-slate-600)',
                                }}
                            >
                                <Box>Quantity</Box>
                                <Box>Product</Box>
                                <Box>Amount (₹)</Box>
                                <Box>Discount</Box>
                                <Box>Sale Price (₹)</Box>
                                <Box>Tax Amount (₹)</Box>
                                <Box>Total (₹)</Box>
                                <Box sx={{ textAlign: 'center' }}>Action</Box>
                            </Box>

                            {/* Table Line Items */}
                            {lineItems.map((item, idx) => (
                                <Box
                                    key={item.id || idx}
                                    sx={{
                                        border: '1px solid var(--mui-palette-border-main)',
                                        borderTop: idx > 0 ? 'none' : '1px solid var(--mui-palette-border-main)',
                                        p: 1.5,
                                        backgroundColor: idx % 2 === 0 ? 'var(--mui-palette-background-paper)' : 'var(--mui-palette-background-subtle)',
                                        '&:hover': { backgroundColor: 'var(--mui-palette-background-subtle)' },
                                    }}
                                >
                                    {/* Main numbers row */}
                                    <Box
                                        sx={{
                                            display: 'grid',
                                            gridTemplateColumns: '70px 2.2fr 1.1fr 1.5fr 1.1fr 1.5fr 1.1fr 40px',
                                            gap: 1.5,
                                            alignItems: 'center',
                                            mb: 1.5,
                                        }}
                                    >
                                        {/* Quantity */}
                                        <TextField
                                            size="small"
                                            type="number"
                                            value={item.quantity}
                                            onChange={(e) =>
                                                handleUpdateLineItem(idx, {
                                                    quantity: Math.max(1, parseInt(e.target.value, 10) || 1),
                                                })
                                            }
                                            slotProps={{ htmlInput: { min: 1 } }}
                                            sx={fieldSx}
                                        />

                                        {/* Product: type a name or pick from the Product Catalog popup */}
                                        <LookupField
                                            value={item.productName || ''}
                                            onChange={(name) => handleProductNameChange(idx, name)}
                                            options={productNames}
                                            placeholder="Type or pick a product"
                                            onLookupClick={() => setCatalogLine(idx)}
                                            lookupTooltip="Open Product Catalog"
                                            onClear={() => handleUpdateLineItem(idx, { productName: '', productId: '' })}
                                            maxLength={FIELD_MAX_LENGTH.organizationName}
                                        />

                                        {/* Amount (Unit price) */}
                                        <TextField
                                            size="small"
                                            type="number"
                                            value={item.amount}
                                            onChange={(e) =>
                                                handleUpdateLineItem(idx, {
                                                    amount: Math.max(0, parseFloat(e.target.value) || 0),
                                                })
                                            }
                                            slotProps={{ htmlInput: { min: 0 } }}
                                            sx={fieldSx}
                                        />

                                        {/* Discount + Pct/Price selector */}
                                        <Box sx={{ display: 'flex', gap: 0.5 }}>
                                            <TextField
                                                size="small"
                                                type="number"
                                                value={item.discount}
                                                onChange={(e) => {
                                                    const raw = Math.max(0, parseFloat(e.target.value) || 0);
                                                    const val = item.discountType === 'percentage' ? Math.min(100, raw) : raw;
                                                    handleUpdateLineItem(idx, { discount: val });
                                                }}
                                                slotProps={{ htmlInput: { min: 0, max: item.discountType === 'percentage' ? 100 : undefined } }}
                                                sx={{ flex: 1, ...fieldSx }}
                                            />
                                            <FormControl size="small" sx={{ width: 75, ...fieldSx }}>
                                                <Select
                                                    value={item.discountType}
                                                    onChange={(e) => {
                                                        const newType = e.target.value as 'percentage' | 'direct';
                                                        const adjustedDiscount = newType === 'percentage' && item.discount > 100 ? 100 : item.discount;
                                                        handleUpdateLineItem(idx, {
                                                            discountType: newType,
                                                            discount: adjustedDiscount,
                                                        });
                                                    }}
                                                >
                                                    <MenuItem value="percentage">Pct</MenuItem>
                                                    <MenuItem value="direct">Price</MenuItem>
                                                </Select>
                                            </FormControl>
                                        </Box>

                                        {/* Sale Price (Readonly/calculated) */}
                                        <TextField
                                            size="small"
                                            value={fmtNumber(item.salePrice, { maxDecimals: 3 })}
                                            disabled
                                            sx={{
                                                ...fieldSx,
                                                '& .MuiInputBase-input': {
                                                    fontWeight: 600,
                                                    color: 'var(--mui-palette-text-primary)',
                                                    backgroundColor: 'var(--mui-palette-background-hover)',
                                                },
                                            }}
                                        />

                                        {/* Tax Amount + Tax Rate selector */}
                                        <Box sx={{ display: 'flex', gap: 0.5 }}>
                                            <TextField
                                                size="small"
                                                value={fmtNumber(item.taxAmount, { maxDecimals: 3 })}
                                                disabled
                                                sx={{
                                                    flex: 1,
                                                    ...fieldSx,
                                                    '& .MuiInputBase-input': {
                                                        fontWeight: 600,
                                                        backgroundColor: 'var(--mui-palette-background-hover)',
                                                    },
                                                }}
                                            />
                                            <FormControl size="small" sx={{ width: 95, ...fieldSx }}>
                                                <Select
                                                    value={item.taxRate}
                                                    onChange={(e) =>
                                                        handleUpdateLineItem(idx, { taxRate: e.target.value })
                                                    }
                                                >
                                                    {OPPORTUNITY_TAX_RATES.map((rate) => (
                                                        <MenuItem key={rate} value={rate}>
                                                            {rate}
                                                        </MenuItem>
                                                    ))}
                                                </Select>
                                            </FormControl>
                                        </Box>

                                        {/* Total */}
                                        <TextField
                                            size="small"
                                            value={fmtNumber(item.total, { maxDecimals: 3 })}
                                            disabled
                                            sx={{
                                                ...fieldSx,
                                                '& .MuiInputBase-input': {
                                                    fontWeight: 700,
                                                    color: 'var(--crm-text-blue-900)',
                                                    backgroundColor: 'var(--mui-palette-primary-soft)',
                                                },
                                            }}
                                        />

                                        {/* Delete button (X) */}
                                        <Box sx={{ textAlign: 'center' }}>
                                            <Tooltip title="Remove item">
                                                <IconButton
                                                    size="small"
                                                    onClick={() => handleRemoveLineItem(idx)}
                                                    sx={{
                                                        width: 32,
                                                        height: 32,
                                                        backgroundColor: 'var(--crm-fill-blue-600)',
                                                        color: '#ffffff',
                                                        borderRadius: '4px',
                                                        '&:hover': { backgroundColor: 'var(--mui-palette-error-main)' },
                                                    }}
                                                >
                                                    <ClearIcon sx={{ fontSize: 16 }} />
                                                </IconButton>
                                            </Tooltip>
                                        </Box>
                                    </Box>

                                    {/* Description and Note textareas below each row */}
                                    <Box
                                        sx={{
                                            display: 'grid',
                                            gridTemplateColumns: '1fr 1fr',
                                            gap: 2,
                                            pt: 1,
                                            borderTop: '1px dashed var(--mui-palette-border-main)',
                                        }}
                                    >
                                        <Box>
                                            <Typography sx={{ fontSize: '0.72rem', color: 'var(--mui-palette-text-secondary)', mb: 0.5 }}>
                                                Description:
                                            </Typography>
                                            <TextField
                                                fullWidth
                                                size="small"
                                                multiline
                                                rows={2}
                                                placeholder="Line item scope or package specifications..."
                                                value={item.description || ''}
                                                onChange={(e) =>
                                                    handleUpdateLineItem(idx, { description: e.target.value })
                                                }
                                                slotProps={{ htmlInput: { maxLength: FIELD_MAX_LENGTH.longText } }}
                                                sx={fieldSx}
                                            />
                                        </Box>
                                        <Box>
                                            <Typography sx={{ fontSize: '0.72rem', color: 'var(--mui-palette-text-secondary)', mb: 0.5 }}>
                                                Note:
                                            </Typography>
                                            <TextField
                                                fullWidth
                                                size="small"
                                                multiline
                                                rows={2}
                                                placeholder="Internal notes, discount justifications, or terms..."
                                                value={item.note || ''}
                                                onChange={(e) =>
                                                    handleUpdateLineItem(idx, { note: e.target.value })
                                                }
                                                slotProps={{ htmlInput: { maxLength: FIELD_MAX_LENGTH.longText } }}
                                                sx={fieldSx}
                                            />
                                        </Box>
                                    </Box>
                                </Box>
                            ))}
                        </Box>
                    )}
                </Box>

                {/* + ADD PRODUCT LINE Button (the empty state above has its own, so it only shows below existing lines) */}
                {lineItems.length > 0 && (
                    <Button
                        variant="contained"
                        startIcon={<AddIcon />}
                        onClick={handleAddLineItem}
                        sx={{
                            backgroundColor: 'var(--crm-fill-blue-600)',
                            color: '#ffffff',
                            textTransform: 'uppercase',
                            fontWeight: 700,
                            fontSize: '0.76rem',
                            letterSpacing: '0.04em',
                            px: 2.2,
                            py: 0.8,
                            borderRadius: '4px',
                            '&:hover': { backgroundColor: 'var(--crm-fill-blue-700)' },
                        }}
                    >
                        ADD PRODUCT LINE
                    </Button>
                )}
            </Paper>

            {/* ════════════ SUMMARY & FINANCIAL TOTALS ════════════ */}
            <Box
                sx={{
                    display: 'grid',
                    gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' },
                    gap: 3,
                }}
            >
                {/* Left side totals / lump sum */}
                <Paper
                    variant="outlined"
                    sx={{
                        p: 2.5,
                        borderRadius: '8px',
                        border: '1px solid var(--mui-palette-border-strong)',
                        backgroundColor: 'var(--mui-palette-background-paper)',
                    }}
                >
                    <Typography sx={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--crm-slate-700)', mb: 2 }}>
                        Overall Deal Adjustments
                    </Typography>

                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <Typography sx={{ fontSize: '0.8rem', color: 'var(--mui-palette-text-secondary)' }}>Total Gross:</Typography>
                            <Typography sx={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--mui-palette-text-primary)' }}>
                                {fmtMoney(totalAmount, LINE_MONEY)}
                            </Typography>
                        </Box>
                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <Typography sx={{ fontSize: '0.8rem', color: 'var(--mui-palette-text-secondary)' }}>Item Discounts:</Typography>
                            <Typography sx={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--mui-palette-error-main)' }}>
                                - {fmtMoney(totalDiscount, LINE_MONEY)}
                            </Typography>
                        </Box>
                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <Typography sx={{ fontSize: '0.8rem', color: 'var(--mui-palette-text-secondary)' }}>Lump Sum Discount:</Typography>
                            <TextField
                                size="small"
                                type="number"
                                value={lumpSumDiscount}
                                onChange={(e) => handleLumpSumChange(parseFloat(e.target.value) || 0)}
                                sx={{ width: FIELD_SIZE_WIDTH.xs, ...fieldSx }}
                                slotProps={{ htmlInput: { min: 0 } }}
                            />
                        </Box>
                    </Box>
                </Paper>

                {/* Right side calculated summary box */}
                <Paper
                    variant="outlined"
                    sx={{
                        p: 2.5,
                        borderRadius: '8px',
                        border: '1.5px solid var(--mui-palette-primary-softBorder)',
                        backgroundColor: 'var(--mui-palette-background-subtle)',
                    }}
                >
                    <Typography sx={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--crm-text-blue-900)', mb: 2 }}>
                        Summary Breakdown
                    </Typography>

                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.2 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <Typography sx={{ fontSize: '0.8rem', color: 'var(--mui-palette-text-secondary)' }}>Total:</Typography>
                            <Typography sx={{ fontSize: '0.85rem', fontWeight: 600 }}>
                                {fmtMoney(totalAmount, LINE_MONEY)}
                            </Typography>
                        </Box>
                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <Typography sx={{ fontSize: '0.8rem', color: 'var(--mui-palette-text-secondary)' }}>Discount:</Typography>
                            <Typography sx={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--mui-palette-error-main)' }}>
                                - {fmtMoney(totalDiscount, LINE_MONEY)}
                            </Typography>
                        </Box>
                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <Typography sx={{ fontSize: '0.8rem', color: 'var(--mui-palette-text-secondary)' }}>Subtotal:</Typography>
                            <Typography sx={{ fontSize: '0.85rem', fontWeight: 700 }}>
                                {fmtMoney(subtotal, LINE_MONEY)}
                            </Typography>
                        </Box>
                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <Typography sx={{ fontSize: '0.8rem', color: 'var(--mui-palette-text-secondary)' }}>Tax:</Typography>
                            <Typography sx={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--crm-text-blue-600)' }}>
                                + {fmtMoney(totalTax, LINE_MONEY)}
                            </Typography>
                        </Box>
                        <Divider sx={{ my: 0.5 }} />
                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <Typography sx={{ fontSize: '0.92rem', fontWeight: 800, color: 'var(--crm-slate-900)' }}>
                                Grand Total:
                            </Typography>
                            <Typography sx={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--crm-green-700)' }}>
                                {fmtMoney(grandTotal, LINE_MONEY)}
                            </Typography>
                        </Box>
                    </Box>
                </Paper>
            </Box>
        </Box>
    );
}

// ══════════════════════════════════════════════════════════════════════
// COMPONENT B: RhfLineItemsConnected (Safe RHF Hook Caller)
// ══════════════════════════════════════════════════════════════════════
function RhfLineItemsConnected() {
    const { control, setValue } = useFormContext<CrmLineItemsValues>();

    const currency = useWatch({ control, name: 'currency' });
    const groupName = useWatch({ control, name: 'groupName' });
    const lineItems = useWatch({ control, name: 'lineItems' });
    const lumpSumDiscount = useWatch({ control, name: 'lumpSumDiscount' });
    const totalAmount = useWatch({ control, name: 'totalAmount' });
    const totalDiscount = useWatch({ control, name: 'totalDiscount' });
    const subtotal = useWatch({ control, name: 'subtotal' });
    const totalTax = useWatch({ control, name: 'totalTax' });
    const grandTotal = useWatch({ control, name: 'grandTotal' });

    const currentValue: CrmLineItemsValues = {
        currency: currency || 'Indian Rupee: ₹',
        groupName: groupName || '',
        lineItems: Array.isArray(lineItems) ? lineItems : [],
        lumpSumDiscount: typeof lumpSumDiscount === 'number' ? lumpSumDiscount : 0,
        totalAmount: typeof totalAmount === 'number' ? totalAmount : 0,
        totalDiscount: typeof totalDiscount === 'number' ? totalDiscount : 0,
        subtotal: typeof subtotal === 'number' ? subtotal : 0,
        totalTax: typeof totalTax === 'number' ? totalTax : 0,
        grandTotal: typeof grandTotal === 'number' ? grandTotal : 0,
    };

    const handleChange = useCallback(
        <K extends keyof CrmLineItemsValues>(field: K, val: CrmLineItemsValues[K]) => {
            setValue(
                field as unknown as Path<CrmLineItemsValues>,
                val as unknown as PathValue<CrmLineItemsValues, Path<CrmLineItemsValues>>,
                {
                    shouldDirty: true,
                    shouldValidate: true,
                }
            );
        },
        [setValue]
    );

    return <CrmLineItemsEditor value={currentValue} onChange={handleChange} />;
}

export function RhfLineItemsSection() {
    const rhfContext = useFormContext<CrmLineItemsValues>();
    if (!rhfContext) {
        return null;
    }
    return <RhfLineItemsConnected />;
}

// ══════════════════════════════════════════════════════════════════════
// SAFE HYBRID WRAPPER: CrmLineItemsSection
// ══════════════════════════════════════════════════════════════════════
export function CrmLineItemsSection(props: CrmLineItemsSectionProps = {}) {
    const rhfContext = useFormContext<CrmLineItemsValues>();

    // 1. If explicit value and onChange are provided, render pure controlled component
    if (props.value && props.onChange) {
        return <CrmLineItemsEditor value={props.value} onChange={props.onChange} error={props.error} />;
    }

    // 2. If legacy form & setField are provided, adapt without RHF
    if (props.form && props.setField) {
        const legacyValue: CrmLineItemsValues = {
            currency: props.form.currency || 'Indian Rupee: ₹',
            groupName: props.form.groupName || '',
            lineItems: Array.isArray(props.form.lineItems) ? props.form.lineItems : [],
            lumpSumDiscount: props.form.lumpSumDiscount || 0,
            totalAmount: props.form.totalAmount || 0,
            totalDiscount: props.form.totalDiscount || 0,
            subtotal: props.form.subtotal || 0,
            totalTax: props.form.totalTax || 0,
            grandTotal: props.form.grandTotal || 0,
        };
        return <CrmLineItemsEditor value={legacyValue} onChange={props.setField} error={props.error} />;
    }

    // 3. If within a FormProvider, delegate to the RHF connected wrapper
    if (rhfContext) {
        return <RhfLineItemsConnected />;
    }

    // 4. Fallback safe editor if neither context nor props are supplied
    return (
        <CrmLineItemsEditor
            value={DEFAULT_LINE_ITEMS_VALUES}
            onChange={() => {}}
            error={props.error}
        />
    );
}

export default CrmLineItemsSection;
