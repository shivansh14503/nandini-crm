import type { AuthUser } from '../../types/user.types.js';
import { HttpError } from '../../utils/httpError.js';
import { isAdminUser } from '../shared/accessControl.js';

/**
 * The 403 message for a write to an inactive organization by a role without the admin panel. Same wording as the
 * organizations list toast, so the app can show the API's message as is.
 */
export const INACTIVE_ORGANIZATION_LOCKED_MESSAGE = 'This organization is inactive. Only an admin can edit it.';

/**
 * An inactive organization is locked for editing unless the user's role opens the admin panel (Admin › Roles "Admin
 * panel", always on for Super Admin): the same rule the organization form and list follow (`isAdminUser` in the
 * frontend). The lock reads the saved status, so a role that may edit an active organization can still set it to
 * Inactive, and an admin can still reactivate one. Deleting is decided by the role's Delete permission alone, as in the app.
 */
export function assertOrganizationEditable(user: Pick<AuthUser, 'role'>, row: { accountStatus: string }): void {
    if (row.accountStatus === 'Inactive' && !isAdminUser(user)) throw HttpError.forbidden(INACTIVE_ORGANIZATION_LOCKED_MESSAGE);
}
