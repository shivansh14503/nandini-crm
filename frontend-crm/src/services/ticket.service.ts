import type { Ticket, TicketFormData } from '../types/ticket.types';
import {
    getStoredTickets,
    saveStoredTickets,
    getStoredTicketById,
    addStoredTicket,
    updateStoredTicket,
    deleteStoredTicket,
    deleteMultipleStoredTickets,
} from '../data/mockTickets';
import { createCrudService } from './base.service';

export const ticketService = createCrudService<Ticket, TicketFormData, Partial<TicketFormData>>(
    '/api/tickets',
    {
        getAll: getStoredTickets,
        getById: getStoredTicketById,
        create: addStoredTicket,
        update: updateStoredTicket,
        delete: deleteStoredTicket,
        deleteBulk: deleteMultipleStoredTickets,
        saveAll: saveStoredTickets,
    }
);
