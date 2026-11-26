import { useAuth } from '@/context/AuthContext';
import { useBookingAccess } from '@/hooks/queries/useBookingLinks';

/**
 * Whether the user menu (and the mobile drawer) shows "Booking links": the company switch is on and the user may
 * create links (or is an admin), or the user owns a link at all (one an admin made for them, or kept after their role
 * lost the right), so they can see its bookings and turn it off. One cached request (`/api/booking-links/access`,
 * 5 minutes), only while signed in.
 */
export function useShowBookingLinks(): boolean {
    const { user } = useAuth();
    const { data } = useBookingAccess({ enabled: Boolean(user) && !user?.mustChangePassword });
    return Boolean(data && ((data.enabled && (data.canCreate || data.isAdmin)) || data.ownsLinks));
}
