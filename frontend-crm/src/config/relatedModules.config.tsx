import React, { useMemo } from 'react';
import AssignmentOutlinedIcon from '@mui/icons-material/AssignmentOutlined';
import ConfirmationNumberOutlinedIcon from '@mui/icons-material/ConfirmationNumberOutlined';
import PeopleOutlinedIcon from '@mui/icons-material/PeopleOutlined';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import HistoryOutlinedIcon from '@mui/icons-material/HistoryOutlined';
import PersonAddAlt1OutlinedIcon from '@mui/icons-material/PersonAddAlt1Outlined';
import GroupsOutlinedIcon from '@mui/icons-material/GroupsOutlined';
import TrendingUpOutlinedIcon from '@mui/icons-material/TrendingUpOutlined';
import AccountTreeOutlinedIcon from '@mui/icons-material/AccountTreeOutlined';
import FolderOutlinedIcon from '@mui/icons-material/FolderOutlined';
import Inventory2OutlinedIcon from '@mui/icons-material/Inventory2Outlined';
import RequestQuoteOutlinedIcon from '@mui/icons-material/RequestQuoteOutlined';
import HandshakeOutlinedIcon from '@mui/icons-material/HandshakeOutlined';
import AdminPanelSettingsOutlinedIcon from '@mui/icons-material/AdminPanelSettingsOutlined';
import ApartmentOutlinedIcon from '@mui/icons-material/ApartmentOutlined';
import StickyNote2OutlinedIcon from '@mui/icons-material/StickyNote2Outlined';
import SwapHorizOutlinedIcon from '@mui/icons-material/SwapHorizOutlined';
import type { RelatedModuleItem } from '@/components/common/Drawer/RelatedModulesSidebar';
import type { AuditRevisionItem } from '@/components/common/Drawer/types';
import {
    useContacts,
    useEntityAuditLogs,
    useLeads,
    useOpportunities,
    useOrganizations,
    useProducts,
    useQuotations,
    useTickets,
    type AuditEntityType,
} from '@/hooks/queries';
import type { Contact } from '@/types/contact.types';
import type { Lead } from '@/types/lead.types';
import type { Opportunity } from '@/types/opportunity.types';
import type { ExtendedOrganization } from '@/types/organization.types';
import type { Product } from '@/types/product.types';
import type { Quotation } from '@/types/quotation.types';
import type { Ticket } from '@/types/ticket.types';

export type CrmEntityType =
    | 'organization'
    | 'contact'
    | 'lead'
    | 'opportunity'
    | 'product'
    | 'quotation'
    | 'ticket';

export type RelatedRecordRow = Record<string, unknown>;

export interface RelatedRecordDatasets {
    contacts?: Contact[];
    opportunities?: Opportunity[];
    quotations?: Quotation[];
    leads?: Lead[];
    organizations?: ExtendedOrganization[];
    products?: Product[];
    tickets?: Ticket[];
    auditRevisions?: AuditRevisionItem[];
}

export function normalizeRelatedModuleKey(moduleId: string): string {
    const normalized = moduleId.trim().toLowerCase().replace(/-/g, '_');
    if (normalized === 'quotes') return 'quotations';
    if (normalized === 'line_items') return 'products';
    return normalized;
}

const AUDIT_ENTITY_MAP: Record<CrmEntityType, AuditEntityType> = {
    organization: 'organizations',
    contact: 'contacts',
    lead: 'leads',
    opportunity: 'opportunities',
    product: 'products',
    quotation: 'quotations',
    ticket: 'tickets',
};

interface ExtractedEntityContext {
    entityType?: CrmEntityType;
    recordId: string;
    title: string;
    orgId: string;
    orgName: string;
    contactId: string;
    contactName: string;
    oppId: string;
    oppCode: string;
    productId: string;
    productName: string;
    lineItems: Array<Record<string, unknown>>;
}

