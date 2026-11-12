import { DEFAULT_THEME, DOCUMENT_VERSION } from '../document/index.js';
import { address, box, details, field, logo, make, section, standardFooter, text, title, type SystemTemplate } from './types.js';

/** Dense single-page style: one header line, small type, tight table, totals beside the terms. */
export const compactTemplate: SystemTemplate = {
    key: 'quotation-compact',
    module: 'QUOTATION',
    name: 'Compact',
    description: 'Dense single-page layout with small type, a tight item table and totals beside the terms.',
    isDefaultCandidate: false,
    build: () => ({
        version: DOCUMENT_VERSION,
        page: { size: 'A4', orientation: 'portrait', margins: { top: 8, right: 8, bottom: 14, left: 8, header: 0, footer: 4 } },
        theme: { ...DEFAULT_THEME, fontSize: 8, lineHeight: 1.3 },
        header: [],
        body: [
            section(
                [65, 35],
                [
                    [
                        logo(8, { margin: box(0, 0, 1, 0) }),
                        title([{ field: 'company.companyName' }], 3, { fontSize: 11, margin: box(0) }),
                        text([[{ field: 'company.companyAddress' }], [{ field: 'company.companyPhone' }, '  ', { field: 'company.companyEmail' }, '  ', { field: 'company.companyGstin' }]], { color: '#64748b' }, true),
                    ],
                    [
                        title(['QUOTATION'], 2, { textAlign: 'right', color: 'accent', fontSize: 13, letterSpacing: 1, margin: box(0) }),
                        text([[{ field: 'quotation.code', bold: true }], ['Date: ', { field: 'quotation.date' }], ['Valid till: ', { field: 'quotation.validUntil' }]], { textAlign: 'right' }),
                    ],
                ],
                { padding: box(0, 0, 1, 0), border: { width: 2, style: 'solid', color: 'accent', radius: 0, sides: { top: false, right: false, bottom: true, left: false } } },
            ),
            section(
                [65, 35],
                [
                    [
                        title(['To: ', { field: 'customer.organizationName' }], 3, { fontSize: 9, margin: box(0) }),
                        address('billing', ''),
                        field('customer.contactName', 'Attn'),
                        field('customer.gstNo', 'GSTIN'),
                    ],
                    [details([['salesPerson.fullName', 'Sales Person'], ['salesPerson.phone', 'Phone'], ['quotation.otherRef', 'Reference']], { labelWidthPct: 45, valueBold: false })],
                ],
                { padding: box(1.5, 0, 1.5, 0) },
            ),
            section([100], [[field('quotation.subject', 'Subject', { margin: box(0, 0, 1, 0) })]]),
            section(
                [100],
                [[make('lineItems', (b) => ({ ...b, style: {}, props: { ...b.props, headerBackground: '#f1f5f9', headerColor: '#0f172a', borderColor: '#e2e8f0', fontSize: 7.5 } }))]],
            ),
            section(
                [64, 36],
                [
                    [make('amountInWords'), make('terms', (b) => ({ ...b, style: { margin: box(2, 0, 0, 0) } }))],
                    [make('totals', (b) => ({ ...b, props: { ...b.props, bordered: false, labelWidthPct: 50 } }))],
                ],
                { margin: box(2, 0, 0, 0) },
                [{ padding: box(0, 4, 0, 0) }, {}],
            ),
            section([100], [[make('customFields')]]),
        ],
        footer: standardFooter(),
    }),
};
