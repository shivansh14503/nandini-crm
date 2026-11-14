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
import { useProduct } from '@/hooks/queries';
import {
    EntityDetailDrawer,
    DrawerSectionCard,
    DrawerMetricGrid,
    DrawerCopyButton,
    copyToClipboard,
} from '@/components/common/Drawer';
import { PRODUCT_FORM_TABS } from './ProductForm';
import { DynamicDrawerCustomFields } from '@/components/common/Drawer/DynamicDrawerCustomFields';

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

    const { data: freshProduct } = useProduct(open && product?.id ? product.id : undefined);
    const p = freshProduct ?? product;

    if (!p) return null;

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
                    backgroundColor: 'var(--mui-palette-primary-soft)',
                    color: 'var(--crm-text-blue-700)',
                    borderColor: 'var(--mui-palette-primary-softBorder)',
                },
                {
                    label: `Tax: ${p.taxRate || '18%'} (${p.taxType || 'GST'})`,
                    backgroundColor: 'var(--mui-palette-background-subtle)',
                    color: 'var(--crm-slate-600)',
                    borderColor: 'var(--mui-palette-border-main)',
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
                        <DrawerSectionCard title="PRODUCT IDENTITY & CODE" bg="var(--mui-palette-background-subtle)">
                            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mt: 0.5 }}>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                    <InventoryOutlinedIcon sx={{ fontSize: 20, color: 'var(--crm-text-blue-600)' }} />
                                    <Typography sx={{ fontSize: '1.02rem', fontWeight: 800, color: 'var(--crm-slate-900)' }}>
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
                                            backgroundColor: 'var(--mui-palette-primary-soft)',
                                            color: 'var(--crm-text-blue-700)',
                                            border: '1px solid var(--mui-palette-primary-softBorder)',
                                        }}
                                    />
                                    <DrawerCopyButton text={p.productCode} title="Copy SKU Code" iconColor="var(--mui-palette-text-muted)" />
                                </Box>
                            </Box>
                        </DrawerSectionCard>

                        {/* Admin-defined custom fields */}
                        <DynamicDrawerCustomFields module="products" record={p} />

                        {/* Section 1: Sale Information */}
                        <DrawerSectionCard
                            title="Sale Information & Classification"
                            icon={<LocalOfferOutlinedIcon sx={{ fontSize: 16, color: 'var(--crm-text-blue-600)' }} />}
                        >
                            <DrawerMetricGrid
                                items={[
                                    {
                                        label: 'CATEGORY',
                                        value: p.category || 'General Equipment',
                                        valueSize: '0.92rem',
                                        valueWeight: 800,
                                        bg: 'var(--mui-palette-background-subtle)',
                                        borderColor: 'var(--mui-palette-border-light)',
                                        p: 1.2,
                                    },
                                    {
                                        label: 'PRODUCT TYPE',
                                        value: p.type || 'Physical Goods',
                                        valueSize: '0.92rem',
                                        valueWeight: 800,
                                        bg: 'var(--mui-palette-background-subtle)',
                                        borderColor: 'var(--mui-palette-border-light)',
                                        p: 1.2,
                                    },
                                    {
                                        label: 'HSN / SAC CODE',
                                        value: p.hsnCode || '84715000',
                                        valueSize: '0.92rem',
                                        valueWeight: 800,
                                        labelColor: 'var(--crm-text-blue-700)',
                                        valueColor: 'var(--crm-text-blue-700)',
                                        monospace: true,
                                        bg: 'var(--mui-palette-primary-soft)',
                                        borderColor: 'var(--mui-palette-primary-softBorder)',
                                        p: 1.2,
                                    },
                                    {
                                        label: 'MANUFACTURER',
                                        value: p.manufacturer || 'Authorized Vendor',
                                        valueSize: '0.92rem',
                                        valueWeight: 800,
                                        bg: 'var(--mui-palette-background-subtle)',
                                        borderColor: 'var(--mui-palette-border-light)',
                                        p: 1.2,
                                    },
                                ]}
                            />
                        </DrawerSectionCard>

                        {/* Section 2: Pricing & Tax */}
                        <DrawerSectionCard
                            title="Pricing Structure & Margins"
                            icon={<ReceiptLongOutlinedIcon sx={{ fontSize: 16, color: 'var(--crm-text-blue-600)' }} />}
                        >
                            <DrawerMetricGrid
                                items={[
                                    {
                                        label: 'MAXIMUM RETAIL PRICE (MRP)',
                                        value: formatCurrency(p.mrp),
                                        valueSize: '1.15rem',
                                        valueWeight: 800,
                                        labelColor: 'var(--crm-green-800)',
                                        valueColor: 'var(--crm-green-900)',
                                        bg: 'var(--crm-green-50)',
                                        borderColor: 'var(--crm-green-200)',
                                        sublabel: profitMargin ? (
                                            <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.4, mt: 0.5, color: 'var(--crm-green-700)', fontSize: '0.7rem', fontWeight: 700 }}>
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
                                        labelColor: 'var(--crm-text-blue-800)',
                                        valueColor: 'var(--crm-text-blue-900)',
                                        bg: 'var(--mui-palette-primary-soft)',
                                        borderColor: 'var(--mui-palette-primary-softBorder)',
                                        sublabel: (
                                            <Typography sx={{ fontSize: '0.72rem', color: 'var(--crm-text-blue-400)', mt: 0.5 }}>
                                                Bottom line floor price
                                            </Typography>
                                        ),
                                    },
                                    {
                                        label: 'PURCHASE / LANDED COST',
                                        value: formatCurrency(p.cost),
                                        valueSize: '1.05rem',
                                        valueWeight: 800,
                                        valueColor: 'var(--crm-slate-700)',
                                        bg: 'var(--mui-palette-background-subtle)',
                                    },
                                    {
                                        label: 'STANDARD DISCOUNT',
                                        value: p.discount ? `${p.discount}%` : '0%',
                                        valueSize: '1.05rem',
                                        valueWeight: 800,
                                        labelColor: 'var(--crm-yellow-800)',
                                        valueColor: 'var(--crm-yellow-900)',
                                        bg: 'var(--crm-yellow-50)',
                                        borderColor: 'var(--crm-yellow-200)',
                                    },
                                ]}
                            />

                            <Divider sx={{ my: 1.5, borderColor: 'var(--mui-palette-border-light)' }} />

                            <Typography sx={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--mui-palette-text-secondary)', mb: 1 }}>
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
                                        bg: 'var(--mui-palette-background-subtle)',
                                        borderColor: 'var(--mui-palette-border-light)',
                                        p: 1,
                                    },
                                    {
                                        label: 'TAX RATE',
                                        value: p.taxRate || '18%',
                                        valueSize: '0.84rem',
                                        valueColor: 'var(--crm-text-blue-600)',
                                        bg: 'var(--mui-palette-background-subtle)',
                                        borderColor: 'var(--mui-palette-border-light)',
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
                                                    backgroundColor: p.contractCreate === 'Yes' ? 'var(--mui-palette-success-soft)' : 'var(--mui-palette-background-hover)',
                                                    color: p.contractCreate === 'Yes' ? 'var(--crm-emerald-700)' : 'var(--mui-palette-text-secondary)',
                                                }}
                                            />
                                        ),
                                        bg: 'var(--mui-palette-background-subtle)',
                                        borderColor: 'var(--mui-palette-border-light)',
                                        p: 1,
                                    },
                                ]}
                            />
                        </DrawerSectionCard>

                        {/* Section 3: Description & Terms */}
                        <DrawerSectionCard
                            title="Description & Commercial Terms"
                            icon={<DescriptionOutlinedIcon sx={{ fontSize: 16, color: 'var(--crm-text-blue-600)' }} />}
                        >
                            <Typography sx={{ fontSize: '0.82rem', color: 'var(--crm-slate-600)', lineHeight: 1.6, whiteSpace: 'pre-wrap', mb: 1.5 }}>
                                {p.description ||
                                    `${p.productName} engineered for high reliability in enterprise environments. Fully compliant with OEM standard specifications and backed by national warranty support.`}
                            </Typography>

                            {p.termsAndConditions && (
                                <>
                                    <Divider sx={{ my: 1.5, borderColor: 'var(--mui-palette-border-light)' }} />
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.8, mb: 0.8 }}>
                                        <GavelOutlinedIcon sx={{ fontSize: 15, color: 'var(--mui-palette-text-secondary)' }} />
                                        <Typography sx={{ fontSize: '0.74rem', fontWeight: 700, color: 'var(--mui-palette-text-secondary)' }}>
                                            TERMS & CONDITIONS
                                        </Typography>
                                    </Box>
                                    <Typography sx={{ fontSize: '0.8rem', color: 'var(--crm-slate-600)', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
                                        {p.termsAndConditions}
                                    </Typography>
                                </>
                            )}
                        </DrawerSectionCard>
                    </Box>
                ),
            }}
            auditEntity={{ type: 'products', id: p.id }}
            recordAudit={p}
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
