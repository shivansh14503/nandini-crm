'use client';

import React, { useCallback, useMemo, useState } from 'react';
import {
    Alert,
    Box,
    Button,
    Divider,
    FormControl,
    FormHelperText,
    IconButton,
    InputAdornment,
    MenuItem,
    Paper,
    Select,
    TextField,
    Tooltip,
    Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import ClearIcon from '@mui/icons-material/Clear';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import { useFormContext, useFormState, useWatch, type FieldErrors, type Path, type PathValue } from 'react-hook-form';

import { FormField, fieldSx } from '../FormField';
import { LookupField } from '../LookupField';
import { ProductLookupModal } from '@/components/common/lookup/PresetLookupModals';
import { useDragReorder } from '@/components/settings/form-customization/useDragReorder';
import { useProducts } from '@/hooks/queries/useProducts';
import { useDropdownOptionLabel, useDropdownOptions } from '@/hooks/queries/useFormConfigs';
import { isActiveProduct, type Product } from '@/types/product.types';
import type { LineItem, LineItemsValues } from '@/types/lineItem.types';
import { FIELD_MAX_LENGTH, FIELD_SIZE_WIDTH } from '../fieldSizing';
import { useFormMode } from '@/context/FormModeContext';
import { CrmLineItemsReadOnly } from './CrmLineItemsReadOnly';
import { fmtMoney, fmtNumber, useDisplayFormats } from '@/utils/formats';
import {
    computeLineItem,
    currencyCodeOf,
    currencySymbolOf,
    DEFAULT_CURRENCY,
    LINE_ITEM_DISCOUNT_TYPE_LABELS,
    LINE_ITEM_LABELS as LABELS,
    LINE_ITEM_TAX_RATE_CATEGORY,
    LINE_ITEM_TAX_RATES,
    LINE_ITEM_TOTAL_LABELS as TOTAL_LABELS,
    newLineItem,
    normalizeTaxRate,
    QUOTATION_CURRENCIES,
    roundMoney,
    totalsOf,
} from '@/lib/line-items';
import { LINE_ITEM_DISCOUNT_TYPES, type LineItemDiscountType } from '@/lib/line-items/lineItemMath';

/**
 * Line items of opportunities and quotations (Jira CRM-111): one editor, one set of fields, labels, API keys and
 * calculations wherever line items are edited (the view page and the drawers read the same values).
 *
 * - One empty line is always there (no "add a product" placeholder); "Add Product Line" adds more.
 * - With more than one line, lines can be dragged by their grip (touch too) and removed; with a single line the grip,
 *   the Action column and its remove button are hidden.
 * - Rate is the product's MRP (not editable); a product without an MRP, or a typed product, takes a typed Rate.
 * - Gross Amount = Quantity × Rate and Taxable Amount = Gross Amount − Discount are computed, never typed. Discount is
 *   a Percentage of the Gross Amount or an Amount off the line (a dropdown beside it); the amount it comes to shows
 *   under a percentage.
 * - GST offers the Product Catalog's Tax Rate options; a product with a Tax Rate sets it and it can't be changed.
 * - Only Discount, Description and Note may be left empty.
 */

export type CrmLineItem = LineItem;
export type CrmLineItemsValues = LineItemsValues;
// Backward compatibility alias
export type CrmLineItemsData = CrmLineItemsValues;

/** Messages of one line's fields (index-aligned with the lines). */
export type LineItemErrors = (Partial<Record<keyof LineItem, string>> | undefined)[];

export interface CrmLineItemsEditorProps {
    value: CrmLineItemsValues;
    onChange: <K extends keyof CrmLineItemsValues>(field: K, val: CrmLineItemsValues[K]) => void;
    /** A message about the line items as a whole. */
    error?: string;
    /** Field messages per line. */
    lineErrors?: LineItemErrors;
    /** Quotations: shows the Currency picker and the amounts in that currency. Opportunities have no currency (₹). */
    withCurrency?: boolean;
}

export interface CrmLineItemsSectionProps {
    value?: CrmLineItemsValues;
    onChange?: <K extends keyof CrmLineItemsValues>(field: K, val: CrmLineItemsValues[K]) => void;
    form?: Partial<CrmLineItemsValues>;
    setField?: <K extends keyof CrmLineItemsValues>(key: K, value: CrmLineItemsValues[K]) => void;
    error?: string;
    withCurrency?: boolean;
}

export { parseTaxRate } from '@/lib/line-items';

export const DEFAULT_LINE_ITEMS_VALUES: CrmLineItemsValues = {
    lineItems: [],
    lumpSumDiscount: 0,
    totalAmount: 0,
    totalDiscount: 0,
    subtotal: 0,
    totalTax: 0,
    grandTotal: 0,
};

const NO_PRODUCTS: Product[] = [];

/** The catalog Rate of a product: its MRP (0 when it has none). */
const catalogRate = (product: Product | undefined): number => Math.max(0, Number(product?.mrp) || 0);
/** The catalog GST of a product: its Tax Rate (blank when it has none). */
const catalogTaxRate = (product: Product | undefined): string => normalizeTaxRate(product?.taxRate);

// Column template: [grip] Quantity | Product | Rate | Gross Amount | Discount | GST | Taxable Amount [| Action]
const COLUMNS = 'minmax(76px, 0.6fr) minmax(220px, 2.4fr) minmax(112px, 1.1fr) minmax(120px, 1.1fr) minmax(140px, 1.1fr) minmax(104px, 0.9fr) minmax(132px, 1.2fr)';
const GRIP_COLUMN = '32px';
const ACTION_COLUMN = '56px';

const headCellSx = { display: 'flex', alignItems: 'center', gap: 0.25, minWidth: 0 } as const;
const requiredMark = (
    <Box component="span" aria-hidden sx={{ color: 'var(--mui-palette-error-main)', fontWeight: 700 }}>
        *
    </Box>
);

/** A computed (never typed) amount: same look in every row. */
const computedSx = (strong = false) => ({
    ...fieldSx,
    '& .MuiOutlinedInput-root': {
        ...fieldSx['& .MuiOutlinedInput-root'],
        backgroundColor: strong ? 'var(--mui-palette-primary-soft)' : 'var(--mui-palette-background-hover)',
    },
    '& .MuiInputBase-input': {
        fontWeight: strong ? 700 : 600,
        color: strong ? 'var(--crm-text-blue-900)' : 'var(--mui-palette-text-primary)',
        textAlign: 'right' as const,
        cursor: 'default',
    },
});

/** A value set by the Product Catalog (Rate from MRP, GST from Tax Rate): read-only, with a lock. */
const lockedSx = {
    ...fieldSx,
    '& .MuiOutlinedInput-root': {
        ...fieldSx['& .MuiOutlinedInput-root'],
        backgroundColor: 'var(--mui-palette-background-hover)',
    },
    '& .MuiInputBase-input': { color: 'var(--mui-palette-text-primary)', cursor: 'default' },
};

const errorOutlineSx = { '& .MuiOutlinedInput-notchedOutline': { borderColor: 'var(--mui-palette-error-main)' } };

const actionButtonSx = {
    width: 32,
    height: 32,
    borderRadius: '6px',
    border: '1px solid var(--mui-palette-border-main)',
    color: 'var(--mui-palette-text-secondary)',
    backgroundColor: 'var(--mui-palette-background-paper)',
    transition: 'all 0.15s ease',
    '&:hover': {
        borderColor: 'var(--crm-blue-300)',
        backgroundColor: 'var(--mui-palette-primary-soft)',
        color: 'var(--crm-text-blue-700)',
    },
    '&.Mui-disabled': { opacity: 0.4 },
} as const;

/** The Percentage / Amount picker inside the Discount field. */
const discountTypeSelectSx = {
    fontSize: '0.82rem',
    fontWeight: 600,
    color: 'var(--mui-palette-text-secondary)',
    '& .MuiSelect-select': { py: 0, pr: '18px !important', pl: 0.5, minWidth: 0 },
    '& .MuiSelect-icon': { fontSize: 18, right: -2 },
    '&:hover': { color: 'var(--crm-text-blue-700)' },
} as const;

const removeButtonSx = {
    ...actionButtonSx,
    '&:hover': {
        color: 'var(--mui-palette-error-main)',
        backgroundColor: 'var(--mui-palette-error-soft)',
        borderColor: 'var(--mui-palette-error-softBorder)',
    },
} as const;

const SummaryRow = ({ label, value, color, strong }: { label: string; value: string; color?: string; strong?: boolean }) => (
    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2 }}>
        <Typography sx={{ fontSize: '0.8rem', color: 'var(--mui-palette-text-secondary)' }}>{label}</Typography>
        <Typography sx={{ fontSize: '0.85rem', fontWeight: strong ? 700 : 600, color: color ?? 'var(--mui-palette-text-primary)', whiteSpace: 'nowrap' }}>{value}</Typography>
    </Box>
);

