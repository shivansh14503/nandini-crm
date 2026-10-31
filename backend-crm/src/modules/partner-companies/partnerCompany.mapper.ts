import type { PartnerCompany, Prisma } from '../../generated/prisma/client.js';
import { nullable, text, toIso } from '../../utils/mappers.js';
import type { CorporateEmailDto, NormalizedEmail } from '../shared/entityEmails.js';
import type { PartnerCompanyInput } from './partnerCompany.validator.js';

const DEFAULT_COUNTRY = 'IN';

/** `ExtendedPartnerCompany` from frontend-crm/src/types/partner.types.ts. */
export interface PartnerCompanyDto {
    id: string;
    companyName: string;
    natureOfPartner: string;
    phone: string;
    /** Alias of `phone` (the form labels it "Office Phone"). */
    officePhone: string;
    /** Primary address of `emailAddresses`. */
    email: string;
    emailAddresses: CorporateEmailDto[];
    website: string;
    addDescription: string;
    description: string;
    assignedTo: string;
    principalCompany: string;

    bankName: string;
    bankBranch: string;
    accountNumber: string;
    bankIfscCode: string;

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

    gstNo: string;
    panNumber: string;
    cinNo: string;
    msmeRegnNumber: string;
    tanNumber: string;

    isActive: boolean;
    createdAt: string;
    updatedAt: string;
    createdBy: string;
    updatedBy: string;
}

/** Stored email list; rows created before the full form (seeds) only have the single `email` column. */
function parseEmails(row: PartnerCompany): CorporateEmailDto[] {
    let stored: NormalizedEmail[] = [];
    if (row.emailAddressesJson) {
        try {
            const parsed: unknown = JSON.parse(row.emailAddressesJson);
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
    }));
}

export function toPartnerCompanyDto(row: PartnerCompany): PartnerCompanyDto {
    const emailAddresses = parseEmails(row);
    const billingCity = text(row.billingCity ?? row.city);
    return {
        id: row.id,
        companyName: row.companyName,
        natureOfPartner: text(row.natureOfPartner),
        phone: text(row.phone),
        officePhone: text(row.phone),
        email: (emailAddresses.find((e) => e.isPrimary) ?? emailAddresses[0])?.email ?? '',
        emailAddresses,
        website: text(row.website),
        addDescription: text(row.addDescription),
        description: text(row.description),
        assignedTo: text(row.assignedTo),
        principalCompany: text(row.principalCompany),

        bankName: text(row.bankName),
        bankBranch: text(row.bankBranch),
        accountNumber: text(row.accountNumber),
        bankIfscCode: text(row.bankIfscCode),

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

        gstNo: text(row.gstNo),
        panNumber: text(row.panNumber),
        cinNo: text(row.cinNo),
        msmeRegnNumber: text(row.msmeRegnNumber),
        tanNumber: text(row.tanNumber),

        isActive: row.isActive,
        createdAt: toIso(row.createdAt),
        updatedAt: toIso(row.updatedAt),
        createdBy: row.createdBy,
        updatedBy: text(row.updatedBy),
    };
}

/**
 * Writable columns. Keeps the lookup projection in sync: `email` = primary email, `city` = billing city, and
 * "copy address from billing" is enforced here rather than trusted from the client.
 */
export function toPartnerCompanyData(
    input: PartnerCompanyInput,
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
        companyName: input.companyName,
        natureOfPartner: input.natureOfPartner,
        phone: input.phone,
        email: emails.find((e) => e.isPrimary)?.email ?? null,
        emailAddressesJson: JSON.stringify(emails),
        website: nullable(input.website),
        addDescription: nullable(input.addDescription),
        description: nullable(input.description),
        assignedTo,
        principalCompany: nullable(input.principalCompany),

        bankName: nullable(input.bankName),
        bankBranch: nullable(input.bankBranch),
        accountNumber: nullable(input.accountNumber),
        bankIfscCode: input.bankIfscCode ?? null,

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

        gstNo: input.gstNo ?? null,
        panNumber: input.panNumber ?? null,
        cinNo: input.cinNo ?? null,
        msmeRegnNumber: input.msmeRegnNumber ?? null,
        tanNumber: input.tanNumber ?? null,
    };
}
