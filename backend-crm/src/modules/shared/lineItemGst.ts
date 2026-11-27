import type { TransactionClient } from '../../config/prisma.js';
import { companySettingsService } from '../company-settings/companySettings.service.js';
import { customerStateOf, gstTypeFor, type GstType } from './lineItemMath.js';

/**
 * How a record's line items charge GST when it is saved (Jira CRM-111): IGST when the customer's state (its shipping
 * address, else billing) differs from the Company State in Admin › Company Details, else CGST + SGST; null (plain GST)
 * while no company state is set.
 */

/** An opportunity: its organization's address. No linked organization = no customer state (CGST + SGST). */
export async function opportunityGstType(tx: TransactionClient, organizationId: string | null): Promise<GstType | null> {
    const companyState = await companySettingsService.companyState();
    if (!companyState) return null;
    const organization = organizationId
        ? await tx.organization.findUnique({ where: { id: organizationId }, select: { shippingState: true, billingState: true, copyAddressFromBilling: true } })
        : null;
    return gstTypeFor(companyState, customerStateOf(organization));
}

/** A quotation: its own billing / shipping address (the customer's, as quoted). */
export async function quotationGstType(address: { shippingState?: string | null; billingState?: string | null; copyAddressFromBilling?: boolean | null }): Promise<GstType | null> {
    return gstTypeFor(await companySettingsService.companyState(), customerStateOf(address));
}
