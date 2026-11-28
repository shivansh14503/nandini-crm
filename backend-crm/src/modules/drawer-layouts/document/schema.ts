import { z } from 'zod';

/**
 * Drawer layout: how a module's record side drawer looks (Admin › Form Customization › Drawer Layout).
 *
 *   DrawerLayoutDocument → header (title, subtitle, avatar, badges) + tabs → sections → blocks
 *
 * Tabs are the module's form tabs (the drawer never has tabs of its own); the built-in Changes tab is added by the
 * drawer and is not part of the document. Styling is a closed set of presets, never colours or CSS, so every layout
 * follows the CRM theme (blue in light mode, green in dark mode). This folder is dependency-free apart from zod and
 * is copied verbatim into frontend-crm/src/lib/drawer-layout by `npm run sync:drawer-layout` (contractSync test checks).
 */

export const DRAWER_LAYOUT_VERSION = 1;

/** Modules whose record drawer is drawn from a layout (every CRM module). */
export const DRAWER_LAYOUT_MODULES = ['leads', 'contacts', 'organizations', 'opportunities', 'quotations', 'products', 'tickets', 'contracts', 'partner-companies', 'referrals'] as const;
export type DrawerLayoutModule = (typeof DRAWER_LAYOUT_MODULES)[number];

/** Values a drawer can show that aren't form fields (set by the system, never typed in). */
export const SYSTEM_FIELDS: Record<DrawerLayoutModule, readonly string[]> = {
    leads: ['leadCode', 'rating'],
    contacts: ['contactCode'],
    organizations: ['accountCode', 'accountVerified', 'activeAmc', 'activeCloud'],
    opportunities: ['opportunityCode', 'grandTotal', 'description'],
    quotations: ['quotationCode', 'grandTotal'],
    // Set while a product is Inactive (Status): when, why and by whom.
    products: ['productCode', 'inactiveSince', 'inactivityReason', 'inactivatedBy'],
    tickets: ['ticketNumber', 'amcFlag', 'cloudFlag'],
    contracts: ['contractNumber'],
    'partner-companies': [],
    referrals: [],
};

/** Each module's addresses, by field prefix (`primary` → primaryAddress, primaryCity, primaryState, …). */
export const ADDRESS_PREFIXES: Record<DrawerLayoutModule, readonly string[]> = {
    leads: ['primary', 'other'],
    contacts: [],
    organizations: ['billing', 'shipping'],
    opportunities: [],
    quotations: ['billing', 'shipping'],
    products: [],
    tickets: [],
    contracts: [],
    'partner-companies': ['billing', 'shipping'],
    referrals: [],
};

/** Modules whose records carry line items (products and services with totals): only they may use those blocks. */
export const LINE_ITEM_MODULES: readonly DrawerLayoutModule[] = ['opportunities', 'quotations'];

/** Preset avatar icons (the frontend maps each to an icon). */
export const AVATAR_ICONS = [
    'person',
    'group',
    'business',
    'store',
    'factory',
    'handshake',
    'star',
    'rocket',
    'school',
    'support',
    'phone',
    'work',
    'quote',
    'box',
    'ticket',
    'contract',
] as const;
export type AvatarIcon = (typeof AVATAR_ICONS)[number];

/** `auto` = the value's own colour (Rating colours, the scorecard's colours, Status green); the rest are fixed tones. */
export const BADGE_STYLES = ['auto', 'neutral', 'brand', 'success', 'warning', 'danger'] as const;
export type BadgeStyle = (typeof BADGE_STYLES)[number];

/** card = white card; subtle = grey band; highlight = brand tint; attention = amber tint (e.g. the next follow-up); plain = no box. */
export const SECTION_STYLES = ['card', 'subtle', 'highlight', 'attention', 'plain'] as const;
export type SectionStyle = (typeof SECTION_STYLES)[number];

/**
 * How a field block shows its value. standard = label over value; large = big bold value; emphasis = brand-coloured
 * value with an icon; chip / chips = pill(s); quote = italic with a left rule; channel = phone / email rows with
 * call / mail buttons; person = a user with initials, role and department; code = monospace pill with a copy
 * button; masked = all but the last 4 characters hidden until revealed (account numbers).
 */
