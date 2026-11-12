import { QUOTATION_LINE_ITEM_COLUMNS } from '../fieldRegistry.js';
import type { Block, BlockOf, PdfDocument, Section, Style } from '../document/index.js';
import { createBlock, createSection, rich, type BlockFactoryInput, type InlineSpec } from '../document/index.js';
import type { PdfModule } from '../pdf.types.js';

/** A built-in template shipped in code and upserted on boot by pdfTemplate.seed.ts. */
export interface SystemTemplate {
    /** Stable identity (never shown); the seed matches rows by module + name. */
    key: string;
    module: PdfModule;
    name: string;
    description: string;
    /** Classic is the module default when no default exists. */
    isDefaultCandidate: boolean;
    /** Built fresh on each call (ids differ between calls; the seed compares content without ids). */
    build: () => PdfDocument;
}

export const QUOTATION_FACTORY: BlockFactoryInput = { lineItemColumns: QUOTATION_LINE_ITEM_COLUMNS };

// ─── Small builders used by the system templates ────────────────────────────────

export const box = (top: number, right = top, bottom = top, left = right) => ({ top, right, bottom, left });

export function title(text: InlineSpec[], level: 1 | 2 | 3, style: Style = {}): BlockOf<'title'> {
    const block = createBlock('title', QUOTATION_FACTORY);
    return { ...block, style: { margin: box(0, 0, 1, 0), ...style }, props: { level, content: rich(text) } };
}

export function text(paragraphs: InlineSpec[][], style: Style = {}, hideIfEmpty = false): BlockOf<'text'> {
    const block = createBlock('text', QUOTATION_FACTORY);
    return { ...block, style, ...(hideIfEmpty ? { hideIfEmpty } : {}), props: { content: rich(...paragraphs) } };
}

/** Small uppercase accent caption ("TO", "SALES PERSON"). */
export const caption = (label: string, style: Style = {}): BlockOf<'text'> =>
    text([[label]], { fontSize: 7.5, fontWeight: 'bold', color: 'accent', letterSpacing: 1, textTransform: 'uppercase', margin: box(0, 0, 0.8, 0), ...style });

export function field(path: string, label: string, style: Style = {}, extra: Partial<BlockOf<'field'>['props']> = {}): BlockOf<'field'> {
    const block = createBlock('field', QUOTATION_FACTORY);
    return { ...block, style, hideIfEmpty: true, props: { ...block.props, path, label, ...extra } };
}

export function details(rows: [path: string, label: string][], props: Partial<BlockOf<'detailsList'>['props']> = {}, style: Style = {}): BlockOf<'detailsList'> {
    const block = createBlock('detailsList', QUOTATION_FACTORY);
    return {
        ...block,
        style,
        props: { ...block.props, ...props, rows: rows.map(([path, label], i) => ({ id: `${block.id}-r${i}`, path, label, hideIfEmpty: true })) },
    };
}

export function address(which: 'billing' | 'shipping', heading: string, style: Style = {}): BlockOf<'address'> {
    const block = createBlock('address', QUOTATION_FACTORY);
    return { ...block, style, props: { ...block.props, which, title: heading } };
}

export function logo(heightMm: number, style: Style = {}, align: 'left' | 'center' | 'right' = 'left'): BlockOf<'image'> {
    const block = createBlock('image', QUOTATION_FACTORY);
    return { ...block, style, hideIfEmpty: true, props: { ...block.props, heightMm, align } };
}

export const make = <T extends Parameters<typeof createBlock>[0]>(type: T, patch: (b: BlockOf<T>) => BlockOf<T> = (b) => b): BlockOf<T> =>
    patch(createBlock(type, QUOTATION_FACTORY));

export const section = (widths: number[], blocks: Block[][], style: Style = {}, columnStyles: Style[] = []): Section => createSection(widths, blocks, style, columnStyles);

/** Computer-generated note + "Page X of Y", with a rule above. */
export function standardFooter(): Section[] {
    return [
        section(
            [72, 28],
            [
                [text([[{ text: '*This is computer generated Quotation and does not require any stamp or signature*', italic: true }]], { color: '#64748b', fontSize: 7.5 })],
                [make('pageNumber')],
            ],
            { border: { width: 1, style: 'solid', color: '#cbd5e1', radius: 0, sides: { top: true, right: false, bottom: false, left: false } }, padding: box(1, 0, 0, 0) },
        ),
    ];
}