function extractEntityContext(
    entityType?: CrmEntityType,
    entityData?: unknown,
    parentEntityTitle = '',
    parentRecordId = ''
): ExtractedEntityContext {
    const obj =
        entityData && typeof entityData === 'object'
            ? (entityData as Record<string, unknown>)
            : {};

    const recordId = String(parentRecordId || obj.id || '').trim();
    const rawTitle = String(
        parentEntityTitle ||
            obj.organizationName ||
            obj.name ||
            obj.productName ||
            obj.quotationCode ||
            obj.opportunityCode ||
            ''
    ).trim();

    const isOrg = entityType === 'organization' || ('accountCode' in obj && !('leadCode' in obj));
    const isContact = entityType === 'contact' || ('isPrimaryContact' in obj && 'organizationId' in obj);
    const isOpp = entityType === 'opportunity' || 'opportunityCode' in obj;
    const isProduct = entityType === 'product' || ('productCode' in obj && 'mrp' in obj);

    const orgId = String(obj.organizationId || (isOrg ? recordId : '')).trim();
    const orgName = String(obj.organizationName || (isOrg ? rawTitle : ''))
        .trim()
        .toLowerCase();

    const contactId = String(obj.contactId || (isContact ? recordId : '')).trim();
    const contactName = String(
        obj.contactName || obj.contactPersonName || (isContact ? obj.name || rawTitle : '')
    )
        .trim()
        .toLowerCase();

    const oppId = String(obj.opportunityId || (isOpp ? recordId : '')).trim();
    const oppCode = String(obj.opportunityCode || '')
        .trim()
        .toLowerCase();

    const productId = String(isProduct ? recordId : '').trim();
    const productName = String(obj.productName || (isProduct ? rawTitle : ''))
        .trim()
        .toLowerCase();

    const lineItems = Array.isArray(obj.lineItems)
        ? (obj.lineItems as Array<Record<string, unknown>>)
        : [];

    return {
        entityType,
        recordId,
        title: rawTitle,
        orgId,
        orgName: orgName || rawTitle.toLowerCase(),
        contactId,
        contactName,
        oppId,
        oppCode,
        productId,
        productName,
        lineItems,
    };
}

/**
 * Resolves linked records for both `RelatedModulesSidebar` badge counts and `RelatedRecordsTableView`
 * table rows from live React Query datasets (no sync cache or fabricated mock entries).
 */
