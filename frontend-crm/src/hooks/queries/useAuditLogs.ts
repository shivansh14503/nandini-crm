import { useQuery } from '@tanstack/react-query';
import type { AuditRevisionItem } from '@/components/common/Drawer/types';
import { apiClient } from '@/services/apiClient';
import type { ApiResponse } from '@/types/api.types';

/** `entityType` values accepted by GET /api/audit-logs/:entityType/:entityId. */
export type AuditEntityType = 'organizations' | 'contacts' | 'leads' | 'opportunities' | 'quotations' | 'products' | 'tickets';

interface EntityAuditLog {
    entityType: string;
    entityId: string;
    revisions: AuditRevisionItem[];
}

export const auditLogKeys = {
    all: ['auditLogs'] as const,
    entity: (entityType: AuditEntityType, entityId: string) => ['auditLogs', entityType, entityId] as const,
};

/** Revision trail of one record (newest first), shown in the detail drawer's Changes tab. */
export function useEntityAuditLogs(entityType: AuditEntityType, entityId: string | undefined) {
    return useQuery({
        queryKey: auditLogKeys.entity(entityType, entityId ?? ''),
        queryFn: async () => {
            const res = await apiClient.get<ApiResponse<EntityAuditLog>>(`/api/audit-logs/${entityType}/${encodeURIComponent(entityId!)}`);
            return res.data.revisions;
        },
        enabled: Boolean(entityId),
        staleTime: 15 * 1000,
    });
}
