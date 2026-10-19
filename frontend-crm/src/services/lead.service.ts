import type { Lead, LeadFormData } from '../types/lead.types';
import {
    getStoredLeads,
    getStoredLeadById,
    addStoredLead,
    updateStoredLead,
    deleteStoredLead,
    deleteMultipleStoredLeads,
} from '../data/mockLeads';

export const leadService = {
    /** Fetch all leads with client-side filter capability */
    getAll: async (): Promise<Lead[]> => {
        return getStoredLeads();
    },

    /** Fetch lead by id */
    getById: async (id: string): Promise<Lead | undefined> => {
        return getStoredLeadById(id);
    },

    /** Create a new lead */
    create: async (data: LeadFormData): Promise<Lead> => {
        return addStoredLead(data);
    },

    /** Update an existing lead */
    update: async (id: string, updates: Partial<LeadFormData>): Promise<Lead | null> => {
        return updateStoredLead(id, updates);
    },

    /** Delete a single lead */
    delete: async (id: string): Promise<boolean> => {
        return deleteStoredLead(id);
    },

    /** Delete multiple leads */
    deleteBulk: async (ids: string[]): Promise<boolean> => {
        return deleteMultipleStoredLeads(ids);
    },
};
