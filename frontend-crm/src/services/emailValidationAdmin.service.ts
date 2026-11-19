import type { ApiResponse } from '../types/api.types';
import { apiClient } from './apiClient';

/** Mirrors backend-crm/src/modules/email-verification/emailValidation.admin.service.ts (/api/email-validation). */

export type AddressStatus = 'unchecked' | 'valid' | 'risky' | 'invalid';
export type AddressStatusFilter = 'all' | AddressStatus | 'attention';
export type AddressSort = 'oldest' | 'newest' | 'email';
export type EmailAction = 'accept' | 'markBounced' | 'remove';

export interface EmailAddressRow {
    email: string;
    status: AddressStatus;
    reason: string | null;
    lastCheckedAt: string | null;
    isBounced: boolean;
    records: { leads: number; contacts: number; organizations: number };
}

export interface AddressPage {
    items: EmailAddressRow[];
    total: number;
    page: number;
    pageSize: number;
}

export interface EmailValidationRun {
    id: string;
    /** queued | running | completed | cancelled | stopped */
    status: string;
    /** single = one provider call per address; list = the provider's List API (large checks). */
    mode: 'single' | 'list';
    /** list mode: local_checks | uploading | provider_running | provider_waiting | importing; null when done. */
    phase: string | null;
    /** list mode: the provider's progress, 0–100. */
    providerProgress: number | null;
    /** list mode: addresses sent to the provider (those that passed the free checks). */
    providerTotal: number | null;
    lastPolledAt: string | null;
    total: number;
    processed: number;
    validCount: number;
    riskyCount: number;
    invalidCount: number;
    undecidedCount: number;
    message: string | null;
    startedBy: string;
    createdAt: string;
    finishedAt: string | null;
}

export interface EmailValidationSummary {
    counts: { total: number; unchecked: number; valid: number; risky: number; invalid: number };
    enabled: boolean;
    providerConfigured: boolean;
    providerAvailable: boolean;
    maxRunSize: number;
    /** Checks of at least this many addresses use the provider's List API. */
    listApiMin: number;
    activeRun: EmailValidationRun | null;
}

export interface AddressFilter {
    status: AddressStatusFilter;
    search?: string;
    sort: AddressSort;
}

export type StartRunPayload = { emails: string[] } | { filter: AddressFilter; limit: number };

const BASE = '/api/email-validation';

export const emailValidationAdminService = {
    async summary(): Promise<EmailValidationSummary> {
        return (await apiClient.get<ApiResponse<EmailValidationSummary>>(`${BASE}/summary`)).data;
    },
    async addresses(filter: AddressFilter, page: number, pageSize: number): Promise<AddressPage> {
        const params = { status: filter.status, sort: filter.sort, page, pageSize, ...(filter.search ? { search: filter.search } : {}) };
        return (await apiClient.get<ApiResponse<AddressPage>>(`${BASE}/addresses`, { params })).data;
    },
    async runs(): Promise<EmailValidationRun[]> {
        return (await apiClient.get<ApiResponse<EmailValidationRun[]>>(`${BASE}/runs`)).data;
    },
    async startRun(payload: StartRunPayload): Promise<EmailValidationRun> {
        return (await apiClient.post<ApiResponse<EmailValidationRun>>(`${BASE}/runs`, payload)).data;
    },
    async cancelRun(id: string): Promise<EmailValidationRun> {
        return (await apiClient.post<ApiResponse<EmailValidationRun>>(`${BASE}/runs/${id}/cancel`)).data;
    },
    async applyAction(action: EmailAction, emails: string[]): Promise<{ affectedRecords: number }> {
        return (await apiClient.post<ApiResponse<{ affectedRecords: number }>>(`${BASE}/actions`, { action, emails })).data;
    },
};