// ══════════════════════════════════════════════════════════════════════
// COMPONENT A: CrmLineItemsEditor (Pure Controlled UI — Zero RHF Hooks)
// ══════════════════════════════════════════════════════════════════════
export function CrmLineItemsEditor({ value, onChange, error, lineErrors, withCurrency = false }: CrmLineItemsEditorProps) {
    const isView = useFormMode().mode === 'view';
    // Amounts are formatted while rendering: re-render when the company formats change.
    useDisplayFormats();
    const currency = withCurrency ? value.currency || DEFAULT_CURRENCY : undefined;
    const currencyCode = currencyCodeOf(currency);
    const symbol = currencySymbolOf(currency);
    const money = (n: number | undefined) => fmtMoney(n ?? 0, { minDecimals: 0, maxDecimals: 2, currencyCode });

    // One empty line is always there: with no saved lines it is a stand-in that becomes real on the first edit
    // (so opening a form doesn't count as a change).
    const [standIn] = useState(newLineItem);
    const saved = Array.isArray(value.lineItems) ? value.lineItems : [];
    const lines = saved.length > 0 ? saved : [standIn];
    const lumpSumDiscount = value.lumpSumDiscount || 0;
    const totals = totalsOf(saved, lumpSumDiscount);

    const taxOptions = useDropdownOptions(LINE_ITEM_TAX_RATE_CATEGORY, LINE_ITEM_TAX_RATES, 'products');
    const taxLabel = useDropdownOptionLabel(LINE_ITEM_TAX_RATE_CATEGORY);

    // ── Product Catalog ───────────────────────────────────────────────────────────
    const { data: productData } = useProducts();
    const allProducts = productData ?? NO_PRODUCTS;
    const products = useMemo(() => allProducts.filter(isActiveProduct), [allProducts]);
    const productNames = useMemo(() => products.map((p) => p.productName), [products]);
    const productById = useMemo(() => new Map(allProducts.map((p) => [p.id, p])), [allProducts]);
    const productOf = (item: LineItem) => (item.productId ? productById.get(item.productId) : undefined);
    const rateLocked = (item: LineItem) => catalogRate(productOf(item)) > 0;
    const taxLocked = (item: LineItem) => Boolean(catalogTaxRate(productOf(item)));
    // Line whose Product Catalog popup is open.
    const [catalogLine, setCatalogLine] = useState<string | null>(null);

    // ── Writes: lines and the totals always change together ───────────────────────
    const commit = useCallback(
        (items: LineItem[], lumpSum: number = lumpSumDiscount) => {
            const next = totalsOf(items, lumpSum);
            onChange('lineItems', items);
            onChange('totalAmount', next.totalAmount);
            onChange('totalDiscount', next.totalDiscount);
            onChange('subtotal', next.subtotal);
            onChange('totalTax', next.totalTax);
            onChange('grandTotal', next.grandTotal);
        },
        [onChange, lumpSumDiscount],
    );

    const updateLine = (id: string, updates: Partial<LineItem>) =>
        commit(lines.map((item) => (item.id === id ? computeLineItem({ ...item, ...updates }) : item)));
    const addLine = () => commit([...lines, newLineItem()]);
    const removeLine = (id: string) => commit(lines.filter((item) => item.id !== id));
    /** A typed Discount: a percentage stays within 0–100, an amount within the line's Gross Amount. */
    const changeDiscount = (item: LineItem, typed: number) => {
        const max = item.discountType === 'amount' ? item.grossAmount : 100;
        updateLine(item.id, { discount: Math.min(max, Math.max(0, typed)) });
    };
    /** Switching Percentage ⇄ Amount keeps the discount the line already had (12.5% of 8,000 ⇄ 1,000). */
    const changeDiscountType = (item: LineItem, discountType: LineItemDiscountType) => {
        if (discountType === item.discountType) return;
        const discount =
            discountType === 'amount' ? item.discountAmount : item.grossAmount > 0 ? roundMoney((item.discountAmount / item.grossAmount) * 100) : 0;
        updateLine(item.id, { discountType, discount });
    };

    const canReorder = !isView && lines.length > 1;
    const { orderedItems, getRowDragProps } = useDragReorder<LineItem>({
        items: lines,
        canDrag: canReorder,
        onReorder: (ids) => {
            const byId = new Map(lines.map((item) => [item.id, item]));
            const next = ids.map((id) => byId.get(id)).filter((item): item is LineItem => Boolean(item));
            if (next.length === lines.length) commit(next);
        },
    });

    /** Fills the line from a catalog product: name, Rate (MRP), GST (Tax Rate) and, when empty, the description. */
    const selectProduct = (id: string, product: Product) => {
        const line = lines.find((item) => item.id === id);
        if (!line) return;
        const previous = productOf(line);
        const rate = catalogRate(product);
        const taxRate = catalogTaxRate(product);
        updateLine(id, {
            productId: product.id,
            productName: product.productName,
            // A product without an MRP takes a typed Rate: keep one typed before, not the previous product's MRP.
            rate: rate > 0 ? rate : catalogRate(previous) > 0 ? 0 : line.rate,
            taxRate: taxRate || (catalogTaxRate(previous) ? '' : line.taxRate),
            ...(line.description?.trim() ? {} : { description: product.description || '' }),
        });
    };

    /** A typed name: a catalog product's exact name fills the line from it; anything else is a typed product. */
    const changeProductName = (id: string, name: string) => {
        const match = products.find((p) => p.productName.trim().toLowerCase() === name.trim().toLowerCase());
        if (match && name === match.productName) selectProduct(id, match);
        else updateLine(id, { productName: name, productId: '' });
    };

    const clearProduct = (id: string) => {
        const line = lines.find((item) => item.id === id);
        if (!line) return;
        updateLine(id, {
            productName: '',
            productId: '',
            ...(rateLocked(line) ? { rate: 0 } : {}),
            ...(taxLocked(line) ? { taxRate: '' } : {}),
        });
    };

    const changeLumpSum = (lumpSum: number) => {
        onChange('lumpSumDiscount', lumpSum);
        commit(saved, lumpSum);
    };

    if (isView) return <CrmLineItemsReadOnly value={value} withCurrency={withCurrency} />;

    const showActions = lines.length > 1;
    const gridTemplateColumns = [showActions ? GRIP_COLUMN : '', COLUMNS, showActions ? ACTION_COLUMN : ''].filter(Boolean).join(' ');
    const amountHeading = (label: string) => `${label} (${symbol})`;
    const discountTypeSymbol = (type: LineItemDiscountType) => (type === 'amount' ? symbol : '%');

    return (
        <Box sx={{ p: { xs: 2, md: 3 } }}>
            <ProductLookupModal
                open={catalogLine !== null}
                onClose={() => setCatalogLine(null)}
                selectedValue={catalogLine !== null ? lines.find((item) => item.id === catalogLine)?.productName : undefined}
                onSelect={(product) => {
                    if (catalogLine !== null) selectProduct(catalogLine, product);
                    setCatalogLine(null);
                }}
            />
            {error && (
                <Alert severity="error" sx={{ mb: 3 }}>
                    {error}
                </Alert>
            )}

            {withCurrency && (
                <FormField name="currency" label="Currency" size="sm" hint="Currency of this quotation" sx={{ mb: 3 }}>
                    <FormControl size="small" fullWidth sx={fieldSx}>
                        <Select value={currency} onChange={(e) => onChange('currency', e.target.value)}>
                            {[...new Set([...QUOTATION_CURRENCIES, currency ?? DEFAULT_CURRENCY])].map((cur) => (
                                <MenuItem key={cur} value={cur}>
                                    {cur}
                                </MenuItem>
                            ))}
                        </Select>
                    </FormControl>
                </FormField>
            )}

            {/* ════════════ LINE ITEMS ════════════ */}
            <Paper
                variant="outlined"
                sx={{
                    p: { xs: 1.5, sm: 2.5 },
                    borderRadius: '8px',
                    backgroundColor: 'var(--mui-palette-background-paper)',
                    border: '1px solid var(--mui-palette-border-strong)',
                    mb: 4,
                    minWidth: 0,
                }}
            >
                <Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1, mb: 2 }}>
                    <Typography sx={{ fontSize: '0.92rem', fontWeight: 700, color: 'var(--mui-palette-text-primary)' }}>Line Items</Typography>
                    {showActions && (
                        <Typography sx={{ fontSize: '0.74rem', color: 'var(--mui-palette-text-muted)' }}>Drag a line by its grip, or use the arrows, to reorder</Typography>
                    )}
                </Box>

                {/* The lines scroll sideways inside this box on narrow screens, never the page. */}
                <Box sx={{ overflowX: 'auto', mb: 2 }}>
                    <Box sx={{ minWidth: showActions ? 1120 : 960 }}>
                        <Box
                            sx={{
                                display: 'grid',
                                gridTemplateColumns,
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
                            {showActions && <Box />}
                            <Box sx={headCellSx}>
                                {LABELS.quantity}
                                {requiredMark}
                            </Box>
                            <Box sx={headCellSx}>
                                {LABELS.productName}
                                {requiredMark}
                            </Box>
                            <Box sx={{ ...headCellSx, justifyContent: 'flex-end' }}>
                                {amountHeading(LABELS.rate)}
                                {requiredMark}
                            </Box>
                            <Box sx={{ ...headCellSx, justifyContent: 'flex-end' }}>{amountHeading(LABELS.grossAmount)}</Box>
                            <Box sx={headCellSx}>{LABELS.discount}</Box>
                            <Box sx={headCellSx}>
                                {LABELS.taxRate}
                                {requiredMark}
                            </Box>
                            <Box sx={{ ...headCellSx, justifyContent: 'flex-end' }}>{amountHeading(LABELS.taxableAmount)}</Box>
                            {showActions && <Box sx={{ ...headCellSx, justifyContent: 'center' }}>Action</Box>}
                        </Box>

                        {orderedItems.map((item, idx) => {
                            const index = lines.findIndex((line) => line.id === item.id);
                            const errs = lineErrors?.[index] ?? {};
                            const lockedRate = rateLocked(item);
                            const lockedTax = taxLocked(item);
                            const drag = getRowDragProps(item);
                            const taxChoices = item.taxRate && !taxOptions.includes(item.taxRate) ? [...taxOptions, item.taxRate] : taxOptions;
                            return (
                                <Box
                                    key={item.id}
                                    ref={drag.ref}
                                    data-line-item={item.id}
                                    sx={{
                                        border: '1px solid var(--mui-palette-border-main)',
                                        borderTop: idx > 0 ? 'none' : '1px solid var(--mui-palette-border-main)',
                                        borderRadius: idx === orderedItems.length - 1 ? '0 0 6px 6px' : 0,
                                        p: 1.5,
                                        backgroundColor: 'var(--mui-palette-background-paper)',
                                    }}
                                >
                                    <Box sx={{ display: 'grid', gridTemplateColumns, gap: 1.5, alignItems: 'start', mb: 1.5 }}>
                                        {showActions && (
                                            <Tooltip title="Drag to reorder">
                                                <Box
                                                    onPointerDown={drag.onPointerDown}
                                                    aria-label={`Drag line ${idx + 1} to reorder`}
                                                    sx={{
                                                        height: 40,
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                        borderRadius: '6px',
                                                        color: 'var(--mui-palette-text-muted)',
                                                        cursor: 'grab',
                                                        // The grip alone starts a touch drag; a swipe anywhere else still scrolls.
                                                        touchAction: 'none',
                                                        '&:hover': { color: 'var(--crm-text-blue-700)', backgroundColor: 'var(--mui-palette-primary-soft)' },
                                                    }}
                                                >
                                                    <DragIndicatorIcon sx={{ fontSize: 20 }} />
                                                </Box>
                                            </Tooltip>
                                        )}

                                        {/* Quantity */}
                                        <Box data-field={`lineItems.${index}.quantity`} sx={{ minWidth: 0 }}>
                                            <TextField
                                                size="small"
                                                type="number"
                                                fullWidth
                                                value={item.quantity}
                                                onChange={(e) => updateLine(item.id, { quantity: Math.max(1, parseInt(e.target.value, 10) || 1) })}
                                                error={Boolean(errs.quantity)}
                                                slotProps={{ htmlInput: { min: 1, 'aria-label': LABELS.quantity } }}
                                                sx={fieldSx}
                                            />
                                            {errs.quantity && <FormHelperText error>{errs.quantity}</FormHelperText>}
                                        </Box>

                                        {/* Product: type a name or pick from the Product Catalog popup */}
                                        <Box data-field={`lineItems.${index}.productName`} sx={{ minWidth: 0, ...(errs.productName ? errorOutlineSx : {}) }}>
                                            <LookupField
                                                value={item.productName || ''}
                                                onChange={(name) => changeProductName(item.id, name)}
                                                options={productNames}
                                                placeholder="Type or pick a product"
                                                onLookupClick={() => setCatalogLine(item.id)}
                                                lookupTooltip="Open Product Catalog"
                                                onClear={() => clearProduct(item.id)}
                                                maxLength={FIELD_MAX_LENGTH.organizationName}
                                                required
                                            />
                                            {errs.productName && <FormHelperText error>{errs.productName}</FormHelperText>}
                                        </Box>

                                        {/* Rate: the product's MRP (locked), or typed for a product without one */}
                                        <Box data-field={`lineItems.${index}.rate`} sx={{ minWidth: 0 }}>
                                            <Tooltip title={lockedRate ? 'Rate is the product’s MRP in the Product Catalog' : ''} placement="top">
                                                <TextField
                                                    size="small"
                                                    type={lockedRate ? 'text' : 'number'}
                                                    fullWidth
                                                    value={lockedRate ? fmtNumber(item.rate, { maxDecimals: 2 }) : item.rate === 0 ? '' : item.rate}
                                                    placeholder="0"
                                                    onChange={(e) => {
                                                        if (lockedRate) return;
                                                        updateLine(item.id, { rate: Math.max(0, parseFloat(e.target.value) || 0) });
                                                    }}
                                                    error={Boolean(errs.rate)}
                                                    slotProps={{
                                                        htmlInput: { min: 0, step: 'any', readOnly: lockedRate, 'aria-label': LABELS.rate, style: { textAlign: 'right' } },
                                                        input: lockedRate
                                                            ? {
                                                                  startAdornment: (
                                                                      <InputAdornment position="start">
                                                                          <LockOutlinedIcon sx={{ fontSize: 14, color: 'var(--mui-palette-text-muted)' }} />
                                                                      </InputAdornment>
                                                                  ),
                                                              }
                                                            : undefined,
                                                    }}
                                                    sx={lockedRate ? lockedSx : fieldSx}
                                                />
                                            </Tooltip>
                                            {errs.rate && <FormHelperText error>{errs.rate}</FormHelperText>}
                                        </Box>

                                        {/* Gross Amount = Quantity × Rate */}
                                        <TextField
                                            size="small"
                                            fullWidth
                                            value={fmtNumber(item.grossAmount, { maxDecimals: 2 })}
                                            slotProps={{ htmlInput: { readOnly: true, tabIndex: -1, 'aria-label': LABELS.grossAmount } }}
                                            sx={computedSx()}
                                        />

                                        {/* Discount: a Percentage of the Gross Amount or an Amount off the line, picked beside it */}
                                        <Box data-field={`lineItems.${index}.discount`} sx={{ minWidth: 0 }}>
                                            <TextField
                                                size="small"
                                                type="number"
                                                fullWidth
                                                value={item.discount === 0 ? '' : item.discount}
                                                placeholder="0"
                                                onChange={(e) => changeDiscount(item, parseFloat(e.target.value) || 0)}
                                                error={Boolean(errs.discount)}
                                                slotProps={{
                                                    htmlInput: {
                                                        min: 0,
                                                        max: item.discountType === 'amount' ? item.grossAmount : 100,
                                                        step: 'any',
                                                        'aria-label': `${LABELS.discount} (${discountTypeSymbol(item.discountType)})`,
                                                    },
                                                    input: {
                                                        endAdornment: (
                                                            <InputAdornment position="end" sx={{ ml: 0.5 }}>
                                                                <Select
                                                                    variant="standard"
                                                                    disableUnderline
                                                                    value={item.discountType ?? 'percentage'}
                                                                    onChange={(e) => changeDiscountType(item, e.target.value as LineItemDiscountType)}
                                                                    renderValue={(type) => discountTypeSymbol(type)}
                                                                    inputProps={{ 'aria-label': `${LABELS.discount} type` }}
                                                                    sx={discountTypeSelectSx}
                                                                >
                                                                    {LINE_ITEM_DISCOUNT_TYPES.map((type) => (
                                                                        <MenuItem key={type} value={type}>
                                                                            {LINE_ITEM_DISCOUNT_TYPE_LABELS[type]} ({discountTypeSymbol(type)})
                                                                        </MenuItem>
                                                                    ))}
                                                                </Select>
                                                            </InputAdornment>
                                                        ),
                                                    },
                                                }}
                                                sx={fieldSx}
                                            />
                                            {errs.discount ? (
                                                <FormHelperText error>{errs.discount}</FormHelperText>
                                            ) : item.discountType === 'percentage' && item.discountAmount > 0 ? (
                                                <FormHelperText sx={{ color: 'var(--mui-palette-error-main)', whiteSpace: 'nowrap' }}>− {money(item.discountAmount)}</FormHelperText>
                                            ) : null}
                                        </Box>

                                        {/* GST: the Product Catalog's Tax Rate options; set by the product when it has one */}
                                        <Box data-field={`lineItems.${index}.taxRate`} sx={{ minWidth: 0 }}>
                                            <Tooltip title={lockedTax ? 'GST is the product’s Tax Rate in the Product Catalog' : ''} placement="top">
                                                <FormControl size="small" fullWidth error={Boolean(errs.taxRate)} sx={lockedTax ? lockedSx : fieldSx}>
                                                    <Select
                                                        value={item.taxRate}
                                                        displayEmpty
                                                        readOnly={lockedTax}
                                                        IconComponent={lockedTax ? () => <LockOutlinedIcon sx={{ fontSize: 14, mr: 1.25, color: 'var(--mui-palette-text-muted)' }} /> : undefined}
                                                        onChange={(e) => updateLine(item.id, { taxRate: e.target.value })}
                                                        renderValue={(selected) =>
                                                            selected ? taxLabel(selected) : <Box component="span" sx={{ color: 'var(--mui-palette-text-muted)' }}>Select</Box>
                                                        }
                                                        inputProps={{ 'aria-label': LABELS.taxRate }}
                                                    >
                                                        {taxChoices.map((rate) => (
                                                            <MenuItem key={rate} value={rate}>
                                                                {taxLabel(rate)}
                                                            </MenuItem>
                                                        ))}
                                                    </Select>
                                                </FormControl>
                                            </Tooltip>
                                            {errs.taxRate && <FormHelperText error>{errs.taxRate}</FormHelperText>}
                                        </Box>

                                        {/* Taxable Amount = Gross Amount − Discount */}
                                        <TextField
                                            size="small"
                                            fullWidth
                                            value={fmtNumber(item.taxableAmount, { maxDecimals: 2 })}
                                            slotProps={{ htmlInput: { readOnly: true, tabIndex: -1, 'aria-label': LABELS.taxableAmount } }}
                                            sx={computedSx(true)}
                                        />

                                        {showActions && (
                                            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 40 }}>
                                                <Tooltip title="Remove line">
                                                    <IconButton size="small" aria-label="Remove line" onClick={() => removeLine(item.id)} sx={removeButtonSx}>
                                                        <ClearIcon sx={{ fontSize: 16 }} />
                                                    </IconButton>
                                                </Tooltip>
                                            </Box>
                                        )}
                                    </Box>

                                    {/* Description and Note (optional) under each line */}
                                    <Box
                                        sx={{
                                            display: 'grid',
                                            gridTemplateColumns: '1fr 1fr',
                                            gap: 2,
                                            pt: 1,
                                            pl: showActions ? 5.5 : 0,
                                            borderTop: '1px dashed var(--mui-palette-border-main)',
                                        }}
                                    >
                                        <Box data-field={`lineItems.${index}.description`}>
                                            <Typography sx={{ fontSize: '0.72rem', color: 'var(--mui-palette-text-secondary)', mb: 0.5 }}>{LABELS.description}</Typography>
                                            <TextField
                                                fullWidth
                                                size="small"
                                                multiline
                                                rows={2}
                                                placeholder="Line item scope or package specifications..."
                                                value={item.description || ''}
                                                onChange={(e) => updateLine(item.id, { description: e.target.value })}
                                                error={Boolean(errs.description)}
                                                helperText={errs.description}
                                                slotProps={{ htmlInput: { maxLength: FIELD_MAX_LENGTH.longText } }}
                                                sx={fieldSx}
                                            />
                                        </Box>
                                        <Box data-field={`lineItems.${index}.note`}>
                                            <Typography sx={{ fontSize: '0.72rem', color: 'var(--mui-palette-text-secondary)', mb: 0.5 }}>{LABELS.note}</Typography>
                                            <TextField
                                                fullWidth
                                                size="small"
                                                multiline
                                                rows={2}
                                                placeholder="Internal notes, discount justifications, or terms..."
                                                value={item.note || ''}
                                                onChange={(e) => updateLine(item.id, { note: e.target.value })}
                                                error={Boolean(errs.note)}
                                                helperText={errs.note}
                                                slotProps={{ htmlInput: { maxLength: FIELD_MAX_LENGTH.longText } }}
                                                sx={fieldSx}
                                            />
                                        </Box>
                                    </Box>
                                </Box>
                            );
                        })}
                    </Box>
                </Box>

                <Button
                    variant="contained"
                    startIcon={<AddIcon />}
                    onClick={addLine}
                    sx={{
                        backgroundColor: 'var(--crm-fill-blue-600)',
                        color: '#ffffff',
                        textTransform: 'none',
                        fontWeight: 700,
                        fontSize: '0.8rem',
                        px: 2.2,
                        py: 0.8,
                        borderRadius: '6px',
                        boxShadow: 'none',
                        '&:hover': { backgroundColor: 'var(--crm-fill-blue-700)', boxShadow: '0 4px 14px rgb(var(--crm-accent-rgb) / 0.28)' },
                    }}
                >
                    Add Product Line
                </Button>
            </Paper>

            {/* ════════════ SUMMARY & TOTALS ════════════ */}
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'repeat(2, minmax(0, 1fr))' }, gap: 3 }}>
                <Paper
                    variant="outlined"
                    sx={{ p: 2.5, borderRadius: '8px', border: '1px solid var(--mui-palette-border-strong)', backgroundColor: 'var(--mui-palette-background-paper)' }}
                >
                    <Typography sx={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--crm-slate-700)', mb: 2 }}>Overall Deal Adjustments</Typography>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                        <SummaryRow label={TOTAL_LABELS.totalAmount} value={money(totals.totalAmount)} />
                        <SummaryRow label={TOTAL_LABELS.totalDiscount} value={`− ${money(totals.totalDiscount)}`} color="var(--mui-palette-error-main)" />
                        <Box data-field="lumpSumDiscount" sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap' }}>
                            <Typography sx={{ fontSize: '0.8rem', color: 'var(--mui-palette-text-secondary)' }}>{TOTAL_LABELS.lumpSumDiscount}</Typography>
                            <TextField
                                size="small"
                                type="number"
                                value={lumpSumDiscount === 0 ? '' : lumpSumDiscount}
                                placeholder="0"
                                onChange={(e) => changeLumpSum(Math.max(0, parseFloat(e.target.value) || 0))}
                                sx={{ width: FIELD_SIZE_WIDTH.xs, maxWidth: '100%', ...fieldSx }}
                                slotProps={{
                                    htmlInput: { min: 0, step: 'any', 'aria-label': TOTAL_LABELS.lumpSumDiscount },
                                    input: { startAdornment: <InputAdornment position="start">{symbol}</InputAdornment> },
                                }}
                            />
                        </Box>
                    </Box>
                </Paper>

                <Paper
                    variant="outlined"
                    sx={{ p: 2.5, borderRadius: '8px', border: '1.5px solid var(--mui-palette-primary-softBorder)', backgroundColor: 'var(--mui-palette-background-subtle)' }}
                >
                    <Typography sx={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--crm-text-blue-900)', mb: 2 }}>Summary Breakdown</Typography>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.2 }}>
                        <SummaryRow label={TOTAL_LABELS.totalAmount} value={money(totals.totalAmount)} />
                        <SummaryRow label={TOTAL_LABELS.totalDiscount} value={`− ${money(totals.totalDiscount)}`} color="var(--mui-palette-error-main)" />
                        <SummaryRow label={TOTAL_LABELS.subtotal} value={money(totals.subtotal)} strong />
                        <SummaryRow label={TOTAL_LABELS.totalTax} value={`+ ${money(totals.totalTax)}`} color="var(--crm-text-blue-600)" />
                        {lumpSumDiscount > 0 && (
                            <SummaryRow label={TOTAL_LABELS.lumpSumDiscount} value={`− ${money(lumpSumDiscount)}`} color="var(--mui-palette-error-main)" />
                        )}
                        <Divider sx={{ my: 0.5 }} />
                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2 }}>
                            <Typography sx={{ fontSize: '0.92rem', fontWeight: 800, color: 'var(--crm-slate-900)' }}>{TOTAL_LABELS.grandTotal}</Typography>
                            <Typography sx={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--crm-green-700)', whiteSpace: 'nowrap' }}>{money(totals.grandTotal)}</Typography>
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

