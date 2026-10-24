'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Box, Typography, Chip, Divider } from '@mui/material';

// Icons
import InventoryOutlinedIcon from '@mui/icons-material/InventoryOutlined';
import LocalOfferOutlinedIcon from '@mui/icons-material/LocalOfferOutlined';
import ReceiptLongOutlinedIcon from '@mui/icons-material/ReceiptLongOutlined';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import ContentCopyOutlinedIcon from '@mui/icons-material/ContentCopyOutlined';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import GavelOutlinedIcon from '@mui/icons-material/GavelOutlined';

import { ROUTES } from '@/config/constants';
import type { Product } from '@/types/product.types';
import { productService, subscribeCrmSync } from '@/services';
import {
    EntityDetailDrawer,
    DrawerSectionCard,
    DrawerMetricGrid,
    DrawerCopyButton,
    copyToClipboard,
    type AuditRevisionItem,
} from '@/components/common/Drawer';
import { PRODUCT_FORM_TABS } from './ProductForm';

export interface ProductDetailDrawerProps {
    product: Product | null;
    open: boolean;
    onClose: () => void;
    onEdit?: (id: string) => void;
}

export function ProductDetailDrawer({
    product,
    open,
    onClose,
    onEdit,
}: ProductDetailDrawerProps) {
    const router = useRouter();

    const [currentProduct, setCurrentProduct] = useState<Product | null>(product);
    const [, setSyncVersion] = useState(0);

    useEffect(() => {
        setCurrentProduct(product);
    }, [product]);

    useEffect(() => {
        if (!open || !product?.id) return;

        const refreshProduct = () => {
            const fresh = productService.getByIdSync(product.id);
            if (fresh) {
                setCurrentProduct(fresh);
            }
            setSyncVersion((v) => v + 1);
        };

        const unsubscribe = subscribeCrmSync(refreshProduct);
        return unsubscribe;
    }, [open, product?.id]);

    if (!product && !currentProduct) return null;

    const p = currentProduct || product!;

    const handleEdit = () => {
        if (onEdit) {
            onEdit(p.id);
        } else {
            router.push(ROUTES.PRODUCT_EDIT(p.id));
        }
    };

    const formatCurrency = (val?: string | number) => {
        if (!val) return '—';
        const num = typeof val === 'string' ? parseFloat(val) : val;
        if (isNaN(num)) return String(val);
        return `₹${num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    };

    // Calculate margin if MRP & Cost exist
    const costNum = parseFloat(p.cost || '0');
    const mrpNum = parseFloat(p.mrp || '0');
    const mspNum = parseFloat(p.msp || '0');
    const profitMargin = costNum > 0 && mrpNum > 0 ? (((mrpNum - costNum) / costNum) * 100).toFixed(1) : null;

    const auditRevisions: AuditRevisionItem[] = [
        {
            title: 'MSP Floor Price Revised',
            author: 'mittal.sharma',
            time: p.updatedAt ? new Date(p.updatedAt).toLocaleDateString('en-IN') : 'Today, 10:45 AM',
            from: '₹' + ((mspNum || 10000) * 0.95).toFixed(2),
            to: formatCurrency(p.msp),
            note: 'Adjusted minimum floor price based on updated OEM quarterly price list.',
            tag: 'Pricing Update',
        },
        {
            title: 'Tax Rate & HSN Statutory Compliance',
            author: 'mittal.sharma',
            time: '12-Oct-2026, 04:15 PM',
            from: '12% (Standard)',
            to: `${p.taxRate || '18%'} (${p.taxType || 'GST'})`,
            note: `HSN code ${p.hsnCode || '84715000'} mapped to revised statutory GST schedule.`,
            tag: 'Tax Revision',
        },
        {
            title: 'Product Record Initialized',
            author: p.createdBy || 'mittal.sharma',
            time: p.createdAt ? new Date(p.createdAt).toLocaleDateString('en-IN') : '05-Oct-2026, 09:30 AM',
            from: 'Draft',
            to: `Active [${p.productCode}]`,
            note: 'Catalog specification approved by inventory department.',
            tag: 'Creation',
        },
    ];

    return (
        <EntityDetailDrawer
            open={open}
            onClose={onClose}
            title={p.productName}
            subtitle={`${p.category || 'General Equipment'} • ${p.manufacturer || 'OEM Partner'}`}
            avatarBg="linear-gradient(135deg, #0284c7 0%, #0369a1 100%)"
            verified={true}
            badges={[
                {
                    label: `SKU: ${p.productCode}`,
                    isMonospace: true,
                    backgroundColor: '#eff6ff',
                    color: '#1d4ed8',
                    borderColor: '#bfdbfe',
                },
                {
                    label: `Tax: ${p.taxRate || '18%'} (${p.taxType || 'GST'})`,
                    backgroundColor: '#f8fafc',
                    color: '#475569',
                    borderColor: '#e2e8f0',
                },
            ]}
            headerActions={{
                onEdit: handleEdit,
                onView: () => router.push(ROUTES.PRODUCT_DETAIL(p.id)),
            }}
            formTabs={PRODUCT_FORM_TABS}
            tabContents={{
                overview: (
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        {/* Primary Product Header Card */}
                        <DrawerSectionCard title="PRODUCT IDENTITY & CODE" bg="#f8fafc">
                            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mt: 0.5 }}>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                    <InventoryOutlinedIcon sx={{ fontSize: 20, color: '#2563eb' }} />
                                    <Typography sx={{ fontSize: '1.02rem', fontWeight: 800, color: '#0f172a' }}>
                                        {p.productName}
                                    </Typography>
                                </Box>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                    <Chip
                                        label={p.productCode}
                                        size="small"
                                        sx={{
                                            fontFamily: 'monospace',
                                            fontWeight: 700,
                                            fontSize: '0.72rem',
                                            backgroundColor: '#eff6ff',
                                            color: '#1d4ed8',
                                            border: '1px solid #bfdbfe',
                                        }}
                                    />
                                    <DrawerCopyButton text={p.productCode} title="Copy SKU Code" iconColor="#94a3b8" />
                                </Box>
                            </Box>
                        </DrawerSectionCard>

                        {/* Section 1: Sale Information */}
                        <DrawerSectionCard
                            title="Sale Information & Classification"
                            icon={<LocalOfferOutlinedIcon sx={{ fontSize: 16, color: '#2563eb' }} />}
                        >
                            <DrawerMetricGrid
                                items={[
                                    {
                                        label: 'CATEGORY',
                                        value: p.category || 'General Equipment',
                                        valueSize: '0.92rem',
                                        valueWeight: 800,
                                        bg: '#f8fafc',
                                        borderColor: '#f1f5f9',
                                        p: 1.2,
                                    },
                                    {
                                        label: 'PRODUCT TYPE',
                                        value: p.type || 'Physical Goods',
                                        valueSize: '0.92rem',
                                        valueWeight: 800,
                                        bg: '#f8fafc',
                                        borderColor: '#f1f5f9',
                                        p: 1.2,
                                    },
                                    {
                                        label: 'HSN / SAC CODE',
                                        value: p.hsnCode || '84715000',
                                        valueSize: '0.92rem',
                                        valueWeight: 800,
                                        labelColor: '#1d4ed8',
                                        valueColor: '#1d4ed8',
                                        monospace: true,
                                        bg: '#eff6ff',
                                        borderColor: '#bfdbfe',
                                        p: 1.2,
                                    },
                                    {
                                        label: 'MANUFACTURER',
                                        value: p.manufacturer || 'Authorized Vendor',
                                        valueSize: '0.92rem',
                                        valueWeight: 800,
                                        bg: '#f8fafc',
                                        borderColor: '#f1f5f9',
                                        p: 1.2,
                                    },
                                ]}
                            />
                        </DrawerSectionCard>

                        {/* Section 2: Pricing & Tax */}
                        <DrawerSectionCard
                            title="Pricing Structure & Margins"
                            icon={<ReceiptLongOutlinedIcon sx={{ fontSize: 16, color: '#2563eb' }} />}
                        >
                            <DrawerMetricGrid
                                items={[
                                    {
                                        label: 'MAXIMUM RETAIL PRICE (MRP)',
                                        value: formatCurrency(p.mrp),
                                        valueSize: '1.15rem',
                                        valueWeight: 800,
                                        labelColor: '#166534',
                                        valueColor: '#14532d',
                                        bg: '#f0fdf4',
                                        borderColor: '#bbf7d0',
                                        sublabel: profitMargin ? (
                                            <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.4, mt: 0.5, color: '#15803d', fontSize: '0.7rem', fontWeight: 700 }}>
                                                <TrendingUpIcon sx={{ fontSize: 13 }} />
                                                +{profitMargin}% Gross Margin
                                            </Box>
                                        ) : undefined,
                                    },
                                    {
                                        label: 'MINIMUM SELLING PRICE (MSP)',
                                        value: formatCurrency(p.msp),
                                        valueSize: '1.15rem',
                                        valueWeight: 800,
                                        labelColor: '#1e40af',
                                        valueColor: '#1e3a8a',
                                        bg: '#eff6ff',
                                        borderColor: '#bfdbfe',
                                        sublabel: (
                                            <Typography sx={{ fontSize: '0.72rem', color: '#60a5fa', mt: 0.5 }}>
                                                Bottom line floor price
                                            </Typography>
                                        ),
                                    },
                                    {
                                        label: 'PURCHASE / LANDED COST',
                                        value: formatCurrency(p.cost),
                                        valueSize: '1.05rem',
                                        valueWeight: 800,
                                        valueColor: '#334155',
                                        bg: '#f8fafc',
                                    },
                                    {
                                        label: 'STANDARD DISCOUNT',
                                        value: p.discount ? `${p.discount}%` : '0%',
                                        valueSize: '1.05rem',
                                        valueWeight: 800,
                                        labelColor: '#854d0e',
                                        valueColor: '#713f12',
                                        bg: '#fefce8',
                                        borderColor: '#fef08a',
                                    },
                                ]}
                            />

                            <Divider sx={{ my: 1.5, borderColor: '#f1f5f9' }} />

                            <Typography sx={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748b', mb: 1 }}>
                                TAX SPECIFICATION & CONTRACT
                            </Typography>
                            <DrawerMetricGrid
                                columns={3}
                                gap={1.2}
                                items={[
                                    {
                                        label: 'TAX TYPE',
                                        value: p.taxType || 'GST',
                                        valueSize: '0.84rem',
                                        bg: '#f8fafc',
                                        borderColor: '#f1f5f9',
                                        p: 1,
                                    },
                                    {
                                        label: 'TAX RATE',
                                        value: p.taxRate || '18%',
                                        valueSize: '0.84rem',
                                        valueColor: '#2563eb',
                                        bg: '#f8fafc',
                                        borderColor: '#f1f5f9',
                                        p: 1,
                                    },
                                    {
                                        label: 'CONTRACT CREATE',
                                        value: (
                                            <Chip
                                                label={p.contractCreate || 'No'}
                                                size="small"
                                                sx={{
                                                    height: 18,
                                                    fontSize: '0.66rem',
                                                    fontWeight: 700,
                                                    backgroundColor: p.contractCreate === 'Yes' ? '#ecfdf5' : '#f1f5f9',
                                                    color: p.contractCreate === 'Yes' ? '#047857' : '#64748b',
                                                }}
                                            />
                                        ),
                                        bg: '#f8fafc',
                                        borderColor: '#f1f5f9',
                                        p: 1,
                                    },
                                ]}
                            />
                        </DrawerSectionCard>

                        {/* Section 3: Description & Terms */}
                        <DrawerSectionCard
                            title="Description & Commercial Terms"
                            icon={<DescriptionOutlinedIcon sx={{ fontSize: 16, color: '#2563eb' }} />}
                        >
                            <Typography sx={{ fontSize: '0.82rem', color: '#475569', lineHeight: 1.6, whiteSpace: 'pre-wrap', mb: 1.5 }}>
                                {p.description ||
                                    `${p.productName} engineered for high reliability in enterprise environments. Fully compliant with OEM standard specifications and backed by national warranty support.`}
                            </Typography>

                            {p.termsAndConditions && (
                                <>
                                    <Divider sx={{ my: 1.5, borderColor: '#f1f5f9' }} />
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.8, mb: 0.8 }}>
                                        <GavelOutlinedIcon sx={{ fontSize: 15, color: '#64748b' }} />
                                        <Typography sx={{ fontSize: '0.74rem', fontWeight: 700, color: '#64748b' }}>
                                            TERMS & CONDITIONS
                                        </Typography>
                                    </Box>
                                    <Typography sx={{ fontSize: '0.8rem', color: '#475569', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
                                        {p.termsAndConditions}
                                    </Typography>
                                </>
                            )}
                        </DrawerSectionCard>

                        {/* Metadata Card */}
                        <DrawerSectionCard p={1.5} bg="#f8fafc">
                            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 1.5 }}>
                                <Box>
                                    <Typography sx={{ fontSize: '0.68rem', color: '#94a3b8' }}>Created By</Typography>
                                    <Typography sx={{ fontSize: '0.8rem', fontWeight: 600, color: '#334155' }}>
                                        {p.createdBy || 'mittal.sharma'}
                                    </Typography>
                                </Box>
                                <Box>
                                    <Typography sx={{ fontSize: '0.68rem', color: '#94a3b8' }}>Last Updated</Typography>
                                    <Typography sx={{ fontSize: '0.8rem', fontWeight: 600, color: '#334155' }}>
                                        {p.updatedAt ? new Date(p.updatedAt).toLocaleDateString('en-IN') : 'Recently'}
                                    </Typography>
                                </Box>
                            </Box>
                        </DrawerSectionCard>
                    </Box>
                ),
            }}
            auditRevisions={auditRevisions}
            includeChangesTab={true}
            statusText="In Catalog • Active"
            primaryAction={{
                label: 'Edit Product',
                onClick: handleEdit,
            }}
            secondaryAction={{
                label: 'Copy Product Code',
                icon: <ContentCopyOutlinedIcon sx={{ fontSize: 16 }} />,
                onClick: () => copyToClipboard(p.productCode),
            }}
        />
    );
}
