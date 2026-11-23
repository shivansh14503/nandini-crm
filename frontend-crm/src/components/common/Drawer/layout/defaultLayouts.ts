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
 * The Leads layout reproduces the hand-built lead drawer this feature replaced.
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
                { id: 'g-rating', field: 'rating', prefix: 'Rating: ', style: 'auto', hideEmpty: true },
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

const DEFAULT_LAYOUTS: Record<DrawerLayoutModule, () => DrawerLayoutDocument> = { leads: leadsLayout };

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
