import { createCrudController } from '../shared/crud.js';
import { opportunityService } from './opportunity.service.js';

export const opportunityController = createCrudController(opportunityService, { singular: 'Opportunity', plural: 'opportunities' });
