import type { AuthUser } from '../../types/user.types.js';
import { hasGlobalAccess, isAdminUser } from '../shared/accessControl.js';
import type { BookingCreatorScope } from './bookingLink.constants.js';
import type { BookingSettings } from './bookingLink.settings.js';

/** Who may do what with booking links (pure). */

/** Roles with the admin panel (Admin › Roles, as `requireAdmin`). */
export const isBookingAdmin = (user: Pick<AuthUser, 'role'>): boolean => isAdminUser(user);

/** Whether a role may own a booking link under `scope` (admins and, for `managers`, global-access roles). */
export function roleMayOwnLinks(user: Pick<AuthUser, 'role'>, scope: BookingCreatorScope): boolean {
    if (isBookingAdmin(user)) return true;
    if (scope === 'everyone') return true;
    if (scope === 'managers') return hasGlobalAccess(user, 'activities', 'view');
    return false;
}

/**
 * What the signed-in user may do (GET /api/booking-links/access). The user menu shows "Booking links" when the switch is
 * on and the user may create links or is an admin, or whenever the user owns a link (an admin may have made it for
 * them, or their role lost the right since): they can always see its bookings and turn it off.
 */
export interface BookingAccess {
    enabled: boolean;
    /** May create and edit their own links now. */
    canCreate: boolean;
    /** May see everyone's links and create / edit one for a team member. */
    isAdmin: boolean;
    whoCanCreate: BookingCreatorScope;
    /** Owns at least one booking link (active or not). */
    ownsLinks: boolean;
}

export function bookingAccessOf(user: Pick<AuthUser, 'role'>, settings: BookingSettings, ownsLinks = false): BookingAccess {
    const isAdmin = isBookingAdmin(user);
    return { enabled: settings.enabled, canCreate: settings.enabled && roleMayOwnLinks(user, settings.whoCanCreate), isAdmin, whoCanCreate: settings.whoCanCreate, ownsLinks };
}
