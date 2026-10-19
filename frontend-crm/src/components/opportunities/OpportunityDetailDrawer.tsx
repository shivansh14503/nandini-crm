'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import {
    Box,
    Typography,
    IconButton,
    Chip,
    Tooltip,
    Divider,
    Paper,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
} from '@mui/material';

// Icons
import BusinessOutlinedIcon from '@mui/icons-material/BusinessOutlined';
import PersonOutlinedIcon from '@mui/icons-material/PersonOutlined';
import PhoneOutlinedIcon from '@mui/icons-material/PhoneOutlined';
import EmailOutlinedIcon from '@mui/icons-material/EmailOutlined';
import CalendarMonthOutlinedIcon from '@mui/icons-material/CalendarMonthOutlined';
import AccessTimeOutlinedIcon from '@mui/icons-material/AccessTimeOutlined';
import ContentCopyOutlinedIcon from '@mui/icons-material/ContentCopyOutlined';
import MonetizationOnOutlinedIcon from '@mui/icons-material/MonetizationOnOutlined';
import ReceiptLongOutlinedIcon from '@mui/icons-material/ReceiptLongOutlined';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import CheckCircleOutlinedIcon from '@mui/icons-material/CheckCircleOutlined';

import { ROUTES } from '../../config/constants';
import type { Opportunity } from '../../types/opportunity.types';
import {
    EntityDetailDrawer,
    type DrawerTabItem,
    type AuditRevisionItem,
    buildDrawerTabs,
} from '../common/Drawer';
import { OPPORTUNITY_FORM_TABS } from './OpportunityForm';

export interface OpportunityDetailDrawerProps {
    opportunity: Opportunity | null;
    open: boolean;
    onClose: () => void;
    onEdit?: (id: string) => void;
}

