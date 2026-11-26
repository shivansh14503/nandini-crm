'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ROUTES } from '@/config/constants';
import { LoadingScreen } from '@/components/common/LoadingScreen';

/**
 * /connected-calendars: the old temporary page, now My Profile › Connected accounts. Kept only as a redirect for old
 * bookmarks (P2-2b removed the OAuth flow, so no query string is carried over).
 */
export default function ConnectedCalendarsRedirect() {
    const router = useRouter();

    useEffect(() => {
        router.replace(ROUTES.PROFILE_CONNECTED_ACCOUNTS);
    }, [router]);

    return <LoadingScreen message="Opening Connected accounts..." />;
}
