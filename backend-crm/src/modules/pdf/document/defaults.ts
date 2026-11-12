import type { Block, BlockOf, BlockType, Column, PageMargins, PdfDocument, RichInline, RichText, Section, Style, Theme } from './schema.js';
import { DOCUMENT_VERSION } from './schema.js';

/** Factories for new blocks / sections / documents and small helpers shared by templates and the builder. */

const ID_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

export function newId(prefix: string): string {
    let suffix = '';
    for (let i = 0; i < 10; i++) suffix += ID_ALPHABET[Math.floor(Math.random() * ID_ALPHABET.length)];
    return `${prefix}-${suffix}`;
}

export const DEFAULT_MARGINS: PageMargins = { top: 12, right: 10, bottom: 18, left: 10, header: 0, footer: 6 };

export const DEFAULT_THEME: Theme = {
    accentColor: '#1d4ed8',
    textColor: '#1f2937',
    fontSize: 9.5,
    lineHeight: 1.4,
    companyName: 'Nandini Infosys Pvt. Ltd.',
    companyAddress: '',
    companyPhone: '',
    companyEmail: '',
    companyGstin: '',
    companyWebsite: '',
};

// ─── Rich text ──────────────────────────────────────────────────────────────────

/** Inline content shorthand: a string, `{ field: path }`, or `{ text, bold?, italic?, color? }`. */
export type InlineSpec = string | { field: string; bold?: boolean } | { text: string; bold?: boolean; italic?: boolean; color?: string } | { br: true };

function toInline(spec: InlineSpec): RichInline {
    if (typeof spec === 'string') return { type: 'text', text: spec };
    if ('br' in spec) return { type: 'hardBreak' };
    const marks: NonNullable<Extract<RichInline, { type: 'text' }>['marks']> = [];
    if (spec.bold) marks.push({ type: 'bold' });
    if ('italic' in spec && spec.italic) marks.push({ type: 'italic' });
    if ('color' in spec && spec.color) marks.push({ type: 'textStyle', attrs: { color: spec.color } });
    if ('field' in spec) return { type: 'field', attrs: { path: spec.field }, ...(marks.length ? { marks } : {}) };
    return { type: 'text', text: spec.text, ...(marks.length ? { marks } : {}) };
}

/** `rich(['Hello ', { field: 'customer.contactName' }], ['Second line'])`; empty strings are dropped. */
export function rich(...paragraphs: InlineSpec[][]): RichText {
    return {
        type: 'doc',
        content: paragraphs.map((p) => {
            const content = p.filter((s) => s !== '').map(toInline);
            return content.length ? { type: 'paragraph' as const, content } : { type: 'paragraph' as const };
        }),
    };
}

/** Plain text of rich text (fields as `{path}`), e.g. for layer names. */
export function richTextPlain(content: RichText): string {
    return content.content
        .map((p) => (p.content ?? []).map((n) => (n.type === 'text' ? n.text : n.type === 'field' ? `{${n.attrs.path}}` : ' ')).join(''))
        .join(' ')
        .trim();
}

// ─── Blocks ─────────────────────────────────────────────────────────────────────

export interface LineItemColumnInfo {
    key: string;
    label: string;
    align: 'left' | 'right' | 'center';
    defaultVisible: boolean;
    widthPct?: number;
}

export interface BlockFactoryInput {
    lineItemColumns: LineItemColumnInfo[];
}

export const BLOCK_LABELS: Record<BlockType, string> = {
    title: 'Title',
    text: 'Text',
    image: 'Image',
    divider: 'Divider',
    spacer: 'Spacer',
    pageBreak: 'Page break',
    field: 'Field',
    detailsList: 'Details list',
    address: 'Address',
    lineItems: 'Line items',
    totals: 'Totals',
    amountInWords: 'Amount in words',
    terms: 'Terms',
    customFields: 'Custom fields',
    pageNumber: 'Page number',
    signature: 'Signature',
};

const style = (s: Style = {}): Style => s;

