import type { ApiResponse } from '../types/api.types';
import { apiClient } from './apiClient';

/** Mirrors backend-crm/src/modules/audit/auditAdmin.routes.ts (/api/admin/audit-logs, admin only). */

const BASE = '/api/admin/audit-logs';

/** `live` / `deleted` (soft-deleted) / `missing` for CRM records; null for everything else (sign-ins, settings). */
export type AuditRecordStatus = 'live' | 'deleted' | 'missing' | null;
export type AuditCategory = 'DATA' | 'CONFIG' | 'SECURITY';

export interface AuditListItem {
    /** BIGINT as a string; also the paging cursor. */
    id: string;
    createdAt: string;
    /** `21-Nov-2026, 11:15 AM` in the business timezone. */
    time: string;
    category: AuditCategory;
    action: string;
    actionLabel: string;
    /** INFO | NOTICE | WARNING | CRITICAL */
    severity: string;
    module: string;
    moduleLabel: string;
    entityType: string;
    entityId: string;
    /** Record number at the time; null unless the module has a document series. */
    entityCode: string | null;
    /** Record name at the time. */
    entityLabel: string | null;
    recordStatus: AuditRecordStatus;
    summary: string;
    /** Keys of the fields an update changed (custom fields as `customFields.<key>`). */
    changedFields: string[];
    /** Username, or `system` for background jobs. */
    changedBy: string;
    actorId: number | null;
    actorRole: string | null;
    /** UI | API | IMPORT | JOB */
    source: string | null;
    ipAddress: string | null;
    requestId: string | null;
    /** Screen the change was made from. */
    page: string | null;
    /** The entry this one undid or restored. */
    revertsId: string | null;
}

export interface AuditEntryDetail extends AuditListItem {
    sessionId: string | null;
    httpMethod: string | null;
    route: string | null;
    userAgent: string | null;
}

/** One line of the Field / Before / After table: `before` is null for a create, `after` null for a delete. */
export interface AuditFieldRow {
    key: string;
    label: string;
    before: string | null;
    after: string | null;
}

export interface AuditDetailRow {
    key: string;
    label: string;
    value: string;
}

export interface AuditEntryResponse {
    entry: AuditEntryDetail;
    changes: unknown;
    fields: AuditFieldRow[];
    details: AuditDetailRow[];
    /** Other entries of the same request (first 100). */
    related: AuditListItem[];
    relatedCount: number;
}

export interface AuditListPage {
    items: AuditListItem[];
    nextCursor: string | null;
    limit: number;
}

export interface AuditFacetOption {
    value: string;
    label: string;
    count: number;
}

export interface AuditFacets {
    from: string;
    to: string;
    total: number;
    users: AuditFacetOption[];
    modules: AuditFacetOption[];
    actions: AuditFacetOption[];
    categories: AuditFacetOption[];
    severities: AuditFacetOption[];
    sources: AuditFacetOption[];
}

export interface AuditDayCount {
    /** YYYY-MM-DD in the business timezone. */
    date: string;
    total: number;
    data: number;
    config: number;
    security: number;
}

export interface AuditStats {
    from: string;
    to: string;
    today: number;
    failedSignIns24h: number;
    accessDenied24h: number;
    deletes7d: number;
    total: number;
    mostActiveUsers: { username: string; label: string; count: number }[];
    eventsPerDay: AuditDayCount[];
}

/** Query of GET / (values within one filter are OR-ed, filters AND-ed). Dates are YYYY-MM-DD, `to` included. */
export interface AuditListQuery {
    from?: string;
    to?: string;
    user?: string[];
    module?: string[];
    action?: string[];
    category?: string[];
    severity?: string[];
    source?: string[];
    entityId?: string;
    entityCode?: string;
    entityLabel?: string;
    field?: string[];
    ip?: string;
    requestId?: string;
    q?: string;
}

export interface AuditRange {
    from?: string;
    to?: string;
}

/** Lists go as comma lists (the API takes either form). */
function toParams(query: AuditListQuery | AuditRange, extra: Record<string, string | number | undefined> = {}) {
    const params: Record<string, string | number | undefined> = { ...extra };
    for (const [key, value] of Object.entries(query)) {
        if (Array.isArray(value)) {
            if (value.length) params[key] = value.join(',');
        } else if (value) params[key] = value;
    }
    return params;
}

export const auditAdminService = {
    async list(query: AuditListQuery, cursor?: string, limit = 50): Promise<AuditListPage> {
        return (await apiClient.get<ApiResponse<AuditListPage>>(BASE, { params: toParams(query, { cursor, limit }) })).data;
    },
    async get(id: string): Promise<AuditEntryResponse> {
        return (await apiClient.get<ApiResponse<AuditEntryResponse>>(`${BASE}/${encodeURIComponent(id)}`)).data;
    },
    async facets(range: AuditRange): Promise<AuditFacets> {
        return (await apiClient.get<ApiResponse<AuditFacets>>(`${BASE}/facets`, { params: toParams(range) })).data;
    },
    async stats(range: AuditRange): Promise<AuditStats> {
        return (await apiClient.get<ApiResponse<AuditStats>>(`${BASE}/stats`, { params: toParams(range) })).data;
    },
};
