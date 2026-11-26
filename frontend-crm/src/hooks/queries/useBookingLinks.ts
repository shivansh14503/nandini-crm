import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/hooks/queries/queryKeys';
import { bookingLinkService } from '@/services/bookingLink.service';
import type { BookingLinkPayload, BookingSettings } from '@/types/bookingLink.types';

/** What the signed-in user may do with booking links (the user menu shows "Booking links" from it). */
export function useBookingAccess(options: { enabled?: boolean } = {}) {
    return useQuery({ queryKey: queryKeys.bookingLinks.access(), queryFn: bookingLinkService.access, staleTime: 5 * 60 * 1000, enabled: options.enabled ?? true });
}

export function useBookingLinks(scope: 'mine' | 'all') {
    return useQuery({ queryKey: queryKeys.bookingLinks.list(scope), queryFn: () => bookingLinkService.list(scope), staleTime: 30 * 1000 });
}

export function useBookingLinkBookings(id: string | null) {
    return useQuery({ queryKey: queryKeys.bookingLinks.bookings(id ?? ''), queryFn: () => bookingLinkService.bookings(id!), enabled: Boolean(id), staleTime: 30 * 1000 });
}

/** Admins: the company switch and who may create links. */
export function useBookingSettings() {
    return useQuery({ queryKey: queryKeys.bookingLinks.settings(), queryFn: bookingLinkService.settings, staleTime: 30 * 1000 });
}

function useBookingMutation<TArgs, TResult>(fn: (args: TArgs) => Promise<TResult>) {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: fn,
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: queryKeys.bookingLinks.all });
        },
    });
}

export const useCreateBookingLink = () => useBookingMutation((payload: Partial<BookingLinkPayload> & { title: string }) => bookingLinkService.create(payload));
export const useUpdateBookingLink = () =>
    useBookingMutation(({ id, payload }: { id: string; payload: Partial<Omit<BookingLinkPayload, 'ownerUsername'>> }) => bookingLinkService.update(id, payload));
export const useNewBookingAddress = () => useBookingMutation((id: string) => bookingLinkService.newAddress(id));
export const useSaveBookingSettings = () => useBookingMutation((patch: Partial<BookingSettings>) => bookingLinkService.saveSettings(patch));
