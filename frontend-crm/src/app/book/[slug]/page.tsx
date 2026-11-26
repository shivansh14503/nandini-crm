import type { Metadata } from 'next';
import { Suspense } from 'react';
import { PublicBookingRoute } from '@/components/booking/PublicBookingPage';
import { APP_CONFIG } from '@/config/constants';

/**
 * /book/<slug>: a public booking page (Calendar Phase 4). No sign-in and no app shell (no navbar); it calls only the
 * public booking API. Not indexed by search engines, and the address is not sent on as a referrer.
 */
export const metadata: Metadata = {
    title: `Book a time · ${APP_CONFIG.companyName}`,
    robots: { index: false, follow: false },
    referrer: 'no-referrer',
};

export default function BookPage() {
    return (
        <Suspense fallback={null}>
            <PublicBookingRoute />
        </Suspense>
    );
}
