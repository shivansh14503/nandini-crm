import {
    DRAWER_LAYOUT_VERSION,
    cloneSection,
    type DrawerBlock,
    type DrawerFieldBlock,
    type DrawerLayoutDocument,
    type DrawerLayoutModule,
    type DrawerSection,
    type FieldDisplay,
} from '@/lib/drawer-layout';
import type { FieldType } from '@/types/formConfig.types';

/**
 * Built-in drawer layouts (used until an admin saves one) and the ready-made pieces of the builder's library.
 * Each module's layout reproduces the hand-built drawer it replaced.
 */

export const newLayoutId = (prefix: string) => `${prefix}${Math.random().toString(36).slice(2, 11)}`;

/** The look a field gets when dropped on the drawer. */
export function defaultDisplayFor(type: FieldType): FieldDisplay {
    if (type === 'multiselect') return 'chips';
    if (type === 'phone' || type === 'email') return 'channel';
    return 'standard';
}

export function fieldBlock(field: string, type: FieldType, overrides: Partial<DrawerFieldBlock> = {}): DrawerFieldBlock {
    return {
        id: newLayoutId('b'),
        type: 'field',
        field,
        display: defaultDisplayFor(type),
        label: '',
        showLabel: true,
        width: 'half',
        hideEmpty: true,
        emptyText: '',
        copy: false,
        ...overrides,
    };
}

export function newSection(title: string, columns: 1 | 2 = 1, blocks: DrawerBlock[] = []): DrawerSection {
    return { id: newLayoutId('s'), title, style: 'card', columns, hideEmpty: true, blocks };
}

// ─── Leads ──────────────────────────────────────────────────────────────────────

const f = (id: string, field: string, display: FieldDisplay, o: Partial<DrawerFieldBlock> = {}): DrawerFieldBlock => ({
    id,
    type: 'field',
    field,
    display,
    label: '',
    showLabel: true,
    width: 'half',
    hideEmpty: true,
    emptyText: '',
    copy: false,
    ...o,
});

