import type { ApiResponse } from '../types/api.types';
import { apiClient } from './apiClient';

/** `EmailCheckResult` from backend-crm/src/modules/email-verification/localChecks.ts. */
export interface EmailCheckResult {
    email: string;
    /** `valid` only when the mailbox was confirmed; `null` when nothing is wrong but the mailbox couldn't be checked. */
    status: 'valid' | 'risky' | 'invalid' | null;
    reason: string | null;
    message: string | null;
    /** Corrected address when the domain looks like a typo of a common provider. */
    suggestion: string | null;
}

export const emailVerificationService = {
    /** `GET /api/lookups/email-check`: syntax, typos, disposable domains, DNS, then the mailbox check (cached per address). */
    check: async (email: string, signal?: AbortSignal): Promise<EmailCheckResult> => {
        const res = await apiClient.get<ApiResponse<EmailCheckResult>>('/api/lookups/email-check', { params: { email }, signal });
        return res.data;
    },
};