export function lineItemColumnsFrom(columns: LineItemColumnInfo[]): BlockOf<'lineItems'>['props']['columns'] {
    return columns.map((c) => ({ key: c.key, label: c.label, visible: c.defaultVisible, align: c.align, ...(c.widthPct !== undefined ? { widthPct: c.widthPct } : {}) }));
}

export const DEFAULT_TOTAL_ROWS: BlockOf<'totals'>['props']['rows'] = [
    { key: 'totalAmount', label: 'Gross Amount', visible: true, hideIfZero: false },
    { key: 'totalDiscount', label: 'Discount', visible: true, hideIfZero: true },
    { key: 'lumpSumDiscount', label: 'Lump-sum Discount', visible: true, hideIfZero: true },
    { key: 'subtotal', label: 'Subtotal', visible: true, hideIfZero: false },
    { key: 'totalTax', label: 'Tax', visible: true, hideIfZero: false },
    { key: 'grandTotal', label: 'Grand Total', visible: true, hideIfZero: false },
];

export function createBlock<T extends BlockType>(type: T, input: BlockFactoryInput): BlockOf<T>;
export function createBlock(type: BlockType, input: BlockFactoryInput): Block {
    const id = newId('b');
    switch (type) {
        case 'title':
            return { id, type, style: style({ margin: { top: 0, right: 0, bottom: 2, left: 0 } }), props: { level: 1, content: rich(['Title']) } };
        case 'text':
            return { id, type, style: style({ margin: { top: 0, right: 0, bottom: 2, left: 0 } }), props: { content: rich(['Write something here.']) } };
        case 'image':
            return { id, type, style: style(), props: { source: 'logo', widthMm: 0, heightMm: 18, align: 'left', alt: 'Logo' } };
        case 'divider':
            return { id, type, style: style({ margin: { top: 2, right: 0, bottom: 2, left: 0 } }), props: { thickness: 1, lineStyle: 'solid', color: '#cbd5e1', widthPct: 100 } };
        case 'spacer':
            return { id, type, style: style(), props: { heightMm: 6 } };
        case 'pageBreak':
            return { id, type, style: style(), props: {} };
        case 'field':
            return { id, type, style: style(), hideIfEmpty: true, props: { path: 'quotation.code', label: 'Quotation No.', showLabel: true, layout: 'inline', labelBold: false } };
        case 'detailsList':
            return {
                id,
                type,
                style: style(),
                props: {
                    rows: [
                        { id: newId('r'), path: 'quotation.code', label: 'Quote No.', hideIfEmpty: true },
                        { id: newId('r'), path: 'quotation.date', label: 'Date', hideIfEmpty: true },
                        { id: newId('r'), path: 'quotation.validUntil', label: 'Valid Till', hideIfEmpty: true },
                    ],
                    labelWidthPct: 40,
                    valueBold: true,
                    bordered: false,
                },
            };
        case 'address':
            return { id, type, style: style(), hideIfEmpty: true, props: { which: 'billing', title: 'Bill To', parts: { street: true, city: true, state: true, postalCode: true, country: false } } };
        case 'lineItems':
            return {
                id,
                type,
                style: style({ margin: { top: 3, right: 0, bottom: 0, left: 0 } }),
                props: {
                    columns: lineItemColumnsFrom(input.lineItemColumns),
                    descriptionUnderName: true,
                    headerBackground: 'accent',
                    headerColor: '#ffffff',
                    borderColor: '#cbd5e1',
                    borders: 'grid',
                    zebra: false,
                    fontSize: 0,
                    emptyText: 'No line items',
                },
            };
        case 'totals':
            return { id, type, style: style({ avoidPageBreak: true }), props: { rows: DEFAULT_TOTAL_ROWS.map((r) => ({ ...r })), highlightGrandTotal: true, bordered: true, labelWidthPct: 55 } };
        case 'amountInWords':
            return { id, type, style: style(), hideIfEmpty: true, props: { label: 'Amount in words', showLabel: true } };
        case 'terms':
            return {
                id,
                type,
                style: style({ margin: { top: 4, right: 0, bottom: 0, left: 0 } }),
                props: {
                    sections: [
                        { key: 'remarks', title: 'Remarks', visible: true },
                        { key: 'paymentTerms', title: 'Payment Terms', visible: true },
                        { key: 'termsAndConditions', title: 'Terms & Conditions', visible: true },
                    ],
                    titleColor: 'accent',
                    showTitles: true,
                },
            };
        case 'customFields':
            return { id, type, style: style({ margin: { top: 3, right: 0, bottom: 0, left: 0 } }), hideIfEmpty: true, props: { title: '', labelWidthPct: 35 } };
        case 'pageNumber':
            return { id, type, style: style({ textAlign: 'right', color: '#475569', fontSize: 8 }), props: { format: 'Page {page} of {total}' } };
        case 'signature':
            return { id, type, style: style(), props: { heightMm: 18, caption: 'Authorised Signatory', lineAbove: true, align: 'right' } };
    }
}

