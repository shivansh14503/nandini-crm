"use client";

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { authService } from '../services/auth.service';
import { ApiClientError, subscribeApiErrors } from '../services/apiClient';
import type { User, LoginPayload } from '../types/auth.types';

interface AuthContextType {
    user: User | null;
    loading: boolean;
    error: string | null;
    isAuthenticated: boolean;
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
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);

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
            if (err instanceof ApiClientError && err.status === 401) {
                setUser(null);
                markExpiredIfHadSession();
            }
        } finally {
            setLoading(false);
        }
    }, []);

    const updateUser = useCallback((patch: Partial<User>) => {
        setUser((current) => (current ? { ...current, ...patch } : current));
    }, []);

    // An admin reset the password while this session was open (or the flag was missed): the API refuses with 403
    // PASSWORD_CHANGE_REQUIRED, and PasswordChangeGate then takes the user to My Profile › Security.
    useEffect(
        () =>
            subscribeApiErrors((err) => {
                if (err.status === 403 && err.details?.code === PASSWORD_CHANGE_REQUIRED) {
                    setUser((current) => (current && !current.mustChangePassword ? { ...current, mustChangePassword: true } : current));
                }
            }),
        [],
    );

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
        markSignedIn();
        return res.user;
    };

    const logout = async () => {
        markSignedOut();
        try {
            await authService.logout();
        } finally {
            setUser(null);
            setError(null);
        }
    };

    return (
        <AuthContext.Provider
            value={{
                user,
                loading,
                error,
                isAuthenticated: !!user,
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
