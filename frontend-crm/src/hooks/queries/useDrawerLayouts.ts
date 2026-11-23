import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { drawerLayoutService } from '@/services/drawerLayout.service';
import type { DrawerLayoutModule, DrawerSection } from '@/lib/drawer-layout';
import type { DrawerLayoutConfig, DrawerPiece, SaveDrawerLayoutPayload } from '@/types/drawerLayout.types';

export const DRAWER_LAYOUTS_QUERY_KEY = ['drawer-layouts'] as const;
const drawerPiecesKey = (module: DrawerLayoutModule) => ['drawer-pieces', module] as const;
const STALE_MS = 5 * 60 * 1000;

type LayoutMap = Partial<Record<DrawerLayoutModule, DrawerLayoutConfig>>;

/** Every saved drawer layout (one small request shared by all drawers). */
export function useDrawerLayouts() {
    return useQuery({ queryKey: DRAWER_LAYOUTS_QUERY_KEY, queryFn: () => drawerLayoutService.listAll(), staleTime: STALE_MS });
}

export function useSaveDrawerLayout(module: DrawerLayoutModule) {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (payload: SaveDrawerLayoutPayload) => drawerLayoutService.save(module, payload),
        onSuccess: (saved) => queryClient.setQueryData<LayoutMap>(DRAWER_LAYOUTS_QUERY_KEY, (prev) => ({ ...prev, [module]: saved })),
    });
}

export function useResetDrawerLayout(module: DrawerLayoutModule) {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: () => drawerLayoutService.reset(module),
        onSuccess: () =>
            queryClient.setQueryData<LayoutMap>(DRAWER_LAYOUTS_QUERY_KEY, (prev) => {
                const next = { ...prev };
                delete next[module];
                return next;
            }),
    });
}

/** The builder's Pieces library (admin only). */
export function useDrawerPieces(module: DrawerLayoutModule, enabled = true) {
    return useQuery({ queryKey: drawerPiecesKey(module), queryFn: () => drawerLayoutService.pieces(module), staleTime: STALE_MS, enabled });
}

export function useSaveDrawerPiece(module: DrawerLayoutModule) {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ name, section }: { name: string; section: DrawerSection }) => drawerLayoutService.savePiece(module, name, section),
        onSuccess: (piece) => queryClient.setQueryData<DrawerPiece[]>(drawerPiecesKey(module), (prev) => [piece, ...(prev ?? [])]),
    });
}

export function useRemoveDrawerPiece(module: DrawerLayoutModule) {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (id: string) => drawerLayoutService.removePiece(id),
        onSuccess: ({ id }) => queryClient.setQueryData<DrawerPiece[]>(drawerPiecesKey(module), (prev) => (prev ?? []).filter((p) => p.id !== id)),
    });
}
