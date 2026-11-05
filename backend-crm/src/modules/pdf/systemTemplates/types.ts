import type { Orientation, PageSize, PdfMargins, PdfModule } from '../pdf.types.js';

/** A built-in template shipped in code and upserted on boot by pdfTemplate.seed.ts. */
export interface SystemTemplate {
    /** Stable identity (never shown); the seed matches rows by module + name. */
    key: string;
    module: PdfModule;
    name: string;
    description: string;
    /** Classic is the module default when no default exists. */
    isDefaultCandidate: boolean;
    pageSize: PageSize;
    orientation: Orientation;
    margins: PdfMargins;
    headerHtml: string;
    bodyHtml: string;
    footerHtml: string;
    css: string;
}

/** Shared footer: computer-generated note + page X of Y (inline styles: Chromium footers get no page CSS). */
export const STANDARD_FOOTER = `<table style="width:100%;border-collapse:collapse;border-top:1px solid #cbd5e1">
  <tr>
    <td style="padding-top:4px;font-style:italic;color:#64748b">*This is computer generated Quotation and does not require any stamp or signature*</td>
    <td style="padding-top:4px;text-align:right;white-space:nowrap;color:#475569">Page <span class="pageNumber"></span> of <span class="totalPages"></span></td>
  </tr>
</table>`;

/** Line-item table body shared by the system templates: description renders under the item name. */
export const LINE_ITEM_HEAD = `<thead>
      <tr>
        {{#each columns}}{{#unless (eq key "description")}}<th class="{{align}}" style="width:{{widthPct}}%">{{label}}</th>{{/unless}}{{/each}}
      </tr>
    </thead>`;

export const LINE_ITEM_BODY = `<tbody>
      {{#each lineItems}}
      <tr>
        {{#each @root.columns}}{{#unless (eq key "description")}}<td class="{{align}}">{{lineItemCell .. this}}{{#if (eq key "productName")}}{{#if @root.show.col_description}}{{#if ../description}}<div class="item-desc">{{nl2br ../description}}</div>{{/if}}{{/if}}{{/if}}</td>{{/unless}}{{/each}}
      </tr>
      {{else}}
      <tr><td class="center muted" colspan="{{columns.length}}">No line items</td></tr>
      {{/each}}
    </tbody>`;
