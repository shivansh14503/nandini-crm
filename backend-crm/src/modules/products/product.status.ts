import type { Product } from '../../generated/prisma/client.js';
import type { AuthUser } from '../../types/user.types.js';
import { HttpError } from '../../utils/httpError.js';
import { isAdminUser } from '../shared/accessControl.js';
import { ACTIVE_PRODUCT_STATUS, INACTIVE_PRODUCT_STATUS, isActiveProductStatus, type ProductInput } from './product.validator.js';

export const PRODUCT_STATUS_ADMIN_ONLY = "Only Admins can change a product's Status.";
export const INACTIVITY_REASON_REQUIRED = 'Give a reason for making this product Inactive.';

type ProductStatusColumns = Pick<Product, 'status' | 'inactivityReason' | 'inactiveSince' | 'inactivatedBy'>;

/**
 * The Status columns to write. Only Admins change the Status (a create counts as starting Active). Making a product
 * Inactive needs a reason, stored with the time and the admin's username; they stay as they were while it remains
 * Inactive, and making it Active again clears them. Both changes reach the audit log through the record diff.
 */
export function productStatusData(input: Pick<ProductInput, 'status' | 'inactivityReason'>, previous: ProductStatusColumns | null, actor: Pick<AuthUser, 'username' | 'role'>, now = new Date()): ProductStatusColumns {
    const wasActive = previous ? isActiveProductStatus(previous.status) : true;
    const active = isActiveProductStatus(input.status);
    if (wasActive !== active && !isAdminUser(actor)) {
        throw HttpError.forbidden(PRODUCT_STATUS_ADMIN_ONLY);
    }
    if (active) return { status: ACTIVE_PRODUCT_STATUS, inactivityReason: null, inactiveSince: null, inactivatedBy: null };
    if (previous && !wasActive) {
        return { status: INACTIVE_PRODUCT_STATUS, inactivityReason: previous.inactivityReason, inactiveSince: previous.inactiveSince, inactivatedBy: previous.inactivatedBy };
    }
    const reason = input.inactivityReason?.trim();
    if (!reason) throw HttpError.badRequest(INACTIVITY_REASON_REQUIRED, [{ message: INACTIVITY_REASON_REQUIRED, path: ['inactivityReason'] }]);
    return { status: INACTIVE_PRODUCT_STATUS, inactivityReason: reason, inactiveSince: now, inactivatedBy: actor.username };
}
