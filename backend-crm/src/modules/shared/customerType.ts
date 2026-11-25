import { HttpError } from '../../utils/httpError.js';

/** The Customer Type of partner organizations (org_customer_type). */
export const PARTNER_CUSTOMER_TYPE = 'Partner';

/**
 * Whether an organization's Customer Type is Partner. Partner organizations must give their Nature of Partner.
 * Mirrors `isPartnerCustomerType` in frontend-crm/src/config/constants.ts.
 */
export function isPartnerCustomerType(customerType?: string | null): boolean {
    return (customerType ?? '').trim().toLowerCase() === PARTNER_CUSTOMER_TYPE.toLowerCase();
}

export const NATURE_OF_PARTNER_REQUIRED_MESSAGE = 'Nature of Partner is required when Customer Type is Partner.';

/** Refuses a partner organization without a Nature of Partner (400, on the `natureOfPartner` field). */
export function assertNatureOfPartner(org: { customerType?: string | null; natureOfPartner?: string | null }): void {
    if (!isPartnerCustomerType(org.customerType) || org.natureOfPartner?.trim()) return;
    throw HttpError.badRequest(NATURE_OF_PARTNER_REQUIRED_MESSAGE, [{ message: NATURE_OF_PARTNER_REQUIRED_MESSAGE, path: ['natureOfPartner'] }]);
}
