import type { Opportunity, OpportunityFormData } from '../types/opportunity.types';
import { createCrudService } from './base.service';

export const opportunityService = createCrudService<Opportunity, OpportunityFormData, Partial<OpportunityFormData>>('/api/opportunities');
