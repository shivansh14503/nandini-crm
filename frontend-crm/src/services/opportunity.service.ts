import type { Opportunity, OpportunityFormData } from '../types/opportunity.types';
import {
    getStoredOpportunities,
    getStoredOpportunityById,
    addStoredOpportunity,
    updateStoredOpportunity,
    deleteStoredOpportunity,
    deleteMultipleStoredOpportunities,
} from '../data/mockOpportunities';

export const opportunityService = {
    /** Fetch all opportunities */
    getAll: async (): Promise<Opportunity[]> => {
        return getStoredOpportunities();
    },
    getAllOpportunities: (): Opportunity[] => {
        return getStoredOpportunities();
    },

    /** Fetch opportunity by id */
    getById: async (id: string): Promise<Opportunity | undefined> => {
        return getStoredOpportunityById(id);
    },
    getOpportunityById: (id: string): Opportunity | undefined => {
        return getStoredOpportunityById(id);
    },

    /** Create a new opportunity */
    create: async (data: OpportunityFormData): Promise<Opportunity> => {
        return addStoredOpportunity(data);
    },
    createOpportunity: async (data: OpportunityFormData): Promise<Opportunity> => {
        return addStoredOpportunity(data);
    },

    /** Update an existing opportunity */
    update: async (id: string, updates: Partial<OpportunityFormData>): Promise<Opportunity | null> => {
        return updateStoredOpportunity(id, updates);
    },
    updateOpportunity: async (id: string, updates: Partial<OpportunityFormData>): Promise<Opportunity | null> => {
        return updateStoredOpportunity(id, updates);
    },

    /** Delete a single opportunity */
    delete: async (id: string): Promise<boolean> => {
        return deleteStoredOpportunity(id);
    },
    deleteOpportunity: async (id: string): Promise<boolean> => {
        return deleteStoredOpportunity(id);
    },

    /** Delete multiple opportunities */
    deleteBulk: async (ids: string[]): Promise<boolean> => {
        return deleteMultipleStoredOpportunities(ids);
    },
    bulkDeleteOpportunities: async (ids: string[]): Promise<boolean> => {
        return deleteMultipleStoredOpportunities(ids);
    },
};
