import { z } from 'zod';
import {
    requiredString,
    optionalString,
    zodPhone,
    zodEmailOptional,
    zodAmount,
    quantitySchema,
} from './common';

export const opportunityLineItemSchema = z.object({
    id: z.string(),
    productId: optionalString,
    productName: requiredString('Product Name'),
    quantity: quantitySchema,
    amount: zodAmount,
    discount: zodAmount.default(0),
    discountType: z.enum(['percentage', 'direct']).default('percentage'),
    salePrice: zodAmount.default(0),
    taxRate: z.string().default('18%'),
    taxAmount: zodAmount.default(0),
    total: zodAmount.default(0),
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
    contactNumber: zodPhone,
    emailAddress: zodEmailOptional,
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
    lumpSumDiscount: zodAmount.default(0),
    totalAmount: zodAmount.default(0),
    totalDiscount: zodAmount.default(0),
    subtotal: zodAmount.default(0),
    totalTax: zodAmount.default(0),
    grandTotal: zodAmount.default(0),
});

export type OpportunityFormSchemaType = z.infer<typeof opportunityFormSchema>;
