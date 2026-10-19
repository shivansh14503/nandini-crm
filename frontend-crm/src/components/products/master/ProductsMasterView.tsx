'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { CommonMasterView } from '../../common/CommonMasterView';
import { AppToast } from '../../common/AppToast';
import { ROUTES } from '../../../config/constants';
import type { Product } from '../../../types/product.types';
import { getStoredProducts, saveStoredProducts } from '../../../data/mockProducts';
import { ProductsFilterPills, type ProductFilterTab } from './ProductsFilterPills';
import { ProductsTableToolbar } from './ProductsTableToolbar';
import { ProductsTable } from './ProductsTable';
import { ProductsPagination } from './ProductsPagination';
import { ProductDetailDrawer } from '../ProductDetailDrawer';

const RECENTLY_ADDED_DAYS = 7;

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
        setProducts(getStoredProducts());
    }, []);

    useEffect(() => {
        loadProducts();
    }, [loadProducts]);

    // ── Filter Logic ──────────────────────────────────────────────────────────
    const filteredProducts = useMemo(() => {
        const now = Date.now();
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
            const valA = ((a as Record<string, any>)[sortField] || '').toString().toLowerCase();
            const valB = ((b as Record<string, any>)[sortField] || '').toString().toLowerCase();
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

    // ── Selection ─────────────────────────────────────────────────────────────
    const handleSelectAll = (checked: boolean) => {
        if (checked) {
            setSelectedIds(paginatedProducts.map((p) => p.id));
        } else {
            setSelectedIds([]);
        }
    };

    const handleSelectOne = (id: string, checked: boolean) => {
        if (checked) {
            setSelectedIds((prev) => [...prev, id]);
        } else {
            setSelectedIds((prev) => prev.filter((sid) => sid !== id));
        }
    };

    // ── Bulk Delete ───────────────────────────────────────────────────────────
    const handleBulkDelete = () => {
        const next = products.filter((p) => !selectedIds.includes(p.id));
        setProducts(next);
        saveStoredProducts(next);
        setSelectedIds([]);
        setToast({ open: true, message: `${selectedIds.length} product(s) deleted.`, severity: 'success' });
    };

    // ── Counts for filter pills ───────────────────────────────────────────────
    const counts = useMemo(() => {
        const now = Date.now();
        return {
            all: products.length,
            hardware: products.filter((p) => ['Hardware', 'Networking', 'Storage', 'Security', 'Peripherals'].includes(p.category || '')).length,
            software: products.filter((p) => ['Software', 'License', 'Subscription'].includes(p.type || '')).length,
            services: products.filter((p) => ['AMC / Service', 'Cloud Services'].includes(p.category || '')).length,
            recentlyAdded: products.filter((p) => now - new Date(p.createdAt).getTime() <= RECENTLY_ADDED_DAYS * 86400000).length,
        };
    }, [products]);

    return (
        <CommonMasterView
            filters={
                <ProductsFilterPills
                    activeTab={activeTab}
                    onTabChange={(tab) => {
                        setActiveTab(tab);
                        setPage(0);
                    }}
                    counts={counts}
                />
            }
            toolbar={
                <ProductsTableToolbar
                    searchQuery={searchQuery}
                    onSearchChange={(v) => {
                        setSearchQuery(v);
                        setPage(0);
                    }}
                    onNewProduct={() => router.push(ROUTES.PRODUCT_NEW)}
                    onRefresh={() => {
                        loadProducts();
                        setToast({ open: true, message: 'Products refreshed.', severity: 'info' });
                    }}
                    selectedCount={selectedIds.length}
                    onBulkDelete={handleBulkDelete}
                />
            }
            table={
                <ProductsTable
                    products={paginatedProducts}
                    selectedIds={selectedIds}
                    onSelectAll={handleSelectAll}
                    onSelectOne={handleSelectOne}
                    onViewProduct={(id) => router.push(ROUTES.PRODUCT_DETAIL(id))}
                    onEditProduct={(id) => router.push(ROUTES.PRODUCT_EDIT(id))}
                    onNewProduct={() => router.push(ROUTES.PRODUCT_NEW)}
                    sortField={sortField}
                    sortOrder={sortOrder}
                    onSort={handleSort}
                    onRowClick={(product) => setSelectedDrawerProduct(product)}
                    activeProductId={selectedDrawerProduct?.id}
                />
            }
            pagination={
                <ProductsPagination
                    page={page}
                    rowsPerPage={rowsPerPage}
                    totalCount={sortedProducts.length}
                    onPageChange={setPage}
                    onRowsPerPageChange={(n) => {
                        setRowsPerPage(n);
                        setPage(0);
                    }}
                />
            }
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
