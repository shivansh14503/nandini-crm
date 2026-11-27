'use client';

import React from 'react';
import { useRouter } from 'next/navigation';

import ContentCopyOutlinedIcon from '@mui/icons-material/ContentCopyOutlined';

import { ROUTES } from '@/config/constants';
import { withListOrigin } from '@/utils/listOrigin';
import type { Product } from '@/types/product.types';
import { useProduct } from '@/hooks/queries';
import { EntityDetailDrawer, copyToClipboard } from '@/components/common/Drawer';
import { useLayoutDrawerProps } from '@/components/common/Drawer/layout';
import { PRODUCT_FORM_TABS } from './ProductForm';
import { useShowRecordNumber } from '@/hooks/queries/useDocumentSeries';
import { ProductUsageChip, ProductUsageLine } from './ProductUsage';

export interface ProductDetailDrawerProps {
    product: Product | null;
    open: boolean;
    onClose: () => void;
    onEdit?: (id: string) => void;
}

export function ProductDetailDrawer({ product, open, onClose, onEdit }: ProductDetailDrawerProps) {
    const showNumber = useShowRecordNumber();
    const router = useRouter();

    const { data: freshProduct } = useProduct(open && product?.id ? product.id : undefined);
    const p = freshProduct ?? product;

    // Header, badges and tabs come from the Products drawer layout (Admin › Form Customization › Drawer Layout).
    const view = useLayoutDrawerProps('products', p, PRODUCT_FORM_TABS);

    if (!p) return null;

    const handleEdit = () => {
        if (onEdit) {
            onEdit(p.id);
        } else {
            router.push(ROUTES.PRODUCT_EDIT(p.id));
        }
    };

    return (
        <EntityDetailDrawer
            open={open}
            module="products"
            onClose={onClose}
            title={view.title}
            subtitle={view.subtitle}
            avatarIcon={view.avatarIcon}
            avatarBg={view.avatarBg}
            verified={true}
            titleAdornment={<ProductUsageChip usage={p.usage} />}
            headerNote={<ProductUsageLine productId={p.id} usage={p.usage} />}
            badges={view.badges}
            headerActions={{
                onEdit: handleEdit,
                onView: () => router.push(withListOrigin(ROUTES.PRODUCT_DETAIL(p.id))),
            }}
            formTabs={view.formTabs}
            tabContents={view.tabContents}
            auditEntity={{ type: 'products', id: p.id }}
            recordAudit={p}
            includeChangesTab={true}
            primaryAction={{
                label: 'Edit Product',
                onClick: handleEdit,
            }}
            secondaryAction={
                showNumber('product')
                    ? {
                          label: 'Copy Product Code',
                          icon: <ContentCopyOutlinedIcon sx={{ fontSize: 16 }} />,
                          onClick: () => copyToClipboard(p.productCode),
                      }
                    : undefined
            }
        />
    );
}
