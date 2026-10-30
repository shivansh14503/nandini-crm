import { z } from 'zod';
import { FIELD_MAX_LENGTH as L } from '../../config/fieldLimits.js';
import {
    booleanQuery,
    bulkIdsSchema,
    createdWithinDaysQuery,
    csvQuery,
    enumWithDefault,
    optionalEnum,
    optionalGst,
    optionalIfsc,
    optionalPan,
    optionalPostalCode,
    optionalText,
    optionalUpperText,
    refinePostalCodeForCountry,
    requiredText,
} from '../../validators/common.js';
import { corporateEmailListSchema } from '../shared/entityEmails.js';

export const ACCOUNT_STATUSES = ['Active', 'Inactive'] as const;
const MAX_PARTNER_COMPANIES = 100;

/** Older records store partner companies as objects; the form stores names. Both normalize to a name. */
const partnerCompanyEntry = z
    .union([z.string(), z.object({ partnerCompanyName: z.string() }).loose()])
    .transform((entry) => (typeof entry === 'string' ? entry : entry.partnerCompanyName).trim())
    .pipe(z.string().max(L.organizationName, { message: `Partner company names cannot exceed ${L.organizationName} characters.` }));

/** GST registration types outside the form's two options (legacy records, imports) and their bucket. */
const UNREGISTERED_TYPES = new Set(['unregistered', 'consumer']);

function normalizeRegistrationType(value: unknown): unknown {
    if (typeof value !== 'string' || !value.trim() || value === 'Registered' || value === 'Unregistered') return value;
    // e.g. 'Composition Scheme', 'SEZ' are GST-registered; 'Consumer' is not.
    return UNREGISTERED_TYPES.has(value.trim().toLowerCase()) ? 'Unregistered' : 'Registered';
}

/**
 * Accepts legacy aliases before validation: `gstNumber` → `gstNo`, `billingStreet` → `billingAddress`, and
 * legacy registration types → Registered / Unregistered.
 */
function normalizeAliases(value: unknown): unknown {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
    const input = value as Record<string, unknown>;
    return {
        ...input,
        gstNo: input.gstNo || input.gstNumber || undefined,
        billingAddress: input.billingAddress || input.billingStreet || undefined,
        shippingAddress: input.shippingAddress || input.shippingStreet || undefined,
        registrationType: normalizeRegistrationType(input.registrationType),
    };
}

/** Field rules shared by the organization form and lead conversion. */
const organizationFields = z.object({
    // Overview
    organizationName: requiredText('Organization Name', L.organizationName),
    mailingName: optionalText('Mailing Name', L.organizationName),
    tradeName: optionalText('Trade Name', L.organizationName),
    natureOfBusiness: requiredText('Nature of Business', L.option),
    accountStatus: enumWithDefault('Account Status', ACCOUNT_STATUSES, 'Active'),
    inactivityReason: optionalText('Inactivity Reason', 500),
    typeOfEntity: requiredText('Type of Entity', L.option),
    customerType: requiredText('Customer Type', L.option),
    sapCodeTallyId: optionalText('SAP Code / Tally ID', L.shortCode),
    showroomBranchCode: optionalText('Showroom / Branch Code', L.shortCode),
    sourceOfLead: optionalText('Source of Lead', L.option),
    memberOfParentCorp: optionalText('Parent Corporation', L.organizationName),
    numberOfEmployees: optionalText('Number of Employees', 30),
    annualTurnover: optionalText('Annual Turnover', 30),
    description: optionalText('Description', L.organizationDescription),
    accountVerified: z.boolean().default(false),
    activeAmc: z.boolean().default(false),
    activeCloud: z.boolean().default(false),
    provideSupport: enumWithDefault('Provide Support', ['Yes', 'No'], 'Yes'),
    assignedUser: optionalText('Assigned User', L.username),
    corporateEmails: corporateEmailListSchema.optional(),

    // Billing address
    billingAddress: requiredText('Billing Address', L.address),
    billingStreet: optionalText('Billing Street', L.address),
    billingCity: requiredText('Billing City', L.shortText),
    billingState: requiredText('Billing State', L.shortText),
    billingPostalCode: optionalPostalCode,
    billingCountry: optionalText('Billing Country', L.shortText),
    billingLatitude: optionalText('Billing Latitude', 30),

    // Shipping address
    shippingAddress: optionalText('Shipping Address', L.address),
    shippingStreet: optionalText('Shipping Street', L.address),
    shippingCity: optionalText('Shipping City', L.shortText),
    shippingState: optionalText('Shipping State', L.shortText),
    shippingPostalCode: optionalPostalCode,
    shippingCountry: optionalText('Shipping Country', L.shortText),
    shippingLongitude: optionalText('Shipping Longitude', 30),
    copyAddressFromBilling: z.boolean().default(false),

    // Tax & bank
    registrationType: enumWithDefault('Registration Type', ['Registered', 'Unregistered'], 'Registered'),
    panNumber: optionalPan,
    msmeRegnNumber: optionalUpperText('MSME Regn. Number', L.msme),
    accountName: optionalText('Account Name', L.organizationName),
    bankName: optionalText('Bank Name', L.personName),
    bankIfscCode: optionalIfsc,
    gstNo: optionalGst,
    cinNo: optionalUpperText('CIN No', L.cin),
    tanNumber: optionalUpperText('TAN Number', L.tan),
    accountNumber: optionalText('Account Number', L.bankAccount),
    typeOfAccount: optionalText('Type Of Account', 30),
    bankAddress: optionalText('Bank Address', L.address),

    // Partner licensing
    partnerCompanies: z
        .array(partnerCompanyEntry)
        .max(MAX_PARTNER_COMPANIES, { message: `At most ${MAX_PARTNER_COMPANIES} partner companies are allowed.` })
        .optional(),
});

