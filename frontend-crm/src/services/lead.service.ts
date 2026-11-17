import type { ApiResponse } from '../types/api.types';
import type { Lead, LeadFormData } from '../types/lead.types';
import { apiClient } from './apiClient';
import { createCrudService } from './base.service';

/** A live lead / contact / organization that already has the mobile number or email address. */
export interface ExistingRecordMatch {
    entityType: 'Lead' | 'Contact' | 'Organization';
    id: string;
    /** Lead / contact / account code. */
    code: string;
    name: string;
    organizationName?: string;
}

export interface LeadDuplicateCheck {
    mobileMatches: ExistingRecordMatch[];
    /** Keyed by lowercased email. */
    emailMatches: Record<string, ExistingRecordMatch[]>;
}

/** Which kind of record the form is editing (its own mobile / emails aren't reported). */
export type DuplicateCheckOwner = 'lead' | 'contact' | 'organization';

const baseLeadService = createCrudService<Lead, LeadFormData, Partial<LeadFormData>>('/api/leads');

export const leadService = {
    ...baseLeadService,
    /** Informational "already in the CRM" lookup (GET /check-duplicates); never blocks a save. */
    checkDuplicates: async (
        params: { mobile?: string; emails?: string[]; excludeId?: string; excludeType?: DuplicateCheckOwner },
        signal?: AbortSignal
    ): Promise<LeadDuplicateCheck> => {
        const res = await apiClient.get<ApiResponse<LeadDuplicateCheck>>(`${baseLeadService.endpoint}/check-duplicates`, {
            params: {
                mobile: params.mobile || undefined,
                emails: params.emails?.length ? params.emails.join(',') : undefined,
                excludeId: params.excludeId || undefined,
                excludeType: params.excludeId ? params.excludeType : undefined,
            },
            signal,
        });
        return res.data;
    },
};
