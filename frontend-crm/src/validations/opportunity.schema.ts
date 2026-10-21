import { z } from 'zod';
import {
    requiredString,
    optionalString,
    emailSchema,
} from './common';

export const opportunityLineItemSchema = z.object({
    id: z.string(),
    productId: optionalString,
    productName: requiredString('Product Name'),
    quantity: z.number().min(1, { message: 'Quantity must be at least 1' }),
    amount: z.number().min(0, { message: 'Amount must be a positive number' }),
    discount: z.number().min(0).default(0),
    discountType: z.enum(['percentage', 'direct']).default('percentage'),
    salePrice: z.number().min(0).default(0),
    taxRate: z.string().default('18%'),
    taxAmount: z.number().min(0).default(0),
    total: z.number().min(0).default(0),
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
    contactNumber: z
        .string()
        .trim()
        .min(1, { message: 'Contact Number is required.' })
        .refine(
            (val) => /^[+]?[\d\s\-().]{7,20}$/.test(val),
            { message: 'Please enter a valid contact phone number.' }
        ),
    emailAddress: emailSchema,
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
    lumpSumDiscount: z.number().min(0).default(0),
    totalAmount: z.number().min(0).default(0),
    totalDiscount: z.number().min(0).default(0),
    subtotal: z.number().min(0).default(0),
    totalTax: z.number().min(0).default(0),
    grandTotal: z.number().min(0).default(0),
});

export type OpportunityFormSchemaType = z.infer<typeof opportunityFormSchema>;
