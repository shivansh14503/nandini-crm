import type { Contact, ContactFormData } from '../types/contact.types';
import {
    getStoredContacts,
    saveStoredContacts,
    getStoredContactById,
    addStoredContact,
    updateStoredContact,
    deleteStoredContact,
    deleteMultipleStoredContacts,
} from '../data/mockContacts';
import { createCrudService } from './base.service';

export const contactService = createCrudService<Contact, ContactFormData, Partial<ContactFormData>>(
    '/api/contacts',
    {
        getAll: getStoredContacts,
        getById: getStoredContactById,
        create: addStoredContact,
        update: updateStoredContact,
        delete: deleteStoredContact,
        deleteBulk: deleteMultipleStoredContacts,
        saveAll: saveStoredContacts,
    }
);
