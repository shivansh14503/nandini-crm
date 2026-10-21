'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Box, Chip, Typography } from '@mui/material';
import InventoryOutlinedIcon from '@mui/icons-material/InventoryOutlined';
import CategoryOutlinedIcon from '@mui/icons-material/CategoryOutlined';
import NewReleasesOutlinedIcon from '@mui/icons-material/NewReleasesOutlined';
import StarBorderIcon from '@mui/icons-material/StarBorder';
import { CommonMasterView } from '../../common/CommonMasterView';
import { AppToast } from '../../common/AppToast';
import type { DataTableColumn, DataTableFilterItem } from '../../common/DataTable';
import { ROUTES } from '../../../config/constants';
import type { Product } from '../../../types/product.types';
import { productService } from '@/services';
import type { ProductFilterTab } from './types';
import { ProductDetailDrawer } from '../ProductDetailDrawer';

const RECENTLY_ADDED_DAYS = 7;

const TAX_RATE_COLORS: Record<string, { bg: string; color: string; border: string }> = {
    '0%': { bg: '#f0fdf4', color: '#15803d', border: '#bbf7d0' },
    '5%': { bg: '#eff6ff', color: '#1d4ed8', border: '#bfdbfe' },
    '12%': { bg: '#fefce8', color: '#854d0e', border: '#fde68a' },
    '18%': { bg: '#fff7ed', color: '#c2410c', border: '#fed7aa' },
    '28%': { bg: '#fef2f2', color: '#b91c1c', border: '#fecaca' },
};

