import type {
    OrganizationFormData,
    ExtendedOrganization,
} from '../types/organization.types';
import {
    getStoredOrganizations,
    saveStoredOrganizations,
    getStoredOrganizationById,
    addStoredOrganization,
    updateStoredOrganization,
    deleteStoredOrganization,
    deleteMultipleStoredOrganizations,
} from '../data/mockOrganizations';
import { createCrudService } from './base.service';

const baseOrganizationService = createCrudService<
    ExtendedOrganization,
    OrganizationFormData | Partial<ExtendedOrganization>,
    Partial<ExtendedOrganization>
>('/api/organizations', {
    getAll: getStoredOrganizations,
    getById: getStoredOrganizationById,
    create: addStoredOrganization,
    update: updateStoredOrganization,
    delete: deleteStoredOrganization,
    deleteBulk: deleteMultipleStoredOrganizations,
    saveAll: saveStoredOrganizations,
});

export const organizationService = {
    ...baseOrganizationService,
    updateStatusBulk: (
        ids: Iterable<string>,
        status: ExtendedOrganization['accountStatus']
    ): ExtendedOrganization[] => {
        const idSet = new Set(ids);
        const nextOrgs = baseOrganizationService.getAllSync().map((org) =>
            idSet.has(org.id) ? { ...org, accountStatus: status } : org
        );
        baseOrganizationService.saveAllSync(nextOrgs);
        return nextOrgs;
    },
};
