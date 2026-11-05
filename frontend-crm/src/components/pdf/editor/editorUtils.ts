import {
    DEFAULT_BRANDING,
    type Branding,
    type FieldVisibility,
    type PdfFieldRegistry,
    type PdfModule,
    type PdfTemplate,
    type PdfTemplateCreateInput,
    type PdfTemplateDraft,
    type PdfTemplateUpdateInput,
} from '@/types/pdfTemplate.types';
import type { PdfTemplateFormValues } from '@/validations/pdfTemplate.schema';

/** Registry defaults (mirrors defaultFieldVisibility on the API). */
export function defaultVisibility(registry: PdfFieldRegistry | undefined): FieldVisibility {
    if (!registry) return { fields: {}, lineItemColumns: [] };
    return {
        fields: Object.fromEntries(registry.fields.map((f) => [f.key, f.defaultVisible])),
        lineItemColumns: registry.lineItemColumns.map((c, order) => ({
            key: c.key,
            label: c.label,
            visible: c.defaultVisible,
            order,
            ...(c.widthPct !== undefined ? { widthPct: c.widthPct } : {}),
        })),
    };
}

/** Fills in fields / columns the registry has but the template doesn't (e.g. new custom fields). */
export function completeVisibility(stored: FieldVisibility | undefined, registry: PdfFieldRegistry | undefined): FieldVisibility {
    const defaults = defaultVisibility(registry);
    if (!stored) return defaults;
    const known = new Set(stored.lineItemColumns.map((c) => c.key));
    const extra = defaults.lineItemColumns.filter((c) => !known.has(c.key));
    return {
        fields: { ...defaults.fields, ...stored.fields },
        lineItemColumns: [...stored.lineItemColumns, ...extra].map((c, order) => ({ ...c, order })),
    };
}

const BLANK_BODY = `<h1 style="color: var(--accent)">QUOTATION</h1>
<p><strong>{{quotation.code}}</strong> · {{quotation.date}}</p>
<p>{{customer.organizationName}}<br>{{nl2br billing.full}}</p>

<table class="items">
  <thead>
    <tr>{{#each columns}}<th class="{{align}}">{{label}}</th>{{/each}}</tr>
  </thead>
  <tbody>
    {{#each lineItems}}
    <tr>{{#each @root.columns}}<td class="{{align}}">{{lineItemCell .. this}}</td>{{/each}}</tr>
    {{/each}}
  </tbody>
</table>

<p class="text-right"><strong>Grand Total: {{totals.grandTotalFormatted}}</strong></p>
<p>{{totals.amountInWords}}</p>`;

const BLANK_CSS = `.items th { background: var(--accent); color: #fff; padding: 6px; text-align: left; }
.items td { border-bottom: 1px solid #e2e8f0; padding: 6px; vertical-align: top; }
.items .right { text-align: right; }
.items .center { text-align: center; }`;

const BLANK_FOOTER = `<div style="text-align:right">Page <span class="pageNumber"></span> of <span class="totalPages"></span></div>`;

/** Starting values for a brand-new template. */
export function blankFormValues(module: PdfModule, registry: PdfFieldRegistry | undefined): PdfTemplateFormValues {
    return {
        name: '',
        module,
        description: '',
        isActive: true,
        isDefault: false,
        pageSize: 'A4',
        orientation: 'portrait',
        margins: { top: 12, right: 10, bottom: 16, left: 10, header: 0, footer: 5 },
        headerHtml: '',
        bodyHtml: BLANK_BODY,
        footerHtml: BLANK_FOOTER,
        css: BLANK_CSS,
        fieldVisibility: defaultVisibility(registry),
        branding: { ...DEFAULT_BRANDING },
    };
}

const brandingValues = (b: Branding): PdfTemplateFormValues['branding'] => ({
    accentColor: b.accentColor,
    logoAssetKey: b.logoAssetKey,
    companyName: b.companyName,
    companyAddress: b.companyAddress,
    companyPhone: b.companyPhone,
    companyEmail: b.companyEmail,
    companyGstin: b.companyGstin,
    companyWebsite: b.companyWebsite,
});