export function resolveRelatedRecordsForModule(
    moduleId: string,
    parentEntityTitle: string,
    parentRecordId?: string,
    entityData?: unknown,
    entityType?: CrmEntityType,
    datasets: RelatedRecordDatasets = {}
): RelatedRecordRow[] {
    const moduleKey = normalizeRelatedModuleKey(moduleId);
    const ctx = extractEntityContext(entityType, entityData, parentEntityTitle, parentRecordId);

    switch (moduleKey) {
        case 'contacts': {
            const contacts = datasets.contacts ?? [];
            return contacts
                .filter((c) => {
                    if (
                        ctx.entityType === 'opportunity' ||
                        ctx.entityType === 'quotation' ||
                        ctx.entityType === 'ticket'
                    ) {
                        if (ctx.contactId && c.id === ctx.contactId) return true;
                        if (ctx.contactName && c.name.trim().toLowerCase() === ctx.contactName) return true;
                    }
                    if (ctx.orgId && c.organizationId === ctx.orgId) return true;
                    if (
                        ctx.orgName &&
                        c.organizationName &&
                        c.organizationName.trim().toLowerCase() === ctx.orgName
                    ) {
                        return true;
                    }
                    return false;
                })
                .map((c) => ({ ...c }));
        }

        case 'opportunities': {
            const opps = datasets.opportunities ?? [];
            return opps
                .filter((o) => {
                    if (ctx.entityType === 'quotation' && ctx.oppId && o.id === ctx.oppId) return true;
                    if (
                        ctx.entityType === 'quotation' &&
                        ctx.oppCode &&
                        o.opportunityCode.trim().toLowerCase() === ctx.oppCode
                    ) {
                        return true;
                    }
                    if (ctx.entityType === 'contact') {
                        if (ctx.contactId && o.contactId === ctx.contactId) return true;
                        if (
                            ctx.contactName &&
                            o.contactName &&
                            o.contactName.trim().toLowerCase() === ctx.contactName
                        ) {
                            return true;
                        }
                    }
                    if (ctx.entityType === 'product' && (ctx.productId || ctx.productName)) {
                        return Boolean(
                            o.lineItems?.some(
                                (li) =>
                                    (ctx.productId && li.productId === ctx.productId) ||
                                    li.productName.trim().toLowerCase() === ctx.productName
                            )
                        );
                    }
                    if (ctx.orgId && o.organizationId === ctx.orgId) return true;
                    if (
                        ctx.orgName &&
                        o.organizationName &&
                        o.organizationName.trim().toLowerCase() === ctx.orgName
                    ) {
                        return true;
                    }
                    return false;
                })
                .map((o) => ({ ...o }));
        }

        case 'quotations': {
            const quotes = datasets.quotations ?? [];
            return quotes
                .filter((q) => {
                    if (ctx.entityType === 'opportunity') {
                        if (ctx.recordId && q.opportunityId === ctx.recordId) return true;
                        if (
                            ctx.oppCode &&
                            q.opportunityCode &&
                            q.opportunityCode.trim().toLowerCase() === ctx.oppCode
                        ) {
                            return true;
                        }
                        return false;
                    }
                    if (ctx.entityType === 'contact') {
                        if (ctx.recordId && q.contactId === ctx.recordId) return true;
                        if (
                            ctx.contactName &&
                            q.contactName &&
                            q.contactName.trim().toLowerCase() === ctx.contactName
                        ) {
                            return true;
                        }
                    }
                    if (ctx.entityType === 'product' && (ctx.productId || ctx.productName)) {
                        return Boolean(
                            q.lineItems?.some(
                                (li) =>
                                    (ctx.productId && li.productId === ctx.productId) ||
                                    li.productName.trim().toLowerCase() === ctx.productName
                            )
                        );
                    }
                    if (ctx.orgId && q.organizationId === ctx.orgId) return true;
                    if (
                        ctx.orgName &&
                        q.organizationName &&
                        q.organizationName.trim().toLowerCase() === ctx.orgName
                    ) {
                        return true;
                    }
                    return false;
                })
                .map((q) => ({ ...q }));
        }

        case 'leads': {
            const leads = datasets.leads ?? [];
            return leads
                .filter(
                    (l) =>
                        ctx.orgName &&
                        l.organizationName &&
                        l.organizationName.trim().toLowerCase() === ctx.orgName
                )
                .map((l) => ({ ...l }));
        }

        case 'organizations': {
            const orgs = datasets.organizations ?? [];
            if (ctx.entityType === 'product' && (ctx.productId || ctx.productName)) {
                const quotes = datasets.quotations ?? [];
                const opps = datasets.opportunities ?? [];
                const matchedOrgIds = new Set<string>();
                const matchedOrgNames = new Set<string>();
                quotes.forEach((q) => {
                    if (
                        q.lineItems?.some(
                            (li) =>
                                (ctx.productId && li.productId === ctx.productId) ||
                                li.productName.trim().toLowerCase() === ctx.productName
                        )
                    ) {
                        if (q.organizationId) matchedOrgIds.add(q.organizationId);
                        if (q.organizationName) matchedOrgNames.add(q.organizationName.trim().toLowerCase());
                    }
                });
                opps.forEach((o) => {
                    if (
                        o.lineItems?.some(
                            (li) =>
                                (ctx.productId && li.productId === ctx.productId) ||
                                li.productName.trim().toLowerCase() === ctx.productName
                        )
                    ) {
                        if (o.organizationId) matchedOrgIds.add(o.organizationId);
                        if (o.organizationName) matchedOrgNames.add(o.organizationName.trim().toLowerCase());
                    }
                });
                return orgs
                    .filter(
                        (org) =>
                            matchedOrgIds.has(org.id) ||
                            matchedOrgNames.has(org.organizationName.trim().toLowerCase())
                    )
                    .map((org) => ({ ...org }));
            }

            return orgs
                .filter(
                    (org) =>
                        (ctx.orgId && org.id === ctx.orgId) ||
                        (ctx.orgName && org.organizationName.trim().toLowerCase() === ctx.orgName)
                )
                .map((org) => ({ ...org }));
        }

        case 'products': {
            const catalog = datasets.products ?? [];
            if (ctx.lineItems.length > 0) {
                return ctx.lineItems.map((li, idx) => {
                    const matchedProduct = catalog.find(
                        (p) =>
                            p.id === li.productId ||
                            p.productName.trim().toLowerCase() ===
                                String(li.productName || '')
                                    .trim()
                                    .toLowerCase()
                    );
                    return {
                        ...(matchedProduct || {}),
                        ...li,
                        id: String(li.id || matchedProduct?.id || `li-${idx}`),
                        productName: String(li.productName || matchedProduct?.productName || '-'),
                        serialNumber: String(matchedProduct?.productCode || '-'),
                        status: matchedProduct?.isActive === false ? 'Inactive' : 'Active',
                    };
                });
            }

            if (ctx.orgId || ctx.orgName) {
                const linkedQuotes = (datasets.quotations ?? []).filter(
                    (q) =>
                        (ctx.orgId && q.organizationId === ctx.orgId) ||
                        (ctx.orgName &&
                            q.organizationName &&
                            q.organizationName.trim().toLowerCase() === ctx.orgName)
                );
                const seenProducts = new Map<string, RelatedRecordRow>();
                linkedQuotes.forEach((q) => {
                    (q.lineItems || []).forEach((li, idx) => {
                        const key = String(li.productId || li.productName || idx);
                        if (!seenProducts.has(key)) {
                            const matchedProduct = catalog.find(
                                (p) =>
                                    p.id === li.productId ||
                                    p.productName.trim().toLowerCase() ===
                                        String(li.productName || '')
                                            .trim()
                                            .toLowerCase()
                            );
                            seenProducts.set(key, {
                                ...(matchedProduct || {}),
                                ...li,
                                id: String(matchedProduct?.id || li.id || key),
                                productName: String(li.productName || matchedProduct?.productName || '-'),
                                serialNumber: String(matchedProduct?.productCode || '-'),
                                status: matchedProduct?.isActive === false ? 'Inactive' : 'Active',
                            });
                        }
                    });
                });
                return Array.from(seenProducts.values());
            }

            return [];
        }

        case 'tickets': {
            const sameText = (a: string | undefined, b: string) =>
                Boolean(b) && (a || '').trim().toLowerCase() === b;
            return (datasets.tickets ?? [])
                .filter((t) => {
                    if (ctx.entityType === 'contact') {
                        return (
                            (ctx.contactId && t.contactId === ctx.contactId) ||
                            sameText(t.contactPersonName, ctx.contactName)
                        );
                    }
                    return (
                        (ctx.orgId && t.organizationId === ctx.orgId) ||
                        sameText(t.organizationName, ctx.orgName)
                    );
                })
                .map((t) => ({
                    ...t,
                    subject: t.ticketSubject || t.problemReported,
                    status: t.ticketStatus,
                    priority: t.ticketPriority,
                    dateCreated: new Date(t.createdAt).toLocaleDateString('en-IN'),
                    assignedUser: t.assignedTo,
                }));
        }

        case 'history':
        case 'conversion_audit': {
            const revisions = datasets.auditRevisions ?? [];
            return revisions.map((rev, idx) => ({
                id: `rev-${ctx.recordId || 'rec'}-${idx}`,
                subject: rev.note ? `${rev.title} — ${rev.note}` : rev.title,
                status: rev.to || 'Recorded',
                contact: ctx.contactName || ctx.title || '-',
                dateModified: rev.time,
                dateCreated: rev.time,
                dueDate: '-',
                assignedUser: rev.author,
            }));
        }

        case 'activities':
        case 'contracts':
        case 'partner_contacts':
        case 'member_organizations':
        case 'documents':
        case 'partner_company':
        case 'security_groups':
        case 'notes':
        default:
            return [];
    }
}

