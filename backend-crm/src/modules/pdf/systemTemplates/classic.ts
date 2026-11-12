import { DEFAULT_THEME, DOCUMENT_VERSION } from '../document/index.js';
import { address, box, caption, details, field, logo, make, section, standardFooter, text, title, type SystemTemplate } from './types.js';

const cellBorder = { border: { width: 1, style: 'solid' as const, color: '#cbd5e1', radius: 0, sides: { top: true, right: true, bottom: true, left: true } }, padding: box(2.5) };

/** Mirrors the SuiteCRM quotation layout: logo + title, company / quote details, To / sales person, items, totals, terms. */
export const classicTemplate: SystemTemplate = {
    key: 'quotation-classic',
    module: 'QUOTATION',
    name: 'Classic',
    description: 'Traditional bordered layout: company and quote details, bill-to and sales person, itemised table, totals and terms.',
    isDefaultCandidate: true,
    build: () => ({
        version: DOCUMENT_VERSION,
        page: { size: 'A4', orientation: 'portrait', margins: { top: 12, right: 10, bottom: 18, left: 10, header: 0, footer: 5 } },
        theme: { ...DEFAULT_THEME },
        header: [],
        body: [
            section(
                [50, 50],
                [[logo(17)], [title(['QUOTATION'], 1, { textAlign: 'right', color: 'accent', fontSize: 22, letterSpacing: 3 })]],
                { margin: box(0, 0, 2, 0) },
                [{ verticalAlign: 'middle' }, { verticalAlign: 'middle' }],
            ),
            section(
                [50, 50],
                [
                    [
                        title([{ field: 'company.companyName' }], 3, { margin: box(0, 0, 0.5, 0) }),
                        text([[{ field: 'company.companyAddress' }]], {}, true),
                        field('company.companyPhone', 'Contact No'),
                        field('company.companyEmail', 'Email'),
                        field('company.companyGstin', 'GSTIN'),
                    ],
                    [details([['quotation.code', 'Quote No.'], ['quotation.date', 'Date'], ['quotation.validUntil', 'Valid Till'], ['quotation.validationPeriod', 'Validity'], ['quotation.otherRef', 'Reference']])],
                ],
                { margin: box(0, 0, 2, 0) },
                [{ padding: box(1, 2.5, 1, 0) }, { padding: box(1, 0, 1, 2.5) }],
            ),
            section(
                [50, 50],
                [
                    [
                        caption('To'),
                        title([{ field: 'customer.organizationName' }], 3, { fontSize: 10, margin: box(0) }),
                        address('billing', ''),
                        field('customer.gstNo', 'GSTIN'),
                        field('quotation.preparedFor', 'Kind Attn'),
                        field('customer.contactName', 'Contact Person', { margin: box(1.5, 0, 0, 0) }),
                        field('customer.contactEmail', 'Email'),
                        field('customer.contactMobile', 'Phone'),
                    ],
                    [
                        caption('Sales Person'),
                        title([{ field: 'salesPerson.fullName' }], 3, { fontSize: 10, margin: box(0) }),
                        field('salesPerson.phone', 'Phone'),
                        field('salesPerson.email', 'Email'),
                        address('shipping', 'Ship To', { margin: box(2, 0, 0, 0) }),
                    ],
                ],
                {},
                [cellBorder, cellBorder],
            ),
            section([100], [[field('quotation.subject', 'Subject', { margin: box(3, 0, 0, 0) }, { labelBold: true })]]),
            section([100], [[make('lineItems')]]),
            section([55, 45], [[make('amountInWords')], [make('totals')]], { margin: box(2, 0, 0, 0), avoidPageBreak: true }, [{ padding: box(0, 4, 0, 0) }, {}]),
            section([100], [[make('customFields'), make('terms')]]),
        ],
        footer: standardFooter(),
    }),
};