function leadsLayout(): DrawerLayoutDocument {
    return {
        version: DRAWER_LAYOUT_VERSION,
        header: {
            titleField: 'name',
            subtitleFields: ['leadCode', 'organizationName'],
            avatar: { kind: 'icon', icon: 'person' },
            hotAvatar: true,
            badges: [
                { id: 'g-type', field: 'leadType', prefix: '', style: 'neutral', hideEmpty: true },
                { id: 'g-status', field: 'status', prefix: '', style: 'auto', hideEmpty: true },
                { id: 'g-owner', field: 'assignedTo', prefix: '', style: 'neutral', hideEmpty: true },
            ],
        },
        tabs: {
            overview: [
                {
                    id: 's-org',
                    title: 'PROSPECTIVE ORGANIZATION',
                    style: 'subtle',
                    columns: 1,
                    hideEmpty: false,
                    piece: 'Prospective Organization',
                    blocks: [
                        f('b-org', 'organizationName', 'emphasis', { showLabel: false, hideEmpty: false, emptyText: 'Individual Prospect / Non-Entity', copy: true }),
                        f('b-mailing', 'mailingName', 'standard'),
                    ],
                },
                {
                    id: 's-followup',
                    title: 'NEXT SCHEDULED FOLLOWUP',
                    style: 'attention',
                    columns: 1,
                    hideEmpty: true,
                    piece: 'Next Followup card',
                    blocks: [
                        f('b-fu-type', 'followupType', 'chip', { showLabel: false }),
                        f('b-fu-date', 'nextFollowupDate', 'large', { showLabel: false }),
                        f('b-fu-remarks', 'remarks', 'quote', { showLabel: false }),
                    ],
                },
                {
                    id: 's-products',
                    title: 'PRODUCTS & SOLUTIONS OF INTEREST',
                    style: 'card',
                    columns: 1,
                    hideEmpty: false,
                    piece: 'Products of Interest',
                    blocks: [f('b-products', 'productCategory', 'chips', { showLabel: false, hideEmpty: false, emptyText: 'No products selected yet' })],
                },
                {
                    id: 's-channels',
                    title: 'DIRECT PHONE & EMAIL',
                    style: 'card',
                    columns: 1,
                    hideEmpty: true,
                    piece: 'Direct Phone & Email',
                    blocks: [f('b-mobile', 'mobile', 'channel'), f('b-other-phone', 'otherPhone', 'channel'), f('b-email', 'emailAddress', 'channel')],
                },
                {
                    id: 's-facts',
                    title: 'KEY FACTS',
                    style: 'card',
                    columns: 2,
                    hideEmpty: true,
                    piece: 'Key Facts grid',
                    blocks: [
                        f('b-designation', 'designation', 'standard'),
                        f('b-department', 'department', 'standard'),
                        f('b-turnover', 'turnover', 'standard'),
                        f('b-employees', 'noOfEmployee', 'standard'),
                    ],
                },
                {
                    id: 's-source',
                    title: 'SOURCE & OWNER',
                    style: 'subtle',
                    columns: 2,
                    hideEmpty: true,
                    piece: 'Source & Owner',
                    blocks: [f('b-source', 'leadSource', 'standard'), f('b-owner', 'assignedTo', 'standard'), f('b-referred', 'referredBy', 'standard')],
                },
                {
                    id: 's-custom',
                    title: 'MORE DETAILS',
                    style: 'card',
                    columns: 2,
                    hideEmpty: true,
                    piece: 'Other custom fields',
                    blocks: [{ id: 'b-custom', type: 'customFields' }],
                },
            ],
            address: [
                {
                    id: 's-billing',
                    title: 'BILLING ADDRESS',
                    style: 'card',
                    columns: 1,
                    hideEmpty: false,
                    piece: 'Billing Address',
                    blocks: [{ id: 'b-billing', type: 'address', prefix: 'primary', emptyText: 'No billing address specified' }],
                },
                {
                    id: 's-shipping',
                    title: 'SHIPPING ADDRESS',
                    style: 'card',
                    columns: 1,
                    hideEmpty: false,
                    piece: 'Shipping Address',
                    blocks: [{ id: 'b-shipping', type: 'address', prefix: 'other', emptyText: 'Same as billing address or not provided' }],
                },
            ],
        },
    };
}

// ─── Other modules (each reproduces the module's former hand-built drawer) ───────

