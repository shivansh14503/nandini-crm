import { ENV } from '../config/env';
import type { ApiError, ApiResponse } from '../types/api.types';
import type {
    PdfAsset,
    PdfBlobResult,
    PdfDisposition,
    PdfFieldRegistry,
    PdfModule,
    PdfTemplate,
    PdfTemplateCreateInput,
    PdfTemplateDraft,
    PdfTemplateListItem,
    PdfTemplateUpdateInput,
} from '../types/pdfTemplate.types';
import { ApiClientError, apiClient } from './apiClient';
import { notifyCrmUpdate } from './crmSync';

const ENDPOINT = '/api/pdf-templates';
const ASSET_ENDPOINT = '/api/pdf-assets';

/** Record endpoints per PDF module (`GET <endpoint>/:id/pdf`). */
const RECORD_ENDPOINTS: Record<PdfModule, string> = {
    QUOTATION: '/api/quotations',
};

/** PDFs can take a while for long quotations on a cold Chromium; matches the API's render timeout plus slack. */
const BINARY_TIMEOUT_MS = 45_000;

/** `attachment; filename="a.pdf"; filename*=UTF-8''a%20b.pdf` → `a b.pdf` (RFC 5987 form preferred). */
export function parseContentDispositionFileName(header: string | null, fallback: string): string {
    if (!header) return fallback;
    const star = /filename\*\s*=\s*UTF-8''([^;]+)/i.exec(header);
    if (star) {
        try {
            return decodeURIComponent(star[1].trim());
        } catch {
            // fall through to the plain filename
        }
    }
    const plain = /filename\s*=\s*"?([^";]+)"?/i.exec(header);
    return plain ? plain[1].trim() : fallback;
}

async function parseError(response: Response): Promise<ApiClientError> {
    let details: ApiError = { message: `HTTP ${response.status}: ${response.statusText}`, status: response.status };
    const type = response.headers.get('Content-Type') ?? '';
    if (type.includes('application/json')) {
        try {
            const body = (await response.json()) as Partial<ApiError>;
            details = { ...details, ...body, message: body.message || details.message, status: response.status };
        } catch {
            // keep the generic message
        }
    }
    if (response.status === 429) {
        const retry = response.headers.get('Retry-After');
        if (retry && !details.message.includes('second')) details.message = `${details.message} (retry in ${retry} s)`;
    }
    return new ApiClientError(details.message, response.status, details);
}

/**
 * Fetch for non-JSON responses (PDF / HTML). Same base URL, cookies and error shape as apiClient, so
 * errors surface as ApiClientError with the API's `{ message, code, errors }` envelope.
 */
async function fetchBinary(endpoint: string, init: RequestInit & { accept: string }, signal?: AbortSignal): Promise<Response> {
    const { accept, ...rest } = init;
    const headers = new Headers(rest.headers);
    headers.set('Accept', `${accept}, application/json`);
    if (rest.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
    const timeout = typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function' ? AbortSignal.timeout(BINARY_TIMEOUT_MS) : undefined;
    const combined = signal && timeout && typeof AbortSignal.any === 'function' ? AbortSignal.any([signal, timeout]) : (signal ?? timeout);
    let response: Response;
    try {
        response = await fetch(`${ENV.API_URL}${endpoint}`, { ...rest, headers, credentials: 'include', signal: combined });
    } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') throw err;
        if (err instanceof DOMException && err.name === 'TimeoutError') {
            throw new ApiClientError('Generating the PDF took too long. Please try again.', 408, { message: 'Generating the PDF took too long. Please try again.', status: 408 });
        }
        throw new ApiClientError('Could not reach the server. Check your connection and try again.', undefined, { message: 'Network error' });
    }
    if (!response.ok) throw await parseError(response);
    return response;
}

const writeNotify = (id?: string) => notifyCrmUpdate(ENDPOINT, id);

