import type { EntityEmail, Organization } from '../../generated/prisma/client.js';
import { parseCustomFields, parseStringArray, text, toIso, toIsoOrUndefined } from '../../utils/mappers.js';
import { toEmailDtos, type CorporateEmailDto } from '../shared/entityEmails.js';

export type OrganizationRow = Organization & { corporateEmails?: EntityEmail[] };

/** Per-viewer flags on `ExtendedOrganization`. */
export interface OrganizationViewerFlags {
    isMyAccount: boolean;
    isRecentlyViewed: boolean;
}

/** `ExtendedOrganization` from frontend-crm/src/types/organization.types.ts, plus `parentOrganizationId`. */
export interface OrganizationDto extends OrganizationViewerFlags {
    id: string;
    accountCode: string;
    organizationName: string;
    mailingName: string;
    tradeName: string;
    natureOfBusiness: string;
    accountStatus: string;
    inactivityReason: string;
    typeOfEntity: string;
    customerType: string;
    natureOfPartner: string;
    sapCodeTallyId: string;
    showroomBranchCode: string;
    leadSource: string;
    memberOf: string;
    parentOrganizationId: string;
    numberOfEmployees: string;
    annualTurnover: string;
    addDescriptionAndScope: string;
    accountVerified: boolean;
    verifiedAt?: string;
    verifiedBy?: string;
    activeAmc: boolean;
    activeCloud: boolean;
    provideSupport: 'Yes' | 'No';
    assignedTo: string;
    corporateEmails: CorporateEmailDto[];

    billingAddress: string;
    billingStreet: string;
    billingCity: string;
    billingState: string;
    billingPostalCode: string;
    billingCountry: string;
    billingLatitude: string;

    shippingAddress: string;
    shippingStreet: string;
    shippingCity: string;
    shippingState: string;
    shippingPostalCode: string;
    shippingCountry: string;
    shippingLongitude: string;
    copyAddressFromBilling: boolean;

    registrationType: string;
    panNumber: string;
    msmeRegnNumber: string;
    accountName: string;
    bankName: string;
    ifscCode: string;
    gstNumber: string;
    cinNo: string;
    tanNumber: string;
    accountNo: string;
    typeOfAccount: string;
    bankAddress: string;

    partnerCompanies: string[];

    createdAt: string;
    updatedAt: string;
    createdBy: string;
    /** Username of the last editor; empty until the record is first modified. */
    updatedBy: string;
    /** Admin-defined custom field values keyed by FormFieldDefinition.fieldKey. */
    customFields: Record<string, unknown>;
}

export function toOrganizationDto(
    row: OrganizationRow,
    flags: OrganizationViewerFlags = { isMyAccount: false, isRecentlyViewed: false },
): OrganizationDto {
    return {
        id: row.id,
        accountCode: row.accountCode,
        organizationName: row.organizationName,
        mailingName: text(row.mailingName),
        tradeName: text(row.tradeName),
        natureOfBusiness: text(row.natureOfBusiness),
        accountStatus: row.accountStatus,
        inactivityReason: text(row.inactivityReason),
        typeOfEntity: text(row.typeOfEntity),
        customerType: text(row.customerType),
        natureOfPartner: text(row.natureOfPartner),
        sapCodeTallyId: text(row.sapCodeTallyId),
        showroomBranchCode: text(row.showroomBranchCode),
        leadSource: text(row.leadSource),
        memberOf: text(row.memberOf),
        parentOrganizationId: text(row.parentOrganizationId),
        numberOfEmployees: text(row.numberOfEmployees),
        annualTurnover: text(row.annualTurnover),
        addDescriptionAndScope: text(row.addDescriptionAndScope),
        accountVerified: row.accountVerified,
        verifiedAt: toIsoOrUndefined(row.verifiedAt),
        verifiedBy: row.verifiedBy ?? undefined,
        activeAmc: row.activeAmc,
        activeCloud: row.activeCloud,
        provideSupport: row.provideSupport === 'No' ? 'No' : 'Yes',
        assignedTo: text(row.assignedTo),
        corporateEmails: toEmailDtos(row.corporateEmails),

        billingAddress: text(row.billingAddress),
        billingStreet: text(row.billingStreet),
        billingCity: text(row.billingCity),
        billingState: text(row.billingState),
        billingPostalCode: text(row.billingPostalCode),
        billingCountry: text(row.billingCountry),
        billingLatitude: text(row.billingLatitude),

        shippingAddress: text(row.shippingAddress),
        shippingStreet: text(row.shippingStreet),
        shippingCity: text(row.shippingCity),
        shippingState: text(row.shippingState),
        shippingPostalCode: text(row.shippingPostalCode),
        shippingCountry: text(row.shippingCountry),
        shippingLongitude: text(row.shippingLongitude),
        copyAddressFromBilling: row.copyAddressFromBilling,

        registrationType: text(row.registrationType),
        panNumber: text(row.panNumber),
        msmeRegnNumber: text(row.msmeRegnNumber),
        accountName: text(row.accountName),
        bankName: text(row.bankName),
        ifscCode: text(row.ifscCode),
        gstNumber: text(row.gstNumber),
        cinNo: text(row.cinNo),
        tanNumber: text(row.tanNumber),
        accountNo: text(row.accountNo),
        typeOfAccount: text(row.typeOfAccount),
        bankAddress: text(row.bankAddress),

        partnerCompanies: parseStringArray(row.partnerCompaniesJson),

        createdAt: toIso(row.createdAt),
        updatedAt: toIso(row.updatedAt),
        createdBy: row.createdBy,
        updatedBy: row.updatedBy ?? '',
        customFields: parseCustomFields(row.customDataJson),
        ...flags,
    };
}
