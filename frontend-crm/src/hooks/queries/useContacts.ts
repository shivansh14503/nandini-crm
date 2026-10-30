import { contactService } from '@/services/contact.service';
import { createEntityHooks } from './createEntityHooks';
import { queryKeys } from './queryKeys';

const contactHooks = createEntityHooks(queryKeys.contacts, contactService);

export const useContacts = contactHooks.useList;
export const usePaginatedContacts = contactHooks.usePaginatedList;
export const useContact = contactHooks.useDetail;
export const useCreateContact = contactHooks.useCreate;
export const useUpdateContact = contactHooks.useUpdate;
export const useDeleteContact = contactHooks.useDelete;
export const useBulkDeleteContacts = contactHooks.useBulkDelete;
