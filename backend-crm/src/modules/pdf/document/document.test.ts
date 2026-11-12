import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { ContextBuildInput } from '../contexts/contextTypes.js';
import { buildFieldRegistry } from '../fieldRegistry.js';
import { registryRefs } from '../pdfTemplate.service.js';
import { buildSampleQuotationContext } from '../sampleContext.js';
import { SYSTEM_TEMPLATES } from '../systemTemplates/index.js';
import { QUOTATION_FACTORY } from '../systemTemplates/types.js';
import {
    blankDocument,
    cloneSection,
    collectDocumentAssetKeys,
    createBlock,
    createSection,
    DEFAULT_THEME,
    documentSchema,
    normalizeWidths,
    renderBlock,
    renderDocument,
    rich,
    styleToCss,
    validateDocumentRefs,
    type Block,
    type PdfDocument,
    type RenderOptions,
} from './index.js';

const customFields = [{ fieldKey: 'cf_po_number', label: 'PO Number', fieldType: 'text' }];
const registry = buildFieldRegistry('QUOTATION', customFields);
const refs = registryRefs(registry);

const input = (overrides: Partial<ContextBuildInput> = {}): ContextBuildInput => ({
    registry,
    theme: { ...DEFAULT_THEME, companyName: 'Nandini Infosys Pvt. Ltd.', companyPhone: '+91 261 000 0000' },
    logoDataUri: '',
    customFields,
    generatedBy: 'tester',
    timeZone: 'Asia/Kolkata',
    ...overrides,
});

const ctx = buildSampleQuotationContext(input()) as unknown as Record<string, unknown>;
const pdf: RenderOptions = { mode: 'pdf', assetSrc: (key) => (key === 'logo-1' ? 'data:image/png;base64,AAAA' : null) };
const editor: RenderOptions = { ...pdf, mode: 'editor', fieldLabel: (p) => registry.fields.find((f) => f.path === p)?.label ?? p };

const docWith = (blocks: Block[], band: 'header' | 'body' | 'footer' = 'body'): PdfDocument => {
    const doc = blankDocument(QUOTATION_FACTORY);
    doc.header = [];
    doc.footer = [];
    doc.body = [];
    doc[band] = [createSection([100], [blocks])];
    return doc;
};

describe('system templates', () => {
    for (const template of SYSTEM_TEMPLATES) {
        it(`${template.name}: is a valid document that references only known fields`, () => {
            const doc = documentSchema.parse(template.build());
            assert.deepEqual(validateDocumentRefs(doc, refs), []);
        });

        it(`${template.name}: renders the sample quotation`, () => {
            const out = renderDocument(template.build(), ctx, pdf);
            assert.match(out.body, /QT-00042/);
            assert.match(out.body, /₹3,30,400\.00/);
            assert.match(out.body, /Rupees Three Lakh Thirty Thousand Four Hundred Only/);
            assert.match(out.body, /24-Port Managed Gigabit Switch/);
            // Description renders under the item name, not as its own column.
            assert.doesNotMatch(out.body, /<th[^>]*>Description<\/th>/);
            assert.match(out.body, /Layer 2\+ managed switch/);
            assert.match(out.footer, /class="pageNumber"/);
            assert.match(out.body, /PO Number/);
        });
    }
});

describe('document schema', () => {
    it('rejects CSS / HTML smuggled into styles and colours', () => {
        const doc = blankDocument(QUOTATION_FACTORY);
        (doc.body[0].style as Record<string, unknown>).background = 'red;background:url(http://x)';
        assert.equal(documentSchema.safeParse(doc).success, false);
        const doc2 = blankDocument(QUOTATION_FACTORY);
        (doc2.body[0].style as Record<string, unknown>).fontSize = '12pt;position:fixed';
        assert.equal(documentSchema.safeParse(doc2).success, false);
    });

    it('flags unknown fields, image fields in text, band rules and column widths', () => {
        const field = createBlock('field', QUOTATION_FACTORY);
        field.props.path = 'quotation.nope';
        const text = createBlock('text', QUOTATION_FACTORY);
        text.props.content = rich([{ field: 'company.logoDataUri' }]);
        const doc = docWith([field, text, createBlock('pageNumber', QUOTATION_FACTORY)]);
        doc.body.push(createSection([60, 60]));
        const messages = validateDocumentRefs(doc, refs).map((i) => i.message);
        assert.ok(messages.includes('Unknown field "quotation.nope".'));
        assert.ok(messages.some((m) => m.includes('is an image')));
        assert.ok(messages.some((m) => m.includes('pageNumber block can only be placed in the header or footer')));
        assert.ok(messages.includes('Column widths must add up to 100%.'));
    });
});

