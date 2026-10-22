import { z } from 'zod';
import {
    requiredString,
    optionalString,
    emailSchema,
    requiredPhoneSchema,
    nonNegativeNumber,
    amountSchema,
    quantitySchema,
} from './common';

export const opportunityLineItemSchema = z.object({
    id: z.string(),
    productId: optionalString,
    productName: requiredString('Product Name'),
    quantity: quantitySchema,
    amount: amountSchema,
    discount: nonNegativeNumber('Discount').default(0),
    discountType: z.enum(['percentage', 'direct']).default('percentage'),
    salePrice: nonNegativeNumber('Sale Price').default(0),
    taxRate: z.string().default('18%'),
    taxAmount: nonNegativeNumber('Tax Amount').default(0),
    total: nonNegativeNumber('Total').default(0),
    description: optionalString,
    note: optionalString,
});

export const opportunityFormSchema = z.object({
    // Basic Details
    productCategory: z
        .array(z.string())
        .min(1, { message: 'Please select at least one Product Category.' }),
    contactName: requiredString('Contact Person'),
    contactId: optionalString,
    organizationName: requiredString('Organization Name'),
    organizationId: optionalString,
    contactNumber: requiredPhoneSchema('Contact Number'),
    emailAddress: emailSchema.optional().or(z.literal('')),
    referredBy: optionalString,
    type: requiredString('Opportunity Type'),
    salesStage: requiredString('Sales Stage'),
    leadSource: requiredString('Lead Source'),
    leadGivenBy: requiredString('Lead Given By'),
    nextFollowupDate: requiredString('Next Followup Date'),
    nextFollowupTime: optionalString,
    followupType: optionalString.default('Call'),
    addDescription: requiredString('Add Description')
        .min(3, { message: 'Add Description must be at least 3 characters.' }),
    description: optionalString,
    assignedTo: requiredString('Assigned Representative'),

    // Billing Details
    tallySerialNo: optionalString,
    invoiceNo: optionalString,
    invoiceDate: optionalString,

    // Commission Details
    commission: requiredString('Commission'),

    // Document
    addDocument: optionalString.default('No'),

    // Line Items
    currency: optionalString.default('Indian Rupee: ₹'),
    groupName: optionalString.default('Products & Services'),
    lineItems: z.array(opportunityLineItemSchema).default([]),
    lumpSumDiscount: nonNegativeNumber('Lump Sum Discount').default(0),
    totalAmount: nonNegativeNumber('Total Amount').default(0),
    totalDiscount: nonNegativeNumber('Total Discount').default(0),
    subtotal: nonNegativeNumber('Subtotal').default(0),
    totalTax: nonNegativeNumber('Total Tax').default(0),
    grandTotal: nonNegativeNumber('Grand Total').default(0),
});

export type OpportunityFormSchemaType = z.infer<typeof opportunityFormSchema>;
