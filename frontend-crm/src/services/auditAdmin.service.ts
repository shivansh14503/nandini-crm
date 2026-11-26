import { ENV } from '../config/env';
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

/** Whether an action can be taken on an entry now, and why not. */
export interface AuditActionAvailability {
    available: boolean;
    reason?: string;
}

export interface AuditEntryResponse {
    entry: AuditEntryDetail;
    changes: unknown;
    fields: AuditFieldRow[];
    details: AuditDetailRow[];
    /** Other entries of the same request (first 100). */
    related: AuditListItem[];
    relatedCount: number;
    /** Undo (field / status change of a CRM record) and Restore (its delete); null when the entry offers neither. */
    actions: { undo: AuditActionAvailability | null; restore: AuditActionAvailability | null };
    /** The entry that undid / restored this one. */
    reversedBy: AuditListItem | null;
    /** The entry this one undid / restored. */
    reverses: AuditListItem | null;
}

/**
 * `ready`: can be put back. `conflict`: changed again since (left alone). `already`: holds the earlier value again.
 * `blocked`: can't be written back.
 */
export type UndoFieldStatus = 'ready' | 'conflict' | 'already' | 'blocked';

/** One field of an undo, values as shown on screen. */
export interface UndoField {
    key: string;
    label: string;
    /** Value before the change (what an undo puts back). */
    from: string;
    /** Value the change set. */
    to: string;
    /** Value on the record now. */
    current: string;
    status: UndoFieldStatus;
    /**
     * Why a `blocked` field can't be put back, when the API says (e.g. a follow-up activity's date, which moves with
     * its lead / opportunity, or a change made from a calendar).
     */
    reason?: string;
}

export interface UndoPreview {
    id: string;
    canUndo: boolean;
    fields: UndoField[];
}

export interface UndoResult {
    id: string;
    /** The REVERT entry written. */
    revertId: string | null;
    undone: UndoField[];
    conflicts: UndoField[];
    /** Fields the record's own rules didn't take back. */
    notReverted: UndoField[];
}

export interface RestoreResult {
    id: string;
    restoreId: string | null;
    entityType: string;
    entityId: string;
    module: string;
}

export type AuditExportFormat = 'csv' | 'xlsx';

export interface AuditExport {
    id: string;
    format: AuditExportFormat;
    status: 'queued' | 'running' | 'completed' | 'failed' | 'expired';
    rowCount: number;
    /** More entries matched than `cap`; only the newest were written. */
    truncated: boolean;
    cap: number | null;
    fileName: string | null;
    fileSize: number | null;
    message: string | null;
    createdAt: string;
    finishedAt: string | null;
    expiresAt: string | null;
}

export interface AuditDigestInfo {
    id: number;
    blockId: string;
    digestTime: string;
    /** In the business timezone. */
    time: string;
    source: 'JOB' | 'MANUAL' | 'VERIFY';
    createdBy: string;
}

export interface AuditIntegrityStatus {
    /** False when AUDIT_DIGEST_DIR isn't set (digests are kept next to the app: development only). */
    digestDirConfigured: boolean;
    schedule: string;
    digests: { count: number; latest: AuditDigestInfo | null };
    lastCheck: {
        entryId: string;
        createdAt: string;
        time: string;
        changedBy: string;
        /** verified · failed (the log was altered) · error (the check couldn't run) */
        result: 'verified' | 'failed' | 'error';
        message: string;
        digests: number;
        upToBlock: number | null;
        durationMs: number | null;
    } | null;
    running: { by: string; startedAt: string } | null;
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

/**
 * `active` / `inactive`: a CRM user. `system`: the background jobs. `unknown`: entries under a username that isn't in
 * the user list any more.
 */
export type AuditUserStatus = 'active' | 'inactive' | 'system' | 'unknown';

/** One row of the Users tab: who, their entries in the range (total and per category) and when they were last active. */
export interface AuditUserActivity {
    username: string;
    name: string;
    role: string | null;
    department: string | null;
    email: string | null;
    status: AuditUserStatus;
    onLeave: boolean;
    /**
     * `{ from, to, message }` (`YYYY-MM-DD`, inclusive) or null when unset or ended (always null for `system` /
     * `unknown`); whether it applies today is decided on the client, as for Admin › Users. Absent from older payloads.
     */
    outOfOffice?: { from: string; to: string; message: string | null } | null;
    isGroupUser: boolean;
    /** `/api/user-photos/<id>`; null when the user has no photo (and for `system` / `unknown`). */
    photoUrl: string | null;
    lastLoginAt: string | null;
    /** In the business timezone. */
    lastLogin: string | null;
    /** Newest entry, any time. */
    lastActivityAt: string | null;
    lastActivity: string | null;
    /** What that entry was, e.g. `Updated · Leads`. */
    lastActivityLabel: string | null;
    total: number;
    data: number;
    config: number;
    security: number;
    signIns: number;
    failedSignIns: number;
}

export interface AuditUsers {
    from: string;
    to: string;
    /** Most active first. */
    users: AuditUserActivity[];
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
    /** Users tab: every user with their activity in the range (default: the last 30 days). */
    async users(range: AuditRange): Promise<AuditUsers> {
        return (await apiClient.get<ApiResponse<AuditUsers>>(`${BASE}/users`, { params: toParams(range) })).data;
    },

    async undoPreview(id: string): Promise<UndoPreview> {
        return (await apiClient.get<ApiResponse<UndoPreview>>(`${BASE}/${encodeURIComponent(id)}/undo`)).data;
    },
    /** `fields`: only these keys (default: every field that can be put back). */
    async undo(id: string, fields?: string[]): Promise<UndoResult> {
        return (await apiClient.post<ApiResponse<UndoResult>>(`${BASE}/${encodeURIComponent(id)}/undo`, fields ? { fields } : {})).data;
    },
    async restore(id: string): Promise<RestoreResult> {
        return (await apiClient.post<ApiResponse<RestoreResult>>(`${BASE}/${encodeURIComponent(id)}/restore`, {})).data;
    },

    /** Starts an export of what `query` matches; small ones come back completed. */
    async createExport(format: AuditExportFormat, query: AuditListQuery): Promise<AuditExport> {
        return (await apiClient.post<ApiResponse<AuditExport>>(`${BASE}/exports`, { format, filters: toParams(query) })).data;
    },
    async getExport(id: string): Promise<AuditExport> {
        return (await apiClient.get<ApiResponse<AuditExport>>(`${BASE}/exports/${encodeURIComponent(id)}`)).data;
    },
    /** The file, streamed by the browser straight to disk (the session cookie authenticates it). */
    exportDownloadUrl(id: string): string {
        return `${ENV.API_URL}${BASE}/exports/${encodeURIComponent(id)}/download`;
    },

    async integrity(): Promise<AuditIntegrityStatus> {
        return (await apiClient.get<ApiResponse<AuditIntegrityStatus>>(`${BASE}/integrity`)).data;
    },
    async saveDigest(): Promise<{ digest: AuditDigestInfo | null; status: AuditIntegrityStatus }> {
        return (await apiClient.post<ApiResponse<{ digest: AuditDigestInfo | null; status: AuditIntegrityStatus }>>(`${BASE}/integrity/digest`, {})).data;
    },
    async verifyIntegrity(): Promise<AuditIntegrityStatus> {
        return (await apiClient.post<ApiResponse<AuditIntegrityStatus>>(`${BASE}/integrity/verify`, {})).data;
    },
};
