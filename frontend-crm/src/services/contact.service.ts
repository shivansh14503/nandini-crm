import type { Contact, ContactFormData } from '../types/contact.types';
import { createCrudService } from './base.service';

export const contactService = createCrudService<Contact, ContactFormData, Partial<ContactFormData>>('/api/contacts');
