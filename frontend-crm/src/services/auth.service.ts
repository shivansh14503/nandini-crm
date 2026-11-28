import { apiClient } from './apiClient';
import type { AcceptSetPasswordLinkPayload, ChangePasswordPayload, ChangePasswordResult, LoginPayload, SetPasswordLinkInfo } from '../types/auth.types';
import type { ApiResponse, AuthResponse, LogoutResponse } from '../types/api.types';

export const authService = {
    login: (payload: LoginPayload): Promise<AuthResponse> => {
        return apiClient.post<AuthResponse>('/api/auth/login', payload);
    },

    getMe: (): Promise<AuthResponse> => {
        return apiClient.get<AuthResponse>('/api/auth/me');
    },

    logout: (): Promise<LogoutResponse> => {
        return apiClient.post<LogoutResponse>('/api/auth/logout');
    },

    /** Changes the signed-in user's password; the user's other sessions are signed out (this one stays). */
    changePassword: async (payload: ChangePasswordPayload): Promise<ChangePasswordResult> => {
        const res = await apiClient.post<ApiResponse<ChangePasswordResult>>('/api/auth/change-password', payload);
        return res.data;
    },

    /**
     * Public ("Forgot password?"): asks for a password reset link by username or work email. The API answers the same
     * whether or not an account matched (it never says which); rejects only on 429 RATE_LIMITED or a network failure.
     */
    requestPasswordReset: async (identifier: string): Promise<string> => {
        const res = await apiClient.post<ApiResponse<{ message: string }>>('/api/auth/forgot-password', { identifier });
        return res.data.message;
    },

    /** Public: who an emailed set-password link is for. Rejects with 400 INVALID_INVITE for any link that can't be used. */
    verifySetPasswordLink: async (token: string): Promise<SetPasswordLinkInfo> => {
        const res = await apiClient.post<ApiResponse<SetPasswordLinkInfo>>('/api/auth/invite/verify', { token });
        return res.data;
    },

    /** Public: sets the password from an emailed link, burns it and signs in (the same answer as `login`). */
    acceptSetPasswordLink: (payload: AcceptSetPasswordLinkPayload): Promise<AuthResponse> => {
        return apiClient.post<AuthResponse>('/api/auth/invite/accept', payload);
    },
};
