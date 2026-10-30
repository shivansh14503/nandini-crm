'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Box, Typography, Chip, Divider } from '@mui/material';

// Icons
import BusinessOutlinedIcon from '@mui/icons-material/BusinessOutlined';
import PersonOutlinedIcon from '@mui/icons-material/PersonOutlined';
import PhoneOutlinedIcon from '@mui/icons-material/PhoneOutlined';
import EmailOutlinedIcon from '@mui/icons-material/EmailOutlined';
import CalendarMonthOutlinedIcon from '@mui/icons-material/CalendarMonthOutlined';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import RequestQuoteOutlinedIcon from '@mui/icons-material/RequestQuoteOutlined';
import CheckCircleOutlinedIcon from '@mui/icons-material/CheckCircleOutlined';

import { ROUTES } from '@/config/constants';
import type { Opportunity } from '@/types/opportunity.types';
import {
    EntityDetailDrawer,
    DrawerSectionCard,
    DrawerCopyButton,
} from '@/components/common/Drawer';
import { AppToast } from '@/components/common/AppToast';
import { useOpportunity, useOrganization, useOrganizations, useQuotations } from '@/hooks/queries';
import { OPPORTUNITY_FORM_TABS } from './OpportunityForm';

export interface OpportunityDetailDrawerProps {
    opportunity: Opportunity | null;
    open: boolean;
    onClose: () => void;
    onEdit?: (id: string) => void;
    onShowToast?: (message: string, severity?: 'success' | 'error' | 'info' | 'warning') => void;
}

