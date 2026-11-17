"use client";

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { authService } from '../services/auth.service';
import type { User, LoginPayload } from '../types/auth.types';

interface AuthContextType {
    user: User | null;
    loading: boolean;
    error: string | null;
    isAuthenticated: boolean;
    login: (credentials: LoginPayload) => Promise<void>;
    logout: () => Promise<void>;
    refreshUser: () => Promise<void>;
    clearError: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Remembers (per browser) that this user was signed in, so a failed session check on reload can be told apart
// from a first visit and surfaced as "session expired" on the login page.
const HAD_SESSION_KEY = 'crm.hadSession';
export const SESSION_EXPIRED_KEY = 'crm.sessionExpired';

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
        } catch {
            setUser(null);
            markExpiredIfHadSession();
        } finally {
            setLoading(false);
        }
    }, []);

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

    const login = async (credentials: LoginPayload) => {
        const res = await authService.login(credentials);
        setUser(res.user);
        setError(null);
        markSignedIn();
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
