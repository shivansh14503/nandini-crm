'use client';

import React from 'react';

/**
 * What the list page's module allows the signed-in user to start from its header (Admin › Roles). Provided by
 * CommonMasterView; MasterHeaderActions reads it to hide New and Import. Outside a list page everything is allowed.
 */
export interface MasterPermissions {
    canCreate: boolean;
    canImport: boolean;
    canExport: boolean;
}

export const ALL_MASTER_PERMISSIONS: MasterPermissions = { canCreate: true, canImport: true, canExport: true };

export const MasterPermissionsContext = React.createContext<MasterPermissions>(ALL_MASTER_PERMISSIONS);

export const useMasterPermissions = (): MasterPermissions => React.useContext(MasterPermissionsContext);
