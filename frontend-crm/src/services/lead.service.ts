import type { Lead, LeadFormData } from '../types/lead.types';
import { createCrudService } from './base.service';

export const leadService = createCrudService<Lead, LeadFormData, Partial<LeadFormData>>('/api/leads');
