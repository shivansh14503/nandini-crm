'use client';

import React from 'react';
import { Box, Divider, Paper, Table, TableBody, TableCell, TableHead, TableRow, Typography } from '@mui/material';
import { ReadOnlyField } from '../ReadOnlyField';
import type { LineItemsValues } from '@/types/lineItem.types';
import { useDropdownOptionLabel } from '@/hooks/queries/useFormConfigs';
import { fmtMoney, fmtNumber } from '@/utils/formats';
import { currencyCodeOf, DEFAULT_CURRENCY, LINE_ITEM_LABELS as LABELS, LINE_ITEM_TAX_RATE_CATEGORY, lineItemSummaryLines, summaryLineText, type GstType, type LineItemSummaryLine } from '@/lib/line-items';
import { ClampedText } from '@/components/common/ClampedText';

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

/** Amount color of each kind of summary line. */
export const SUMMARY_LINE_COLORS: Record<LineItemSummaryLine['tone'], string> = {
    strong: 'var(--crm-slate-900)',
    minus: 'var(--mui-palette-error-main)',
    tax: 'var(--crm-text-blue-600)',
    roundOff: 'var(--crm-slate-900)',
    grand: 'var(--crm-green-700)',
};

const SummaryRow = ({ label, value, color, bold }: { label: string; value: string; color?: string; bold?: boolean }) => (
    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 2 }}>
        <Typography sx={{ fontSize: '0.8rem', fontWeight: bold ? 700 : 400, color: 'var(--mui-palette-text-secondary)', minWidth: 0 }}>{label}</Typography>
        <Typography sx={{ fontSize: '0.86rem', fontWeight: bold ? 800 : 600, color: color ?? 'var(--crm-slate-900)', whiteSpace: 'nowrap' }}>{value}</Typography>
    </Box>
);

/**
 * Plain-text presentation of a record's line items and totals (view pages): the same columns, labels and totals as
 * the editor (Jira CRM-111), with no inputs, buttons or selects.
 */
export function CrmLineItemsReadOnly({ value, withCurrency = false, gstType }: { value: LineItemsValues; withCurrency?: boolean; gstType?: GstType | null }) {
    const items = Array.isArray(value.lineItems) ? value.lineItems : [];
    const taxLabel = useDropdownOptionLabel(LINE_ITEM_TAX_RATE_CATEGORY);
    const currency = withCurrency ? value.currency || DEFAULT_CURRENCY : undefined;
    const currencyCode = currencyCodeOf(currency);
    const money = (n: number | undefined) => fmtMoney(n ?? 0, { minDecimals: 0, maxDecimals: 2, currencyCode });
    // The record's saved totals (what lists and scorecards show), with a GST line per rate.
    const summary = lineItemSummaryLines(value, gstType);
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
                                <TableCell sx={headCellSx}>{LABELS.quantity}</TableCell>
                                <TableCell sx={headCellSx}>{LABELS.rate}</TableCell>
                                <TableCell sx={headCellSx}>{LABELS.grossAmount}</TableCell>
                                {showDiscount && <TableCell sx={headCellSx}>{LABELS.discount}</TableCell>}
                                <TableCell sx={headCellSx}>{LABELS.taxRate}</TableCell>
                                <TableCell sx={headCellSx}>{LABELS.taxableAmount}</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {items.map((item) => (
                                <TableRow key={item.id}>
                                    <TableCell sx={{ fontSize: '0.84rem', fontWeight: 600, color: 'var(--crm-slate-900)', minWidth: 220 }}>
                                        {item.productName || '—'}
                                        {(item.description || item.note) && (
                                            <Typography component="div" sx={{ fontSize: '0.74rem', color: 'var(--mui-palette-text-secondary)', fontWeight: 400, mt: 0.3, whiteSpace: 'pre-wrap' }}>
                                                <ClampedText toggleFontSize="0.72rem">{[item.description, item.note].filter(Boolean).join(' • ')}</ClampedText>
                                            </Typography>
                                        )}
                                    </TableCell>
                                    <TableCell sx={cellSx}>{fmtNumber(item.quantity, { maxDecimals: 2 })}</TableCell>
                                    <TableCell sx={cellSx}>{money(item.rate)}</TableCell>
                                    <TableCell sx={cellSx}>{money(item.grossAmount)}</TableCell>
                                    {showDiscount && (
                                        <TableCell sx={cellSx}>
                                            {item.discount > 0 ? (
                                                <>
                                                    {item.discountType === 'amount' ? money(item.discount) : `${fmtNumber(item.discount, { maxDecimals: 2 })}%`}
                                                    {item.discountType !== 'amount' && (
                                                        <Typography component="span" sx={{ display: 'block', fontSize: '0.72rem', color: 'var(--mui-palette-error-main)' }}>
                                                            − {money(item.discountAmount)}
                                                        </Typography>
                                                    )}
                                                </>
                                            ) : (
                                                '—'
                                            )}
                                        </TableCell>
                                    )}
                                    <TableCell sx={cellSx}>{item.taxRate ? taxLabel(item.taxRate) : '—'}</TableCell>
                                    <TableCell sx={{ ...cellSx, fontWeight: 700 }}>{money(item.taxableAmount)}</TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </Paper>
            )}

            {summary.length > 0 && (
                <Paper
                    variant="outlined"
                    sx={{ p: 2.5, borderRadius: '10px', borderColor: 'var(--mui-palette-primary-softBorder)', backgroundColor: 'var(--mui-palette-background-subtle)', maxWidth: 420, ml: { md: 'auto' }, width: '100%' }}
                >
                    <Typography sx={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--crm-text-blue-900)', mb: 1.5 }}>Summary Breakdown</Typography>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.2 }}>
                        {summary.map((line) => (
                            <React.Fragment key={line.key}>
                                {line.tone === 'grand' && <Divider />}
                                <SummaryRow label={line.label} value={summaryLineText(line, money)} color={SUMMARY_LINE_COLORS[line.tone]} bold={line.tone === 'strong' || line.tone === 'grand'} />
                            </React.Fragment>
                        ))}
                    </Box>
                </Paper>
            )}
        </Box>
    );
}