export const pdfTemplateService = {
    endpoint: ENDPOINT,

    list: async (params: { module?: PdfModule; includeInactive?: boolean } = {}): Promise<PdfTemplateListItem[]> => {
        const res = await apiClient.get<ApiResponse<PdfTemplateListItem[]>>(ENDPOINT, {
            params: { module: params.module, includeInactive: params.includeInactive ? 'true' : undefined },
        });
        return res.data;
    },

    get: async (id: string): Promise<PdfTemplate> => (await apiClient.get<ApiResponse<PdfTemplate>>(`${ENDPOINT}/${encodeURIComponent(id)}`)).data,

    fields: async (module: PdfModule): Promise<PdfFieldRegistry> =>
        (await apiClient.get<ApiResponse<PdfFieldRegistry>>(`${ENDPOINT}/fields`, { params: { module } })).data,

    create: async (input: PdfTemplateCreateInput): Promise<PdfTemplate> => {
        const res = await apiClient.post<ApiResponse<PdfTemplate>>(ENDPOINT, input);
        writeNotify(res.data.id);
        return res.data;
    },

    update: async (id: string, input: PdfTemplateUpdateInput): Promise<PdfTemplate> => {
        const res = await apiClient.put<ApiResponse<PdfTemplate>>(`${ENDPOINT}/${encodeURIComponent(id)}`, input);
        writeNotify(id);
        return res.data;
    },

    duplicate: async (id: string, name?: string): Promise<PdfTemplate> => {
        const res = await apiClient.post<ApiResponse<PdfTemplate>>(`${ENDPOINT}/${encodeURIComponent(id)}/duplicate`, name ? { name } : {});
        writeNotify(res.data.id);
        return res.data;
    },

    setDefault: async (id: string): Promise<PdfTemplateListItem> => {
        const res = await apiClient.post<ApiResponse<PdfTemplateListItem>>(`${ENDPOINT}/${encodeURIComponent(id)}/set-default`);
        writeNotify(id);
        return res.data;
    },

    setActive: async (id: string, isActive: boolean): Promise<PdfTemplateListItem> => {
        const res = await apiClient.patch<ApiResponse<PdfTemplateListItem>>(`${ENDPOINT}/${encodeURIComponent(id)}/active`, { isActive });
        writeNotify(id);
        return res.data;
    },

    remove: async (id: string): Promise<void> => {
        await apiClient.delete<ApiResponse<unknown>>(`${ENDPOINT}/${encodeURIComponent(id)}`);
        writeNotify(id);
    },

    /** Fast HTML preview (string for an iframe `srcdoc`). */
    previewHtml: async (template: PdfTemplateDraft, recordId: string | undefined, signal?: AbortSignal): Promise<string> => {
        const res = await fetchBinary(`${ENDPOINT}/preview`, { method: 'POST', accept: 'text/html', body: JSON.stringify({ template, recordId, format: 'html' }) }, signal);
        return res.text();
    },

    /** Full PDF render of a draft. */
    previewPdf: async (template: PdfTemplateDraft, recordId: string | undefined, signal?: AbortSignal): Promise<Blob> => {
        const res = await fetchBinary(`${ENDPOINT}/preview`, { method: 'POST', accept: 'application/pdf', body: JSON.stringify({ template, recordId, format: 'pdf' }) }, signal);
        return res.blob();
    },

    /** A record's PDF as a Blob plus the server's file name. */
    fetchRecordPdf: async (module: PdfModule, id: string, templateId?: string, disposition: PdfDisposition = 'inline', signal?: AbortSignal): Promise<PdfBlobResult> => {
        const qs = new URLSearchParams({ disposition });
        if (templateId) qs.set('templateId', templateId);
        const res = await fetchBinary(`${RECORD_ENDPOINTS[module]}/${encodeURIComponent(id)}/pdf?${qs.toString()}`, { method: 'GET', accept: 'application/pdf' }, signal);
        const blob = await res.blob();
        return { blob, fileName: parseContentDispositionFileName(res.headers.get('Content-Disposition'), `${id}.pdf`) };
    },

    uploadAsset: async (file: File): Promise<PdfAsset> => {
        const data = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result));
            reader.onerror = () => reject(new ApiClientError('Could not read the file.', undefined, { message: 'Could not read the file.' }));
            reader.readAsDataURL(file);
        });
        const res = await apiClient.post<ApiResponse<PdfAsset>>(ASSET_ENDPOINT, { fileName: file.name, mimeType: file.type, data });
        return res.data;
    },

    /** Absolute URL of an uploaded asset (images load with the session cookie). */
    assetUrl: (key: string): string => `${ENV.API_URL}${ASSET_ENDPOINT}/${encodeURIComponent(key)}`,
};
