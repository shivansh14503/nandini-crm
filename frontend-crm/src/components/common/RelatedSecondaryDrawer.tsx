'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import ApartmentIcon from '@mui/icons-material/Apartment';

import { ROUTES } from '@/config/constants';
import type { Contact } from '@/types/contact.types';
import type { Lead } from '@/types/lead.types';
import type { Opportunity } from '@/types/opportunity.types';
import type { Quotation } from '@/types/quotation.types';
import type { Product } from '@/types/product.types';
import type { ExtendedOrganization } from '@/types/organization.types';
import { ContactDetailDrawer } from '@/components/contacts/ContactDetailDrawer';
import { LeadDetailDrawer } from '@/components/leads/LeadDetailDrawer';
import { OpportunityDetailDrawer } from '@/components/opportunities/OpportunityDetailDrawer';
import { QuotationDetailDrawer } from '@/components/quotations/QuotationDetailDrawer';
import { ProductDetailDrawer } from '@/components/products/ProductDetailDrawer';
import { OrganizationDetailDrawer } from '@/components/organizations/OrganizationDetailDrawer';
import { TicketDetailDrawer } from '@/components/tickets/TicketDetailDrawer';
import type { Ticket } from '@/types/ticket.types';
import { ContractDetailDrawer } from '@/components/contracts/ContractDetailDrawer';
import type { Contract } from '@/types/contract.types';
import type { Activity } from '@/types/activity.types';
import { ActivityDetailDrawer } from '@/components/activities/ActivityDetailDrawer';
import {
    EntityDetailDrawer,
    DrawerSectionCard,
    DrawerMetricGrid,
} from '@/components/common/Drawer';
import { useShowRecordNumber } from '@/hooks/queries/useDocumentSeries';
import { isShownField } from '@/utils/recordNumbers';

export interface SecondaryDrawerEntity {
    type: string;
    data: Record<string, unknown>;
}

export interface RelatedSecondaryDrawerProps {
    entity: SecondaryDrawerEntity | null;
    /** Display label of the module the row was clicked in (used by the generic fallback drawer). */
    moduleLabel?: string;
    /** Title of the parent record that owns the related module (used as subtitle). */
    parentTitle?: string;
    onClose: () => void;
}

/**
 * Resolves and renders the stacked secondary detail drawer for a row clicked
 * inside the middle `RelatedRecordsTableView`. Shared by every master view so the
 * three-panel flow behaves identically across the CRM.
 */
export function RelatedSecondaryDrawer({
    entity,
    moduleLabel = 'Related Record',
    parentTitle = '',
    onClose,
}: RelatedSecondaryDrawerProps) {
    const showNumber = useShowRecordNumber();
    const router = useRouter();

    if (!entity) return null;
    const { type, data } = entity;

    switch (type) {
        case 'activities':
            return (
                <ActivityDetailDrawer
                    activity={data as unknown as Activity}
                    open
                    onClose={onClose}
                    onEdit={(id) => router.push(ROUTES.ACTIVITY_EDIT(id))}
                />
            );

        case 'contacts':
            return <ContactDetailDrawer contact={data as unknown as Contact} open onClose={onClose} />;

        case 'tickets':
            return <TicketDetailDrawer ticket={data as unknown as Ticket} open onClose={onClose} />;

        case 'contracts':
            return (
                <ContractDetailDrawer
                    contract={data as unknown as Contract}
                    open
                    onClose={onClose}
                    onEdit={(id) => router.push(ROUTES.CONTRACT_EDIT(id))}
                />
            );

        case 'leads':
            return (
                <LeadDetailDrawer
                    lead={data as unknown as Lead}
                    open
                    onClose={onClose}
                    onEdit={(id) => router.push(ROUTES.LEAD_EDIT(id))}
                />
            );

        case 'opportunities':
            return (
                <OpportunityDetailDrawer
                    opportunity={data as unknown as Opportunity}
                    open
                    onClose={onClose}
                    onEdit={(id) => router.push(ROUTES.OPPORTUNITY_EDIT(id))}
                />
            );

        case 'quotations':
            return (
                <QuotationDetailDrawer
                    quotation={data as unknown as Quotation}
                    open
                    onClose={onClose}
                    onEdit={(id) => router.push(ROUTES.QUOTATION_EDIT(id))}
                />
            );

        case 'products':
            return <ProductDetailDrawer product={data as unknown as Product} open onClose={onClose} />;

        case 'organizations':
            return (
                <OrganizationDetailDrawer
                    organization={data as unknown as ExtendedOrganization}
                    open
                    onClose={onClose}
                    onEdit={(id) => router.push(ROUTES.ORGANIZATION_EDIT(id))}
                />
            );

        default: {
            const recordTitle = String(
                data.subject ||
                    data.name ||
                    data.partnerName ||
                    (showNumber('ticket') ? data.ticketNumber : '') ||
                    moduleLabel
            );

            const detailFields = Object.entries(data)
                .filter(([key]) => key !== 'id' && isShownField(key, showNumber))
                .map(([key, val]) => ({
                    label: key.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase()),
                    value: String(val ?? '-'),
                }));

            return (
                <EntityDetailDrawer
                    open
                    onClose={onClose}
                    title={recordTitle}
                    subtitle={`${moduleLabel}${parentTitle ? ` • ${parentTitle}` : ''}`}
                    tabs={[
                        {
                            id: 'overview',
                            label: 'Overview',
                            icon: <ApartmentIcon sx={{ fontSize: 16 }} />,
                            content: (
                                <DrawerSectionCard title={`${moduleLabel} Details`}>
                                    <DrawerMetricGrid items={detailFields} />
                                </DrawerSectionCard>
                            ),
                        },
                    ]}
                />
            );
        }
    }
}
