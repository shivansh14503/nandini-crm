'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { ROUTES } from '@/config/constants';
import { loginPathWithNext } from '@/utils/safeNextPath';

/**
 * Page guard for signed-in screens: once the session check has answered and nobody is signed in, replaces the page
 * with the login page.
 *
 * - First visit, or a session that ended on its own (expired, revoked, signed out in another tab: any API 401):
 *   `/login?next=<this page>`, so signing in comes back here (path, query and hash; checked by `safeNextPath`).
 *   Not while unsaved edits are on screen: AuthContext then keeps the user set and SessionExpiredDialog asks them to
 *   sign in again in place, so the draft survives; this guard redirects only if they choose "Discard changes".
 * - Explicit sign-out (the navbar's Sign out): plain `/login`, never `?next=`, whatever page the user was on.
 *
 * `replace`, not `push`: Back from the login page must not land on a page that only bounces to login again.
 */
export function useRequireAuth(): void {
    const router = useRouter();
    const { loading, isAuthenticated, signedOutByUser } = useAuth();

    useEffect(() => {
        if (loading || isAuthenticated) return;
        router.replace(signedOutByUser ? ROUTES.LOGIN : loginPathWithNext());
    }, [isAuthenticated, loading, router, signedOutByUser]);
}
