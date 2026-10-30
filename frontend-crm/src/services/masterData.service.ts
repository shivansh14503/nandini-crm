import type { ApiResponse } from '../types/api.types';
import type { CrmUser } from '../types/user.types';
import type { NatureOfCallItem } from '../types/ticket.types';
import type { PartnerCompany, PartnerCompanyContact } from '../types/partner.types';
import { apiClient } from './apiClient';
import { setMasterData, type MasterData } from './masterData.store';

/**
 * Loads users, Nature of Call and partner masters from `/api/lookups/*` into the master-data store.
 * Components pick it up through `useMasterData()`. Deliberately no `notifyCrmUpdate`: QueryProvider would
 * invalidate every query (including this one) and loop.
 */
export async function loadMasterData(): Promise<MasterData> {
    const [users, natureOfCalls, partnerCompanies, partnerContacts] = await Promise.all([
        apiClient.get<ApiResponse<CrmUser[]>>('/api/lookups/users', { params: { includeInactive: true } }),
        apiClient.get<ApiResponse<NatureOfCallItem[]>>('/api/lookups/nature-of-calls'),
        apiClient.get<ApiResponse<PartnerCompany[]>>('/api/lookups/partner-companies'),
        apiClient.get<ApiResponse<PartnerCompanyContact[]>>('/api/lookups/partner-contacts'),
    ]);
    const data: MasterData = {
        users: users.data,
        natureOfCalls: natureOfCalls.data,
        partnerCompanies: partnerCompanies.data,
        partnerContacts: partnerContacts.data,
    };
    setMasterData(data);
    return data;
}
