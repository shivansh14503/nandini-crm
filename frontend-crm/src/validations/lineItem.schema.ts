import { z } from 'zod';
import { FIELD_MAX_LENGTH as L } from '../config/fieldLimits';
import { isBlankLineItem } from '../lib/line-items/lineItemMath';
import { optionalString, optionalText, zodAmount } from './common';

/**
 * Line items, the same on opportunities and quotations (Jira CRM-111; the API's rules are in backend
 * shared/lineItems.ts). Every field is required except Discount, Description and Note. A line nothing was entered on
 * (the empty line the form always shows) is skipped, and the API drops it.
 */
const lineItemShape = z.object({
    id: z.string(),
    productId: optionalString,
    productName: z.string().trim().default(''),
    quantity: z.coerce.number().default(1),
    rate: z.coerce.number().default(0),
    grossAmount: zodAmount.default(0),
    discount: z.coerce.number().default(0),
    discountAmount: zodAmount.default(0),
    taxRate: z.string().trim().default(''),
    taxableAmount: zodAmount.default(0),
    description: optionalText('Description', L.longText),
    note: optionalText('Note', L.longText),
});

export type LineItemSchemaType = z.infer<typeof lineItemShape>;

/** Field errors of one line, by field (shown under that cell). */
export function lineItemIssues(item: LineItemSchemaType): { path: keyof LineItemSchemaType; message: string }[] {
    const issues: { path: keyof LineItemSchemaType; message: string }[] = [];
    if (!item.productName.trim()) issues.push({ path: 'productName', message: 'Product is required.' });
    if (!(item.quantity >= 1)) issues.push({ path: 'quantity', message: 'Quantity must be at least 1.' });
    if (!(item.rate > 0)) issues.push({ path: 'rate', message: 'Rate is required.' });
    if (item.discount < 0 || item.discount > 100) issues.push({ path: 'discount', message: 'Discount must be between 0% and 100%.' });
    if (!item.taxRate.trim()) issues.push({ path: 'taxRate', message: 'GST is required.' });
    return issues;
}

export const LINE_ITEMS_REQUIRED_MESSAGE = 'Add at least one product line to the quotation.';

/** Line items of a record; `required` (quotations) asks for at least one filled line. */
export function lineItemListSchema({ required = false }: { required?: boolean } = {}) {
    return z.array(lineItemShape).superRefine((items, ctx) => {
        let filled = 0;
        items.forEach((item, index) => {
            if (isBlankLineItem(item)) return;
            filled += 1;
            for (const issue of lineItemIssues(item)) ctx.addIssue({ code: 'custom', path: [index, issue.path], message: issue.message });
        });
        if (required && filled === 0) {
            // On the (always shown) first line's Product, so the message sits where the product is picked.
            ctx.addIssue({ code: 'custom', path: [0, 'productName'], message: LINE_ITEMS_REQUIRED_MESSAGE });
        }
    });
}
