import type { Lead, LeadFormData } from '../types/lead.types';
import {
    getStoredLeads,
    saveStoredLeads,
    getStoredLeadById,
    addStoredLead,
    updateStoredLead,
    deleteStoredLead,
    deleteMultipleStoredLeads,
} from '../data/mockLeads';
import { createCrudService } from './base.service';

export const leadService = createCrudService<Lead, LeadFormData, Partial<LeadFormData>>(
    '/api/leads',
    {
        getAll: getStoredLeads,
        getById: getStoredLeadById,
        create: addStoredLead,
        update: updateStoredLead,
        delete: deleteStoredLead,
        deleteBulk: deleteMultipleStoredLeads,
        saveAll: saveStoredLeads,
    }
);
