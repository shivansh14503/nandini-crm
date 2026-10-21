import type { Opportunity, OpportunityFormData } from '../types/opportunity.types';
import {
    getStoredOpportunities,
    saveStoredOpportunities,
    getStoredOpportunityById,
    addStoredOpportunity,
    updateStoredOpportunity,
    deleteStoredOpportunity,
    deleteMultipleStoredOpportunities,
} from '../data/mockOpportunities';
import { createCrudService } from './base.service';

const baseOpportunityService = createCrudService<
    Opportunity,
    OpportunityFormData,
    Partial<OpportunityFormData>
>('/api/opportunities', {
    getAll: getStoredOpportunities,
    getById: getStoredOpportunityById,
    create: addStoredOpportunity,
    update: updateStoredOpportunity,
    delete: deleteStoredOpportunity,
    deleteBulk: deleteMultipleStoredOpportunities,
    saveAll: saveStoredOpportunities,
});

export const opportunityService = {
    ...baseOpportunityService,
    getAllOpportunities: baseOpportunityService.getAllSync,
    getOpportunityById: baseOpportunityService.getByIdSync,
    createOpportunity: baseOpportunityService.create,
    updateOpportunity: baseOpportunityService.update,
    deleteOpportunity: baseOpportunityService.delete,
    bulkDeleteOpportunities: baseOpportunityService.deleteBulk,
};
