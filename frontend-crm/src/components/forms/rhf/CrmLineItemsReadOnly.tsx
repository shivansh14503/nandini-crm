'use client';

import React from 'react';
import { Box, Divider, Paper, Table, TableBody, TableCell, TableHead, TableRow, Typography } from '@mui/material';
import { ReadOnlyField } from '../ReadOnlyField';
import type { CrmLineItemsValues } from './CrmLineItemsSection';

const money = (n: number | undefined) => `₹${(n ?? 0).toLocaleString('en-IN')}`;

const headCellSx = {
    fontSize: '0.7rem',
    fontWeight: 700,
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    backgroundColor: '#f8fafc',
    whiteSpace: 'nowrap',
} as const;

const SummaryRow = ({ label, value, color, bold }: { label: string; value: string; color?: string; bold?: boolean }) => (
    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography sx={{ fontSize: '0.8rem', color: '#64748b' }}>{label}</Typography>
        <Typography sx={{ fontSize: '0.86rem', fontWeight: bold ? 800 : 600, color: color ?? '#0f172a' }}>{value}</Typography>
    </Box>
);

/** Plain-text presentation of an opportunity's line items and totals: no inputs, buttons or selects. */
export function CrmLineItemsReadOnly({ value }: { value: CrmLineItemsValues }) {
    const items = Array.isArray(value.lineItems) ? value.lineItems : [];
    const hasDiscount = (value.totalDiscount ?? 0) > 0;
    const hasTax = (value.totalTax ?? 0) > 0;

    return (
        <Box sx={{ p: { xs: 2, md: 3 }, display: 'flex', flexDirection: 'column', gap: 3 }}>
            <Box sx={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                <ReadOnlyField label="Currency" value={value.currency} hideWhenEmpty />
                <ReadOnlyField label="Group Name" value={value.groupName} hideWhenEmpty />
            </Box>

            {items.length === 0 ? (
                <Typography sx={{ fontSize: '0.86rem', color: '#94a3b8' }}>No line items on this record.</Typography>
            ) : (
                <Paper variant="outlined" sx={{ borderRadius: '10px', borderColor: '#e2e8f0', overflowX: 'auto' }}>
                    <Table size="small">
                        <TableHead>
                            <TableRow>
                                <TableCell sx={headCellSx}>Product</TableCell>
                                <TableCell sx={headCellSx} align="right">Qty</TableCell>
                                <TableCell sx={headCellSx} align="right">Amount</TableCell>
                                {items.some((i) => i.discount > 0) && (
                                    <TableCell sx={headCellSx} align="right">Discount</TableCell>
                                )}
                                <TableCell sx={headCellSx} align="right">Sale Price</TableCell>
                                <TableCell sx={headCellSx} align="right">Tax</TableCell>
                                <TableCell sx={headCellSx} align="right">Total</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {items.map((item) => (
                                <TableRow key={item.id}>
                                    <TableCell sx={{ fontSize: '0.84rem', fontWeight: 600, color: '#0f172a', minWidth: 220 }}>
                                        {item.productName || '—'}
                                        {(item.description || item.note) && (
                                            <Typography sx={{ fontSize: '0.74rem', color: '#64748b', fontWeight: 400, mt: 0.3 }}>
                                                {[item.description, item.note].filter(Boolean).join(' • ')}
                                            </Typography>
                                        )}
                                    </TableCell>
                                    <TableCell align="right" sx={{ fontSize: '0.84rem' }}>{item.quantity}</TableCell>
                                    <TableCell align="right" sx={{ fontSize: '0.84rem' }}>{money(item.amount)}</TableCell>
                                    {items.some((i) => i.discount > 0) && (
                                        <TableCell align="right" sx={{ fontSize: '0.84rem' }}>
                                            {item.discount > 0
                                                ? item.discountType === 'percentage'
                                                    ? `${item.discount}%`
                                                    : money(item.discount)
                                                : '—'}
                                        </TableCell>
                                    )}
                                    <TableCell align="right" sx={{ fontSize: '0.84rem' }}>{money(item.salePrice)}</TableCell>
                                    <TableCell align="right" sx={{ fontSize: '0.84rem' }}>
                                        {item.taxAmount > 0 ? `${money(item.taxAmount)} (${item.taxRate})` : '—'}
                                    </TableCell>
                                    <TableCell align="right" sx={{ fontSize: '0.84rem', fontWeight: 700 }}>{money(item.total)}</TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </Paper>
            )}

            {items.length > 0 && (
                <Paper
                    variant="outlined"
                    sx={{ p: 2.5, borderRadius: '10px', borderColor: '#bfdbfe', backgroundColor: '#f8fafc', maxWidth: 420, ml: { md: 'auto' }, width: '100%' }}
                >
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.2 }}>
                        <SummaryRow label="Total" value={money(value.totalAmount)} />
                        {hasDiscount && <SummaryRow label="Discount" value={`- ${money(value.totalDiscount)}`} color="#dc2626" />}
                        {(value.lumpSumDiscount ?? 0) > 0 && (
                            <SummaryRow label="Lump Sum Discount" value={`- ${money(value.lumpSumDiscount)}`} color="#dc2626" />
                        )}
                        <SummaryRow label="Subtotal" value={money(value.subtotal)} bold />
                        {hasTax && <SummaryRow label="Tax" value={`+ ${money(value.totalTax)}`} color="#2563eb" />}
                        <Divider />
                        <SummaryRow label="Grand Total" value={money(value.grandTotal)} color="#15803d" bold />
                    </Box>
                </Paper>
            )}
        </Box>
    );
}