export const FIELD_DISPLAYS = ['standard', 'large', 'emphasis', 'chip', 'chips', 'quote', 'channel', 'person', 'code', 'masked'] as const;
export type FieldDisplay = (typeof FIELD_DISPLAYS)[number];

export const BLOCK_TYPES = ['field', 'heading', 'text', 'divider', 'address', 'customFields', 'lineItems', 'totals'] as const;
export type BlockType = (typeof BLOCK_TYPES)[number];
/** Blocks only a module in LINE_ITEM_MODULES may use. */
export const LINE_ITEM_BLOCKS: readonly BlockType[] = ['lineItems', 'totals'];

export const LIMITS = {
    subtitleFields: 4,
    badges: 8,
    tabs: 20,
    sectionsPerTab: 30,
    blocksPerSection: 40,
    totalBlocks: 300,
    sectionTitle: 80,
    fieldLabel: 80,
    emptyText: 120,
    badgePrefix: 40,
    heading: 120,
    pieceName: 120,
} as const;

// ─── Primitives ─────────────────────────────────────────────────────────────────

const id = z.string().regex(/^[\w-]{1,40}$/, { message: 'Invalid id.' });
/** A form field key (built-in camelCase or custom snake_case) or one of the module's system values (e.g. leadCode). */
const fieldKey = z.string().regex(/^[A-Za-z][A-Za-z0-9_]{0,79}$/, { message: 'Invalid field key.' });
const tabKey = z.string().regex(/^[\w-]{1,40}$/, { message: 'Invalid tab key.' });
/** Address field prefix, e.g. `primary` for primaryAddress / primaryCity / … */
const addressPrefix = z.string().regex(/^[a-z][A-Za-z]{0,19}$/, { message: 'Invalid address.' });
const text = (max: number) => z.string().max(max);

/**
 * One emoji (any the operating system's picker offers, flags and skin tones included): a single grapheme that is
 * pictographic or a flag, with no plain letters or spaces.
 */
export function isSingleEmoji(value: string): boolean {
    if (!value || value.length > 32 || /\s/.test(value)) return false;
    if (!/\p{Extended_Pictographic}|\p{Regional_Indicator}|\u20e3/u.test(value)) return false;
    if (/[\p{L}]/u.test(value.replace(/\p{Extended_Pictographic}|\p{Emoji_Modifier}|\p{Emoji_Component}|‍|️/gu, ''))) return false;
    const Segmenter = (Intl as unknown as { Segmenter?: new (l?: string, o?: { granularity: 'grapheme' }) => { segment(s: string): Iterable<unknown> } }).Segmenter;
    if (!Segmenter) return true;
    return [...new Segmenter(undefined, { granularity: 'grapheme' }).segment(value)].length === 1;
}

// ─── Header ─────────────────────────────────────────────────────────────────────

export const avatarSchema = z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('icon'), icon: z.enum(AVATAR_ICONS) }),
    z.object({ kind: z.literal('initials') }),
    z.object({ kind: z.literal('emoji'), emoji: z.string().refine(isSingleEmoji, { message: 'Pick one emoji.' }) }),
]);
export type DrawerAvatar = z.infer<typeof avatarSchema>;

export const badgeSchema = z.object({
    id,
    field: fieldKey,
    /** Text before the value, e.g. "Rating: ". */
    prefix: text(LIMITS.badgePrefix),
    style: z.enum(BADGE_STYLES),
    hideEmpty: z.boolean(),
});
export type DrawerBadge = z.infer<typeof badgeSchema>;

export const headerSchema = z.object({
    titleField: fieldKey,
    /** Joined with " • "; empty values are skipped. */
    subtitleFields: z.array(fieldKey).max(LIMITS.subtitleFields),
    avatar: avatarSchema,
    /** Leads only: the avatar turns red while the lead's Rating is Hot (ignored elsewhere). */
    hotAvatar: z.boolean(),
    badges: z.array(badgeSchema).max(LIMITS.badges),
});
export type DrawerHeader = z.infer<typeof headerSchema>;

// ─── Blocks ─────────────────────────────────────────────────────────────────────

