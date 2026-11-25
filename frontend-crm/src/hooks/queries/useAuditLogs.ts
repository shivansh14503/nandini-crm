import { useQuery } from '@tanstack/react-query';
import type { AuditRevisionItem } from '@/components/common/Drawer/types';
import { apiClient } from '@/services/apiClient';
import type { ApiResponse } from '@/types/api.types';

/** `entityType` values accepted by GET /api/audit-logs/:entityType/:entityId. */
export type AuditEntityType =
    | 'organizations'
    | 'contacts'
    | 'leads'
    | 'opportunities'
    | 'quotations'
    | 'products'
    | 'tickets'
    | 'contracts'
    | 'activities'
    | 'partner-companies'
    | 'referrals'
    /** Form Customization admin trail: the id is a module key, `shared`, or `all`. */
    | 'form-configs'
    /** Admin › List Scorecards trail: the id is a module key. */
    | 'scorecards';

/** One stored audit row: `changes` is a `{ field: { from, to } }` diff for updates and a record snapshot on create. */
export interface AuditEntry {
    id: string;
    action: string;
    changedBy: string;
    /** ISO timestamp. */
    createdAt: string;
    changes: unknown;
}

interface EntityAuditLog {
    entityType: string;
    entityId: string;
    entries: AuditEntry[];
    revisions: AuditRevisionItem[];
}

export const auditLogKeys = {
    all: ['auditLogs'] as const,
    entity: (entityType: AuditEntityType, entityId: string) => ['auditLogs', entityType, entityId] as const,
};

/** One cached request per record; the hooks below each pick the part they need. */
function auditLogQuery(entityType: AuditEntityType, entityId: string | undefined) {
    return {
        queryKey: auditLogKeys.entity(entityType, entityId ?? ''),
        queryFn: async () => {
            const res = await apiClient.get<ApiResponse<EntityAuditLog>>(`/api/audit-logs/${entityType}/${encodeURIComponent(entityId!)}`);
            return res.data;
        },
        enabled: Boolean(entityId),
        staleTime: 15 * 1000,
    };
}

/** Revision trail of one record (newest first), shown in the detail drawer's Changes tab. */
export function useEntityAuditLogs(entityType: AuditEntityType, entityId: string | undefined) {
    return useQuery({ ...auditLogQuery(entityType, entityId), select: (data: EntityAuditLog) => data.revisions });
}

/** Raw audit rows of one record (newest first), e.g. to rebuild its follow-up history. */
export function useEntityAuditEntries(entityType: AuditEntityType, entityId: string | undefined) {
    return useQuery({ ...auditLogQuery(entityType, entityId), select: (data: EntityAuditLog) => data.entries });
}
