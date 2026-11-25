import { documentService } from '@/services/document.service';
import { createEntityHooks } from './createEntityHooks';
import { queryKeys } from './queryKeys';

/** Activities › Documents: list and detail only (documents are written from the opportunity form). */
const documentHooks = createEntityHooks(queryKeys.documents, documentService);

export const useDocuments = documentHooks.useList;
export const useDocument = documentHooks.useDetail;
