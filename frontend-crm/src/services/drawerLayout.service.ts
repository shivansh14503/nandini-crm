import type { ApiResponse } from '../types/api.types';
import type { DrawerLayoutModule, DrawerSection } from '../lib/drawer-layout';
import type { DrawerLayoutConfig, DrawerPiece, SaveDrawerLayoutPayload } from '../types/drawerLayout.types';
import { apiClient } from './apiClient';
import { notifyCrmUpdate } from './crmSync';

/** Sync event name: other tabs refetch drawer layouts when an admin saves or resets one. */
export const DRAWER_LAYOUT_SYNC_ENTITY = 'drawer-layouts';

/** Record side drawer layouts (/api/drawer-layouts: any user reads, admins save / reset) and pieces (admin only). */
export const drawerLayoutService = {
    listAll: async (): Promise<Partial<Record<DrawerLayoutModule, DrawerLayoutConfig>>> =>
        (await apiClient.get<ApiResponse<Partial<Record<DrawerLayoutModule, DrawerLayoutConfig>>>>('/api/drawer-layouts')).data,

    save: async (module: DrawerLayoutModule, payload: SaveDrawerLayoutPayload): Promise<DrawerLayoutConfig> => {
        const saved = (await apiClient.put<ApiResponse<DrawerLayoutConfig>>(`/api/drawer-layouts/${encodeURIComponent(module)}`, payload)).data;
        notifyCrmUpdate(DRAWER_LAYOUT_SYNC_ENTITY);
        return saved;
    },

    reset: async (module: DrawerLayoutModule): Promise<{ module: string }> => {
        const result = (await apiClient.delete<ApiResponse<{ module: string }>>(`/api/drawer-layouts/${encodeURIComponent(module)}`)).data;
        notifyCrmUpdate(DRAWER_LAYOUT_SYNC_ENTITY);
        return result;
    },

    pieces: async (module: DrawerLayoutModule): Promise<DrawerPiece[]> =>
        (await apiClient.get<ApiResponse<DrawerPiece[]>>('/api/drawer-pieces', { params: { module } })).data,

    savePiece: async (module: DrawerLayoutModule, name: string, section: DrawerSection): Promise<DrawerPiece> =>
        (await apiClient.post<ApiResponse<DrawerPiece>>('/api/drawer-pieces', { module, name, section })).data,

    removePiece: async (id: string): Promise<{ id: string }> =>
        (await apiClient.delete<ApiResponse<{ id: string }>>(`/api/drawer-pieces/${encodeURIComponent(id)}`)).data,
};
