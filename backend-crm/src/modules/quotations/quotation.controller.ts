import { createCrudController } from '../shared/crud.js';
import { quotationService } from './quotation.service.js';

export const quotationController = createCrudController(quotationService, { singular: 'Quotation', plural: 'quotations' });
