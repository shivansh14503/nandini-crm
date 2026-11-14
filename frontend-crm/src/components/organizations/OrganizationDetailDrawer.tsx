'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Box, Typography, IconButton, Tooltip } from '@mui/material';

// Icons
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import VisibilityOffOutlinedIcon from '@mui/icons-material/VisibilityOffOutlined';
import CheckCircleOutlinedIcon from '@mui/icons-material/CheckCircleOutlined';
import HighlightOffOutlinedIcon from '@mui/icons-material/HighlightOffOutlined';
import VerifiedUserOutlinedIcon from '@mui/icons-material/VerifiedUserOutlined';
import CloudDoneOutlinedIcon from '@mui/icons-material/CloudDoneOutlined';
import BusinessCenterOutlinedIcon from '@mui/icons-material/BusinessCenterOutlined';
import TagOutlinedIcon from '@mui/icons-material/TagOutlined';
import PersonOutlineIcon from '@mui/icons-material/PersonOutlined';
import NotesOutlinedIcon from '@mui/icons-material/NotesOutlined';

import { ROUTES } from '@/config/constants';
import type { ExtendedOrganization } from '@/types/organization.types';
import { useOrganization } from '@/hooks/queries';
import {
    EntityDetailDrawer,
    DrawerSectionCard,
    DrawerCopyButton,
    DrawerFieldGrid,
    DrawerMetricGrid,
    type DrawerBadgeItem,
} from '@/components/common/Drawer';
import { ReadOnlyField } from '@/components/forms/ReadOnlyField';
import { getCountryNameByCode } from '@/data/addressMaster';
import { findCrmUser } from '@/services/masterData.store';
import { formatAddressLine } from '@/utils/address';
import { formatDateTime } from '@/utils/date';
import { ORGANIZATION_FORM_TABS } from './OrganizationForm';
import { DynamicDrawerCustomFields } from '@/components/common/Drawer/DynamicDrawerCustomFields';

export interface OrganizationDetailDrawerProps {
    organization: ExtendedOrganization | null;
    open: boolean;
    onClose: () => void;
    onEdit?: (id: string) => void;
    hideBackdrop?: boolean;
}


const sectionIcon = (icon: React.ReactElement) => (
    <Box
        sx={{
            width: 24,
            height: 24,
            borderRadius: '7px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--crm-text-blue-600)',
            backgroundColor: 'var(--mui-palette-primary-soft)',
        }}
    >
        {icon}
    </Box>
);

const getInitials = (name: string) => {
    const parts = name.replace(/[._-]+/g, ' ').trim().split(/\s+/);
    return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
};

/** A code (SAP / showroom) shown as a monospace pill with an inline copy button. */
function IdentifierRow({ label, value }: { label: string; value?: string }) {
    return (
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1.5, py: 0.9 }}>
            <Typography sx={{ fontSize: '0.68rem', fontWeight: 600, color: 'var(--mui-palette-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                {label}
            </Typography>
            {value ? (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25, minWidth: 0 }}>
                    <Box
                        component="span"
                        sx={{
                            fontFamily: 'monospace',
                            fontSize: '0.82rem',
                            fontWeight: 700,
                            color: 'var(--crm-slate-900)',
                            backgroundColor: 'var(--mui-palette-background-hover)',
                            border: '1px solid var(--mui-palette-border-main)',
                            borderRadius: '6px',
                            px: 1,
                            py: 0.2,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                        }}
                    >
                        {value}
                    </Box>
                    <DrawerCopyButton text={value} title={`Copy ${label}`} iconColor="var(--mui-palette-text-secondary)" />
                </Box>
            ) : (
                <Typography sx={{ color: 'var(--mui-palette-text-muted)', fontSize: '0.86rem' }}>—</Typography>
            )}
        </Box>
    );
}

/** Masks all but the last 4 digits of an account number. */
const maskAccountNumber = (value: string) => (value.length > 4 ? `•••• ${value.slice(-4)}` : value);

interface AddressCardProps {
    title: string;
    street?: string;
    city?: string;
    state?: string;
    postalCode?: string;
    country?: string;
}

