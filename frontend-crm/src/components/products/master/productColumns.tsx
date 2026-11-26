'use client';

import React, { useMemo } from 'react';
import { Box, Chip, Typography } from '@mui/material';
import InventoryOutlinedIcon from '@mui/icons-material/InventoryOutlined';
import { RecordLink } from '../../common/RecordLink';
import { documentNumberColumn, type DataTableColumn } from '../../common/DataTable';
import { ROUTES } from '@/config/constants';
import type { Product } from '@/types/product.types';
import { useShowRecordNumber } from '@/hooks/queries/useDocumentSeries';
import { fmtMoney } from '@/utils/formats';

const TAX_RATE_COLORS: Record<string, { bg: string; color: string; border: string }> = {
    '0%': { bg: 'var(--crm-green-50)', color: 'var(--crm-green-700)', border: 'var(--crm-green-200)' },
    '5%': { bg: 'var(--mui-palette-primary-soft)', color: 'var(--crm-text-blue-700)', border: 'var(--mui-palette-primary-softBorder)' },
    '12%': { bg: 'var(--crm-yellow-50)', color: 'var(--crm-yellow-800)', border: 'var(--mui-palette-warning-softBorder)' },
    '18%': { bg: 'var(--crm-orange-50)', color: 'var(--crm-orange-700)', border: 'var(--crm-orange-200)' },
    '28%': { bg: 'var(--mui-palette-error-soft)', color: 'var(--crm-red-700)', border: 'var(--mui-palette-error-softBorder)' },
};

/** A product row's own id (the related-records table passes the catalogue id of a line item instead). */
const ownId = (p: Product) => p.id;

/**
 * The Product table's columns (built-in ones; form-field columns are added by the table). Shared by the
 * module's list page and the related-records table in other records' drawers, so both offer the same columns.
 * `openRecord` runs on a plain click of the record link.
 */
export function useProductColumns(openRecord: (record: Product) => void, productIdOf: (product: Product) => string = ownId): DataTableColumn<Product>[] {
    const showNumber = useShowRecordNumber();

    return useMemo(
        () => [
            ...(showNumber('product')
                ? [
                      documentNumberColumn<Product>({
                          id: 'productCode',
                          label: 'PRODUCT NO.',
                          getNumber: (p) => p.productCode,
                          getHref: (p) => ROUTES.PRODUCT_DETAIL(productIdOf(p)),
                          onOpen: (p) => openRecord(p),
                      }),
                  ]
                : []),
            {
                id: 'productName',
                locked: true,
                label: 'PRODUCT NAME',
                sortable: true,
                minWidth: 220,
                render: (p) => (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <InventoryOutlinedIcon sx={{ fontSize: 16, color: 'var(--crm-text-blue-600)' }} />
                        <RecordLink
                            href={ROUTES.PRODUCT_DETAIL(productIdOf(p))}
                            onOpen={() => openRecord(p)}
                            sx={{
                                fontWeight: 700,
                                color: 'var(--crm-text-blue-700)',
                                fontSize: '0.82rem',
                                cursor: 'pointer',
                                lineHeight: 1.2,
                                '&:hover': { textDecoration: 'underline' },
                            }}
                        >
                            {p.productName}
                        </RecordLink>
                    </Box>
                ),
            },
            {
                id: 'category',
                label: 'CATEGORY',
                sortable: true,
                minWidth: 140,
                render: (p) => (
                    <Typography sx={{ fontSize: '0.8rem', color: 'var(--crm-slate-700)', fontWeight: 500 }}>
                        {p.category || '-'}
                    </Typography>
                ),
            },
            {
                id: 'manufacturer',
                label: 'MANUFACTURER',
                sortable: true,
                minWidth: 160,
                render: (p) => (
                    <Typography sx={{ fontSize: '0.8rem', color: 'var(--crm-slate-600)' }}>
                        {p.manufacturer || '-'}
                    </Typography>
                ),
            },
            {
                id: 'hsnCode',
                label: 'HSN CODE',
                sortable: true,
                minWidth: 110,
                render: (p) => (
                    <Typography sx={{ fontSize: '0.78rem', color: 'var(--mui-palette-text-secondary)', fontFamily: 'monospace' }}>
                        {p.hsnCode || '-'}
                    </Typography>
                ),
            },
            {
                id: 'mrp',
                label: 'MRP (₹)',
                sortable: true,
                minWidth: 100,
                render: (p) => (
                    <Typography sx={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--mui-palette-text-primary)' }}>
                        {p.mrp ? fmtMoney(Number(p.mrp), { minDecimals: 0, maxDecimals: 3 }) || '-' : '-'}
                    </Typography>
                ),
            },
            {
                id: 'taxRate',
                label: 'TAX',
                sortable: true,
                minWidth: 80,
                render: (p) => {
                    const style = TAX_RATE_COLORS[p.taxRate || ''] || { bg: 'var(--mui-palette-background-hover)', color: 'var(--crm-slate-600)', border: 'var(--mui-palette-border-strong)' };
                    return p.taxRate ? (
                        <Chip
                            label={p.taxRate}
                            size="small"
                            sx={{
                                height: 20,
                                fontSize: '0.7rem',
                                fontWeight: 700,
                                backgroundColor: style.bg,
                                color: style.color,
                                border: `1px solid ${style.border}`,
                            }}
                        />
                    ) : (
                        <Typography sx={{ fontSize: '0.78rem', color: 'var(--mui-palette-text-muted)' }}>-</Typography>
                    );
                },
            },
            {
                id: 'type',
                label: 'TYPE',
                sortable: true,
                minWidth: 100,
                render: (p) => (
                    <Typography sx={{ fontSize: '0.78rem', color: 'var(--mui-palette-text-secondary)' }}>
                        {p.type || '-'}
                    </Typography>
                ),
            },
        ],
        [showNumber, openRecord, productIdOf]
    );
}
