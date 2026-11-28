import { z } from 'zod';
import { DEFAULT_DISCOUNT_TYPE, duplicateLineItems, duplicateProductMessage, isBlankLineItem, LINE_ITEM_DISCOUNT_TYPES, roundMoney } from '../lib/line-items/lineItemMath';
import { optionalLongText, optionalString, zodAmount } from './common';

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
    discountType: z.enum(LINE_ITEM_DISCOUNT_TYPES).catch(DEFAULT_DISCOUNT_TYPE).default(DEFAULT_DISCOUNT_TYPE),
    discountAmount: zodAmount.default(0),
    taxRate: z.string().trim().default(''),
    taxableAmount: zodAmount.default(0),
    description: optionalLongText,
    note: optionalLongText,
});

export type LineItemSchemaType = z.infer<typeof lineItemShape>;

/** Field errors of one line, by field (shown under that cell). */
export function lineItemIssues(item: LineItemSchemaType): { path: keyof LineItemSchemaType; message: string }[] {
    const issues: { path: keyof LineItemSchemaType; message: string }[] = [];
    if (!item.productName.trim()) issues.push({ path: 'productName', message: 'Product is required.' });
    if (!(item.quantity >= 1)) issues.push({ path: 'quantity', message: 'Quantity must be at least 1.' });
    if (!(item.rate > 0)) issues.push({ path: 'rate', message: 'Rate is required.' });
    if (item.discountType === 'amount') {
        if (item.discount < 0 || item.discount > roundMoney(item.quantity * item.rate)) issues.push({ path: 'discount', message: 'Discount cannot exceed the Gross Amount.' });
    } else if (item.discount < 0 || item.discount > 100) {
        issues.push({ path: 'discount', message: 'Discount must be between 0% and 100%.' });
    }
    if (!item.taxRate.trim()) issues.push({ path: 'taxRate', message: 'GST is required.' });
    return issues;
}

/** "At least one line" message for a record (`quotation`, `opportunity`). */
export const lineItemsRequiredMessage = (record: string) => `Add at least one product line to the ${record}.`;

/**
 * Line items of a record; `required` asks for at least one filled line (quotations and opportunities; the API
 * checks the same: requiredLineItemListSchema / assertHasLineItems in backend shared/lineItems.ts). A product may be
 * on only one line (duplicateLineItems; the API rejects a repeat too).
 */
export function lineItemListSchema({ required = false, record = 'quotation' }: { required?: boolean; record?: string } = {}) {
    return z.array(lineItemShape).superRefine((items, ctx) => {
        let filled = 0;
        items.forEach((item, index) => {
            if (isBlankLineItem(item)) return;
            filled += 1;
            for (const issue of lineItemIssues(item)) ctx.addIssue({ code: 'custom', path: [index, issue.path], message: issue.message });
        });
        // A product may be on only one line (the editor shows the same message as soon as it is repeated).
        for (const { index, firstIndex } of duplicateLineItems(items)) {
            ctx.addIssue({ code: 'custom', path: [index, 'productName'], message: duplicateProductMessage(items[index].productName, firstIndex + 1) });
        }
        if (required && filled === 0) {
            // On the (always shown) first line's Product, so the message sits where the product is picked.
            ctx.addIssue({ code: 'custom', path: [0, 'productName'], message: lineItemsRequiredMessage(record) });
        }
    });
}
