import { apiClient } from './apiClient';
import type { ChangePasswordPayload, ChangePasswordResult, LoginPayload } from '../types/auth.types';
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
};
