import { LINE_ITEM_BODY, LINE_ITEM_HEAD, STANDARD_FOOTER, type SystemTemplate } from './types.js';

/** Dense single-page style: one header line, small type, tight table, totals beside the terms. */
export const compactTemplate: SystemTemplate = {
    key: 'quotation-compact',
    module: 'QUOTATION',
    name: 'Compact',
    description: 'Dense single-page layout with small type, a tight item table and totals beside the terms.',
    isDefaultCandidate: false,
    pageSize: 'A4',
    orientation: 'portrait',
    margins: { top: 8, right: 8, bottom: 14, left: 8, header: 0, footer: 4 },
    headerHtml: '',
    footerHtml: STANDARD_FOOTER,
    bodyHtml: `<div class="doc">
  <table class="top">
    <tr>
      <td>
        {{#ifShow "companyLogo"}}<img class="logo" src="{{company.logoDataUri}}" alt="Logo">{{/ifShow}}
        {{#ifShow "companyName"}}<span class="company">{{company.companyName}}</span>{{/ifShow}}
        <div class="muted">
          {{#ifShow "companyAddress"}}{{company.companyAddress}}{{/ifShow}}
          {{#ifShow "companyPhone"}}{{#if company.companyPhone}} · {{company.companyPhone}}{{/if}}{{/ifShow}}
          {{#ifShow "companyEmail"}}{{#if company.companyEmail}} · {{company.companyEmail}}{{/if}}{{/ifShow}}
          {{#ifShow "companyGstin"}}{{#if company.companyGstin}} · GSTIN {{company.companyGstin}}{{/if}}{{/ifShow}}
        </div>
      </td>
      <td class="top-right">
        <div class="title">QUOTATION</div>
        {{#ifShow "quotationCode"}}<div><strong>{{quotation.code}}</strong></div>{{/ifShow}}
        {{#ifShow "quotationDate"}}<div>Date: {{quotation.date}}</div>{{/ifShow}}
        {{#ifShow "validUntil"}}<div>Valid till: {{quotation.validUntil}}</div>{{/ifShow}}
      </td>
    </tr>
  </table>

  <table class="parties">
    <tr>
      <td>
        <span class="lbl">To:</span>
        {{#ifShow "organizationName"}}<strong>{{customer.organizationName}}</strong>{{/ifShow}}
        {{#ifShow "gstNo"}}{{#if customer.gstNo}} (GSTIN {{customer.gstNo}}){{/if}}{{/ifShow}}
        {{#ifShow "billingAddress"}}<div class="muted">{{billing.full}}</div>{{/ifShow}}
        <div>
          {{#ifShow "contactName"}}{{customer.contactName}}{{/ifShow}}
          {{#ifShow "contactMobile"}}{{#if customer.contactMobile}} · {{customer.contactMobile}}{{/if}}{{/ifShow}}
          {{#ifShow "contactEmail"}}{{#if customer.contactEmail}} · {{customer.contactEmail}}{{/if}}{{/ifShow}}
        </div>
      </td>
      <td class="right-col">
        {{#ifShow "salesPersonName"}}<span class="lbl">Sales:</span> {{salesPerson.fullName}}{{/ifShow}}
        {{#ifShow "salesPersonPhone"}}{{#if salesPerson.phone}}<div>{{salesPerson.phone}}</div>{{/if}}{{/ifShow}}
        {{#ifShow "salesPersonEmail"}}{{#if salesPerson.email}}<div>{{salesPerson.email}}</div>{{/if}}{{/ifShow}}
        {{#ifShow "otherRef"}}{{#if quotation.otherRef}}<div><span class="lbl">Ref:</span> {{quotation.otherRef}}</div>{{/if}}{{/ifShow}}
      </td>
    </tr>
  </table>

  {{#ifShow "quotationSubject"}}{{#if quotation.subject}}<div class="subject"><span class="lbl">Subject:</span> {{quotation.subject}}</div>{{/if}}{{/ifShow}}

  <table class="items">
    ${LINE_ITEM_HEAD}
    ${LINE_ITEM_BODY}
  </table>

  <table class="bottom avoid-break">
    <tr>
      <td class="terms">
        {{#ifShow "amountInWords"}}<div><span class="lbl">In words:</span> {{totals.amountInWords}}</div>{{/ifShow}}
        {{#each customList}}<div><span class="lbl">{{label}}:</span> {{value}}</div>{{/each}}
        {{#ifShow "paymentTerms"}}<div class="gap"><span class="lbl">Payment:</span> {{terms.paymentTerms}}</div>
        {{#ifShow "paymentTermsDescription"}}{{#if terms.paymentTermsDescription}}<div class="muted">{{nl2br terms.paymentTermsDescription}}</div>{{/if}}{{/ifShow}}{{/ifShow}}
        {{#ifShow "remarks"}}{{#if quotation.remarks}}<div class="gap"><span class="lbl">Remarks:</span> {{nl2br quotation.remarks}}</div>{{/if}}{{/ifShow}}
        {{#ifShow "termsAndConditionDescription"}}{{#if terms.termsAndConditionDescription}}<div class="gap"><span class="lbl">Terms:</span></div><div class="muted">{{nl2br terms.termsAndConditionDescription}}</div>{{/if}}{{/ifShow}}
      </td>
      <td class="sum">
        <table class="totals">
          {{#ifShow "totalAmount"}}<tr><th>Gross</th><td>{{totals.totalAmountFormatted}}</td></tr>{{/ifShow}}
          {{#ifShow "totalDiscount"}}{{#if totals.hasDiscount}}<tr><th>Discount</th><td>- {{totals.totalDiscountFormatted}}</td></tr>{{/if}}{{/ifShow}}
          {{#ifShow "lumpSumDiscount"}}{{#if totals.hasLumpSumDiscount}}<tr><th>Lump-sum</th><td>- {{totals.lumpSumDiscountFormatted}}</td></tr>{{/if}}{{/ifShow}}
          {{#ifShow "subtotal"}}<tr><th>Subtotal</th><td>{{totals.subtotalFormatted}}</td></tr>{{/ifShow}}
          {{#ifShow "totalTax"}}<tr><th>Tax</th><td>{{totals.totalTaxFormatted}}</td></tr>{{/ifShow}}
          {{#ifShow "grandTotal"}}<tr class="grand"><th>Total</th><td>{{totals.grandTotalFormatted}}</td></tr>{{/ifShow}}
        </table>
      </td>
    </tr>
  </table>
</div>`,
    css: `.doc{font-size:8pt;line-height:1.3}
.top td{vertical-align:top;padding-bottom:4px;border-bottom:2px solid var(--accent)}
.top-right{text-align:right;width:35%}
.logo{max-height:28px;max-width:120px;vertical-align:middle;margin-right:6px}
.company{font-size:11pt;font-weight:700;vertical-align:middle}
.title{font-size:13pt;font-weight:700;color:var(--accent);letter-spacing:1px}
.parties td{vertical-align:top;padding:5px 0}
.right-col{width:35%;text-align:right}
.lbl{color:var(--muted);font-weight:600}
.subject{margin:2px 0 4px}
.items th{background:#f1f5f9;font-size:7.5pt;text-transform:uppercase;padding:3px 4px;border:1px solid #cbd5e1;text-align:left;white-space:nowrap}
.items td.right{white-space:nowrap}
.items td{padding:3px 4px;border:1px solid #e2e8f0;vertical-align:top}
.items .right{text-align:right}.items .center{text-align:center}
.item-desc{color:var(--muted);font-size:7.5pt}
.bottom{margin-top:6px}
.bottom td{vertical-align:top}
.terms{padding-right:12px}
.gap{margin-top:4px}
.sum{width:36%}
.totals th{text-align:left;font-weight:500;padding:2px 4px;color:#475569}
.totals td{text-align:right;padding:2px 4px}
.totals .grand th,.totals .grand td{border-top:2px solid var(--accent);font-weight:700;font-size:9.5pt;color:#0f172a}`,
};
