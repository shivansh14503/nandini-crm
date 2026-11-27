'use client';

import React from 'react';
import { Box, Divider, Paper, Table, TableBody, TableCell, TableHead, TableRow, Typography } from '@mui/material';
import { ReadOnlyField } from '../ReadOnlyField';
import type { LineItemsValues } from '@/types/lineItem.types';
import { useDropdownOptionLabel } from '@/hooks/queries/useFormConfigs';
import { fmtMoney, fmtNumber } from '@/utils/formats';
import { currencyCodeOf, DEFAULT_CURRENCY, LINE_ITEM_LABELS as LABELS, LINE_ITEM_TAX_RATE_CATEGORY, LINE_ITEM_TOTAL_LABELS as TOTAL_LABELS, totalsOf } from '@/lib/line-items';

const headCellSx = {
    fontSize: '0.7rem',
    fontWeight: 700,
    color: 'var(--mui-palette-text-secondary)',
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    backgroundColor: 'var(--mui-palette-background-subtle)',
    whiteSpace: 'nowrap',
} as const;

const cellSx = { fontSize: '0.84rem', color: 'var(--mui-palette-text-primary)', whiteSpace: 'nowrap' } as const;

const SummaryRow = ({ label, value, color, bold }: { label: string; value: string; color?: string; bold?: boolean }) => (
    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 2 }}>
        <Typography sx={{ fontSize: '0.8rem', color: 'var(--mui-palette-text-secondary)' }}>{label}</Typography>
        <Typography sx={{ fontSize: '0.86rem', fontWeight: bold ? 800 : 600, color: color ?? 'var(--crm-slate-900)', whiteSpace: 'nowrap' }}>{value}</Typography>
    </Box>
);

/**
 * Plain-text presentation of a record's line items and totals (view pages): the same columns, labels and totals as
 * the editor (Jira CRM-111), with no inputs, buttons or selects.
 */
export function CrmLineItemsReadOnly({ value, withCurrency = false }: { value: LineItemsValues; withCurrency?: boolean }) {
    const items = Array.isArray(value.lineItems) ? value.lineItems : [];
    const taxLabel = useDropdownOptionLabel(LINE_ITEM_TAX_RATE_CATEGORY);
    const currency = withCurrency ? value.currency || DEFAULT_CURRENCY : undefined;
    const currencyCode = currencyCodeOf(currency);
    const money = (n: number | undefined) => fmtMoney(n ?? 0, { minDecimals: 0, maxDecimals: 2, currencyCode });
    // The record's saved totals (what lists and scorecards show); computed from the lines when a value is missing.
    const computed = totalsOf(items, value.lumpSumDiscount || 0);
    const stored = (key: keyof typeof computed) => (typeof value[key] === 'number' ? (value[key] as number) : computed[key]);
    const totals =
        items.length > 0
            ? { totalAmount: stored('totalAmount'), totalDiscount: stored('totalDiscount'), subtotal: stored('subtotal'), totalTax: stored('totalTax'), grandTotal: stored('grandTotal') }
            : null;
    const showDiscount = items.some((i) => i.discount > 0);

    return (
        <Box sx={{ p: { xs: 2, md: 3 }, display: 'flex', flexDirection: 'column', gap: 3 }}>
            {withCurrency && (
                <Box sx={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                    <ReadOnlyField label="Currency" value={currency} hideWhenEmpty />
                </Box>
            )}

            {items.length === 0 ? (
                <Typography sx={{ fontSize: '0.86rem', color: 'var(--mui-palette-text-muted)' }}>No line items on this record.</Typography>
            ) : (
                <Paper variant="outlined" sx={{ borderRadius: '10px', borderColor: 'var(--mui-palette-border-main)', overflowX: 'auto' }}>
                    <Table size="small">
                        <TableHead>
                            <TableRow>
                                <TableCell sx={headCellSx}>{LABELS.productName}</TableCell>
                                <TableCell sx={headCellSx} align="right">{LABELS.quantity}</TableCell>
                                <TableCell sx={headCellSx} align="right">{LABELS.rate}</TableCell>
                                <TableCell sx={headCellSx} align="right">{LABELS.grossAmount}</TableCell>
                                {showDiscount && <TableCell sx={headCellSx} align="right">{LABELS.discount}</TableCell>}
                                <TableCell sx={headCellSx} align="right">{LABELS.taxRate}</TableCell>
                                <TableCell sx={headCellSx} align="right">{LABELS.taxableAmount}</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {items.map((item) => (
                                <TableRow key={item.id}>
                                    <TableCell sx={{ fontSize: '0.84rem', fontWeight: 600, color: 'var(--crm-slate-900)', minWidth: 220 }}>
                                        {item.productName || '—'}
                                        {(item.description || item.note) && (
                                            <Typography sx={{ fontSize: '0.74rem', color: 'var(--mui-palette-text-secondary)', fontWeight: 400, mt: 0.3, whiteSpace: 'pre-wrap' }}>
                                                {[item.description, item.note].filter(Boolean).join(' • ')}
                                            </Typography>
                                        )}
                                    </TableCell>
                                    <TableCell align="right" sx={cellSx}>{fmtNumber(item.quantity, { maxDecimals: 2 })}</TableCell>
                                    <TableCell align="right" sx={cellSx}>{money(item.rate)}</TableCell>
                                    <TableCell align="right" sx={cellSx}>{money(item.grossAmount)}</TableCell>
                                    {showDiscount && (
                                        <TableCell align="right" sx={cellSx}>
                                            {item.discount > 0 ? (
                                                <>
                                                    {fmtNumber(item.discount, { maxDecimals: 2 })}%
                                                    <Typography component="span" sx={{ display: 'block', fontSize: '0.72rem', color: 'var(--mui-palette-error-main)' }}>
                                                        − {money(item.discountAmount)}
                                                    </Typography>
                                                </>
                                            ) : (
                                                '—'
                                            )}
                                        </TableCell>
                                    )}
                                    <TableCell align="right" sx={cellSx}>{item.taxRate ? taxLabel(item.taxRate) : '—'}</TableCell>
                                    <TableCell align="right" sx={{ ...cellSx, fontWeight: 700 }}>{money(item.taxableAmount)}</TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </Paper>
            )}

            {totals && (
                <Paper
                    variant="outlined"
                    sx={{ p: 2.5, borderRadius: '10px', borderColor: 'var(--mui-palette-primary-softBorder)', backgroundColor: 'var(--mui-palette-background-subtle)', maxWidth: 420, ml: { md: 'auto' }, width: '100%' }}
                >
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.2 }}>
                        <SummaryRow label={TOTAL_LABELS.totalAmount} value={money(totals.totalAmount)} />
                        {totals.totalDiscount > 0 && <SummaryRow label={TOTAL_LABELS.totalDiscount} value={`− ${money(totals.totalDiscount)}`} color="var(--mui-palette-error-main)" />}
                        <SummaryRow label={TOTAL_LABELS.subtotal} value={money(totals.subtotal)} bold />
                        <SummaryRow label={TOTAL_LABELS.totalTax} value={`+ ${money(totals.totalTax)}`} color="var(--crm-text-blue-600)" />
                        {(value.lumpSumDiscount ?? 0) > 0 && (
                            <SummaryRow label={TOTAL_LABELS.lumpSumDiscount} value={`− ${money(value.lumpSumDiscount)}`} color="var(--mui-palette-error-main)" />
                        )}
                        <Divider />
                        <SummaryRow label={TOTAL_LABELS.grandTotal} value={money(totals.grandTotal)} color="var(--crm-green-700)" bold />
                    </Box>
                </Paper>
            )}
        </Box>
    );
}
