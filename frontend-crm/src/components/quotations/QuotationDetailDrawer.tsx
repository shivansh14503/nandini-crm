'use client';

import React, { useState, useEffect } from 'react';
import { getCountryNameByCode } from '@/data/addressMaster';
import { useRouter } from 'next/navigation';
import {
    Box,
    Typography,
    Divider,
    Paper,
    Chip,
} from '@mui/material';

// Icons
import ApartmentOutlinedIcon from '@mui/icons-material/ApartmentOutlined';
import PersonOutlinedIcon from '@mui/icons-material/PersonOutlined';
import PhoneOutlinedIcon from '@mui/icons-material/PhoneOutlined';
import EmailOutlinedIcon from '@mui/icons-material/EmailOutlined';
import CalendarTodayOutlinedIcon from '@mui/icons-material/CalendarTodayOutlined';
import LocationOnOutlinedIcon from '@mui/icons-material/LocationOnOutlined';
import RequestQuoteOutlinedIcon from '@mui/icons-material/RequestQuoteOutlined';
import BusinessOutlinedIcon from '@mui/icons-material/BusinessOutlined';
import PaymentOutlinedIcon from '@mui/icons-material/PaymentOutlined';
import NotesOutlinedIcon from '@mui/icons-material/NotesOutlined';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';

import { ROUTES } from '@/config/constants';
import type { Quotation } from '@/types/quotation.types';
import { useQuotation } from '@/hooks/queries';
import {
    EntityDetailDrawer,
    DrawerSectionCard,
    DrawerCopyButton,
} from '@/components/common/Drawer';
import { QUOTATION_FORM_TABS } from './CreateQuoteForm';

export interface QuotationDetailDrawerProps {
    quotation: Quotation | null;
    open: boolean;
    onClose: () => void;
    onEdit?: (id: string) => void;
    onShowToast?: (message: string, severity?: 'success' | 'error' | 'info' | 'warning') => void;
}

const formatCurrency = (val: number = 0) =>
    new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR',
        maximumFractionDigits: 0,
    }).format(val);

