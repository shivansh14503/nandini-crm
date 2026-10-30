import type { EntityEmail, Organization } from '../../generated/prisma/client.js';
import { parseStringArray, text, toIso, toIsoOrUndefined } from '../../utils/mappers.js';
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
    sapCodeTallyId: string;
    showroomBranchCode: string;
    sourceOfLead: string;
    memberOfParentCorp: string;
    parentOrganizationId: string;
    numberOfEmployees: string;
    annualTurnover: string;
    description: string;
    accountVerified: boolean;
    verifiedAt?: string;
    verifiedBy?: string;
    activeAmc: boolean;
    activeCloud: boolean;
    provideSupport: 'Yes' | 'No';
    assignedUser: string;
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
    bankIfscCode: string;
    gstNo: string;
    /** Legacy alias of `gstNo`. */
    gstNumber: string;
    cinNo: string;
    tanNumber: string;
    accountNumber: string;
    typeOfAccount: string;
    bankAddress: string;

    partnerCompanies: string[];

    createdAt: string;
    updatedAt: string;
    createdBy: string;
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
        sapCodeTallyId: text(row.sapCodeTallyId),
        showroomBranchCode: text(row.showroomBranchCode),
        sourceOfLead: text(row.sourceOfLead),
        memberOfParentCorp: text(row.memberOfParentCorp),
        parentOrganizationId: text(row.parentOrganizationId),
        numberOfEmployees: text(row.numberOfEmployees),
        annualTurnover: text(row.annualTurnover),
        description: text(row.description),
        accountVerified: row.accountVerified,
        verifiedAt: toIsoOrUndefined(row.verifiedAt),
        verifiedBy: row.verifiedBy ?? undefined,
        activeAmc: row.activeAmc,
        activeCloud: row.activeCloud,
        provideSupport: row.provideSupport === 'No' ? 'No' : 'Yes',
        assignedUser: text(row.assignedUser),
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
        bankIfscCode: text(row.bankIfscCode),
        gstNo: text(row.gstNo),
        gstNumber: text(row.gstNo),
        cinNo: text(row.cinNo),
        tanNumber: text(row.tanNumber),
        accountNumber: text(row.accountNumber),
        typeOfAccount: text(row.typeOfAccount),
        bankAddress: text(row.bankAddress),

        partnerCompanies: parseStringArray(row.partnerCompaniesJson),

        createdAt: toIso(row.createdAt),
        updatedAt: toIso(row.updatedAt),
        createdBy: row.createdBy,
        ...flags,
    };
}