type SectionStyle = DrawerSection['style'];
const sec = (id: string, title: string, style: SectionStyle, columns: 1 | 2, blocks: DrawerBlock[], piece = '', hideEmpty = true): DrawerSection => ({
    id,
    title,
    style,
    columns,
    hideEmpty,
    ...(piece || title ? { piece: piece || titleWords(title) } : {}),
    blocks,
});
/** 'KEY FACTS' → 'Key Facts' (piece names). */
const titleWords = (text: string) => text.toLowerCase().replace(/(^|[\s\-/(&])([a-z])/g, (_, a: string, c: string) => a + c.toUpperCase());
const custom = (id: string): DrawerSection => sec(id, 'MORE DETAILS', 'card', 2, [{ id: `${id}-b`, type: 'customFields' }], 'Other custom fields');
const address = (id: string, title: string, prefix: string, emptyText: string, style: SectionStyle = 'card'): DrawerSection =>
    sec(id, title, style, 1, [{ id: `${id}-b`, type: 'address', prefix, emptyText }], titleWords(title), false);
const full = { width: 'full' } as const;
const bare = { showLabel: false } as const;

function contactsLayout(): DrawerLayoutDocument {
    return {
        version: DRAWER_LAYOUT_VERSION,
        header: {
            titleField: 'name',
            subtitleFields: ['designation', 'organizationName'],
            avatar: { kind: 'initials' },
            hotAvatar: false,
            badges: [
                { id: 'g-primary', field: 'isPrimaryContact', prefix: 'Primary Contact', style: 'brand', hideEmpty: true },
                { id: 'g-left', field: 'leftJob', prefix: 'Left job: ', style: 'auto', hideEmpty: true },
                { id: 'g-dnd', field: 'doNotCall', prefix: 'Do Not Call', style: 'danger', hideEmpty: true },
            ],
        },
        tabs: {
            overview: [
                sec('s-overview', 'OVERVIEW', 'card', 2, [
                    f('b-org', 'organizationName', 'emphasis', { ...full, label: 'Organisation', copy: true }),
                    f('b-designation', 'designation', 'standard'),
                    f('b-department', 'department', 'standard'),
                    f('b-code', 'contactCode', 'code'),
                ]),
                sec('s-channels', 'COMMUNICATION CHANNELS', 'card', 1, [
                    f('b-dnd', 'doNotCall', 'chip', { label: 'Do Not Call (DND)' }),
                    f('b-mobile', 'mobile', 'channel'),
                    f('b-office', 'officePhone', 'channel'),
                    f('b-phone3', 'phone3', 'channel'),
                    f('b-phone4', 'phone4', 'channel'),
                    f('b-phone5', 'phone5', 'channel'),
                    f('b-email', 'emailAddress', 'channel'),
                ]),
                sec('s-commtype', 'COMMUNICATION TYPE', 'card', 1, [f('b-commtype', 'communicationType', 'chips', bare)]),
                sec('s-owner', 'ASSIGNED USER', 'card', 1, [f('b-owner', 'assignedTo', 'person', { ...bare, hideEmpty: false, emptyText: 'Unassigned' })], 'Assigned User', false),
                custom('s-custom'),
                sec('s-notes', 'NOTES', 'card', 1, [f('b-notes', 'addDescription', 'standard', bare)]),
            ],
        },
    };
}

function organizationsLayout(): DrawerLayoutDocument {
    return {
        version: DRAWER_LAYOUT_VERSION,
        header: {
            titleField: 'organizationName',
            subtitleFields: ['tradeName', 'billingCity', 'billingState'],
            avatar: { kind: 'icon', icon: 'business' },
            hotAvatar: false,
            badges: [
                { id: 'g-status', field: 'accountStatus', prefix: '', style: 'auto', hideEmpty: true },
                { id: 'g-verified', field: 'accountVerified', prefix: 'Verified', style: 'success', hideEmpty: true },
                { id: 'g-amc', field: 'activeAmc', prefix: 'Active AMC', style: 'brand', hideEmpty: true },
                { id: 'g-cloud', field: 'activeCloud', prefix: 'Active Cloud', style: 'success', hideEmpty: true },
            ],
        },
        tabs: {
            overview: [
                sec('s-figures', 'KEY FIGURES', 'highlight', 2, [f('b-turnover', 'annualTurnover', 'large'), f('b-staff', 'numberOfEmployees', 'large')]),
                sec('s-profile', 'BUSINESS PROFILE', 'card', 2, [
                    f('b-nature', 'natureOfBusiness', 'standard'),
                    f('b-entity', 'typeOfEntity', 'standard'),
                    f('b-ctype', 'customerType', 'standard'),
                    f('b-member', 'memberOf', 'standard'),
                    f('b-source', 'leadSource', 'standard'),
                    f('b-partner', 'partnerCompany', 'standard', full),
                ]),
                sec('s-ids', 'ACCOUNT IDENTIFIERS', 'subtle', 1, [
                    f('b-account', 'accountCode', 'code'),
                    f('b-sap', 'sapCodeTallyId', 'code'),
                    f('b-showroom', 'showroomBranchCode', 'code'),
                ]),
                sec('s-owner', 'ACCOUNT OWNER', 'card', 1, [f('b-owner', 'assignedTo', 'person', { ...bare, hideEmpty: false, emptyText: 'Unassigned' })], 'Account Owner', false),
                custom('s-custom'),
                sec('s-about', 'ABOUT', 'card', 1, [f('b-about', 'addDescriptionAndScope', 'standard', bare)]),
            ],
            address: [
                address('s-billing', 'BILLING ADDRESS', 'billing', 'No billing address specified', 'subtle'),
                address('s-shipping', 'SHIPPING ADDRESS', 'shipping', 'Same as billing address or not provided', 'subtle'),
            ],
            tax_bank: [
                sec('s-tax', 'STATUTORY TAX & COMPLIANCE', 'card', 2, [
                    f('b-reg', 'registrationType', 'standard'),
                    f('b-gst', 'gstNumber', 'standard', { copy: true }),
                    f('b-pan', 'panNumber', 'standard', { copy: true }),
                    f('b-msme', 'msmeRegnNumber', 'standard', { copy: true }),
                    f('b-cin', 'cinNo', 'standard', { copy: true }),
                    f('b-tan', 'tanNumber', 'standard', { copy: true }),
                ]),
                sec('s-bank', 'OPERATING BANK ACCOUNT', 'subtle', 2, [
                    f('b-bank', 'bankName', 'standard'),
                    f('b-accname', 'accountName', 'standard'),
                    f('b-accno', 'accountNo', 'masked'),
                    f('b-acctype', 'typeOfAccount', 'standard'),
                    f('b-ifsc', 'ifscCode', 'standard', { copy: true }),
                    f('b-bankaddr', 'bankAddress', 'standard', full),
                ]),
            ],
        },
    };
}

function opportunitiesLayout(): DrawerLayoutDocument {
    return {
        version: DRAWER_LAYOUT_VERSION,
        header: {
            titleField: 'organizationName',
            subtitleFields: ['opportunityCode', 'contact'],
            avatar: { kind: 'initials' },
            hotAvatar: false,
            badges: [
                { id: 'g-stage', field: 'salesStage', prefix: '', style: 'auto', hideEmpty: true },
                { id: 'g-total', field: 'grandTotal', prefix: '', style: 'auto', hideEmpty: true },
                { id: 'g-type', field: 'type', prefix: '', style: 'neutral', hideEmpty: true },
            ],
        },
        tabs: {
            basic: [
                sec('s-client', 'CLIENT ORGANIZATION', 'subtle', 2, [
                    f('b-org', 'organizationName', 'emphasis', { ...full, ...bare, copy: true }),
                    f('b-code', 'opportunityCode', 'standard', { label: 'Deal Ref' }),
                    f('b-type', 'type', 'standard'),
                ]),
                sec('s-contact', 'CONTACT PERSON DETAILS', 'card', 1, [
                    f('b-contact', 'contact', 'standard'),
                    f('b-phone', 'contactNumber', 'channel'),
                    f('b-email', 'contactEmail', 'channel'),
                ]),
                custom('s-custom'),
                sec('s-products', 'PRODUCT INTEREST', 'card', 1, [f('b-products', 'productCategory', 'chips', bare)]),
                sec('s-followup', 'NEXT FOLLOWUP', 'attention', 2, [
                    f('b-fu-date', 'nextFollowupDate', 'large', { ...full, ...bare }),
                    f('b-fu-type', 'followupType', 'chip', { label: 'Method' }),
                    f('b-given', 'leadGivenBy', 'standard'),
                    f('b-response', 'customerResponse', 'standard'),
                ]),
                sec('s-remarks', 'ACTION BRIEF / REMARKS', 'card', 1, [f('b-remarks', 'remarks', 'standard', bare)]),
                sec('s-scope', 'DETAILED SCOPE / NOTES', 'card', 1, [f('b-scope', 'description', 'standard', bare)]),
                sec('s-source', 'SOURCE & OWNER', 'subtle', 2, [
                    f('b-source', 'leadSource', 'standard'),
                    f('b-referred', 'referredBy', 'standard'),
                    f('b-owner', 'assignedTo', 'standard'),
                ]),
                sec('s-billing', 'BILLING & COMMISSION', 'subtle', 2, [
                    f('b-tally', 'tallySerialNo', 'standard'),
                    f('b-invoice', 'invoiceNo', 'standard'),
                    f('b-invdate', 'invoiceDate', 'standard'),
                    f('b-commission', 'commission', 'standard'),
                    f('b-doc', 'addDocument', 'standard', { label: 'Document Attached' }),
                ]),
            ],
            line_items: [
                sec('s-items', '', 'plain', 1, [{ id: 'b-items', type: 'lineItems', emptyText: 'No line items specified for this opportunity.' }], 'Line items', false),
                sec('s-totals', 'FINANCIAL TOTALS', 'subtle', 1, [{ id: 'b-totals', type: 'totals' }], 'Financial totals'),
            ],
        },
    };
}

function quotationsLayout(): DrawerLayoutDocument {
    return {
        version: DRAWER_LAYOUT_VERSION,
        header: {
            titleField: 'quotationTitle',
            subtitleFields: ['quotationCode', 'organizationName'],
            avatar: { kind: 'icon', icon: 'quote' },
            hotAvatar: false,
            badges: [
                { id: 'g-stage', field: 'quoteStage', prefix: '', style: 'auto', hideEmpty: true },
                { id: 'g-total', field: 'grandTotal', prefix: '', style: 'auto', hideEmpty: true },
                { id: 'g-owner', field: 'assignedTo', prefix: '', style: 'neutral', hideEmpty: true },
            ],
        },
        tabs: {
            overview: [
                sec('s-title', 'QUOTATION TITLE / SUBJECT', 'subtle', 2, [
                    f('b-title', 'quotationTitle', 'large', { ...full, ...bare }),
                    f('b-code', 'quotationCode', 'standard', { label: 'Quote Code' }),
                    f('b-for', 'preparedFor', 'standard'),
                ]),
                sec('s-dates', 'KEY TIMELINES & VALIDITY', 'card', 2, [
                    f('b-date', 'quotationDate', 'standard'),
                    f('b-valid', 'validUntil', 'standard'),
                    f('b-period', 'validationPeriod', 'standard'),
                ]),
                sec('s-deal', 'DEAL & RELATIONSHIP DETAILS', 'card', 2, [
                    f('b-opp', 'opportunity', 'standard'),
                    f('b-company', 'company', 'standard'),
                    f('b-owner', 'assignedTo', 'standard'),
                    f('b-ref', 'otherRef', 'standard'),
                ]),
                sec('s-terms', 'PAYMENT & COMMERCIAL TERMS', 'card', 1, [
                    f('b-pay', 'paymentTerms', 'standard'),
                    f('b-paydesc', 'paymentTermsDescription', 'quote', bare),
                    f('b-tc', 'termsAndCondition', 'standard'),
                    f('b-tcdesc', 'termsAndConditionDescription', 'quote', bare),
                ]),
                custom('s-custom'),
                sec('s-remarks', 'REMARKS & INTERNAL NOTES', 'card', 1, [f('b-remarks', 'remarks', 'standard', bare)]),
            ],
            line_items: [
                sec('s-items', '', 'plain', 1, [{ id: 'b-items', type: 'lineItems', emptyText: 'No product line items attached to this quotation.' }], 'Line items', false),
                sec('s-totals', 'COMMERCIAL BREAKDOWN', 'highlight', 1, [{ id: 'b-totals', type: 'totals' }], 'Commercial breakdown'),
            ],
            address: [
                sec('s-account', 'ORGANIZATION & CONTACT', 'card', 2, [
                    f('b-org', 'organizationName', 'emphasis', { ...full, ...bare, copy: true }),
                    f('b-mailing', 'mailingName', 'standard'),
                    f('b-gst', 'gstNumber', 'code'),
                    f('b-contact', 'contact', 'standard', full),
                    f('b-phone', 'contactNumber', 'channel', full),
                    f('b-email', 'contactEmail', 'channel', full),
                ]),
                address('s-billing', 'BILLING ADDRESS', 'billing', 'No billing address specified'),
                address('s-shipping', 'SHIPPING ADDRESS', 'shipping', 'Same as billing address or not provided'),
            ],
        },
    };
}

function productsLayout(): DrawerLayoutDocument {
    return {
        version: DRAWER_LAYOUT_VERSION,
        header: {
            titleField: 'productName',
            subtitleFields: ['category', 'manufacturer'],
            avatar: { kind: 'icon', icon: 'box' },
            hotAvatar: false,
            badges: [
                { id: 'g-sku', field: 'productCode', prefix: 'SKU: ', style: 'neutral', hideEmpty: true },
                { id: 'g-tax', field: 'taxRate', prefix: 'Tax: ', style: 'brand', hideEmpty: true },
            ],
        },
        tabs: {
            overview: [
                sec('s-identity', 'PRODUCT IDENTITY & CODE', 'subtle', 1, [f('b-name', 'productName', 'large', bare), f('b-code', 'productCode', 'code', { label: 'SKU Code' })]),
                sec('s-sale', 'SALE INFORMATION & CLASSIFICATION', 'card', 2, [
                    f('b-category', 'category', 'standard'),
                    f('b-type', 'type', 'standard'),
                    f('b-hsn', 'hsnCode', 'standard', { label: 'HSN / SAC Code', copy: true }),
                    f('b-maker', 'manufacturer', 'standard'),
                ]),
                sec('s-pricing', 'PRICING STRUCTURE & MARGINS', 'card', 2, [
                    f('b-mrp', 'mrp', 'large'),
                    f('b-msp', 'msp', 'large'),
                    f('b-cost', 'cost', 'standard'),
                    f('b-discount', 'discount', 'standard'),
                    f('b-taxtype', 'taxType', 'standard'),
                    f('b-taxrate', 'taxRate', 'standard'),
                    f('b-contract', 'contractCreate', 'chip'),
                ]),
                custom('s-custom'),
                sec('s-desc', 'DESCRIPTION & COMMERCIAL TERMS', 'card', 1, [f('b-desc', 'description', 'standard', bare), f('b-terms', 'termsAndConditions', 'quote')]),
            ],
        },
    };
}

function ticketsLayout(): DrawerLayoutDocument {
    return {
        version: DRAWER_LAYOUT_VERSION,
        header: {
            titleField: 'ticketSubject',
            subtitleFields: ['ticketNumber', 'organizationName'],
            avatar: { kind: 'icon', icon: 'ticket' },
            hotAvatar: false,
            badges: [
                { id: 'g-priority', field: 'ticketPriority', prefix: '', style: 'auto', hideEmpty: true },
                { id: 'g-status', field: 'ticketStatus', prefix: '', style: 'auto', hideEmpty: true },
                { id: 'g-nature', field: 'natureOfCall', prefix: '', style: 'neutral', hideEmpty: true },
                { id: 'g-amc', field: 'amcFlag', prefix: 'AMC', style: 'brand', hideEmpty: true },
                { id: 'g-cloud', field: 'cloudFlag', prefix: 'Cloud', style: 'brand', hideEmpty: true },
            ],
        },
        tabs: {
            overview: [
                sec('s-glance', 'AT A GLANCE', 'subtle', 2, [
                    f('b-priority', 'ticketPriority', 'chip'),
                    f('b-status', 'ticketStatus', 'chip'),
                    f('b-support', 'supportType', 'standard'),
                    f('b-due', 'dueDate', 'large'),
                ]),
                sec('s-problem', 'PROBLEM DETAILS', 'card', 2, [
                    f('b-nature', 'natureOfCall', 'standard'),
                    f('b-mode', 'supportMode', 'standard'),
                    f('b-source', 'source', 'standard'),
                    f('b-reported', 'problemReported', 'standard', full),
                    f('b-observed', 'problemObserved', 'standard', full),
                    f('b-escalated', 'reasonForEscalatedCalls', 'standard', full),
                ]),
                sec('s-resolution', 'RESOLUTION & RCA', 'card', 1, [
                    f('b-resolution', 'resolution', 'standard'),
                    f('b-rca', 'rca', 'standard'),
                    f('b-adddesc', 'addDescription', 'standard', { label: 'Additional Description' }),
                ]),
                sec('s-client', 'CLIENT & CONTACT INFORMATION', 'card', 2, [
                    f('b-org', 'organizationName', 'standard', { label: 'Organization' }),
                    f('b-contact', 'contact', 'standard'),
                    f('b-phone', 'contactNumber', 'channel', full),
                    f('b-email', 'contactEmail', 'channel', full),
                    f('b-left', 'leftJob', 'standard'),
                    f('b-accaddr', 'accountAddress', 'standard', full),
                ]),
                sec('s-owner', 'ASSIGNED REPRESENTATIVE', 'card', 1, [f('b-owner', 'assignedTo', 'person', { ...bare, hideEmpty: false, emptyText: 'Unassigned' })], 'Assigned Representative', false),
                custom('s-custom'),
            ],
            partner_company: [
                sec(
                    's-partner',
                    'PARTNER COMPANY',
                    'card',
                    2,
                    [
                        f('b-partner', 'partnerCompany', 'standard', { hideEmpty: false, emptyText: 'No partner company linked' }),
                        f('b-pcontact', 'partnerCompanyContact', 'standard', { hideEmpty: false, emptyText: 'No partner contact linked' }),
                    ],
                    'Partner Company',
                    false,
                ),
            ],
        },
    };
}

function contractsLayout(): DrawerLayoutDocument {
    return {
        version: DRAWER_LAYOUT_VERSION,
        header: {
            titleField: 'contractTitle',
            subtitleFields: ['contractNumber', 'organizationName'],
            avatar: { kind: 'icon', icon: 'contract' },
            hotAvatar: false,
            badges: [
                { id: 'g-status', field: 'status', prefix: '', style: 'auto', hideEmpty: true },
                { id: 'g-period', field: 'contractPeriod', prefix: '', style: 'neutral', hideEmpty: true },
            ],
        },
        tabs: {
            overview: [
                sec('s-contract', 'CONTRACT', 'subtle', 2, [
                    f('b-value', 'contractValue', 'large'),
                    f('b-status', 'status', 'chip'),
                    f('b-owner', 'assignedTo', 'person', full),
                    f('b-org', 'organizationName', 'standard', { label: 'Organization' }),
                    f('b-contact', 'contact', 'standard'),
                    f('b-opp', 'opportunity', 'standard'),
                    f('b-tally', 'tallySerialNo', 'standard', { copy: true }),
                    f('b-type', 'contractType', 'chips', full),
                ]),
                sec('s-term', 'TERM & RENEWAL', 'attention', 2, [
                    f('b-start', 'startDate', 'standard'),
                    f('b-end', 'endDate', 'standard'),
                    f('b-period', 'contractPeriod', 'standard'),
                    f('b-renewal', 'renewalReminderDate', 'standard'),
                ]),
                sec('s-billing', 'BILLING', 'card', 2, [
                    f('b-bill', 'billNumber', 'standard'),
                    f('b-billdate', 'billDate', 'standard'),
                    f('b-billamount', 'billAmount', 'standard'),
                ]),
                custom('s-custom'),
                sec('s-desc', 'DESCRIPTION', 'card', 1, [f('b-desc', 'description', 'quote', bare)]),
            ],
        },
    };
}

function partnerCompaniesLayout(): DrawerLayoutDocument {
    return {
        version: DRAWER_LAYOUT_VERSION,
        header: {
            titleField: 'partnerName',
            subtitleFields: ['billingCity', 'principalCompany'],
            avatar: { kind: 'icon', icon: 'handshake' },
            hotAvatar: false,
            badges: [{ id: 'g-nature', field: 'natureOfPartner', prefix: '', style: 'brand', hideEmpty: true }],
        },
        tabs: {
            company_info: [
                sec('s-company', 'COMPANY DETAILS', 'card', 2, [
                    f('b-name', 'partnerName', 'standard', full),
                    f('b-nature', 'natureOfPartner', 'chip'),
                    f('b-owner', 'assignedTo', 'standard'),
                    f('b-principal', 'principalCompany', 'standard'),
                    f('b-website', 'website', 'standard', { copy: true }),
                ]),
                sec('s-comm', 'COMMUNICATION', 'card', 1, [f('b-office', 'officePhone', 'channel'), f('b-email', 'emailAddress', 'channel')]),
                sec('s-bank', 'BANK DETAILS', 'subtle', 2, [
                    f('b-bank', 'bankName', 'standard'),
                    f('b-branch', 'branch', 'standard'),
                    f('b-accno', 'accountNo', 'masked'),
                    f('b-ifsc', 'ifscCode', 'standard', { copy: true }),
                ]),
                custom('s-custom'),
                sec('s-notes', 'NOTES', 'card', 1, [f('b-adddesc', 'addDescription', 'standard', bare), f('b-desc', 'description', 'standard', bare)]),
            ],
            address: [
                address('s-billing', 'BILLING ADDRESS', 'billing', 'No billing address specified'),
                address('s-shipping', 'SHIPPING ADDRESS', 'shipping', 'Same as billing address or not provided'),
            ],
            statutory: [
                sec('s-statutory', 'STATUTORY & TAX IDENTIFICATION', 'card', 2, [
                    f('b-gst', 'gstNumber', 'standard', { copy: true }),
                    f('b-pan', 'panNumber', 'standard', { copy: true }),
                    f('b-cin', 'cinNo', 'standard', { copy: true }),
                    f('b-msme', 'msmeRegnNumber', 'standard', { copy: true }),
                    f('b-tan', 'tanNumber', 'standard', { copy: true }),
                ]),
            ],
        },
    };
}

const DEFAULT_LAYOUTS: Record<DrawerLayoutModule, () => DrawerLayoutDocument> = {
    leads: leadsLayout,
    contacts: contactsLayout,
    organizations: organizationsLayout,
    opportunities: opportunitiesLayout,
    quotations: quotationsLayout,
    products: productsLayout,
    tickets: ticketsLayout,
    contracts: contractsLayout,
    'partner-companies': partnerCompaniesLayout,
};

/** The module's built-in layout (a fresh object each call). */
export const defaultLayoutFor = (module: DrawerLayoutModule): DrawerLayoutDocument => DEFAULT_LAYOUTS[module]();

export interface BuiltInPiece {
    id: string;
    name: string;
    description: string;
    /** A fresh copy (new ids) to insert. */
    make: () => DrawerSection;
}

const PIECE_DESCRIPTIONS: Record<string, string> = {
    'Line items': 'Every product and service on the record, one card each',
    'Financial totals': 'Gross, discounts, subtotal, tax and grand total',
    'Commercial breakdown': 'Gross, discounts, subtotal, tax and grand total',
    'Assigned User': 'The owner with their role and department',
    'Account Owner': 'The owner with their role and department',
    'Assigned Representative': 'The owner with their role and department',
    'Prospective Organization': 'Organization name in brand colour, mailing name below',
    'Next Followup card': 'Follow-up type, date and time, and the last remark',
    'Products of Interest': 'Product categories as chips',
    'Direct Phone & Email': 'Every number and address with call / mail buttons',
    'Key Facts grid': 'Designation, department, turnover and staff in two columns',
    'Source & Owner': 'Lead source, owner and referrer',
    'Other custom fields': 'Every custom field not placed elsewhere',
    'Billing Address': 'Street, city, state, PIN and country',
    'Shipping Address': 'Street, city, state, PIN and country',
};

/** Ready-made pieces: every section of the built-in layout, each insertable (and then editable) on its own. */
export function builtInPiecesFor(module: DrawerLayoutModule): BuiltInPiece[] {
    const layout = defaultLayoutFor(module);
    return Object.values(layout.tabs)
        .flat()
        .map((section) => {
            const name = section.piece ?? section.title;
            return { id: `builtin:${section.id}`, name, description: PIECE_DESCRIPTIONS[name] ?? '', make: () => ({ ...cloneSection(section, newLayoutId), piece: name }) };
        });
}
