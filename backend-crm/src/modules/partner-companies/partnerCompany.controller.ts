import { createCrudController } from '../shared/crud.js';
import { partnerCompanyService } from './partnerCompany.service.js';

export const partnerCompanyController = createCrudController(partnerCompanyService, {
    singular: 'Partner company',
    plural: 'partner companies',
});
