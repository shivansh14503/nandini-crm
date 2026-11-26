import type { AuthUser } from '../../types/user.types.js';
import { hasGlobalAccess } from '../shared/accessControl.js';
import { isAdminAccessRole } from '../user-admin/roles.js';
import type { BookingCreatorScope } from './bookingLink.constants.js';
import type { BookingSettings } from './bookingLink.settings.js';

/** Who may do what with booking links (pure). */

/** Admin roles (FORM_CONFIG_ADMIN_ROLES, matched like `requireRole`). */
export const isBookingAdmin = (user: Pick<AuthUser, 'role'>): boolean => isAdminAccessRole(user.role);

/** Whether a role may own a booking link under `scope` (admins and, for `managers`, global-access roles). */
export function roleMayOwnLinks(user: Pick<AuthUser, 'role'>, scope: BookingCreatorScope): boolean {
    if (isBookingAdmin(user)) return true;
    if (scope === 'everyone') return true;
    if (scope === 'managers') return hasGlobalAccess(user);
    return false;
}

/** What the signed-in user may do (GET /api/booking-links/access; the user menu shows the item when `canCreate`). */
export interface BookingAccess {
    enabled: boolean;
    /** May create and edit their own links now. */
    canCreate: boolean;
    /** May see everyone's links and create / edit one for a team member. */
    isAdmin: boolean;
    whoCanCreate: BookingCreatorScope;
}

export function bookingAccessOf(user: Pick<AuthUser, 'role'>, settings: BookingSettings): BookingAccess {
    const isAdmin = isBookingAdmin(user);
    return { enabled: settings.enabled, canCreate: settings.enabled && roleMayOwnLinks(user, settings.whoCanCreate), isAdmin, whoCanCreate: settings.whoCanCreate };
}