/**
 * Fetches the live datasets needed to compute related records and badge counts for an active drawer entity.
 * Queries are disabled when `enabled` is false or `entityData` is null.
 */
export function useRelatedDatasets(
    entityType: CrmEntityType,
    entityData?: unknown,
    enabled = true
): RelatedRecordDatasets {
    const active = Boolean(enabled && entityData);
    const ctx = useMemo(() => extractEntityContext(entityType, entityData), [entityType, entityData]);

    const contactFilter = useMemo(
        () => (ctx.orgId ? { organizationId: ctx.orgId } : undefined),
        [ctx.orgId]
    );
    const oppFilter = useMemo(() => {
        if (entityType === 'contact' && ctx.contactId) return { contactId: ctx.contactId };
        if (entityType === 'product' && ctx.productId) return { productId: ctx.productId };
        if (ctx.orgId) return { organizationId: ctx.orgId };
        return undefined;
    }, [entityType, ctx.contactId, ctx.productId, ctx.orgId]);

    const quoteFilter = useMemo(() => {
        if (entityType === 'opportunity' && ctx.recordId) return { opportunityId: ctx.recordId };
        if (entityType === 'contact' && ctx.contactId) return { contactId: ctx.contactId };
        if (entityType === 'product' && ctx.productId) return { productId: ctx.productId };
        if (ctx.orgId) return { organizationId: ctx.orgId };
        return undefined;
    }, [entityType, ctx.recordId, ctx.contactId, ctx.productId, ctx.orgId]);

    const ticketFilter = useMemo(() => {
        if (entityType === 'contact' && ctx.contactId) return { contactId: ctx.contactId };
        if (ctx.orgId) return { organizationId: ctx.orgId };
        return undefined;
    }, [entityType, ctx.contactId, ctx.orgId]);

    const leadFilter = useMemo(
        () => (ctx.title && entityType === 'organization' ? { organizationName: ctx.title } : undefined),
        [entityType, ctx.title]
    );

    const needsContacts = active && ['organization', 'opportunity', 'quotation', 'ticket'].includes(entityType);
    const needsOpps = active && ['organization', 'contact', 'quotation', 'product'].includes(entityType);
    const needsQuotes = active && ['organization', 'contact', 'opportunity', 'product'].includes(entityType);
    const needsLeads = active && entityType === 'organization';
    const needsOrgs = active && ['contact', 'opportunity', 'quotation', 'ticket', 'product'].includes(entityType);
    const needsProducts = active && ['organization', 'opportunity', 'quotation'].includes(entityType);
    const needsTickets = active && ['organization', 'contact'].includes(entityType);

    const { data: contacts } = useContacts(contactFilter, { enabled: needsContacts });
    const { data: opportunities } = useOpportunities(oppFilter, { enabled: needsOpps });
    const { data: quotations } = useQuotations(quoteFilter, { enabled: needsQuotes });
    const { data: leads } = useLeads(leadFilter, { enabled: needsLeads });
    const { data: organizations } = useOrganizations(undefined, { enabled: needsOrgs });
    const { data: products } = useProducts(undefined, { enabled: needsProducts });
    const { data: tickets } = useTickets(ticketFilter, { enabled: needsTickets });
    const { data: auditRevisions } = useEntityAuditLogs(
        AUDIT_ENTITY_MAP[entityType],
        active && ctx.recordId ? ctx.recordId : undefined
    );

    return useMemo(
        () => ({
            contacts,
            opportunities,
            quotations,
            leads,
            organizations,
            products,
            tickets,
            auditRevisions,
        }),
        [contacts, opportunities, quotations, leads, organizations, products, tickets, auditRevisions]
    );
}

