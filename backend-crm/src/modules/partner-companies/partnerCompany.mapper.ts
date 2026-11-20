import type { PartnerCompany, Prisma } from '../../generated/prisma/client.js';
import { nullable, parseCustomFields, serializeCustomFields, text, toIso } from '../../utils/mappers.js';
import type { CorporateEmailDto, NormalizedEmail } from '../shared/entityEmails.js';
import type { PartnerCompanyRecordInput } from './partnerCompany.validator.js';

const DEFAULT_COUNTRY = 'IN';

/** `ExtendedPartnerCompany` from frontend-crm/src/types/partner.types.ts. */
export interface PartnerCompanyDto {
    id: string;
    partnerName: string;
    natureOfPartner: string;
    officePhone: string;
    /** Primary address of `emailAddress`. */
    email: string;
    emailAddress: CorporateEmailDto[];
    website: string;
    addDescription: string;
    description: string;
    assignedTo: string;
    principalCompany: string;

    bankName: string;
    branch: string;
    accountNo: string;
    ifscCode: string;

    billingAddress: string;
    billingStreet: string;
    billingCity: string;
    billingState: string;
    billingPostalCode: string;
    billingCountry: string;
    /** Alias of `billingCity` (lookup projection). */
    city: string;

    shippingAddress: string;
    shippingStreet: string;
    shippingCity: string;
    shippingState: string;
    shippingPostalCode: string;
    shippingCountry: string;
    copyAddressFromBilling: boolean;

    gstNumber: string;
    panNumber: string;
    cinNo: string;
    msmeRegnNumber: string;
    tanNumber: string;

    isActive: boolean;
    createdAt: string;
    updatedAt: string;
    createdBy: string;
    /** Admin-defined custom field values keyed by FormFieldDefinition.fieldKey. */
    customFields: Record<string, unknown>;
    updatedBy: string;
}

/** Stored email list; rows created before the full form (seeds) only have the single `email` column. */
function parseEmails(row: PartnerCompany): CorporateEmailDto[] {
    let stored: NormalizedEmail[] = [];
    if (row.emailAddressJson) {
        try {
            const parsed: unknown = JSON.parse(row.emailAddressJson);
            if (Array.isArray(parsed)) {
                stored = parsed.filter(
                    (item): item is NormalizedEmail => Boolean(item) && typeof (item as NormalizedEmail).email === 'string',
                );
            }
        } catch {
            stored = [];
        }
    }
    if (stored.length === 0 && row.email) {
        stored = [{ email: row.email, isPrimary: true, isOptedOut: false, isInvalidBounce: false }];
    }
    return stored.map((item, index) => ({
        id: `email-${index + 1}`,
        email: item.email,
        isPrimary: Boolean(item.isPrimary),
        isOptedOut: Boolean(item.isOptedOut),
        isInvalidBounce: Boolean(item.isInvalidBounce),
        // Partner companies store emails as JSON and aren't auto-verified.
        verificationStatus: null,
        verificationReason: null,
        verifiedAt: null,
    }));
}

export function toPartnerCompanyDto(row: PartnerCompany): PartnerCompanyDto {
    const emailAddress = parseEmails(row);
    const billingCity = text(row.billingCity ?? row.city);
    return {
        id: row.id,
        partnerName: row.partnerName,
        natureOfPartner: text(row.natureOfPartner),
        officePhone: text(row.officePhone),
        email: (emailAddress.find((e) => e.isPrimary) ?? emailAddress[0])?.email ?? '',
        emailAddress,
        website: text(row.website),
        addDescription: text(row.addDescription),
        description: text(row.description),
        assignedTo: text(row.assignedTo),
        principalCompany: text(row.principalCompany),

        bankName: text(row.bankName),
        branch: text(row.branch),
        accountNo: text(row.accountNo),
        ifscCode: text(row.ifscCode),

        billingAddress: text(row.billingAddress ?? row.billingStreet),
        billingStreet: text(row.billingStreet ?? row.billingAddress),
        billingCity,
        billingState: text(row.billingState),
        billingPostalCode: text(row.billingPostalCode),
        billingCountry: row.billingCountry || DEFAULT_COUNTRY,
        city: billingCity,

        shippingAddress: text(row.shippingAddress ?? row.shippingStreet),
        shippingStreet: text(row.shippingStreet ?? row.shippingAddress),
        shippingCity: text(row.shippingCity),
        shippingState: text(row.shippingState),
        shippingPostalCode: text(row.shippingPostalCode),
        shippingCountry: row.shippingCountry || DEFAULT_COUNTRY,
        copyAddressFromBilling: row.copyAddressFromBilling,

        gstNumber: text(row.gstNumber),
        panNumber: text(row.panNumber),
        cinNo: text(row.cinNo),
        msmeRegnNumber: text(row.msmeRegnNumber),
        tanNumber: text(row.tanNumber),

        isActive: row.isActive,
        createdAt: toIso(row.createdAt),
        updatedAt: toIso(row.updatedAt),
        createdBy: row.createdBy,
        customFields: parseCustomFields(row.customDataJson),
        updatedBy: text(row.updatedBy),
    };
}

/**
 * Writable columns. Keeps the lookup projection in sync: `email` = primary email, `city` = billing city, and
 * "copy address from billing" is enforced here rather than trusted from the client.
 */
export function toPartnerCompanyData(
    input: PartnerCompanyRecordInput,
    emails: readonly NormalizedEmail[],
    assignedTo: string | null,
): Omit<Prisma.PartnerCompanyUncheckedCreateInput, 'createdBy'> {
    const billing = {
        address: nullable(input.billingAddress),
        city: nullable(input.billingCity),
        state: nullable(input.billingState),
        postalCode: nullable(input.billingPostalCode),
        country: input.billingCountry ?? DEFAULT_COUNTRY,
    };
    const shipping = input.copyAddressFromBilling
        ? billing
        : {
              address: nullable(input.shippingAddress),
              city: nullable(input.shippingCity),
              state: nullable(input.shippingState),
              postalCode: nullable(input.shippingPostalCode),
              country: input.shippingCountry ?? DEFAULT_COUNTRY,
          };

    return {
        customDataJson: serializeCustomFields(input.customFields),
        partnerName: input.partnerName,
        natureOfPartner: input.natureOfPartner,
        officePhone: input.officePhone,
        email: emails.find((e) => e.isPrimary)?.email ?? null,
        emailAddressJson: JSON.stringify(emails),
        website: nullable(input.website),
        addDescription: nullable(input.addDescription),
        description: nullable(input.description),
        assignedTo,
        principalCompany: nullable(input.principalCompany),

        bankName: nullable(input.bankName),
        branch: nullable(input.branch),
        accountNo: nullable(input.accountNo),
        ifscCode: input.ifscCode ?? null,

        billingAddress: billing.address,
        billingStreet: billing.address,
        billingCity: billing.city,
        billingState: billing.state,
        billingPostalCode: billing.postalCode,
        billingCountry: billing.country,
        city: billing.city,

        shippingAddress: shipping.address,
        shippingStreet: shipping.address,
        shippingCity: shipping.city,
        shippingState: shipping.state,
        shippingPostalCode: shipping.postalCode,
        shippingCountry: shipping.country,
        copyAddressFromBilling: input.copyAddressFromBilling,

        gstNumber: input.gstNumber ?? null,
        panNumber: input.panNumber ?? null,
        cinNo: input.cinNo ?? null,
        msmeRegnNumber: input.msmeRegnNumber ?? null,
        tanNumber: input.tanNumber ?? null,
    };
}
