'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { Box, Typography } from '@mui/material';
import HandshakeOutlinedIcon from '@mui/icons-material/HandshakeOutlined';
import ContactPhoneOutlinedIcon from '@mui/icons-material/ContactPhoneOutlined';
import AccountBalanceOutlinedIcon from '@mui/icons-material/AccountBalanceOutlined';
import PlaceOutlinedIcon from '@mui/icons-material/PlaceOutlined';
import LocalShippingOutlinedIcon from '@mui/icons-material/LocalShippingOutlined';
import ReceiptLongOutlinedIcon from '@mui/icons-material/ReceiptLongOutlined';
import NotesOutlinedIcon from '@mui/icons-material/NotesOutlined';
import PhoneOutlinedIcon from '@mui/icons-material/PhoneOutlined';
import CategoryOutlinedIcon from '@mui/icons-material/CategoryOutlined';

import { ROUTES } from '@/config/constants';
import { usePartnerCompany } from '@/hooks/queries';
import { EntityDetailDrawer, DrawerSectionCard, DrawerFieldGrid, type DrawerBadgeItem } from '@/components/common/Drawer';
import { ReadOnlyField } from '@/components/forms/ReadOnlyField';
import { findCrmUser } from '@/services/masterData.store';
import type { ExtendedPartnerCompany } from '@/types/partner.types';
import { formatAddressLine } from '@/utils/address';
import { mailtoHref, telHref } from '@/utils/contactLinks';
import { PARTNER_COMPANY_FORM_TABS } from './PartnerCompanyForm';

export interface PartnerCompanyDetailDrawerProps {
    partnerCompany: ExtendedPartnerCompany | null;
    open: boolean;
    onClose: () => void;
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
            color: '#2563eb',
            backgroundColor: '#eff6ff',
        }}
    >
        {icon}
    </Box>
);

const linkSx = { color: '#1d4ed8', fontWeight: 600, textDecoration: 'none', '&:hover': { textDecoration: 'underline' } } as const;

const fullRow = { gridColumn: '1 / -1' } as const;

