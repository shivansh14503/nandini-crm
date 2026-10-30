import type { Ticket, TicketFormData } from '../types/ticket.types';
import { createCrudService } from './base.service';

export const ticketService = createCrudService<Ticket, TicketFormData, Partial<TicketFormData>>('/api/tickets');
