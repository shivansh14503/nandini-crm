import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildFieldRegistry } from './fieldRegistry.js';
import { defaultFieldVisibility, mergeBranding, mergeFieldVisibility } from './fieldVisibility.js';
import { sanitizeTemplateHtml } from './sanitize.js';
import { buildSampleQuotationContext } from './sampleContext.js';
import { SYSTEM_TEMPLATES } from './systemTemplates/index.js';
import { compileTemplate, renderTemplate } from './templateEngine.js';
import type { ContextBuildInput } from './contexts/contextTypes.js';

const customFields = [{ fieldKey: 'cf_po_number', label: 'PO Number', fieldType: 'text' }];
const registry = buildFieldRegistry('QUOTATION', customFields);

const input = (overrides: Partial<ContextBuildInput> = {}): ContextBuildInput => ({
    registry,
    visibility: defaultFieldVisibility(registry),
    branding: mergeBranding({ companyName: 'Nandini Infosys Pvt. Ltd.', companyPhone: '+91 261 000 0000' }),
    logoDataUri: '',
    customFields,
    generatedBy: 'tester',
    timeZone: 'Asia/Kolkata',
    ...overrides,
});

const render = (source: string, ctx: object) => renderTemplate(compileTemplate(sanitizeTemplateHtml(source), 'body'), 'body', ctx, { assets: {} });

describe('system templates', () => {
    for (const template of SYSTEM_TEMPLATES) {
        it(`${template.name}: survives sanitizing unchanged in meaning and is idempotent`, () => {
            const once = sanitizeTemplateHtml(template.bodyHtml);
            assert.equal(sanitizeTemplateHtml(once), once);
            assert.match(once, /\{\{lineItemCell \.\. this\}\}/);
            assert.match(once, /\{\{#ifShow "grandTotal"\}\}/);
        });

        it(`${template.name}: renders the sample context`, () => {
            const ctx = buildSampleQuotationContext(input());
            const html = render(template.bodyHtml, ctx);
            assert.match(html, /QT-00042/);
            assert.match(html, /₹3,30,400\.00/);
            assert.match(html, /Rupees Three Lakh Thirty Thousand Four Hundred Only/);
            assert.match(html, /24-Port Managed Gigabit Switch/);
            // Description renders under the item name, not as its own column.
            assert.doesNotMatch(html, /<th[^>]*>Description<\/th>/);
            assert.match(html, /item-desc/);
            const footer = render(template.footerHtml, ctx);
            assert.match(footer, /class="pageNumber"/);
        });
    }

    it('hides fields and columns turned off in the visibility settings', () => {
        const visibility = mergeFieldVisibility(registry, {
            fields: { grandTotal: false, gstNo: false },
            lineItemColumns: [{ key: 'discount', label: 'Disc.', visible: false, order: 6 }],
        });
        const html = render(SYSTEM_TEMPLATES[0].bodyHtml, buildSampleQuotationContext(input({ visibility })));
        assert.doesNotMatch(html, /Grand Total/);
        assert.doesNotMatch(html, /24AAKCS1234M1Z5/);
        assert.doesNotMatch(html, /<th class="right"[^>]*>(Disc\.|Discount)<\/th>/);
        assert.match(html, /<th class="right"[^>]*>Unit Price<\/th>/);
    });

    it('lists visible custom fields', () => {
        const visibility = mergeFieldVisibility(registry, { fields: { cf_po_number: true }, lineItemColumns: [] });
        const html = render(SYSTEM_TEMPLATES[0].bodyHtml, buildSampleQuotationContext(input({ visibility })));
        assert.match(html, /PO Number/);
        assert.match(html, /Sample PO Number/);
    });
});
