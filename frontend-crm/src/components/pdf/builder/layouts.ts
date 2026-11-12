import { createBlock, createSection, rich, type Band, type BlockFactoryInput, type BlockOf, type Section, type Style } from '@/lib/pdf-document';

/** Pre-built sections offered in the Sections tab (each insert builds a fresh copy with new ids). */

export interface PrebuiltLayout {
    key: string;
    label: string;
    description: string;
    /** Where it belongs; dropping elsewhere is still allowed when its blocks permit it. */
    band: Band;
    build: (input: BlockFactoryInput) => Section;
}

const box = (top: number, right = top, bottom = top, left = right) => ({ top, right, bottom, left });
const caption = (input: BlockFactoryInput, label: string): BlockOf<'text'> => ({
    ...createBlock('text', input),
    style: { fontSize: 7.5, fontWeight: 'bold', color: 'accent', letterSpacing: 1, textTransform: 'uppercase', margin: box(0, 0, 0.8, 0) },
    props: { content: rich([label]) },
});
const field = (input: BlockFactoryInput, path: string, label: string): BlockOf<'field'> => {
    const b = createBlock('field', input);
    return { ...b, props: { ...b.props, path, label } };
};
const heading = (input: BlockFactoryInput, path: string, style: Style = {}): BlockOf<'title'> => ({
    ...createBlock('title', input),
    style: { fontSize: 10.5, margin: box(0), ...style },
    props: { level: 3, content: rich([{ field: path }]) },
});

export const PREBUILT_LAYOUTS: PrebuiltLayout[] = [
    {
        key: 'company-header',
        label: 'Company header',
        description: 'Logo and company details beside the title and quote details',
        band: 'body',
        build: (input) => {
            const logo = createBlock('image', input);
            const title = createBlock('title', input);
            const details = createBlock('detailsList', input);
            return createSection(
                [55, 45],
                [
                    [
                        { ...logo, hideIfEmpty: true, style: { margin: box(0, 0, 1.5, 0) } },
                        heading(input, 'company.companyName', { fontSize: 12 }),
                        { ...createBlock('text', input), hideIfEmpty: true, props: { content: rich([{ field: 'company.companyAddress' }], [{ field: 'company.companyPhone' }, '  ', { field: 'company.companyEmail' }]) } },
                    ],
                    [{ ...title, style: { textAlign: 'right', color: 'accent', letterSpacing: 2, margin: box(0, 0, 2, 0) }, props: { level: 1, content: rich(['QUOTATION']) } }, details],
                ],
                { margin: box(0, 0, 3, 0) },
            );
        },
    },
    {
        key: 'parties',
        label: 'Bill to & sales person',
        description: 'Customer and billing address beside the sales person',
        band: 'body',
        build: (input) => {
            const cell: Style = { padding: box(2.5), border: { width: 1, style: 'solid', color: '#cbd5e1', radius: 0, sides: { top: true, right: true, bottom: true, left: true } } };
            const address = createBlock('address', input);
            return createSection(
                [50, 50],
                [
                    [caption(input, 'Bill To'), heading(input, 'customer.organizationName'), { ...address, props: { ...address.props, title: '' } }, field(input, 'customer.contactName', 'Attn'), field(input, 'customer.contactEmail', 'Email'), field(input, 'customer.contactMobile', 'Phone')],
                    [caption(input, 'Sales Person'), heading(input, 'salesPerson.fullName'), field(input, 'salesPerson.phone', 'Phone'), field(input, 'salesPerson.email', 'Email')],
                ],
                { margin: box(0, 0, 3, 0) },
                [cell, cell],
            );
        },
    },
    {
        key: 'items',
        label: 'Items table',
        description: 'The quotation line-items table, full width',
        band: 'body',
        build: (input) => createSection([100], [[createBlock('lineItems', input)]]),
    },
    {
        key: 'totals-row',
        label: 'Totals row',
        description: 'Amount in words on the left, totals on the right',
        band: 'body',
        build: (input) => createSection([55, 45], [[createBlock('amountInWords', input)], [createBlock('totals', input)]], { margin: box(2, 0, 0, 0), avoidPageBreak: true }, [{ padding: box(0, 4, 0, 0) }, {}]),
    },
    {
        key: 'terms',
        label: 'Terms & remarks',
        description: 'Remarks, payment terms and terms & conditions',
        band: 'body',
        build: (input) => createSection([100], [[createBlock('terms', input)]]),
    },
    {
        key: 'signature',
        label: 'Signature row',
        description: 'A note on the left, signature on the right',
        band: 'body',
        build: (input) =>
            createSection(
                [60, 40],
                [[{ ...createBlock('text', input), props: { content: rich(['Thank you for your business.']) } }], [{ ...createBlock('signature', input), props: { ...createBlock('signature', input).props, caption: 'For Nandini Infosys Pvt. Ltd.' } }]],
                { margin: box(8, 0, 0, 0), avoidPageBreak: true },
                [{ verticalAlign: 'bottom' }, {}],
            ),
    },
    {
        key: 'running-header',
        label: 'Running header',
        description: 'Company name and quote number on every page',
        band: 'header',
        build: (input) =>
            createSection(
                [50, 50],
                [[{ ...createBlock('text', input), props: { content: rich([{ field: 'company.companyName' }]) } }], [{ ...createBlock('text', input), style: { textAlign: 'right' }, props: { content: rich(['Quotation ', { field: 'quotation.code' }]) } }]],
                { color: '#94a3b8', fontSize: 8 },
            ),
    },
    {
        key: 'footer',
        label: 'Footer note & page number',
        description: 'Computer-generated note and "Page X of Y"',
        band: 'footer',
        build: (input) =>
            createSection(
                [72, 28],
                [[{ ...createBlock('text', input), style: { color: '#64748b', fontSize: 7.5 }, props: { content: rich([{ text: '*This is computer generated Quotation and does not require any stamp or signature*', italic: true }]) } }], [createBlock('pageNumber', input)]],
                { border: { width: 1, style: 'solid', color: '#cbd5e1', radius: 0, sides: { top: true, right: false, bottom: false, left: false } }, padding: box(1, 0, 0, 0) },
            ),
    },
];