export function QuotationDetailDrawer({
    quotation: initialQuotation,
    open,
    onClose,
    onEdit,
    onShowToast,
}: QuotationDetailDrawerProps) {
    const router = useRouter();

    const { data: freshQuotation } = useQuotation(
        open && initialQuotation?.id ? initialQuotation.id : undefined
    );
    const quotation = freshQuotation ?? initialQuotation;

    if (!quotation) return null;

    const handleEdit = () => {
        if (onEdit) {
            onEdit(quotation.id);
        } else {
            router.push(ROUTES.QUOTATION_EDIT(quotation.id));
        }
    };

    const statusColorMap: Record<string, { bg: string; color: string; border: string }> = {
        Draft: { bg: '#f1f5f9', color: '#475569', border: '#cbd5e1' },
        Sent: { bg: '#eff6ff', color: '#1d4ed8', border: '#bfdbfe' },
        Accepted: { bg: '#ecfdf5', color: '#047857', border: '#a7f3d0' },
        Rejected: { bg: '#fef2f2', color: '#b91c1c', border: '#fecaca' },
    };

    const currentStatus = String(quotation.quoteStage || quotation.status || 'Draft');
    const statusStyle = statusColorMap[currentStatus] || statusColorMap.Draft;

    // ══════════════════════════════════════════════════════════════════
    // TAB 1: OVERVIEW
    // ══════════════════════════════════════════════════════════════════
    const renderOverview = () => (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
            {/* Title / Subject Banner */}
            <Paper
                elevation={0}
                sx={{
                    p: 2,
                    backgroundColor: '#f8fafc',
                    borderRadius: '8px',
                    border: '1px solid #e2e8f0',
                }}
            >
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.5 }}>
                    <Typography sx={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
                        Quotation Title / Subject
                    </Typography>
                    <Chip
                        label={currentStatus}
                        size="small"
                        sx={{
                            backgroundColor: statusStyle.bg,
                            color: statusStyle.color,
                            border: `1px solid ${statusStyle.border}`,
                            fontWeight: 700,
                            fontSize: '0.7rem',
                            height: 20,
                        }}
                    />
                </Box>
                <Typography sx={{ fontSize: '0.94rem', fontWeight: 700, color: '#1e293b' }}>
                    {quotation.quotationTitle || quotation.quotationSubject || 'Quotation Document'}
                </Typography>
                <Typography sx={{ fontSize: '0.75rem', color: '#64748b', mt: 0.3 }}>
                    Quote Code: {quotation.quotationCode} • Prepared For: {quotation.preparedFor || 'Customer'}
                </Typography>
            </Paper>

            {/* Timeline & Validity Grid */}
            <DrawerSectionCard
                title="KEY TIMELINES & VALIDITY"
                icon={<CalendarTodayOutlinedIcon sx={{ fontSize: 16, color: '#2563eb' }} />}
            >
                <Box
                    sx={{
                        display: 'grid',
                        gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, 1fr)' },
                        gap: 1.5,
                        mt: 1,
                    }}
                >
                    <Box>
                        <Typography sx={{ fontSize: '0.72rem', color: '#64748b' }}>Quotation Date:</Typography>
                        <Typography sx={{ fontSize: '0.84rem', fontWeight: 600, color: '#0f172a' }}>
                            {quotation.quotationDate || quotation.quoteDate || '-'}
                        </Typography>
                    </Box>
                    <Box>
                        <Typography sx={{ fontSize: '0.72rem', color: '#64748b' }}>Valid Until:</Typography>
                        <Typography sx={{ fontSize: '0.84rem', fontWeight: 600, color: '#b45309' }}>
                            {quotation.validUntil || '-'}
                        </Typography>
                    </Box>
                    <Box>
                        <Typography sx={{ fontSize: '0.72rem', color: '#64748b' }}>Validation Period:</Typography>
                        <Typography sx={{ fontSize: '0.84rem', fontWeight: 600, color: '#0f172a' }}>
                            {quotation.validationPeriod || '30 Days'}
                        </Typography>
                    </Box>
                </Box>
            </DrawerSectionCard>

            {/* Deal & Commercial Context */}
            <DrawerSectionCard
                title="DEAL & RELATIONSHIP DETAILS"
                icon={<BusinessOutlinedIcon sx={{ fontSize: 16, color: '#2563eb' }} />}
            >
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.2, mt: 1 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Typography sx={{ fontSize: '0.78rem', color: '#64748b' }}>Linked Opportunity:</Typography>
                        <Typography sx={{ fontSize: '0.84rem', fontWeight: 600, color: '#2563eb' }}>
                            {quotation.opportunityName || quotation.opportunityCode || '-'}
                        </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Typography sx={{ fontSize: '0.78rem', color: '#64748b' }}>Issuing Entity:</Typography>
                        <Typography sx={{ fontSize: '0.84rem', fontWeight: 600, color: '#1e293b' }}>
                            {quotation.company || 'Nandini Infosystems'}
                        </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Typography sx={{ fontSize: '0.78rem', color: '#64748b' }}>Assigned Representative:</Typography>
                        <Typography sx={{ fontSize: '0.84rem', fontWeight: 600, color: '#1e293b' }}>
                            {quotation.assignedTo || '-'}
                        </Typography>
                    </Box>
                    {quotation.otherRef && (
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <Typography sx={{ fontSize: '0.78rem', color: '#64748b' }}>Other Reference / PO:</Typography>
                            <Typography sx={{ fontSize: '0.84rem', fontWeight: 600, color: '#1e293b' }}>
                                {quotation.otherRef}
                            </Typography>
                        </Box>
                    )}
                </Box>
            </DrawerSectionCard>

            {/* Payment & Terms Section */}
            <DrawerSectionCard
                title="PAYMENT & COMMERCIAL TERMS"
                icon={<PaymentOutlinedIcon sx={{ fontSize: 16, color: '#2563eb' }} />}
            >
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, mt: 1 }}>
                    <Box>
                        <Typography sx={{ fontSize: '0.72rem', color: '#64748b' }}>Payment Terms:</Typography>
                        <Typography sx={{ fontSize: '0.84rem', fontWeight: 700, color: '#0f172a' }}>
                            {quotation.paymentTerms || 'Standard Payment Terms'}
                        </Typography>
                        {quotation.paymentTermsDescription && (
                            <Typography sx={{ fontSize: '0.76rem', color: '#475569', mt: 0.5, lineHeight: 1.5 }}>
                                {quotation.paymentTermsDescription}
                            </Typography>
                        )}
                    </Box>

                    <Divider sx={{ borderStyle: 'dashed' }} />

                    <Box>
                        <Typography sx={{ fontSize: '0.72rem', color: '#64748b' }}>Terms & Conditions:</Typography>
                        <Typography sx={{ fontSize: '0.84rem', fontWeight: 700, color: '#0f172a' }}>
                            {quotation.termsAndCondition || quotation.termsAndConditions || 'Standard Terms'}
                        </Typography>
                        {quotation.termsAndConditionDescription && (
                            <Typography sx={{ fontSize: '0.76rem', color: '#475569', mt: 0.5, lineHeight: 1.5, whiteSpace: 'pre-line' }}>
                                {quotation.termsAndConditionDescription}
                            </Typography>
                        )}
                    </Box>
                </Box>
            </DrawerSectionCard>

            {/* Remarks / Notes if present */}
            {(quotation.remarks || quotation.notes) && (
                <DrawerSectionCard
                    title="REMARKS & INTERNAL NOTES"
                    icon={<NotesOutlinedIcon sx={{ fontSize: 16, color: '#64748b' }} />}
                    bg="#fafafa"
                >
                    <Typography sx={{ fontSize: '0.8rem', color: '#334155', fontStyle: 'italic', mt: 0.5, lineHeight: 1.6 }}>
                        {quotation.remarks || quotation.notes}
                    </Typography>
                </DrawerSectionCard>
            )}
        </Box>
    );

    // ══════════════════════════════════════════════════════════════════
    // TAB 2: LINE ITEMS
    // ══════════════════════════════════════════════════════════════════
    const renderLineItems = () => (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
            {/* Group Header */}
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Box>
                    <Typography sx={{ fontSize: '0.88rem', fontWeight: 700, color: '#1e293b' }}>
                        {quotation.groupName || 'Software Licenses & Add-ons'}
                    </Typography>
                    <Typography sx={{ fontSize: '0.74rem', color: '#64748b' }}>
                        Currency: {quotation.currency || 'Indian Rupee: ₹'}
                    </Typography>
                </Box>
                <Chip
                    label={`${quotation.lineItems?.length || 0} Items`}
                    size="small"
                    sx={{
                        backgroundColor: '#eff6ff',
                        color: '#1d4ed8',
                        border: '1px solid #bfdbfe',
                        fontWeight: 700,
                        fontSize: '0.72rem',
                    }}
                />
            </Box>

            {/* Line Items Cards */}
            {!quotation.lineItems || quotation.lineItems.length === 0 ? (
                <Box sx={{ p: 4, textAlign: 'center', backgroundColor: '#f8fafc', borderRadius: '8px', border: '1px dashed #cbd5e1' }}>
                    <Typography sx={{ fontSize: '0.84rem', color: '#64748b' }}>
                        No product line items attached to this quotation.
                    </Typography>
                </Box>
            ) : (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                    {quotation.lineItems.map((item, idx) => (
                        <DrawerSectionCard key={item.id || idx} p={1.8}>
                            <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', mb: 1 }}>
                                <Box sx={{ pr: 2 }}>
                                    <Typography sx={{ fontSize: '0.86rem', fontWeight: 700, color: '#0f172a' }}>
                                        {item.productName}
                                    </Typography>
                                    {item.description && (
                                        <Typography sx={{ fontSize: '0.75rem', color: '#64748b', mt: 0.3, lineHeight: 1.4 }}>
                                            {item.description}
                                        </Typography>
                                    )}
                                </Box>
                                <Typography sx={{ fontSize: '0.94rem', fontWeight: 800, color: '#15803d', whiteSpace: 'nowrap' }}>
                                    ₹{(item.total || 0).toLocaleString('en-IN')}
                                </Typography>
                            </Box>

                            <Box
                                sx={{
                                    display: 'grid',
                                    gridTemplateColumns: 'repeat(4, 1fr)',
                                    gap: 1,
                                    pt: 1,
                                    borderTop: '1px dashed #e2e8f0',
                                    fontSize: '0.75rem',
                                }}
                            >
                                <Box>
                                    <Typography sx={{ color: '#64748b', fontSize: '0.7rem' }}>Quantity:</Typography>
                                    <Typography sx={{ fontWeight: 600 }}>{item.quantity}</Typography>
                                </Box>
                                <Box>
                                    <Typography sx={{ color: '#64748b', fontSize: '0.7rem' }}>Unit Price:</Typography>
                                    <Typography sx={{ fontWeight: 600 }}>₹{(item.amount || 0).toLocaleString('en-IN')}</Typography>
                                </Box>
                                <Box>
                                    <Typography sx={{ color: '#64748b', fontSize: '0.7rem' }}>Discount:</Typography>
                                    <Typography sx={{ fontWeight: 600, color: '#dc2626' }}>
                                        {item.discount > 0 ? `${item.discount}${item.discountType === 'percentage' ? '%' : '₹'}` : '₹0'}
                                    </Typography>
                                </Box>
                                <Box>
                                    <Typography sx={{ color: '#64748b', fontSize: '0.7rem' }}>Tax ({item.taxRate}):</Typography>
                                    <Typography sx={{ fontWeight: 600, color: '#2563eb' }}>₹{(item.taxAmount || 0).toLocaleString('en-IN')}</Typography>
                                </Box>
                            </Box>
                        </DrawerSectionCard>
                    ))}
                </Box>
            )}

            {/* Financial Summary Breakdown Card */}
            <Paper
                elevation={0}
                sx={{
                    p: 2.2,
                    backgroundColor: '#f8fafc',
                    borderRadius: '8px',
                    border: '1.5px solid #bfdbfe',
                }}
            >
                <Typography sx={{ fontSize: '0.8rem', fontWeight: 700, color: '#1e3a8a', mb: 1.5, textTransform: 'uppercase' }}>
                    Commercial Breakdown
                </Typography>

                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                        <Typography sx={{ fontSize: '0.82rem', color: '#64748b' }}>Total Gross Amount:</Typography>
                        <Typography sx={{ fontSize: '0.84rem', fontWeight: 600, color: '#1e293b' }}>
                            {formatCurrency(quotation.totalAmount)}
                        </Typography>
                    </Box>

                    {quotation.totalDiscount > 0 && (
                        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                            <Typography sx={{ fontSize: '0.82rem', color: '#dc2626' }}>Item Discounts:</Typography>
                            <Typography sx={{ fontSize: '0.84rem', fontWeight: 600, color: '#dc2626' }}>
                                - {formatCurrency(quotation.totalDiscount)}
                            </Typography>
                        </Box>
                    )}

                    {quotation.lumpSumDiscount > 0 && (
                        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                            <Typography sx={{ fontSize: '0.82rem', color: '#dc2626' }}>Lump Sum Discount:</Typography>
                            <Typography sx={{ fontSize: '0.84rem', fontWeight: 600, color: '#dc2626' }}>
                                - {formatCurrency(quotation.lumpSumDiscount)}
                            </Typography>
                        </Box>
                    )}

                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                        <Typography sx={{ fontSize: '0.82rem', color: '#475569' }}>Subtotal:</Typography>
                        <Typography sx={{ fontSize: '0.84rem', fontWeight: 700, color: '#0f172a' }}>
                            {formatCurrency(quotation.subtotal)}
                        </Typography>
                    </Box>

                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                        <Typography sx={{ fontSize: '0.82rem', color: '#64748b' }}>Tax (GST):</Typography>
                        <Typography sx={{ fontSize: '0.84rem', fontWeight: 600, color: '#2563eb' }}>
                            + {formatCurrency(quotation.totalTax)}
                        </Typography>
                    </Box>

                    <Divider sx={{ my: 0.5, borderColor: '#cbd5e1' }} />

                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Typography sx={{ fontSize: '0.94rem', fontWeight: 800, color: '#0f172a' }}>
                            Grand Total:
                        </Typography>
                        <Typography sx={{ fontSize: '1.18rem', fontWeight: 800, color: '#15803d' }}>
                            {formatCurrency(quotation.grandTotal)}
                        </Typography>
                    </Box>
                </Box>
            </Paper>
        </Box>
    );

    // ══════════════════════════════════════════════════════════════════
    // TAB 3: ADDRESS INFORMATION
    // ══════════════════════════════════════════════════════════════════
    const renderAddress = () => (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
            {/* Customer & Organization Header Card */}
            <DrawerSectionCard
                title="ORGANIZATION & CONTACT"
                icon={<ApartmentOutlinedIcon sx={{ fontSize: 16, color: '#2563eb' }} />}
                bg="#f8fafc"
            >
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.2, mt: 1 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <BusinessOutlinedIcon sx={{ fontSize: 16, color: '#2563eb' }} />
                            <Typography sx={{ fontSize: '0.9rem', fontWeight: 700, color: '#1e3a8a' }}>
                                {quotation.organizationName || 'Unspecified Organization'}
                            </Typography>
                        </Box>
                        {quotation.gstNo && (
                            <DrawerCopyButton text={quotation.gstNo} title="Copy GSTIN" iconColor="#94a3b8" />
                        )}
                    </Box>

                    {quotation.mailingName && quotation.mailingName !== quotation.organizationName && (
                        <Typography sx={{ fontSize: '0.75rem', color: '#64748b' }}>
                            Mailing Name: {quotation.mailingName}
                        </Typography>
                    )}

                    {quotation.gstNo && (
                        <Typography sx={{ fontSize: '0.75rem', color: '#475569', fontWeight: 600 }}>
                            GSTIN: {quotation.gstNo}
                        </Typography>
                    )}

                    <Divider sx={{ my: 0.5 }} />

                    {/* Contact Person Details */}
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <PersonOutlinedIcon sx={{ fontSize: 16, color: '#64748b' }} />
                        <Typography sx={{ fontSize: '0.84rem', fontWeight: 600, color: '#1e293b' }}>
                            {quotation.contactName}
                        </Typography>
                    </Box>

                    {(quotation.contactMobile || quotation.contactNumber) && (
                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                <PhoneOutlinedIcon sx={{ fontSize: 16, color: '#64748b' }} />
                                <Typography sx={{ fontSize: '0.8rem', color: '#334155' }}>
                                    {quotation.contactMobile || quotation.contactNumber}
                                </Typography>
                            </Box>
                            <DrawerCopyButton
                                text={quotation.contactMobile || quotation.contactNumber || ''}
                                title="Copy Phone Number"
                                iconColor="#94a3b8"
                            />
                        </Box>
                    )}

                    {(quotation.contactEmail || quotation.emailAddress) && (
                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                <EmailOutlinedIcon sx={{ fontSize: 16, color: '#64748b' }} />
                                <Typography sx={{ fontSize: '0.8rem', color: '#334155' }}>
                                    {quotation.contactEmail || quotation.emailAddress}
                                </Typography>
                            </Box>
                            <DrawerCopyButton
                                text={quotation.contactEmail || quotation.emailAddress || ''}
                                title="Copy Email Address"
                                iconColor="#94a3b8"
                            />
                        </Box>
                    )}
                </Box>
            </DrawerSectionCard>

            {/* Billing Address Card */}
            <DrawerSectionCard
                title="BILLING ADDRESS"
                icon={<LocationOnOutlinedIcon sx={{ fontSize: 16, color: '#2563eb' }} />}
            >
                <Typography sx={{ fontSize: '0.84rem', color: '#1e293b', lineHeight: 1.6, mt: 0.5 }}>
                    {quotation.billingAddress || '-'}<br />
                    {quotation.billingCity ? `${quotation.billingCity}, ` : ''}
                    {quotation.billingState || ''}
                    {quotation.billingPostalCode ? ` - ${quotation.billingPostalCode}` : ''}<br />
                    {getCountryNameByCode(quotation.billingCountry || 'IN')}
                </Typography>
            </DrawerSectionCard>

            {/* Shipping Address Card */}
            <DrawerSectionCard
                title="SHIPPING ADDRESS"
                icon={<LocationOnOutlinedIcon sx={{ fontSize: 16, color: '#2563eb' }} />}
                action={
                    quotation.copyAddressFromBilling ? (
                        <Chip
                            label="Same as Billing"
                            size="small"
                            sx={{
                                height: 20,
                                fontSize: '0.68rem',
                                fontWeight: 600,
                                backgroundColor: '#f0fdf4',
                                color: '#166534',
                                border: '1px solid #bbf7d0',
                            }}
                        />
                    ) : undefined
                }
            >
                <Typography sx={{ fontSize: '0.84rem', color: '#1e293b', lineHeight: 1.6, mt: 0.5 }}>
                    {(quotation.shippingAddress || quotation.billingAddress) || '-'}<br />
                    {(quotation.shippingCity || quotation.billingCity) ? `${quotation.shippingCity || quotation.billingCity}, ` : ''}
                    {quotation.shippingState || quotation.billingState || ''}
                    {(quotation.shippingPostalCode || quotation.billingPostalCode) ? ` - ${quotation.shippingPostalCode || quotation.billingPostalCode}` : ''}<br />
                    {getCountryNameByCode(quotation.shippingCountry || quotation.billingCountry || 'IN')}
                </Typography>
            </DrawerSectionCard>
        </Box>
    );

    return (
        <EntityDetailDrawer
            open={open}
            onClose={onClose}
            title={quotation.quotationCode}
            subtitle={`${quotation.quotationTitle || quotation.quotationSubject || 'Quotation'} • ${quotation.organizationName}`}
            avatarText={quotation.quotationCode.replace(/^QT-0*/i, 'QT-')}
            avatarIcon={<RequestQuoteOutlinedIcon sx={{ fontSize: 24, color: '#ffffff' }} />}
            avatarBg="linear-gradient(135deg, #1d4ed8 0%, #2563eb 100%)"
            statusText={`Valid Until: ${quotation.validUntil || quotation.quoteDate || '-'}`}
            badges={[
                {
                    label: currentStatus,
                    backgroundColor: statusStyle.bg,
                    color: statusStyle.color,
                    borderColor: statusStyle.border,
                },
                {
                    label: `₹${(quotation.grandTotal || 0).toLocaleString('en-IN')}`,
                    backgroundColor: '#f0fdf4',
                    color: '#15803d',
                    borderColor: '#bbf7d0',
                },
                {
                    label: quotation.assignedTo || 'Unassigned',
                    backgroundColor: '#f1f5f9',
                    color: '#475569',
                    borderColor: '#cbd5e1',
                },
            ]}
            headerActions={{
                onEdit: handleEdit,
                onView: () => router.push(ROUTES.QUOTATION_DETAIL(quotation.id)),
            }}
            primaryAction={{
                label: 'Edit Quotation',
                onClick: handleEdit,
                icon: <EditOutlinedIcon sx={{ fontSize: 16 }} />,
            }}
            formTabs={QUOTATION_FORM_TABS}
            tabContents={{
                overview: renderOverview(),
                line_items: renderLineItems(),
                address: renderAddress(),
            }}
            auditEntity={{ type: 'quotations', id: quotation.id }}
            includeChangesTab={true}
        />
    );
}

export default QuotationDetailDrawer;
