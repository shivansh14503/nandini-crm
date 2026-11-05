import { LINE_ITEM_BODY, LINE_ITEM_HEAD, STANDARD_FOOTER, type SystemTemplate } from './types.js';

/** Mirrors the SuiteCRM quotation layout: logo + title, company / quote details, To / sales person, items, totals, terms. */
export const classicTemplate: SystemTemplate = {
    key: 'quotation-classic',
    module: 'QUOTATION',
    name: 'Classic',
    description: 'Traditional bordered layout: company and quote details, bill-to and sales person, itemised table, totals and terms.',
    isDefaultCandidate: true,
    pageSize: 'A4',
    orientation: 'portrait',
    margins: { top: 12, right: 10, bottom: 18, left: 10, header: 0, footer: 5 },
    headerHtml: '',
    footerHtml: STANDARD_FOOTER,
    bodyHtml: `<div class="doc">
  <table class="title-row">
    <tr>
      <td class="logo-cell">{{#ifShow "companyLogo"}}<img class="logo" src="{{company.logoDataUri}}" alt="Logo">{{/ifShow}}</td>
      <td class="title-cell"><div class="doc-title">QUOTATION</div></td>
    </tr>
  </table>

  <table class="grid">
    <tr>
      <td class="half">
        {{#ifShow "companyName"}}<div class="company-name">{{company.companyName}}</div>{{/ifShow}}
        {{#ifShow "companyAddress"}}{{#if company.companyAddress}}<div>{{nl2br company.companyAddress}}</div>{{/if}}{{/ifShow}}
        {{#ifShow "companyPhone"}}{{#if company.companyPhone}}<div><span class="lbl">Contact No:</span> {{company.companyPhone}}</div>{{/if}}{{/ifShow}}
        {{#ifShow "companyEmail"}}{{#if company.companyEmail}}<div><span class="lbl">Email:</span> {{company.companyEmail}}</div>{{/if}}{{/ifShow}}
        {{#ifShow "companyGstin"}}{{#if company.companyGstin}}<div><span class="lbl">GSTIN:</span> {{company.companyGstin}}</div>{{/if}}{{/ifShow}}
        {{#ifShow "companyWebsite"}}{{#if company.companyWebsite}}<div>{{company.companyWebsite}}</div>{{/if}}{{/ifShow}}
      </td>
      <td class="half">
        <table class="kv">
          {{#ifShow "quotationCode"}}<tr><th>Quote No.</th><td>{{quotation.code}}</td></tr>{{/ifShow}}
          {{#ifShow "quotationDate"}}<tr><th>Date</th><td>{{quotation.date}}</td></tr>{{/ifShow}}
          {{#ifShow "validUntil"}}<tr><th>Valid Till</th><td>{{quotation.validUntil}}</td></tr>{{/ifShow}}
          {{#ifShow "validationPeriod"}}<tr><th>Validity</th><td>{{quotation.validationPeriod}}</td></tr>{{/ifShow}}
          {{#ifShow "otherRef"}}{{#if quotation.otherRef}}<tr><th>Reference</th><td>{{quotation.otherRef}}</td></tr>{{/if}}{{/ifShow}}
          {{#ifShow "opportunityName"}}<tr><th>Opportunity</th><td>{{quotation.opportunityName}}</td></tr>{{/ifShow}}
          {{#ifShow "quoteStage"}}<tr><th>Stage</th><td>{{quotation.stage}}</td></tr>{{/ifShow}}
          {{#ifShow "currency"}}<tr><th>Currency</th><td>{{quotation.currency}}</td></tr>{{/ifShow}}
        </table>
      </td>
    </tr>
  </table>

  <table class="grid bordered">
    <tr>
      <td class="half">
        <div class="section-label">To</div>
        {{#ifShow "organizationName"}}{{#if customer.organizationName}}<div class="strong">{{customer.organizationName}}</div>{{/if}}{{/ifShow}}
        {{#ifShow "mailingName"}}{{#if customer.mailingName}}<div>{{customer.mailingName}}</div>{{/if}}{{/ifShow}}
        {{#ifShow "billingAddress"}}<div>{{nl2br billing.full}}</div>{{/ifShow}}
        {{#ifShow "gstNo"}}{{#if customer.gstNo}}<div><span class="lbl">GSTIN:</span> {{customer.gstNo}}</div>{{/if}}{{/ifShow}}
        {{#ifShow "preparedFor"}}<div><span class="lbl">Kind Attn:</span> {{quotation.preparedFor}}</div>{{/ifShow}}
        {{#ifShow "contactName"}}<div class="spaced"><span class="lbl">Contact Person:</span> {{customer.contactName}}</div>{{/ifShow}}
        {{#ifShow "contactEmail"}}{{#if customer.contactEmail}}<div><span class="lbl">Email:</span> {{customer.contactEmail}}</div>{{/if}}{{/ifShow}}
        {{#ifShow "contactMobile"}}{{#if customer.contactMobile}}<div><span class="lbl">Phone:</span> {{customer.contactMobile}}</div>{{/if}}{{/ifShow}}
      </td>
      <td class="half">
        {{#ifShow "salesPersonName"}}<div class="section-label">Sales Person</div><div class="strong">{{salesPerson.fullName}}</div>{{/ifShow}}
        {{#ifShow "salesPersonPhone"}}{{#if salesPerson.phone}}<div><span class="lbl">Phone:</span> {{salesPerson.phone}}</div>{{/if}}{{/ifShow}}
        {{#ifShow "salesPersonEmail"}}{{#if salesPerson.email}}<div><span class="lbl">Email:</span> {{salesPerson.email}}</div>{{/if}}{{/ifShow}}
        {{#ifShow "shippingAddress"}}<div class="section-label spaced">Ship To</div><div>{{nl2br shipping.full}}</div>{{/ifShow}}
      </td>
    </tr>
  </table>

  {{#ifShow "quotationTitle"}}<p class="subject"><span class="lbl">Title:</span> {{quotation.title}}</p>{{/ifShow}}
  {{#ifShow "quotationSubject"}}{{#if quotation.subject}}<p class="subject"><span class="lbl">Subject:</span> {{quotation.subject}}</p>{{/if}}{{/ifShow}}

  <table class="items">
    ${LINE_ITEM_HEAD}
    ${LINE_ITEM_BODY}
  </table>

  <table class="totals-wrap avoid-break">
    <tr>
      <td class="words">
        {{#ifShow "amountInWords"}}<div class="lbl">Amount in words</div><div class="strong">{{totals.amountInWords}}</div>{{/ifShow}}
      </td>
      <td class="totals-cell">
        <table class="totals">
          {{#ifShow "totalAmount"}}<tr><th>Gross Amount</th><td>{{totals.totalAmountFormatted}}</td></tr>{{/ifShow}}
          {{#ifShow "totalDiscount"}}{{#if totals.hasDiscount}}<tr><th>Discount</th><td>- {{totals.totalDiscountFormatted}}</td></tr>{{/if}}{{/ifShow}}
          {{#ifShow "lumpSumDiscount"}}{{#if totals.hasLumpSumDiscount}}<tr><th>Lump-sum Discount</th><td>- {{totals.lumpSumDiscountFormatted}}</td></tr>{{/if}}{{/ifShow}}
          {{#ifShow "subtotal"}}<tr><th>Subtotal</th><td>{{totals.subtotalFormatted}}</td></tr>{{/ifShow}}
          {{#ifShow "totalTax"}}<tr><th>Tax</th><td>{{totals.totalTaxFormatted}}</td></tr>{{/ifShow}}
          {{#ifShow "grandTotal"}}<tr class="grand"><th>Grand Total</th><td>{{totals.grandTotalFormatted}}</td></tr>{{/ifShow}}
        </table>
      </td>
    </tr>
  </table>

  {{#if customList.length}}
  <table class="kv custom avoid-break">
    {{#each customList}}<tr><th>{{label}}</th><td>{{value}}</td></tr>{{/each}}
  </table>
  {{/if}}

  {{#ifShow "remarks"}}{{#if quotation.remarks}}
  <div class="block avoid-break"><div class="block-title">Remarks</div><div>{{nl2br quotation.remarks}}</div></div>
  {{/if}}{{/ifShow}}

  {{#ifShow "paymentTerms"}}
  <div class="block avoid-break">
    <div class="block-title">Payment Terms</div>
    <div class="strong">{{terms.paymentTerms}}</div>
    {{#ifShow "paymentTermsDescription"}}{{#if terms.paymentTermsDescription}}<div>{{nl2br terms.paymentTermsDescription}}</div>{{/if}}{{/ifShow}}
  </div>
  {{/ifShow}}

  {{#ifShow "termsAndConditionDescription"}}{{#if terms.termsAndConditionDescription}}
  <div class="block">
    <div class="block-title">Terms &amp; Conditions{{#ifShow "termsAndCondition"}} — {{terms.termsAndCondition}}{{/ifShow}}</div>
    <div>{{nl2br terms.termsAndConditionDescription}}</div>
  </div>
  {{/if}}{{/ifShow}}
</div>`,
    css: `.doc{font-size:9.5pt}
.title-row td{vertical-align:middle;padding:0 0 8px}
.logo-cell{width:50%}
.logo{max-height:64px;max-width:220px}
.doc-title{font-size:22pt;font-weight:700;letter-spacing:3px;color:var(--accent);text-align:right}
.grid{margin-top:6px}
.grid td.half{width:50%;vertical-align:top;padding:8px 10px}
.bordered td.half{border:1px solid var(--border)}
.company-name{font-size:12pt;font-weight:700;color:#0f172a;margin-bottom:2px}
.lbl{color:var(--muted);font-weight:600}
.strong{font-weight:700;color:#0f172a}
.spaced{margin-top:6px}
.section-label{font-size:8pt;text-transform:uppercase;letter-spacing:1px;color:var(--accent);font-weight:700;margin-bottom:3px}
.kv{width:100%}
.kv th{text-align:left;color:var(--muted);font-weight:600;padding:2px 8px 2px 0;width:40%;vertical-align:top}
.kv td{padding:2px 0;font-weight:600;color:#0f172a}
.subject{margin:10px 0 0}
.items{margin-top:10px}
.items th{background:var(--accent);color:var(--accent-contrast);font-weight:700;font-size:8.5pt;padding:6px;border:1px solid var(--accent);text-align:left;white-space:nowrap}
.items td.right{white-space:nowrap}
.items td{border:1px solid var(--border);padding:6px;vertical-align:top}
.items .right{text-align:right}.items .center{text-align:center}
.item-desc{color:var(--muted);font-size:8.5pt;margin-top:2px}
.totals-wrap{margin-top:8px}
.totals-wrap td{vertical-align:top}
.words{width:55%;padding-right:12px}
.totals{width:100%}
.totals th{text-align:left;font-weight:600;color:#334155;padding:4px 8px;border:1px solid var(--border)}
.totals td{text-align:right;padding:4px 8px;border:1px solid var(--border)}
.totals .grand th,.totals .grand td{background:var(--accent);color:var(--accent-contrast);font-weight:700;font-size:10.5pt;border-color:var(--accent)}
.custom{margin-top:10px}
.block{margin-top:12px}
.block-title{font-weight:700;color:var(--accent);border-bottom:1px solid var(--border);padding-bottom:2px;margin-bottom:4px;break-after:avoid;page-break-after:avoid}`,
};