interface PostalFields {
    billingPostalCode?: string;
    billingCountry?: string;
    shippingPostalCode?: string;
    shippingCountry?: string;
    copyAddressFromBilling: boolean;
}

function refinePostalCodes(org: PostalFields, ctx: z.RefinementCtx, billingRequired: boolean): void {
    refinePostalCodeForCountry(ctx, 'billingPostalCode', org.billingPostalCode, org.billingCountry, billingRequired);
    if (!org.copyAddressFromBilling) {
        refinePostalCodeForCountry(ctx, 'shippingPostalCode', org.shippingPostalCode, org.shippingCountry);
    }
}

/** `OrganizationFormData` rules from frontend-crm/src/validations/organization.schema.ts. */
export const organizationInputSchema = z.preprocess(
    normalizeAliases,
    organizationFields.superRefine((org, ctx) => {
        refinePostalCodes(org, ctx, true);
        if (org.registrationType === 'Registered' && !org.gstNo) {
            ctx.addIssue({ code: 'custom', path: ['gstNo'], message: 'GST Number is required for registered organizations.' });
        }
    }),
);

/**
 * Organization created by lead conversion: the Convert Lead form collects no billing address or GSTIN, so
 * those are optional here (taken from the lead when present). The full form requires them on the next edit.
 */
export const organizationConversionSchema = z.preprocess(
    normalizeAliases,
    organizationFields
        .extend({
            billingAddress: optionalText('Billing Address', L.address),
            billingCity: optionalText('Billing City', L.shortText),
            billingState: optionalText('Billing State', L.shortText),
        })
        .superRefine((org, ctx) => refinePostalCodes(org, ctx, false)),
);

/**
 * Bulk import: the import template has no entity-type, address or GSTIN-requirement context, so those are
 * optional; everything that is present is still validated with the form's rules.
 */
export const organizationImportSchema = z.preprocess(
    normalizeAliases,
    organizationFields
        .extend({
            natureOfBusiness: optionalText('Nature of Business', L.option),
            typeOfEntity: optionalText('Type of Entity', L.option),
            customerType: optionalText('Customer Type', L.option),
            billingAddress: optionalText('Billing Address', L.address),
            billingCity: optionalText('Billing City', L.shortText),
            billingState: optionalText('Billing State', L.shortText),
        })
        .superRefine((org, ctx) => refinePostalCodes(org, ctx, false)),
);

export type OrganizationInput = z.infer<typeof organizationInputSchema>;
/** Anything that can be written: the widest of the form, conversion and import inputs. */
export type OrganizationWriteInput = z.infer<typeof organizationImportSchema>;

export const organizationListQuerySchema = z.object({
    accountStatus: optionalEnum('Account Status', ACCOUNT_STATUSES),
    customerType: csvQuery,
    /** Substring match, e.g. `distributor` for the master view's Distributor tab. */
    natureOfBusiness: z.string().trim().max(L.option).optional(),
    assignedUser: z.string().trim().max(L.username).optional(),
    parentOrganizationId: z.string().trim().max(50).optional(),
    /** Only organizations assigned to the signed-in user ("My Accounts"). */
    mine: booleanQuery,
    /** Only organizations the signed-in user opened recently. */
    recent: booleanQuery,
    createdWithinDays: createdWithinDaysQuery,
});

export const bulkStatusSchema = bulkIdsSchema.extend({
    status: z.enum(ACCOUNT_STATUSES, { error: 'status must be Active or Inactive.' }),
    inactivityReason: optionalText('Inactivity Reason', 500),
});

export const ORGANIZATION_SORT_FIELDS = [
    'createdAt',
    'updatedAt',
    'organizationName',
    'accountCode',
    'natureOfBusiness',
    'customerType',
    'accountStatus',
    'billingCity',
    'billingState',
    'assignedUser',
    'gstNo',
] as const;
