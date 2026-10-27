'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Box, Chip, Typography } from '@mui/material';
import InventoryOutlinedIcon from '@mui/icons-material/InventoryOutlined';
import CategoryOutlinedIcon from '@mui/icons-material/CategoryOutlined';
import NewReleasesOutlinedIcon from '@mui/icons-material/NewReleasesOutlined';
import StarBorderIcon from '@mui/icons-material/StarBorder';
import { RecordLink } from '../../common/RecordLink';
import { CommonMasterView } from '../../common/CommonMasterView';
import { MasterHeaderActions } from '../../common/MasterHeaderActions';
import { buildExtendedSearchConfig } from '../../common/buildExtendedSearchConfig';
import { AppToast } from '../../common/AppToast';
import { DataImportModal } from '../../common/import';
import { RelatedModulesSidebar, RelatedRecordsTableView } from '../../common/Drawer';
import { RelatedSecondaryDrawer, type SecondaryDrawerEntity } from '../../common/RelatedSecondaryDrawer';
import type { DataTableColumn, DataTableFilterItem } from '../../common/DataTable';
import { ROUTES } from '../../../config/constants';
import { getRelatedModulesForEntity } from '@/config/relatedModules.config';
import type { Product } from '../../../types/product.types';
import { productService, subscribeCrmSync } from '@/services';
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
    const [activeRelatedModule, setActiveRelatedModule] = useState<string | null>(null);
    const [secondaryDrawerEntity, setSecondaryDrawerEntity] = useState<SecondaryDrawerEntity | null>(null);
    const [isLeftSidebarCollapsed, setIsLeftSidebarCollapsed] = useState<boolean>(false);
    const [toast, setToast] = useState<{ open: boolean; message: string; severity: 'success' | 'info' | 'error' }>({
        open: false,
        message: '',
        severity: 'success',
    });

    const [importOpen, setImportOpen] = useState(false);

    const loadProducts = useCallback(() => {
        const data = productService.getAllSync();
        setProducts(data);
        setSelectedDrawerProduct((prev) => {
            if (!prev) return null;
            return data.find((p) => p.id === prev.id) || null;
        });
    }, []);

    useEffect(() => {
        let active = true;
        productService
            .getAll()
            .then((data) => {
                if (active) {
                    setProducts(data);
                    setSelectedDrawerProduct((prev) => {
                        if (!prev) return null;
                        return data.find((p) => p.id === prev.id) || null;
                    });
                }
            })
            .catch(() => {});
        return () => {
            active = false;
        };
    }, []);

    useEffect(() => {
        const handleFocus = () => {
            loadProducts();
        };
        const handleVisibility = () => {
            if (document.visibilityState === 'visible') {
                loadProducts();
            }
        };

        window.addEventListener('focus', handleFocus);
        document.addEventListener('visibilitychange', handleVisibility);
        const unsubscribe = subscribeCrmSync(loadProducts);

        return () => {
            window.removeEventListener('focus', handleFocus);
            document.removeEventListener('visibilitychange', handleVisibility);
            unsubscribe();
        };
    }, [loadProducts]);

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

    const closeThreePanelView = useCallback(() => {
        setSecondaryDrawerEntity(null);
        setSelectedDrawerProduct(null);
        setActiveRelatedModule(null);
    }, []);

    const handleBulkDelete = async () => {
        const count = selectedIds.length;
        await productService.deleteBulk(selectedIds);
        if (selectedDrawerProduct && selectedIds.includes(selectedDrawerProduct.id)) {
            closeThreePanelView();
        }
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
                            <RecordLink
                                href={ROUTES.PRODUCT_DETAIL(p.id)}
                                onOpen={() => setSelectedDrawerProduct(p)}
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
                            </RecordLink>
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

    const relatedModules = useMemo(() => {
        void products;
        if (!selectedDrawerProduct) return [];
        return getRelatedModulesForEntity('product', selectedDrawerProduct, setActiveRelatedModule);
    }, [selectedDrawerProduct, products]);

    // Falls back to the first module until the user explicitly picks one.
    const effectiveRelatedModule = activeRelatedModule ?? relatedModules[0]?.id ?? null;
    const activeModuleMeta = relatedModules.find((m) => m.id === effectiveRelatedModule);

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
            tableId="products"
            headerActions={() => (
                <MasterHeaderActions
                    onRefresh={() => {
                        loadProducts();
                        setToast({ open: true, message: 'Products refreshed.', severity: 'info' });
                    }}
                    onNewClick={() => router.push(ROUTES.PRODUCT_NEW)}
                    newButtonLabel="New Product"
                    onImportClick={() => setImportOpen(true)}
                />
            )}
            searchConfig={buildExtendedSearchConfig({
                searchQuery,
                onSearchChange: (q) => {
                    setSearchQuery(q);
                    setPage(0);
                },
                searchPlaceholder: 'Search by name, category, HSN, manufacturer...',
                pageIds: paginatedProducts.map((r) => r.id),
                allIds: sortedProducts.map((r) => r.id),
                selectedIds,
                onSelectedIdsChange: setSelectedIds,
                page,
                rowsPerPage,
                totalRecords: sortedProducts.length,
                onPageChange: setPage,
                onBulkDelete: handleBulkDelete,
            })}
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
            getEditHref={(p) => ROUTES.PRODUCT_EDIT(p.id)}
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
            relatedSidebar={
                <RelatedModulesSidebar
                    open={Boolean(selectedDrawerProduct)}
                    modules={relatedModules}
                    activeModuleId={effectiveRelatedModule ?? undefined}
                    onModuleSelect={(moduleId) => setActiveRelatedModule(moduleId)}
                    collapsed={isLeftSidebarCollapsed}
                    onToggleCollapse={setIsLeftSidebarCollapsed}
                />
            }
            relatedRecordsTable={
                <RelatedRecordsTableView
                    open={Boolean(selectedDrawerProduct && effectiveRelatedModule)}
                    moduleId={effectiveRelatedModule || ''}
                    moduleTitle={activeModuleMeta?.label || 'Related Records'}
                    parentRecordId={selectedDrawerProduct?.id}
                    parentEntityTitle={selectedDrawerProduct?.productName || ''}
                    entityData={selectedDrawerProduct}
                    entityType="product"
                    leftOffset={isLeftSidebarCollapsed ? 72 : 260}
                    rightOffset={580}
                    onClose={closeThreePanelView}
                    onRowClick={(row, modId) => setSecondaryDrawerEntity({ type: modId, data: row })}
                />
            }
            drawer={
                <ProductDetailDrawer
                    product={selectedDrawerProduct}
                    open={Boolean(selectedDrawerProduct)}
                    onClose={closeThreePanelView}
                />
            }
            secondaryDrawer={
                secondaryDrawerEntity ? (
                    <RelatedSecondaryDrawer
                        entity={secondaryDrawerEntity}
                        moduleLabel={activeModuleMeta?.label}
                        parentTitle={selectedDrawerProduct?.productName}
                        onClose={() => setSecondaryDrawerEntity(null)}
                    />
                ) : null
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
        >
            <DataImportModal
                open={importOpen}
                entity="products"
                onClose={() => setImportOpen(false)}
                onImported={(count) => {
                    loadProducts();
                    setToast({ open: true, message: `Successfully imported ${count} product${count === 1 ? '' : 's'}!`, severity: 'success' });
                }}
            />
        </CommonMasterView>
    );
}