export const fieldBlockSchema = z.object({
    id,
    type: z.literal('field'),
    field: fieldKey,
    display: z.enum(FIELD_DISPLAYS),
    /** Empty = the field's own label. */
    label: text(LIMITS.fieldLabel),
    showLabel: z.boolean(),
    /** In a two-column section: half = one column, full = the whole row. */
    width: z.enum(['half', 'full']),
    hideEmpty: z.boolean(),
    /** Shown instead of the value when it is empty and hideEmpty is off. Empty = "Not provided". */
    emptyText: text(LIMITS.emptyText),
    /** Double-click the value to copy it. */
    copy: z.boolean(),
});

export const blockSchema = z.discriminatedUnion('type', [
    fieldBlockSchema,
    z.object({ id, type: z.literal('heading'), text: text(LIMITS.heading) }),
    z.object({ id, type: z.literal('text'), text: z.string() }), // long text: no character limit
    z.object({ id, type: z.literal('divider') }),
    z.object({ id, type: z.literal('address'), prefix: addressPrefix, emptyText: text(LIMITS.emptyText) }),
    /** Every custom field marked "Visible in Drawer" that isn't placed elsewhere on the layout (new ones land here). */
    z.object({ id, type: z.literal('customFields') }),
    /** The record's products and services, one card each (opportunities, quotations). */
    z.object({ id, type: z.literal('lineItems'), emptyText: text(LIMITS.emptyText) }),
    /** Gross amount, discounts, taxable amount, GST and grand total of the line items (opportunities, quotations). */
    z.object({ id, type: z.literal('totals') }),
]);
export type DrawerBlock = z.infer<typeof blockSchema>;
export type DrawerFieldBlock = z.infer<typeof fieldBlockSchema>;
export type DrawerBlockOf<T extends BlockType> = Extract<DrawerBlock, { type: T }>;

// ─── Sections & document ────────────────────────────────────────────────────────

export const sectionSchema = z.object({
    id,
    title: text(LIMITS.sectionTitle),
    style: z.enum(SECTION_STYLES),
    columns: z.union([z.literal(1), z.literal(2)]),
    /** Hide the whole section when none of its blocks has anything to show. */
    hideEmpty: z.boolean(),
    /** Name of the library piece the section was inserted from (shown in the builder only). */
    piece: text(LIMITS.pieceName).optional(),
    blocks: z.array(blockSchema).max(LIMITS.blocksPerSection),
});
export type DrawerSection = z.infer<typeof sectionSchema>;

export const documentSchema = z
    .object({
        version: z.literal(DRAWER_LAYOUT_VERSION),
        header: headerSchema,
        /** Sections per form tab key, in order. A tab without sections is hidden from the drawer. */
        tabs: z.record(tabKey, z.array(sectionSchema).max(LIMITS.sectionsPerTab)),
    })
    .superRefine((doc, ctx) => {
        const tabCount = Object.keys(doc.tabs).length;
        if (tabCount > LIMITS.tabs) ctx.addIssue({ code: 'custom', path: ['tabs'], message: `A drawer can have at most ${LIMITS.tabs} tabs.` });
        const seen = new Set<string>();
        const claim = (value: string, path: (string | number)[]) => {
            if (seen.has(value)) ctx.addIssue({ code: 'custom', path, message: `Duplicate id "${value}".` });
            seen.add(value);
        };
        doc.header.badges.forEach((b, i) => claim(b.id, ['header', 'badges', i, 'id']));
        let blocks = 0;
        for (const [tab, sections] of Object.entries(doc.tabs)) {
            sections.forEach((s, si) => {
                claim(s.id, ['tabs', tab, si, 'id']);
                s.blocks.forEach((b, bi) => claim(b.id, ['tabs', tab, si, 'blocks', bi, 'id']));
                blocks += s.blocks.length;
            });
        }
        if (blocks > LIMITS.totalBlocks) ctx.addIssue({ code: 'custom', path: ['tabs'], message: `A drawer can have at most ${LIMITS.totalBlocks} blocks.` });
    });
export type DrawerLayoutDocument = z.infer<typeof documentSchema>;

/** A saved library piece: one section. */
export const pieceSchema = z.object({
    name: z.string().trim().min(1, 'Give the piece a name.').max(LIMITS.pieceName),
    section: sectionSchema,
});
