import type { ApiResponse } from '../types/api.types';
import type {
    EmailQueueQuery,
    EmailQueueResult,
    EmailRetryResult,
    EmailTemplateContent,
    EmailTemplateDto,
    EmailTemplateKey,
    OutboundCheckResult,
    OutboundEmailDto,
    RenderedEmailPreview,
    SaveOutboundEmailPayload,
} from '../types/emailAdmin.types';
import { apiClient } from './apiClient';

const BASE = '/api/admin/email';

/** Admin › Email (/api/admin/email, admins only). */
export const emailAdminService = {
    async getOutbound(): Promise<OutboundEmailDto> {
        return (await apiClient.get<ApiResponse<OutboundEmailDto>>(`${BASE}/outbound`)).data;
    },
    async saveOutbound(payload: SaveOutboundEmailPayload): Promise<OutboundEmailDto> {
        return (await apiClient.put<ApiResponse<OutboundEmailDto>>(`${BASE}/outbound`, payload)).data;
    },
    async checkConnection(): Promise<OutboundCheckResult> {
        return (await apiClient.post<ApiResponse<OutboundCheckResult>>(`${BASE}/outbound/check`)).data;
    },
    async sendTest(to: string): Promise<OutboundCheckResult> {
        return (await apiClient.post<ApiResponse<OutboundCheckResult>>(`${BASE}/outbound/test`, { to })).data;
    },
    async listTemplates(): Promise<EmailTemplateDto[]> {
        return (await apiClient.get<ApiResponse<EmailTemplateDto[]>>(`${BASE}/templates`)).data;
    },
    async saveTemplate(key: EmailTemplateKey, content: EmailTemplateContent): Promise<EmailTemplateDto> {
        return (await apiClient.put<ApiResponse<EmailTemplateDto>>(`${BASE}/templates/${key}`, content)).data;
    },
    async resetTemplate(key: EmailTemplateKey): Promise<EmailTemplateDto> {
        return (await apiClient.post<ApiResponse<EmailTemplateDto>>(`${BASE}/templates/${key}/reset`)).data;
    },
    async previewTemplate(key: EmailTemplateKey, content: EmailTemplateContent): Promise<RenderedEmailPreview> {
        return (await apiClient.post<ApiResponse<RenderedEmailPreview>>(`${BASE}/templates/${key}/preview`, content)).data;
    },
    async sendTemplateTest(key: EmailTemplateKey): Promise<{ ok: boolean; message: string }> {
        return (await apiClient.post<ApiResponse<{ ok: boolean; message: string }>>(`${BASE}/templates/${key}/test`)).data;
    },
    async listQueue(query: EmailQueueQuery): Promise<EmailQueueResult> {
        const params: Record<string, string | number> = { page: query.page, limit: query.limit };
        if (query.status) params.status = query.status;
        if (query.kind) params.kind = query.kind;
        if (query.q) params.q = query.q;
        return (await apiClient.get<ApiResponse<EmailQueueResult>>(`${BASE}/queue`, { params })).data;
    },
    async retry(id: string): Promise<EmailRetryResult> {
        return (await apiClient.post<ApiResponse<EmailRetryResult>>(`${BASE}/queue/${encodeURIComponent(id)}/retry`)).data;
    },
};