const messageOf = (value: unknown): string | undefined =>
    value && typeof value === 'object' && 'message' in value && typeof (value as { message?: unknown }).message === 'string'
        ? (value as { message: string }).message
        : undefined;

/** RHF's `errors.lineItems` as one message for the list and field messages per line. */
function splitLineItemErrors(errors: FieldErrors<CrmLineItemsValues>['lineItems']): { error?: string; lineErrors: LineItemErrors } {
    if (!errors) return { lineErrors: [] };
    const list = errors as unknown as Record<string, unknown> & { root?: unknown };
    const lineErrors: LineItemErrors = [];
    for (const [key, entry] of Object.entries(list)) {
        if (!/^\d+$/.test(key) || !entry || typeof entry !== 'object') continue;
        const fields: Partial<Record<keyof LineItem, string>> = {};
        for (const [field, fieldError] of Object.entries(entry as Record<string, unknown>)) {
            const message = messageOf(fieldError);
            if (message) fields[field as keyof LineItem] = message;
        }
        lineErrors[Number(key)] = fields;
    }
    return { error: messageOf(list) ?? messageOf(list.root), lineErrors };
}

function RhfLineItemsConnected({ withCurrency = false }: { withCurrency?: boolean }) {
    const { control, setValue } = useFormContext<CrmLineItemsValues>();
    const { errors, isSubmitted } = useFormState({ control, name: 'lineItems' });

    const currency = useWatch({ control, name: 'currency' });
    const lineItems = useWatch({ control, name: 'lineItems' });
    const lumpSumDiscount = useWatch({ control, name: 'lumpSumDiscount' });

    const currentValue: CrmLineItemsValues = {
        ...(withCurrency ? { currency: currency || DEFAULT_CURRENCY } : {}),
        lineItems: Array.isArray(lineItems) ? lineItems : [],
        lumpSumDiscount: typeof lumpSumDiscount === 'number' ? lumpSumDiscount : 0,
    };

    const handleChange = useCallback(
        <K extends keyof CrmLineItemsValues>(field: K, val: CrmLineItemsValues[K]) => {
            setValue(field as unknown as Path<CrmLineItemsValues>, val as unknown as PathValue<CrmLineItemsValues, Path<CrmLineItemsValues>>, {
                shouldDirty: true,
                // Lines are checked on save; after a failed save, every edit re-checks so fixed fields clear at once.
                shouldValidate: isSubmitted,
            });
        },
        [setValue, isSubmitted],
    );

    const { error, lineErrors } = splitLineItemErrors(errors.lineItems);
    return <CrmLineItemsEditor value={currentValue} onChange={handleChange} error={error} lineErrors={lineErrors} withCurrency={withCurrency} />;
}

