'use client';

import React, { Suspense, useLayoutEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { ROUTES } from '@/config/constants';
import { LoadingScreen } from '@/components/common/LoadingScreen';

/** Pages a user who must change their password may stay on (My Profile shows only its Security tab then). */
const OPEN_PATHS = new Set<string>([ROUTES.PROFILE, ROUTES.LOGIN]);
/** Public pages outside the app (Calendar Phase 4 booking pages). */
const PUBLIC_BOOKING_PREFIX = '/book/';

/** Reports whether the current page is closed to the user, and sends them to My Profile › Security when it is. */
function PathWatcher({ onBlockedChange }: { onBlockedChange: (blocked: boolean) => void }) {
    const router = useRouter();
    const pathname = usePathname();
    // Public booking pages (/book/<slug>) are for visitors and never need a signed-in user.
    const blocked = !OPEN_PATHS.has(pathname ?? '') && !(pathname ?? '').startsWith(PUBLIC_BOOKING_PREFIX);

    // Layout effect: a closed page is swapped for the loading screen before it is painted.
    useLayoutEffect(() => {
        onBlockedChange(blocked);
        if (blocked) router.replace(ROUTES.PROFILE_SECURITY);
    }, [blocked, onBlockedChange, router]);

    return null;
}

/**
 * App-wide guard for a must-change password (a new user, or an admin reset): every page other than My Profile is
 * swapped for a loading screen while the user is taken to My Profile › Security. The API refuses everything else
 * anyway (403 PASSWORD_CHANGE_REQUIRED, which AuthContext turns into this state). Mounted once in the root layout,
 * so no page guard needs to know about it.
 *
 * The page keeps its place in the tree whether or not the flag is set, so changing the password on My Profile doesn't
 * remount it. The path is read only while the flag is set (never while pages prerender: there is no user then), inside
 * its own Suspense boundary.
 */
export function PasswordChangeGate({ children }: { children: React.ReactNode }) {
    const { user } = useAuth();
    const locked = Boolean(user?.mustChangePassword);
    const [blockedPath, setBlockedPath] = useState(false);
    // Unlocked: forget the last answer, so a later lock starts from the page as it is.
    if (!locked && blockedPath) setBlockedPath(false);

    return (
        <>
            {locked ? (
                <Suspense fallback={null}>
                    <PathWatcher onBlockedChange={setBlockedPath} />
                </Suspense>
            ) : null}
            {locked && blockedPath ? <LoadingScreen message="Taking you to change your password..." /> : children}
        </>
    );
}