export function toFormValues(t: PdfTemplate, registry: PdfFieldRegistry | undefined): PdfTemplateFormValues {
    return {
        name: t.name,
        module: t.module,
        description: t.description,
        isActive: t.isActive,
        isDefault: t.isDefault,
        pageSize: t.pageSize,
        orientation: t.orientation,
        margins: { ...t.margins },
        headerHtml: t.headerHtml,
        bodyHtml: t.bodyHtml,
        footerHtml: t.footerHtml,
        css: t.css,
        fieldVisibility: completeVisibility(t.fieldVisibility, registry),
        branding: brandingValues(t.branding),
    };
}

/** A copy of `source` as the starting point of a new template. */
export function copyFormValues(source: PdfTemplate, registry: PdfFieldRegistry | undefined): PdfTemplateFormValues {
    return { ...toFormValues(source, registry), name: `${source.name} (Custom)`, isDefault: false, isActive: true, description: source.description };
}

const cleanBranding = (b: PdfTemplateFormValues['branding']): Branding => ({ ...b, logoAssetKey: b.logoAssetKey || undefined });

export function toCreateInput(v: PdfTemplateFormValues): PdfTemplateCreateInput {
    return { ...v, branding: cleanBranding(v.branding) };
}

export function toUpdateInput(v: PdfTemplateFormValues, version: number): PdfTemplateUpdateInput {
    const { module: _module, ...rest } = v;
    void _module;
    return { ...rest, branding: cleanBranding(v.branding), version };
}

export function toDraft(v: PdfTemplateFormValues, id?: string): PdfTemplateDraft {
    return {
        id,
        module: v.module,
        name: v.name,
        pageSize: v.pageSize,
        orientation: v.orientation,
        margins: v.margins,
        headerHtml: v.headerHtml,
        bodyHtml: v.bodyHtml,
        footerHtml: v.footerHtml,
        css: v.css,
        fieldVisibility: v.fieldVisibility,
        branding: cleanBranding(v.branding),
    };
}

/** Insertable snippets (Handlebars + HTML the sanitizer keeps). */
export const SNIPPETS: { key: string; label: string; description: string; code: string }[] = [
    {
        key: 'lineItems',
        label: 'Line items table',
        description: 'Visible columns in order, one row per item',
        code: `<table class="items">
  <thead>
    <tr>{{#each columns}}<th class="{{align}}" style="width:{{widthPct}}%">{{label}}</th>{{/each}}</tr>
  </thead>
  <tbody>
    {{#each lineItems}}
    <tr>{{#each @root.columns}}<td class="{{align}}">{{lineItemCell .. this}}</td>{{/each}}</tr>
    {{/each}}
  </tbody>
</table>
`,
    },
    {
        key: 'totals',
        label: 'Totals block',
        description: 'Subtotal, discounts, tax, grand total and amount in words',
        code: `<table class="totals avoid-break" style="width:45%;margin-left:auto">
  {{#ifShow "subtotal"}}<tr><th>Subtotal</th><td class="text-right">{{totals.subtotalFormatted}}</td></tr>{{/ifShow}}
  {{#ifShow "totalDiscount"}}{{#if totals.hasDiscount}}<tr><th>Discount</th><td class="text-right">- {{totals.totalDiscountFormatted}}</td></tr>{{/if}}{{/ifShow}}
  {{#ifShow "lumpSumDiscount"}}{{#if totals.hasLumpSumDiscount}}<tr><th>Lump-sum Discount</th><td class="text-right">- {{totals.lumpSumDiscountFormatted}}</td></tr>{{/if}}{{/ifShow}}
  {{#ifShow "totalTax"}}<tr><th>Tax</th><td class="text-right">{{totals.totalTaxFormatted}}</td></tr>{{/ifShow}}
  {{#ifShow "grandTotal"}}<tr><th>Grand Total</th><td class="text-right"><strong>{{totals.grandTotalFormatted}}</strong></td></tr>{{/ifShow}}
</table>
{{#ifShow "amountInWords"}}<p><strong>Amount in words:</strong> {{totals.amountInWords}}</p>{{/ifShow}}
`,
    },
    {
        key: 'pageXofY',
        label: 'Page X of Y',
        description: 'Page numbers (header / footer only)',
        code: 'Page <span class="pageNumber"></span> of <span class="totalPages"></span>',
    },
    {
        key: 'customFields',
        label: 'Custom fields list',
        description: 'Every visible, non-empty custom field',
        code: `{{#each customList}}<div><strong>{{label}}:</strong> {{value}}</div>{{/each}}
`,
    },
];
