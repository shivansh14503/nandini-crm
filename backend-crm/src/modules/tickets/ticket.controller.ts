import { createCrudController } from '../shared/crud.js';
import { ticketService } from './ticket.service.js';

export const ticketController = createCrudController(ticketService, { singular: 'Ticket', plural: 'tickets' });
