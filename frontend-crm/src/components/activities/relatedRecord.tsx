'use client';

import React, { useMemo } from 'react';
import { useContact, useContract, useLead, useOpportunity, useOrganization, useQuotation, useTicket } from '@/hooks/queries';
import { RelatedSecondaryDrawer } from '@/components/common/RelatedSecondaryDrawer';
import type { ActivityRelatedModule } from '@/types/activity.types';
import { toLinkTarget } from './activityLinks';

export { toLinkTarget };

type AnyRecord = Record<string, unknown> & { id: string };

/** Loads one record of any module an activity can link to (only the matching query runs). */
export function useRelatedRecord(module: ActivityRelatedModule | '' | undefined, id: string | undefined) {
    const idFor = (m: ActivityRelatedModule) => (module === m && id ? id : undefined);
    const lead = useLead(idFor('leads'));
    const opportunity = useOpportunity(idFor('opportunities'));
    const contact = useContact(idFor('contacts'));
    const organization = useOrganization(idFor('organizations'));
    const quotation = useQuotation(idFor('quotations'));
    const ticket = useTicket(idFor('tickets'));
    const contract = useContract(idFor('contracts'));
    const query = module
        ? { leads: lead, opportunities: opportunity, contacts: contact, organizations: organization, quotations: quotation, tickets: ticket, contracts: contract }[module]
        : undefined;
    const record = (query?.data ?? undefined) as AnyRecord | undefined;
    const target = useMemo(() => (module && record ? toLinkTarget(module, record) : undefined), [module, record]);
    return { record, target, loading: Boolean(query?.isLoading) };
}

export interface RelatedRecordDrawerProps {
    module: ActivityRelatedModule;
    id: string;
    onClose: () => void;
}

/** The related record's own detail drawer (stacked), once it has loaded. */
export function RelatedRecordDrawer({ module, id, onClose }: RelatedRecordDrawerProps) {
    const { record } = useRelatedRecord(module, id);
    if (!record) return null;
    return <RelatedSecondaryDrawer entity={{ type: module, data: record }} onClose={onClose} />;
}
