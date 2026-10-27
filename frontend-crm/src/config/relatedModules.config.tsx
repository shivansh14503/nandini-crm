import React from 'react';
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
import {
    contactService,
    leadService,
    opportunityService,
    organizationService,
    productService,
    quotationService,
    ticketService,
} from '@/services';

export type CrmEntityType =
    | 'organization'
    | 'contact'
    | 'lead'
    | 'opportunity'
    | 'product'
    | 'quotation';

export type RelatedRecordRow = Record<string, unknown>;

export function normalizeRelatedModuleKey(moduleId: string): string {
    const normalized = moduleId.trim().toLowerCase().replace(/-/g, '_');
    if (normalized === 'quotes') return 'quotations';
    if (normalized === 'line_items') return 'products';
    return normalized;
}

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
    const orgName = String(
        obj.organizationName || (isOrg ? rawTitle : '')
    )
        .trim()
        .toLowerCase();

    const contactId = String(obj.contactId || (isContact ? recordId : '')).trim();
    const contactName = String(
        obj.contactName || (isContact ? obj.name || rawTitle : '')
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
 * Single source of truth for resolving linked records for both `RelatedModulesSidebar` badge counts
 * and `RelatedRecordsTableView` table rows. Guarantees 100% parity between badge numbers and table rows.
 */
export function resolveRelatedRecordsForModule(
    moduleId: string,
    parentEntityTitle: string,
    parentRecordId?: string,
    entityData?: unknown,
    entityType?: CrmEntityType
): RelatedRecordRow[] {
    const moduleKey = normalizeRelatedModuleKey(moduleId);
    const ctx = extractEntityContext(entityType, entityData, parentEntityTitle, parentRecordId);

    switch (moduleKey) {
        case 'contacts': {
            const contacts = contactService.getAllSync();
            return contacts
                .filter((c) => {
                    if (ctx.entityType === 'opportunity' || ctx.entityType === 'quotation') {
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
            const opps = opportunityService.getAllSync();
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
                    if (ctx.entityType === 'product' && ctx.productName) {
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
            const quotes = quotationService.getAllSync();
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
                    if (ctx.entityType === 'product' && ctx.productName) {
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
            const leads = leadService.getAllSync();
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
            const orgs = organizationService.getAllSync();
            if (ctx.entityType === 'product' && ctx.productName) {
                const quotes = quotationService.getAllSync();
                const opps = opportunityService.getAllSync();
                const matchedOrgNames = new Set<string>();
                quotes.forEach((q) => {
                    if (
                        q.lineItems?.some(
                            (li) =>
                                (ctx.productId && li.productId === ctx.productId) ||
                                li.productName.trim().toLowerCase() === ctx.productName
                        ) &&
                        q.organizationName
                    ) {
                        matchedOrgNames.add(q.organizationName.trim().toLowerCase());
                    }
                });
                opps.forEach((o) => {
                    if (
                        o.lineItems?.some(
                            (li) =>
                                (ctx.productId && li.productId === ctx.productId) ||
                                li.productName.trim().toLowerCase() === ctx.productName
                        ) &&
                        o.organizationName
                    ) {
                        matchedOrgNames.add(o.organizationName.trim().toLowerCase());
                    }
                });
                return orgs
                    .filter((org) => matchedOrgNames.has(org.organizationName.trim().toLowerCase()))
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
            const catalog = productService.getAllSync();
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
                        serialNumber: String(
                            matchedProduct?.productCode || `SN-NIPL-2026-0${idx + 1}`
                        ),
                        status: 'Active',
                        warrantyPeriod: '12 Months',
                        warrantyEndDate: '2027-03-31',
                        location: ctx.title || 'Primary Site',
                    };
                });
            }

            // For organizations, check products present in linked quotations/opportunities
            if (ctx.orgId || ctx.orgName) {
                const linkedQuotes = quotationService.getAllSync().filter(
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
                                serialNumber: String(
                                    matchedProduct?.productCode || `SN-NIPL-2026-0${idx + 1}`
                                ),
                                status: 'Active',
                                warrantyPeriod: '12 Months',
                                warrantyEndDate: '2027-03-31',
                                location: ctx.title || 'Primary Site',
                            });
                        }
                    });
                });
                return Array.from(seenProducts.values());
            }

            return [];
        }

        case 'activities': {
            if (ctx.entityType === 'organization') {
                return [];
            }
            if (!ctx.title) return [];
            return [
                {
                    id: `act-${ctx.recordId || '1'}-1`,
                    subject: `Follow-up Call — ${ctx.title}`,
                    status: 'Scheduled',
                    contact: ctx.contactName || ctx.title,
                    startDate: '2026-10-25 11:00 AM',
                    assignedUser: 'mittal.sharma',
                },
            ];
        }

        case 'tickets': {
            const sameText = (a: string | undefined, b: string) => Boolean(b) && (a || '').trim().toLowerCase() === b;
            return ticketService
                .getAllSync()
                .filter((t) =>
                    ctx.entityType === 'contact'
                        ? sameText(t.contactPersonName, ctx.contactName)
                        : sameText(t.organizationName, ctx.orgName)
                )
                .map((t) => ({
                    ...t,
                    subject: t.ticketSubject || t.problemReported,
                    status: t.ticketStatus,
                    priority: t.ticketPriority,
                    dateCreated: new Date(t.createdAt).toLocaleDateString('en-IN'),
                    assignedUser: t.assignedTo,
                }));
        }

        case 'contracts':
        case 'partner_contacts':
        case 'member_organizations':
        case 'documents':
        case 'partner_company':
            return [];

        case 'security_groups':
            return ctx.title || ctx.recordId
                ? [
                      {
                          id: 'sg-001',
                          name: 'Enterprise Sales — North & West Region',
                          description:
                              'Full access to enterprise accounts, commercial quotations, and SLA escalations.',
                      },
                  ]
                : [];

        case 'notes':
            return ctx.title
                ? [
                      {
                          id: `note-${ctx.recordId || '1'}`,
                          subject: `Discovery & Requirement Note — ${ctx.title}`,
                          status: 'Active',
                          assignedUser: 'mittal.sharma',
                      },
                  ]
                : [];

        case 'conversion_audit':
            return ctx.title
                ? [
                      {
                          id: `conv-${ctx.recordId || '1'}`,
                          subject: `Lead Qualification Check — ${ctx.title}`,
                          status: 'Verified',
                          assignedUser: 'mittal.sharma',
                      },
                  ]
                : [];

        case 'history':
            if (!ctx.title && !ctx.recordId) return [];
            return [
                {
                    id: 'his-001',
                    subject: `Commercial Proposal & BoQ Shared — ${ctx.title || 'Record'}`,
                    status: 'Completed',
                    contact: ctx.contactName || 'Primary Contact',
                    dateModified: '2026-10-21 04:15 PM',
                    dateCreated: '2026-10-21 02:00 PM',
                    dueDate: '2026-10-21',
                    assignedUser: 'mittal.sharma',
                },
                {
                    id: 'his-002',
                    subject: 'GST & Billing Verification Completed',
                    status: 'Completed',
                    contact: 'Accounts Desk',
                    dateModified: '2026-10-15 11:20 AM',
                    dateCreated: '2026-10-14 05:10 PM',
                    dueDate: '2026-10-15',
                    assignedUser: 'mittal.sharma',
                },
                {
                    id: 'his-003',
                    subject: 'Initial Technical Requirement Gathering',
                    status: 'Completed',
                    contact: 'IT Infrastructure Lead',
                    dateModified: '2026-10-08 01:45 PM',
                    dateCreated: '2026-10-08 10:30 AM',
                    dueDate: '2026-10-08',
                    assignedUser: 'rohit.verma',
                },
            ];

        default:
            return [];
    }
}

export function getRelatedModulesForEntity(
    entityType: CrmEntityType,
    entityData?: unknown,
    onSelectModule?: (moduleId: string) => void
): RelatedModuleItem[] {
    const ctx = extractEntityContext(entityType, entityData);

    const countFor = (moduleId: string): number => {
        if (!entityData) return 0;
        return resolveRelatedRecordsForModule(
            moduleId,
            ctx.title,
            ctx.recordId,
            entityData,
            entityType
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
