import { createCrudController } from '../shared/crud.js';
import { contactService } from './contact.service.js';

export const contactController = createCrudController(contactService, { singular: 'Contact', plural: 'contacts' });
