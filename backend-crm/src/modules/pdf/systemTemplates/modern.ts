import { DEFAULT_THEME, DOCUMENT_VERSION } from '../document/index.js';
import { address, box, caption, details, field, logo, make, section, standardFooter, text, title, type SystemTemplate } from './types.js';

const card = { background: '#f8fafc', border: { width: 1, style: 'solid' as const, color: '#e2e8f0', radius: 8, sides: { top: true, right: true, bottom: true, left: true } }, padding: box(3) };

/** Accent colour band, two-column cards, zebra-striped items and a highlighted total. */
export const modernTemplate: SystemTemplate = {
    key: 'quotation-modern',
    module: 'QUOTATION',
    name: 'Modern',
    description: 'Accent colour band with card-style customer and quote details, zebra-striped items and a highlighted total.',
    isDefaultCandidate: false,
    build: () => ({
        version: DOCUMENT_VERSION,
        page: { size: 'A4', orientation: 'portrait', margins: { top: 18, right: 12, bottom: 18, left: 12, header: 6, footer: 5 } },
        theme: { ...DEFAULT_THEME },
        header: [
            section(
                [50, 50],
                [[text([[{ field: 'company.companyName' }]])], [text([['Quotation ', { field: 'quotation.code' }]], { textAlign: 'right' })]],
                { color: '#94a3b8', fontSize: 8 },
            ),
        ],
        body: [
            section(
                [60, 40],
                [
                    [
                        logo(12, { background: '#ffffff', padding: box(1), border: { width: 0, style: 'solid', color: '#ffffff', radius: 4, sides: { top: true, right: true, bottom: true, left: true } }, margin: box(0, 0, 1, 0) }),
                        title([{ field: 'company.companyName' }], 3, { fontSize: 13, margin: box(0) }),
                        text([[{ field: 'company.companyAddress' }], [{ field: 'company.companyPhone' }, '  ', { field: 'company.companyEmail' }]], { fontSize: 8 }, true),
                    ],
                    [
                        title(['QUOTATION'], 1, { textAlign: 'right', letterSpacing: 1, margin: box(0) }),
                        text([[{ field: 'quotation.code' }]], { textAlign: 'right', fontSize: 10 }),
                    ],
                ],
                { background: 'accent', color: '#ffffff', padding: box(4), border: { width: 0, style: 'solid', color: 'accent', radius: 8, sides: { top: true, right: true, bottom: true, left: true } } },
                [{ verticalAlign: 'middle' }, { verticalAlign: 'middle' }],
            ),
            section(
                [47, 6, 47],
                [
                    [
                        caption('Bill To'),
                        title([{ field: 'customer.organizationName' }], 3, { fontSize: 10.5, margin: box(0) }),
                        address('billing', ''),
                        field('customer.contactName', 'Attn', { margin: box(1.5, 0, 0, 0) }),
                        field('customer.contactEmail', 'Email'),
                        field('customer.contactMobile', 'Phone'),
                    ],
                    [],
                    [
                        caption('Quotation Details'),
                        details([['quotation.date', 'Date'], ['quotation.validUntil', 'Valid Until'], ['salesPerson.fullName', 'Sales Person'], ['quotation.otherRef', 'Reference'], ['customer.gstNo', 'Customer GSTIN']], { labelWidthPct: 42 }),
                    ],
                ],
                { margin: box(4, 0, 0, 0) },
                [card, {}, card],
            ),
            section([100], [[title([{ field: 'quotation.subject' }], 3, { fontSize: 10.5, margin: box(4, 0, 0, 0) })]]),
            section(
                [100],
                [[make('lineItems', (b) => ({ ...b, props: { ...b.props, headerBackground: 'transparent', headerColor: 'accent', borders: 'rows', borderColor: '#e2e8f0', zebra: true } }))]],
            ),
            section(
                [55, 45],
                [[make('amountInWords')], [make('totals', (b) => ({ ...b, props: { ...b.props, bordered: false } }))]],
                { margin: box(3, 0, 0, 0), avoidPageBreak: true },
                [{ padding: box(0, 5, 0, 0) }, {}],
            ),
            section([100], [[make('customFields'), make('terms')]]),
        ],
        footer: standardFooter(),
    }),
};