// ─── Sections ───────────────────────────────────────────────────────────────────

export interface SectionPreset {
    key: string;
    label: string;
    description: string;
    widths: number[];
}

export const SECTION_PRESETS: SectionPreset[] = [
    { key: '1', label: '1 Column', description: 'Full width single column layout', widths: [100] },
    { key: '2', label: '2 Columns', description: '50/50 split layout', widths: [50, 50] },
    { key: '3', label: '3 Columns', description: 'Equal three column layout', widths: [33.34, 33.33, 33.33] },
    { key: '4', label: '4 Columns', description: 'Four equal columns', widths: [25, 25, 25, 25] },
    { key: '60-40', label: '2 Columns (60/40)', description: '60% left, 40% right split', widths: [60, 40] },
    { key: '40-60', label: '2 Columns (40/60)', description: '40% left, 60% right split', widths: [40, 60] },
    { key: '25-50-25', label: '3 Columns (25/50/25)', description: 'Sidebar, content, sidebar', widths: [25, 50, 25] },
];

export function createColumn(widthPct: number, blocks: Block[] = [], columnStyle: Style = {}): Column {
    return { id: newId('c'), widthPct, style: columnStyle, blocks };
}

/** A section with one column per width; `blocks[i]` fills column i. */
export function createSection(widths: number[], blocks: Block[][] = [], sectionStyle: Style = {}, columnStyles: Style[] = []): Section {
    return { id: newId('s'), style: sectionStyle, columns: widths.map((w, i) => createColumn(w, blocks[i] ?? [], columnStyles[i] ?? {})) };
}

export function blankDocument(input: BlockFactoryInput): PdfDocument {
    return {
        version: DOCUMENT_VERSION,
        page: { size: 'A4', orientation: 'portrait', margins: { ...DEFAULT_MARGINS } },
        theme: { ...DEFAULT_THEME },
        header: [],
        body: [createSection([100], [[createBlock('title', input)]]), createSection([100], [[createBlock('lineItems', input)]])],
        footer: [createSection([100], [[createBlock('pageNumber', input)]])],
    };
}

/** Deep copy with fresh ids (duplicate, insert from the saved library). */
export function cloneBlock(block: Block): Block {
    const copy = JSON.parse(JSON.stringify(block)) as Block;
    copy.id = newId('b');
    if (copy.type === 'detailsList') copy.props.rows = copy.props.rows.map((r) => ({ ...r, id: newId('r') }));
    return copy;
}

export function cloneSection(section: Section): Section {
    return {
        id: newId('s'),
        style: JSON.parse(JSON.stringify(section.style)) as Style,
        columns: section.columns.map((c) => ({ id: newId('c'), widthPct: c.widthPct, style: JSON.parse(JSON.stringify(c.style)) as Style, blocks: c.blocks.map(cloneBlock) })),
    };
}

/** Rescales widths to add up to exactly 100 (two decimals), keeping proportions. */
export function normalizeWidths(widths: number[]): number[] {
    const total = widths.reduce((s, w) => s + w, 0) || 1;
    const scaled = widths.map((w) => Math.round((w / total) * 10000) / 100);
    const drift = Math.round((100 - scaled.reduce((s, w) => s + w, 0)) * 100) / 100;
    scaled[0] = Math.round((scaled[0] + drift) * 100) / 100;
    return scaled;
}
