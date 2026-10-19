'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import {
    Box,
    Typography,
    Chip,
    Tooltip,
    IconButton,
    Divider,
} from '@mui/material';

// Icons
import InventoryOutlinedIcon from '@mui/icons-material/InventoryOutlined';
import LocalOfferOutlinedIcon from '@mui/icons-material/LocalOfferOutlined';
import ReceiptLongOutlinedIcon from '@mui/icons-material/ReceiptLongOutlined';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import ContentCopyOutlinedIcon from '@mui/icons-material/ContentCopyOutlined';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import GavelOutlinedIcon from '@mui/icons-material/GavelOutlined';

import { ROUTES } from '../../config/constants';
import type { Product } from '../../types/product.types';
import { EntityDetailDrawer, type DrawerTabItem, type AuditRevisionItem, buildDrawerTabs } from '../common/Drawer';
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

    if (!product) return null;

    const p = product;

    const handleEdit = () => {
        if (onEdit) {
            onEdit(p.id);
        } else {
            router.push(ROUTES.PRODUCT_EDIT(p.id));
        }
    };

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
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

    // ── Derive Drawer Tabs dynamically from Creation Form Single Source of Truth ──
    const tabs: DrawerTabItem[] = buildDrawerTabs(PRODUCT_FORM_TABS, {
        overview: (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    {/* Primary Product Header Card */}
                    <Box
                        sx={{
                            p: 2,
                            borderRadius: '8px',
                            backgroundColor: '#f8fafc',
                            border: '1px solid #e2e8f0',
                        }}
                    >
                        <Typography sx={{ fontSize: '0.68rem', fontWeight: 700, color: '#64748b', letterSpacing: '0.04em' }}>
                            PRODUCT IDENTITY & CODE
                        </Typography>
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
                                <Tooltip title="Copy SKU Code">
                                    <IconButton size="small" onClick={() => copyToClipboard(p.productCode)}>
                                        <ContentCopyOutlinedIcon sx={{ fontSize: 13, color: '#94a3b8' }} />
                                    </IconButton>
                                </Tooltip>
                            </Box>
                        </Box>
                    </Box>

                    {/* Section 1: Sale Information */}
                    <Box sx={{ p: 2, borderRadius: '8px', border: '1px solid #e2e8f0', backgroundColor: '#ffffff' }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.8, mb: 1.5 }}>
                            <LocalOfferOutlinedIcon sx={{ fontSize: 16, color: '#2563eb' }} />
                            <Typography sx={{ fontSize: '0.78rem', fontWeight: 700, color: '#0f172a' }}>
                                Sale Information & Classification
                            </Typography>
                        </Box>

                        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 1.5 }}>
                            <Box sx={{ p: 1.2, borderRadius: '6px', backgroundColor: '#f8fafc', border: '1px solid #f1f5f9' }}>
                                <Typography sx={{ fontSize: '0.68rem', fontWeight: 700, color: '#64748b' }}>CATEGORY</Typography>
                                <Typography sx={{ fontSize: '0.92rem', fontWeight: 800, color: '#0f172a', mt: 0.3 }}>
                                    {p.category || 'General Equipment'}
                                </Typography>
                            </Box>

                            <Box sx={{ p: 1.2, borderRadius: '6px', backgroundColor: '#f8fafc', border: '1px solid #f1f5f9' }}>
                                <Typography sx={{ fontSize: '0.68rem', fontWeight: 700, color: '#64748b' }}>PRODUCT TYPE</Typography>
                                <Typography sx={{ fontSize: '0.92rem', fontWeight: 800, color: '#0f172a', mt: 0.3 }}>
                                    {p.type || 'Physical Goods'}
                                </Typography>
                            </Box>

                            <Box sx={{ p: 1.2, borderRadius: '6px', backgroundColor: '#eff6ff', border: '1px solid #bfdbfe' }}>
                                <Typography sx={{ fontSize: '0.68rem', fontWeight: 700, color: '#1d4ed8' }}>HSN / SAC CODE</Typography>
                                <Typography sx={{ fontSize: '0.92rem', fontWeight: 800, color: '#1d4ed8', fontFamily: 'monospace', mt: 0.3 }}>
                                    {p.hsnCode || '84715000'}
                                </Typography>
                            </Box>

                            <Box sx={{ p: 1.2, borderRadius: '6px', backgroundColor: '#f8fafc', border: '1px solid #f1f5f9' }}>
                                <Typography sx={{ fontSize: '0.68rem', fontWeight: 700, color: '#64748b' }}>MANUFACTURER</Typography>
                                <Typography sx={{ fontSize: '0.92rem', fontWeight: 800, color: '#0f172a', mt: 0.3 }}>
                                    {p.manufacturer || 'Authorized Vendor'}
                                </Typography>
                            </Box>
                        </Box>
                    </Box>

                    {/* Section 2: Pricing & Tax */}
                    <Box sx={{ p: 2, borderRadius: '8px', border: '1px solid #e2e8f0', backgroundColor: '#ffffff' }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.8, mb: 1.5 }}>
                            <ReceiptLongOutlinedIcon sx={{ fontSize: 16, color: '#2563eb' }} />
                            <Typography sx={{ fontSize: '0.78rem', fontWeight: 700, color: '#0f172a' }}>
                                Pricing Structure & Margins
                            </Typography>
                        </Box>

                        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 1.5 }}>
                            <Box sx={{ p: 1.5, borderRadius: '8px', backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0' }}>
                                <Typography sx={{ fontSize: '0.68rem', fontWeight: 700, color: '#166534', letterSpacing: '0.04em' }}>
                                    MAXIMUM RETAIL PRICE (MRP)
                                </Typography>
                                <Typography sx={{ fontSize: '1.15rem', fontWeight: 800, color: '#14532d', mt: 0.3 }}>
                                    {formatCurrency(p.mrp)}
                                </Typography>
                                {profitMargin && (
                                    <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.4, mt: 0.5, color: '#15803d', fontSize: '0.7rem', fontWeight: 700 }}>
                                        <TrendingUpIcon sx={{ fontSize: 13 }} />
                                        +{profitMargin}% Gross Margin
                                    </Box>
                                )}
                            </Box>

                            <Box sx={{ p: 1.5, borderRadius: '8px', backgroundColor: '#eff6ff', border: '1px solid #bfdbfe' }}>
                                <Typography sx={{ fontSize: '0.68rem', fontWeight: 700, color: '#1e40af', letterSpacing: '0.04em' }}>
                                    MINIMUM SELLING PRICE (MSP)
                                </Typography>
                                <Typography sx={{ fontSize: '1.15rem', fontWeight: 800, color: '#1e3a8a', mt: 0.3 }}>
                                    {formatCurrency(p.msp)}
                                </Typography>
                                <Typography sx={{ fontSize: '0.72rem', color: '#60a5fa', mt: 0.5 }}>
                                    Bottom line floor price
                                </Typography>
                            </Box>

                            <Box sx={{ p: 1.5, borderRadius: '8px', backgroundColor: '#f8fafc', border: '1px solid #e2e8f0' }}>
                                <Typography sx={{ fontSize: '0.68rem', fontWeight: 700, color: '#64748b', letterSpacing: '0.04em' }}>
                                    PURCHASE / LANDED COST
                                </Typography>
                                <Typography sx={{ fontSize: '1.05rem', fontWeight: 800, color: '#334155', mt: 0.3 }}>
                                    {formatCurrency(p.cost)}
                                </Typography>
                            </Box>

                            <Box sx={{ p: 1.5, borderRadius: '8px', backgroundColor: '#fefce8', border: '1px solid #fef08a' }}>
                                <Typography sx={{ fontSize: '0.68rem', fontWeight: 700, color: '#854d0e', letterSpacing: '0.04em' }}>
                                    STANDARD DISCOUNT
                                </Typography>
                                <Typography sx={{ fontSize: '1.05rem', fontWeight: 800, color: '#713f12', mt: 0.3 }}>
                                    {p.discount ? `${p.discount}%` : '0%'}
                                </Typography>
                            </Box>
                        </Box>

                        <Divider sx={{ my: 1.5, borderColor: '#f1f5f9' }} />

                        {/* Tax Structure */}
                        <Typography sx={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748b', mb: 1 }}>
                            TAX SPECIFICATION & CONTRACT
                        </Typography>
                        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1.2 }}>
                            <Box sx={{ p: 1, backgroundColor: '#f8fafc', borderRadius: '6px', border: '1px solid #f1f5f9' }}>
                                <Typography sx={{ fontSize: '0.66rem', color: '#64748b', fontWeight: 600 }}>TAX TYPE</Typography>
                                <Typography sx={{ fontSize: '0.84rem', fontWeight: 700, color: '#0f172a', mt: 0.2 }}>
                                    {p.taxType || 'GST'}
                                </Typography>
                            </Box>
                            <Box sx={{ p: 1, backgroundColor: '#f8fafc', borderRadius: '6px', border: '1px solid #f1f5f9' }}>
                                <Typography sx={{ fontSize: '0.66rem', color: '#64748b', fontWeight: 600 }}>TAX RATE</Typography>
                                <Typography sx={{ fontSize: '0.84rem', fontWeight: 700, color: '#2563eb', mt: 0.2 }}>
                                    {p.taxRate || '18%'}
                                </Typography>
                            </Box>
                            <Box sx={{ p: 1, backgroundColor: '#f8fafc', borderRadius: '6px', border: '1px solid #f1f5f9' }}>
                                <Typography sx={{ fontSize: '0.66rem', color: '#64748b', fontWeight: 600 }}>CONTRACT CREATE</Typography>
                                <Chip
                                    label={p.contractCreate || 'No'}
                                    size="small"
                                    sx={{
                                        mt: 0.2,
                                        height: 18,
                                        fontSize: '0.66rem',
                                        fontWeight: 700,
                                        backgroundColor: p.contractCreate === 'Yes' ? '#ecfdf5' : '#f1f5f9',
                                        color: p.contractCreate === 'Yes' ? '#047857' : '#64748b',
                                    }}
                                />
                            </Box>
                        </Box>
                    </Box>

                    {/* Section 3: Description & Terms */}
                    <Box sx={{ p: 2, borderRadius: '8px', border: '1px solid #e2e8f0', backgroundColor: '#ffffff' }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.8, mb: 1 }}>
                            <DescriptionOutlinedIcon sx={{ fontSize: 16, color: '#2563eb' }} />
                            <Typography sx={{ fontSize: '0.78rem', fontWeight: 700, color: '#0f172a' }}>
                                Description & Commercial Terms
                            </Typography>
                        </Box>
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
                    </Box>

                    {/* Metadata Card */}
                    <Box sx={{ p: 1.5, borderRadius: '8px', backgroundColor: '#f8fafc', border: '1px solid #e2e8f0' }}>
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
                    </Box>
                </Box>
        ),
    });

    // Audit revisions for the standardized "Changes" tab
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
            }}
            tabs={tabs}
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