export function OpportunityDetailDrawer({
    opportunity,
    open,
    onClose,
    onEdit,
    onShowToast,
}: OpportunityDetailDrawerProps) {
    const router = useRouter();

    const { data: freshOpp } = useOpportunity(open && opportunity?.id ? opportunity.id : undefined);
    const opp = freshOpp ?? opportunity;

    const { data: linkedOrgById } = useOrganization(
        open && opp?.organizationId ? opp.organizationId : undefined
    );
    const { data: organizations } = useOrganizations(undefined, {
        enabled: Boolean(open && opp && !opp.organizationId && opp.organizationName),
    });
    const { data: linkedQuotes } = useQuotations(
        opp?.id ? { opportunityId: opp.id } : undefined,
        { enabled: Boolean(open && opp?.id) }
    );

    const [toast, setToast] = useState<{
        open: boolean;
        message: string;
        severity: 'success' | 'error' | 'info' | 'warning';
    }>({
        open: false,
        message: '',
        severity: 'error',
    });

    if (!opp) return null;

    const triggerToast = (
        message: string,
        severity: 'success' | 'error' | 'info' | 'warning' = 'error'
    ) => {
        setToast({ open: true, message, severity });
        onShowToast?.(message, severity);
    };

    // Check whether the linked Organization has a complete address
    const linkedOrg =
        linkedOrgById ??
        organizations?.find(
            (o) =>
                o.organizationName.trim().toLowerCase() ===
                opp.organizationName.trim().toLowerCase()
        );

    const billingStreet = (linkedOrg?.billingStreet || linkedOrg?.billingAddress || '').trim();
    const billingCity = (linkedOrg?.billingCity || '').trim();
    const billingState = (linkedOrg?.billingState || '').trim();
    const billingPostalCode = (linkedOrg?.billingPostalCode || '').trim();

    const hasAddress = Boolean(
        billingStreet && billingCity && billingState && billingPostalCode
    );

    const existingQuote = linkedQuotes?.[0];
    const isQuoteCreated = Boolean(existingQuote);

    const handleCreateQuote = () => {
        if (!hasAddress) {
            triggerToast(
                'Address is required before creating a quotation. Please update the address details first.',
                'error'
            );
            return;
        }

        router.push(ROUTES.OPPORTUNITY_CREATE_QUOTE(opp.id));
    };

    const handleEdit = () => {
        if (onEdit) {
            onEdit(opp.id);
        } else {
            router.push(ROUTES.OPPORTUNITY_EDIT(opp.id));
        }
    };

    const getStageColor = (stage: string) => {
        switch (stage) {
            case 'Closed Won':
                return { bg: '#dcfce7', text: '#15803d', border: '#86efac' };
            case 'Closed Lost':
                return { bg: '#fee2e2', text: '#b91c1c', border: '#fca5a5' };
            case 'Negotiation':
            case 'Proposal/Price Quote':
                return { bg: '#fef3c7', text: '#b45309', border: '#fde68a' };
            default:
                return { bg: '#eff6ff', text: '#1d4ed8', border: '#bfdbfe' };
        }
    };

    const stageColors = getStageColor(opp.salesStage);

    return (
        <>
            <EntityDetailDrawer
            open={open}
            onClose={onClose}
            title={opp.organizationName}
            subtitle={`${opp.opportunityCode} • ${opp.contactName}`}
            avatarText={opp.organizationName.substring(0, 2).toUpperCase()}
            avatarBg="#1e3a8a"
            badges={[
                {
                    label: opp.salesStage,
                    backgroundColor: stageColors.bg,
                    color: stageColors.text,
                    borderColor: stageColors.border,
                },
                {
                    label: `₹${opp.grandTotal.toLocaleString('en-IN')}`,
                    backgroundColor: '#f0fdf4',
                    color: '#15803d',
                    borderColor: '#bbf7d0',
                },
                {
                    label: opp.type,
                    backgroundColor: '#f1f5f9',
                    color: '#475569',
                    borderColor: '#cbd5e1',
                },
            ]}
            headerActions={{
                onEdit: handleEdit,
                onView: () => router.push(ROUTES.OPPORTUNITY_DETAIL(opp.id)),
            }}
            formTabs={OPPORTUNITY_FORM_TABS}
            tabContents={{
                basic: (
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
                        {/* Organization & Deal Card */}
                        <DrawerSectionCard title="CLIENT ORGANIZATION" bg="#f8fafc">
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5 }}>
                                <BusinessOutlinedIcon sx={{ fontSize: 18, color: '#2563eb' }} />
                                <Typography sx={{ fontSize: '0.98rem', fontWeight: 800, color: '#1e293b' }}>
                                    {opp.organizationName}
                                </Typography>
                            </Box>
                            <Typography sx={{ fontSize: '0.75rem', color: '#64748b', mt: 0.3 }}>
                                Deal Ref: {opp.opportunityCode} • Type: {opp.type}
                            </Typography>
                        </DrawerSectionCard>

                        {/* Primary Contact Person Details */}
                        <DrawerSectionCard title="CONTACT PERSON DETAILS">
                            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.2, mt: 1 }}>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                    <PersonOutlinedIcon sx={{ fontSize: 16, color: '#64748b' }} />
                                    <Typography sx={{ fontSize: '0.85rem', fontWeight: 600, color: '#1e293b' }}>
                                        {opp.contactName}
                                    </Typography>
                                </Box>

                                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                        <PhoneOutlinedIcon sx={{ fontSize: 16, color: '#64748b' }} />
                                        <Typography sx={{ fontSize: '0.82rem', color: '#1e293b' }}>
                                            {opp.contactNumber}
                                        </Typography>
                                    </Box>
                                    <DrawerCopyButton text={opp.contactNumber} title="Copy Phone Number" iconColor="#94a3b8" />
                                </Box>

                                {opp.emailAddress && (
                                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                            <EmailOutlinedIcon sx={{ fontSize: 16, color: '#64748b' }} />
                                            <Typography sx={{ fontSize: '0.82rem', color: '#1e293b' }}>
                                                {opp.emailAddress}
                                            </Typography>
                                        </Box>
                                        <DrawerCopyButton text={opp.emailAddress} title="Copy Email" iconColor="#94a3b8" />
                                    </Box>
                                )}
                            </Box>
                        </DrawerSectionCard>

                        {/* Product Categories */}
                        <Box>
                            <Typography sx={{ fontSize: '0.68rem', fontWeight: 700, color: '#64748b', mb: 1, letterSpacing: '0.04em' }}>
                                PRODUCT INTEREST
                            </Typography>
                            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.8 }}>
                                {(opp.productCategory || []).map((cat) => (
                                    <Chip
                                        key={cat}
                                        label={cat}
                                        size="small"
                                        sx={{
                                            fontSize: '0.75rem',
                                            fontWeight: 600,
                                            backgroundColor: '#eff6ff',
                                            color: '#1d4ed8',
                                            border: '1px solid #bfdbfe',
                                        }}
                                    />
                                ))}
                            </Box>
                        </Box>

                        {/* Next Followup Info */}
                        <DrawerSectionCard bg="#fffbeb" borderColor="#fde68a">
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                                <CalendarMonthOutlinedIcon sx={{ fontSize: 20, color: '#b45309' }} />
                                <Box>
                                    <Typography sx={{ fontSize: '0.8rem', fontWeight: 700, color: '#92400e' }}>
                                        Next Followup: {opp.nextFollowupDate} {opp.nextFollowupTime ? `at ${opp.nextFollowupTime}` : ''}
                                    </Typography>
                                    <Typography sx={{ fontSize: '0.72rem', color: '#b45309' }}>
                                        Method: {opp.followupType || 'Call'} • Lead Given By: {opp.leadGivenBy}
                                    </Typography>
                                </Box>
                            </Box>
                        </DrawerSectionCard>

                        {/* Scope & Descriptions */}
                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                            <DrawerSectionCard title="ACTION BRIEF / ADD DESCRIPTION">
                                <Typography sx={{ fontSize: '0.82rem', color: '#334155', lineHeight: 1.5 }}>
                                    {opp.addDescription}
                                </Typography>
                            </DrawerSectionCard>

                            {opp.description && (
                                <DrawerSectionCard title="DETAILED SCOPE / NOTES">
                                    <Typography sx={{ fontSize: '0.82rem', color: '#334155', lineHeight: 1.5 }}>
                                        {opp.description}
                                    </Typography>
                                </DrawerSectionCard>
                            )}
                        </Box>

                        {/* Billing Details & Commission */}
                        <DrawerSectionCard title="BILLING & COMMISSION" bg="#f8fafc">
                            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5, mt: 1 }}>
                                <Box>
                                    <Typography sx={{ fontSize: '0.7rem', color: '#64748b' }}>Tally Serial No:</Typography>
                                    <Typography sx={{ fontSize: '0.82rem', fontWeight: 600, color: '#1e293b' }}>
                                        {opp.tallySerialNo || '—'}
                                    </Typography>
                                </Box>
                                <Box>
                                    <Typography sx={{ fontSize: '0.7rem', color: '#64748b' }}>Invoice No:</Typography>
                                    <Typography sx={{ fontSize: '0.82rem', fontWeight: 600, color: '#1e293b' }}>
                                        {opp.invoiceNo || '—'}
                                    </Typography>
                                </Box>
                                <Box>
                                    <Typography sx={{ fontSize: '0.7rem', color: '#64748b' }}>Commission:</Typography>
                                    <Typography sx={{ fontSize: '0.82rem', fontWeight: 600, color: '#1e293b' }}>
                                        {opp.commission || 'Standard (10%)'}
                                    </Typography>
                                </Box>
                                <Box>
                                    <Typography sx={{ fontSize: '0.7rem', color: '#64748b' }}>Document Attached:</Typography>
                                    <Typography sx={{ fontSize: '0.82rem', fontWeight: 600, color: '#1e293b' }}>
                                        {opp.addDocument || 'No'}
                                    </Typography>
                                </Box>
                            </Box>
                        </DrawerSectionCard>
                    </Box>
                ),
                line_items: (
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <Typography sx={{ fontSize: '0.85rem', fontWeight: 700, color: '#1e293b' }}>
                                {opp.groupName || 'Products & Services'}
                            </Typography>
                            <Typography sx={{ fontSize: '0.78rem', color: '#64748b' }}>
                                Currency: {opp.currency || 'Indian Rupee: ₹'}
                            </Typography>
                        </Box>

                        {!opp.lineItems || opp.lineItems.length === 0 ? (
                            <Box sx={{ p: 3, textAlign: 'center', backgroundColor: '#f8fafc', borderRadius: '8px' }}>
                                <Typography sx={{ fontSize: '0.82rem', color: '#64748b' }}>
                                    No line items specified for this opportunity.
                                </Typography>
                            </Box>
                        ) : (
                            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                                {opp.lineItems.map((item, idx) => (
                                    <DrawerSectionCard key={item.id || idx} p={1.8}>
                                        <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', mb: 1 }}>
                                            <Box>
                                                <Typography sx={{ fontSize: '0.85rem', fontWeight: 700, color: '#1e293b' }}>
                                                    {item.productName}
                                                </Typography>
                                                {item.description && (
                                                    <Typography sx={{ fontSize: '0.75rem', color: '#64748b', mt: 0.3 }}>
                                                        {item.description}
                                                    </Typography>
                                                )}
                                            </Box>
                                            <Typography sx={{ fontSize: '0.92rem', fontWeight: 800, color: '#15803d' }}>
                                                ₹{item.total.toLocaleString('en-IN')}
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
                                                <Typography sx={{ color: '#64748b' }}>Qty:</Typography>
                                                <Typography sx={{ fontWeight: 600 }}>{item.quantity}</Typography>
                                            </Box>
                                            <Box>
                                                <Typography sx={{ color: '#64748b' }}>Unit Price:</Typography>
                                                <Typography sx={{ fontWeight: 600 }}>₹{item.amount.toLocaleString('en-IN')}</Typography>
                                            </Box>
                                            <Box>
                                                <Typography sx={{ color: '#64748b' }}>Discount:</Typography>
                                                <Typography sx={{ fontWeight: 600, color: '#dc2626' }}>
                                                    {item.discount > 0 ? `${item.discount}${item.discountType === 'percentage' ? '%' : '₹'}` : '0'}
                                                </Typography>
                                            </Box>
                                            <Box>
                                                <Typography sx={{ color: '#64748b' }}>Tax ({item.taxRate}):</Typography>
                                                <Typography sx={{ fontWeight: 600 }}>₹{item.taxAmount.toLocaleString('en-IN')}</Typography>
                                            </Box>
                                        </Box>
                                    </DrawerSectionCard>
                                ))}
                            </Box>
                        )}

                        {/* Financial Summary */}
                        <DrawerSectionCard
                            title="FINANCIAL TOTALS"
                            titleSx={{ fontSize: '0.75rem', color: '#1e3a8a', letterSpacing: '0.03em' }}
                            bg="#f8fafc"
                            borderColor="#cbd5e1"
                        >
                            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, mt: 1 }}>
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem' }}>
                                    <Typography sx={{ color: '#64748b' }}>Gross Total:</Typography>
                                    <Typography sx={{ fontWeight: 600 }}>₹{opp.totalAmount.toLocaleString('en-IN')}</Typography>
                                </Box>
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem' }}>
                                    <Typography sx={{ color: '#64748b' }}>Total Discount:</Typography>
                                    <Typography sx={{ fontWeight: 600, color: '#dc2626' }}>- ₹{opp.totalDiscount.toLocaleString('en-IN')}</Typography>
                                </Box>
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem' }}>
                                    <Typography sx={{ color: '#64748b' }}>Subtotal:</Typography>
                                    <Typography sx={{ fontWeight: 700 }}>₹{opp.subtotal.toLocaleString('en-IN')}</Typography>
                                </Box>
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem' }}>
                                    <Typography sx={{ color: '#64748b' }}>Tax Total:</Typography>
                                    <Typography sx={{ fontWeight: 600, color: '#2563eb' }}>+ ₹{opp.totalTax.toLocaleString('en-IN')}</Typography>
                                </Box>
                                {opp.lumpSumDiscount > 0 && (
                                    <Box sx={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem' }}>
                                        <Typography sx={{ color: '#64748b' }}>Lump Sum Discount:</Typography>
                                        <Typography sx={{ fontWeight: 600, color: '#dc2626' }}>- ₹{opp.lumpSumDiscount.toLocaleString('en-IN')}</Typography>
                                    </Box>
                                )}
                                <Divider sx={{ my: 0.5 }} />
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.94rem' }}>
                                    <Typography sx={{ fontWeight: 800, color: '#0f172a' }}>Grand Total:</Typography>
                                    <Typography sx={{ fontWeight: 800, color: '#15803d', fontSize: '1.05rem' }}>
                                        ₹{opp.grandTotal.toLocaleString('en-IN')}
                                    </Typography>
                                </Box>
                            </Box>
                        </DrawerSectionCard>
                    </Box>
                ),
            }}
            auditEntity={{ type: 'opportunities', id: opp.id }}
            includeChangesTab={true}
            primaryAction={{
                label: 'Edit Opportunity',
                onClick: handleEdit,
                icon: <EditOutlinedIcon sx={{ fontSize: 16 }} />,
            }}
            secondaryAction={{
                label: isQuoteCreated ? 'Quote Created' : 'Create Quote',
                icon: isQuoteCreated ? (
                    <CheckCircleOutlinedIcon sx={{ fontSize: 16, color: '#059669' }} />
                ) : (
                    <RequestQuoteOutlinedIcon sx={{ fontSize: 16 }} />
                ),
                onClick: handleCreateQuote,
                variant: 'outlined',
                tooltip: !hasAddress
                    ? 'Complete Address is required to create a quotation'
                    : isQuoteCreated
                    ? 'Quotation already created for this opportunity'
                    : 'Create Quotation from Opportunity details',
                sx: {
                    fontSize: '0.78rem',
                    textTransform: 'none',
                    fontWeight: 700,
                    height: 36,
                    px: 1.8,
                    borderRadius: '6px',
                    color: isQuoteCreated ? '#047857' : hasAddress ? '#047857' : '#dc2626',
                    borderColor: isQuoteCreated ? '#a7f3d0' : hasAddress ? '#a7f3d0' : '#fca5a5',
                    backgroundColor: isQuoteCreated ? '#ecfdf5' : hasAddress ? '#ecfdf5' : '#fef2f2',
                    '&:hover': {
                        borderColor: isQuoteCreated ? '#047857' : hasAddress ? '#059669' : '#ef4444',
                        backgroundColor: isQuoteCreated ? '#d1fae5' : hasAddress ? '#d1fae5' : '#fee2e2',
                    },
                },
            }}
        />
        <AppToast
            open={toast.open}
            message={toast.message}
            severity={toast.severity}
            onClose={() => setToast((prev) => ({ ...prev, open: false }))}
        />
    </>
    );
}
