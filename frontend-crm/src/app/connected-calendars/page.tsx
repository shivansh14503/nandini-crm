'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ROUTES } from '@/config/constants';
import { LoadingScreen } from '@/components/common/LoadingScreen';

/**
 * /connected-calendars: the old temporary page, now My Profile › Connected accounts. Kept only as a redirect for old
 * bookmarks and OAuth flows already in flight; the rest of the query string (`?calendar=connected|error&reason=&provider=`)
 * is carried over so the card still shows the callback result. /profile sends signed-out users to login with
 * `?next=` set to that tab, so they come back to it.
 */
export default function ConnectedCalendarsRedirect() {
    const router = useRouter();

    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        params.delete('tab');
        const rest = params.toString();
        router.replace(rest ? `${ROUTES.PROFILE_CONNECTED_ACCOUNTS}&${rest}` : ROUTES.PROFILE_CONNECTED_ACCOUNTS);
    }, [router]);

    return <LoadingScreen message="Opening Connected accounts..." />;
}
