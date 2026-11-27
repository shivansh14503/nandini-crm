'use client';

import { useCallback, useMemo } from 'react';
import { useAuth } from '@/context/AuthContext';
import { isAdminUser } from '@/utils/adminRoles';
import {
    levelAllowsRecord,
    levelOf,
    type AccessLevel,
    type OwnedRecord,
    type PermissionAction,
    type PermissionModule,
} from '@/utils/permissions';

export interface Permissions {
    /** The level the signed-in user's role gives `action` on `module` (All when the role's set isn't known yet). */
    level(module: PermissionModule, action: PermissionAction): AccessLevel;
    /** Whether the role allows `action` on `module` at all. */
    can(module: PermissionModule, action: PermissionAction): boolean;
    /** Whether the role allows `action` on this record (Own: only the user's own or created records). */
    canRecord(module: PermissionModule, action: PermissionAction, record: OwnedRecord | null | undefined): boolean;
    /** Opens the admin panel. */
    isAdmin: boolean;
}

/**
 * What the signed-in user's role allows (Admin › Roles), to hide buttons and menu items the role can't use. The API
 * enforces the same rules, so a hidden button is a convenience, never the only check.
 */
export function usePermissions(): Permissions {
    const { user } = useAuth();
    const permissions = user?.access?.permissions;
    const username = user?.username ?? '';
    const level = useCallback(
        (module: PermissionModule, action: PermissionAction): AccessLevel => (permissions ? levelOf(permissions, module, action) : 'all'),
        [permissions],
    );
    const isAdmin = isAdminUser(user);
    return useMemo(
        () => ({
            level,
            can: (module, action) => level(module, action) !== 'none',
            canRecord: (module, action, record) => levelAllowsRecord(level(module, action), username, record),
            isAdmin,
        }),
        [level, username, isAdmin],
    );
}