/** Multi-line address with a copy button (copies the one-line form). Renders nothing when empty. */
function AddressCard({ title, street, city, state, postalCode, country }: AddressCardProps) {
    const oneLine = formatAddressLine({ street, city, state, postalCode, country });
    if (!oneLine) return null;
    const locality = [city, [state, postalCode].filter(Boolean).join(' – ')].filter(Boolean).join(', ');

    return (
        <DrawerSectionCard
            bg="var(--mui-palette-background-subtle)"
            title={title}
            action={<DrawerCopyButton text={oneLine} title={`Copy ${title.toLowerCase()}`} iconColor="var(--mui-palette-text-secondary)" />}
        >
            {street && (
                <Typography sx={{ fontSize: '0.84rem', fontWeight: 700, color: 'var(--crm-slate-900)', whiteSpace: 'pre-line' }}>
                    {street}
                </Typography>
            )}
            {locality && <Typography sx={{ fontSize: '0.78rem', color: 'var(--crm-slate-600)', mt: 0.3 }}>{locality}</Typography>}
            {country && (
                <Typography sx={{ fontSize: '0.74rem', color: 'var(--mui-palette-text-secondary)', mt: 0.3 }}>{getCountryNameByCode(country)}</Typography>
            )}
        </DrawerSectionCard>
    );
}

