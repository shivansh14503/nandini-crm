import { apiClient } from './apiClient';
import type { LoginPayload } from '../types/auth.types';
import type { AuthResponse, LogoutResponse } from '../types/api.types';

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
};
