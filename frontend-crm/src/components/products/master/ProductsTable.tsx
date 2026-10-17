'use client';

import React, { useMemo } from 'react';
import { Box, Chip, Typography } from '@mui/material';
import InventoryOutlinedIcon from '@mui/icons-material/InventoryOutlined';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import type { Product } from '../../../types/product.types';
import { DataTable, type DataTableColumn } from '../../common/DataTable';

export interface ProductsTableProps {
    products: Product[];
    selectedIds: string[];
    onSelectAll: (checked: boolean) => void;
    onSelectOne: (id: string, checked: boolean) => void;
    onViewProduct?: (id: string) => void;
    onEditProduct: (id: string) => void;
    onNewProduct: () => void;
    sortField?: string;
    sortOrder?: 'asc' | 'desc';
    onSort?: (field: string) => void;
}

const TAX_RATE_COLORS: Record<string, { bg: string; color: string; border: string }> = {
    '0%': { bg: '#f0fdf4', color: '#15803d', border: '#bbf7d0' },
    '5%': { bg: '#eff6ff', color: '#1d4ed8', border: '#bfdbfe' },
    '12%': { bg: '#fefce8', color: '#854d0e', border: '#fde68a' },
    '18%': { bg: '#fff7ed', color: '#c2410c', border: '#fed7aa' },
    '28%': { bg: '#fef2f2', color: '#b91c1c', border: '#fecaca' },
};

export function ProductsTable({
    products,
    selectedIds,
    onSelectAll,
    onSelectOne,
    onViewProduct,
    onEditProduct,
    onNewProduct,
    sortField,
    sortOrder,
    onSort,
}: ProductsTableProps) {
    const columns: DataTableColumn<Product>[] = useMemo(
        () => [
            {
                id: 'productName',
                label: 'PRODUCT NAME',
                sortable: true,
                minWidth: 220,
                render: (p) => (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <InventoryOutlinedIcon sx={{ fontSize: 16, color: '#2563eb' }} />
                        <Box>
                            <Typography
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onEditProduct(p.id);
                                }}
                                sx={{
                                    fontWeight: 700,
                                    color: '#1d4ed8',
                                    fontSize: '0.82rem',
                                    cursor: 'pointer',
                                    lineHeight: 1.2,
                                    '&:hover': { textDecoration: 'underline' },
                                }}
                            >
                                {p.productName}
                            </Typography>
                            <Typography sx={{ fontSize: '0.72rem', color: '#94a3b8' }}>
                                {p.productCode}
                            </Typography>
                        </Box>
                    </Box>
                ),
            },
            {
                id: 'category',
                label: 'CATEGORY',
                sortable: true,
                minWidth: 140,
                render: (p) => (
                    <Typography sx={{ fontSize: '0.8rem', color: '#334155', fontWeight: 500 }}>
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
                    <Typography sx={{ fontSize: '0.8rem', color: '#475569' }}>
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
                    <Typography sx={{ fontSize: '0.78rem', color: '#64748b', fontFamily: 'monospace' }}>
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
                    <Typography sx={{ fontSize: '0.8rem', fontWeight: 600, color: '#1e293b' }}>
                        {p.mrp ? `₹${Number(p.mrp).toLocaleString('en-IN')}` : '-'}
                    </Typography>
                ),
            },
            {
                id: 'taxRate',
                label: 'TAX',
                sortable: true,
                minWidth: 80,
                render: (p) => {
                    const style = TAX_RATE_COLORS[p.taxRate || ''] || { bg: '#f1f5f9', color: '#475569', border: '#cbd5e1' };
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
                        <Typography sx={{ fontSize: '0.78rem', color: '#94a3b8' }}>-</Typography>
                    );
                },
            },
            {
                id: 'type',
                label: 'TYPE',
                sortable: true,
                minWidth: 100,
                render: (p) => (
                    <Typography sx={{ fontSize: '0.78rem', color: '#64748b' }}>
                        {p.type || '-'}
                    </Typography>
                ),
            },
        ],
        [onEditProduct]
    );

    return (
        <DataTable<Product>
            data={products}
            columns={columns}
            keyExtractor={(p) => p.id}
            selectable={true}
            selectedIds={selectedIds}
            onToggleSelectRow={(id) => {
                const isSelected = selectedIds.includes(id);
                onSelectOne(id, !isSelected);
            }}
            onToggleSelectAll={(checked) => onSelectAll(!!checked)}
            sortField={sortField}
            sortOrder={sortOrder}
            onSort={onSort}
            onViewRow={(p) => (onViewProduct ? onViewProduct(p.id) : onEditProduct(p.id))}
            onEditRow={(p) => onEditProduct(p.id)}
            viewTooltip="View Product"
            editTooltip="Edit Product"
            actionsPosition="left"
            actionsWidth={80}
            actionsHeaderLabel="ACTIONS"
            emptyTitle="No products in catalog yet"
            emptyDescription="Add your first product to start building the catalog. You can define pricing, HSN codes, and tax rates."
            emptyActionLabel="Add Product"
            onEmptyAction={onNewProduct}
            emptyIcon={<InventoryOutlinedIcon sx={{ fontSize: 48, color: '#cbd5e1' }} />}
            minHeight={280}
        />
    );
}
