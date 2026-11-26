import { ENV } from '../config/env';
import type { ApiResponse } from '../types/api.types';
import type { PreferencesDto, PreferencesPatch } from '../types/preferences.types';
import {
    PROFILE_PHOTO_MAX_BYTES,
    PROFILE_PHOTO_TYPES,
    type PhotoResponse,
    type ProfileDto,
    type ProfilePhotoType,
    type ProfileUpdate,
    type SessionsResponse,
} from '../types/profile.types';
import { ApiClientError, apiClient } from './apiClient';

const BASE = '/api/me';

const clientError = (message: string) => new ApiClientError(message, undefined, { message });

const readAsDataUrl = (blob: Blob) =>
    new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(clientError('Could not read the photo.'));
        reader.readAsDataURL(blob);
    });

/** The signed-in user's own profile, photo, sessions and notification preferences (My Profile). */
export const profileService = {
    async getProfile(): Promise<ProfileDto> {
        const res = await apiClient.get<ApiResponse<ProfileDto>>(`${BASE}/profile`);
        return res.data;
    },
    async updateProfile(data: ProfileUpdate): Promise<ProfileDto> {
        const res = await apiClient.patch<ApiResponse<ProfileDto>>(`${BASE}/profile`, data);
        return res.data;
    },
    /** Uploads an already-cropped PNG / JPEG / WebP image (≤ 512 KB), replacing the current photo. */
    async uploadPhoto(blob: Blob, fileName?: string): Promise<PhotoResponse> {
        const mimeType = blob.type as ProfilePhotoType;
        if (!PROFILE_PHOTO_TYPES.includes(mimeType)) throw clientError('Upload a PNG, JPEG or WebP image.');
        if (blob.size === 0) throw clientError('The photo is empty.');
        if (blob.size > PROFILE_PHOTO_MAX_BYTES) throw clientError('The photo must be 512 KB or smaller.');
        const data = await readAsDataUrl(blob);
        const res = await apiClient.put<ApiResponse<PhotoResponse>>(`${BASE}/photo`, { mimeType, data, ...(fileName ? { fileName } : {}) });
        return res.data;
    },
    async removePhoto(): Promise<PhotoResponse> {
        const res = await apiClient.delete<ApiResponse<PhotoResponse>>(`${BASE}/photo`);
        return res.data;
    },
    async listSessions(): Promise<SessionsResponse> {
        const res = await apiClient.get<ApiResponse<SessionsResponse>>(`${BASE}/sessions`);
        return res.data;
    },
    async revokeSession(id: string): Promise<void> {
        await apiClient.delete<ApiResponse<unknown>>(`${BASE}/sessions/${encodeURIComponent(id)}`);
    },
    async revokeOtherSessions(): Promise<{ signedOutSessions: number }> {
        const res = await apiClient.delete<ApiResponse<{ signedOutSessions: number }>>(`${BASE}/sessions`);
        return res.data;
    },
    async getPreferences(): Promise<PreferencesDto> {
        const res = await apiClient.get<ApiResponse<PreferencesDto>>(`${BASE}/preferences`);
        return res.data;
    },
    /** Saves only the keys present in `patch`; answers with every preference as saved. */
    async updatePreferences(patch: PreferencesPatch): Promise<PreferencesDto> {
        const res = await apiClient.patch<ApiResponse<PreferencesDto>>(`${BASE}/preferences`, patch);
        return res.data;
    },
};

/**
 * Absolute URL of a profile photo (`/api/user-photos/<id>`), sent with the session cookie. Undefined when there
 * is no photo; absolute URLs pass through.
 */
export function photoSrc(url: string | null | undefined): string | undefined {
    if (!url) return undefined;
    if (/^(https?:|data:|blob:)/i.test(url)) return url;
    return `${ENV.API_URL}${url}`;
}