export function OpportunityDetailDrawer({
    opportunity,
    open,
    onClose,
    onEdit,
}: OpportunityDetailDrawerProps) {
    const router = useRouter();

    if (!opportunity) return null;

    const opp = opportunity;

    const handleEdit = () => {
        if (onEdit) {
            onEdit(opp.id);
        } else {
            router.push(ROUTES.OPPORTUNITY_EDIT(opp.id));
        }
    };

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
    };

    const getStageColor = (stage: string) => {
        switch (stage) {
            case 'Closed Won':
                return { bg: '#dcfce7', text: '#15803d', border: '#86efac' };
            case 'Closed Lost':
                return { bg: '#fee2e2', text: '#b91c1c', border: '#fca5a5' };
            case 'Negotiation/Review':
            case 'Proposal/Price Quote':
                return { bg: '#fef3c7', text: '#b45309', border: '#fde68a' };
            default:
                return { bg: '#eff6ff', text: '#1d4ed8', border: '#bfdbfe' };
        }
    };

    const stageColors = getStageColor(opp.salesStage);

    // ── Build Drawer Tabs dynamically from Single Source of Truth ──
    const tabs: DrawerTabItem[] = buildDrawerTabs(OPPORTUNITY_FORM_TABS, {
        basic: (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
                {/* Organization & Deal Card */}
                <Box
                    sx={{
                        p: 2,
                        borderRadius: '8px',
                        backgroundColor: '#f8fafc',
                        border: '1px solid #e2e8f0',
                    }}
                >
                    <Typography sx={{ fontSize: '0.68rem', fontWeight: 700, color: '#64748b', letterSpacing: '0.04em' }}>
                        CLIENT ORGANIZATION
                    </Typography>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5 }}>
                        <BusinessOutlinedIcon sx={{ fontSize: 18, color: '#2563eb' }} />
                        <Typography sx={{ fontSize: '0.98rem', fontWeight: 800, color: '#1e293b' }}>
                            {opp.organizationName}
                        </Typography>
                    </Box>
                    <Typography sx={{ fontSize: '0.75rem', color: '#64748b', mt: 0.3 }}>
                        Deal Ref: {opp.opportunityCode} • Type: {opp.type}
                    </Typography>
                </Box>

                {/* Primary Contact Person Details */}
                <Box
                    sx={{
                        p: 2,
                        borderRadius: '8px',
                        backgroundColor: '#ffffff',
                        border: '1px solid #e2e8f0',
                    }}
                >
                    <Typography sx={{ fontSize: '0.68rem', fontWeight: 700, color: '#64748b', mb: 1.5, letterSpacing: '0.04em' }}>
                        CONTACT PERSON DETAILS
                    </Typography>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.2 }}>
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
                            <Tooltip title="Copy Phone Number">
                                <IconButton size="small" onClick={() => copyToClipboard(opp.contactNumber)}>
                                    <ContentCopyOutlinedIcon sx={{ fontSize: 13, color: '#94a3b8' }} />
                                </IconButton>
                            </Tooltip>
                        </Box>

                        {opp.emailAddress && (
                            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                    <EmailOutlinedIcon sx={{ fontSize: 16, color: '#64748b' }} />
                                    <Typography sx={{ fontSize: '0.82rem', color: '#1e293b' }}>
                                        {opp.emailAddress}
                                    </Typography>
                                </Box>
                                <Tooltip title="Copy Email">
                                    <IconButton size="small" onClick={() => copyToClipboard(opp.emailAddress!)}>
                                        <ContentCopyOutlinedIcon sx={{ fontSize: 13, color: '#94a3b8' }} />
                                    </IconButton>
                                </Tooltip>
                            </Box>
                        )}
                    </Box>
                </Box>

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
                <Box
                    sx={{
                        p: 2,
                        borderRadius: '8px',
                        backgroundColor: '#fffbeb',
                        border: '1px solid #fde68a',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                    }}
                >
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
                </Box>

                {/* Scope & Descriptions */}
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                    <Box sx={{ p: 2, borderRadius: '8px', backgroundColor: '#ffffff', border: '1px solid #e2e8f0' }}>
                        <Typography sx={{ fontSize: '0.68rem', fontWeight: 700, color: '#64748b', mb: 0.5 }}>
                            ACTION BRIEF / ADD DESCRIPTION
                        </Typography>
                        <Typography sx={{ fontSize: '0.82rem', color: '#334155', lineHeight: 1.5 }}>
                            {opp.addDescription}
                        </Typography>
                    </Box>

                    {opp.description && (
                        <Box sx={{ p: 2, borderRadius: '8px', backgroundColor: '#ffffff', border: '1px solid #e2e8f0' }}>
                            <Typography sx={{ fontSize: '0.68rem', fontWeight: 700, color: '#64748b', mb: 0.5 }}>
                                DETAILED SCOPE / NOTES
                            </Typography>
                            <Typography sx={{ fontSize: '0.82rem', color: '#334155', lineHeight: 1.5 }}>
                                {opp.description}
                            </Typography>
                        </Box>
                    )}
                </Box>

                {/* Billing Details & Commission */}
                <Box
                    sx={{
                        p: 2,
                        borderRadius: '8px',
                        backgroundColor: '#f8fafc',
                        border: '1px solid #e2e8f0',
                    }}
                >
                    <Typography sx={{ fontSize: '0.68rem', fontWeight: 700, color: '#64748b', mb: 1.5, letterSpacing: '0.04em' }}>
                        BILLING & COMMISSION
                    </Typography>
                    <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5 }}>
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
                </Box>
            </Box>
        ),
        line_items: (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
                {/* Line items group header */}
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Typography sx={{ fontSize: '0.85rem', fontWeight: 700, color: '#1e293b' }}>
                        {opp.groupName || 'Products & Services'}
                    </Typography>
                    <Typography sx={{ fontSize: '0.78rem', color: '#64748b' }}>
                        Currency: {opp.currency || 'Indian Rupee: ₹'}
                    </Typography>
                </Box>

                {/* Line items list */}
                {(!opp.lineItems || opp.lineItems.length === 0) ? (
                    <Box sx={{ p: 3, textAlign: 'center', backgroundColor: '#f8fafc', borderRadius: '8px' }}>
                        <Typography sx={{ fontSize: '0.82rem', color: '#64748b' }}>
                            No line items specified for this opportunity.
                        </Typography>
                    </Box>
                ) : (
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                        {opp.lineItems.map((item, idx) => (
                            <Box
                                key={item.id || idx}
                                sx={{
                                    p: 1.8,
                                    borderRadius: '8px',
                                    border: '1px solid #e2e8f0',
                                    backgroundColor: '#ffffff',
                                }}
                            >
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
                            </Box>
                        ))}
                    </Box>
                )}

                {/* Financial Summary */}
                <Box
                    sx={{
                        p: 2,
                        borderRadius: '8px',
                        backgroundColor: '#f8fafc',
                        border: '1px solid #cbd5e1',
                    }}
                >
                    <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: '#1e3a8a', mb: 1.5, letterSpacing: '0.03em' }}>
                        FINANCIAL TOTALS
                    </Typography>

                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
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
                </Box>
            </Box>
        ),
    });

    // Sample Audit Trail items
    const auditRevisions: AuditRevisionItem[] = [
        {
            title: `Stage set to "${opp.salesStage}"`,
            author: opp.assignedTo || 'mittal.sharma',
            time: 'Yesterday at 3:15 PM',
            tag: opp.salesStage,
            note: 'Updated proposal specifications & client sign-off timeline.',
        },
        {
            title: 'Opportunity Created',
            author: opp.createdBy || 'mittal.sharma',
            time: opp.createdAt || '3 days ago',
            tag: 'Created',
            note: `Initial deal value ₹${opp.grandTotal.toLocaleString('en-IN')} generated from lead.`,
        },
    ];

    return (
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
            }}
            tabs={tabs}
            auditRevisions={auditRevisions}
            includeChangesTab={true}
            primaryAction={{
                label: 'Edit Opportunity',
                onClick: handleEdit,
                icon: <EditOutlinedIcon sx={{ fontSize: 16 }} />,
            }}
            width={{ xs: '100vw', sm: 600, md: 660 }}
        />
    );
}
