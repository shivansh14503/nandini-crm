"use client";

import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { authService } from '../services/auth.service';
import { ApiClientError, setSessionOnHold, subscribeApiErrors } from '../services/apiClient';
import type { User, LoginPayload } from '../types/auth.types';
import { hasUnsavedWork, subscribeUnsavedWork } from '../utils/unsavedWork';

interface AuthContextType {
    user: User | null;
    loading: boolean;
    error: string | null;
    isAuthenticated: boolean;
    /**
     * True after the user signed out with Sign out (until they sign in again). Page guards (`useRequireAuth`) then go
     * to plain `/login`; a session that ended on its own (expired, revoked: any API 401) returns to the page via `?next=`.
     */
    signedOutByUser: boolean;
    /**
     * True when the session ended mid-session (any API 401) while unsaved edits were on screen (`hasUnsavedWork`). The
     * user stays set, so the page and its draft stay mounted, and SessionExpiredDialog asks them to sign in again
     * (`reauthenticate` clears it) or to discard the edits (`endExpiredSession`). Signing in as the same user from
     * another tab clears it too, and so does the unsaved work going away (it then falls back to /login?next=). While it
     * is set, apiClient refuses every request but the sign-in and the session check (`setSessionOnHold`).
     */
    sessionExpired: boolean;
    /** Gives up on an expired session's unsaved edits: signs out here, so the page guard goes to /login?next=. */
    endExpiredSession: () => void;
    /**
     * Signs the expired session's user in again (SessionExpiredDialog). Resolves 'resumed' when the page can carry on
     * (cached data is refetched), or 'mustChangePassword' when an admin reset the password: the user is then kept on hold
     * until `continueToPasswordChange`, because the password-change gate unmounts the page (and its draft). Rejects on
     * a wrong password, or after signing out here when the account that answered is not the expired one.
     */
    reauthenticate: (password: string) => Promise<'resumed' | 'mustChangePassword'>;
    /** After `reauthenticate` answered 'mustChangePassword': applies the sign-in, so the app goes to My Profile › Security. */
    continueToPasswordChange: () => void;
    /** Signs in and returns the signed-in user (callers check `mustChangePassword` to pick the next page). */
    login: (credentials: LoginPayload) => Promise<User>;
    logout: () => Promise<void>;
    /** Re-reads the user from GET /api/auth/me; only a 401 signs the user out (other errors keep the current user). */
    refreshUser: () => Promise<void>;
    /** Merges fields the app already has (a saved name or photo) into the signed-in user, without a request. */
    updateUser: (patch: Partial<User>) => void;
    clearError: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Remembers (per browser) that this user was signed in, so a failed session check on reload can be told apart
// from a first visit and surfaced as "session expired" on the login page.
const HAD_SESSION_KEY = 'crm.hadSession';
export const SESSION_EXPIRED_KEY = 'crm.sessionExpired';
/** API error code (403) while the signed-in user must change their password first. */
export const PASSWORD_CHANGE_REQUIRED = 'PASSWORD_CHANGE_REQUIRED';
/** API error code (401) of a wrong username or password at sign-in: not a session that ended. */
const INVALID_CREDENTIALS = 'INVALID_CREDENTIALS';

function safeStorage(op: () => void) {
    try {
        op();
    } catch {
        // Storage can be blocked (private mode); the message is a nicety, never required.
    }
}

const markSignedIn = () => safeStorage(() => window.localStorage.setItem(HAD_SESSION_KEY, '1'));
const markSignedOut = () => safeStorage(() => window.localStorage.removeItem(HAD_SESSION_KEY));
const markExpiredIfHadSession = () =>
    safeStorage(() => {
        if (window.localStorage.getItem(HAD_SESSION_KEY)) {
            window.sessionStorage.setItem(SESSION_EXPIRED_KEY, '1');
            window.localStorage.removeItem(HAD_SESSION_KEY);
        }
    });

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const queryClient = useQueryClient();
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);
    const [signedOutByUser, setSignedOutByUser] = useState(false);
    const [sessionExpired, setSessionExpired] = useState(false);
    // Read by the app-wide 401 listener, which is subscribed once.
    const userRef = useRef<User | null>(null);
    const sessionExpiredRef = useRef(false);
    // A dialog sign-in that answered with a must-change password, held until the user confirms (see reauthenticate).
    const pendingUserRef = useRef<User | null>(null);
    useEffect(() => {
        userRef.current = user;
    }, [user]);

    const setExpired = useCallback((value: boolean) => {
        sessionExpiredRef.current = value;
        if (!value) pendingUserRef.current = null;
        // Synchronously, so no request slips out (or is still refused) around the state change.
        setSessionOnHold(value);
        setSessionExpired(value);
    }, []);

    /**
     * The expired session's user is signed in again (dialog or another tab): lift the hold and refetch every active
     * query, so nothing loaded before the session ended (or refused while on hold) is left on screen.
     */
    const resumeSession = useCallback(
        (signedIn: User) => {
            userRef.current = signedIn;
            setUser(signedIn);
            setError(null);
            setSignedOutByUser(false);
            setExpired(false);
            markSignedIn();
            void queryClient.invalidateQueries();
        },
        [queryClient, setExpired],
    );

    const clearSession = useCallback(() => {
        userRef.current = null;
        setUser(null);
        setExpired(false);
        markExpiredIfHadSession();
    }, [setExpired]);

    /**
     * A request was answered 401 while signed in: the session ended on its own (expired, revoked by an admin or from
     * another device, signed out in another tab). With unsaved edits on screen the page stays mounted and
     * SessionExpiredDialog asks the user to sign in again, so a background poll or a Save never throws a draft away.
     * Otherwise sign out here, so the page guard (useRequireAuth) sends the user to /login?next=<this page> with the
     * "session expired" note, and signing in brings them back. Ignored when nobody is signed in (the initial check, the
     * login page, a late 401 after Sign out) and while the dialog is already up.
     */
    const handleSessionEnded = useCallback(() => {
        if (!userRef.current || sessionExpiredRef.current) return;
        if (hasUnsavedWork()) setExpired(true);
        else clearSession();
    }, [clearSession, setExpired]);

    const clearError = useCallback(() => {
        setError(null);
    }, []);

    const refreshUser = useCallback(async () => {
        try {
            const res = await authService.getMe();
            setUser(res.user);
            setError(null);
            markSignedIn();
        } catch (err) {
            // A 5xx, timeout or network blip says nothing about the session: keep the user signed in.
            if (err instanceof ApiClientError && err.status === 401) handleSessionEnded();
        } finally {
            setLoading(false);
        }
    }, [handleSessionEnded]);

    const updateUser = useCallback((patch: Partial<User>) => {
        setUser((current) => (current ? { ...current, ...patch } : current));
    }, []);

    // An admin reset the password while this session was open (or the flag was missed): the API refuses with 403
    // PASSWORD_CHANGE_REQUIRED, and PasswordChangeGate then takes the user to My Profile › Security.
    // Any other request answered 401 means the session ended on its own: see handleSessionEnded. A wrong password at
    // sign-in (401 INVALID_CREDENTIALS) is not a session ending. After an explicit Sign out the user is already gone, so
    // a late 401 neither shows the note nor adds `?next=`.
    useEffect(
        () =>
            subscribeApiErrors((err) => {
                if (err.status === 403 && err.details?.code === PASSWORD_CHANGE_REQUIRED) {
                    setUser((current) => (current && !current.mustChangePassword ? { ...current, mustChangePassword: true } : current));
                } else if (err.status === 401 && err.details?.code !== INVALID_CREDENTIALS) {
                    handleSessionEnded();
                }
            }),
        [handleSessionEnded],
    );

    // Signed in again from another tab while the dialog is up (the session is a shared cookie): when this tab is
    // looked at again, check the session and carry on with the draft. Only for the same user; anyone else must sign
    // in here (or discard), so one person's draft is never saved under another person's account.
    useEffect(() => {
        if (!sessionExpired) return;
        let cancelled = false;
        const check = () => {
            if (document.visibilityState !== 'visible') return;
            authService
                .getMe()
                .then((res) => {
                    if (cancelled || !sessionExpiredRef.current || pendingUserRef.current || res.user.id !== userRef.current?.id) return;
                    resumeSession(res.user);
                })
                .catch(() => {
                    // Still signed out: the dialog stays.
                });
        };
        window.addEventListener('focus', check);
        document.addEventListener('visibilitychange', check);
        return () => {
            cancelled = true;
            window.removeEventListener('focus', check);
            document.removeEventListener('visibilitychange', check);
        };
    }, [sessionExpired, resumeSession]);

    // The unsaved work went away while the dialog was up (the browser's Back button left the page, or the page's own
    // "Discard & Leave"): nothing is left to keep, so fall back to the normal path (/login?next=<this page>). Re-checked
    // after a tick, because a guard re-running its effect releases and holds again in the same commit.
    useEffect(() => {
        let timer: ReturnType<typeof setTimeout> | undefined;
        const unsubscribe = subscribeUnsavedWork(() => {
            if (!sessionExpiredRef.current || hasUnsavedWork()) return;
            clearTimeout(timer);
            timer = setTimeout(() => {
                if (sessionExpiredRef.current && !hasUnsavedWork()) clearSession();
            }, 0);
        });
        return () => {
            unsubscribe();
            clearTimeout(timer);
        };
    }, [clearSession]);

    useEffect(() => {
        let active = true;
        authService
            .getMe()
            .then((res) => {
                if (active) {
                    setUser(res.user);
                    setError(null);
                    markSignedIn();
                }
            })
            .catch(() => {
                if (active) {
                    setUser(null);
                    markExpiredIfHadSession();
                }
            })
            .finally(() => {
                // A cancelled check (StrictMode runs this effect twice in dev) must not end loading: until the
                // live check answers, the user is still unknown and pages would redirect to /login.
                if (active) setLoading(false);
            });
        return () => {
            active = false;
        };
    }, []);

    // The login response's user has the /me shape (name and photo included), so the navbar is complete at once.
    const login = async (credentials: LoginPayload) => {
        const res = await authService.login(credentials);
        setUser(res.user);
        setError(null);
        setSignedOutByUser(false);
        setExpired(false);
        markSignedIn();
        return res.user;
    };

    const reauthenticate = async (password: string): Promise<'resumed' | 'mustChangePassword'> => {
        const expected = userRef.current;
        if (!expected || !sessionExpiredRef.current) throw new Error('There is no ended session to sign in to.');
        const res = await authService.login({ username: expected.username, password });
        if (res.user.id !== expected.id) {
            // Never carry one person's draft on under another person's account.
            clearSession();
            throw new Error('A different account answered, so the unsaved changes were discarded. Sign in again.');
        }
        if (res.user.mustChangePassword) {
            pendingUserRef.current = res.user;
            return 'mustChangePassword';
        }
        resumeSession(res.user);
        return 'resumed';
    };

    const continueToPasswordChange = () => {
        const pending = pendingUserRef.current;
        if (pending) resumeSession(pending);
    };

    // An explicit sign-out never comes back to the page: `signedOutByUser` is set before the user is cleared (both land
    // in the same render), so page guards go to plain /login, the same place the caller navigates to; there is no
    // /login?next=/profile race between them.
    const logout = async () => {
        markSignedOut();
        setSignedOutByUser(true);
        try {
            await authService.logout();
        } finally {
            userRef.current = null;
            setUser(null);
            setError(null);
            setExpired(false);
        }
    };

    return (
        <AuthContext.Provider
            value={{
                user,
                loading,
                error,
                isAuthenticated: !!user,
                signedOutByUser,
                sessionExpired,
                endExpiredSession: clearSession,
                reauthenticate,
                continueToPasswordChange,
                login,
                logout,
                refreshUser,
                updateUser,
                clearError,
            }}
        >
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth(): AuthContextType {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
}
