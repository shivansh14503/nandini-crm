import { LINE_ITEM_BODY, LINE_ITEM_HEAD, STANDARD_FOOTER, type SystemTemplate } from './types.js';

/** Accent colour band, two-column cards, zebra-striped items and a highlighted total. */
export const modernTemplate: SystemTemplate = {
    key: 'quotation-modern',
    module: 'QUOTATION',
    name: 'Modern',
    description: 'Accent colour band with card-style customer and quote details, zebra-striped items and a highlighted total.',
    isDefaultCandidate: false,
    pageSize: 'A4',
    orientation: 'portrait',
    margins: { top: 18, right: 12, bottom: 18, left: 12, header: 6, footer: 5 },
    headerHtml: `<table style="width:100%;border-collapse:collapse"><tr>
  <td style="color:#94a3b8">{{company.companyName}}</td>
  <td style="text-align:right;color:#94a3b8">{{#ifShow "quotationCode"}}Quotation {{quotation.code}}{{/ifShow}}</td>
</tr></table>`,
    footerHtml: STANDARD_FOOTER,
    bodyHtml: `<div class="doc">
  <div class="band">
    <table>
      <tr>
        <td class="band-left">
          {{#ifShow "companyLogo"}}<img class="logo" src="{{company.logoDataUri}}" alt="Logo">{{/ifShow}}
          {{#ifShow "companyName"}}<div class="band-company">{{company.companyName}}</div>{{/ifShow}}
          <div class="band-meta">
            {{#ifShow "companyAddress"}}{{#if company.companyAddress}}<div>{{nl2br company.companyAddress}}</div>{{/if}}{{/ifShow}}
            {{#ifShow "companyPhone"}}{{#if company.companyPhone}}{{company.companyPhone}}{{/if}}{{/ifShow}}
            {{#ifShow "companyEmail"}}{{#if company.companyEmail}} · {{company.companyEmail}}{{/if}}{{/ifShow}}
            {{#ifShow "companyGstin"}}{{#if company.companyGstin}}<div>GSTIN {{company.companyGstin}}</div>{{/if}}{{/ifShow}}
          </div>
        </td>
        <td class="band-right">
          <div class="band-title">Quotation</div>
          {{#ifShow "quotationCode"}}<div class="band-code">{{quotation.code}}</div>{{/ifShow}}
        </td>
      </tr>
    </table>
  </div>

  <table class="cards">
    <tr>
      <td class="card-cell">
        <div class="card">
          <div class="card-title">Bill To</div>
          {{#ifShow "organizationName"}}{{#if customer.organizationName}}<div class="strong">{{customer.organizationName}}</div>{{/if}}{{/ifShow}}
          {{#ifShow "mailingName"}}{{#if customer.mailingName}}<div>{{customer.mailingName}}</div>{{/if}}{{/ifShow}}
          {{#ifShow "billingAddress"}}<div class="muted">{{nl2br billing.full}}</div>{{/ifShow}}
          {{#ifShow "gstNo"}}{{#if customer.gstNo}}<div class="meta">GSTIN {{customer.gstNo}}</div>{{/if}}{{/ifShow}}
          {{#ifShow "contactName"}}<div class="meta">Attn: {{customer.contactName}}</div>{{/ifShow}}
          {{#ifShow "contactEmail"}}{{#if customer.contactEmail}}<div class="meta">{{customer.contactEmail}}</div>{{/if}}{{/ifShow}}
          {{#ifShow "contactMobile"}}{{#if customer.contactMobile}}<div class="meta">{{customer.contactMobile}}</div>{{/if}}{{/ifShow}}
          {{#ifShow "shippingAddress"}}<div class="card-title spaced">Ship To</div><div class="muted">{{nl2br shipping.full}}</div>{{/ifShow}}
        </div>
      </td>
      <td class="card-cell">
        <div class="card">
          <div class="card-title">Details</div>
          <table class="kv">
            {{#ifShow "quotationDate"}}<tr><th>Date</th><td>{{quotation.date}}</td></tr>{{/ifShow}}
            {{#ifShow "validUntil"}}<tr><th>Valid until</th><td>{{quotation.validUntil}}</td></tr>{{/ifShow}}
            {{#ifShow "validationPeriod"}}<tr><th>Validity</th><td>{{quotation.validationPeriod}}</td></tr>{{/ifShow}}
            {{#ifShow "otherRef"}}{{#if quotation.otherRef}}<tr><th>Reference</th><td>{{quotation.otherRef}}</td></tr>{{/if}}{{/ifShow}}
            {{#ifShow "preparedFor"}}<tr><th>Prepared for</th><td>{{quotation.preparedFor}}</td></tr>{{/ifShow}}
            {{#ifShow "opportunityName"}}<tr><th>Opportunity</th><td>{{quotation.opportunityName}}</td></tr>{{/ifShow}}
            {{#ifShow "salesPersonName"}}<tr><th>Sales person</th><td>{{salesPerson.fullName}}</td></tr>{{/ifShow}}
            {{#ifShow "salesPersonPhone"}}{{#if salesPerson.phone}}<tr><th>Phone</th><td>{{salesPerson.phone}}</td></tr>{{/if}}{{/ifShow}}
            {{#ifShow "salesPersonEmail"}}{{#if salesPerson.email}}<tr><th>Email</th><td>{{salesPerson.email}}</td></tr>{{/if}}{{/ifShow}}
          </table>
        </div>
      </td>
    </tr>
  </table>

  {{#ifShow "quotationSubject"}}{{#if quotation.subject}}<div class="subject">{{quotation.subject}}</div>{{/if}}{{/ifShow}}

  <table class="items">
    ${LINE_ITEM_HEAD}
    ${LINE_ITEM_BODY}
  </table>

  <table class="summary avoid-break">
    <tr>
      <td class="summary-left">
        {{#ifShow "amountInWords"}}<div class="card-title">Amount in words</div><div>{{totals.amountInWords}}</div>{{/ifShow}}
        {{#each customList}}<div class="meta"><strong>{{label}}:</strong> {{value}}</div>{{/each}}
      </td>
      <td class="summary-right">
        <table class="totals">
          {{#ifShow "totalAmount"}}<tr><th>Gross amount</th><td>{{totals.totalAmountFormatted}}</td></tr>{{/ifShow}}
          {{#ifShow "totalDiscount"}}{{#if totals.hasDiscount}}<tr><th>Discount</th><td>- {{totals.totalDiscountFormatted}}</td></tr>{{/if}}{{/ifShow}}
          {{#ifShow "lumpSumDiscount"}}{{#if totals.hasLumpSumDiscount}}<tr><th>Lump-sum discount</th><td>- {{totals.lumpSumDiscountFormatted}}</td></tr>{{/if}}{{/ifShow}}
          {{#ifShow "subtotal"}}<tr><th>Subtotal</th><td>{{totals.subtotalFormatted}}</td></tr>{{/ifShow}}
          {{#ifShow "totalTax"}}<tr><th>Tax</th><td>{{totals.totalTaxFormatted}}</td></tr>{{/ifShow}}
        </table>
        {{#ifShow "grandTotal"}}<div class="grand"><span>Grand total</span><strong>{{totals.grandTotalFormatted}}</strong></div>{{/ifShow}}
      </td>
    </tr>
  </table>

  {{#ifShow "remarks"}}{{#if quotation.remarks}}<div class="section avoid-break"><div class="card-title">Remarks</div><div>{{nl2br quotation.remarks}}</div></div>{{/if}}{{/ifShow}}
  {{#ifShow "paymentTerms"}}
  <div class="section avoid-break">
    <div class="card-title">Payment terms</div>
    <div class="strong">{{terms.paymentTerms}}</div>
    {{#ifShow "paymentTermsDescription"}}{{#if terms.paymentTermsDescription}}<div>{{nl2br terms.paymentTermsDescription}}</div>{{/if}}{{/ifShow}}
  </div>
  {{/ifShow}}
  {{#ifShow "termsAndConditionDescription"}}{{#if terms.termsAndConditionDescription}}
  <div class="section"><div class="card-title">Terms &amp; conditions</div><div>{{nl2br terms.termsAndConditionDescription}}</div></div>
  {{/if}}{{/ifShow}}
</div>`,
    css: `.doc{font-size:9.5pt}
.band{background:var(--accent);color:var(--accent-contrast);border-radius:8px;padding:14px 16px}
.band td{vertical-align:middle}
.band-left{width:60%}
.logo{max-height:48px;max-width:180px;background:#fff;border-radius:4px;padding:4px;margin-bottom:4px}
.band-company{font-size:13pt;font-weight:700}
.band-right{text-align:right}
.band-title{font-size:20pt;font-weight:700;letter-spacing:1px;text-transform:uppercase}
.band-code{font-size:10pt;opacity:.9}
.cards{margin-top:12px;border-collapse:separate;border-spacing:0}
.card-cell{width:50%;vertical-align:top;padding:0 6px 0 0}
.card-cell + .card-cell{padding:0 0 0 6px}
.card{border:1px solid #e2e8f0;border-radius:8px;padding:10px 12px;background:#f8fafc}
.card-title{font-size:8pt;text-transform:uppercase;letter-spacing:1px;color:var(--accent);font-weight:700;margin-bottom:4px;break-after:avoid;page-break-after:avoid}
.spaced{margin-top:8px}
.strong{font-weight:700;color:#0f172a}
.meta{font-size:8.5pt;color:#475569;margin-top:2px}
.kv th{text-align:left;color:var(--muted);font-weight:500;padding:2px 8px 2px 0;width:42%}
.kv td{padding:2px 0;font-weight:600;color:#0f172a}
.subject{margin-top:12px;font-weight:700;font-size:10.5pt;color:#0f172a}
.items{margin-top:12px}
.items th{color:var(--accent);font-size:8pt;text-transform:uppercase;letter-spacing:.5px;text-align:left;padding:6px;border-bottom:2px solid var(--accent);white-space:nowrap}
.items td.right{white-space:nowrap}
.items td{padding:7px 6px;border-bottom:1px solid #e2e8f0;vertical-align:top}
.items tbody tr:nth-child(even) td{background:#f8fafc}
.items .right{text-align:right}.items .center{text-align:center}
.item-desc{color:var(--muted);font-size:8.5pt;margin-top:2px}
.summary{margin-top:12px}
.summary td{vertical-align:top}
.summary-left{width:55%;padding-right:16px}
.totals th{text-align:left;color:#475569;font-weight:500;padding:3px 0}
.totals td{text-align:right;padding:3px 0}
.grand{margin-top:6px;background:var(--accent);color:var(--accent-contrast);border-radius:6px;padding:8px 10px;display:flex;justify-content:space-between;font-size:11pt}
.section{margin-top:12px}
.band-meta{font-size:8pt;opacity:.9;margin-top:2px;line-height:1.35}`,
};
