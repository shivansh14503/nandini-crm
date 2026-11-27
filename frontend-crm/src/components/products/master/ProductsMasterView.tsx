'use client';

import React, { useState, useMemo, useCallback } from 'react';
import { useResetTab } from '@/hooks/useResetTab';
import { useRouter } from 'next/navigation';
import InventoryOutlinedIcon from '@mui/icons-material/InventoryOutlined';
import CategoryOutlinedIcon from '@mui/icons-material/CategoryOutlined';
import NewReleasesOutlinedIcon from '@mui/icons-material/NewReleasesOutlined';
import { CommonMasterView } from '../../common/CommonMasterView';
import { useTableFilter } from '../../common/TableFilter';
import { MasterHeaderActions } from '../../common/MasterHeaderActions';
import { buildExtendedSearchConfig } from '../../common/buildExtendedSearchConfig';
import { AppToast } from '../../common/AppToast';
import { useSaveFlash } from '@/utils/saveFlash';
import { DataImportModal } from '../../common/import';
import { type DataTableFilterItem } from '../../common/DataTable';
import { ROUTES } from '@/config/constants';
import type { Product } from '@/types/product.types';
import { useProducts, useBulkDeleteProducts } from '@/hooks/queries';
import { useShowRecordNumber } from '@/hooks/queries/useDocumentSeries';
import { productTypePill, typeOfPill, type ProductFilterTab } from './types';
import { ProductDetailDrawer } from '../ProductDetailDrawer';
import { useSearchScope, useSearchScopedRows } from '../../search/SearchScope';
import { useProductColumns } from './productColumns';
import { ModuleScorecardSummary, useModuleScorecard } from '../../common/scorecard/useModuleScorecard';
import { sameOption, useDropdownPillOptions } from '../../common/filterPills/useDropdownPillOptions';

const RECENTLY_ADDED_DAYS = 7;

