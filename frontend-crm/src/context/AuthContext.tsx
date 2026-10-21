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
        } catch {
            setUser(null);
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
                }
            })
            .catch(() => {
                if (active) {
                    setUser(null);
                }
            })
            .finally(() => {
                if (active) {
                    setLoading(false);
                }
            });
        return () => {
            active = false;
        };
    }, []);

    const login = async (credentials: LoginPayload) => {
        const res = await authService.login(credentials);
        setUser(res.user);
        setError(null);
    };

    const logout = async () => {
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
