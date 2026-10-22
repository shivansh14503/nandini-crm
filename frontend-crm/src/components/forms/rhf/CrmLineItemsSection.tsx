'use client';

import React, { useCallback } from 'react';
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

// Product catalog for quick autocomplete / selection in the line items
export const PRODUCT_CATALOG: { name: string; defaultPrice: number; category: string }[] = [
    { name: 'TallyPrime Silver (Single User)', defaultPrice: 22500, category: 'Tally' },
    { name: 'TallyPrime Gold (Multi User)', defaultPrice: 67500, category: 'Tally' },
    { name: 'Tally Software Services (TSS) Renewal - Gold', defaultPrice: 15750, category: 'Tally' },
    { name: 'Tally Software Services (TSS) Renewal - Silver', defaultPrice: 5250, category: 'Tally' },
    { name: 'Biz Analyst Mobile App (Annual - 5 Users)', defaultPrice: 12000, category: 'Biz Analyst' },
    { name: 'CredFlow Credit Management Cloud Platform', defaultPrice: 36000, category: 'CredFlow' },
    { name: 'Acronis Cyber Protect Cloud Standard (500GB)', defaultPrice: 42000, category: 'Acronis' },
    { name: 'Connect 21 Multi-Branch Sync Engine', defaultPrice: 18500, category: 'Connect 21' },
    { name: 'WhatsApp Automation for Tally Invoicing', defaultPrice: 14500, category: 'Automation' },
    { name: 'Implementation & Custom Workflow Engineering', defaultPrice: 35000, category: 'Services' },
];

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
            productId: 'prod-tally',
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

    // ── Select product from catalog ─────────────────────────────────────────────
    const handleSelectProduct = (index: number, productName: string) => {
        const found = PRODUCT_CATALOG.find((p) => p.name === productName);
        const amount = found ? found.defaultPrice : 0;
        handleUpdateLineItem(index, {
            productName,
            amount,
            salePrice: amount,
            taxRate: 'GST 18%',
        });
    };

    // ── Handle lump sum discount update ─────────────────────────────────────────
    const handleLumpSumChange = (val: number) => {
        onChange('lumpSumDiscount', val);
        recalculateTotals(lineItems, val);
    };

    return (
        <Box sx={{ p: { xs: 2, md: 3 } }}>
            {error && (
                <Alert severity="error" sx={{ mb: 3 }}>
                    {error}
                </Alert>
            )}

            {/* ════════════ TOP SETTINGS (Currency) ════════════ */}
            <Box sx={{ maxWidth: { xs: '100%', sm: 400 }, mb: 3 }}>
                <FormField label="Currency" hint="Base billing currency">
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
            </Box>

            {/* ════════════ LINE ITEMS SECTION ════════════ */}
            <Paper
                variant="outlined"
                sx={{
                    p: 2.5,
                    borderRadius: '8px',
                    backgroundColor: '#ffffff',
                    border: '1px solid #cbd5e1',
                    mb: 4,
                }}
            >
                <Typography sx={{ fontSize: '0.92rem', fontWeight: 700, color: '#1e293b', mb: 2 }}>
                    Line Items
                </Typography>

                {/* Group Name input */}
                <Box sx={{ maxWidth: 500, mb: 3 }}>
                    <FormField label="Group Name" hint="Logical bundle name (e.g. Products / Software / AMC)">
                        <TextField
                            fullWidth
                            size="small"
                            value={groupName}
                            onChange={(e) => onChange('groupName', e.target.value)}
                            placeholder="e.g. Software Licenses & Add-ons"
                            sx={fieldSx}
                        />
                    </FormField>
                </Box>

                {/* Dynamic Line items table container */}
                <Box sx={{ overflowX: 'auto', mb: 2 }}>
                    {lineItems.length === 0 ? (
                        <Box
                            sx={{
                                p: 4,
                                textAlign: 'center',
                                backgroundColor: '#f8fafc',
                                border: '1px dashed #cbd5e1',
                                borderRadius: '8px',
                            }}
                        >
                            <Typography sx={{ fontSize: '0.86rem', color: '#64748b', mb: 1.5 }}>
                                No product line items added yet. Click below to add products or services.
                            </Typography>
                            <Button
                                variant="contained"
                                startIcon={<AddIcon />}
                                onClick={handleAddLineItem}
                                sx={{
                                    backgroundColor: '#1e3a8a',
                                    color: '#ffffff',
                                    textTransform: 'none',
                                    fontWeight: 700,
                                    fontSize: '0.82rem',
                                    px: 2.5,
                                    '&:hover': { backgroundColor: '#1d4ed8' },
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
                                    backgroundColor: '#f1f5f9',
                                    borderRadius: '6px 6px 0 0',
                                    border: '1px solid #e2e8f0',
                                    borderBottom: 'none',
                                    fontSize: '0.74rem',
                                    fontWeight: 700,
                                    color: '#475569',
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
                                        border: '1px solid #e2e8f0',
                                        borderTop: idx > 0 ? 'none' : '1px solid #e2e8f0',
                                        p: 1.5,
                                        backgroundColor: idx % 2 === 0 ? '#ffffff' : '#fafafa',
                                        '&:hover': { backgroundColor: '#f8fafc' },
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

                                        {/* Product Lookup / Select */}
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                            <FormControl size="small" fullWidth sx={fieldSx}>
                                                <Select
                                                    value={item.productName || ''}
                                                    displayEmpty
                                                    onChange={(e) => handleSelectProduct(idx, e.target.value)}
                                                >
                                                    <MenuItem value="" disabled>
                                                        -- Select Product --
                                                    </MenuItem>
                                                    {PRODUCT_CATALOG.map((p) => (
                                                        <MenuItem key={p.name} value={p.name}>
                                                            {p.name}
                                                        </MenuItem>
                                                    ))}
                                                </Select>
                                            </FormControl>
                                        </Box>

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
                                            value={item.salePrice.toLocaleString('en-IN')}
                                            disabled
                                            sx={{
                                                ...fieldSx,
                                                '& .MuiInputBase-input': {
                                                    fontWeight: 600,
                                                    color: '#1e293b',
                                                    backgroundColor: '#f1f5f9',
                                                },
                                            }}
                                        />

                                        {/* Tax Amount + Tax Rate selector */}
                                        <Box sx={{ display: 'flex', gap: 0.5 }}>
                                            <TextField
                                                size="small"
                                                value={item.taxAmount.toLocaleString('en-IN')}
                                                disabled
                                                sx={{
                                                    flex: 1,
                                                    ...fieldSx,
                                                    '& .MuiInputBase-input': {
                                                        fontWeight: 600,
                                                        backgroundColor: '#f1f5f9',
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
                                            value={item.total.toLocaleString('en-IN')}
                                            disabled
                                            sx={{
                                                ...fieldSx,
                                                '& .MuiInputBase-input': {
                                                    fontWeight: 700,
                                                    color: '#1e3a8a',
                                                    backgroundColor: '#eff6ff',
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
                                                        backgroundColor: '#1e3a8a',
                                                        color: '#ffffff',
                                                        borderRadius: '4px',
                                                        '&:hover': { backgroundColor: '#b91c1c' },
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
                                            borderTop: '1px dashed #e2e8f0',
                                        }}
                                    >
                                        <Box>
                                            <Typography sx={{ fontSize: '0.72rem', color: '#64748b', mb: 0.5 }}>
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
                                                sx={fieldSx}
                                            />
                                        </Box>
                                        <Box>
                                            <Typography sx={{ fontSize: '0.72rem', color: '#64748b', mb: 0.5 }}>
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
                                                sx={fieldSx}
                                            />
                                        </Box>
                                    </Box>
                                </Box>
                            ))}
                        </Box>
                    )}
                </Box>

                {/* + ADD PRODUCT LINE Button */}
                <Button
                    variant="contained"
                    startIcon={<AddIcon />}
                    onClick={handleAddLineItem}
                    sx={{
                        backgroundColor: '#1e3a8a',
                        color: '#ffffff',
                        textTransform: 'uppercase',
                        fontWeight: 700,
                        fontSize: '0.76rem',
                        letterSpacing: '0.04em',
                        px: 2.2,
                        py: 0.8,
                        borderRadius: '4px',
                        '&:hover': { backgroundColor: '#1d4ed8' },
                    }}
                >
                    ADD PRODUCT LINE
                </Button>
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
                        border: '1px solid #cbd5e1',
                        backgroundColor: '#ffffff',
                    }}
                >
                    <Typography sx={{ fontSize: '0.85rem', fontWeight: 700, color: '#334155', mb: 2 }}>
                        Overall Deal Adjustments
                    </Typography>

                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <Typography sx={{ fontSize: '0.8rem', color: '#64748b' }}>Total Gross:</Typography>
                            <Typography sx={{ fontSize: '0.85rem', fontWeight: 600, color: '#1e293b' }}>
                                ₹{totalAmount.toLocaleString('en-IN')}
                            </Typography>
                        </Box>
                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <Typography sx={{ fontSize: '0.8rem', color: '#64748b' }}>Item Discounts:</Typography>
                            <Typography sx={{ fontSize: '0.85rem', fontWeight: 600, color: '#dc2626' }}>
                                - ₹{totalDiscount.toLocaleString('en-IN')}
                            </Typography>
                        </Box>
                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <Typography sx={{ fontSize: '0.8rem', color: '#64748b' }}>Lump Sum Discount:</Typography>
                            <TextField
                                size="small"
                                type="number"
                                value={lumpSumDiscount}
                                onChange={(e) => handleLumpSumChange(parseFloat(e.target.value) || 0)}
                                sx={{ width: 140, ...fieldSx }}
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
                        border: '1.5px solid #bfdbfe',
                        backgroundColor: '#f8fafc',
                    }}
                >
                    <Typography sx={{ fontSize: '0.85rem', fontWeight: 700, color: '#1e3a8a', mb: 2 }}>
                        Summary Breakdown
                    </Typography>

                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.2 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <Typography sx={{ fontSize: '0.8rem', color: '#64748b' }}>Total:</Typography>
                            <Typography sx={{ fontSize: '0.85rem', fontWeight: 600 }}>
                                ₹{totalAmount.toLocaleString('en-IN')}
                            </Typography>
                        </Box>
                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <Typography sx={{ fontSize: '0.8rem', color: '#64748b' }}>Discount:</Typography>
                            <Typography sx={{ fontSize: '0.85rem', fontWeight: 600, color: '#dc2626' }}>
                                - ₹{totalDiscount.toLocaleString('en-IN')}
                            </Typography>
                        </Box>
                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <Typography sx={{ fontSize: '0.8rem', color: '#64748b' }}>Subtotal:</Typography>
                            <Typography sx={{ fontSize: '0.85rem', fontWeight: 700 }}>
                                ₹{subtotal.toLocaleString('en-IN')}
                            </Typography>
                        </Box>
                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <Typography sx={{ fontSize: '0.8rem', color: '#64748b' }}>Tax:</Typography>
                            <Typography sx={{ fontSize: '0.85rem', fontWeight: 600, color: '#2563eb' }}>
                                + ₹{totalTax.toLocaleString('en-IN')}
                            </Typography>
                        </Box>
                        <Divider sx={{ my: 0.5 }} />
                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <Typography sx={{ fontSize: '0.92rem', fontWeight: 800, color: '#0f172a' }}>
                                Grand Total:
                            </Typography>
                            <Typography sx={{ fontSize: '1.15rem', fontWeight: 800, color: '#15803d' }}>
                                ₹{grandTotal.toLocaleString('en-IN')}
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