/** Stable empty list while the first page loads (keeps memoized filters from recomputing). */
const NO_RECORDS: Product[] = [];
export function ProductsMasterView() {
    const router = useRouter();

    // On the global search results page the table shows the matched records (any owner) instead of this list.
    const embeddedInSearch = Boolean(useSearchScope());
    const { data: allProductsLoaded = NO_RECORDS, refetch, isPending: listPending } = useProducts(undefined, { enabled: !embeddedInSearch });
    // A disabled query stays "pending" forever, so only count it when this screen loads its own list.
    const listLoading = !embeddedInSearch && listPending;
    const allProducts = useSearchScopedRows(allProductsLoaded);
    const bulkDeleteMutation = useBulkDeleteProducts();
    const [activeTab, setActiveTab] = useResetTab<ProductFilterTab>('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [page, setPage] = useState(0);
    const [rowsPerPage, setRowsPerPage] = useState(10);
    const [sortField, setSortField] = useState<string>('productName');
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
    // Tracked by id so the drawer always shows the cached copy and closes if the product is deleted.
    const [drawerProductId, setDrawerProductId] = useState<string | null>(null);
    // ── Declarative Column Definitions ────────────────────────────────────────
    const openDrawerRecord = useCallback((record: Product) => setDrawerProductId(record.id), []);
    const columns = useProductColumns(openDrawerRecord);
    const tableFilter = useTableFilter<Product>({
        module: 'products',
        rows: allProducts,
        columns,
        onSortChange: (s) => {
            setSortField(s.field);
            setSortOrder(s.order);
        },
        onChange: () => setPage(0),
    });
    /** Records left by the Filter dialog: tabs, counts, search and bulk actions work on these. */
    const products = tableFilter.filteredRows;
    const selectedDrawerProduct = useMemo(
        () => (drawerProductId ? products.find((p) => p.id === drawerProductId) ?? null : null),
        [products, drawerProductId]
    );
    const [toast, setToast] = useState<{ open: boolean; message: string; severity: 'success' | 'info' | 'error' }>({
        open: false,
        message: '',
        severity: 'success',
    });

    // Back from the create / edit form: show its "saved" toast here and open the saved record in the drawer.
    useSaveFlash(ROUTES.PRODUCTS, (flash) => {
        setToast({ open: true, message: flash.message, severity: flash.severity ?? 'success' });
        if (flash.recordId) setDrawerProductId(flash.recordId);
    });

    const [importOpen, setImportOpen] = useState(false);

    // ── Filter Logic ──────────────────────────────────────────────────────────
    const showNumber = useShowRecordNumber();
    /** Products in the active pill view: the scorecard counts these. */
    // One pill per active Product Type option (Admin › Dropdown Manager), so removing or renaming a type there
    // removes or relabels its pill. A pill whose option was removed while selected falls back to All Products.
    const productTypes = useDropdownPillOptions('product_type', 'products');
    const selectedType = typeOfPill(activeTab);
    const tabType = selectedType ? productTypes.find(selectedType) : undefined;
    const effectiveTab: ProductFilterTab = selectedType && !tabType ? 'all' : activeTab;
    const tabProducts = useMemo(() => {
        const now = new Date().getTime();
        return products.filter((p) => {
            if (tabType && !sameOption(p.type, tabType.value)) return false;
            if (effectiveTab === 'recently_added') {
                const created = new Date(p.createdAt).getTime();
                if (now - created > RECENTLY_ADDED_DAYS * 86400000) return false;
            }
            return true;
        });
    }, [products, tabType, effectiveTab]);

    // Summary cards, once an admin switches them on under Admin › List Scorecards.
    const goToFirstPage = useCallback(() => setPage(0), []);
    const scorecard = useModuleScorecard<Product>({ module: 'products', rows: tabProducts, onActiveChange: goToFirstPage });
    const { matches: matchesScorecard } = scorecard;

    const filteredProducts = useMemo(() => {
        return tabProducts.filter((p) => {
            if (!matchesScorecard(p)) return false;

            if (searchQuery.trim()) {
                const q = searchQuery.toLowerCase().trim();
                return (
                    p.productName.toLowerCase().includes(q) ||
                    (p.category || '').toLowerCase().includes(q) ||
                    (p.manufacturer || '').toLowerCase().includes(q) ||
                    (p.hsnCode || '').toLowerCase().includes(q) ||
                    (showNumber('product') && p.productCode.toLowerCase().includes(q))
                );
            }
            return true;
        });
    }, [tabProducts, matchesScorecard, searchQuery, showNumber]);

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

    // Row clicks only open the drawer; its eye button leads on to the detail page with the related modules.
    const closeDrawer = useCallback(() => setDrawerProductId(null), []);

    const handleBulkDelete = async () => {
        const count = selectedIds.length;
        if (count === 0) return;
        if (!window.confirm(`Delete ${count} selected product(s)?`)) return;
        try {
            await bulkDeleteMutation.mutateAsync(selectedIds);
            if (drawerProductId && selectedIds.includes(drawerProductId)) {
                closeDrawer();
            }
            setSelectedIds([]);
            setToast({ open: true, message: `${count} product(s) deleted.`, severity: 'success' });
        } catch {
            setToast({ open: true, message: 'Failed to delete products.', severity: 'error' });
        }
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
            ...productTypes.options.map((option) => ({
                id: productTypePill(option.value),
                label: option.label,
                icon: <CategoryOutlinedIcon sx={{ fontSize: 16 }} />,
                count: products.filter((p) => sameOption(p.type, option.value)).length,
            })),
            {
                id: 'recently_added',
                label: 'Recently Added',
                icon: <NewReleasesOutlinedIcon sx={{ fontSize: 16 }} />,
                count: products.filter((p) => now - new Date(p.createdAt).getTime() <= RECENTLY_ADDED_DAYS * 86400000).length,
            },
        ];
    }, [products, productTypes]);


    return (
        <CommonMasterView<Product, ProductFilterTab>
            importEntity="products"
            loading={listLoading}
            summary={<ModuleScorecardSummary state={scorecard} loading={listLoading} />}
            filterConfig={{
                filters: filterItems,
                activeFilter: effectiveTab,
                onFilterChange: (tab) => {
                    setActiveTab(tab);
                    setPage(0);
                },
            }}
            tableId="products"
            tableFilter={tableFilter}
            headerActions={() => (
                <MasterHeaderActions
                    onRefresh={async () => {
                        const { isError } = await refetch();
                        setToast(
                            isError
                                ? { open: true, message: 'Failed to refresh products.', severity: 'error' }
                                : { open: true, message: 'Products refreshed.', severity: 'info' }
                        );
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
            getRowHref={(product) => ROUTES.PRODUCT_DETAIL(product.id)}
            onRowClick={(product) => setDrawerProductId(product.id)}
            activeRowId={selectedDrawerProduct?.id}
            viewTooltip="View Product"
            editTooltip="Edit Product"
            emptyTitle="No products in catalog yet"
            emptyDescription="Add your first product to start building the catalog. You can define pricing, HSN codes, and tax rates."
            emptyActionLabel="Add Product"
            onEmptyAction={() => router.push(ROUTES.PRODUCT_NEW)}
            emptyIcon={<InventoryOutlinedIcon sx={{ fontSize: 48, color: 'var(--crm-slate-300)' }} />}
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
                    onClose={closeDrawer}
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
        >
            <DataImportModal
                open={importOpen}
                entity="products"
                onClose={() => setImportOpen(false)}
            />
        </CommonMasterView>
    );
}