export function PartnerCompanyDetailDrawer({ partnerCompany, open, onClose }: PartnerCompanyDetailDrawerProps) {
    const router = useRouter();
    // The list copy may be a page old; the detail query refreshes on every save (QueryProvider invalidation).
    const { data: fresh } = usePartnerCompany(open && partnerCompany?.id ? partnerCompany.id : undefined);
    const p = fresh ?? partnerCompany;
    if (!p) return null;

    const assignedName = findCrmUser(p.assignedTo)?.name || p.assignedTo;
    const emails = (p.emailAddresses ?? []).filter((e) => e.email?.trim());
    const billingLine = formatAddressLine({
        street: p.billingAddress,
        city: p.billingCity,
        state: p.billingState,
        postalCode: p.billingPostalCode,
        country: p.billingCountry,
    });
    const shippingLine = formatAddressLine({
        street: p.shippingAddress,
        city: p.shippingCity,
        state: p.shippingState,
        postalCode: p.shippingPostalCode,
        country: p.shippingCountry,
    });
    const hasBank = Boolean(p.bankName || p.bankBranch || p.accountNumber || p.bankIfscCode);
    const hasStatutory = Boolean(p.gstNo || p.panNumber || p.cinNo || p.msmeRegnNumber || p.tanNumber);

    const handleEdit = () => router.push(ROUTES.PARTNER_COMPANY_EDIT(p.id));

    const badges: DrawerBadgeItem[] = p.natureOfPartner
        ? [
              {
                  label: p.natureOfPartner,
                  icon: <CategoryOutlinedIcon sx={{ fontSize: 13 }} />,
                  backgroundColor: '#eff6ff',
                  color: '#1d4ed8',
                  borderColor: '#bfdbfe',
              },
          ]
        : [];

    return (
        <EntityDetailDrawer
            open={open}
            onClose={onClose}
            title={p.companyName}
            subtitle={[p.billingCity, p.principalCompany && `Principal: ${p.principalCompany}`].filter(Boolean).join(' • ') || 'Partner Company'}
            avatarIcon={<HandshakeOutlinedIcon sx={{ fontSize: 22 }} />}
            avatarBg="linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)"
            verified={false}
            badges={badges}
            headerActions={{ onEdit: handleEdit, onView: () => router.push(ROUTES.PARTNER_COMPANY_DETAIL(p.id)) }}
            formTabs={PARTNER_COMPANY_FORM_TABS}
            tabContents={{
                company_info: (
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <DrawerSectionCard p={1.8} icon={sectionIcon(<HandshakeOutlinedIcon sx={{ fontSize: 15 }} />)} title="Company Details">
                            <DrawerFieldGrid sx={{ mt: 0 }}>
                                <ReadOnlyField label="Partner Name" value={p.companyName} sx={fullRow} />
                                <ReadOnlyField label="Nature of Partner" value={p.natureOfPartner} badge badgeColor="#1d4ed8" />
                                <ReadOnlyField label="Assigned to" value={assignedName} />
                                <ReadOnlyField label="Principal Company" value={p.principalCompany} />
                                <ReadOnlyField
                                    label="Website"
                                    value={
                                        p.website ? (
                                            <Box
                                                component="a"
                                                href={/^https?:\/\//i.test(p.website) ? p.website : `https://${p.website}`}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                sx={linkSx}
                                            >
                                                {p.website}
                                            </Box>
                                        ) : undefined
                                    }
                                />
                            </DrawerFieldGrid>
                        </DrawerSectionCard>

                        <DrawerSectionCard p={1.8} icon={sectionIcon(<ContactPhoneOutlinedIcon sx={{ fontSize: 15 }} />)} title="Communication">
                            <DrawerFieldGrid sx={{ mt: 0 }}>
                                <ReadOnlyField
                                    label="Office Phone"
                                    value={p.phone ? <Box component="a" href={telHref(p.phone)} sx={linkSx}>{p.phone}</Box> : undefined}
                                    copyable
                                    copyText={p.phone}
                                    sx={fullRow}
                                />
                                {emails.map((em) => (
                                    <ReadOnlyField
                                        key={em.id || em.email}
                                        label={em.isPrimary ? 'Email (Primary)' : 'Email'}
                                        value={<Box component="a" href={mailtoHref(em.email)} sx={linkSx}>{em.email}</Box>}
                                        sx={fullRow}
                                    />
                                ))}
                            </DrawerFieldGrid>
                        </DrawerSectionCard>

                        {hasBank && (
                            <DrawerSectionCard p={1.8} icon={sectionIcon(<AccountBalanceOutlinedIcon sx={{ fontSize: 15 }} />)} title="Bank Details">
                                <DrawerFieldGrid sx={{ mt: 0 }}>
                                    <ReadOnlyField label="Bank Name" value={p.bankName} />
                                    <ReadOnlyField label="Branch" value={p.bankBranch} />
                                    <ReadOnlyField label="Account No" value={p.accountNumber} copyable />
                                    <ReadOnlyField label="IFSC Code" value={p.bankIfscCode} copyable />
                                </DrawerFieldGrid>
                            </DrawerSectionCard>
                        )}

                        {(p.addDescription || p.description) && (
                            <DrawerSectionCard p={1.8} icon={sectionIcon(<NotesOutlinedIcon sx={{ fontSize: 15 }} />)} title="Notes">
                                {[p.addDescription, p.description].filter(Boolean).map((note, i) => (
                                    <Typography key={i} sx={{ fontSize: '0.84rem', color: '#334155', lineHeight: 1.55, whiteSpace: 'pre-wrap', mb: 1 }}>
                                        {note}
                                    </Typography>
                                ))}
                            </DrawerSectionCard>
                        )}
                    </Box>
                ),
                address: (
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <DrawerSectionCard p={1.8} icon={sectionIcon(<PlaceOutlinedIcon sx={{ fontSize: 15 }} />)} title="Billing Address">
                            <ReadOnlyField label="Address" value={billingLine || undefined} copyable />
                        </DrawerSectionCard>
                        <DrawerSectionCard p={1.8} icon={sectionIcon(<LocalShippingOutlinedIcon sx={{ fontSize: 15 }} />)} title="Shipping Address">
                            <ReadOnlyField
                                label="Address"
                                value={p.copyAddressFromBilling ? 'Same as billing address' : shippingLine || undefined}
                                copyable={!p.copyAddressFromBilling}
                            />
                        </DrawerSectionCard>
                    </Box>
                ),
                statutory: (
                    <DrawerSectionCard p={1.8} icon={sectionIcon(<ReceiptLongOutlinedIcon sx={{ fontSize: 15 }} />)} title="Statutory & Tax Identification">
                        {hasStatutory ? (
                            <DrawerFieldGrid sx={{ mt: 0 }}>
                                <ReadOnlyField label="GST Number" value={p.gstNo} copyable />
                                <ReadOnlyField label="PAN Number" value={p.panNumber} copyable />
                                <ReadOnlyField label="CIN No" value={p.cinNo} copyable />
                                <ReadOnlyField label="MSME Regn. Number" value={p.msmeRegnNumber} copyable />
                                <ReadOnlyField label="TAN Number" value={p.tanNumber} copyable />
                            </DrawerFieldGrid>
                        ) : (
                            <Typography sx={{ fontSize: '0.82rem', color: '#94a3b8' }}>No statutory identifiers recorded.</Typography>
                        )}
                    </DrawerSectionCard>
                ),
            }}
            auditEntity={{ type: 'partner-companies', id: p.id }}
            includeChangesTab
            statusText={p.natureOfPartner || 'Partner Company'}
            primaryAction={{ label: 'Edit Partner Company', onClick: handleEdit }}
            secondaryAction={
                p.phone
                    ? {
                          label: 'Call Office',
                          icon: <PhoneOutlinedIcon sx={{ fontSize: 16 }} />,
                          onClick: () => {
                              window.location.href = telHref(p.phone);
                          },
                      }
                    : undefined
            }
        />
    );
}
