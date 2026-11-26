/**
 * Booking links (Calendar Phase 4). Mirrors backend-crm/src/modules/booking-links: the signed-in management API
 * (`/api/booking-links`, bookingLink.routes.ts) and the public booking page's API (`/api/public/booking`, no sign-in,
 * bookingLink.public.routes.ts).
 */
import type { ApiResponse } from '../types/api.types';
import type {
    BookingAccess,
    BookingConfirmation,
    BookingLink,
    BookingLinkBooking,
    BookingLinkList,
    BookingLinkPayload,
    BookingSettings,
    PublicBookPayload,
    PublicBookingLink,
    PublicSlots,
} from '../types/bookingLink.types';
import { apiClient } from './apiClient';
import { notifyCrmUpdate } from './crmSync';
import { FORM_CONFIG_SYNC_ENTITY } from './formConfig.service';

/** Also the sync entity: `notifyCrmUpdate(BOOKING_LINKS_ENDPOINT)` refreshes every `bookingLinks` query. */
export const BOOKING_LINKS_ENDPOINT = '/api/booking-links';
const BASE = BOOKING_LINKS_ENDPOINT;
const PUBLIC = '/api/public/booking';
const enc = encodeURIComponent;

export const bookingLinkService = {
    async access(): Promise<BookingAccess> {
        return (await apiClient.get<ApiResponse<BookingAccess>>(`${BASE}/access`)).data;
    },
    async list(scope: 'mine' | 'all' = 'mine'): Promise<BookingLinkList> {
        return (await apiClient.get<ApiResponse<BookingLinkList>>(BASE, { params: { scope } })).data;
    },
    async create(payload: Partial<BookingLinkPayload> & { title: string }): Promise<BookingLink> {
        const res = await apiClient.post<ApiResponse<BookingLink>>(BASE, payload);
        notifyCrmUpdate(BASE);
        return res.data;
    },
    async update(id: string, payload: Partial<Omit<BookingLinkPayload, 'ownerUsername'>>): Promise<BookingLink> {
        const res = await apiClient.put<ApiResponse<BookingLink>>(`${BASE}/${enc(id)}`, payload);
        notifyCrmUpdate(BASE);
        return res.data;
    },
    /** A new random address; the old one stops working at once. */
    async newAddress(id: string): Promise<BookingLink> {
        const res = await apiClient.post<ApiResponse<BookingLink>>(`${BASE}/${enc(id)}/new-address`);
        notifyCrmUpdate(BASE);
        return res.data;
    },
    async bookings(id: string): Promise<BookingLinkBooking[]> {
        return (await apiClient.get<ApiResponse<BookingLinkBooking[]>>(`${BASE}/${enc(id)}/bookings`)).data;
    },
    async settings(): Promise<BookingSettings> {
        return (await apiClient.get<ApiResponse<BookingSettings>>(`${BASE}/settings`)).data;
    },
    /** A form-config module setting underneath: open Form Builders reload so they never write stale settings back. */
    async saveSettings(patch: Partial<BookingSettings>): Promise<BookingSettings> {
        const res = await apiClient.put<ApiResponse<BookingSettings>>(`${BASE}/settings`, patch);
        notifyCrmUpdate(BASE);
        notifyCrmUpdate(FORM_CONFIG_SYNC_ENTITY);
        return res.data;
    },
};

/** The public booking page (anyone; rate limited per IP and per link). */
export const publicBookingService = {
    async view(slug: string): Promise<PublicBookingLink> {
        return (await apiClient.get<ApiResponse<PublicBookingLink>>(`${PUBLIC}/${enc(slug)}`)).data;
    },
    async slots(slug: string, params: { from?: string; days?: number; duration?: number }): Promise<PublicSlots> {
        return (await apiClient.get<ApiResponse<PublicSlots>>(`${PUBLIC}/${enc(slug)}/slots`, { params: { ...params } })).data;
    },
    async book(slug: string, payload: PublicBookPayload): Promise<BookingConfirmation> {
        return (await apiClient.post<ApiResponse<BookingConfirmation>>(`${PUBLIC}/${enc(slug)}/book`, payload)).data;
    },
};
