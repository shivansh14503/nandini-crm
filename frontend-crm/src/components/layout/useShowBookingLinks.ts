import { useAuth } from '@/context/AuthContext';
import { useBookingAccess } from '@/hooks/queries/useBookingLinks';

/**
 * Whether the user menu (and the mobile drawer) shows "Booking links": the company switch is on and the user may
 * create links (or is an admin). One cached request (`/api/booking-links/access`, 5 minutes), only while signed in.
 */
export function useShowBookingLinks(): boolean {
    const { user } = useAuth();
    const { data } = useBookingAccess({ enabled: Boolean(user) && !user?.mustChangePassword });
    return Boolean(data && data.enabled && (data.canCreate || data.isAdmin));
}