describe('renderer', () => {
    it('escapes text and field values', () => {
        const text = createBlock('text', QUOTATION_FACTORY);
        text.props.content = rich(['<script>x</script> ', { field: 'customer.contactName' }]);
        const html = renderBlock(text, { customer: { contactName: '"><img src=x onerror=alert(1)>' } }, DEFAULT_THEME, pdf);
        assert.doesNotMatch(html, /<script>|<img/);
        assert.match(html, /&lt;script&gt;/);
    });

    it('turns styles into inline CSS and resolves the accent colour', () => {
        const css = styleToCss({ padding: { top: 1, right: 2, bottom: 3, left: 4 }, background: 'accent', fontSize: 11, avoidPageBreak: true }, DEFAULT_THEME);
        assert.equal(css, `padding:1mm 2mm 3mm 4mm;background:${DEFAULT_THEME.accentColor};font-size:11pt;break-inside:avoid;page-break-inside:avoid;`);
    });

    it('drops empty hideIfEmpty blocks in the PDF but shows placeholders in the editor', () => {
        const field = createBlock('field', QUOTATION_FACTORY);
        field.props.path = 'quotation.otherRef';
        const empty = { quotation: { otherRef: '' } };
        assert.equal(renderBlock(field, empty, DEFAULT_THEME, pdf), '');
        assert.match(renderBlock(field, empty, DEFAULT_THEME, editor), /Other Reference/);
    });

    it('renders line-item columns in the configured order and widths', () => {
        const items = createBlock('lineItems', QUOTATION_FACTORY);
        items.props.columns = [
            { key: 'total', label: 'Amount', visible: true, align: 'right', widthPct: 20 },
            { key: 'productName', label: 'Item', visible: true, align: 'left' },
            { key: 'discount', label: 'Disc', visible: false, align: 'right' },
        ];
        const html = renderBlock(items, ctx, DEFAULT_THEME, pdf);
        assert.ok(html.indexOf('>Amount</th>') < html.indexOf('>Item</th>'));
        assert.match(html, /width:20%/);
        assert.doesNotMatch(html, />Disc</);
    });

    it('only uses images it was given (data URIs on the server)', () => {
        const doc = docWith([createBlock('image', QUOTATION_FACTORY)]);
        doc.theme.logoAssetKey = 'logo-1';
        assert.deepEqual(collectDocumentAssetKeys(doc), ['logo-1']);
        assert.match(renderDocument(doc, ctx, pdf).body, /src="data:image\/png;base64,AAAA"/);
        doc.theme.logoAssetKey = 'missing';
        assert.doesNotMatch(renderDocument(doc, ctx, pdf).body, /<img/);
    });

    it('page numbers become Chromium spans in the footer', () => {
        const out = renderDocument(docWith([createBlock('pageNumber', QUOTATION_FACTORY)], 'footer'), ctx, pdf);
        assert.match(out.footer, /Page <span class="pageNumber"><\/span> of <span class="totalPages"><\/span>/);
    });
});

describe('helpers', () => {
    it('normalizeWidths keeps proportions and sums to 100', () => {
        const widths = normalizeWidths([1, 1, 1]);
        assert.equal(Math.round(widths.reduce((s, w) => s + w, 0) * 100) / 100, 100);
        assert.deepEqual(normalizeWidths([30, 30]), [50, 50]);
    });

    it('cloneSection gives every section, column and block a new id', () => {
        const section = SYSTEM_TEMPLATES[0].build().body[2];
        const copy = cloneSection(section);
        assert.notEqual(copy.id, section.id);
        assert.notEqual(copy.columns[0].id, section.columns[0].id);
        assert.notEqual(copy.columns[0].blocks[0].id, section.columns[0].blocks[0].id);
        assert.equal(JSON.stringify(copy.columns[0].blocks[0].props), JSON.stringify(section.columns[0].blocks[0].props));
    });
});
