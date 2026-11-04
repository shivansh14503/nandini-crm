import type { ApiResponse } from '../types/api.types';
import type { Lead, LeadFormData } from '../types/lead.types';
import { apiClient } from './apiClient';
import { createCrudService } from './base.service';

/** A live lead / contact that already has the mobile number. */
export interface LeadMobileMatch {
    exists: boolean;
    entityType?: 'Lead' | 'Contact';
    name?: string;
    organizationName?: string;
}

/** A live lead / contact / organization that already has the email address. */
export interface LeadEmailMatch {
    exists: true;
    entityType: 'Lead' | 'Contact' | 'Organization';
    name: string;
}

export interface LeadDuplicateCheck {
    mobileMatch: LeadMobileMatch;
    /** Keyed by lowercased email. */
    emailMatches: Record<string, LeadEmailMatch>;
}

const baseLeadService = createCrudService<Lead, LeadFormData, Partial<LeadFormData>>('/api/leads');

export const leadService = {
    ...baseLeadService,
    /** Informational "already in the CRM" lookup (GET /check-duplicates); never blocks a save. */
    checkDuplicates: async (
        params: { mobile?: string; emails?: string[]; excludeId?: string },
        signal?: AbortSignal
    ): Promise<LeadDuplicateCheck> => {
        const res = await apiClient.get<ApiResponse<LeadDuplicateCheck>>(`${baseLeadService.endpoint}/check-duplicates`, {
            params: {
                mobile: params.mobile || undefined,
                emails: params.emails?.length ? params.emails.join(',') : undefined,
                excludeId: params.excludeId || undefined,
            },
            signal,
        });
        return res.data;
    },
};
