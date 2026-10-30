import { ticketService } from '@/services/ticket.service';
import { createEntityHooks } from './createEntityHooks';
import { queryKeys } from './queryKeys';

const ticketHooks = createEntityHooks(queryKeys.tickets, ticketService);

export const useTickets = ticketHooks.useList;
export const usePaginatedTickets = ticketHooks.usePaginatedList;
export const useTicket = ticketHooks.useDetail;
export const useCreateTicket = ticketHooks.useCreate;
export const useUpdateTicket = ticketHooks.useUpdate;
export const useDeleteTicket = ticketHooks.useDelete;
export const useBulkDeleteTickets = ticketHooks.useBulkDelete;
