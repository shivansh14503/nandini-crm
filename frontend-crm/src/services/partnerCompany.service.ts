import type { ExtendedPartnerCompany, PartnerCompanyFormData } from '../types/partner.types';
import { createCrudService } from './base.service';

/**
 * `/api/partner-companies` CRUD. Writes broadcast `notifyCrmUpdate('/api/partner-companies')`; QueryProvider
 * maps that to the `partnerCompanies` queries and also refreshes the master data that feeds the Partner Company
 * lookup, so pickers across the app see new / renamed / deleted partners right away.
 */
export const partnerCompanyService = createCrudService<
    ExtendedPartnerCompany,
    PartnerCompanyFormData,
    Partial<PartnerCompanyFormData>
>('/api/partner-companies');