export function getRelatedModulesForEntity(
    entityType: CrmEntityType,
    entityData?: unknown,
    onSelectModule?: (moduleId: string) => void,
    datasets: RelatedRecordDatasets = {}
): RelatedModuleItem[] {
    const ctx = extractEntityContext(entityType, entityData);

    const countFor = (moduleId: string): number => {
        if (!entityData) return 0;
        return resolveRelatedRecordsForModule(
            moduleId,
            ctx.title,
            ctx.recordId,
            entityData,
            entityType,
            datasets
        ).length;
    };

    const withClick = (
        items: Array<{ id: string; label: string; icon: React.ReactNode }>
    ): RelatedModuleItem[] =>
        items.map((item) => ({
            ...item,
            count: countFor(item.id),
            onClick: onSelectModule ? () => onSelectModule(item.id) : undefined,
        }));

    switch (entityType) {
        case 'organization':
            return withClick([
                { id: 'activities', label: 'Activities', icon: <AssignmentOutlinedIcon /> },
                { id: 'tickets', label: 'Tickets', icon: <ConfirmationNumberOutlinedIcon /> },
                { id: 'contacts', label: 'Contacts', icon: <PeopleOutlinedIcon /> },
                { id: 'contracts', label: 'Contracts', icon: <DescriptionOutlinedIcon /> },
                { id: 'history', label: 'History', icon: <HistoryOutlinedIcon /> },
                { id: 'leads', label: 'Leads', icon: <PersonAddAlt1OutlinedIcon /> },
                { id: 'partner-contacts', label: 'Partner Contacts', icon: <GroupsOutlinedIcon /> },
                { id: 'opportunities', label: 'Opportunities', icon: <TrendingUpOutlinedIcon /> },
                { id: 'member-organizations', label: 'Member Organizations', icon: <AccountTreeOutlinedIcon /> },
                { id: 'documents', label: 'Documents', icon: <FolderOutlinedIcon /> },
                { id: 'products', label: 'Products', icon: <Inventory2OutlinedIcon /> },
                { id: 'quotations', label: 'Quotations', icon: <RequestQuoteOutlinedIcon /> },
                { id: 'partner-company', label: 'Partner Company', icon: <HandshakeOutlinedIcon /> },
                { id: 'security-groups', label: 'Security Groups', icon: <AdminPanelSettingsOutlinedIcon /> },
            ]);

        case 'contact':
            return withClick([
                { id: 'activities', label: 'Activities', icon: <AssignmentOutlinedIcon /> },
                { id: 'tickets', label: 'Tickets', icon: <ConfirmationNumberOutlinedIcon /> },
                { id: 'organizations', label: 'Organizations', icon: <ApartmentOutlinedIcon /> },
                { id: 'opportunities', label: 'Opportunities', icon: <TrendingUpOutlinedIcon /> },
                { id: 'quotations', label: 'Quotations', icon: <RequestQuoteOutlinedIcon /> },
                { id: 'history', label: 'History', icon: <HistoryOutlinedIcon /> },
            ]);

        case 'lead':
            return withClick([
                { id: 'activities', label: 'Activities', icon: <AssignmentOutlinedIcon /> },
                { id: 'notes', label: 'Notes', icon: <StickyNote2OutlinedIcon /> },
                { id: 'history', label: 'History', icon: <HistoryOutlinedIcon /> },
                { id: 'conversion-audit', label: 'Conversion Audit', icon: <SwapHorizOutlinedIcon /> },
            ]);

        case 'opportunity':
            return withClick([
                { id: 'activities', label: 'Activities', icon: <AssignmentOutlinedIcon /> },
                { id: 'quotes', label: 'Quotes', icon: <RequestQuoteOutlinedIcon /> },
                { id: 'contacts', label: 'Contacts', icon: <PeopleOutlinedIcon /> },
                { id: 'organizations', label: 'Organizations', icon: <ApartmentOutlinedIcon /> },
                { id: 'products', label: 'Products/Line Items', icon: <Inventory2OutlinedIcon /> },
                { id: 'history', label: 'History', icon: <HistoryOutlinedIcon /> },
            ]);

        case 'quotation':
            return withClick([
                { id: 'line-items', label: 'Line Items', icon: <Inventory2OutlinedIcon /> },
                { id: 'opportunities', label: 'Opportunities', icon: <TrendingUpOutlinedIcon /> },
                { id: 'organizations', label: 'Organizations', icon: <ApartmentOutlinedIcon /> },
                { id: 'contacts', label: 'Contacts', icon: <PeopleOutlinedIcon /> },
                { id: 'history', label: 'History', icon: <HistoryOutlinedIcon /> },
            ]);

        case 'ticket':
            return withClick([
                { id: 'activities', label: 'Activities', icon: <AssignmentOutlinedIcon /> },
                { id: 'organizations', label: 'Organizations', icon: <ApartmentOutlinedIcon /> },
                { id: 'contacts', label: 'Contacts', icon: <PeopleOutlinedIcon /> },
                { id: 'history', label: 'History', icon: <HistoryOutlinedIcon /> },
            ]);

        case 'product':
            return withClick([
                { id: 'quotations', label: 'Quotations', icon: <RequestQuoteOutlinedIcon /> },
                { id: 'opportunities', label: 'Opportunities', icon: <TrendingUpOutlinedIcon /> },
                { id: 'organizations', label: 'Organizations', icon: <ApartmentOutlinedIcon /> },
                { id: 'documents', label: 'Documents', icon: <FolderOutlinedIcon /> },
                { id: 'history', label: 'History', icon: <HistoryOutlinedIcon /> },
            ]);
    }
}

/**
 * React hook wrapper around `getRelatedModulesForEntity` that automatically subscribes to live React Query
 * datasets when `entityData` is non-null.
 */
export function useRelatedModulesForEntity(
    entityType: CrmEntityType,
    entityData?: unknown,
    onSelectModule?: (moduleId: string) => void
): RelatedModuleItem[] {
    const datasets = useRelatedDatasets(entityType, entityData, Boolean(entityData));
    return useMemo(
        () => (entityData ? getRelatedModulesForEntity(entityType, entityData, onSelectModule, datasets) : []),
        [entityType, entityData, onSelectModule, datasets]
    );
}