export function ProductsMasterView() {
    const router = useRouter();

    const [products, setProducts] = useState<Product[]>([]);
    const [activeTab, setActiveTab] = useState<ProductFilterTab>('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [page, setPage] = useState(0);
    const [rowsPerPage, setRowsPerPage] = useState(10);
    const [sortField, setSortField] = useState<string>('productName');
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
    const [selectedDrawerProduct, setSelectedDrawerProduct] = useState<Product | null>(null);
    const [toast, setToast] = useState<{ open: boolean; message: string; severity: 'success' | 'info' | 'error' }>({
        open: false,
        message: '',
        severity: 'success',
    });

    const loadProducts = useCallback(() => {
        setProducts(productService.getAllSync());
    }, []);

    useEffect(() => {
        let active = true;
        productService
            .getAll()
            .then((data) => {
                if (active) setProducts(data);
            })
            .catch(() => {});
        return () => {
            active = false;
        };
    }, []);

    // ── Filter Logic ──────────────────────────────────────────────────────────
    const filteredProducts = useMemo(() => {
        const now = new Date().getTime();
        return products.filter((p) => {
            if (activeTab === 'hardware' && !['Hardware', 'Networking', 'Storage', 'Security', 'Peripherals'].includes(p.category || '')) return false;
            if (activeTab === 'software' && !['Software', 'License', 'Subscription'].includes(p.type || '')) return false;
            if (activeTab === 'services' && !['AMC / Service', 'Cloud Services'].includes(p.category || '')) return false;
            if (activeTab === 'recently_added') {
                const created = new Date(p.createdAt).getTime();
                if (now - created > RECENTLY_ADDED_DAYS * 86400000) return false;
            }

            if (searchQuery.trim()) {
                const q = searchQuery.toLowerCase().trim();
                return (
                    p.productName.toLowerCase().includes(q) ||
                    (p.category || '').toLowerCase().includes(q) ||
                    (p.manufacturer || '').toLowerCase().includes(q) ||
                    (p.hsnCode || '').toLowerCase().includes(q) ||
                    p.productCode.toLowerCase().includes(q)
                );
            }
            return true;
        });
    }, [products, activeTab, searchQuery]);

    // ── Sort Logic ────────────────────────────────────────────────────────────
    const sortedProducts = useMemo(() => {
        return [...filteredProducts].sort((a, b) => {
            const valA = ((a as unknown as Record<string, unknown>)[sortField] || '').toString().toLowerCase();
            const valB = ((b as unknown as Record<string, unknown>)[sortField] || '').toString().toLowerCase();
            if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
            if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
            return 0;
        });
    }, [filteredProducts, sortField, sortOrder]);

    // ── Pagination ────────────────────────────────────────────────────────────
    const paginatedProducts = useMemo(() => {
        const start = page * rowsPerPage;
        return sortedProducts.slice(start, start + rowsPerPage);
    }, [sortedProducts, page, rowsPerPage]);

    const handleSort = (field: string) => {
        if (sortField === field) {
            setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
        } else {
            setSortField(field);
            setSortOrder('asc');
        }
    };

    const handleToggleSelectAll = (checked?: boolean) => {
        if (checked) {
            setSelectedIds(paginatedProducts.map((p) => p.id));
        } else {
            setSelectedIds([]);
        }
    };

    const handleToggleSelectRow = (id: string) => {
        setSelectedIds((prev) =>
            prev.includes(id) ? prev.filter((sid) => sid !== id) : [...prev, id]
        );
    };

    const handleBulkDelete = async () => {
        const count = selectedIds.length;
        await productService.deleteBulk(selectedIds);
        loadProducts();
        setSelectedIds([]);
        setToast({ open: true, message: `${count} product(s) deleted.`, severity: 'success' });
    };

    // ── Filter Tabs Configuration ─────────────────────────────────────────────
    const filterItems: DataTableFilterItem<ProductFilterTab>[] = useMemo(() => {
        const now = new Date().getTime();
        return [
            {
                id: 'all',
                label: 'All Products',
                icon: <InventoryOutlinedIcon sx={{ fontSize: 16 }} />,
                count: products.length,
            },
            {
                id: 'hardware',
                label: 'Hardware',
                icon: <CategoryOutlinedIcon sx={{ fontSize: 16 }} />,
                count: products.filter((p) => ['Hardware', 'Networking', 'Storage', 'Security', 'Peripherals'].includes(p.category || '')).length,
            },
            {
                id: 'software',
                label: 'Software & Licenses',
                icon: <StarBorderIcon sx={{ fontSize: 16 }} />,
                count: products.filter((p) => ['Software', 'License', 'Subscription'].includes(p.type || '')).length,
            },
            {
                id: 'services',
                label: 'Services & AMC',
                icon: <NewReleasesOutlinedIcon sx={{ fontSize: 16 }} />,
                count: products.filter((p) => ['AMC / Service', 'Cloud Services'].includes(p.category || '')).length,
            },
            {
                id: 'recently_added',
                label: 'Recently Added',
                icon: <NewReleasesOutlinedIcon sx={{ fontSize: 16 }} />,
                count: products.filter((p) => now - new Date(p.createdAt).getTime() <= RECENTLY_ADDED_DAYS * 86400000).length,
            },
        ];
    }, [products]);

    // ── Declarative Column Definitions ────────────────────────────────────────
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
                                    setSelectedDrawerProduct(p);
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
        []
    );

    return (
        <CommonMasterView<Product, ProductFilterTab>
            filterConfig={{
                filters: filterItems,
                activeFilter: activeTab,
                onFilterChange: (tab) => {
                    setActiveTab(tab);
                    setPage(0);
                },
            }}
            searchConfig={{
                searchQuery,
                onSearchChange: (v) => {
                    setSearchQuery(v);
                    setPage(0);
                },
                searchPlaceholder: 'Search by name, category, HSN, manufacturer...',
                searchWidth: { xs: '100%', sm: 320 },
                onNewClick: () => router.push(ROUTES.PRODUCT_NEW),
                newButtonLabel: 'New Product',
                onRefresh: () => {
                    loadProducts();
                    setToast({ open: true, message: 'Products refreshed.', severity: 'info' });
                },
                refreshTooltip: 'Refresh Products',
                selectedCount: selectedIds.length,
                onBulkDelete: handleBulkDelete,
            }}
            columns={columns}
            data={paginatedProducts}
            keyExtractor={(p) => p.id}
            selectedIds={selectedIds}
            onToggleSelectRow={handleToggleSelectRow}
            onToggleSelectAll={handleToggleSelectAll}
            sortField={sortField}
            sortOrder={sortOrder}
            onSort={handleSort}
            onView={(p) => router.push(ROUTES.PRODUCT_DETAIL(p.id))}
            onEdit={(p) => router.push(ROUTES.PRODUCT_EDIT(p.id))}
            onRowClick={(product) => setSelectedDrawerProduct(product)}
            activeRowId={selectedDrawerProduct?.id}
            viewTooltip="View Product"
            editTooltip="Edit Product"
            emptyTitle="No products in catalog yet"
            emptyDescription="Add your first product to start building the catalog. You can define pricing, HSN codes, and tax rates."
            emptyActionLabel="Add Product"
            onEmptyAction={() => router.push(ROUTES.PRODUCT_NEW)}
            emptyIcon={<InventoryOutlinedIcon sx={{ fontSize: 48, color: '#cbd5e1' }} />}
            pagination={{
                page,
                rowsPerPage,
                totalCount: sortedProducts.length,
                onPageChange: setPage,
                onRowsPerPageChange: (n) => {
                    setRowsPerPage(n);
                    setPage(0);
                },
            }}
            drawer={
                <ProductDetailDrawer
                    product={selectedDrawerProduct}
                    open={Boolean(selectedDrawerProduct)}
                    onClose={() => setSelectedDrawerProduct(null)}
                />
            }
            isDrawerOpen={Boolean(selectedDrawerProduct)}
            toast={
                <AppToast
                    open={toast.open}
                    message={toast.message}
                    severity={toast.severity}
                    onClose={() => setToast((t) => ({ ...t, open: false }))}
                />
            }
        />
    );
}