export function OrganizationDetailDrawer({
    organization,
    open,
    onClose,
    onEdit,
    hideBackdrop,
}: OrganizationDetailDrawerProps) {
    const router = useRouter();
    const [showBankAccount, setShowBankAccount] = useState(false);

    const { data: freshOrg } = useOrganization(open && organization?.id ? organization.id : undefined);
    const org = freshOrg ?? organization;

    if (!org) return null;
    const assignedUser = findCrmUser(org.assignedUser);
    const assignedDisplayName = assignedUser?.name || org.assignedUser || '';

    const handleEdit = () => {
        if (onEdit) {
            onEdit(org.id);
        } else {
            router.push(ROUTES.ORGANIZATION_EDIT(org.id));
        }
    };

    const isActive = org.accountStatus !== 'Inactive';
    const location = [org.billingCity, org.billingState].filter(Boolean).join(', ') || 'Location Unspecified';
    const partnerCompany = org.partnerCompanies?.join(', ');
    const gstin = org.gstNo || org.gstNumber || '';

    const badges: DrawerBadgeItem[] = [
        isActive
            ? { label: 'Active', backgroundColor: 'var(--mui-palette-success-soft)', color: 'var(--crm-emerald-600)', borderColor: 'var(--mui-palette-success-softBorder)' }
            : { label: 'Inactive', backgroundColor: 'var(--crm-amber-100)', color: 'var(--crm-amber-700)', borderColor: 'var(--mui-palette-warning-softBorder)' },
        org.accountVerified
            ? {
                  label: org.verifiedAt
                      ? `Verified: ${formatDateTime(org.verifiedAt)} by ${org.verifiedBy || 'Admin'}`
                      : 'Verified',
                  icon: <CheckCircleOutlinedIcon sx={{ fontSize: 13 }} />,
                  backgroundColor: 'var(--mui-palette-success-soft)',
                  color: 'var(--crm-emerald-600)',
                  borderColor: 'var(--mui-palette-success-softBorder)',
              }
            : {
                  label: 'Not Verified',
                  icon: <HighlightOffOutlinedIcon sx={{ fontSize: 13 }} />,
                  backgroundColor: 'var(--mui-palette-background-hover)',
                  color: 'var(--mui-palette-text-secondary)',
                  borderColor: 'var(--mui-palette-border-main)',
              },
        ...(org.activeAmc
            ? [
                  {
                      label: 'Active AMC',
                      icon: <VerifiedUserOutlinedIcon sx={{ fontSize: 13 }} />,
                      backgroundColor: 'var(--mui-palette-primary-soft)',
                      color: 'var(--crm-text-blue-700)',
                      borderColor: 'var(--mui-palette-primary-softBorder)',
                  },
              ]
            : []),
        ...(org.activeCloud
            ? [
                  {
                      label: 'Active Cloud',
                      icon: <CloudDoneOutlinedIcon sx={{ fontSize: 13 }} />,
                      backgroundColor: 'var(--crm-green-50)',
                      color: 'var(--crm-green-700)',
                      borderColor: 'var(--crm-green-200)',
                  },
              ]
            : []),
    ];

    return (
        <EntityDetailDrawer
            open={open}
            onClose={onClose}
            hideBackdrop={hideBackdrop}
            title={org.organizationName}
            subtitle={`${org.tradeName || org.organizationName} • ${location}`}
            avatarBg="linear-gradient(135deg, #0284c7 0%, #0369a1 100%)"
            verified={Boolean(org.accountVerified)}
            badges={badges}
            headerActions={{
                onEdit: handleEdit,
                onView: () => router.push(ROUTES.ORGANIZATION_DETAIL(org.id)),
            }}
            formTabs={ORGANIZATION_FORM_TABS}
            tabContents={{
                overview: (
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <DrawerMetricGrid
                            items={[
                                {
                                    label: 'ANNUAL TURNOVER',
                                    value: org.annualTurnover || '—',
                                    bg: 'var(--mui-palette-primary-soft)',
                                    borderColor: 'var(--crm-blue-100)',
                                    labelColor: 'var(--crm-text-blue-700)',
                                    valueSize: '1rem',
                                    valueWeight: 800,
                                    p: 1.75,
                                },
                                {
                                    label: 'EMPLOYEES',
                                    value: org.numberOfEmployees || '—',
                                    bg: 'var(--crm-green-50)',
                                    borderColor: 'var(--crm-green-100)',
                                    labelColor: 'var(--crm-green-700)',
                                    valueSize: '1rem',
                                    valueWeight: 800,
                                    p: 1.75,
                                },
                            ]}
                        />

                        <DrawerSectionCard p={1.8} icon={sectionIcon(<BusinessCenterOutlinedIcon sx={{ fontSize: 15 }} />)} title="Business Profile">
                            <DrawerFieldGrid sx={{ mt: 0 }}>
                                <ReadOnlyField label="Nature of Business" value={org.natureOfBusiness} />
                                <ReadOnlyField label="Type of Entity" value={org.typeOfEntity} />
                                <ReadOnlyField label="Customer Type" value={org.customerType} />
                                <ReadOnlyField label="Member Of" value={org.memberOfParentCorp} />
                                <ReadOnlyField label="Partner Company" value={partnerCompany} sx={{ gridColumn: '1 / -1' }} />
                            </DrawerFieldGrid>
                        </DrawerSectionCard>

                        <DrawerSectionCard p={1.8} bg="var(--mui-palette-background-subtle)" icon={sectionIcon(<TagOutlinedIcon sx={{ fontSize: 15 }} />)} title="Account Identifiers">
                            <Box sx={{ '& > * + *': { borderTop: '1px dashed var(--mui-palette-border-main)' } }}>
                                <IdentifierRow label="SAP Code / Tally ID" value={org.sapCodeTallyId} />
                                <IdentifierRow label="Showroom Code" value={org.showroomBranchCode} />
                            </Box>
                        </DrawerSectionCard>

                        <DrawerSectionCard p={1.8} icon={sectionIcon(<PersonOutlineIcon sx={{ fontSize: 15 }} />)} title="Account Owner">
                            {org.assignedUser ? (
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
                                    <Box
                                        sx={{
                                            width: 34,
                                            height: 34,
                                            borderRadius: '50%',
                                            background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
                                            color: '#ffffff',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            fontSize: '0.78rem',
                                            fontWeight: 700,
                                            boxShadow: '0 2px 8px rgba(79, 70, 229, 0.25)',
                                        }}
                                    >
                                        {getInitials(assignedDisplayName)}
                                    </Box>
                                    <Box>
                                        <Typography sx={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--crm-slate-900)', lineHeight: 1.3 }}>
                                            {assignedDisplayName}
                                        </Typography>
                                        <Typography sx={{ fontSize: '0.72rem', color: 'var(--mui-palette-text-secondary)' }}>
                                            {assignedUser ? `${assignedUser.role} • ${assignedUser.department}` : 'Assigned user'}
                                        </Typography>
                                    </Box>
                                </Box>
                            ) : (
                                <Typography sx={{ color: 'var(--mui-palette-text-muted)', fontSize: '0.86rem' }}>Unassigned</Typography>
                            )}
                        </DrawerSectionCard>

                        {/* Admin-defined custom fields */}
                        <DynamicDrawerCustomFields module="organizations" record={org} />

                        {org.description && (
                            <DrawerSectionCard p={1.8} icon={sectionIcon(<NotesOutlinedIcon sx={{ fontSize: 15 }} />)} title="About">
                                <Typography sx={{ fontSize: '0.84rem', color: 'var(--crm-slate-700)', lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>
                                    {org.description}
                                </Typography>
                            </DrawerSectionCard>
                        )}
                    </Box>
                ),
                address: (
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <AddressCard
                            title="Billing Address"
                            street={org.billingStreet || org.billingAddress}
                            city={org.billingCity}
                            state={org.billingState}
                            postalCode={org.billingPostalCode}
                            country={org.billingCountry}
                        />
                        <AddressCard
                            title="Shipping Address"
                            street={org.shippingStreet || org.shippingAddress}
                            city={org.shippingCity}
                            state={org.shippingState}
                            postalCode={org.shippingPostalCode}
                            country={org.shippingCountry}
                        />
                    </Box>
                ),
                tax_bank: (
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <DrawerSectionCard p={1.8} title="Statutory Tax & Compliance">
                            <DrawerFieldGrid>
                                <ReadOnlyField label="GSTIN" value={gstin} copyable />
                                <ReadOnlyField label="PAN" value={org.panNumber} copyable />
                                <ReadOnlyField label="MSME Registration No." value={org.msmeRegnNumber} copyable />
                                <ReadOnlyField label="CIN" value={org.cinNo} copyable />
                                <ReadOnlyField label="TAN" value={org.tanNumber} copyable />
                            </DrawerFieldGrid>
                        </DrawerSectionCard>

                        <DrawerSectionCard p={1.8} bg="var(--mui-palette-background-subtle)" title="Operating Bank Account">
                            <DrawerFieldGrid>
                                <ReadOnlyField label="Bank Name" value={org.bankName} />
                                <ReadOnlyField label="Account Name" value={org.accountName} />
                                <ReadOnlyField
                                    label="Account Number"
                                    value={
                                        org.accountNumber ? (
                                            <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
                                                <Box component="span" sx={{ fontFamily: 'monospace' }}>
                                                    {showBankAccount ? org.accountNumber : maskAccountNumber(org.accountNumber)}
                                                </Box>
                                                <Tooltip title={showBankAccount ? 'Hide account number' : 'Show account number'}>
                                                    <IconButton
                                                        size="small"
                                                        onClick={() => setShowBankAccount((v) => !v)}
                                                        aria-label={showBankAccount ? 'Hide account number' : 'Show account number'}
                                                        sx={{ p: 0.2 }}
                                                    >
                                                        {showBankAccount ? (
                                                            <VisibilityOffOutlinedIcon sx={{ fontSize: 14 }} />
                                                        ) : (
                                                            <VisibilityOutlinedIcon sx={{ fontSize: 14 }} />
                                                        )}
                                                    </IconButton>
                                                </Tooltip>
                                            </Box>
                                        ) : undefined
                                    }
                                    copyable
                                    copyText={org.accountNumber}
                                />
                                <ReadOnlyField label="IFSC Code" value={org.bankIfscCode} copyable />
                                <ReadOnlyField label="Branch Address" value={org.bankAddress} sx={{ gridColumn: '1 / -1' }} />
                            </DrawerFieldGrid>
                        </DrawerSectionCard>
                    </Box>
                ),
            }}
            auditEntity={{ type: 'organizations', id: org.id }}
            recordAudit={org}
            includeChangesTab={true}
            statusText={isActive ? 'Ready for Order Processing' : 'Inactive account'}
            primaryAction={{
                label: 'Edit Details',
                onClick: handleEdit,
            }}
        />
    );
}