export function RhfLineItemsSection({ withCurrency = false }: { withCurrency?: boolean } = {}) {
    const rhfContext = useFormContext<CrmLineItemsValues>();
    if (!rhfContext) return null;
    return <RhfLineItemsConnected withCurrency={withCurrency} />;
}

// ══════════════════════════════════════════════════════════════════════
// SAFE HYBRID WRAPPER: CrmLineItemsSection
// ══════════════════════════════════════════════════════════════════════
export function CrmLineItemsSection(props: CrmLineItemsSectionProps = {}) {
    const rhfContext = useFormContext<CrmLineItemsValues>();
    const withCurrency = props.withCurrency ?? false;

    // 1. If explicit value and onChange are provided, render pure controlled component
    if (props.value && props.onChange) {
        return <CrmLineItemsEditor value={props.value} onChange={props.onChange} error={props.error} withCurrency={withCurrency} />;
    }

    // 2. If legacy form & setField are provided, adapt without RHF
    if (props.form && props.setField) {
        const legacyValue: CrmLineItemsValues = {
            ...(withCurrency ? { currency: props.form.currency || DEFAULT_CURRENCY } : {}),
            lineItems: Array.isArray(props.form.lineItems) ? props.form.lineItems : [],
            lumpSumDiscount: props.form.lumpSumDiscount || 0,
        };
        return <CrmLineItemsEditor value={legacyValue} onChange={props.setField} error={props.error} withCurrency={withCurrency} />;
    }

    // 3. If within a FormProvider, delegate to the RHF connected wrapper
    if (rhfContext) {
        return <RhfLineItemsConnected withCurrency={withCurrency} />;
    }

    // 4. Fallback safe editor if neither context nor props are supplied
    return <CrmLineItemsEditor value={DEFAULT_LINE_ITEMS_VALUES} onChange={() => {}} error={props.error} withCurrency={withCurrency} />;
}

export default CrmLineItemsSection;
